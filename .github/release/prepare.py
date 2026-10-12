"""Attach the checked CI artifact to an unpublished 1.1.1 pre-release.

Runs only after the read-only build/security/browser job succeeds on main.
The installation package must reproduce the audited 2026-10-11 SHA256.
Never publishes a release, overwrites an asset, or executes a plugin binary.
"""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile


VERSION = '1.1.1'
TAG = 'v' + VERSION
PLUGIN_ID = 'ru.internal.mattermost.seen'
EXPECTED_TAR_SHA256 = '2ffd56064bf65d9969e6aa6d96533f5deb274e78e73a5e2336cf4aa46233e9ea'


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_package(path):
    if digest(path) != EXPECTED_TAR_SHA256:
        raise RuntimeError('Install package differs from the audited 1.1.1 SHA256; do not replace it silently.')
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)):
            raise RuntimeError('Duplicate package members.')
        for member in members:
            parts = PurePosixPath(member.name)
            if parts.is_absolute() or '..' in parts.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError('Unsafe package member.')
        manifest = json.load(archive.extractfile(PLUGIN_ID + '/plugin.json'))
        if manifest['id'] != PLUGIN_ID or manifest['version'] != VERSION:
            raise RuntimeError('Unexpected package ID/version.')


def main():
    manifest = json.loads(Path('plugin.json').read_text())
    if manifest['id'] != PLUGIN_ID:
        raise RuntimeError('Unexpected repository plugin ID.')
    if manifest['version'] != VERSION:
        print('This draft helper applies only to 1.1.1; no release was changed.')
        return
    repository = os.environ['GITHUB_REPOSITORY']
    sha = os.environ['RELEASE_SHA']
    run_id = os.environ['GITHUB_RUN_ID']
    if repository != 'F1ourish/mattermost-plugin-seen' or not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdigit():
        raise RuntimeError('Unexpected workflow context.')
    if run('git', 'rev-parse', 'HEAD').strip() != sha:
        raise RuntimeError('Checkout does not match the successful workflow commit.')

    inspection = subprocess.run(
        ['gh', 'release', 'view', TAG, '--repo', repository, '--json', 'isDraft,targetCommitish,url,assets'],
        text=True, capture_output=True,
    )
    existing = None
    if inspection.returncode == 0:
        existing = json.loads(inspection.stdout)
        if not existing['isDraft']:
            print('An immutable published release already exists: ' + existing['url'])
            return
        if existing['targetCommitish'] != sha:
            raise RuntimeError('A draft for this version belongs to another commit; preserve it and use a new release version.')
    elif 'not found' not in inspection.stderr.lower() and '404' not in inspection.stderr:
        raise RuntimeError('Cannot inspect existing release; ' + inspection.stderr.strip())

    assets = Path('release-assets')
    assets.mkdir(exist_ok=True)
    run('gh', 'run', 'download', run_id, '--repo', repository, '--name', 'seen-candidate', '--dir', str(assets))
    package = assets / (PLUGIN_ID + '-' + VERSION + '.tar.gz')
    validate_package(package)

    source = assets / ('mattermost-seen-source-' + VERSION + '-github.zip')
    run('git', 'archive', '--format=zip', '--prefix=mattermost-seen/', '--output=' + str(source), sha)
    checksums = assets / ('SHA256SUMS-' + VERSION + '-github.txt')
    checksums.write_text(''.join(digest(p) + '  ' + p.name + '\n' for p in [package, source]))
    files = [package, source, checksums]
    if existing is None:
        url = run(
            'gh', 'release', 'create', TAG, '--repo', repository, '--target', sha,
            '--title', 'Seen 1.1.1 — security patch (pre-release)', '--draft', '--prerelease',
            '--latest=false', '--notes-file', '.github/release/1.1.1.md', *map(str, files),
        ).strip()
        print('Prepared unpublished draft: ' + url)
    else:
        uploaded = {item['name'] for item in existing['assets']}
        with tempfile.TemporaryDirectory(prefix='seen-existing-assets-') as temporary:
            for file in files:
                if file.name in uploaded:
                    run('gh', 'release', 'download', TAG, '--repo', repository, '--pattern', file.name, '--dir', temporary)
                    if digest(Path(temporary) / file.name) != digest(file):
                        raise RuntimeError('Existing asset differs; no overwrite allowed: ' + file.name)
                else:
                    run('gh', 'release', 'upload', TAG, str(file), '--repo', repository)
        print('Verified existing unpublished draft: ' + existing['url'])


if __name__ == '__main__':
    main()
