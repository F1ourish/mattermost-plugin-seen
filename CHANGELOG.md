# Changelog

## [1.1.1] — 2026-10-11

- Updated the release compiler from Go 1.26.7 to 1.26.9 and golang.org/x/net from 0.58.0 to 0.60.0 to address the fixable advisories found in the 2026-10-10 review.
- Updated the matching indirect Go modules and regenerated the dependency/license inventory.
- Pinned the build compiler and govulncheck 1.9.0. CI now checks both source and the actual Linux amd64/arm64 binaries, plus npm audit and module integrity.
- Retained the Go symbol table for artifact scanning; release binaries still omit debug information and local source paths.
- Moved temporary archive staging outside the checkout and refreshed the packaged release/readiness/operations documentation.
- Plugin ID, backend/frontend runtime source, receipt API/storage, first-view timestamp and viewport rules remain unchanged. Live Mattermost and HA acceptance remain pending.

## [1.1.0] — 2026-10-05

- Hover preview requests only five viewers; larger lists have a Show all action with the total count.
- Full list uses a responsive 460 px dialog with a fixed header and scrollable, paginated list.
- Returning from the preview action restores focus to the message indicator.
- Added preview boundary/request-budget and full-list layout/navigation regression checks.
- Install packages now include linked project documentation and contributor guidance.
- Backend, receipt semantics, plugin ID and dependency versions remain unchanged. Live acceptance remains pending.

### Documentation prepared on 2026-10-01

- Added architecture, API, privacy, operations, testing, release-readiness and roadmap documentation.
- Added contributor guidance, a PR template and generated-file exclusions.
- Runtime source, dependency locks, plugin ID and version remain unchanged. The earlier 1.0.3 install bundle is not replaced.

## [1.0.3] — 2026-09-30

- Replaced font-dependent checkmark characters with a compact double-check SVG inspired by the supplied Telegram references.
- Rounded overlapping strokes, blue viewed / theme-based gray unviewed states, and a compact count separated from the icon.
- Accessible button labels, inline placement, viewport behavior and receipt storage remain unchanged.

## [1.0.2] — 2026-09-29

- Today's first-view timestamp explicitly displays “Сегодня, HH:mm” / “Today, HH:mm”.
- Calendar/timezone, first-view storage and viewport receipt behavior remain unchanged.
- Clarified System Console retention/public-channel settings and added configuration regression tests.
- Added a live-server acceptance runbook and result template. Live-server execution is not claimed by the package.

## [1.0.1] — 2026-09-29

### Fixed

- Deletion/write race: viewer-free tombstones prevent late receipt resurrection after a successful deletion write.
- Ambiguous time-only labels: relative yesterday and calendar dates, user timezone, year boundary and DST handling.
- Cancelled popovers no longer drain unneeded queued profile lookups; shared consumers remain supported.
- React effect dependencies and dialog cleanup found by semantic lint.

### Changed

- Per-user, bounded per-process request budget with HTTP 429 / Retry-After.
- Version-aware viewer refresh skips unchanged later pages.
- ESLint/TypeScript/React hooks gates, x/crypto 0.56.0, public README and AI disclosure.

### Deployment requirements

- Disable cluster-wide, update all app nodes, re-enable; do not run old and new writers together.
- Live Mattermost gateway/HA acceptance and repository security-reporting setup remain required before public production support claims.
- Plugin ID and viewport dwell rules are unchanged; no system database schema changes.

## [1.0.0] — Pending public release

This version was built locally. A public release has not been approved by the architecture/security audit.

### Added

- Author-only viewport receipts with a first server-recorded timestamp.
- Native Mattermost profile lookup and configurable display-name fallback.
- Compact viewer lists, time display, scrolling, Russian/English labels and theme support.
- Bounded delivery retry state, terminal-outcome cache, shared profile cache and read cooldown.
- Background list refresh with preserved loaded rows and keyboard focus.
- Server race tests, frontend unit tests, mock-host browser tests and version consistency checks.

### Fixed relative to earlier candidates

- Expired storage was incorrectly treated as a successful receipt.
- Temporary host API failures were conflated with denied access.
- Missing summaries could prevent indicators from recovering after reconnect.
- Terminal outcomes could fill the delivery queue and reject new observations.
- Background refresh discarded loaded pages and unnecessarily reloaded profiles.

### Compatibility

- Plugin ID remains `ru.internal.mattermost.seen`.
- Existing receipt API field names, including `seen_at`, are retained.
- No Mattermost system database migration; no direct system-user-table reads.

### Known release-review items

- Resolve the confirmed race between receipt creation and deletion cleanup.
- Complete live gateway spoofing/CSRF and two-node HA acceptance tests.
- Audit the actual publication repository and its history; sanitize internal operational documentation.
- Add semantic frontend linting and verify a private security reporting channel.
- Continue tracking module-level advisories even where govulncheck reports no reachable vulnerable symbols.
