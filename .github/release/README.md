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

## 1.1.3 scope-note patch

Package validation is pinned to the unchanged 1.1.2 server hashes and the new scope-note-only web bundle. The existing 1.1.2 helpers remain unchanged. On 2026-10-15 the owner explicitly requested publication of the prepared 1.1.3 release to this repository.

The workflow now invokes `publish_1_1_3.py` only after all build/security/browser/package checks pass on main. This separate, version-specific helper additionally pins the complete installer SHA256 (`54b2ad23691a107fabcf6c7fdbd53f545d82d0a6efc2067a3da1bd81437669ba`), verifies the same-run artifact and exact-commit report, creates the source ZIP and checksums, verifies stored draft bytes, publishes a public pre-release and checks anonymous downloads of all four files. The installer metadata matches the already prepared archive. Live/HA acceptance remains NOT RUN; this release does not change the current stable release designation. Existing assets/releases are never replaced. This authorization does not extend to future versions or mobile functionality.

## 1.1.4 inline-placement candidate

Package validation now targets candidate 1.1.4, retains the unchanged server binary hashes and pins the web bundle containing the edit-placement fix. The workflow can produce the `seen-candidate` artifact after all checks pass. Publication helpers remain version-pinned to 1.1.2/1.1.3 and return without publishing 1.1.4; this candidate does not authorize a release or asset replacement.
