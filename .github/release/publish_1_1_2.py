"""Publish only the verified 1.1.2 draft requested by the repository owner.

Approval: the owner requested a publicly downloadable install archive on 2026-10-12.
The original target, CI run and asset digests are pinned. No rebuild, asset upload,
deletion, replacement or stable/HA claim is performed.
"""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request


REPOSITORY = 'F1ourish/mattermost-plugin-seen'
TAG = 'v1.1.2'
RELEASE_ID = 410381497
TARGET = '2e4b2cd2060f19af7909cf56fee777d6a2bf77a1'
CI_RUN = 38224802047
EXPECTED_ASSETS = {
    'ru.internal.mattermost.seen-1.1.2.tar.gz': '92fde1bd21fef7dd92540a394dbf4ba783cf1086a3c5da888b78ae3e917b3a7f',
    'mattermost-seen-source-1.1.2-github.zip': 'cdbc60e933e5e11c44023066e68eb1ea4d6645195c233fd5e702a0d8d6170838',
    'release-validation-1.1.2.json': '53f009b26567c6f9b9a6f3bf8c8a8554ec9737b8f5043c7d5959956d0147eef7',
    'SHA256SUMS-1.1.2-github.txt': 'ea978bb07ff9755109c935b948b823f8076afdec4f59098a73ee7c08159d4e0c',
}


def command(*args, input_text=None):
    completed = subprocess.run(args, input=input_text, text=True, capture_output=True)
    if completed.returncode:
        raise RuntimeError('GitHub operation failed: ' + completed.stderr.strip())
    return completed.stdout


def api(path, payload=None):
    args = ['gh', 'api', 'repos/' + REPOSITORY + '/' + path]
    if payload is not None:
        args += ['--method', 'PATCH', '--input', '-']
    return json.loads(command(*args, input_text=json.dumps(payload) if payload is not None else None))


def check_release(release):
    if (release['id'] != RELEASE_ID or release['tag_name'] != TAG
            or release['target_commitish'] != TARGET or not release['prerelease']):
        raise RuntimeError('Unexpected release identity, target or status.')
    assets = {item['name']: item for item in release['assets']}
    if len(assets) != len(release['assets']) or set(assets) != set(EXPECTED_ASSETS):
        raise RuntimeError('Unexpected release assets.')
    for name, expected in EXPECTED_ASSETS.items():
        if assets[name]['state'] != 'uploaded' or assets[name]['digest'] != 'sha256:' + expected:
            raise RuntimeError('Unexpected asset state/digest: ' + name)
    return assets


def main():
    if (os.environ.get('GITHUB_REPOSITORY') != REPOSITORY
            or os.environ.get('GITHUB_REF') != 'refs/heads/main'
            or os.environ.get('GITHUB_EVENT_NAME') not in {'push', 'workflow_dispatch'}
            or os.environ.get('GITHUB_WORKFLOW') != 'seen-ci'
            or os.environ.get('EXPECTED_TAR_SHA256') != EXPECTED_ASSETS['ru.internal.mattermost.seen-1.1.2.tar.gz']):
        raise RuntimeError('Unexpected publication context or build archive.')
    run = api('actions/runs/' + str(CI_RUN))
    if (run['status'] != 'completed' or run['conclusion'] != 'success'
            or run['head_sha'] != TARGET or run['head_branch'] != 'main'
            or run['event'] != 'push' or run['path'] != '.github/workflows/ci.yml'):
        raise RuntimeError('Original release commit does not have the expected successful CI run.')
    release = api('releases/' + str(RELEASE_ID))
    check_release(release)

    # Stop if an independently created tag would point at a different commit.
    tag_path = 'repos/' + REPOSITORY + '/git/ref/tags/' + TAG
    tag_result = subprocess.run(['gh', 'api', tag_path], text=True, capture_output=True)
    if tag_result.returncode == 0:
        obj = json.loads(tag_result.stdout)['object']
        if obj['type'] == 'tag':
            obj = api('git/tags/' + obj['sha'])['object']
        if obj['type'] != 'commit' or obj['sha'] != TARGET:
            raise RuntimeError('Existing tag does not point to the verified commit.')
    elif '404' not in tag_result.stderr:
        raise RuntimeError('Cannot verify the release tag: ' + tag_result.stderr.strip())

    # Check the actual stored bytes before changing public visibility.
    with tempfile.TemporaryDirectory(prefix='seen-publish-verified-') as temporary:
        command('gh', 'release', 'download', TAG, '--repo', REPOSITORY, '--dir', temporary, '--pattern', '*')
        for name, expected in EXPECTED_ASSETS.items():
            actual = hashlib.sha256((Path(temporary) / name).read_bytes()).hexdigest()
            if actual != expected:
                raise RuntimeError('Stored release asset differs: ' + name)

    if release['draft']:
        release = api('releases/' + str(RELEASE_ID), {
            'draft': False, 'prerelease': True, 'make_latest': 'false',
        })
    assets = check_release(release)
    if release['draft'] or not release['published_at']:
        raise RuntimeError('Release is still not published.')
    obj = api('git/ref/tags/' + TAG)['object']
    if obj['type'] == 'tag':
        obj = api('git/tags/' + obj['sha'])['object']
    if obj['type'] != 'commit' or obj['sha'] != TARGET:
        raise RuntimeError('Published tag does not point to the verified commit.')

    # No GitHub token is sent in these requests: verify anonymous install download.
    name = 'ru.internal.mattermost.seen-1.1.2.tar.gz'
    url = assets[name]['browser_download_url']
    if url != 'https://github.com/' + REPOSITORY + '/releases/download/' + TAG + '/' + name:
        raise RuntimeError('Unexpected public download URL.')
    request = urllib.request.Request(url, headers={'User-Agent': 'Seen-release-verification'})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError('Anonymous install download failed.')
        for chunk in iter(lambda: response.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != EXPECTED_ASSETS[name]:
        raise RuntimeError('Anonymous install download SHA256 mismatch.')
    print('Published verified pre-release: ' + release['html_url'])
    print('Anonymous install download: PASS ' + url)
    print('Install SHA256: ' + digest.hexdigest())


if __name__ == '__main__':
    main()
