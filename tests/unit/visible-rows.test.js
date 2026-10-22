const assert = require('chai').assert;
const model = require('../../src/model');

describe('снимок видимых строк', function () {
  it('сохраняет метаданные пустой таблицы и строки без видимых колонок', function () {
    const table = model.parseData({ tables: [{ id: 't', name: 'Таблица', columns: ['A'], rows: [{ columns: [1] }] }] }).tables[0];
    assert.deepEqual(model.getVisibleRows(table, 2, [], [0]), {
      table: { index: 2, id: 't', name: 'Таблица' }, columns: [{ index: 0, id: null, name: 'A' }], rows: []
    });
    const rows = model.buildVisibleRows(table, model.makeTableState(table), '');
    assert.deepEqual(model.getVisibleRows(table, 2, rows, []).rows,
      [{ number: '1', sourceNumber: '1', cells: [] }]);
  });

  it('копирует типы, ссылки и представления в порядке видимых колонок', function () {
    const values = ['<текст>', 10, true, null, { label: 'Ссылка', ref: 'ref' },
      { label: 'Открыть', table: { name: 'Вложенная', columns: [], rows: [] } }];
    const table = model.parseData({ tables: [{ name: 'Типы', columns: values.map(function () { return 'Дубль'; }),
      rows: [{ columns: values }] }] }).tables[0];
    const rows = model.buildVisibleRows(table, model.makeTableState(table), '');
    const display = model.makeDisplaySettings();
    model.setScalarRule(display.presentations, 10, 'Десять');
    const columns = [5, 4, 3, 2, 1, 0];
    const result = model.getVisibleRows(table, 0, rows, columns, display);
    assert.deepEqual(result.columns.map(function (column) { return column.index; }), columns);
    assert.deepEqual(result.rows[0].cells, [
      { value: { label: 'Открыть' }, text: 'Открыть' }, { value: { label: 'Ссылка', ref: 'ref' }, text: 'Ссылка' },
      { value: null, text: '' }, { value: true, text: 'Да' }, { value: 10, text: 'Десять' }, { value: '<текст>', text: '<текст>' }
    ]);
    result.rows[0].cells[1].value.label = 'Изменено';
    assert.equal(table.rows[0].columns[4].label, 'Ссылка');
    assert.deepEqual(model.getSelectedCells(table, 0, rows,
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 5 }, columns, display),
    model.getVisibleRows(table, 0, rows, columns, display));
  });

  it('сохраняет номера сортированного дерева после фильтрации', function () {
    const table = model.parseData({ tables: [{ name: 'Дерево', columns: ['A'], rows: [
      { columns: ['Z'] }, { columns: ['B'], children: [{ columns: ['Z'] }, { columns: ['A'] }] }
    ] }] }).tables[0];
    const state = model.makeTableState(table);
    state.sort = { column: 0, direction: 'asc' };
    state.columnFilters[0] = 'A';
    const result = model.getVisibleRows(table, 0, model.buildVisibleRows(table, state, ''), [0]);
    assert.deepEqual(result.rows.map(function (row) { return [row.number, row.sourceNumber]; }), [['1', '2'], ['1.1', '2.2']]);
  });

  it('использует проекцию после сворачивания, ограничения диапазона и скрытия без маркеров', function () {
    const table = model.parseData({ tables: [{ name: 'Проекция', columns: ['A'], rows: [
      { columns: ['Корень'], children: [{ columns: ['Потомок'] }] },
      { columns: ['Скрытая'] }, { columns: [false] }, { columns: ['За диапазоном'] }
    ] }] }).tables[0];
    const state = model.makeTableState(table);
    state.collapsedRows['0'] = true;
    const windowed = model.applyRowWindow(model.buildVisibleRows(table, state, ''), { start: 0, end: 2 });
    const rows = model.applyHiddenRows(windowed.rows, { '1': true }).rows;
    const result = model.getVisibleRows(table, 0, rows, [0]);
    assert.deepEqual(result.rows.map(function (row) { return row.sourceNumber; }), ['1', '3']);
    assert.deepEqual(result.rows[1].cells, [{ value: false, text: 'Нет' }]);
  });
});
