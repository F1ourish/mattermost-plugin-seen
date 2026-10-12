# Готовность Seen 1.0.3 к GitHub

Дата: 01.10.2026. Версия отчёта: 1. Статус: reviewed locally; release approval pending.

## Краткий вывод

**Проект близок к публикации исходников с явно обозначенными ограничениями; стабильный production-релиз пока не подтверждён.** Крупный рефакторинг перед публикацией не требуется. Сначала закрыть публикационные права/приватность и прогнать реальную security/functional приёмку. HA можно оставить неподдерживаемым до отдельного подтверждения.

| Решение | Статус |
|---|---|
| Локальное качество 1.0.3 | Проверки ниже прошли |
| Public source / экспериментальный проект | Условно готов после прав, privacy/history и repository setup |
| Stable single-node release | Не готов к безусловной рекомендации: live gateway/functional gates не закрыты |
| HA production support | Не подтверждено; нужен app1/app2 прогон |
| Публикация GitHub / deployment | В этой работе не выполнялись |

## Объём и доказательства

Оценены восстановленные исходники 1.0.3, а не оставшаяся рабочая копия 1.0.2. Исходный ZIP SHA256: `83856f33e10d52ffb2918bda91fa26105d2383243b11c9d16470347613b68b3d`. Backend совпадает с 1.0.2. Прочитаны ключевые backend/frontend модули, manifest, build/CI, лицензии и прежние build/browser протоколы. Это targeted architecture/security readiness review, не внешний пентест.

Реальные Mattermost, production logs, GitHub settings, полная git history и фактические права на код не предоставлены. В source ZIP нет .git. Все 35 live-сценариев results.csv по-прежнему NOT RUN; имеющееся сообщение об успешном пользовательском тесте не приравнивается к выполнению всей матрицы.

## Проверки от 01.10.2026

| Проверка | Результат / границы |
|---|---|
| npm ci по lockfile | PASS |
| version consistency | PASS, 1.0.3, ID неизменен |
| Frontend unit | PASS, 23 теста |
| TypeScript / ESLint / Prettier | PASS |
| Web bundle build | PASS |
| go test -race ./server | PASS |
| go vet ./server | PASS |
| Browser smoke | PASS, mock host + Chromium; не live Mattermost |
| npm audit | 0 findings на момент проверки |
| govulncheck 1.8.0 | 0 reachable, 0 imported-package findings; 1 module-only |
| Gitleaks 8.24.3, source snapshot | PASS, no leaks found; не проверка истории |
| Маркеры внутренних данных | Известные внутренние домены/private IP не найдены; 1 synthetic email и 4 строки лицензий разобраны |
| Git history scan | NOT RUN: история отсутствует |
| Live gateway / CSRF / HA / load | NOT RUN |

Module-only finding: GO-2026-5932 относится к unmaintained `golang.org/x/crypto/openpgp`; модуль x/crypto 0.56.0 присутствует, импортируемый код не затронут согласно текущему scan. Это не доказательство «все зависимости безопасны» и не основание игнорировать будущие findings. Скан переснять на релизном commit.

Прежняя полная сборка 1.0.3 имеет сохранённый build log с exit=0. Сейчас выполнены свежие component checks; новый install tar.gz не выпускался. Новый документационный snapshot не имеет того же checksum, что старый source archive, хотя runtime source и lockfiles не изменены.

## Critical / High

Новых подтверждённых Critical/High проблем в просмотренном коде не выявлено. Это ограниченный результат code review, а не гарантия отсутствия таких дефектов. Неизвестные live gateway/CSRF результаты нельзя отмечать PASS по коду plugin handler.

## Medium

