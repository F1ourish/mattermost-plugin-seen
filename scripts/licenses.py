#!/usr/bin/env python3
"""Generate notices only for compiled Go modules; host React is not bundled."""
import json
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
text = subprocess.check_output(
    ['go', 'list', '-buildvcs=false', '-deps', '-json', './server'], cwd=root, text=True,
)
decoder = json.JSONDecoder()
modules = {}
index = 0
while index < len(text):
    while index < len(text) and text[index].isspace():
        index += 1
    if index == len(text):
        break
    obj, index = decoder.raw_decode(text, index)
    module = obj.get('Module', {})
    if module and not module.get('Main'):
        modules[module['Path']] = module

# Same filesystem for publication. All files must validate before replacement.
with tempfile.TemporaryDirectory(prefix='.seen-notices-', dir=root) as temporary:
    stage = pathlib.Path(temporary)
    generated = stage / 'third-party'
    generated.mkdir()
    rows = []
    for name, module in sorted(modules.items()):
        folder = pathlib.Path(module['Dir'])
        target = generated / name.replace('/', '_')
        target.mkdir()
        files = sorted(p for p in folder.iterdir() if p.is_file() and
                       p.name.upper().startswith(('LICENSE', 'NOTICE', 'COPYING')))
        if not files:
            raise SystemExit(f'Missing root license for compiled dependency: {name}')
        for source in files:
            (target / source.name).write_bytes(source.read_bytes())
        rows.append({'module': name, 'version': module['Version'],
                     'notices': [str(pathlib.Path('third-party') / target.name / p.name) for p in files]})
    inventory = stage / 'inventory.json'
    inventory.write_text(json.dumps(rows, indent=2) + '\n')
    destination = root / 'third-party'
    backup = stage / 'previous'
    published = False
    if destination.exists():
        destination.rename(backup)
    try:
        generated.rename(destination)
        published = True
        inventory.replace(root / 'docs' / 'dependency-inventory.json')
    except BaseException:
        if published:
            shutil.rmtree(destination)
        if backup.exists():
            backup.rename(destination)
        raise
