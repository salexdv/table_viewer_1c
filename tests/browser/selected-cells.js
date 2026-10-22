const assert = require('assert');

// Выделяем через DOM-события, чтобы проверять публичный API без доступа к экземпляру приложения.
async function select(page, start, end, shift) {
  await page.$eval(start, function (cell, options) {
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: options.shift }));
    if (!options.drag) document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, { shift: !!shift, drag: !!end });
  if (end) await page.$eval(end, function (cell) {
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

function cell(table, row, column) {
  return '.table-card[data-table-index="' + table + '"] [data-row-id="' + row + '"] .data-cell[data-column="' + column + '"]';
}

async function read(page) {
  return page.evaluate(function () { return JSON.parse(window.getSelectedCells()); });
}

module.exports = async function (page) {
  const empty = { table: null, columns: [], rows: [] };
  await page.evaluate(function () {
    window.init({ tables: [
      { name: 'Первая', columns: ['A'], rows: [{ columns: ['Первая'] }] },
      { id: 'tree', name: 'Дерево', columns: [{ id: 'name', name: 'Имя' }, 'Число', 'Скрытая'], rows: [
        { columns: ['Z', 30, 'Скрыто'] },
        { columns: ['B', 20, 'Скрыто'], children: [{ columns: ['Z', 5, 'Скрыто'] }, { columns: ['A', 10, 'Скрыто'] }] }
      ] }
    ] });
    window.__selectionEvents = [];
    document.getElementById('event-button').addEventListener('click', function (event) { window.__selectionEvents.push(event.eventData1C); });
    window.setSettings({ tables: [{ id: 'tree', columnOrder: [1, 'name'], pinnedColumns: [1], pinnedRows: ['2.2'],
      columns: [{ index: 2, visible: false }] }] });
  });
  assert.deepStrictEqual(await read(page), empty);
  await page.click('.table-card[data-table-index="1"] .header-cell[data-column="0"] .sort-button');
  await select(page, cell(1, '1.1', 0), cell(1, '1', 1));
  let result = await read(page);
  assert.deepStrictEqual(result.table, { index: 1, id: 'tree', name: 'Дерево' });
  assert.deepStrictEqual(result.columns, [{ index: 1, id: null, name: 'Число' }, { index: 0, id: 'name', name: 'Имя' }]);
  assert.deepStrictEqual(result.rows.map(function (row) { return [row.number, row.sourceNumber, row.cells[0].value]; }),
    [['1', '2', 20], ['1.1', '2.2', 10]]);
  assert.equal((await read(page)).rows.length, 2, 'Чтение не меняет выделение');
  assert.deepStrictEqual(await page.evaluate(function () { return window.__selectionEvents; }), []);
  await select(page, cell(0, '0', 0));
  assert.equal((await read(page)).table.index, 0, 'Новое выделение очищает другую таблицу');

  // Фильтр меняет экранную нумерацию, сохраняя исходный путь.
  await page.evaluate(function () { window.setSettings({ tables: [{ id: 'tree', columns: [{ id: 'name', filter: { text: 'A' } }] }] }); });
  assert.deepStrictEqual(await read(page), empty);
  await select(page, cell(1, '1.1', 0));
  result = await read(page);
  assert.deepStrictEqual([result.rows[0].number, result.rows[0].sourceNumber], ['1.1', '2.2']);

  // Диапазон больше виртуального окна: промежуточные строки отсутствуют в DOM.
  await page.evaluate(function () {
    var rows = [];
    for (var index = 0; index < 400; index += 1) rows.push({ columns: [index] });
    window.setData({ tables: [{ name: 'Большая', columns: ['A'], rows: rows }] });
  });
  assert.deepStrictEqual(await read(page), empty);
  await select(page, cell(0, '0', 0));
  await page.$eval('.grid-viewport', function (viewport) { viewport.scrollTop = viewport.scrollHeight; viewport.dispatchEvent(new Event('scroll')); });
  await page.waitForSelector(cell(0, '399', 0));
  await select(page, cell(0, '399', 0), null, true);
  result = await read(page);
  assert.equal(result.rows.length, 400, JSON.stringify([result.rows[0], result.rows[result.rows.length - 1]]));
  assert.equal(result.rows[200].cells[0].value, 200);
  assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length < 400; }));

  await page.evaluate(function () {
    window.init({ tables: [{ name: 'Корневая', columns: ['Вложенная'], rows: [{ columns: [{ label: 'Открыть', table: {
      name: 'Вложенная', columns: ['Число'], rows: [{ columns: [7] }]
    } }] }] }] });
  });
  assert.deepStrictEqual(await read(page), empty);
  await select(page, cell(0, '0', 0));
  assert.deepStrictEqual((await read(page)).rows[0].cells, [{ value: { label: 'Открыть' }, text: 'Открыть' }]);
  await page.click('.cell-table-link');
  assert.deepStrictEqual(await read(page), empty);
  await select(page, cell(0, '0', 0));
  assert.equal((await read(page)).rows[0].cells[0].value, 7);
  await page.$$eval('.tab-button', function (tabs) { tabs[0].click(); });
  assert.equal((await read(page)).table.name, 'Корневая');
  await page.$$eval('.tab-button', function (tabs) { tabs[1].click(); });
  assert.equal((await read(page)).table.name, 'Вложенная');
  await page.evaluate(function () { window.destroy(); });
  assert.strictEqual(await page.evaluate(function () { return window.getSelectedCells(); }), false);
  await page.evaluate(function () { window.init({ tables: [] }); });
  assert.deepStrictEqual(await read(page), empty);
};
