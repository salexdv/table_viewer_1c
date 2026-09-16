---
issue: -
title: SemVer-релизы с HTML и EPF
status: done
owner: salexdv
created: 2026-09-16
updated: 2026-09-16
area:
  - сборка
  - доставка
  - документация
---

# semantic-github-releases: SemVer-релизы с HTML и EPF

## 1. Контекст и проблема

В проекте ещё нет версий, тегов и GitHub Releases. Существующий workflow умеет приложить автономный HTML к
уже опубликованному релизу, но не определяет версию и не создаёт релиз. Тестовая обработка
`tests/TestTableViewer.epf` хранится только локально из-за общего правила `.gitignore`, поэтому недоступна на
GitHub-hosted runner.

Первый релиз должен иметь версию `1.0.0`. Последующие версии и release notes должны формироваться из
Conventional Commits, а каждый релиз должен содержать автономный HTML и тестовую обработку 1С из того же
релизного коммита.

## 2. Область изменений

Добавляются manifest-конфигурация Release Please, автоматическое создание Release PR и публикация двух
релизных assets. `TestTableViewer.epf` становится отслеживаемым бинарным файлом. README описывает правила
версий и процесс выпуска.

Публичный JavaScript API, события 1С, логика просмотрщика и локальный контракт `npm run build` не меняются.

## 3. Поведение

### 3.1. Основной сценарий

1. Push в `master` запускает Release Please для корневого Node.js-проекта.
2. Release Please создаёт или обновляет Release PR с `CHANGELOG.md`, версией в `package.json` и
   `package-lock.json`, а также текущей версией в manifest.
3. `fix:` повышает patch, `feat:` повышает minor, а `!` или `BREAKING CHANGE:` повышает major.
4. Первый Release PR принудительно получает версию `1.0.0` через одноразовый commit footer
   `Release-As: 1.0.0`; последующие версии вычисляются только из Conventional Commits.
5. Слияние Release PR создаёт опубликованный GitHub Release и тег `vX.Y.Z`.
6. В том же workflow по SHA созданного релиза выполняются `npm ci` и `npm run build`, затем к релизу с
   заменой одноимённых файлов прикладываются `table_viewer.html` и `TestTableViewer.epf`.
7. Ручной запуск создаёт отдельные Actions Artifacts `table_viewer-html` и `test-table-viewer-epf`, но не
   изменяет релизы.
8. Вручную опубликованный GitHub Release также получает оба assets через событие `release.published`.

### 3.2. Граничные случаи и ошибки

- Отсутствующий или пустой `tests/TestTableViewer.epf` завершает публикацию с ошибкой.
- Ошибка установки зависимостей, сборки или загрузки любого asset завершает workflow с ошибкой.
- Повторный запуск заменяет одноимённые assets и не создаёт дубликаты.
- Release job не запускает сборку при обычном push, если Release Please не создал релиз.
- Для GitHub API используется встроенный `github.token`; внешние секреты не требуются.
- История до первого релиза не ограничивается `bootstrap-sha`, поэтому в первый changelog входят все
  распознанные пользовательские изменения репозитория.

## 4. Публичные контракты

- Теги релизов имеют формат `vX.Y.Z`.
- Каждый успешно обработанный GitHub Release содержит `table_viewer.html` и `TestTableViewer.epf`.
- Ручной запуск сохраняет эти файлы в отдельных Actions Artifacts.
- `TestTableViewer.epf` отслеживается Git как бинарный файл и обновляется до формирования Release PR.
- Production-контракт остаётся прежним: `npm run build` создаёт автономный `dist/index.html`.

## 5. Критерии приёмки

- [x] Release Please запускается на push в `master` и использует manifest-конфигурацию Node.js-проекта.
- [x] Первый Release PR предлагает `1.0.0`, формирует ретроспективный changelog и использует тег `v1.0.0`.
- [x] Последующие версии соответствуют Conventional Commits и SemVer.
- [x] Release Please обновляет `CHANGELOG.md`, `package.json`, `package-lock.json` и manifest.
- [x] Созданный Release получает HTML и EPF из релизного SHA.
- [x] Ручной запуск публикует два отдельных Actions Artifacts и не изменяет релизы.
- [x] Вручную опубликованный Release получает оба assets.
- [x] EPF отслеживается Git, помечен как binary и проверяется перед публикацией.
- [x] README описывает Conventional Commits, Release PR и оба релизных файла.
- [x] Полный локальный гейт проходит.

## 6. Вне области

- Публикация npm-пакета, предрелизы и автоматическое слияние Release PR.
- Commitlint или блокирующая CI-проверка сообщений коммитов.
- Git LFS, сборка EPF средствами 1С, checksum-файлы и архивы.
- Изменение содержимого EPF, логики просмотрщика, публичного JavaScript API или событий 1С.
