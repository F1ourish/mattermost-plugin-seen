# Seen 1.1.1 — security patch

Дата: 11.10.2026. Статус: кандидат для приёмки на тестовом Mattermost; публичный stable release и deployment этим комплектом не выполняются. Plugin ID: `ru.internal.mattermost.seen`.

## Вывод и изменения

Пакет закрывает исправляемые Go/x/net advisories, найденные в аудите 1.1.0 от 10.10.2026. Обновлён compiler и согласованные зависимости; backend receipt protocol, KV format и UI остаются совместимыми. Новый major для этого исправления не нужен.

| Компонент | 1.1.0 | 1.1.1 |
|---|---|---|
| Go compiler / go directive | 1.26.7 | 1.26.9 |
| golang.org/x/net | 0.58.0 | 0.60.0 |
| golang.org/x/crypto | 0.56.0 | 0.57.0 |
| golang.org/x/mod | 0.40.0 | 0.41.0 |
| golang.org/x/sys | 0.47.0 | 0.48.0 |
| golang.org/x/text | 0.41.0 | 0.42.0 |
| govulncheck в CI | 1.8.0 | 1.9.0 |

Node/npm/frontend dependency versions и Mattermost SDK 0.4.4 сохранены. Release build закрепляет GOTOOLCHAIN=go1.26.9, чтобы случайная сборка старым compiler не вернула уязвимую стандартную библиотеку. Inventory и лицензии собираются из итогового dependency graph. Бинарники сохраняют Go symbol table для точного artifact scan; debug information и локальные source paths удаляются. `make security-check` проверяет source и оба файла из install-архива, module integrity и npm audit; CI использует тот же gate.

Security advisories из symbol/reachable scan 1.1.0: GO-2026-6617, 6613, 6612, 6611, 6608, 6607, 6603. Исправленные версии подтверждены официальной Go vulnerability database. Это dependency update, а не доказательство успешной удалённой эксплуатации старого пакета.

Текущие результаты и остаточные findings приведены в [release readiness](release-readiness.md). x/crypto/openpgp GO-2026-5932 не имеет исправленной версии: сам OpenPGP плагином не импортируется; module-only finding нужно учитывать отдельно от используемого кода.

## Что сохранено

- Author-only viewers/summaries и channel membership/read permission checks.
- Один retained receipt на user+post, автор исключён, первый server seen_at не меняется от дубля.
- Viewport marker 50%, непрерывно 800 ms, активная вкладка/окно; viewed не является гарантией человеческого чтения.
- UserProfile/Redux/native API и configured display-name fallback, Сегодня/Вчера/дата, время справа.
- Telegram-inspired checks, inline placement, preview 5, count/Show all и полный scrollable list с API pages 50.
- System Console RetentionDays 1–365/default 90 и EnablePublic; срок от создания сообщения.
- Tombstones, existing Plugin KV documents и прежний plugin ID; системная DB schema не меняется, SQL users не используется.

## Установка на тестовый контур

Область: Mattermost 11.10.x, Linux amd64/arm64, Web/Desktop. Топологию, конкретный server build, gateway и backup зафиксировать по [эксплуатационному ранбуку](operations.md). Mobile/Connected Workspaces receipts не заявляются.

Pre-check: убедиться в штатной работе Mattermost/login/messages/native profiles, записать текущую версию и настройки, сохранить предыдущий архив, подтвердить актуальный backup и доступность тестовых A/B/C. Согласовать короткое окно отсутствия функций Seen.

На инженерной Linux-машине рядом со всеми файлами поставляемого комплекта проверить суммы:

```sh
sha256sum -c SHA256SUMS-1.1.1.txt
```

Ожидаемый вывод: для каждого указанного файла OK, exit 0. Не устанавливать source/validation ZIP вместо plugin tar.gz. Если скачан только tar.gz, сверить именно его SHA256 со строкой файла сумм; команда полного комплекта иначе сообщит об отсутствующих файлах.

