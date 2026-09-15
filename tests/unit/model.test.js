const assert = require('chai').assert;
const model = require('../../src/model');

function tableData(rows, columns) {
  return { tables: [{ name: 'Тест', columns: columns || ['Значение'], rows: rows }] };
}

describe('модель данных', function () {
  it('разбирает корректный JSON и определяет дерево', function () {
    const data = model.parseData(JSON.stringify(tableData([
      { columns: ['Корень'], children: [{ columns: ['Лист'], children: [] }] }
    ])));
    assert.isTrue(data.tables[0].isTree);
    assert.equal(data.tables[0].nodeCount, 2);
    assert.equal(data.tables[0].rows[0].children[0].id, '0.0');
  });

  it('обрабатывает глубокое дерево без рекурсии', function () {
    let row = { columns: ['Последний'], children: [] };
    for (let index = 0; index < 2500; index += 1) row = { columns: ['Уровень ' + index], children: [row] };
    const data = model.parseData(tableData([row]));
    const state = model.makeTableState(data.tables[0]);
    assert.equal(data.tables[0].nodeCount, 2501);
    assert.equal(model.buildVisibleRows(data.tables[0], state, '').length, 2501);
  });

  it('сообщает точный путь ошибки JSON и структуры', function () {
    assert.throws(function () { model.parseData('{"tables":[],}'); }, '$: не удалось разобрать JSON');
    assert.throws(function () {
      model.parseData({ tables: [{ name: 'T', columns: ['A', 'B'], rows: [{ columns: ['x'] }] }] });
    }, '$.tables[0].rows[0].columns: ожидалось 2 ячеек');
    assert.throws(function () {
      model.parseData(tableData([{ columns: [{ label: 'x' }] }]));
    }, '$.tables[0].rows[0].columns[0]');
  });

  it('распознаёт числа, проценты и ведущие нули', function () {
    assert.deepEqual(model.parseNumeric('1 234,56'), { kind: 'number', value: 1234.56 });
    assert.deepEqual(model.parseNumeric('-12.5'), { kind: 'number', value: -12.5 });
    assert.deepEqual(model.parseNumeric('20%'), { kind: 'percent', value: 20 });
    assert.isNull(model.parseNumeric('000394'));
    assert.isNull(model.parseNumeric('1,234.56'));
  });

  it('распознаёт только корректные даты', function () {
    assert.isNumber(model.parseDate('06.09.2026 14:18:01'));
    assert.isNumber(model.parseDate('29.02.2024'));
    assert.isNull(model.parseDate('31.02.2026'));
    assert.isNull(model.parseDate('06.09.2026; документ'));
  });

  it('определяет типы колонок по всему дереву', function () {
    const data = model.parseData(tableData([
      { columns: ['1 200,5', '20%', '01.02.2026', '000001'] },
      { columns: ['2', '10%', '31.01.2026', '000002'] }
    ], ['Число', 'Процент', 'Дата', 'Код']));
    assert.deepEqual(data.tables[0].columnTypes, ['number', 'percent', 'date', 'text']);
  });

  it('по умолчанию отключает итоги всех колонок', function () {
    const data = model.parseData(tableData([
      { columns: ['Текст', '10', '20%'] }
    ], ['Текст', 'Число', 'Процент']));
    const state = model.makeTableState(data.tables[0]);
    assert.deepEqual(state.columnAggregates, ['none', 'none', 'none']);
  });

  it('сортирует соседей стабильно и перенумеровывает результат', function () {
    const data = model.parseData(tableData([
      { columns: ['10'], children: [{ columns: ['3'] }, { columns: ['1'] }] },
      { columns: ['2'] }
    ]));
    const state = model.makeTableState(data.tables[0]);
    state.sort = { column: 0, direction: 'asc' };
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.deepEqual(visible.map(function (item) { return item.number + ':' + item.row.columns[0]; }), ['1:2', '2:10', '2.1:1', '2.2:3']);
  });

  it('показывает совпавший узел и предков, но не соседей', function () {
    const data = model.parseData(tableData([
      { columns: ['Корень'], children: [{ columns: ['Найдено'] }, { columns: ['Сосед'] }] },
      { columns: ['Другой корень'] }
    ]));
    const state = model.makeTableState(data.tables[0]);
    const visible = model.buildVisibleRows(data.tables[0], state, 'найдено');
    assert.deepEqual(visible.map(function (item) { return item.row.columns[0]; }), ['Корень', 'Найдено']);
    assert.deepEqual(visible.map(function (item) { return item.number; }), ['1', '1.1']);
  });

  it('разбирает пробелы и ищет фрагменты по порядку внутри одной ячейки', function () {
    assert.deepEqual(model.parseSearchQuery('  УПРАВ\t  тор  '), ['управ', 'тор']);
    assert.isTrue(model.matchesSearch('1С:Управление торговлей 8', 'управ тор'));
    assert.isFalse(model.matchesSearch('Торговля и управление', 'управ тор'));
    assert.isTrue(model.matchesSearch('Управление управляемой торговлей', 'управ управ тор'));
    assert.isFalse(model.matchesSearch('Управление торговлей', 'управ управ'));
    assert.isFalse(model.matchesSearch('Управление торговлей', '   '));
  });

  it('не объединяет фрагменты глобального поиска из разных ячеек', function () {
    const data = model.parseData(tableData([
      { columns: ['Управление торговлей', 'Полное совпадение'] },
      { columns: ['Управление', 'Торговля'] },
      { columns: ['Торговля и управление', 'Обратный порядок'] }
    ], ['Название', 'Описание']));
    const state = model.makeTableState(data.tables[0]);
    const visible = model.buildVisibleRows(data.tables[0], state, 'УПРАВ   тор');
    assert.deepEqual(visible.map(function (item) { return item.row.columns[1]; }), ['Полное совпадение']);
  });

  it('применяет поиск по фрагментам к текстовому фильтру колонки', function () {
    const data = model.parseData(tableData([
      { columns: ['Управление торговлей'] },
      { columns: ['Торговля и управление'] }
    ]));
    const state = model.makeTableState(data.tables[0]);
    state.columnFilters[0] = 'управ тор';
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.deepEqual(visible.map(function (item) { return item.row.columns[0]; }), ['Управление торговлей']);
  });

  it('возвращает объединённые диапазоны всех вхождений только для полного совпадения', function () {
    assert.deepEqual(model.findSearchHighlightRanges('Управление торговлей: управление', ['управ тор', 'торг']), [
      { start: 0, end: 5 },
      { start: 11, end: 15 },
      { start: 22, end: 27 }
    ]);
    assert.deepEqual(model.findSearchHighlightRanges('Торговля и управление', 'управ тор'), []);
  });

  it('объединяет колонковые фильтры через AND и поддерживает точное сравнение', function () {
    const data = model.parseData(tableData([
      { columns: ['Москва', 'Склад 1'] },
      { columns: ['Москва', 'Склад 10'] },
      { columns: ['Казань', 'Склад 1'] }
    ], ['Город', 'Склад']));
    const state = model.makeTableState(data.tables[0]);
    state.columnFilters = ['моск', 'Склад 1'];
    state.exactFilters[1] = true;
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.equal(visible.length, 1);
    assert.equal(visible[0].row.columns[1], 'Склад 1');
  });

  it('объединяет выбранные значения через OR, а с текстовым фильтром — через AND', function () {
    const data = model.parseData(tableData([
      { columns: ['Москва', 'Основной'] },
      { columns: ['Казань', 'Основной'] },
      { columns: ['Москва', 'Резервный'] }
    ], ['Город', 'Склад']));
    const state = model.makeTableState(data.tables[0]);
    state.columnFilters[1] = 'основ';
    state.valueFilters[0] = Object.create(null);
    state.valueFilters[0].Москва = true;
    state.valueFilters[0].Казань = true;
    let visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.deepEqual(visible.map(function (item) { return item.row.columns[0]; }), ['Москва', 'Казань']);
    state.valueFilters[0] = Object.create(null);
    visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.equal(visible.length, 0);
  });

  it('строит доступные значения без собственных фильтров колонки', function () {
    const data = model.parseData(tableData([
      { columns: ['Москва', 'Основной'] },
      { columns: ['Казань', 'Основной'] },
      { columns: ['Тула', 'Резервный'] },
      { columns: [null, 'Основной'] },
      { columns: [true, 'Основной'] },
      { columns: [{ label: 'Москва', ref: 'ref' }, 'Основной'] }
    ], ['Город', 'Склад']));
    const state = model.makeTableState(data.tables[0]);
    state.columnFilters[0] = 'моск';
    state.columnFilters[1] = 'основ';
    state.valueFilters[0] = Object.create(null);
    state.valueFilters[0].Москва = true;
    const values = model.getAvailableValues(data.tables[0], state, '', 0);
    assert.deepEqual(values, [
      { value: 'Да', label: 'Да' },
      { value: 'Казань', label: 'Казань' },
      { value: 'Москва', label: 'Москва' },
      { value: '', label: '(Пустые)' }
    ]);
  });

  it('исключает свёрнутых потомков из итогов', function () {
    const data = model.parseData(tableData([
      { columns: ['10'], children: [{ columns: ['20'] }] },
      { columns: ['5'] }
    ]));
    const state = model.makeTableState(data.tables[0]);
    state.collapsedRows['0'] = true;
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    assert.deepEqual(model.calculateTotals(data.tables[0], visible), [15]);
  });

  it('суммирует числовые ячейки прямоугольного выделения', function () {
    const data = model.parseData(tableData([
      { columns: ['1', '20%', 'текст'] },
      { columns: ['2', '10%', '3'] }
    ], ['Число', 'Процент', 'Смешанная']));
    const state = model.makeTableState(data.tables[0]);
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    const total = model.calculateSelectionSum(data.tables[0], visible, {
      startRow: 0, endRow: 1, startColumn: 0, endColumn: 2
    }, [0, 1, 2]);
    assert.deepEqual(total, { count: 4, sum: 33 });
  });

  it('считает все агрегаты выделения одним пакетом', function () {
    const data = model.parseData(tableData([
      { columns: ['1', '20%', 'текст'] },
      { columns: ['2', '10%', '3'] }
    ], ['Число', 'Процент', 'Смешанная']));
    const state = model.makeTableState(data.tables[0]);
    const visible = model.buildVisibleRows(data.tables[0], state, '');
    const aggregates = model.calculateSelectionAggregates(data.tables[0], visible, {
      startRow: 0, endRow: 1, startColumn: 0, endColumn: 2
    }, [0, 1, 2]);
    assert.deepEqual(aggregates, {
      count: 4,
      kind: 'number',
      results: { sum: 33, average: 8.25, min: 1, max: 20, count: 4 }
    });
    assert.deepEqual(model.calculateSelectionAggregates(data.tables[0], visible, null, [0, 1, 2]), {
      count: 0,
      kind: 'number',
      results: { sum: 0, average: null, min: null, max: null, count: 0 }
    });
  });

  it('считает пять агрегатов и различает однородные проценты', function () {
    assert.deepEqual(model.calculateAggregate(['10', '20', null], 'sum'), { count: 2, value: 30, kind: 'number' });
    assert.deepEqual(model.calculateAggregate(['10', '20'], 'average'), { count: 2, value: 15, kind: 'number' });
    assert.deepEqual(model.calculateAggregate(['10', '20'], 'min'), { count: 2, value: 10, kind: 'number' });
    assert.deepEqual(model.calculateAggregate(['10', '20'], 'max'), { count: 2, value: 20, kind: 'number' });
    assert.deepEqual(model.calculateAggregate(['10', '20'], 'count'), { count: 2, value: 2, kind: 'number' });
    assert.deepEqual(model.calculateAggregate([], 'average'), { count: 0, value: null, kind: 'number' });
    assert.equal(model.calculateAggregate(['10%', '20%'], 'average').kind, 'percent');
    assert.equal(model.calculateAggregate(['10%', '20'], 'sum').kind, 'number');
  });

  it('применяет окно строк и возвращает размеры скрытых диапазонов', function () {
    const rows = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(model.applyRowWindow(rows, { start: 1, end: 3 }), {
      rows: ['b', 'c', 'd'], hiddenBefore: 1, hiddenAfter: 1
    });
    assert.deepEqual(model.applyRowWindow(rows, null), {
      rows: rows, hiddenBefore: 0, hiddenAfter: 0
    });
  });

  it('строит маркеры последовательных скрытых строк', function () {
    const rows = [
      { id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
    ];
    const projection = model.applyHiddenRows(rows, { '0': true, '2': true, '3': true, '5': true });
    assert.deepEqual(projection.rows.map(function (row) { return row.id; }), ['1', '4']);
    assert.deepEqual(projection.items.map(function (item) {
      return item.kind === 'row' ? 'row:' + item.row.id + ':' + item.visibleIndex : 'marker:' + item.ids.join(',');
    }), ['marker:0', 'row:1:0', 'marker:2,3', 'row:4:1', 'marker:5']);
  });

  it('рассчитывает глубину и свёрнутые ветви для уровня группировки без рекурсии', function () {
    let deep = { columns: ['Последний'], children: [] };
    for (let index = 0; index < 2500; index += 1) deep = { columns: ['Уровень ' + index], children: [deep] };
    const deepTable = model.parseData(tableData([deep])).tables[0];
    assert.equal(model.treeDepth(deepTable), 2501);

    const table = model.parseData(tableData([
      { columns: ['Корень'], children: [
        { columns: ['Ветка'], children: [{ columns: ['Лист'], children: [] }] },
        { columns: ['Короткая ветка'], children: [] }
      ] }
    ])).tables[0];
    assert.equal(model.treeDepth(table), 3);
    assert.deepEqual(model.collapsedRowsForLevel(table, 1), { '0': true, '0.0': true });
    assert.deepEqual(model.collapsedRowsForLevel(table, 2), { '0.0': true });
    assert.deepEqual(model.collapsedRowsForLevel(table, 3), {});
  });

  it('подбирает начальные ширины колонок по содержимому и глубине номера', function () {
    const data = model.parseData(tableData([
      { columns: ['Коротко'], children: [{ columns: ['Очень длинное содержимое ячейки для проверки ширины'] }] }
    ], ['Имя']));
    const state = model.makeTableState(data.tables[0]);
    assert.isAbove(state.widths[0], 300);
    assert.isAtMost(state.widths[0], 360);
    assert.isAbove(state.rowNumberWidth, 56);
  });
});
