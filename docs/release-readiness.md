# Готовность Seen 1.1.4 - исправление позиции индикатора

Кандидат от 30.10.2026 возвращает индикатор в конец того же абзаца после редактирования текста. Browser regression воспроизводит добавление описания перед двумя ссылками. После findings первого CI обновлены Go до 1.26.10 и x/net до 0.62.0; оба серверных бинарника пересобираются с новыми закреплёнными SHA256. Исходники backend и формат данных сохранены. Фактические CI checks фиксируются для exact commit, включая свежие source/binary scans; module-only OpenPGP finding не подавляется. Live Mattermost и HA для этого кандидата NOT RUN; публикация 1.1.4 автоматически не разрешена.

[Изменения, проверка, установка и откат 1.1.4](release-1.1.4.md). Ниже сохранены исторические критерии 1.1.3 и 1.1.2.

## История 1.1.3 - patch пояснений

Добавлена только локализованная сноска о Web/Desktop, уточнены manifest и README. Backend, зависимости и правила сбора сохранены из 1.1.2. Серверные бинарники проверяются по прежним SHA256; web bundle имеет новый закреплённый hash.

Фактические frontend/browser/package проверки фиксируются в протоколе комплекта. При локальной упаковке могут использоваться неизменённые ранее проверенные бинарники 1.1.2; свежие Go race/vet/build и новый GitHub CI в таком случае не заявляются. Полная live/HA-приёмка этим изменением не подтверждается.

[Изменения, установка и проверка 1.1.3](release-1.1.3.md). Ниже сохранены исторические критерии 1.1.2.

# Готовность Seen 1.1.2 - pre-release

Дата: 12.10.2026. Plugin ID: `ru.internal.mattermost.seen`. Документ задаёт критерии кандидата; фактический результат автоматического прогона хранится в GitHub Actions и `release-validation-1.1.2.json` для exact commit.

## Объём

Совместимый patch включает актуальные русский/английский README и документацию в новый install-архив. Код backend/frontend и dependency graph сохранены из 1.1.1. CI требует совпадения обоих Linux binaries и web bundle с его проверенными SHA256. Receipt API/storage, первое время просмотра, авторские права и viewport semantics сохраняются. Системная DB schema не меняется.

[Отчёт 1.1.1 от 11.10.2026](release-readiness-1.1.1.md) является историческим доказательством, а не свежим scan 1.1.2. [Repository review от 12.10.2026](repository-review-2026-10-12.md) фиксирует настройки на момент той проверки.

## Автоматические gates

| Gate | Условие подготовки draft / источник результата |
|---|---|
| Version consistency | Manifest/package/lock 1.1.2, прежний ID |
| Frontend | Format, ESLint, TypeScript, unit tests и build exit 0 |
| Backend | `go test -race ./server`, `go vet ./server` exit 0 |
| Browser | Mock-host smoke: preview, Show all, full-list, keyboard/focus, темы, имена/даты |
| Security | Module integrity, source govulncheck, оба packaged binaries и npm audit exit 0; читать module-only findings |
| Package | Безопасные paths, README/docs/licenses, relative links, permissions, manifest и runtime hashes |
| Transfer to release job | Tar SHA256 совпадает с output успешного read-only build job; package report повторно проверен |
| Provenance | Source ZIP из exact successful commit, четыре assets, checksums; существующие assets не заменяются |

Draft создаётся только после успешного выполнения этих gates на `main` в исходном репозитории. Он остаётся неопубликованным pre-release. Итоговый SHA256, commit и CI run ID берутся из проверенного отчёта/Actions; они не подставляются заранее в исходник релиза.

## Оставшиеся ограничения

| Приоритет | Проблема / impact | Fix / проверка | Release blocker |
|---|---|---|---|
| Medium | Live gateway/authz/CSRF не подтверждены unit/mock tests | A/B/C, identity spoofing, чужой user_id/post_id, author-only, membership и cookie CSRF через Mattermost | Для stable binary |
| Medium | HA/failover/load не подтверждены; quotas process-local | Реальные app1/app2, concurrent writes, restart/failover, WebSocket и согласованная нагрузка | Для HA/scale claims |
| Medium | Cleanup best effort при KV failure; отдельного user/channel erasure нет | Учитывать TTL, tombstones, backup policy и операторскую процедуру | Для guaranteed erasure claims |
| Medium | GO-2026-5932 module-only в x/crypto/OpenPGP, исправленной версии нет | Не импортировать OpenPGP; пересматривать source/actual binary findings для exact версии | Не блокирует binary при отсутствии используемого vulnerable package |
| Low | Private reporting и защита main не подтверждены как настроенные | Владелец проверяет private channel и принятую PR/CI policy | Private reporting перед публикацией release по SECURITY.md |
| Low | Host DOM adapter и performance bounds зависят от deployment | Live Web/Desktop, темы/zoom/layout, длительный memory/load test | Для неподтверждённых compatibility/scale claims |

Все 35 live-сценариев в `results.csv` сохраняются NOT RUN. Отчёт package validation подтверждает состав и runtime hashes, а не отсутствие всех уязвимостей. Runtime hash equivalence не заменяет свежий dependency scan.

## Минимальный план

1. Дождаться successful CI exact кандидата и проверить draft target commit, четыре assets и SHA256.
2. Проверить backup/settings и установить exact tar.gz на тестовый контур по [release notes](release-1.1.2.md).
3. Заполнить T01-T35, закрыть gateway/security/functional gates; невыполненное оставить NOT RUN/BLOCKED.
4. Перед публичной публикацией проверить private vulnerability reporting и права распространения. Для незакрытой stable-приёмки сохранить pre-release status и ограничения.
5. Заявлять HA только после app1/app2/failover/load evidence. Старые assets сохранять без перезаписи.

[Процесс выпуска](release-process.md) · [Тестирование](testing.md) · [Эксплуатация](operations.md).
