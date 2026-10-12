# Следующие версии

Приоритеты исходят из кода 1.0.3 и незакрытой приёмки. Это предложения, не обещанные сроки.

| Приоритет | Изменение | Условие завершения |
|---|---|---|
| P0 | Реальный gateway/authz/CSRF и базовый live smoke | Протокол конкретного пакета/сервера; негативные сценарии PASS |
| P0 | Права, privacy scan истории, private reporting, clean CI | Публикационный checklist закрыт ответственным |
| P1 / patch | Упаковка актуальных docs и их зависимостей | В install archive нет битых относительных ссылок; версия новая |
| P1 / patch | Минимальные метрики ошибок/latency/CAS/429 без IDs | Наблюдаемость проверена; нет PII/cardinality explosion |
| P1 | HA/load/duration baseline | Проверены заявленные режимы, пределы нагрузки задокументированы |
| P2 / minor | Надёжный retry cleanup после ошибки tombstone | Переживает restart/app failover; не восстанавливает viewers |
| P2 / minor | Поддерживаемая процедура удаления user/channel receipts | Авторизация, audit без PII, bounds, backup limitations и тесты |
| P2 / minor | Оптимизация больших списков и auth lookups | Измеренное улучшение; не ослаблены per-post permission checks |
| P2 / minor | Более независимый от DOM inline adapter | Host upgrade/fallback тесты, отсутствие вмешательства в message text |
| Nice-to-have | EN-документация, SBOM/provenance, шаблоны bug/feature issues | Реальные ссылки/owners, воспроизводимый release pipeline |

Не начинать с переписывания storage: текущие CAS и инварианты полезны. Sharding receipt records рассматривать только после измерения размера/конкуренции; это потребует migration и mixed-version стратегии. Локальные rate limits не заменять распределёнными без подтверждённой потребности. Опциональный native Mobile или Connected Workspaces проектировать как отдельную совместимость, не объявлять текущие receipts автоматически межкластерными.