| ID | Проблема | Impact | Fix / проверка | Блокер public release |
|---|---|---|---|---|
| M1 | Нет live gateway/authz/CSRF протокола | Нельзя подтвердить границу доверия identity header и cookie requests на deployment | A/B/C, spoof header, user_id body, non-author/outsider, CSRF через реальный gateway | Да для stable binary; source допустим с experimental status |
| M2 | Нет app1/app2/failover/load evidence | Неподтверждённые обещания HA/масштабирования; CAS contention/локальные quotas | Совместный KV, cross-node writes/reads, failover, WebSocket, нагрузочный baseline | Для HA support; не для ограниченного single-node source |
| M3 | Cleanup после ошибки KV не гарантирован; user/channel erasure отсутствует | Retention и удаление не равны полной очистке активности | Описать ограничения, операционный erasure процесс; затем durable retry workflow | Если обещана гарантированная очистка — да; иначе известное ограничение |
| M4 | Публикационные права и git history неизвестны | Возможная публикация чужих/внутренних материалов | Подтверждение владельца; scan фактических branches/tags и assets | Да до public visibility |
| M5 | Авторизация per-post + full-document KV + full-list sort | При росте трафика CPU/DB и задержки; до 100 страниц refresh | Нагрузочный тест, метрики, оптимизация только по измерениям | Для обещаний масштаба; не абсолютный source blocker |

## Low

| ID | Проблема | Impact | Fix / проверка | Блокер |
|---|---|---|---|---|
| L1 | Inline adapter зависит от DOM 11.10 | Галочки могут вернуться в footer/сместиться после host upgrade | Матрица layouts и target-version regression | Для заявленной неподтверждённой совместимости |
| L2 | Build копирует docs 1.0.2 и ограниченный набор файлов | Новые relative links README/SECURITY не попадут полностью в install bundle | Следующий patch: упаковка актуального docs set + link validation | Да для следующего бинарника с этой документацией; старый бинарник не заменён |
| L3 | Реальный private reporting/maintainer не настроен в ходе работы | Пользователь не знает куда приватно сообщить security issue | Настроить GitHub private reporting и проверить кнопку | Перед public release |
| L4 | Сроки backup/логов и supported-version policy не определены | Неясные privacy/support ожидания | Описать операторскую политику и подтверждённую support matrix | Не обещать SLA/LTS до решения |
| L5 | Licence inventory копирует notice.go/notice_test.go по prefix | Лишние файлы сторонней библиотеки в notices | Уточнить allowlist лицензий при packaging patch, сохранить attribution | Нет |

## Nice-to-have

SBOM/provenance/signatures, EN-версия эксплуатационных документов, bug/feature templates, долговременный memory test, метрики с низкой кардинальностью. Не задерживать source publication только ради этих пунктов.

## Подтверждённые механизмы

- Все endpoints используют gateway identity и активный non-bot account; batch принимает только post_ids, сервер не берёт client user_id.
- Native post/channel membership/read checks; summaries/viewers author-only. Нет прямого SQL/system schema changes.
- CAS, map user→timestamp, автор исключается; повтор сохраняет timestamp. Tombstone закрывает deletion race после успешного write, при совместимых writers.
- React text rendering профилей; JSON/no-store/nosniff; reviewed plugin logs не печатают viewers/message content.
- Критичные подтверждённые receipts в KV; process memory содержит временное клиентское/ограничительное состояние. Это не равно доказанной real-cluster HA.

## Минимальный план

1. Владелец подтверждает publication rights и состав snapshot; проверяется фактическая история, если она публикуется.
2. Выполнить обязательную live single-node приёмку 1.0.3, включая gateway negatives и повтор/удаление/retention. Заполнить results.csv.
3. До нового бинарного релиза исправить packaging документации, назначить новый patch и прогнать clean CI. Не менять содержимое старого 1.0.3 asset.
4. Настроить public repo/private security channel, приложить SHA/результаты/ограничения. Пока stable gates не закрыты — source/experimental или pre-release, без production-ready обещаний.
5. HA/load и расширенную очистку вести отдельными задачами; поддержку HA объявить после evidence.

[Источники](sources.md) · [Процесс публикации](release-process.md) · [Тестирование](testing.md).
