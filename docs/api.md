# Receipt API v1

Контракт проверен по `server/plugin.go` и `server/store.go` версии 1.0.3. Базовый путь: `<SiteURL>/plugins/ru.internal.mattermost.seen/api/v1`. Ниже относительные endpoints.

Все запросы проходят Mattermost gateway. Плагин использует установленный gateway `Mattermost-User-ID`, проверяет формат ID и активного non-bot пользователя через native API. Передача user_id в body не является способом выбора пользователя: неизвестные поля batch JSON отклоняются. Не выставлять plugin handler отдельным публичным сервисом. CSRF и подмена заголовка через реальный gateway проверяются интеграционными тестами, а не прямым вызовом handler.

| Endpoint | Запрос | Доступ | Ответ |
|---|---|---|---|
| POST `/receipts/batch` | `{"post_ids":["<post_id>"]}` | Участник с read permission; автор получает self | `results`: post ID → status |
| POST `/summaries` | Тот же batch | Только автор + текущее членство/read | `summaries`: post ID → state/count/saturated |
| GET `/viewers` | `post_id`, `offset=0`, `limit=50` | Только автор + текущее членство/read | viewers/count/state/next_offset/has_more/saturated/version |

`<post_id>` — placeholder: рабочий ID содержит 26 lowercase alphanumeric символов. POST требует application/json; максимум 8192 байт, 1–50 элементов до dedup, unknown fields/trailing JSON запрещены. `offset`: 0–5000, `limit`: 1–50. Пользователь, channel и post проверяются сервером; удалённые/system posts недоступны. Отключение public channels не отключает остальные типы каналов.

## Поля и состояния

Viewer: `{"user_id":"<user_id>","seen_at":<Unix milliseconds>}`. В ответе нет username/email/имени. `seen_at` — первая сохранённая серверная отметка, не last viewed и не присланное клиентом время.

Receipt status: `ok`, `self`, `unavailable`, `expired`, `capacity`, `retry`. `ok` включает повтор уже сохранённого receipt. HTTP 200 batch не означает успешную запись каждого ID — проверять results. Summary state: `tracked`, `expired`, `disabled`. Недоступные/неавторские IDs в summaries обычно отсутствуют; ошибка host API может завершить batch с 503.

Viewers возвращаются по `seen_at` ascending, затем `user_id`. `version` — hash содержимого, не номер релиза и не гарантированный snapshot на все страницы. Disabled-ответ не содержит version. Новые записи между страницами требуют клиентской согласованной перезагрузки/дедупликации. UI использует scroll; API остаётся постраничным.

## Ошибки

| Код | Значение |
|---|---|
| 400 | Неверный JSON, формат/количество IDs или query parameters |
| 401 | Нет допустимой gateway identity, пользователь удалён/бот |
| 404 | Неизвестный route либо недоступный post для viewers |
| 405 | Неподдерживаемый метод |
| 429 | Per-user budget либо concurrent slots исчерпаны; учитывать Retry-After |
| 503 | Временная ошибка host API/KV |

Проверки identity/limiter предшествуют routing, поэтому ошибочный route не всегда первым возвращает 404/405. Ошибки содержат только HTTP status text. Ответы: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

WebSocket: `custom_ru.internal.mattermost.seen_changed`, payload `post_ids`, адресат — автор, доступ которого перепроверен перед отправкой. Это сигнал обновить данные через API, не перенос списка viewers. При потере события клиент периодически обновляет видимые summaries/открытый список.
