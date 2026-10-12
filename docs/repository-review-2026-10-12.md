# Проверка оформления GitHub — 12.10.2026

Статус: публичные исходники оформлены, draft 1.1.1 подготовлен; stable/live acceptance не подтверждена. Проверяется `F1ourish/mattermost-plugin-seen`. Это проверка репозитория и документационных изменений, не новый пентест плагина.

## Подтверждено

| Пункт | Результат |
|---|---|
| About и topics | Описание заполнено, 10 topics соответствуют проекту |
| Visibility / default branch | Public / main |
| LICENSE / NOTICE | Apache-2.0 распознана GitHub; attribution и third-party notices сохранены |
| README | English и русский README, переключатель языков, ссылки на CI/лицензию/документацию |
| SECURITY / CONTRIBUTING / AI disclosure / CHANGELOG / PR template | Есть; исправлен устаревший текст о ещё не опубликованном repository |
| Исходники | Runtime source и plugin ID сохраняются; node_modules, binaries, screenshots и рабочие logs в Git tree отсутствуют |
| CI проверенного кандидата | [Run 38217411229](https://github.com/F1ourish/mattermost-plugin-seen/actions/runs/38217411229) PASS: build, browser smoke и security gate |
| Draft release | v1.1.1, draft=true, prerelease=true; target `82bdcdc952767cdb017ab55720a123b8e96f7cd6` |
| Assets draft | Install tar.gz, source ZIP из указанного commit и SHA256SUMS; package digest совпадает с проверенным 1.1.1 |
| main protection / rulesets | main не защищена; repository rulesets API вернул пустой список |
| Private vulnerability reporting | Включение не удалось подтвердить доступным интерфейсом; отсутствие подтверждения не равно disabled |

SHA256 install-архива draft: `2ffd56064bf65d9969e6aa6d96533f5deb274e78e73a5e2336cf4aa46233e9ea`.

## Исправления оформления

Добавлен [README.ru.md](../README.ru.md) и переключатель языков, обновлены README/SECURITY/CONTRIBUTING и оглавление/процесс выпуска. Будущие сборки включают русский README, поэтому языковой link остаётся рабочим и в install bundle.

Release helper сохраняет уже подготовленный draft на его commit: последующее изменение документации в main не должно проваливать CI и не перезаписывает assets. При повторе того же release commit существующие assets проверяются; для другого пакета нужна новая patch-версия. Ни version 1.1.1, ни backend/frontend runtime этим изменением не переименовываются.

Архив текущего draft остаётся прежним и содержит документацию release commit. Новые README в main доступны на GitHub; чтобы включить их в новый опубликованный install-пакет, подготовить следующую patch-версию с новыми SHA256. Не менять файл 1.1.1 под существующей суммой.

## Что настроить владельцу

1. Включить GitHub Private vulnerability reporting и проверить доступность Security → Advisories → Report a vulnerability. [Официальная инструкция](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
2. Защитить main через Settings → Rules → Rulesets: запретить force push/удаление, требовать PR и успешный check build. Для единственного maintainer не требовать недостижимый review от второго человека. [Официальная инструкция](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).
3. Проверить доступные Dependency alerts/secret scanning/push protection в настройках аккаунта/repository. Их enablement в этой проверке не подтверждалось.
4. Перед stable support выполнить live T01–T35; HA/failover/load — отдельно при заявлении HA. Невыполненные сценарии остаются NOT RUN.

Доступная GitHub-интеграция предоставляет операции для кода и CI, но не операции изменения repository administration settings. Эти пункты не отмечаются выполненными по содержимому SECURITY.md или наличию CI.

## Границы проверки

Метаданные About/topics/license, main, rulesets, commit tree, CI и release assets прочитаны через GitHub API. Прочитана main history из трёх commits на начало проверки; исторический CSV newline fix не меняет receipt runtime. Private-reporting webpage не удалось получить. Политика организации, реальные publication rights, backup erasure и deployment не проверены.

Link validation, проверка release-helper preservation и следующий GitHub CI при изменении оформляются как проверки текущего документационного commit; прежний PASS кандидата не выдаётся за новый запуск. Результат текущего CI доступен через badge в README и Actions.

[Русский README](../README.ru.md) · [README](../README.md) · [Процесс выпуска](release-process.md).
