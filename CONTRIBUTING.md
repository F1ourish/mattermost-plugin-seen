# Contributing

This project targets Mattermost 11.10.x. See [architecture](docs/architecture.md), [API](docs/api.md), [testing](docs/testing.md) and [release process](docs/release-process.md). The project README is available in [English](README.md) and [Russian](README.ru.md); operational documentation is currently in Russian and the security policy is in English.

Use synthetic data. Never attach real messages, viewer lists, cookies, tokens, internal hosts or production IDs to public issues or pull requests. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

Before proposing a change, describe the problem, intended behavior, affected clients/topologies and tests. Keep pull requests focused. Preserve the plugin ID, author-only access, channel checks, first timestamp and deduplication; schema/protocol changes need explicit compatibility and rollback analysis.

Use the toolchain versions in README and CI. Run `npm --prefix webapp ci --ignore-scripts`, `make test`, `make check`, `npm --prefix webapp run format:check`; use `make dist` for release validation. Browser smoke uses a mock host and does not establish real Mattermost compatibility. Add meaningful regression tests for behavior changes. Do not mark unexecuted live scenarios as passed.

Submit dependency changes with lockfiles, scan results and an explanation. Preserve LICENSE, NOTICE and required third-party notices. Do not silently replace existing release assets. AI assistance is permitted; contributors remain responsible for reviewing, testing and explaining their changes and updating disclosure when appropriate.

No response SLA or long-term support promise has been established. Repository ownership, review permissions and publication rights must be confirmed by the maintainer.
