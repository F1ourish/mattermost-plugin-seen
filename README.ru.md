# Seen для Mattermost

[English](README.md) · Русский

[![CI](https://github.com/F1ourish/mattermost-plugin-seen/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/F1ourish/mattermost-plugin-seen/actions/workflows/ci.yml)
[![Лицензия: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Seen добавляет в Mattermost Web и Desktop индикатор просмотра сообщения и список просмотревших, доступный автору сообщения.

**«Просмотрено» означает, что маркер сообщения попал в активную область просмотра клиента по правилам плагина. Это не гарантирует, что человек прочитал, понял или заметил сообщение.** Авторизованный клиент также может отправить отметку просмотра (receipt) для доступного ему сообщения через API; статус не является доказательством человеческого чтения или доставки.

Plugin ID: `ru.internal.mattermost.seen`. Идентификатор сохранён для совместимости установки и данных.

## Статус и совместимость

Версия **1.1.1** — совместимый security patch для Go toolchain и зависимостей. Сохраняется UI 1.1.0: preview до пяти пользователей и отдельное окно полного списка.

Репозиторий публичный, draft pre-release подготовлен 12.10.2026. Draft привязан к проверенному commit `82bdcdc952767cdb017ab55720a123b8e96f7cd6`; последующие изменения документации в `main` не заменяют его файлы. Пакеты станут публично доступны в [Releases](https://github.com/F1ourish/mattermost-plugin-seen/releases) после публикации релиза. См. [проверку оформления репозитория](docs/repository-review-2026-10-12.md).

Кандидат предназначен для приёмки на тестовом контуре. Проверки реального Mattermost gateway, прав доступа, CSRF и функциональной приёмки требуются перед рекомендацией production. Поддержка HA должна быть подтверждена отдельным app1/app2, failover и нагрузочным прогоном. Номер версии не является сертификатом безопасности.

| Компонент | Область применения |
|---|---|
| Mattermost Server | Целевая версия 11.10.x; минимум в manifest — 11.10.0. Другие версии требуют проверки |
| Серверная ОС | Linux amd64 и arm64; в пакет включены обе сборки |
| Клиенты | Mattermost Web и Desktop |
| Mobile | Сбор отметок просмотра не поддерживается |
| Connected Workspaces | Синхронизация отметок между контурами не поддерживается |

## Возможности

- Список просмотревших и сводка доступны только автору сообщения с текущим членством и правом чтения канала. Сам автор не считается viewer.
- Одна сохраняемая отметка на пользователя и сообщение. Повторный просмотр не меняет первое сохранённое время.
- Имена получаются из Mattermost UserProfile через Redux/native API. Учитывается `TeamSettings.TeammateNameDisplay`; fallback: настроенное имя → имя и фамилия → nickname → username → user_id.
- Компактные двойные галочки и число просмотревших. В обычных абзацах индикатор размещается рядом с концом сообщения; для неподдерживаемой разметки используется attachment fallback.
- Preview показывает до пяти viewers. При большем количестве доступны общий счётчик и Show all. В полном окне шириной до 460 px шапка остаётся на месте, список прокручивается и подгружает страницы API.
- Рядом с именем отображается первое время: «Сегодня, HH:mm», «Вчера, HH:mm» либо `dd.mm, HH:mm`; для другого года добавляется год. Используется часовой пояс пользователя.
- Русские и английские подписи, theme variables, клавиатура, ESC, возврат фокуса, состояния загрузки/ошибки и обновление открытого списка.
- Настройки хранения и публичных каналов доступны в System Console.

## Когда создаётся отметка

В очередь отправки добавляется просмотр, если минимум 50% observation marker остаётся видимым непрерывно 800 ms, вкладка видима и окно имеет фокус. Наблюдается маркер attachment, а не весь текст сообщения. Быстрая прокрутка или потеря фокуса прерывает dwell.

`seen_at` — server timestamp первой успешной записи. Это не время последнего просмотра. При offline/retry запись может произойти позже фактического попадания маркера в viewport. Очередь клиента хранится в памяти и может потеряться при reload, смене аккаунта или истечении срока; доставка best effort.

## Установка и обновление

Выполнять на выбранном тестовом контуре. До изменения записать текущую версию и настройки, проверить штатные login/messages и актуальность backup, сохранить предыдущий пакет для диагностики. На время отключения Seen отсутствуют его индикаторы и сбор новых отметок.

1. Скачать `ru.internal.mattermost.seen-1.1.1.tar.gz` и проверить SHA256. Source ZIP не является установочным пакетом.
2. Отключить Seen через System Console. При нескольких app-нодах согласовать обновление всех нод; не смешивать writers 1.0.0 с версиями, поддерживающими tombstones.
3. Загрузить tar.gz через управление плагинами как обновление существующего ID. Проверить версию 1.1.1 и результат upload/activation; при неясном результате сверить список плагинов и логи по времени операции.
4. Проверить сохранение RetentionDays/EnablePublic, включить плагин, перезагрузить Web/Desktop clients и подтвердить одинаковую версию на app-нодах.
5. Проверить поведение минимум с двумя тестовыми пользователями: отказ доступа, повтор, reconnect, обе темы и используемые layouts. Для полной матрицы T01–T35 использовать [инструкцию тестирования](docs/testing.md).

Для GitHub draft подготовлен `SHA256SUMS-1.1.1-github.txt`. При обоих скачанных assets рядом с файлом сумм на Linux:

```sh
sha256sum -c SHA256SUMS-1.1.1-github.txt
```

Ожидается `OK` для install-архива и source ZIP, exit 0. Если скачан только tar.gz, сверить именно его сумму со строкой checksum file; общий check иначе сообщит о недостающем source ZIP.

Миграция системной DB schema не требуется. Существующие отметки читаются в прежнем формате; tombstone добавляет optional marker в Plugin KV. При security rollback отключить Seen до появления совместимого fixed package. Возврат к 1.1.0 возвращает dependency advisories; KV не удаляется как штатный шаг rollback. Подробнее: [эксплуатационный ранбук](docs/operations.md).

## Настройки в System Console

Открыть System Console → Plugins → настройки Seen. Точная группировка меню зависит от Mattermost build. Настройки объявлены в manifest плагина.

| Параметр | По умолчанию | Назначение |
|---|---|---|
| `RetentionDays` | 90 | Целое число 1–365 дней; срок считается от создания сообщения |
| `EnablePublic` | Включено | Сбор отметок в публичных каналах; membership/read checks сохраняются |

Сохранить настройки, повторно открыть страницу и проверить значения и поведение на тестовых аккаунтах. Недопустимый retention не должен становиться активной конфигурацией. При read-only server configuration использовать штатный процесс управления конфигурацией deployment.

## Данные, права и хранение

Отметки содержат привязанные к сообщению user IDs, первое время и expiry timestamp. Тексты сообщений, имена, email и credentials в receipt storage не сохраняются. User IDs и время просмотра — персональные данные об активности, а не анонимная аналитика.

Обычные API-клиенты получают viewers только как автор сообщения с текущим доступом к каналу. Администраторы сервера, операторы DB и доверенные server-side plugins находятся вне этой границы. Доступ к profiles выполняется с native Mattermost permissions текущего пользователя. Прямого чтения системной таблицы `users` и изменения системной DB schema нет.

Identity берётся из Mattermost gateway. Плагин не предназначен для независимой публикации собственного HTTP service. См. [SECURITY.md](SECURITY.md).

Данные сохраняются в Mattermost Plugin KV через compare-and-set. Максимум — 5 000 viewers на сообщение; при насыщении список может быть неполным. Очередь клиента ограничена 500 pending/deferred IDs и 10 минутами; caches имеют отдельные лимиты.

Логическое истечение срока и физическое удаление различаются. Host KV cleanup и backup policy определяют физическое хранение. Уменьшение RetentionDays скрывает старые отметки, но не мгновенно переписывает все сохранённые expiry; увеличение срока не восстанавливает удалённую историю.

При удалении сообщения receipt document заменяется durable tombstone без viewers и их времён. После успешного commit tombstone совместимые writers не восстанавливают список. Marker живёт дольше настроенного срока отметок, чтобы защищать от восстановления после изменения retention. Ошибка KV может помешать commit, поэтому полное удаление при outages не гарантируется. Для удаления пользователя/канала отдельный erasure workflow отсутствует; cleanup host и backups рассматриваются отдельно. Подробнее: [приватность](docs/privacy.md).

## Сборка и проверки

Требуются Linux, Go 1.26.9, Node.js 24.19.0, npm 11.9.0, Python 3, GNU tar/gzip, make и C compiler для race tests. Версии Go/npm dependencies закреплены. Build script использует `GOTOOLCHAIN=go1.26.9`; для offline сборки заранее подготовить compiler и проверенный dependency cache.

В корне исходников:

```sh
make dist
make security-check
webapp/node_modules/.bin/playwright install --with-deps chromium
node scripts/browser-smoke.mjs
```

`make dist` выполняет format/lint/typecheck, frontend tests, Go race/vet, сборку обеих Linux architectures и license inventory. `make security-check` требует готовый архив и проверяет module integrity, source scan, оба упакованных binaries и npm audit. Browser smoke использует mock host и не заменяет live Mattermost integration.

Symbols сохраняются для анализа готовых файлов; debug information и локальные source paths удаляются. Module-only GO-2026-5932 относится к unmaintained OpenPGP: этот package не импортируется плагином. Это не означает, что OpenPGP исправлен или все зависимости гарантированно безопасны.

## HA и эксплуатационные ограничения

Сохраняемые отметки находятся в shared Plugin KV, не в памяти процесса плагина. Локальные ограничения не являются cluster-wide quota. Consistency и задержки чтения зависят от Mattermost/DB topology; реальные app1/app2, failover и WebSocket/reconnect требуют проверки до заявления HA support.

Per-user limiter допускает 2 requests/sec и burst 120 на один процесс, глобальный semaphore — 16 concurrent requests на процесс. Неизменённый список обновляется одним page request; изменённые большие списки могут требовать до 100 запросов refresh. Load baseline текущего deployment здесь не подтверждён.

## Документация и участие

- [Оглавление документации](docs/README.md), [архитектура](docs/architecture.md), [API](docs/api.md), [приватность](docs/privacy.md).
- [Эксплуатация](docs/operations.md), [тестирование](docs/testing.md), [release notes 1.1.1](docs/release-1.1.1.md), [готовность релиза](docs/release-readiness.md).
- [Текущее оформление GitHub](docs/repository-review-2026-10-12.md), [процесс выпуска](docs/release-process.md), [участие в разработке](CONTRIBUTING.md), [CHANGELOG](CHANGELOG.md).

Баги и предложения принимаются через [Issues](https://github.com/F1ourish/mattermost-plugin-seen/issues). Использовать synthetic data; credentials, реальные сообщения, viewers и production identifiers в публичные обращения не добавлять. Потенциальные уязвимости сообщать по [SECURITY.md](SECURITY.md).

## Лицензия и AI assistance

Исходники распространяются с [Apache-2.0](LICENSE), [NOTICE](NOTICE) и сторонними license notices. При распространении сохраняются применимые attribution и лицензии dependencies. Назначение лицензии само по себе не доказывает publication rights владельца.

Portions of this project were generated or refactored with assistance from OpenAI Codex.

Подробнее: [AI_DISCLOSURE.md](AI_DISCLOSURE.md). AI assistance не заменяет проверку кода, тесты и решение о релизе.
