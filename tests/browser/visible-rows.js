const assert = require('assert');

function cell(table, row, column) {
  return '.table-card[data-table-index="' + table + '"] [data-row-id="' + row + '"] .data-cell[data-column="' + column + '"]';
}

async function read(page) {
  return page.evaluate(function () { return JSON.parse(window.getVisibleRows()); });
}

async function context(page, selector, label) {
  await page.$eval(selector, function (node) { node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })); });
  await page.$$eval('body > .context-menu > .menu-group > .menu-submenu > .menu-submenu-trigger', function (nodes) {
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].textContent === 'Сворачивание') {
        nodes[index].parentNode.dispatchEvent(new MouseEvent('mouseenter')); return;
      }
    }
    throw new Error('Подменю Сворачивание не найдено');
  });
  await page.$$eval('body > .context-menu .menu-item', function (nodes, text) {
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].textContent === text) { nodes[index].click(); return; }
    }
    throw new Error('Пункт меню не найден: ' + text);
  }, label);
}

module.exports = async function (page) {
  await page.evaluate(function () { window.destroy(); });
  assert.strictEqual(await page.evaluate(function () { return window.getVisibleRows(); }), false);
  await page.evaluate(function () {
    window.init({ tables: [
      { name: 'Первая', columns: ['A'], rows: [{ columns: ['Первая'] }] },
      { id: 'tree', name: 'Дерево', columns: [{ id: 'name', name: 'Имя' }, 'Число', 'Скрытая'], rows: [
        { columns: ['Z', 30, 'Скрыто'] },
        { columns: ['B', 20, 'Скрыто'], children: [{ columns: ['Z', 5, 'Скрыто'] }, { columns: ['A', 10, 'Скрыто'] }] }
      ] },
      { name: 'Пустая', columns: ['A'], rows: [] }
    ] });
    window.setSettings({ tables: [{ id: 'tree', columnOrder: [1, 'name'], pinnedColumns: [1], pinnedRows: ['2.2'],
      columns: [{ index: 2, visible: false }] }] });
  });
  await page.click('.table-card[data-table-index="1"] .header-cell[data-column="0"] .sort-button');
  let result = await read(page);
  assert.deepStrictEqual(result.tables.map(function (table) { return table.table.name; }), ['Первая', 'Дерево', 'Пустая']);
  assert.deepStrictEqual(result.tables[1].table, { index: 1, id: 'tree', name: 'Дерево' });
  assert.deepStrictEqual(result.tables[1].columns, [{ index: 1, id: null, name: 'Число' }, { index: 0, id: 'name', name: 'Имя' }]);
  assert.deepStrictEqual(result.tables[1].rows.map(function (row) { return [row.number, row.sourceNumber, row.cells[0].value]; }),
    [['1', '2', 20], ['1.1', '2.2', 10], ['1.2', '2.1', 5], ['2', '1', 30]]);
  assert.equal(result.tables[2].columns.length, 1);
  assert.deepStrictEqual(result.tables[2].rows, []);

  await page.evaluate(function () { window.setTreeExpanded(1, false); });
  assert.equal((await read(page)).tables[1].rows.length, 2);
  await page.evaluate(function () { window.setTableCollapsed(1, true); });
  const collapsed = (await read(page)).tables[1];
  assert.deepStrictEqual(collapsed.rows, []);
  assert.equal(collapsed.columns.length, 2);
  await page.evaluate(function () {
    window.setTableCollapsed(1, false);
    window.setSettings({ tables: [{ id: 'tree', columns: [{ id: 'name', filter: { text: 'A' } }] }] });
  });
  assert.deepStrictEqual((await read(page)).tables[1].rows.map(function (row) { return row.sourceNumber; }), ['2', '2.2']);
  await page.evaluate(function () {
    window.setSettings({ tables: [{ id: 'tree', columns: [{ id: 'name', filter: { text: 'Нет совпадений' } }] }] });
  });
  assert.deepStrictEqual((await read(page)).tables[1].rows, []);
  assert.equal((await read(page)).tables[1].table.id, 'tree');

  await page.$eval('.global-search', function (input) {
    input.value = 'Первая'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(function () { return document.querySelector('.table-card[data-table-index="1"]').style.display === 'none'; });
  result = await read(page);
  assert.equal(result.tables.length, 3, 'Поиск сохраняет метаданные скрытых таблиц');
  assert.equal(result.tables[0].rows.length, 1);
  assert.deepStrictEqual(result.tables[1].rows, []);

  await page.evaluate(function () {
    var rows = [];
    for (var index = 0; index < 400; index += 1) rows.push({ columns: [index] });
    window.setData({ tables: [{ name: 'Большая', columns: ['A'], rows: rows }] });
  });
  const full = await read(page);
  assert.equal(full.tables[0].rows.length, 400);
  assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length < 400; }));
  await page.$eval(cell(0, '0', 0), function (node) {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  const selection = await page.evaluate(function () { return window.getSelectedCells(); });
  assert.deepStrictEqual(await read(page), full);
  assert.strictEqual(await page.evaluate(function () { return window.getSelectedCells(); }), selection);
  await page.$eval('.grid-viewport', function (viewport) {
    viewport.scrollTop = viewport.scrollHeight; viewport.dispatchEvent(new Event('scroll'));
  });
  await page.waitForSelector(cell(0, '399', 0));
  assert.deepStrictEqual(await read(page), full);
  await context(page, cell(0, '399', 0), 'Свернуть до');
  assert.deepStrictEqual((await read(page)).tables[0].rows.map(function (row) { return row.sourceNumber; }), ['400']);
  await context(page, cell(0, '399', 0), 'Свернуть выделенные');
  assert.deepStrictEqual((await read(page)).tables[0].rows, []);

  await page.evaluate(function () {
    window.init({ tables: [{ name: 'Корневая', columns: ['Вложенная'], rows: [{ columns: [{ label: 'Открыть', table: {
      name: 'Вложенная', columns: ['Число'], rows: [{ columns: [7] }]
    } }] }] }] });
  });
  const root = await read(page);
  assert.deepStrictEqual(root.tables[0].rows[0].cells, [{ value: { label: 'Открыть' }, text: 'Открыть' }]);
  await page.click('.cell-table-link');
  assert.equal((await read(page)).tables.length, 1);
  assert.equal((await read(page)).tables[0].table.index, 0);
  assert.equal((await read(page)).tables[0].rows[0].cells[0].value, 7);
  await page.$$eval('.tab-button', function (tabs) { tabs[0].click(); });
  assert.deepStrictEqual(await read(page), root);
  await page.$$eval('.tab-button', function (tabs) { tabs[1].click(); });
  // Чтение не меняет настройки, выделение и очередь, не нажимает кнопку моста.
  const unchanged = await page.evaluate(function () {
    var clicks = 0;
    var button = document.getElementById('event-button');
    function onClick() { clicks += 1; }
    button.addEventListener('click', onClick);
    var before = JSON.stringify([window.getSettings(), window.getSelectedCells(), window.events_queue]);
    window.getVisibleRows(); window.getVisibleRows();
    return new Promise(function (resolve) { setTimeout(function () {
      button.removeEventListener('click', onClick);
      resolve({ same: before === JSON.stringify([window.getSettings(), window.getSelectedCells(), window.events_queue]), clicks: clicks });
    }, 30); });
  });
  assert.deepStrictEqual(unchanged, { same: true, clicks: 0 });
  await page.evaluate(function () { window.destroy(); });
  assert.strictEqual(await page.evaluate(function () { return window.getVisibleRows(); }), false);
  await page.evaluate(function () { window.init({ tables: [] }); });
  assert.deepStrictEqual(await read(page), { tables: [] });
};
