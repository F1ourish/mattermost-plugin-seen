# Источники и границы доказательств

Обновлено 11.10.2026; исходные архитектурные ссылки проверены 01.10.2026.

Для security patch 1.1.1 исходная база — `mattermost-seen-source-1.1.0.zip`, SHA256 `f6094ca07cb13d2e3488679404953a61f3ac3cbf93f824c9662464adefbae68a`. Runtime source и web bundle сохранены, Go/compiler dependency graph обновлён. Свежие проверки перечислены в [release readiness](release-readiness.md). Исторический архитектурный обзор 1.0.3 сохранён отдельно; его build/scans не выдаются за результаты текущего patch.

- `server/plugin.go`: routes, access, batch, configs, deletion hook.
- `server/store.go`: CAS, timestamp, ordering, limits, tombstone.
- `server/limiter.go`: process-local rate limiting.
- `webapp/src/index.tsx`, `inline.ts`, `runtime.ts`: viewport, rendering, lifecycle, queues.
- `webapp/src/profiles.ts`, `profile_cache.ts`, `viewer_session.ts`: names, profile lookup, pages.
- `plugin.json`, Makefile, scripts, CI: configuration/build.

Официальные источники, просмотрены через поиск:

- [Mattermost server plugin best practices](https://developers.mattermost.com/integrate/plugins/components/server/best-practices/): gateway выставляет identity header; plugin обязан отклонять неаутентифицированные запросы. Это не заменяет тест конкретного gateway.
- [Mattermost server SDK](https://docs.mattermost.com/developers/integrate/reference/server): контракт ServeHTTP/native plugin API.
- [GitHub private vulnerability reporting](https://docs.github.com/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository): настройка приватного канала и кнопки Report a vulnerability.

Security patch: [Go 1.26.9 release history](https://go.dev/doc/devel/release#go1.26.9), [GO-2026-6617](https://pkg.go.dev/vuln/GO-2026-6617), [GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932), [govulncheck binary limitations](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck). Go vulnerability database и registry metadata перепроверены 11.10.2026; версия scanner 1.9.0 закреплена в CI.

Не проверены здесь: live Mattermost, фактическая DB topology, production logs, backup erasure, GitHub permissions/settings, права на публикацию, git history. Упоминание API/настройки в документации не доказывает её включение на целевом контуре.
