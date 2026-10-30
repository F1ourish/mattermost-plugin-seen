# Источники и границы доказательств

Обновлено 30.10.2026; исходные архитектурные ссылки проверены 01.10.2026.

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

Кандидат 1.1.4: [официальные загрузки Go](https://go.dev/dl/), [GO-2026-6809](https://pkg.go.dev/vuln/GO-2026-6809), [GO-2026-6866](https://pkg.go.dev/vuln/GO-2026-6866), [GO-2026-6860](https://pkg.go.dev/vuln/GO-2026-6860). CI от 30.10.2026 обнаружил reachable finding Go 1.26.9 и package-level findings x/net 0.60.0; исправленные версии - Go 1.26.10 и x/net 0.62.0. Compiler загружен из go.dev и проверен по SHA256 из официального metadata; зависимости и их checksums обновлены Go tooling. Результаты новых source/binary scans относятся к exact commit и install archive в Actions.

Npm audit от 30.10.2026: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), исправление начиная с Zod 4.6.6. В lockfile адресно обновлена транзитивная lint dependency 4.6.5 → 4.6.7; package не поставляется в web bundle.

Не проверены здесь: live Mattermost, фактическая DB topology, production logs, backup erasure, GitHub permissions/settings, права на публикацию, git history. Упоминание API/настройки в документации не доказывает её включение на целевом контуре.
