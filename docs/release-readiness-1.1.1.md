# Готовность Seen 1.1.1 — security patch

Дата: 11.10.2026. Версия отчёта: 2. Статус: локальные проверки пройдены; live acceptance pending. Plugin ID: `ru.internal.mattermost.seen`.

## Решение

**Кандидат 1.1.1 подготовлен для тестового контура.** Исправляемые Go/x/net advisories из проверки 1.1.0 от 10.10 устранены обновлением compiler/dependencies. Сохраняются UI, receipt API, KV format и viewport-based semantics. Это совместимый patch, крупный рефакторинг не выполнялся.

| Решение | Статус |
|---|---|
| Локальные unit/race/lint/typecheck/build/security gates | PASS |
| Source и точные Linux amd64/arm64 binaries | 0 symbol findings, 0 imported-package findings; 1 module-only OpenPGP |
| Test-environment candidate | Готов к live приёмке |
| Stable single-node support | Нужны live Mattermost gateway/security/functional results |
| HA support | Не подтверждено; app1/app2/failover/load NOT RUN |
| Public source publication | Требуются права, фактическая history/privacy проверка и repository setup |
| GitHub publication / deployment | Не выполнялись |

## Объём и доказательства

База — source ZIP 1.1.0, SHA256 `f6094ca07cb13d2e3488679404953a61f3ac3cbf93f824c9662464adefbae68a`. Все 19 исходных файлов backend/frontend, включая их тесты, сохранены побайтово. Web bundle совпадает с 1.1.0: SHA256 `1e4f233fb9bb07e38fcda6bd9b5b26a145e48ee129254b2f4a2db960c2da2c9b`. Изменения затрагивают compiler/module graph, версии manifest/package, build/CI и документацию.

Это проверка security patch и регрессий, а не внешний пентест или повторная полная оценка всей инфраструктуры. Реальные Mattermost gateway, production logs, GitHub settings и git history недоступны. Source ZIP не содержит .git. Все 35 live-сценариев results.csv остаются NOT RUN; browser smoke использует mock host и синтетические данные.

## Свежие локальные проверки 11.10.2026

| Проверка | Результат / границы |
|---|---|
| npm ci по lockfile / version consistency | PASS; manifest/package/lock 1.1.1, ID прежний |
| Frontend unit | PASS, 24 теста |
| Prettier / ESLint / TypeScript | PASS |
| Web bundle build | PASS; побайтово тот же UI |
| go test -race ./server | PASS; включая authz, concurrent CAS, deletion/timestamp regressions |
| go vet ./server | PASS |
| make dist | PASS; Linux amd64/arm64, licenses/docs included |
| Browser smoke, Chromium 151.0.7922.34 | PASS; mock host: preview 0/3/5/6/70, Show all, request limit 5, full-list pages, keyboard/ESC/focus/outside, themes, names/date |
| go mod verify | PASS |
| govulncheck 1.8.0 source (контроль прежним scanner) | 0 symbol, 0 imported-package; 1 module-only |
| govulncheck 1.9.0 source + обе packaged binaries | 0 symbol, 0 imported-package; 1 module-only |
| npm audit, включая dev dependencies | 0 findings на момент проверки |
| Gitleaks 8.24.3, public source snapshot | PASS, no leaks found; не проверка истории |
| Live gateway / CSRF / HA / load | NOT RUN |

Полные logs и команды поставляются отдельно в `seen_validation_1.1.1.zip`; SHA256 итоговых assets — в `SHA256SUMS-1.1.1.txt`. Исторический [обзор 1.0.3](release-readiness-1.0.3.md) не является свежим scan. После изменения source, dependencies, compiler или release assets проверки привязать к новым суммам.

## Critical / High

Новых подтверждённых Critical дефектов в этом ограниченном patch review не выявлено. Это не гарантия отсутствия дефектов.

| ID / приоритет | Проблема | Impact | Fix / проверка | Блокер |
|---|---|---|---|---|
| H1, исправлено | 1.1.0 содержит 7 symbol/reachable advisories Go/x/net: GO-2026-6617, 6613, 6612, 6611, 6608, 6607, 6603 | Уязвимые библиотечные пути достижимы согласно source analysis; успешная эксплуатация плагина не доказана | Go 1.26.9, x/net 0.60.0; fresh source/binary scans PASS | Закрыт для 1.1.1; прежний пакет не продвигать как fixed |
| H2, исправлено | Ещё 6 imported-package advisories: GO-2026-6610, 6609, 6605, 6604, 6600, 6599 | Риск импортированных библиотек зависит от пути/платформы; Windows advisory не равен Linux exploit | Обновлённый compiler/module graph; 0 imported-package findings | Закрыт для 1.1.1 |

