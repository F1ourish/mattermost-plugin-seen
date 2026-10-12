# Seen for Mattermost

English · [Русский](README.ru.md)

[![CI](https://github.com/F1ourish/mattermost-plugin-seen/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/F1ourish/mattermost-plugin-seen/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Author-only viewing receipts for Mattermost Web and Desktop.

**“Viewed” means the message's observation marker entered the viewport under the conditions below. It does not mean a person read, understood, or even looked at the message.** An authenticated client can also submit a receipt for a message it is permitted to access. This is not proof of delivery or a human-read attestation.

Plugin ID: `ru.internal.mattermost.seen`. The ID is retained for installation and data compatibility.

## Release status

Version 1.1.1 is a security patch for the Go toolchain and affected dependencies. It retains the five-viewer preview and full-list dialog introduced in 1.1.0. This package is a release candidate for test-environment acceptance; stable production approval still requires live Mattermost gateway and functional checks. Two-node validation is additionally required before claiming HA support. Do not interpret the version number as a security certification or an HA guarantee.

The public repository and a draft pre-release were prepared on 2026-10-12. The draft is tied to verified commit `82bdcdc952767cdb017ab55720a123b8e96f7cd6`; later documentation changes in `main` do not replace its assets. Packages become publicly downloadable from [Releases](https://github.com/F1ourish/mattermost-plugin-seen/releases) after publication. See the [repository review](docs/repository-review-2026-10-12.md) for current repository settings and remaining checks.

Target server: Mattermost 11.10.x; manifest minimum: 11.10.0. Server executables are supplied for Linux amd64 and arm64. Other server versions require validation. Mobile receipt collection and Connected Workspaces receipt synchronization are not supported.

## Project documentation

See [documentation index](docs/README.md), [release readiness](docs/release-readiness.md), [operations](docs/operations.md), [API](docs/api.md), and [contributing](CONTRIBUTING.md). See [1.1.1 release notes](docs/release-1.1.1.md) for the security update and installation checks, and [1.1.0 release notes](docs/release-1.1.0.md) for the existing UI. The [2026-10-01 review](docs/release-readiness-1.0.3.md) remains a historical baseline; its scans are not the current dependency status.

## Features

- Receipts and viewer lists are available only to the message author, subject to current channel membership and read permission.
- One retained receipt per user and message; repeat submissions preserve the first stored timestamp.
- Profile names use the Mattermost Redux store and native profile API, with the configured teammate name format and safe fallback.
- The hover preview shows up to five viewers and a Show all action when more exist. The 460 px full-list dialog keeps its header fixed while its list scrolls. Compact viewer rows show a name and first-recorded time (today: Today, HH:mm; yesterday: Yesterday, HH:mm; earlier: dd.mm, HH:mm, with year when different); large lists load additional pages while scrolling.
- Russian and English labels, keyboard interaction, theme variables, and background list refresh.
- The indicator is placed near the end of ordinary message paragraphs, with an attachment fallback for unsupported layouts.

## Observation and time semantics

A receipt is queued after at least 50% of the attachment's observation marker remains visible for 800 continuous milliseconds while the tab is visible and the window is focused. The observed element is not the entire message text.

`seen_at` is the server timestamp stored by the first successful receipt write. It is not a last-view time. Offline delivery can produce a timestamp later than the original viewport observation. Pending client data lives in memory and can be lost on reload, account change, or expiry; delivery is best-effort.

## Privacy and authorization

Receipt storage contains message-linked user IDs, timestamps, and an expiry timestamp. It contains no message text, names, email addresses, or credentials. User IDs and viewing times are personal activity data, not anonymous analytics.

Viewer lists are author-only for ordinary API clients. Server administrators, database operators and trusted server-side plugins are outside that authorization boundary. Profile access uses the current user's native Mattermost permissions. No direct reads of system user tables are implemented.

The server authenticates plugin requests using the identity supplied by the Mattermost gateway. The plugin must not be exposed as an independent public HTTP service. See [SECURITY.md](SECURITY.md).

## Plugin settings in System Console

Open System Console → Plugins and the Seen settings page (the exact menu grouping depends on the Mattermost build). Settings are declared in the plugin manifest; use System Console rather than editing receipt storage.

- **Retention days (`RetentionDays`)**: integer 1–365, default 90, measured from message creation.
- **Public channels (`EnablePublic`)**: default enabled; membership/read permissions remain required.

Save and reopen the page to confirm persistence, then verify behavior using test accounts. Configuration reload is handled by the plugin. A read-only server configuration may prevent saving; use your deployment's configuration process in that case. Invalid retention values must not become the active plugin configuration.

## Retention and limits

- `RetentionDays`: default 90, accepted range 1–365, calculated from message creation.
- `EnablePublic`: controls collection in public channels; membership is still required.
- Maximum 5,000 stored viewers per message; a saturated list may be incomplete.
- Client delivery queue: up to 500 pending/deferred IDs for up to 10 minutes; caches have separate bounds.
- Receipt data is persisted in Mattermost Plugin KV with compare-and-set writes. There is no system database schema migration.

Logical expiry and physical removal are different. Host KV cleanup and backup policies determine physical data retention. Reducing the setting hides older receipts immediately but does not instantly rewrite every existing physical expiry. Increasing it cannot recover history already removed.

Message deletion replaces the receipt document with a durable tombstone containing no viewer IDs or viewing timestamps. Concurrent writers cannot recreate viewers after the tombstone is committed. Tombstones expire after the maximum supported receipt horizon plus a clock margin (at least one day from deletion). This minimal message-linked marker outlives the configured receipt retention to prevent resurrection after retention changes. Storage errors can still prevent the hook from committing: deletion is not an unconditional erasure guarantee during outages. User/channel deletion has no dedicated receipt erasure workflow; host cleanup and backup retention remain separate.

**Upgrade all nodes together:** disable the plugin cluster-wide before upgrading from 1.0.0, update every app node, then enable it. Old writers do not understand tombstones. Rolling mixed-version operation and rollback to 1.0.0 while accepting writes invalidate this guarantee. See [docs/release-1.0.2.md](docs/release-1.0.2.md).

## Installation and upgrade

1. Back up the previous plugin package and settings; follow your deployment's data backup policy.
2. Verify the supplied SHA256 checksum and server architecture.
3. Upload `ru.internal.mattermost.seen-1.1.1.tar.gz` through System Console plugin management as an update of the same plugin ID.
4. Confirm the displayed version, enabled state and settings. Reload clients.
5. Validate with at least two test users before enabling wider use. Test denied access, duplicate views, offline/reconnect, both themes and the layouts you use.

No system database migration is required. Existing receipt documents remain readable; tombstones add an optional field in Plugin KV. An older plugin may ignore that field. For rollback keep the plugin disabled until a compatible fixed package is available; do not delete Plugin KV as a routine rollback step.

## Build and checks

Build prerequisites: Linux, Go 1.26.9, Node.js 24.19.0, npm 11.9.0, Python 3, GNU tar/gzip, make and a C compiler for race tests. Go and npm dependencies are pinned. The release script pins GOTOOLCHAIN=go1.26.9; an offline environment needs that compiler and the dependency cache prepared in advance.

```sh
make dist
make security-check
webapp/node_modules/.bin/playwright install --with-deps chromium
node scripts/browser-smoke.mjs
```

`make security-check` requires the built archive and verifies module integrity, source dependencies, npm dependencies, and both packaged Linux binaries. Symbols are retained for precise artifact scanning; debug information and local source paths are omitted. Browser tests use a mock host; they are not live Mattermost integration tests. Semantic lint includes TypeScript and React hook rules, enforced by the build. Dependency scans do not prove the absence of all vulnerabilities.

## HA and operational limitations

Accepted receipts are stored in shared Plugin KV, not plugin-process memory. Local semaphores limit only one process. Actual cross-node consistency depends on Mattermost and database configuration; replica lag can delay reads and exhaust a short CAS retry cycle. Real app1/app2 failover and cluster WebSocket delivery must be validated before claiming HA support.

Unchanged lists refresh with one page request using a content version; changed large lists still need page-by-page refresh (up to 100 requests). Per-user fairness allows 2 requests/second with a burst of 120, per plugin process, alongside 16 concurrent requests globally per process. This is not a cluster-wide quota; tune ingress protection and test the intended workload before wide deployment.

## Security reports and AI assistance

See [SECURITY.md](SECURITY.md) for private reporting and [AI_DISCLOSURE.md](AI_DISCLOSURE.md) for development disclosure.

Portions of this project were generated or refactored with assistance from OpenAI Codex.

## License

The source distribution includes an Apache-2.0 license and a NOTICE file identifying starter-template attribution. Preserve those files and applicable third-party notices. Repository owners must confirm publication rights and attribution before publishing.
