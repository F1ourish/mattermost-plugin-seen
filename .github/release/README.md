# GitHub release preparation

Updated 2026-10-12 for `F1ourish/mattermost-plugin-seen`, candidate 1.1.2.

The public repository uses a read-only build job for frontend, Go race/vet, browser smoke, dependency/binary scans and archive checks. Its package step emits the install archive SHA256 as a job output. The release job has contents-write permission only on this repository's main push/workflow_dispatch events, depends on the successful build and uses an exact-commit checkout.

`check_package.py` verifies the manifest/package/lock versions, safe archive members, executable permissions, packaged documentation/licenses, relative Markdown links and the verified 1.1.1 runtime hashes. It writes `release-validation-1.1.2.json`. Its runtime hash guard is specific to this documentation patch; a future runtime change needs a reviewed version/configuration.

`prepare.py` downloads the artifact from the same workflow run, compares the archive with the trusted build-job SHA256 and independently repeats package/report checks. It prepares an **unpublished draft pre-release** containing install tar.gz, exact-commit source ZIP, package report and checksums. The default preparation does not publish or deploy the plugin. Existing assets are verified rather than overwritten; a draft at another commit is preserved. New distributable contents require a new version.

The earlier 1.1.1 draft remains tied to commit `82bdcdc952767cdb017ab55720a123b8e96f7cd6` and its original assets. It is not replaced by 1.1.2.

`about.txt` and `topics.json` retain repository metadata suggestions already applied by the owner.

Before publishing a draft, enable and verify private vulnerability reporting per SECURITY.md. Stable/HA claims require the live acceptance evidence in the project docs; leave unexecuted scenarios NOT RUN.

## Owner-approved 1.1.2 publication

On 2026-10-12 the owner requested the install archive in public Releases. `publish_1_1_2.py` publishes only the already verified release ID/target and four pinned asset digests, after checking its original successful CI run and actual stored bytes. The release stays pre-release; no asset is rebuilt, replaced or uploaded. An anonymous download and SHA256 check verify the public install link. This approval applies only to 1.1.2 and does not authorize automatic publication of future versions.
