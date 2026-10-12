# Подготовка GitHub и выпуск

Обновлено 12.10.2026. Текущий кандидат 1.1.2. Репозиторий `F1ourish/mattermost-plugin-seen` публичный. CI готовит неопубликованный draft pre-release exact успешного commit; deployment не выполняется. Прежний draft 1.1.1 на `82bdcdc952767cdb017ab55720a123b8e96f7cd6` и его assets сохраняются. Текущие настройки и ограничения перечислены в [проверке репозитория](repository-review-2026-10-12.md).

## Два разных решения

Исходники можно опубликовать как проект с экспериментальным статусом после проверки прав и приватности. Стабильный релиз для production требует дополнительно live security/functional acceptance и подтверждённых ограничений поддержки. Пакет 1.1.2 сохраняет исправления dependency findings из security patch 1.1.1; это не закрывает deployment-specific gates.

## Перед public visibility

- [ ] Подтвердить право публиковать код, в том числе созданный в рамках работы, и применимость выбранной Apache-2.0 лицензии. LICENSE уже есть; это не доказательство прав владельца.
- [ ] Взять подготовленный snapshot; не загружать всю рабочую папку с внутренними отчётами/снимками.
- [ ] Если публикуется существующая история, просканировать все branches/tags/history. В предоставленном source ZIP истории нет. Если это новый репозиторий из snapshot, проверить initial commit и любые добавленные файлы; не объявлять старую историю проверенной.
- [ ] Проверить LICENSE/NOTICE/third-party, README, privacy и SECURITY. Назначить реального maintainer и канал приватных сообщений. Не подставлять выдуманный email.
- [ ] Настроить private vulnerability reporting и проверить доступность Report a vulnerability. Включить доступные dependency/security alerts; права и доступность зависят от repository settings.
- [ ] Ограничить push в основную ветку, требовать PR/CI в выбранной политике репозитория. Read-only build и pinned Actions есть; Результат exact run проверять в Actions, не переносить PASS предыдущей версии на новый commit. Защита main и rulesets на момент проверки не включены.

## Релиз

1. Подготовить кандидат из reviewed source snapshot/commit. Не заменять прежние assets; любое изменение вложенной документации также меняет checksum.
2. Запустить `make dist`, затем `make security-check` и browser smoke на чистом checkout. Сохранить commit SHA, если он существует, toolchain versions, logs, dependency results и SHA256. Build/CI используют Go 1.26.9 и govulncheck 1.9.0; security gate проверяет оба упакованных Linux binaries, исходники, module integrity и npm audit.
3. Проверить manifest ID/version, обе архитектуры, compiler/build info, актуальные README/SECURITY/CHANGELOG/AI disclosure, docs links и LICENSE/NOTICE/third-party. В 1.1.2 build включает актуальные русский/английский README и весь набор docs; прежний пункт о неполной упаковке 1.0.3 сохранён только в историческом отчёте. Отдельно проверить executable bits source ZIP и отсутствие screenshots/internal evidence/cache/node_modules.
4. Выполнить `python3 .github/release/check_package.py`; для 1.1.2 все три runtime hashes должны совпадать с проверенным 1.1.1. CI передаёт tar SHA256 из read-only build job в release job; helper повторно проверяет artifact из того же run. Приложить `release-validation-1.1.2.json`, source ZIP из exact commit и `SHA256SUMS-1.1.2-github.txt`. На exact binary выполнить live gate, записать результаты. Для unresolved HA явно не заявлять HA поддержку. Подготовить release notes с installation, upgrade/rollback и known limitations.
5. Выбрать версию по изменению: patch - совместимые исправления; minor - новые совместимые возможности; major - несовместимые изменения API/данных/конфигурации с migration plan. Ощущение «готовности» не требует нового major. Plugin ID сохранить.
6. После закрытия gates поставить tag на проверенный commit и приложить tar.gz, checksum, source snapshot/ссылку на commit, release notes и обезличенные результаты. При незакрытой stable-приёмке отметить GitHub release как pre-release и ограничения явно.
7. Не пересобирать и не перезаписывать существующий asset под тем же именем с другой суммой. Для изменений выдавать новый patch; документацию версионировать отдельно.

## Проверка секретов

На engineering workstation с установленным gitleaks в проверяемой source директории:

```sh
gitleaks dir . --redact
```

Для реального git checkout дополнительно:

```sh
gitleaks git . --redact --log-opts="--all"
```

Ожидание: exit 0 и отсутствие findings; любой finding разобрать, а не автоматически allowlist. Gitleaks не обнаруживает все внутренние домены/ID: дополнительно выполнить ручную проверку текстов, screenshots, logs, release assets и имён файлов. Не удалять attribution/email из сторонних лицензий только ради отсутствия символа @.

Module-only GO-2026-5932 не подавлять глобальной allowlist: OpenPGP не входит в compiled dependency list. Сопоставлять source scan, binary symbols и результаты конкретного package checksum; после новых зависимостей переснять оценку. Binaries без symbol table могут давать консервативные module fallback findings, поэтому 1.1.1 сохраняет symbols для анализа.

Исходники опубликованы; draft не опубликован как GitHub release и deployment не выполнен. Assets кандидата остаются привязаны к проверенному commit. Последующие изменения документации в main не перезаписывают их; для нового install-пакета назначить следующий patch и новые суммы.
