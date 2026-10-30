"""Publish the exact 1.1.4 inline-placement and dependency-fix package requested by the owner on 2026-10-30.

Only this repository/version/archive is authorized. Build/security/package checks
must succeed first. Verify stored draft assets before publication and anonymous
downloads afterward. Never delete or replace an existing asset or release.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

from check_package import validate_package


REPOSITORY = 'F1ourish/mattermost-plugin-seen'
VERSION = '1.1.4'
TAG = 'v' + VERSION
PLUGIN_ID = 'ru.internal.mattermost.seen'
ARCHIVE = PLUGIN_ID + '-' + VERSION + '.tar.gz'
APPROVED_SHA256 = '2e752a48bd9f3e49a5a3cd2f6de1a09db2de218bc9bc8627d923ab9df9100659'


def run(*args, input_text=None):
    result = subprocess.run(args, input=input_text, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('GitHub operation failed: ' + result.stderr.strip())
    return result.stdout


def api(path, payload=None):
    args = ['gh', 'api', 'repos/' + REPOSITORY + '/' + path]
    if payload is not None:
        args += ['--method', 'PATCH', '--input', '-']
    return json.loads(run(*args, input_text=json.dumps(payload) if payload is not None else None))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_release():
    # The tag endpoint only promises published releases. List authenticated
    # releases so a resumed run also finds an unpublished draft without a tag.
    pages = json.loads(run('gh', 'api', '--paginate', '--slurp',
                           'repos/' + REPOSITORY + '/releases?per_page=100'))
    matches = [release for page in pages for release in page if release['tag_name'] == TAG]
    if len(matches) > 1:
        raise RuntimeError('Multiple releases use the requested tag.')
    return matches[0] if matches else None


def check_tag(sha, required=False):
    result = subprocess.run(
        ['gh', 'api', 'repos/' + REPOSITORY + '/git/ref/tags/' + TAG],
        text=True, capture_output=True,
    )
    if result.returncode:
        if not required and '404' in result.stderr:
            return
        raise RuntimeError('Cannot verify release tag: ' + result.stderr.strip())
    obj = json.loads(result.stdout)['object']
    if obj['type'] == 'tag':
        obj = api('git/tags/' + obj['sha'])['object']
    if obj['type'] != 'commit' or obj['sha'] != sha:
        raise RuntimeError('Existing tag points at a different commit.')


def verify_public_download(asset, expected):
    url = 'https://github.com/' + REPOSITORY + '/releases/download/' + TAG + '/' + asset['name']
    if asset['browser_download_url'] != url:
        raise RuntimeError('Unexpected public asset URL.')
    request = urllib.request.Request(url, headers={'User-Agent': 'Seen-release-verification'})
    checksum = hashlib.sha256()
    # Deliberately send no GitHub token in this anonymous download.
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError('Anonymous asset download failed.')
        for chunk in iter(lambda: response.read(1024 * 1024), b''):
            checksum.update(chunk)
    if checksum.hexdigest() != expected:
        raise RuntimeError('Anonymous asset SHA256 mismatch: ' + asset['name'])
    print('Anonymous download: PASS ' + url)


def check_assets(release, expected):
    assets = {item['name']: item for item in release['assets']}
    if len(assets) != len(release['assets']) or set(assets) != set(expected):
        raise RuntimeError('Unexpected release assets.')
    for name, checksum in expected.items():
        if assets[name]['state'] != 'uploaded' or assets[name]['digest'] != 'sha256:' + checksum:
            raise RuntimeError('Unexpected stored asset state/digest: ' + name)
    return assets


def verify_private_reporting():
    # This public status endpoint needs no credentials. Do not grant the
    # release token repository-administration access to change this setting.
    request = urllib.request.Request(
        'https://api.github.com/repos/' + REPOSITORY + '/private-vulnerability-reporting',
        headers={'User-Agent': 'Seen-release-verification',
                 'Accept': 'application/vnd.github+json'},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        status = json.load(response)
    if status.get('enabled') is not True:
        raise RuntimeError(
            'Draft assets are verified, but SECURITY.md requires private vulnerability '
            'reporting to be enabled before publication. Enable it in repository '
            'Settings > Security, then rerun this release job. No public release was changed.'
        )
    print('Private vulnerability reporting: enabled')


def main():
    manifest = json.loads(Path('plugin.json').read_text())
    if manifest['id'] != PLUGIN_ID:
        raise RuntimeError('Unexpected plugin ID.')
    if manifest['version'] != VERSION:
        print('This publication authorization applies only to 1.1.4; no release was changed.')
        return
    sha = os.environ.get('RELEASE_SHA', '')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if (os.environ.get('GITHUB_REPOSITORY') != REPOSITORY
            or os.environ.get('GITHUB_REF') != 'refs/heads/main'
            or os.environ.get('GITHUB_EVENT_NAME') not in {'push', 'workflow_dispatch'}
            or os.environ.get('GITHUB_WORKFLOW') != 'seen-ci'
            or os.environ.get('EXPECTED_TAR_SHA256') != APPROVED_SHA256
            or not re.fullmatch(r'[0-9a-f]{40}', sha) or not run_id.isdigit()
            or run('git', 'rev-parse', 'HEAD').strip() != sha):
        raise RuntimeError('Unexpected publication context or unapproved archive.')

    existing = find_release()
    if existing is not None:
        if existing['tag_name'] != TAG:
            raise RuntimeError('Unexpected release tag.')
        if not existing['draft']:
            asset = next(item for item in existing['assets'] if item['name'] == ARCHIVE)
            if asset['digest'] != 'sha256:' + APPROVED_SHA256:
                raise RuntimeError('Published archive is not the approved package.')
            check_tag(existing['target_commitish'], required=True)
            verify_public_download(asset, APPROVED_SHA256)
            print('Preserved existing published release: ' + existing['html_url'])
            return
        if existing['target_commitish'] != sha or not existing['prerelease']:
            raise RuntimeError('Preserving draft with different target/status; no changes allowed.')
    check_tag(sha)

    with tempfile.TemporaryDirectory(prefix='seen-release-1.1.4-') as temporary:
        assets_dir = Path(temporary)
        run('gh', 'run', 'download', run_id, '--repo', REPOSITORY,
            '--name', 'seen-candidate', '--dir', str(assets_dir))
        package = assets_dir / ARCHIVE
        if digest(package) != APPROVED_SHA256:
            raise RuntimeError('CI archive differs from the prepared owner-requested package.')
        report_file = assets_dir / ('release-validation-' + VERSION + '.json')
        report = validate_package(package)
        if report['source_commit'] != sha or json.loads(report_file.read_text()) != report:
            raise RuntimeError('CI validation report differs from independent package checks.')
        source = assets_dir / ('mattermost-seen-source-' + VERSION + '-github.zip')
        run('git', 'archive', '--format=zip', '--prefix=mattermost-seen/',
            '--output=' + str(source), sha)
        checksums = assets_dir / ('SHA256SUMS-' + VERSION + '-github.txt')
        checksums.write_text(''.join(digest(p) + '  ' + p.name + '\n'
                                     for p in [package, source, report_file]))
        files = [package, source, report_file, checksums]
        expected = {path.name: digest(path) for path in files}
        if existing is None:
            run('gh', 'release', 'create', TAG, '--repo', REPOSITORY, '--target', sha,
                '--title', 'Seen 1.1.4 - receipt placement and security fixes', '--draft', '--prerelease',
                '--latest=false', '--notes-file', '.github/release/1.1.4.md', *map(str, files))
        else:
            uploaded = {item['name'] for item in existing['assets']}
            if not uploaded.issubset(expected):
                raise RuntimeError('Existing draft has unexpected assets.')
            for path in files:
                if path.name not in uploaded:
                    run('gh', 'release', 'upload', TAG, str(path), '--repo', REPOSITORY)
        release = find_release()
        if release is None:
            raise RuntimeError('Prepared draft was not found.')
        if not release['draft'] or release['target_commitish'] != sha or not release['prerelease']:
            raise RuntimeError('Draft identity/target/status changed unexpectedly.')
        check_assets(release, expected)
        # Inspect the actual bytes stored in GitHub before making the draft public.
        stored = assets_dir / 'stored'
        run('gh', 'release', 'download', TAG, '--repo', REPOSITORY, '--dir', str(stored))
        for name, checksum in expected.items():
            if digest(stored / name) != checksum:
                raise RuntimeError('Stored asset differs: ' + name)
        verify_private_reporting()
        release = api('releases/' + str(release['id']), {
            'draft': False, 'prerelease': True, 'make_latest': 'false',
        })
        if release['draft'] or not release['published_at']:
            raise RuntimeError('Release is still unpublished.')
        assets = check_assets(release, expected)
        check_tag(sha, required=True)
        for name, checksum in expected.items():
            verify_public_download(assets[name], checksum)
        print('Published verified pre-release: ' + release['html_url'])
        print('Install SHA256: ' + APPROVED_SHA256)


if __name__ == '__main__':
    main()
