"""Attach checked CI artifacts to an unpublished 1.1.2 pre-release.

Runs only after the read-only build/security/browser/package job succeeds on main.
The downloaded archive must match that job's SHA256 and package checks.
Never publishes a release, overwrites an asset, or executes a plugin binary.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from check_package import validate_package


VERSION = '1.1.2'
TAG = 'v' + VERSION
PLUGIN_ID = 'ru.internal.mattermost.seen'


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    manifest = json.loads(Path('plugin.json').read_text())
    if manifest['id'] != PLUGIN_ID:
        raise RuntimeError('Unexpected repository plugin ID.')
    if manifest['version'] != VERSION:
        print('This draft helper applies only to 1.1.2; no release was changed.')
        return
    repository = os.environ['GITHUB_REPOSITORY']
    sha = os.environ['RELEASE_SHA']
    run_id = os.environ['GITHUB_RUN_ID']
    expected_hash = os.environ['EXPECTED_TAR_SHA256']
    if (repository != 'F1ourish/mattermost-plugin-seen'
            or not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdigit()
            or not re.fullmatch(r'[0-9a-f]{64}', expected_hash)):
        raise RuntimeError('Unexpected workflow context or package SHA256.')
    if run('git', 'rev-parse', 'HEAD').strip() != sha:
        raise RuntimeError('Checkout does not match the successful workflow commit.')

    inspection = subprocess.run(
        ['gh', 'release', 'view', TAG, '--repo', repository, '--json', 'isDraft,isPrerelease,targetCommitish,url,assets'],
        text=True, capture_output=True,
    )
    existing = None
    if inspection.returncode == 0:
        existing = json.loads(inspection.stdout)
        if not existing['isDraft']:
            print('An immutable published release already exists: ' + existing['url'])
            return
        if existing['targetCommitish'] != sha:
            print('Preserving the prepared draft at ' + existing['targetCommitish'] + ': ' + existing['url'])
            print('Later main changes do not replace its assets. Prepare a new version for a new package.')
            return
        if not existing['isPrerelease']:
            raise RuntimeError('Existing draft must be marked pre-release.')
    elif 'not found' not in inspection.stderr.lower() and '404' not in inspection.stderr:
        raise RuntimeError('Cannot inspect existing release; ' + inspection.stderr.strip())

    assets = Path('release-assets')
    assets.mkdir(exist_ok=True)
    run('gh', 'run', 'download', run_id, '--repo', repository, '--name', 'seen-candidate', '--dir', str(assets))
    package = assets / (PLUGIN_ID + '-' + VERSION + '.tar.gz')
    if digest(package) != expected_hash:
        raise RuntimeError('Install archive differs from the successful read-only CI job.')
    report_file = assets / ('release-validation-' + VERSION + '.json')
    expected_report = validate_package(package)
    if expected_report['source_commit'] != sha or json.loads(report_file.read_text()) != expected_report:
        raise RuntimeError('Downloaded package-validation report differs from independent package checks.')

    source = assets / ('mattermost-seen-source-' + VERSION + '-github.zip')
    run('git', 'archive', '--format=zip', '--prefix=mattermost-seen/', '--output=' + str(source), sha)
    checksums = assets / ('SHA256SUMS-' + VERSION + '-github.txt')
    checksums.write_text(''.join(digest(p) + '  ' + p.name + '\n' for p in [package, source, report_file]))
    files = [package, source, report_file, checksums]
    if existing is None:
        url = run(
            'gh', 'release', 'create', TAG, '--repo', repository, '--target', sha,
            '--title', 'Seen 1.1.2 - documentation and packaging (pre-release)', '--draft', '--prerelease',
            '--latest=false', '--notes-file', '.github/release/1.1.2.md', *map(str, files),
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
    print(checksums.read_text(), end='')


if __name__ == '__main__':
    main()
