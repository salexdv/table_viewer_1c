const assert = require('chai').assert;
const model = require('../../src/model');

describe('снимок выделенных ячеек', function () {
  function snapshot(table, selection, columns, state, display) {
    return model.getSelectedCells(table, 2, model.buildVisibleRows(table, state || model.makeTableState(table), ''),
      selection, columns, display);
  }

  it('возвращает пустой снимок без выделения и при пустой проекции', function () {
    const table = model.parseData({ tables: [{ name: 'Пустая', columns: ['A'], rows: [] }] }).tables[0];
    const empty = { table: null, columns: [], rows: [] };
    assert.deepEqual(snapshot(table, null, [0]), empty);
    assert.deepEqual(snapshot(table, { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }, [0]), empty);
  });

  it('сохраняет типы, представления и копирует ссылки без содержимого вложенных таблиц', function () {
    const emptyRef = 'e1cib/data/Справочник.Тест?ref=00000000000000000000000000000000';
    const values = ['<текст>', 10, true, null, { label: 'Ссылка', ref: 'ref' },
      { label: 'Таблица', table: { name: 'Вложенная', columns: [], rows: [] } }, { label: '', ref: emptyRef }];
    const table = model.parseData({ tables: [{ name: 'Типы', columns: values.map(function () { return 'Дубль'; }),
      rows: [{ columns: values }] }] }).tables[0];
    const display = model.makeDisplaySettings();
    model.setScalarRule(display.presentations, 10, 'Десять');
    display.showEmptyReferences = true;
    const result = snapshot(table, { startRow: 0, endRow: 0, startColumn: 0, endColumn: 6 }, [0, 1, 2, 3, 4, 5, 6], null, display);
    assert.deepEqual(result.table, { index: 2, id: null, name: 'Типы' });
    assert.deepEqual(result.rows[0].cells.map(function (cell) { return cell.value; }),
      values.slice(0, 5).concat([{ label: 'Таблица' }, { label: '', ref: emptyRef }]));
    assert.deepEqual(result.rows[0].cells.map(function (cell) { return cell.text; }),
      ['<текст>', 'Десять', 'Да', '', 'Ссылка', 'Таблица', '<Справочник.Тест (пустая)>']);
    result.rows[0].cells[4].value.label = 'Изменено';
    assert.equal(table.rows[0].columns[4].label, 'Ссылка');
    assert.equal(JSON.parse(JSON.stringify(result)).columns.length, 7);
  });

  it('нормализует обратный прямоугольник и сопоставляет ячейки переставленным колонкам', function () {
    const table = model.parseData({ tables: [{ id: 't', name: 'Порядок',
      columns: ['A', { id: 'b', name: 'B' }, 'C'], rows: [{ columns: [1, 2, 3] }, { columns: [4, 5, 6] }] }] }).tables[0];
    const result = snapshot(table, { startRow: 1, endRow: 0, startColumn: 1, endColumn: 0 }, [2, 1]);
    assert.deepEqual(result.columns, [{ index: 2, id: null, name: 'C' }, { index: 1, id: 'b', name: 'B' }]);
    assert.deepEqual(result.rows.map(function (row) { return row.cells.map(function (cell) { return cell.value; }); }), [[3, 2], [6, 5]]);
    assert.deepEqual(result.rows.map(function (row) { return row.sourceNumber; }), ['1', '2']);
    const single = snapshot(table, { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 }, [2]);
    assert.deepEqual(single.rows, [{ number: '2', sourceNumber: '2', cells: [{ value: 6, text: '6' }] }]);
  });

  it('различает экранный и исходный путь дерева после сортировки и фильтрации', function () {
    const table = model.parseData({ tables: [{ name: 'Дерево', columns: ['A'], rows: [
      { columns: ['Z'] }, { columns: ['B'], children: [{ columns: ['Z'] }, { columns: ['A'] }] }
    ] }] }).tables[0];
    const state = model.makeTableState(table);
    state.sort = { column: 0, direction: 'asc' };
    state.columnFilters[0] = 'A';
    const result = snapshot(table, { startRow: 0, endRow: 20, startColumn: 0, endColumn: 0 }, [0], state);
    assert.deepEqual(result.rows.map(function (row) { return [row.number, row.sourceNumber]; }), [['1', '2'], ['1.1', '2.2']]);
  });

  it('не добавляет скрытые строки и свёрнутых потомков в снимок проекции', function () {
    const table = model.parseData({ tables: [{ name: 'Проекция', columns: ['A'], rows: [
      { columns: ['Корень'], children: [{ columns: ['Потомок'] }] },
      { columns: ['Скрытая'] }, { columns: [false] }
    ] }] }).tables[0];
    const state = model.makeTableState(table);
    state.collapsedRows['0'] = true;
    const rows = model.applyHiddenRows(model.buildVisibleRows(table, state, ''), { '1': true }).rows;
    const result = model.getSelectedCells(table, 0, rows,
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 }, [0]);
    assert.deepEqual(result.rows.map(function (row) { return row.sourceNumber; }), ['1', '3']);
    assert.deepEqual(result.rows[1].cells, [{ value: false, text: 'Нет' }]);
  });
});
