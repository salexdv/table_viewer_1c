const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function findBrowser() {
  const localRoot = path.resolve(__dirname, '..', '..', '.cache', 'puppeteer');
  const stack = fs.existsSync(localRoot) ? [localRoot] : [];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.name === 'chrome-headless-shell') return fullPath;
    }
  }
  const candidates = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const candidate of candidates) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error('Chromium не найден. Укажите CHROME_PATH.');
}

function fixture() {
  const rows = [];
  for (let index = 0; index < 10000; index += 1) {
    rows.push({ columns: [
      index === 0 ? { label: 'Строка-ссылка', ref: 'e1cib/data/Справочник.Тест?ref=1' } : 'Строка ' + index,
      String(index),
      String(index + 1)
    ] });
  }
  return {
    tables: [
      { name: 'Большая таблица', columns: ['Название', 'Индекс', 'Сумма'], rows: rows },
      { name: 'Дерево', columns: ['Наименование', 'Сумма'], rows: [
        { columns: ['Корень', '10'], children: [
          { columns: ['Ветка', '20'], children: [{ columns: ['Искомый лист', '30'], children: [] }] },
          { columns: ['Сосед', '40'], children: [] }
        ] }
      ] }
    ]
  };
}

async function main() {
  const sourcePath = path.resolve(__dirname, '..', '..', 'dist', 'index.html');
  assert.ok(fs.existsSync(sourcePath), 'Сначала выполните npm run build');
  const data = JSON.stringify(fixture()).replace(/</g, '\\u003C');
  const source = fs.readFileSync(sourcePath, 'utf8').replace('>_DATA_</script>', '>' + data + '</script>');
  const tempDir = path.resolve(__dirname, '..', '..', '.cache');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, 'onec-table-viewer-smoke-' + process.pid + '.html');
  fs.writeFileSync(tempPath, source, 'utf8');

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', function (error) { errors.push(error.message); });
    page.on('console', function (message) { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('file://' + sourcePath, { waitUntil: 'load' });
    await page.waitForSelector('.waiting-state');
    assert.strictEqual(await page.$eval('.waiting-state', function (node) { return node.textContent; }), 'Ожидение данных...');
    assert.strictEqual(await page.$eval('.waiting-state', function (node) { return node.getAttribute('role'); }), 'status');
    assert.strictEqual(await page.$('.error-box'), null);
    assert.strictEqual(await page.evaluate(function () { return window.init(); }), false);
    await page.goto('file://' + tempPath, { waitUntil: 'load' });
    await page.waitForSelector('.table-card');

    assert.strictEqual(await page.$$eval('.table-card', function (nodes) { return nodes.length; }), 2);
    const commandButtons = await page.$$eval('.command-icon-button, .tree-command-button', function (nodes) {
      return nodes.map(function (node) { return { text: node.textContent, title: node.title, label: node.getAttribute('aria-label'), icons: node.querySelectorAll('svg[aria-hidden="true"]').length }; });
    });
    assert.deepStrictEqual(commandButtons.map(function (item) { return item.text; }), ['', '', '', '']);
    assert.deepStrictEqual(commandButtons.map(function (item) { return item.title; }), ['Развернуть все', 'Свернуть все', 'Раскрыть дерево', 'Свернуть дерево']);
    assert.ok(commandButtons.every(function (item) { return item.label === item.title && item.icons === 1; }));
    assert.strictEqual(await page.$eval('.export-button', function (node) { return getComputedStyle(node).display; }), 'none');
    const initialLayout = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      var content = node.querySelector('.grid-content');
      var cells = node.querySelectorAll('.header-row .header-cell:not(.number-cell)');
      return { viewport: node.clientWidth, content: content.getBoundingClientRect().width, first: cells[0].getBoundingClientRect().width, second: cells[1].getBoundingClientRect().width, height: node.getBoundingClientRect().height };
    });
    assert.ok(Math.abs(initialLayout.content - initialLayout.viewport) <= 1, 'Колонки должны заполнять доступную ширину');
    assert.ok(initialLayout.first > initialLayout.second, 'Свободная ширина должна распределяться пропорционально');
    assert.ok(initialLayout.height <= Math.round(800 * 0.58) + 1, 'Несколько таблиц сохраняют ограничение высоты');
    assert.ok((await page.$eval('.table-count', function (node) { return node.textContent; })).indexOf('10000 / 10000') !== -1);
    const numberStyle = await page.$eval('.table-card[data-table-index="0"] .data-row .number-cell', function (node) { var style = getComputedStyle(node); return { color: style.color, weight: style.fontWeight }; });
    assert.notStrictEqual(numberStyle.color, 'rgb(239, 69, 69)');
    assert.notStrictEqual(numberStyle.weight, '700');
    const numberHeaderStyle = await page.$eval('.table-card[data-table-index="0"] .header-row .number-cell', function (node) { var style = getComputedStyle(node); return { background: style.backgroundColor, align: style.textAlign }; });
    const dataHeaderBackground = await page.$eval('.table-card[data-table-index="0"] .header-row .header-cell[data-column="0"]', function (node) { return getComputedStyle(node).backgroundColor; });
    assert.strictEqual(numberHeaderStyle.background, dataHeaderBackground);
    assert.strictEqual(numberHeaderStyle.align, 'left');
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="0"] .aggregate-button', function (nodes) { return nodes.length; }), 2);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="1"] .aggregate-button', function (nodes) { return nodes.length; }), 1);
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'DOM-строк должно быть меньше 100');
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = node.scrollHeight; });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-row-id="9999"]'), 'После прокрутки должна быть отрисована последняя строка');
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'После прокрутки DOM остаётся ограниченным');

    await page.$eval('.global-search', function (input) { input.value = 'Искомый'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"]', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="1"]', function (node) { return getComputedStyle(node).display; }), 'none');
    await page.$eval('.global-search', function (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });

    await page.$eval('.global-search', function (input) { input.value = 'Строка'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 190); });
    const singleHeight = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      var box = node.getBoundingClientRect(); return { height: box.height, bottom: box.bottom, windowHeight: window.innerHeight };
    });
    assert.ok(singleHeight.height > 620, 'Одна большая таблица должна использовать доступную высоту');
    assert.ok(Math.abs(singleHeight.windowHeight - singleHeight.bottom - 8) <= 2, 'Одиночная таблица должна доходить до нижнего отступа');
    await page.$eval('.global-search', function (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });

    await page.click('.table-card[data-table-index="0"] .header-cell[data-column="2"] .aggregate-button');
    await page.$$eval('.aggregate-menu .menu-item', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent.indexOf('Среднее') !== -1) nodes[index].click();
    });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="2"]', function (node) { return node.textContent; }), '5000,5');

    await page.click('.table-card[data-table-index="0"] .filter-cell[data-column="0"] .value-filter-button');
    assert.ok(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }) < 100, 'Список значений должен быть виртуализирован');
    await page.$$eval('.value-filter-commands .button', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Снять все') nodes[index].click();
    });
    await page.$eval('.value-filter-search', function (input) { input.value = 'Строка 9999'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.value-filter-option input');
    await page.$$eval('.value-filter-actions .button', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Применить') nodes[index].click();
    });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 10000') !== -1);
    await page.click('.table-card[data-table-index="0"] .filter-cell[data-column="0"] .value-filter-button');
    await page.$$eval('.value-filter-actions .button', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Очистить фильтр') nodes[index].click();
    });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('10000 / 10000') !== -1);

    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    await page.$$eval('.context-menu .menu-item', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Свернуть строки после') nodes[index].click();
    });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 10000') !== -1);
    assert.strictEqual(await page.$eval('.range-marker-after', function (node) { return node.textContent; }), 'Показать 9999 скрытых строк');
    await page.click('.range-marker-after');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('10000 / 10000') !== -1);
    await page.click('.table-card[data-table-index="0"] [data-row-id="2"] .data-cell', { button: 'right' });
    await page.$$eval('.context-menu .menu-item', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Свернуть строки до') nodes[index].click();
    });
    assert.strictEqual(await page.$eval('.range-marker-before', function (node) { return node.textContent; }), 'Показать 2 скрытых строк');

    const sumHeader = await page.$('.table-card[data-table-index="0"] .sort-button:nth-of-type(1)');
    assert.ok(sumHeader);
    await page.evaluate(function () {
      var buttons = document.querySelectorAll('.table-card[data-table-index="0"] .sort-button');
      buttons[2].click();
    });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .header-row', function (node) { return node.textContent; })).indexOf('Сумма ↑') !== -1);
    assert.strictEqual(await page.$eval('.range-marker-before', function (node) { return getComputedStyle(node).display; }), 'none');

    const treeFilter = '.table-card[data-table-index="1"] .column-filter';
    await page.$eval(treeFilter, function (input) { input.value = 'Искомый'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const treeTexts = await page.$$eval('.table-card[data-table-index="1"] .data-row', function (nodes) { return nodes.map(function (node) { return node.textContent; }); });
    assert.deepStrictEqual(treeTexts.map(function (text) { return text.replace(/[−+]/g, '').trim(); }), ['1Корень10', '1.1Ветка20', '1.1.1Искомый лист30']);

    await page.click('button[title="Настроить отображение колонок"]');
    assert.strictEqual(await page.$$eval('.column-panel .column-group-title', function (nodes) { return nodes.length; }), 2);
    const optionCount = await page.$$eval('.column-option input', function (nodes) { return nodes.length; });
    assert.strictEqual(optionCount, 5);
    await page.click('.column-option input');
    assert.strictEqual(await page.$('.table-card[data-table-index="0"] [data-column="0"]'), null);
    await page.click('.column-option input');
    await page.click('button[title="Настроить отображение колонок"]');
    assert.strictEqual(await page.$('.column-panel'), null);

    await page.evaluate(function () {
      var input = document.querySelector('.table-card[data-table-index="1"] .column-filter');
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const firstDataCell = '.table-card[data-table-index="1"] .data-row .data-cell';
    await page.click(firstDataCell, { button: 'right' });
    assert.strictEqual(await page.$$eval('.context-menu .menu-item', function (nodes) { return nodes.length; }), 3);
    await page.evaluate(function () {
      var buttons = document.querySelectorAll('.context-menu .menu-item'); buttons[0].click();
    });
    assert.ok(await page.$('.table-card[data-table-index="1"] .pinned-column'));
    await page.click(firstDataCell, { button: 'right' });
    await page.evaluate(function () {
      var buttons = document.querySelectorAll('.context-menu .menu-item'); buttons[1].click();
    });
    assert.ok(await page.$('.table-card[data-table-index="1"] .pinned-row'));
    await page.click(firstDataCell, { button: 'right' });
    await page.evaluate(function () {
      var buttons = document.querySelectorAll('.context-menu .menu-item'); buttons[2].click();
    });
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 4') !== -1);
    await page.$eval('.table-card[data-table-index="1"] .column-filter', function (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });

    assert.strictEqual(await page.evaluate(function () { return window.setTreeExpanded(1, false); }), true);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="1"] .data-row:not(.pinned-row)', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.evaluate(function () { return window.setTreeExpanded(1, true); }), true);
    assert.ok(await page.$$eval('.table-card[data-table-index="1"] .data-row', function (nodes) { return nodes.length; }) >= 4);
    assert.strictEqual(await page.evaluate(function () { return window.setTableCollapsed(1, true); }), true);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="1"] .grid-host', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.evaluate(function () { return window.setTableCollapsed(1, false); }), true);

    const beforeWidth = await page.$eval('.table-card[data-table-index="0"] .header-cell[data-column="2"]', function (node) { return node.getBoundingClientRect().width; });
    const resizeBox = await page.$eval('.table-card[data-table-index="0"] .header-cell[data-column="2"] .column-resizer', function (node) { var box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
    await page.mouse.move(resizeBox.x + 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down(); await page.mouse.move(resizeBox.x + 42, resizeBox.y + resizeBox.height / 2); await page.mouse.up();
    const afterWidth = await page.$eval('.table-card[data-table-index="0"] .header-cell[data-column="2"]', function (node) { return node.getBoundingClientRect().width; });
    assert.ok(afterWidth > beforeWidth + 20);

    const beforeNumberWidth = await page.$eval('.table-card[data-table-index="0"] .header-row .number-cell', function (node) { return node.getBoundingClientRect().width; });
    const numberResizeBox = await page.$eval('.table-card[data-table-index="0"] .number-resizer', function (node) { var box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
    await page.mouse.move(numberResizeBox.x + 2, numberResizeBox.y + numberResizeBox.height / 2);
    await page.mouse.down(); await page.mouse.move(numberResizeBox.x + 34, numberResizeBox.y + numberResizeBox.height / 2); await page.mouse.up();
    const afterNumberWidth = await page.$eval('.table-card[data-table-index="0"] .header-row .number-cell', function (node) { return node.getBoundingClientRect().width; });
    assert.ok(afterNumberWidth > beforeNumberWidth + 20);

    await page.$eval('.table-card[data-table-index="0"] input[type="range"]', function (input) { input.value = '150'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .scale-value', function (node) { return node.textContent; }), '150%');

    await page.evaluate(function () {
      window.__events = [];
      document.getElementById('event-button').addEventListener('click', function (event) { window.__events.push(event.eventData1C); });
      window.setData({ tables: [{ name: 'События', columns: ['Ссылка', 'Сумма'], rows: [{ columns: [{ label: 'Открыть', ref: 'e1cib/data/Test?ref=1' }, '25'] }, { columns: ['Без ссылки', '15'] }] }] });
    });
    await page.click('.cell-link');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    await page.$eval('.export-button', function (node) { node.click(); });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    const events = await page.evaluate(function () { return window.__events; });
    assert.deepStrictEqual(events, [
      { event: 'EVENT_ON_LINK_CLICK', params: { label: 'Открыть', href: 'e1cib/data/Test?ref=1' } },
      { event: 'EVENT_EXPORT', params: {} }
    ]);

    const cells = await page.$$('.table-card[data-table-index="0"] .data-cell[data-column="1"]');
    const first = await cells[0].boundingBox(); const second = await cells[1].boundingBox();
    await page.mouse.move(first.x + 8, first.y + 8); await page.mouse.down(); await page.mouse.move(second.x + 8, second.y + 8); await page.mouse.up();
    assert.ok((await page.$eval('.selection-summary', function (node) { return node.textContent; })).indexOf('Сумма: 40') !== -1);
    await page.select('.selection-aggregate', 'average');
    assert.ok((await page.$eval('.selection-summary', function (node) { return node.textContent; })).indexOf('Среднее: 20') !== -1);

    assert.strictEqual(await page.evaluate(function () { return window.collapseAll(); }), true);
    assert.strictEqual(await page.$eval('.grid-host', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.evaluate(function () { return window.expandAll(); }), true);
    assert.notStrictEqual(await page.$eval('.grid-host', function (node) { return getComputedStyle(node).display; }), 'none');

    const errorsBeforeValidation = errors.length;
    assert.strictEqual(await page.evaluate(function () { return window.setData('{"tables":[],}'); }), false);
    assert.ok(await page.$('.error-box'));
    assert.strictEqual(errors.length, errorsBeforeValidation + 1);
    errors.splice(errorsBeforeValidation, 1);
    assert.strictEqual(await page.evaluate(function () { return window.setData({ tables: [] }); }), true);
    assert.ok(await page.$('.empty-state'));

    assert.deepStrictEqual(errors, []);
    console.log('[browser] Smoke-тест пройден');
  } finally {
    await browser.close();
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

main().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
