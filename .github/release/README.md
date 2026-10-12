# GitHub publication metadata

Prepared on 2026-10-12 for `F1ourish/mattermost-plugin-seen`.

The repository is public. The install package and dated audit documents retain their verified 2026-10-11 content; publication metadata is stored here so the audited tar.gz is not silently changed.

After a successful build, browser smoke and security gate on this repository's `main` branch, CI prepares an **unpublished draft pre-release** for 1.1.1. The build job has read-only contents permission. Only the release job can write release assets; it does not run on pull requests or fork repositories. The install artifact must match its audited SHA256. Existing assets are verified rather than overwritten.

The draft contains the install tar.gz, a source ZIP from the exact commit (including these publication files), checksums and release notes. The helper does not click Publish, mark the release stable, change repository visibility, or deploy Mattermost. It is limited to version 1.1.1; future versions require their own reviewed release configuration.

The prepared draft belongs to commit `82bdcdc952767cdb017ab55720a123b8e96f7cd6`. Later commits in `main` can update documentation and pass CI while preserving that draft. If the same version already has a draft at another commit, the helper skips asset changes. To include newer documentation in a distributable package, prepare a new patch version and review its new checksums; the earlier assets remain immutable.

`about.txt` and `topics.json` contain the proposed About description and topics. Apply them through the repository's About editor. The selected GitHub plugin has no repository-description/topic mutation operation.

Before publishing the draft, enable GitHub private vulnerability reporting and verify **Security → Advisories → Report a vulnerability**. Current plugin/docs do not establish that repository setting. Stable/HA support requires the live acceptance evidence documented in the project; leave unexecuted scenarios as NOT RUN.
