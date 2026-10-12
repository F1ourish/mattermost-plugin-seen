# Seen 1.1.2 - документация и упаковка

Дата: 12.10.2026. Статус: кандидат для тестового Mattermost, draft pre-release. Plugin ID: `ru.internal.mattermost.seen`.

## Изменения

В install-архив включены актуальные русский и английский README, обычные дефисы в README, документация установки/проверок и отдельные release notes. Отчёт 1.1.1 сохранён как [исторический](release-readiness-1.1.1.md).

CI проверяет ID/version, безопасные пути архива, executable permissions, совпадение вложенной документации с commit и относительные Markdown-ссылки. SHA256 обоих Linux binaries и web bundle должны совпасть с проверенным 1.1.1. Draft helper повторно проверяет полученный artifact и его сумму из успешного read-only build job; прежние release assets не заменяются.

Backend/frontend runtime source, зависимости, receipt API/KV format, дедупликация, первый timestamp и viewport rules сохранены из 1.1.1. Исправления Go/x/net описаны в [security patch notes](release-1.1.1.md). Изменение совместимо и не требует major или системной DB migration.

## Комплект

| Файл | Назначение |
|---|---|
| `ru.internal.mattermost.seen-1.1.2.tar.gz` | Установка через управление плагинами; Linux amd64 и arm64 |
| `mattermost-seen-source-1.1.2-github.zip` | Исходники exact release commit; не установочный пакет |
| `release-validation-1.1.2.json` | Package checks, commit/run ID и runtime hashes |
| `SHA256SUMS-1.1.2-github.txt` | SHA256 трёх файлов выше |

Draft доступен владельцу репозитория; публичное скачивание доступно после публикации. Контрольные суммы подтверждают целостность относительно доверенного комплекта, а не независимую подпись автора.

## Установка и проверка

Область: Mattermost 11.10.x, Linux amd64/arm64, Web/Desktop. До изменения записать server build, топологию, plugin version и настройки; проверить штатные login/messages/native profiles. Сохранить предыдущий проверенный пакет и подтвердить backup по ранбуку контура. Согласовать окно отсутствия функций Seen.

На Linux-машине рядом со всеми тремя assets и файлом сумм:

```sh
sha256sum -c SHA256SUMS-1.1.2-github.txt
```

Ожидается три строки `OK`, exit 0. Если скачан только tar.gz, сверить именно его SHA256 со строкой файла сумм; полный check иначе сообщит об отсутствующих assets.

1. Отключить Seen через System Console; при нескольких app-нодах согласовать обновление всех нод. Не смешивать writers 1.0.0 и tombstone-aware версии.
2. Загрузить install tar.gz как обновление того же plugin ID. Проверить отображаемую 1.1.2 и отсутствие upload/activation errors; при неясном результате сверить список плагинов и логи по времени операции.
3. Проверить сохранение `RetentionDays` и `EnablePublic`, включить плагин и reload Web/Desktop clients. Подтвердить одинаковую версию на всех задействованных нодах.
4. Пройти [приёмку T01-T35](acceptance-1.0.2.md) по [инструкции тестирования](testing.md), записать exact hash, сервер, topology/date/tester и фактические результаты. Невыполненное оставить NOT RUN/BLOCKED.

Минимальный smoke: A автор, B viewer, C outsider; список доступен только A с текущим read access. Повтор B не меняет count/первое время, автор не считается viewer. Проверить Сегодня/Вчера/дату, preview 0/5/6, Show all/scroll, обе темы, клавиатуру/ESC/outside/focus и сохранение настроек. Затем выполнить gateway authz/IDOR/spoofing/CSRF negatives. Unit и mock browser не заменяют эти live-проверки.

## Rollback и ограничения

При ошибках доступа, неверных viewers, массовых 5xx или деградации отключить Seen, reload clients и проверить обычные сообщения/login. Сохранить обезличенные симптомы, KV не удалять. Ранее проверенный пакет 1.1.1 сохраняет dependency fixes и совместим с текущим KV; возврат выполнять по согласованному окну с проверкой всех app-нод. Возврат к 1.1.0 возвращает найденные dependency advisories; 1.0.0 с writers нарушает tombstone-защиту.

Viewed означает попадание маркера в viewport, а не доказанное человеческое чтение. Offline очередь остаётся best effort/in-memory; expiry не удаляет backups. Live gateway, функциональная приёмка, HA и load не подтверждаются этим пакетом. Module-only GO-2026-5932 относится к неиспользуемому OpenPGP; он не считается исправленным. Private vulnerability reporting необходимо проверить перед публикацией.

Подробности: [эксплуатация](operations.md), [готовность](release-readiness.md), [security policy](../SECURITY.md).
