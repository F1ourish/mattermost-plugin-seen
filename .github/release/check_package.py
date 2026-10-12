"""Validate the 1.1.2 install archive before handing it to the release job."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import tarfile
from urllib.parse import unquote, urlsplit


VERSION = '1.1.2'
PLUGIN_ID = 'ru.internal.mattermost.seen'
# Verified binaries and web bundle from the immutable 1.1.1 candidate.
RUNTIME_SHA256 = {
    'server/dist/plugin-linux-amd64': 'cb077f1badb8b35d3b1e36707236e0f4eb14a53b9dd0f5c6b66d8665a7418d1d',
    'server/dist/plugin-linux-arm64': 'a9a4c6d00843b1b86310d0974fdc01076a199f35d46454dd8b21c5a3707a786d',
    'webapp/dist/main.js': '1e4f233fb9bb07e38fcda6bd9b5b26a145e48ee129254b2f4a2db960c2da2c9b',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_package(path):
    manifest = json.loads(Path('plugin.json').read_text())
    package = json.loads(Path('webapp/package.json').read_text())
    lock = json.loads(Path('webapp/package-lock.json').read_text())
    if manifest['id'] != PLUGIN_ID or any(value != VERSION for value in [
        manifest['version'], package['version'], lock['version'], lock['packages']['']['version'],
    ]):
        raise RuntimeError('Repository ID/version mismatch.')
    expected_files = [
        Path(name) for name in [
            'plugin.json', 'README.md', 'README.ru.md', 'LICENSE', 'NOTICE',
            'SECURITY.md', 'CHANGELOG.md', 'AI_DISCLOSURE.md', 'CONTRIBUTING.md',
        ]
    ]
    expected_files += sorted(
        item for item in Path('docs').iterdir()
        if item.is_file() and item.suffix in {'.md', '.json', '.csv'}
    )
    expected_files += sorted(item for item in Path('third-party').rglob('*') if item.is_file())
    actual_runtime = {}
    link_count = 0
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)):
            raise RuntimeError('Duplicate package members.')
        if sum(member.size for member in members) > 128 * 1024 * 1024:
            raise RuntimeError('Unexpected package size.')
        for member in members:
            parts = PurePosixPath(member.name)
            if (parts.is_absolute() or '..' in parts.parts or '\\' in member.name
                    or not parts.parts or parts.parts[0] != PLUGIN_ID
                    or any(part in {'.git', 'node_modules', '.env'} for part in parts.parts)
                    or not (member.isfile() or member.isdir())):
                raise RuntimeError('Unsafe package member: ' + member.name)
        regular = {member.name: member for member in members if member.isfile()}

        def read(relative):
            name = PLUGIN_ID + '/' + relative
            if name not in regular:
                raise RuntimeError('Missing packaged file: ' + relative)
            with archive.extractfile(regular[name]) as stream:
                return stream.read()

        if read('plugin.json') != Path('plugin.json').read_bytes():
            raise RuntimeError('Packaged manifest differs from source.')
        for item in expected_files:
            if read(item.as_posix()) != item.read_bytes():
                raise RuntimeError('Packaged document/license differs: ' + str(item))
        for relative, expected in RUNTIME_SHA256.items():
            actual = hashlib.sha256(read(relative)).hexdigest()
            if actual != expected:
                raise RuntimeError('Runtime differs from verified 1.1.1: ' + relative)
            actual_runtime[relative] = actual
            if relative.startswith('server/') and regular[PLUGIN_ID + '/' + relative].mode & 0o777 != 0o755:
                raise RuntimeError('Plugin binary must have executable mode 0755.')
        for item in expected_files:
            if item.suffix != '.md' or item.parts[0] == 'third-party':
                continue
            content = read(item.as_posix()).decode('utf-8')
            if item.name in {'README.md', 'README.ru.md'} and item.parent == Path('.'):
                if '\u2013' in content or '\u2014' in content:
                    raise RuntimeError('README must use ordinary hyphens.')
            for destination in re.findall(r'\[[^\]\n]*\]\(([^)\s]+)\)', content):
                url = urlsplit(destination.strip('<>'))
                if url.scheme or url.netloc or not url.path:
                    continue
                resolved = posixpath.normpath(posixpath.join(
                    PLUGIN_ID, item.parent.as_posix(), unquote(url.path),
                ))
                if resolved not in regular:
                    raise RuntimeError('Missing packaged Markdown target: ' + str(item) + ' -> ' + destination)
                link_count += 1
    return {
        'schema_version': 1,
        'result': 'PASS',
        'plugin_id': PLUGIN_ID,
        'version': VERSION,
        'source_commit': os.environ.get('GITHUB_SHA', ''),
        'workflow_run_id': os.environ.get('GITHUB_RUN_ID', ''),
        'archive': path.name,
        'archive_sha256': digest(path),
        'runtime_identical_to': '1.1.1',
        'runtime_files_sha256': actual_runtime,
        'relative_links_checked': link_count,
        'documents_and_licenses_checked': len(expected_files),
        'live_mattermost_acceptance': 'NOT RUN',
        'ha_acceptance': 'NOT RUN',
    }


def main():
    path = Path('dist') / (PLUGIN_ID + '-' + VERSION + '.tar.gz')
    report = validate_package(path)
    output = Path('dist') / ('release-validation-' + VERSION + '.json')
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps(report, indent=2, sort_keys=True))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('sha256=' + report['archive_sha256'] + '\n')


if __name__ == '__main__':
    main()
