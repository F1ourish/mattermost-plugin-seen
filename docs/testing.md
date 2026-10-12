# Тестирование и критерии приёмки

Пакет 1.1.2, дата 12.10.2026. Различать CI/unit/mock проверки и live acceptance. Состояние кандидата - [release-readiness](release-readiness.md); фактический прогон привязывать к Actions run, commit и SHA256. [Отчёт 1.1.1](release-readiness-1.1.1.md) сохраняет исторические результаты.

## Локальные команды

Выполнять в корне исходников на Linux, Go 1.26.9, Node 24.19.0, npm 11.9.0, Python 3, make и C compiler для race. Зависимости скачиваются из Go/npm registries; для offline build нужен заранее подготовленный проверенный cache и закреплённый compiler.

```sh
npm --prefix webapp ci --ignore-scripts
make test
make check
npm --prefix webapp run format:check
npm --prefix webapp audit
npm --prefix webapp run build
webapp/node_modules/.bin/playwright install --with-deps chromium
node scripts/browser-smoke.mjs
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 -show verbose ./server
```

Назначение: unit/race/типизация/lint, dependency scan, browser mock. Ожидается exit 0; govulncheck читать полностью, включая module-only findings. В локальном прогоне используется явно заданный Chromium через CHROMIUM_PATH. Не подавлять ошибки сканера ради зелёного CI.

`make dist` повторяет основные проверки и собирает Linux amd64/arm64 tar.gz. После сборки выполнить `make security-check`: module integrity, source scan, npm audit и binary scan обоих файлов непосредственно из архива. Для 1.1.2 дополнительно выполнить `python3 .github/release/check_package.py`: проверка manifest, docs/links, executable bits и совпадения runtime hashes с проверенным 1.1.1; отчёт создаётся в dist. Если распаковщик ZIP утратил executable bit scripts/build.sh или scripts/security-check.sh, восстановить `chmod +x scripts/build.sh scripts/security-check.sh`; при первом git commit проверить сохранение mode 100755. Скрипты в исходном ZIP имеют этот mode.

## На тестовом Mattermost

Применить [приёмочную матрицу T01-T35](acceptance-1.0.2.md) к 1.1.2: заменить только имя установочного архива/файла сумм и записать фактическую версию. Матрица сохраняется как исходный исторический документ; в `results.csv` все сценарии пока NOT RUN. Успешный пользовательский smoke ранее не заменяет подписанный полный протокол этой версии.

Дополнительно проверить SVG: серые/голубые штрихи, расстояние между ними, DM и group counter, zoom 100/125/150%, обе темы, hover/keyboard labels. Проверить сегодняшнее, вчерашнее и более раннее время в выбранной timezone. Preview: 0/1/5/6/70 viewers, count и Show all; полный список: scroll/load, фиксированная шапка и возврат фокуса.

Обязательные gates для stable:

1. A/B/C с отдельными сессиями: автор, viewer, outsider. Успешное штатное поведение; повторный receipt без изменения времени/count.
2. Неаутентифицированный запрос, подставленный Mattermost-User-ID, чужой user_id в body, чужой post_id, бывший участник, неавторские summaries/viewers, cookie CSRF через gateway. Нельзя считать прямой handler unit test доказательством gateway sanitization.
3. Повторная запись/удаление одновременно, restart, сбой KV и возврат доступности. Нет нового receipt после успешного tombstone.
4. Retention/public config reload, expiry и сохранение валидной конфигурации при неверном вводе. Не менять системное время и не править БД ради теста.
5. Если заявляется HA: write app1/read app2, concurrent writes, потеря app1, WebSocket/reconnect и одинаковая версия/config на нодах. Single-node PASS не означает HA PASS.
6. Нагрузка с согласованным ожидаемым числом клиентов/viewers. До теста записать baseline latency/CPU/DB и допустимую деградацию, после - p95/error/429 и память после длительного scrolling/unmount. Численные SLO проектом пока не определены, не выдумывать пороги.

У каждого результата: версия/hash пакета, Mattermost build, топология, сценарий, дата/тестер, expected/actual, PASS/FAIL/BLOCKED/NOT RUN/N/A, обезличенное evidence. При FAIL доступа/данных остановить продвижение в production.
