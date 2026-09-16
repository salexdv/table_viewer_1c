# Specification-Driven Development

Каталог является источником истины для видимого поведения, публичных функций, событий 1С и формата доставки.

## Процесс

1. Создать `specs/<id>/spec.md` и `specs/<id>/plan.md` со статусом `draft`.
2. Согласовать контракт и перевести его в `approved`.
3. Перед началом реализации установить `in-progress`.
4. Обновлять спецификацию в том же изменении, если реализация отклонилась от контракта.
5. После реализации и проверки установить `done` и перенести каталог в `specs/done/<id>/`.

Спецификация обязательна для новых функций, изменения поведения, публичного API, событий, формата сборки и
изменений, затрагивающих несколько модулей. Для опечаток, локальных багфиксов и рефакторинга без изменения
поведения новая спецификация не требуется.

Правила адаптированы из процесса SDD проекта
[bsl_console](https://github.com/salexdv/bsl_console/blob/webpack/specs/README.md).

## Завершённые спецификации

- [`table-viewer`](done/table-viewer/spec.md) — автономный просмотрщик таблиц и деревьев для 1С.
- [`npm-package-manager`](done/npm-package-manager/spec.md) — установка, сборка и проверки проекта через npm.
- [`table-viewer-controls`](done/table-viewer-controls/spec.md) — агрегаты, фильтры значений, диапазоны и ширины колонок.
- [`table-viewer-layout-performance`](done/table-viewer-layout-performance/spec.md) — компактные команды,
  адаптивная компоновка и переиспользуемая виртуализация.
- [`optional-column-aggregates`](done/optional-column-aggregates/spec.md) — отключаемые по умолчанию итоги колонок
  и условный подвал таблицы.
- [`compact-scrollbars`](done/compact-scrollbars/spec.md) — компактные полосы прокрутки страницы и таблиц.
- [`auto-hide-scrollbars`](done/auto-hide-scrollbars/spec.md) — показ полос прокрутки при наведении или прокрутке.
- [`custom-context-menu-events`](done/custom-context-menu-events/spec.md) — пользовательские команды контекстного
  меню с передачей значения ячейки в событиях 1С.
- [`context-menu-groups`](done/context-menu-groups/spec.md) — группы и подменю контекстного меню, скрытие строк и
  уровни дерева.
- [`toolbar-selection-aggregates`](done/toolbar-selection-aggregates/spec.md) — группы общей панели, увеличенные
  команды дерева, правое выравнивание чисел и popup агрегатов выделения.
- [`search-highlighting-and-clear`](done/search-highlighting-and-clear/spec.md) — поиск по упорядоченным фрагментам,
  подсветка совпадений и совместимые с WebKit 1С кнопки очистки.
- [`view-settings-api`](done/view-settings-api/spec.md) — JSON/API сохранения и восстановления масштаба,
  порядка и параметров колонок и всех фильтров.
- [`cell-display-customization`](done/cell-display-customization/spec.md) — настройка представления и цвета точных
  значений, отрицательных чисел и пустых ссылок.
