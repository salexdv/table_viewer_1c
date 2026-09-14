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
});