## Medium — ограничения, не скрытые исправления

| ID | Проблема | Impact | Fix / проверка | Блокер public release |
|---|---|---|---|---|
| M1 | Нет live gateway/authz/CSRF протокола | Нельзя подтвердить доверие identity header и cookie requests конкретного deployment только unit tests | A/B/C, spoof header, client user_id, non-author/outsider, IDOR и CSRF через реальный gateway | Для stable binary; source допускается с experimental status |
| M2 | Нет app1/app2/failover/load evidence | HA и нагрузочные пределы не подтверждены; quotas process-local | Shared KV, cross-node reads/writes, failover, WebSocket/reconnect, load baseline | Для HA/scale support |
| M3 | Cleanup при KV failure best effort; user/channel erasure workflow отсутствует | Retention/deletion не равны гарантированной очистке всех receipts/backups | Описанные ограничения и операторский erasure процесс; durable retry отдельной версией | Если заявлена guaranteed erasure — да |
| M4 | GO-2026-5932 остаётся module-only в x/crypto 0.57.0 | OpenPGP unmaintained, исправленной версии нет; модуль нужен для иных пакетов | OpenPGP отсутствует в compiled dependency list из 450 пакетов; 0 symbol/imported findings, не добавлять OpenPGP и пересматривать после update | Не блокирует текущий binary по доступным доказательствам; не является «исправленным OpenPGP» |

## Low

| ID | Проблема | Impact | Fix / проверка | Блокер |
|---|---|---|---|---|
| L1 | DOM adapter привязан к Mattermost 11.10; load baseline неизвестен | Host upgrade/layout может нарушить inline placement; тяжёлые списки требуют измерений | Реальный Web/Desktop, темы, zoom/layout и будущие host-version regressions | Для неподтверждённых compatibility/scale обещаний |
| L2 | Actual git history, права публикации, private reporting не подтверждены | Можно опубликовать внутренние данные из других commits; private security channel не проверен | Владелец подтверждает права; scan all refs/assets; настроить private reporting | До public visibility |
| L3, исправлено | Symbol-stripped binary scan переоценивал unused module finding; workspace staging мог ломать tar | Неточная проверка assets / неуспешная упаковка | Сохранены symbol tables, debug/source paths удалены; staging вне checkout, exact binary scans в CI | Закрыт локально; GitHub CI run после создания repo |

## Nice-to-have

SBOM/provenance/signatures, automated secret/history scanning в GitHub, EN operations docs, metrics с низкой кардинальностью, длительный memory/performance test. Они не подменяют обязательный live access gate.

## Подтверждённые инварианты

Все API используют Mattermost gateway identity, active non-bot account, native post/channel membership/read checks; viewers/summaries author-only. Client user_id не является источником identity. CAS map user→first timestamp, автор исключён; committed tombstones закрывают deletion/write race при совместимых writers. Критичные retained receipts находятся в KV. React отображает profile fields как текст; receipt API не возвращает email/full profile; прямой SQL/users и schema changes отсутствуют. Подробности и ограничения: [API](api.md), [архитектура](architecture.md), [privacy](privacy.md).

## Минимальный план выпуска

1. Проверить SHA256, backup/settings, установить exact 1.1.1 на тестовый Mattermost по [release notes](release-1.1.1.md) и [operations](operations.md).
2. Заполнить T01–T35 с checksum/server build/topology/date/tester; пройти gateway negatives, first timestamp/dedup, deletion/KV failure, retention и UI preview/full-list. Незакрытое оставить NOT RUN/BLOCKED.
3. Если заявляется HA, дополнительно выполнить app1/app2/failover/load; иначе явно ограничить поддержку подтверждённой топологией.
4. Проверить реальные publication rights/history, private vulnerability reporting и clean GitHub CI. Для незакрытой stable приёмки использовать pre-release/experimental status.
5. Выпустить immutable assets с tag/commit и суммами; не перезаписывать старые 1.1.0 assets. При security rollback предпочесть отключение Seen до fixed package: возврат к старому binary возвращает advisories.

[Источники](sources.md) · [Процесс выпуска](release-process.md) · [Тестирование](testing.md).
