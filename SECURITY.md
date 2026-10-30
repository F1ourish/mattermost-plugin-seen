# Security policy

## Private reporting setup

The source repository is public. Before publishing a release, maintainers must enable GitHub private vulnerability reporting and verify that **Security → Advisories → Report a vulnerability** is available. Enablement could not be independently confirmed in the 2026-10-12 repository review; see [the review](docs/repository-review-2026-10-12.md). No private contact address or response SLA is invented here.

## Reporting a vulnerability

Use this repository's private vulnerability reporting facility. Do not include credentials, real viewer lists, private message content, or production identifiers in public issues.

Include the plugin and Mattermost versions, affected endpoint or component, relevant server topology, a minimal reproduction using synthetic accounts, expected and actual behavior, and impact. Redact cookies, tokens and deployment identifiers from logs or HAR files.

If private reporting is unavailable, request a private reporting channel without posting exploit details or sensitive data publicly. Maintainers must provide that channel before requesting detailed reports.

## Supported scope

Candidate 1.1.4 updates the pinned release compiler to Go 1.26.10 for GO-2026-6809 and golang.org/x/net to 0.62.0 for GO-2026-6866/GO-2026-6860, identified by CI on 2026-10-30. The npm lockfile also updates the transitive lint dependency Zod to 4.6.7 for GHSA-mrhx-c7xc-m3w5; this development dependency is not shipped in the web bundle. Versions 1.1.1-1.1.3 were built with Go 1.26.9/x/net 0.60.0 and retain those newly reported Go findings. Candidate publication and acceptance status are recorded in [release readiness](docs/release-readiness.md) and [1.1.4 notes](docs/release-1.1.4.md); use the exact successful CI run for current scan results. Historical code and documentation reviews do not claim live gateway or HA acceptance. A long-term support policy and patch response timeline have not been established. Review status is not a guarantee that all vulnerabilities have been found.

Security-relevant behavior includes:

- Mattermost gateway authentication and CSRF handling;
- channel membership and read permission checks;
- author-only summaries and viewer lists;
- isolation of receipts between users and messages;
- safe profile rendering, retention, dependency handling and release provenance.

The trusted computing base includes Mattermost, its database, administrators and other privileged server-side plugins. A compromised host, malicious privileged plugin or malicious browser extension is outside the plugin's ordinary-user authorization boundary.

## Important limitations

- A client can report its own view of an accessible message without a human reading it. This is inherent in viewport receipts, not evidence of identity spoofing.
- Undelivered receipts are held in browser memory. This is not durable offline messaging.
- Version 1.0.1 prevents receipt resurrection after a deletion tombstone commits; storage failures, old writers and mixed-version deployments are excluded from that guarantee. Deleted-message API access remains denied.
- Retention does not remove database backups or guarantee immediate erasure on user/channel deletion.
- Server concurrency controls are process-local; per-user limiting is local to each process, and real HA/load validation is not claimed.
- Go module-level scanners can flag the unmaintained x/crypto/openpgp package (GO-2026-5932). The receipt plugin does not import OpenPGP; verify the compiled dependency list and current scanner output for each release rather than assuming that every x/crypto package is used or that the module is entirely free of advisories.

Maintainers should reproduce findings privately, add regression tests, issue a versioned fix, and document affected versions and deployment requirements. Do not publish a changed binary under an unchanged checksum or silently replace an audited release artifact.