1. Отключить Seen через System Console; при нескольких app-нодах согласовать отключение и обновление всех нод. Особенно не смешивать writers 1.0.0 с tombstone-aware версиями.
2. Загрузить `ru.internal.mattermost.seen-1.1.1.tar.gz` как обновление текущего ID. Проверить отображаемую версию 1.1.1 и отсутствие upload/activation ошибки; при неясном результате сверить список плагинов и логи по времени операции.
3. Проверить сохранение RetentionDays/EnablePublic, включить плагин, перезагрузить Web/Desktop clients. Проверить одинаковую версию на всех задействованных нодах.
4. Выполнить обязательные сценарии ниже и [T01–T35](acceptance-1.0.2.md), записать exact package checksum, server build, topology/date/tester и реальные результаты в results.csv. Невыполненное оставить NOT RUN/BLOCKED.

## Минимальная приёмка нового binary

| Проверка | Ожидаемое поведение |
|---|---|
| A автор, B viewer, C outsider/non-author | B отмечает только собственный доступный просмотр; список доступен A при текущем read access, недоступен B/C |
| Unauthenticated / spoof Mattermost-User-ID / user_id в body / чужой post_id / cookie CSRF через gateway | Нет записи от подставленного пользователя и нет неразрешённого доступа; body user_id не принимается |
| Дубль просмотра / автор открывает своё сообщение | Timestamp/count не меняются от дубля; автор не добавляется |
| Удаление одновременно с записью / KV failure / restart | После committed tombstone нет resurrection; сбой не маскируется успехом; retained receipts переживают restart |
| Retention/public config reload | Валидная конфигурация применяется, invalid retention не активируется; logical expiry/public disabled корректны |
| Preview 0/1/5/6/70 | До 5 все строки видны; >5 есть общий count и Show all; preview не запрашивает весь список |
| Full list, keyboard/ESC/outside/focus, темы/zoom/layout | Scroll/load и шапка корректны, фокус возвращается, UI не мешает сообщениям |
| app1 write / app2 read / failover, если заявляется HA | Общий KV, дедуп/первое время и recovery подтверждены реальным прогоном |

Эти строки являются планом live-проверки, а не утверждением о выполнении. Mock browser и unit tests не заменяют Mattermost gateway/HA evidence.

## Rollback и риски

При нарушении доступа, неверных viewers, массовых 5xx или деградации выключить Seen и reload clients, проверить обычные сообщения/login, сохранить обезличенные симптомы. KV не удалять. Предпочтительный security rollback — оставить функции Seen выключенными до появления проверенного фиксированного пакета. Возврат к 1.1.0 возвращает найденные dependency advisories и не является закрытым security rollback; rollback на 1.0.0 с writers также нарушает tombstone-защиту.

Риск данных: недоставленная in-memory очередь может теряться при reload; TTL/backup ограничения сохраняются. Риск доступности/UX: на время выключения отсутствуют индикаторы и сбор новых receipts. Влияние на производительность проверяется на фактическом контуре; подтверждённый production/load baseline здесь отсутствует. Restart Mattermost не назначается как штатный шаг; при требовании конкретного deployment учитывать отдельное окно.

## Диагностика

| Симптом | Проверка / действие |
|---|---|
| После upload отображается 1.1.0 | Проверить имя архива, список плагинов, статус upload и одинаковую версию на app-нодах; reload клиента |
| 401/404 / чужой список недоступен | Проверить session, автора, membership/read access; не обходить authz |
| 429/503 или per-item retry | Уважать Retry-After, проверить host API/KV/cluster health по штатным логам |
| Binary scanner сообщает OpenPGP | Сопоставить source scan, compiled dependency list и доступность binary symbols; не считать любое x/crypto module finding выполненной атакой |
| Нет новых просмотров после обновления | Проверить enabled state, настройки, expiry и активность/видимость viewport marker |

## Источники

Проверено 11.10.2026: [Go release history](https://go.dev/doc/devel/release#go1.26.9), [GO-2026-6617 с исправлениями Go/x/net](https://pkg.go.dev/vuln/GO-2026-6617), [GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932), [govulncheck limitations](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck). Предыдущие отчёты остаются историческими; новые протоколы относятся к пакету 1.1.1.
