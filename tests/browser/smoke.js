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

async function toggleColumnOption(page, optionIndex) {
  return page.evaluate(function (currentIndex) {
    var oldCheckbox = document.querySelectorAll('.column-option input')[currentIndex];
    oldCheckbox.click();
    var keptDuringClick = oldCheckbox === document.querySelectorAll('.column-option input')[currentIndex];
    return new Promise(function (resolve) {
      setTimeout(function () {
        var checkboxes = document.querySelectorAll('.column-option input');
        resolve({
          panelOpen: !!document.querySelector('.column-panel'),
          keptDuringClick: keptDuringClick,
          replaced: oldCheckbox !== checkboxes[currentIndex],
          checked: Array.prototype.map.call(checkboxes, function (checkbox) { return checkbox.checked; })
        });
      }, 0);
    });
  }, optionIndex);
}

async function selectColumnAggregate(page, tableIndex, columnIndex, label) {
  await page.click('.table-card[data-table-index="' + tableIndex + '"] .header-cell[data-column="' + columnIndex + '"] .aggregate-button');
  await page.$$eval('.aggregate-menu .menu-item', function (nodes, expectedLabel) {
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].textContent.replace(/^\u2713\s*/, '') === expectedLabel) { nodes[index].click(); return; }
    }
    throw new Error('Функция итога не найдена: ' + expectedLabel);
  }, label);
}

async function clickContextMenuItem(page, label) {
  await page.$$eval('body > .context-menu .menu-item', function (nodes, expectedLabel) {
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].textContent === expectedLabel) { nodes[index].click(); return; }
    }
    throw new Error('Пункт контекстного меню не найден: ' + expectedLabel);
  }, label);
}

async function openContextSubmenu(page, label) {
  await page.$$eval('body > .context-menu > .menu-group > .menu-submenu > .menu-submenu-trigger', function (nodes, expectedLabel) {
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].textContent === expectedLabel) {
        nodes[index].parentNode.dispatchEvent(new MouseEvent('mouseenter'));
        return;
      }
    }
    throw new Error('Подменю не найдено: ' + expectedLabel);
  }, label);
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
    assert.deepStrictEqual(commandButtons.map(function (item) { return item.text; }), ['', '', '', '', '']);
    assert.deepStrictEqual(commandButtons.map(function (item) { return item.title; }), ['Переносить текст', 'Свернуть все', 'Развернуть все', 'Раскрыть дерево', 'Свернуть дерево']);
    assert.ok(commandButtons.every(function (item) { return item.label === item.title && item.icons === 1; }));
    assert.deepStrictEqual(await page.$eval('.toolbar-columns-group', function (node) {
      return Array.prototype.map.call(node.children, function (child) { return { text: child.textContent, className: child.className }; });
    }), [
      { text: 'Колонки', className: 'button' }
    ]);
    assert.strictEqual(await page.$eval('.toolbar-wrap-text-group', function (node) { return node.children.length; }), 1);
    assert.strictEqual(await page.$eval('.wrap-text-button', function (node) { return node.getAttribute('aria-pressed'); }), 'false');
    assert.deepStrictEqual(await page.$$eval('.toolbar-commands > .toolbar-group', function (nodes) { return nodes.map(function (node) { return node.className; }); }), [
      'toolbar-group toolbar-columns-group',
      'toolbar-group toolbar-wrap-text-group',
      'toolbar-group toolbar-global-group',
      'toolbar-group toolbar-selection-group'
    ]);
    assert.deepStrictEqual(await page.$$eval('.toolbar-commands > .toolbar-group', function (nodes) { return nodes.map(function (node) { return getComputedStyle(node).borderLeftWidth; }); }), ['0px', '1px', '1px', '1px']);
    const desktopToolbar = await page.$eval('.global-toolbar', function (node) {
      return { toolbar: node.getBoundingClientRect().width, search: node.querySelector('.global-search').getBoundingClientRect().width };
    });
    assert.ok(desktopToolbar.search <= desktopToolbar.toolbar / 2 + 1, 'Поиск не должен занимать больше половины панели');
    const treeCommandLayout = await page.$$eval('.tree-command-group .tree-command-button', function (nodes) {
      var first = nodes[0].getBoundingClientRect(); var second = nodes[1].getBoundingClientRect(); var icon = nodes[0].querySelector('svg').getBoundingClientRect();
      return { firstWidth: first.width, firstHeight: first.height, secondWidth: second.width, secondHeight: second.height, gap: second.left - first.right, iconWidth: icon.width, iconHeight: icon.height };
    });
    assert.deepStrictEqual(treeCommandLayout, { firstWidth: 30, firstHeight: 28, secondWidth: 30, secondHeight: 28, gap: 11, iconWidth: 18, iconHeight: 18 });
    assert.strictEqual(await page.$eval('.export-button', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.$eval('.selection-aggregate-button', function (node) { return node.textContent; }), 'Ʃ');
    await page.click('.selection-aggregate-button');
    assert.strictEqual(await page.$eval('.selection-aggregates-popup', function (node) { return node.textContent; }), 'Числа не выделены');
    assert.strictEqual(await page.$eval('.selection-aggregate-button', function (node) { return node.getAttribute('aria-expanded'); }), 'true');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.$('.selection-aggregates-popup'), null);
    assert.strictEqual(await page.$eval('.selection-aggregate-button', function (node) { return node.getAttribute('aria-expanded'); }), 'false');
    await page.setViewport({ width: 700, height: 800 });
    const mobileToolbar = await page.$eval('.global-toolbar', function (node) {
      return { toolbar: node.getBoundingClientRect().width, search: node.querySelector('.global-search').getBoundingClientRect().width };
    });
    assert.ok(mobileToolbar.search >= mobileToolbar.toolbar - 20, 'На узком экране поиск должен занимать отдельную строку');
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    await page.hover('.global-toolbar');
    const scrollbarStyles = await page.evaluate(function () {
      var viewport = document.querySelector('.table-card[data-table-index="0"] .grid-viewport');
      var rootScrollbar = getComputedStyle(document.documentElement, '::-webkit-scrollbar');
      var tableScrollbar = getComputedStyle(viewport, '::-webkit-scrollbar');
      var rootTrack = getComputedStyle(document.documentElement, '::-webkit-scrollbar-track');
      var tableTrack = getComputedStyle(viewport, '::-webkit-scrollbar-track');
      var rootThumb = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb');
      var tableThumb = getComputedStyle(viewport, '::-webkit-scrollbar-thumb');
      return {
        root: { width: rootScrollbar.width, height: rootScrollbar.height, standard: getComputedStyle(document.documentElement).scrollbarWidth, track: rootTrack.backgroundColor, thumb: rootThumb.backgroundColor },
        table: { width: tableScrollbar.width, height: tableScrollbar.height, standard: getComputedStyle(viewport).scrollbarWidth, track: tableTrack.backgroundColor, thumb: tableThumb.backgroundColor }
      };
    });
    assert.deepStrictEqual(scrollbarStyles.root, { width: '6px', height: '6px', standard: 'thin', track: 'rgb(238, 243, 248)', thumb: 'rgb(130, 152, 177)' });
    assert.deepStrictEqual(scrollbarStyles.table, { width: '6px', height: '6px', standard: 'thin', track: 'rgba(0, 0, 0, 0)', thumb: 'rgba(0, 0, 0, 0)' });
    await page.hover('.table-card[data-table-index="0"] .grid-viewport');
    assert.deepStrictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      return { track: getComputedStyle(node, '::-webkit-scrollbar-track').backgroundColor, thumb: getComputedStyle(node, '::-webkit-scrollbar-thumb').backgroundColor };
    }), { track: 'rgb(238, 243, 248)', thumb: 'rgb(130, 152, 177)' });
    await page.hover('.global-toolbar');
    const initialLayout = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      var content = node.querySelector('.grid-content');
      var cells = node.querySelectorAll('.header-row .header-cell:not(.number-cell)');
      return { viewport: node.clientWidth, content: content.getBoundingClientRect().width, first: cells[0].getBoundingClientRect().width, second: cells[1].getBoundingClientRect().width, height: node.getBoundingClientRect().height };
    });
    assert.ok(Math.abs(initialLayout.content - initialLayout.viewport) <= 1, 'Колонки должны заполнять доступную ширину');
    assert.ok(initialLayout.first > initialLayout.second, 'Свободная ширина должна распределяться пропорционально');
    assert.ok(initialLayout.height <= Math.round(800 * 0.58) + 1, 'Несколько таблиц сохраняют ограничение высоты');
    const verticalScroll = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      node.scrollTop = node.scrollHeight;
      var result = { overflow: node.scrollHeight > node.clientHeight, position: node.scrollTop };
      node.scrollTop = 0;
      return result;
    });
    assert.ok(verticalScroll.overflow && verticalScroll.position > 0, 'Вертикальная прокрутка таблицы должна работать');
    await page.evaluate(function () {
      var spacer = document.createElement('div');
      spacer.id = 'scroll-test-spacer';
      spacer.style.height = '800px';
      document.body.appendChild(spacer);
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { return (' ' + node.className + ' ').indexOf(' scrollbar-active ') !== -1; }), true);
    assert.strictEqual(await page.evaluate(function () { return (' ' + document.documentElement.className + ' ').indexOf(' scrollbar-active ') !== -1; }), true);
    await new Promise(function (resolve) { setTimeout(resolve, 600); });
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = 26; });
    await new Promise(function (resolve) { setTimeout(resolve, 500); });
    assert.strictEqual(await page.evaluate(function () { return (' ' + document.documentElement.className + ' ').indexOf(' scrollbar-active ') !== -1; }), false, 'Полоса страницы должна скрыться через секунду');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { return (' ' + node.className + ' ').indexOf(' scrollbar-active ') !== -1; }), true, 'Повторная прокрутка должна продлить видимость полосы таблицы');
    await new Promise(function (resolve) { setTimeout(resolve, 550); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { return (' ' + node.className + ' ').indexOf(' scrollbar-active ') !== -1; }), false, 'Полоса таблицы должна скрыться через секунду после последней прокрутки');
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { return (' ' + node.className + ' ').indexOf(' scrollbar-active ') !== -1; }), true);
    await page.$eval('.table-card[data-table-index="0"] input[type="range"]', function (input) { input.value = '110'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { return (' ' + node.className + ' ').indexOf(' scrollbar-active ') !== -1; }), false, 'Перерисовка должна очистить активность старого viewport');
    await page.$eval('.table-card[data-table-index="0"] input[type="range"]', function (input) { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(function () {
      window.scrollTo(0, 0);
      var spacer = document.getElementById('scroll-test-spacer');
      if (spacer) spacer.parentNode.removeChild(spacer);
    });
    const horizontalScroll = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      var content = node.querySelector('.grid-content');
      var oldWidth = content.style.width;
      content.style.width = node.clientWidth + 100 + 'px';
      node.scrollLeft = node.scrollWidth;
      var result = { overflow: node.scrollWidth > node.clientWidth, position: node.scrollLeft };
      node.scrollLeft = 0;
      content.style.width = oldWidth;
      return result;
    });
    assert.ok(horizontalScroll.overflow && horizontalScroll.position > 0, 'Горизонтальная прокрутка таблицы должна работать');
    assert.ok((await page.$eval('.table-count', function (node) { return node.textContent; })).indexOf('10000 / 10000') !== -1);
    const numberStyle = await page.$eval('.table-card[data-table-index="0"] .data-row .number-cell', function (node) { var style = getComputedStyle(node); return { color: style.color, weight: style.fontWeight }; });
    assert.notStrictEqual(numberStyle.color, 'rgb(239, 69, 69)');
    assert.notStrictEqual(numberStyle.weight, '700');
    const numberHeaderStyle = await page.$eval('.table-card[data-table-index="0"] .header-row .number-cell', function (node) { var style = getComputedStyle(node); return { background: style.backgroundColor, align: style.textAlign }; });
    const dataHeaderBackground = await page.$eval('.table-card[data-table-index="0"] .header-row .header-cell[data-column="0"]', function (node) { return getComputedStyle(node).backgroundColor; });
    assert.strictEqual(numberHeaderStyle.background, dataHeaderBackground);
    assert.strictEqual(numberHeaderStyle.align, 'left');
    const columnAlignment = await page.evaluate(function () {
      return {
        text: getComputedStyle(document.querySelector('.table-card[data-table-index="0"] .data-cell[data-column="0"]')).textAlign,
        number: getComputedStyle(document.querySelector('.table-card[data-table-index="0"] .data-cell[data-column="1"]')).textAlign,
        numberClass: document.querySelector('.table-card[data-table-index="0"] .data-cell[data-column="1"]').className,
        header: getComputedStyle(document.querySelector('.table-card[data-table-index="0"] .header-cell[data-column="1"] .sort-button')).textAlign,
        filter: getComputedStyle(document.querySelector('.table-card[data-table-index="0"] .filter-cell[data-column="1"] .column-filter')).textAlign
      };
    });
    assert.strictEqual(columnAlignment.text, 'start');
    assert.strictEqual(columnAlignment.number, 'right');
    assert.ok(columnAlignment.numberClass.indexOf('numeric-cell') !== -1);
    assert.strictEqual(columnAlignment.header, 'left');
    assert.notStrictEqual(columnAlignment.filter, 'right');
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="0"] .aggregate-button', function (nodes) { return nodes.length; }), 2);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="1"] .aggregate-button', function (nodes) { return nodes.length; }), 1);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.$('.selection-aggregate'), null);
    await page.click('.table-card[data-table-index="0"] .header-cell[data-column="2"] .aggregate-button');
    assert.strictEqual(await page.$eval('.aggregate-menu .menu-item-active', function (node) { return node.textContent; }), '\u2713 Нет');
    assert.deepStrictEqual(await page.$$eval('.aggregate-menu .menu-item', function (nodes) { return nodes.map(function (node) { return node.textContent.replace(/^\u2713\s*/, ''); }); }), ['Нет', 'Сумма', 'Среднее', 'Минимум', 'Максимум', 'Количество']);
    await page.click('.aggregate-menu .menu-item-active');
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'DOM-строк должно быть меньше 100');
    await page.evaluate(function () {
      var body = document.querySelector('.table-card[data-table-index="0"] .virtual-body');
      window.__virtualPool = Array.prototype.slice.call(body.children);
      window.__virtualMutations = { added: 0, removed: 0 };
      window.__virtualObserver = new MutationObserver(function (records) {
        for (var index = 0; index < records.length; index += 1) {
          window.__virtualMutations.added += records[index].addedNodes.length;
          window.__virtualMutations.removed += records[index].removedNodes.length;
        }
      });
      window.__virtualObserver.observe(body, { childList: true });
    });
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollLeft = 10; node.dispatchEvent(new Event('scroll')); });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.ok(await page.evaluate(function () {
      var current = document.querySelector('.table-card[data-table-index="0"] .virtual-body').children;
      if (current.length !== window.__virtualPool.length) return false;
      for (var index = 0; index < current.length; index += 1) if (current[index] !== window.__virtualPool[index]) return false;
      return window.__virtualMutations.added === 0 && window.__virtualMutations.removed === 0;
    }), 'Горизонтальная прокрутка не должна менять виртуальные строки');
    await page.evaluate(function () { window.__virtualMutations.added = 0; window.__virtualMutations.removed = 0; });
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = 10; });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__virtualMutations; }), { added: 0, removed: 0 });
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = 286; });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.ok(await page.evaluate(function () {
      var current = document.querySelector('.table-card[data-table-index="0"] .virtual-body').children;
      if (current.length !== window.__virtualPool.length || window.__virtualMutations.added > 1 || window.__virtualMutations.removed > 1) return false;
      for (var index = 0; index < current.length; index += 1) if (window.__virtualPool.indexOf(current[index]) === -1) return false;
      return true;
    }), 'Вертикальная прокрутка должна переиспользовать пул и обновлять только вошедшую строку');
    await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) { node.scrollTop = node.scrollHeight; });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-row-id="9999"]'), 'После прокрутки должна быть отрисована последняя строка');
    assert.ok(await page.evaluate(function () {
      var current = document.querySelector('.table-card[data-table-index="0"] .virtual-body').children;
      for (var index = 0; index < current.length; index += 1) if (window.__virtualPool.indexOf(current[index]) === -1) return false;
      window.__virtualObserver.disconnect(); return true;
    }), 'Быстрый переход должен обновлять существующий пул строк');
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'После прокрутки DOM остаётся ограниченным');

    await page.$eval('.global-search', function (input) { input.value = 'Искомый'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"]', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="1"]', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="1"] .data-row', function (nodes) {
      return nodes.map(function (node) { return node.querySelectorAll('.search-highlight').length; });
    }), [0, 0, 1], 'Предки найденного узла не должны подсвечиваться');
    await page.click('.global-search-control .search-clear-button');
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="0"]', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="1"]', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.$eval('.global-search-control .search-clear-button', function (node) { return getComputedStyle(node).display; }), 'none');

    await page.$eval('.global-search', function (input) { input.value = 'Строка'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 190); });
    const singleHeight = await page.$eval('.table-card[data-table-index="0"] .grid-viewport', function (node) {
      var box = node.getBoundingClientRect(); return { height: box.height, bottom: box.bottom, windowHeight: window.innerHeight };
    });
    assert.ok(singleHeight.height > 620, 'Одна большая таблица должна использовать доступную высоту');
    assert.ok(Math.abs(singleHeight.windowHeight - singleHeight.bottom - 8) <= 2, 'Одиночная таблица должна доходить до нижнего отступа');
    assert.ok(await page.$('.table-card[data-table-index="0"] .search-highlight'));
    await page.click('.global-search-control .search-clear-button');
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.strictEqual(await page.$('.data-row .search-highlight'), null, 'Переиспользованные строки должны терять старую подсветку');

    await selectColumnAggregate(page, 0, 2, 'Среднее');
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="2"]', function (node) { return node.textContent; }), '5000,5');
    await selectColumnAggregate(page, 0, 1, 'Сумма');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '49995000');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return getComputedStyle(node).textAlign; }), 'right');
    await selectColumnAggregate(page, 0, 2, 'Нет');
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');
    await selectColumnAggregate(page, 0, 1, 'Нет');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');

    await selectColumnAggregate(page, 0, 2, 'Сумма');
    await page.click('button[title="Настроить отображение колонок"]');
    await toggleColumnOption(page, 2);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');
    await toggleColumnOption(page, 2);
    assert.notStrictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-row', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="2"]', function (node) { return node.textContent; }), '50005000');
    await page.click('button[title="Настроить отображение колонок"]');
    await selectColumnAggregate(page, 0, 2, 'Нет');

    await page.click('.table-card[data-table-index="0"] .filter-cell[data-column="0"] .value-filter-button');
    assert.ok(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }) < 100, 'Список значений должен быть виртуализирован');
    await page.$$eval('.value-filter-commands .button', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Снять все') nodes[index].click();
    });
    await page.$eval('.value-filter-search', function (input) { input.value = 'Строка 9999'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }), 1);
    await page.click('.value-filter-search-control .search-clear-button');
    assert.ok(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }) > 1, 'Очистка поиска значений должна восстановить список');
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
    await clickContextMenuItem(page, 'Свернуть после');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 10000') !== -1);
    assert.strictEqual(await page.$eval('.range-marker-after', function (node) { return node.textContent; }), 'Показать 9999 скрытых строк');
    await page.click('.range-marker-after');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('10000 / 10000') !== -1);
    await page.click('.table-card[data-table-index="0"] [data-row-id="2"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Свернуть до');
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
    const firstToggle = await toggleColumnOption(page, 0);
    assert.deepStrictEqual(firstToggle, { panelOpen: true, keptDuringClick: true, replaced: true, checked: [false, true, true, true, true] });
    assert.strictEqual(await page.$('.table-card[data-table-index="0"] [data-column="0"]'), null);

    const secondToggle = await toggleColumnOption(page, 1);
    assert.deepStrictEqual(secondToggle, { panelOpen: true, keptDuringClick: true, replaced: true, checked: [false, false, true, true, true] });
    assert.strictEqual(await page.$('.table-card[data-table-index="0"] [data-column="1"]'), null);

    const restoreToggle = await toggleColumnOption(page, 0);
    assert.deepStrictEqual(restoreToggle, { panelOpen: true, keptDuringClick: true, replaced: true, checked: [true, false, true, true, true] });
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-column="0"]'));
    assert.strictEqual(await page.$('.table-card[data-table-index="0"] [data-column="1"]'), null);

    await page.click('.column-panel .panel-reset');
    assert.strictEqual(await page.$$eval('.column-option input', function (nodes) { return nodes.every(function (checkbox) { return checkbox.checked; }); }), true);
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-column="1"]'));

    const reopenToggle = await toggleColumnOption(page, 0);
    assert.deepStrictEqual(reopenToggle, { panelOpen: true, keptDuringClick: true, replaced: true, checked: [false, true, true, true, true] });
    await page.click('button[title="Настроить отображение колонок"]');
    assert.strictEqual(await page.$('.column-panel'), null);
    await page.click('button[title="Настроить отображение колонок"]');
    assert.strictEqual(await page.$eval('.column-option input', function (checkbox) { return checkbox.checked; }), false);
    await page.click('button[title="Настроить отображение колонок"]');
    assert.strictEqual(await page.$('.column-panel'), null);

    await page.click('.table-card[data-table-index="1"] .column-filter-search-control .search-clear-button');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('4 / 4') !== -1);
    const firstDataCell = '.table-card[data-table-index="1"] .data-row .data-cell';
    await page.click(firstDataCell, { button: 'right' });
    assert.deepStrictEqual(await page.$eval('body > .context-menu', function (menu) {
      return Array.prototype.map.call(menu.children, function (child) {
        if (child.className === 'menu-separator') return 'separator';
        return Array.prototype.map.call(child.children, function (item) { return item.firstElementChild && item.className === 'menu-submenu' ? item.firstElementChild.textContent : item.textContent; }).join('|');
      });
    }), ['Отбор по значению', 'separator', 'Зафиксировать строку|Зафиксировать колонку', 'separator', 'Сворачивание', 'separator', 'Уровень группировки']);
    await clickContextMenuItem(page, 'Зафиксировать колонку');
    assert.ok(await page.$('.table-card[data-table-index="1"] .pinned-column'));
    await page.click(firstDataCell, { button: 'right' });
    await clickContextMenuItem(page, 'Зафиксировать строку');
    assert.ok(await page.$('.table-card[data-table-index="1"] .pinned-row'));
    await page.click(firstDataCell, { button: 'right' });
    await clickContextMenuItem(page, 'Отбор по значению');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 4') !== -1);
    await page.$eval('.table-card[data-table-index="1"] .column-filter', function (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });

    assert.strictEqual(await page.evaluate(function () { return window.setTreeExpanded(1, false); }), true);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="1"] .data-row:not(.pinned-row)', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.evaluate(function () { return window.setTreeExpanded(1, true); }), true);
    assert.ok(await page.$$eval('.table-card[data-table-index="1"] .data-row', function (nodes) { return nodes.length; }) >= 4);
    await page.click(firstDataCell);
    assert.ok(await page.$('.table-card[data-table-index="1"] .selected-cell'));
    await page.click(firstDataCell, { button: 'right' });
    assert.strictEqual(await page.$$eval('body > .context-menu > .menu-group', function (groups) { return groups[1].textContent; }), 'Открепить строкуОткрепить колонкуОтменить фиксацию');
    await clickContextMenuItem(page, 'Отменить фиксацию');
    assert.strictEqual(await page.$('.table-card[data-table-index="1"] .pinned-row'), null);
    assert.strictEqual(await page.$('.table-card[data-table-index="1"] .pinned-column'), null);
    assert.strictEqual(await page.$('.table-card[data-table-index="1"] .selected-cell'), null);
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
      window.setData({ tables: [
        { name: 'Сворачивание', columns: ['Название', 'Сумма'], rows: [
          { columns: ['A', '1'] }, { columns: ['B', '2'] }, { columns: ['C', '3'] },
          { columns: ['D', '4'] }, { columns: ['E', '5'] }, { columns: ['F', '6'] }
        ] },
        { name: 'Уровни', columns: ['Название', 'Сумма'], rows: [
          { columns: ['Корень', '10'], children: [
            { columns: ['Ветка', '20'], children: [{ columns: ['Лист', '30'], children: [] }] },
            { columns: ['Сосед', '40'], children: [] }
          ] },
          { columns: ['Второй корень', '50'], children: [] }
        ] }
      ] });
    });
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="1"] .tree-level-button', function (nodes) {
      return nodes.map(function (node) { return { text: node.textContent, title: node.title, label: node.getAttribute('aria-label') }; });
    }), [
      { text: '1', title: 'Уровень группировки 1', label: 'Уровень группировки 1' },
      { text: '2', title: 'Уровень группировки 2', label: 'Уровень группировки 2' },
      { text: '3', title: 'Уровень группировки 3', label: 'Уровень группировки 3' }
    ]);
    await page.click('.table-card[data-table-index="1"] .tree-level-button:nth-child(1)');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('2 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] .tree-level-button:nth-child(2)');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('4 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] .tree-level-button:nth-child(3)');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('5 / 5') !== -1);
    await selectColumnAggregate(page, 0, 1, 'Сумма');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '21');

    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    assert.deepStrictEqual(await page.$eval('body > .context-menu', function (menu) {
      return Array.prototype.map.call(menu.children, function (child) {
        if (child.className === 'menu-separator') return 'separator';
        return Array.prototype.map.call(child.children, function (item) { return item.className === 'menu-submenu' ? item.firstElementChild.textContent : item.textContent; }).join('|');
      });
    }), ['Отбор по значению', 'separator', 'Зафиксировать строку|Зафиксировать колонку', 'separator', 'Сворачивание']);
    await openContextSubmenu(page, 'Сворачивание');
    assert.deepStrictEqual(await page.$$eval('.menu-submenu-open > .context-submenu .menu-item', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Свернуть выделенные', 'Свернуть до', 'Свернуть после']);
    assert.deepStrictEqual(await page.$eval('.menu-submenu-open > .context-submenu', function (node) {
      var box = node.getBoundingClientRect();
      return { visible: getComputedStyle(node).display !== 'none', inside: box.left >= 4 && box.top >= 4 && box.right <= window.innerWidth - 4 && box.bottom <= window.innerHeight - 4 };
    }), { visible: true, inside: true });
    assert.strictEqual(await page.$eval('.menu-submenu-open > .menu-submenu-trigger', function (node) { return node.getAttribute('aria-expanded'); }), 'true');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.$('body > .context-menu'), null);

    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .number-cell', { button: 'right' });
    assert.deepStrictEqual(await page.$eval('body > .context-menu', function (menu) {
      return Array.prototype.map.call(menu.children, function (child) {
        if (child.className === 'menu-separator') return 'separator';
        return Array.prototype.map.call(child.children, function (item) { return item.className === 'menu-submenu' ? item.firstElementChild.textContent : item.textContent; }).join('|');
      });
    }), ['Зафиксировать строку', 'separator', 'Сворачивание']);
    await page.keyboard.press('Escape');

    await page.click('.table-card[data-table-index="0"] [data-row-id="4"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Зафиксировать строку');
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-row-id="4"].pinned-row'));
    const selectedFirst = await page.$eval('.table-card[data-table-index="0"] [data-row-id="1"] .data-cell', function (node) { var box = node.getBoundingClientRect(); return { x: box.x, y: box.y }; });
    const selectedLast = await page.$eval('.table-card[data-table-index="0"] [data-row-id="2"] .data-cell', function (node) { var box = node.getBoundingClientRect(); return { x: box.x, y: box.y }; });
    await page.mouse.move(selectedFirst.x + 8, selectedFirst.y + 8); await page.mouse.down(); await page.mouse.move(selectedLast.x + 8, selectedLast.y + 8); await page.mouse.up();
    await page.click('.table-card[data-table-index="0"] [data-row-id="2"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Свернуть выделенные');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('4 / 6') !== -1);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .hidden-row-marker', function (node) { return node.textContent; }), 'Показать 2 скрытых строк');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '16');

    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Свернуть выделенные');
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .hidden-row-marker', function (node) { return node.textContent; }), 'Показать 3 скрытых строк');
    await page.click('.table-card[data-table-index="0"] [data-row-id="4"].pinned-row .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Свернуть выделенные');
    assert.strictEqual(await page.$('.table-card[data-table-index="0"] [data-row-id="4"].pinned-row'), null);
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="0"] .hidden-row-marker', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Показать 3 скрытых строк', 'Показать 1 скрытых строк']);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '10');
    await page.$$eval('.table-card[data-table-index="0"] .hidden-row-marker', function (nodes) { nodes[1].click(); });
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-row-id="4"].pinned-row'));
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '15');
    await page.click('.table-card[data-table-index="0"] .hidden-row-marker');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('6 / 6') !== -1);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="0"] .totals-cell[data-column="1"]', function (node) { return node.textContent; }), '21');

    await page.click('.table-card[data-table-index="1"] [data-row-id="0"] .data-cell', { button: 'right' });
    await openContextSubmenu(page, 'Уровень группировки');
    assert.deepStrictEqual(await page.$$eval('.menu-submenu-open > .context-submenu .menu-item', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Уровень 1', 'Уровень 2', 'Уровень 3']);
    await clickContextMenuItem(page, 'Уровень 1');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('2 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] [data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Уровень 2');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('4 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] [data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Уровень 1');
    await page.$eval('.table-card[data-table-index="1"] .column-filter', function (input) { input.value = 'Лист'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('3 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] .column-filter-search-control .search-clear-button');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('2 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] [data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Уровень 3');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('5 / 5') !== -1);
    await page.click('.table-card[data-table-index="1"] [data-row-id="0.0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Свернуть после');
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('2 / 5') !== -1);
    assert.strictEqual(await page.$eval('.table-card[data-table-index="1"] .range-marker-after', function (node) { return node.textContent; }), 'Показать 3 скрытых строк');
    await page.click('.table-card[data-table-index="1"] .range-marker-after');

    await page.evaluate(function () {
      window.__highlightEvents = [];
      document.getElementById('event-button').addEventListener('click', function (event) {
        if (event.eventData1C) window.__highlightEvents.push(event.eventData1C);
      });
      window.setData({ tables: [
        { name: 'Поиск', columns: ['Ссылка', 'Наименование'], rows: [
          { columns: [{ label: '1С:Управление торговлей 8', ref: 'e1cib/data/Test?ref=search' }, '1С:Управление торговлей 8'] },
          { columns: ['Управление', 'Торговля'] },
          { columns: ['Торговля и управление', 'Обратный порядок'] }
        ] },
        { name: 'Дерево поиска', columns: ['Ссылка', 'Наименование'], rows: [
          { columns: ['Управление', 'Корень'], children: [
            { columns: [{ label: 'Управление торговлей', ref: 'e1cib/data/Test?ref=tree-search' }, 'Управление торговлей'], children: [] }
          ] }
        ] }
      ] });
    });
    await page.$eval('.global-search', function (input) { input.value = '  УПРАВ   тор  '; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 3') !== -1);
    assert.ok((await page.$eval('.table-card[data-table-index="1"] .table-count', function (node) { return node.textContent; })).indexOf('2 / 2') !== -1);
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="0"] [data-row-id="0"] .search-highlight', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Управ', 'тор', 'Управ', 'тор']);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="1"] [data-row-id="0"] .search-highlight', function (nodes) { return nodes.length; }), 0);
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="1"] [data-row-id="0.0"] .search-highlight', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Управ', 'тор', 'Управ', 'тор']);
    await page.click('.table-card[data-table-index="0"] .cell-link .search-highlight');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__highlightEvents; }), [
      { event: 'EVENT_ON_LINK_CLICK', params: { label: '1С:Управление торговлей 8', href: 'e1cib/data/Test?ref=search' } }
    ]);
    await page.click('.global-search-control .search-clear-button');
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('3 / 3') !== -1);

    const nameFilter = '.table-card[data-table-index="0"] .filter-cell[data-column="1"] .column-filter';
    await page.$eval(nameFilter, function (input) { input.value = 'управ тор'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('1 / 3') !== -1);
    assert.deepStrictEqual(await page.$$eval('.table-card[data-table-index="0"] [data-row-id="0"] [data-column="1"] .search-highlight', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['Управ', 'тор']);
    assert.strictEqual(await page.$$eval('.table-card[data-table-index="0"] [data-row-id="0"] [data-column="0"] .search-highlight', function (nodes) { return nodes.length; }), 0);
    await page.click('.table-card[data-table-index="0"] .filter-cell[data-column="1"] .search-clear-button');
    assert.ok((await page.$eval('.table-card[data-table-index="0"] .table-count', function (node) { return node.textContent; })).indexOf('3 / 3') !== -1);

    await page.click('.table-card[data-table-index="0"] .filter-cell[data-column="1"] .value-filter-button');
    await page.$eval('.value-filter-search', function (input) { input.value = 'Обратный'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.strictEqual(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }), 1);
    await page.click('.value-filter-search-control .search-clear-button');
    assert.strictEqual(await page.$$eval('.value-filter-option', function (nodes) { return nodes.length; }), 3);
    assert.strictEqual(await page.$eval('.value-filter-search-control .search-clear-button', function (node) { return getComputedStyle(node).display; }), 'none');
    await page.$$eval('.value-filter-actions .button', function (nodes) {
      for (var index = 0; index < nodes.length; index += 1) if (nodes[index].textContent === 'Отмена') nodes[index].click();
    });

    const emptyRef = '00000000000000000000000000000000';
    await page.evaluate(function (suffix) {
      window.init({ tables: [{ name: 'Представления', columns: ['Значение'], rows: [
        { columns: [-2] },
        { columns: ['-1,5'] },
        { columns: ['-10%'] },
        { columns: [0] },
        { columns: ['0'] },
        { columns: [{ label: '', ref: 'e1cib/data/Справочник._ДемоВидыНоменклатуры?ref=' + suffix }] },
        { columns: [{ label: 'Исходная подпись', ref: 'e1cib/data/Документ.Тест?ref=' + suffix }] },
        { columns: [{ label: '', ref: 'custom-' + suffix }] },
        { columns: [{ label: 'Обычная ссылка', ref: 'e1cib/data/Документ.Тест?ref=1' }] }
      ] }] });
      window.__displayEvents = [];
      document.getElementById('event-button').addEventListener('click', function (event) {
        if (event.eventData1C) window.__displayEvents.push(event.eventData1C);
      });
    }, emptyRef);
    assert.notStrictEqual(await page.$eval('[data-row-id="0"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(198, 40, 40)');
    assert.deepStrictEqual(await page.evaluate(function () {
      return [
        window.setNegativeNumberColor('не-цвет'),
        window.setCellValuePresentation({}, 'объект'),
        window.setCellValuePresentation('0', 0),
        window.setCellValueColor('0', 'не-цвет'),
        window.setEmptyReferenceColor('')
      ];
    }), [false, false, false, false, false]);
    assert.deepStrictEqual(await page.evaluate(function () {
      return [
        window.setNegativeNumberColor('#c62828'),
        window.setCellValuePresentation('0', '<0>'),
        window.setCellValueColor('-1,5', '#616161'),
        window.setShowEmptyReferences(true)
      ];
    }), [true, true, true, true]);
    assert.deepStrictEqual(await page.$$eval('.data-row .data-cell', function (nodes) {
      return nodes.map(function (node) { var link = node.querySelector('.cell-link'); return { text: node.textContent, color: getComputedStyle(link || node).color, title: node.title, links: node.querySelectorAll('.cell-link').length }; });
    }), [
      { text: '-2', color: 'rgb(198, 40, 40)', title: '-2', links: 0 },
      { text: '-1,5', color: 'rgb(97, 97, 97)', title: '-1,5', links: 0 },
      { text: '-10%', color: 'rgb(198, 40, 40)', title: '-10%', links: 0 },
      { text: '0', color: 'rgb(49, 65, 87)', title: '0', links: 0 },
      { text: '<0>', color: 'rgb(49, 65, 87)', title: '<0>', links: 0 },
      { text: '<Справочник._ДемоВидыНоменклатуры (пустая)>', color: 'rgb(109, 125, 145)', title: '<Справочник._ДемоВидыНоменклатуры (пустая)>', links: 0 },
      { text: '<Документ.Тест (пустая)>', color: 'rgb(109, 125, 145)', title: '<Документ.Тест (пустая)>', links: 0 },
      { text: '<пустая ссылка>', color: 'rgb(109, 125, 145)', title: '<пустая ссылка>', links: 0 },
      { text: 'Обычная ссылка', color: 'rgb(47, 126, 232)', title: 'Обычная ссылка', links: 1 }
    ]);
    assert.strictEqual(await page.evaluate(function () { return window.setCellValuePresentation('0', '<img src=x onerror=alert(1)>'); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="4"] .data-cell', function (node) { return node.textContent; }), '<img src=x onerror=alert(1)>');
    assert.strictEqual(await page.$$eval('.data-cell img', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.evaluate(function () { return window.setCellValuePresentation('0', null); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="4"] .data-cell', function (node) { return node.textContent; }), '0');
    assert.strictEqual(await page.evaluate(function () { return window.setCellValuePresentation('0', '<0>'); }), true);
    assert.strictEqual(await page.evaluate(function () { return window.setCellValueColor('-1,5', null); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="1"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(198, 40, 40)');
    assert.strictEqual(await page.evaluate(function () { return window.setCellValueColor('-1,5', '#616161'); }), true);
    assert.strictEqual(await page.evaluate(function () { return window.setNegativeNumberColor(null); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="0"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(49, 65, 87)');
    assert.strictEqual(await page.$eval('[data-row-id="1"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(97, 97, 97)');
    assert.strictEqual(await page.evaluate(function () { return window.setNegativeNumberColor('#c62828'); }), true);
    await page.click('[data-row-id="1"] .data-cell');
    assert.strictEqual(await page.$eval('[data-row-id="1"] .data-cell.selected-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(97, 97, 97)');
    await page.click('[data-row-id="5"] .data-cell');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__displayEvents; }), []);
    await page.click('[data-row-id="8"] .cell-link');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__displayEvents; }), [
      { event: 'EVENT_ON_LINK_CLICK', params: { label: 'Обычная ссылка', href: 'e1cib/data/Документ.Тест?ref=1' } }
    ]);
    assert.strictEqual(await page.evaluate(function () { return window.setEmptyReferenceColor('#78909c'); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="5"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(120, 144, 156)');
    assert.strictEqual(await page.evaluate(function () { return window.setEmptyReferenceColor(null); }), true);
    assert.strictEqual(await page.$eval('[data-row-id="5"] .data-cell', function (node) { return getComputedStyle(node).color; }), 'rgb(109, 125, 145)');
    assert.strictEqual(await page.evaluate(function () { return window.setShowEmptyReferences(false); }), true);
    assert.deepStrictEqual(await page.$eval('[data-row-id="6"] .data-cell', function (node) { return { text: node.textContent, links: node.querySelectorAll('.cell-link').length }; }), { text: 'Исходная подпись', links: 1 });
    assert.strictEqual(await page.evaluate(function () { return window.setShowEmptyReferences(true); }), true);

    await page.$eval('.global-search', function (input) { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 160); });
    assert.deepStrictEqual(await page.$$eval('[data-row-id="4"] .search-highlight', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['0']);
    await page.click('.global-search-control .search-clear-button');
    await new Promise(function (resolve) { setTimeout(resolve, 160); });

    assert.strictEqual(await page.evaluate(function (suffix) {
      var rows = [];
      for (var index = 0; index < 200; index += 1) rows.push({ columns: ['Строка ' + index] });
      rows[0] = { columns: ['0'] };
      rows[198] = { columns: [{ label: 'Не показывать', ref: 'e1cib/data/Справочник.Тест?ref=' + suffix }] };
      rows[199] = { columns: [-3] };
      return window.setData({ tables: [{ name: 'Сохранение настроек', columns: ['Значение'], rows: rows }] });
    }, emptyRef), true);
    assert.strictEqual(await page.$eval('[data-row-id="0"] .data-cell', function (node) { return node.textContent; }), '<0>');
    await page.click('[data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Зафиксировать строку');
    assert.strictEqual(await page.$eval('[data-row-id="0"].pinned-row .data-cell', function (node) { return node.textContent; }), '<0>');
    await page.$eval('.grid-viewport', function (node) { node.scrollTop = node.scrollHeight; });
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
    assert.deepStrictEqual(await page.$eval('[data-row-id="198"] .data-cell', function (node) { return { text: node.textContent, color: getComputedStyle(node).color, links: node.querySelectorAll('.cell-link').length }; }), {
      text: '<Справочник.Тест (пустая)>', color: 'rgb(109, 125, 145)', links: 0
    });
    assert.deepStrictEqual(await page.$eval('[data-row-id="199"] .data-cell', function (node) { return { text: node.textContent, color: getComputedStyle(node).color }; }), {
      text: '-3', color: 'rgb(198, 40, 40)'
    });
    assert.strictEqual(await page.evaluate(function (suffix) {
      return window.init({ tables: [{ name: 'Сброс настроек', columns: ['Значение'], rows: [
        { columns: ['0'] }, { columns: [-3] },
        { columns: [{ label: 'После init', ref: 'e1cib/data/Справочник.Тест?ref=' + suffix }] }
      ] }] });
    }, emptyRef), true);
    assert.deepStrictEqual(await page.$$eval('.data-row .data-cell', function (nodes) {
      return nodes.map(function (node) { var link = node.querySelector('.cell-link'); return { text: node.textContent, color: getComputedStyle(link || node).color, links: node.querySelectorAll('.cell-link').length }; });
    }), [
      { text: '0', color: 'rgb(49, 65, 87)', links: 0 },
      { text: '-3', color: 'rgb(49, 65, 87)', links: 0 },
      { text: 'После init', color: 'rgb(47, 126, 232)', links: 1 }
    ]);

    await page.evaluate(function () {
      window.__events = [];
      document.getElementById('event-button').addEventListener('click', function (event) { window.__events.push(event.eventData1C); });
      window.setData({ tables: [{ name: 'События', columns: ['Ссылка', 'Сумма'], rows: [{ columns: [{ label: 'Открыть', ref: 'e1cib/data/Test?ref=1' }, '25'] }, { columns: ['Без ссылки', '15'] }] }] });
    });
    assert.ok(await page.$eval('.grid-viewport', function (node) { return node.getBoundingClientRect().height; }) < 240, 'Короткая одиночная таблица не должна растягиваться');
    await page.click('.cell-link');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    await page.$eval('.export-button', function (node) { node.click(); });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    const events = await page.evaluate(function () { return window.__events; });
    assert.deepStrictEqual(events, [
      { event: 'EVENT_ON_LINK_CLICK', params: { label: 'Открыть', href: 'e1cib/data/Test?ref=1' } },
      { event: 'EVENT_EXPORT', params: {} }
    ]);

    assert.deepStrictEqual(await page.evaluate(function () {
      return [
        window.addContextMenuItem('', 'EVENT_EMPTY_TITLE'),
        window.addContextMenuItem('Пустое событие', '   '),
        window.addContextMenuItem(null, 'EVENT_NULL_TITLE'),
        window.addContextMenuItem('Некорректное событие', null),
        window.addContextMenuItem('<img src=x onerror=alert(1)>', 'EVENT_CELL_VALUE'),
        window.addContextMenuItem('Вторая команда', 'EVENT_SECOND')
      ];
    }), [false, false, false, false, true, true]);
    await page.evaluate(function () {
      window.setData({ tables: [
        { name: 'Пользовательские события', columns: ['Значение'], rows: [
          { columns: ['Текст'] },
          { columns: [42] },
          { columns: [true] },
          { columns: [null] },
          { columns: [{ label: 'Ссылка', ref: 'e1cib/data/Test?ref=custom' }] }
        ] },
        { name: 'Дерево событий', columns: ['Значение'], rows: [
          { columns: ['Корень'], children: [{ columns: ['Лист'], children: [] }] }
        ] }
      ] });
    });
    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    assert.deepStrictEqual(await page.$eval('body > .context-menu', function (menu) {
      return Array.prototype.map.call(menu.children, function (child) {
        if (child.className === 'menu-separator') return 'separator';
        return Array.prototype.map.call(child.children, function (item) { return item.className === 'menu-submenu' ? item.firstElementChild.textContent : item.textContent; }).join('|');
      });
    }), [
      'Отбор по значению', 'separator', 'Зафиксировать строку|Зафиксировать колонку', 'separator',
      'Сворачивание', 'separator', '<img src=x onerror=alert(1)>|Вторая команда'
    ]);
    assert.strictEqual(await page.$$eval('.context-menu img', function (nodes) { return nodes.length; }), 0);
    await page.click('.table-card[data-table-index="1"] [data-row-id="0"] .data-cell', { button: 'right' });
    assert.strictEqual(await page.$$eval('.context-menu .custom-menu-item', function (nodes) { return nodes.length; }), 2);
    assert.strictEqual(await page.$$eval('body > .context-menu > .menu-separator', function (nodes) { return nodes.length; }), 4);
    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .number-cell', { button: 'right' });
    assert.strictEqual(await page.$$eval('.context-menu .custom-menu-item', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.$$eval('body > .context-menu > .menu-separator', function (nodes) { return nodes.length; }), 1);

    for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
      await page.click('.table-card[data-table-index="0"] [data-row-id="' + rowIndex + '"] .data-cell', { button: 'right' });
      await page.$$eval('.context-menu .custom-menu-item', function (nodes) { nodes[0].click(); });
      await new Promise(function (resolve) { setTimeout(resolve, 30); });
    }
    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    await page.$$eval('.context-menu .custom-menu-item', function (nodes) { nodes[1].click(); });
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.evaluate(function () { return window.__events.slice(-6); }), [
      { event: 'EVENT_CELL_VALUE', params: { value: 'Текст' } },
      { event: 'EVENT_CELL_VALUE', params: { value: 42 } },
      { event: 'EVENT_CELL_VALUE', params: { value: true } },
      { event: 'EVENT_CELL_VALUE', params: { value: null } },
      { event: 'EVENT_CELL_VALUE', params: { value: 'Ссылка', ref: 'e1cib/data/Test?ref=custom' } },
      { event: 'EVENT_SECOND', params: { value: 'Текст' } }
    ]);

    await page.evaluate(function () {
      window.init({ tables: [{ name: 'События', columns: ['Ссылка', 'Сумма'], rows: [
        { columns: [{ label: 'Открыть', ref: 'e1cib/data/Test?ref=1' }, '25'] },
        { columns: ['Без ссылки', '15'] }
      ] }] });
    });
    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    assert.strictEqual(await page.$$eval('.context-menu .custom-menu-item', function (nodes) { return nodes.length; }), 0);

    const cells = await page.$$('.table-card[data-table-index="0"] .data-cell[data-column="1"]');
    const first = await cells[0].boundingBox(); const second = await cells[1].boundingBox();
    await page.mouse.move(first.x + 8, first.y + 8); await page.mouse.down(); await page.mouse.move(second.x + 8, second.y + 8); await page.mouse.up();
    await page.click('.selection-aggregate-button');
    assert.deepStrictEqual(await page.$$eval('.selection-result-row', function (nodes) {
      return nodes.map(function (node) { return { label: node.querySelector('.selection-result-label').textContent, value: node.querySelector('.selection-result-value').textContent }; });
    }), [
      { label: 'Сумма', value: '40' },
      { label: 'Среднее', value: '20' },
      { label: 'Минимум', value: '15' },
      { label: 'Максимум', value: '25' },
      { label: 'Количество', value: '2' }
    ]);
    assert.strictEqual(await page.$eval('.selection-aggregate-button', function (node) { return node.getAttribute('aria-expanded'); }), 'true');
    await page.click('.selection-aggregate-button');
    assert.strictEqual(await page.$('.selection-aggregates-popup'), null);
    await page.click('.selection-aggregate-button');
    await page.mouse.move(first.x + 8, first.y + 8); await page.mouse.down();
    assert.deepStrictEqual(await page.$$eval('.selection-result-value', function (nodes) { return nodes.map(function (node) { return node.textContent; }); }), ['25', '25', '25', '25', '1']);
    await page.mouse.up();
    assert.strictEqual(await page.$('.selection-aggregates-popup'), null);
    await page.click('.selection-aggregate-button');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.$('.selection-aggregates-popup'), null);

    assert.strictEqual(await page.evaluate(function () { return window.collapseAll(); }), true);
    assert.strictEqual(await page.$eval('.grid-host', function (node) { return getComputedStyle(node).display; }), 'none');
    assert.strictEqual(await page.evaluate(function () { return window.expandAll(); }), true);
    assert.notStrictEqual(await page.$eval('.grid-host', function (node) { return getComputedStyle(node).display; }), 'none');

    assert.strictEqual(await page.evaluate(function () {
      var rows = [];
      var phrase = 'Длинный текст для проверки переноса на несколько строк внутри узкой ячейки. ';
      var token = 'ОченьДлинноеНепрерывноеЗначениеБезПробелов';
      for (var index = 0; index < 10000; index += 1) rows.push({ columns: [index === 1 ? token + token + token : phrase + phrase + index, String(index)] });
      return window.setData({ tables: [{ name: 'Перенос', columns: ['Текст', 'Номер'], rows: rows }] });
    }), true);
    await page.setViewport({ width: 520, height: 700 });
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
    await page.click('.table-card[data-table-index="0"] [data-row-id="0"] .data-cell', { button: 'right' });
    await clickContextMenuItem(page, 'Зафиксировать строку');
    const nowrapGeometry = await page.$eval('.table-card[data-table-index="0"] [data-row-id="1"]', function (node) {
      var cell = node.querySelector('.data-cell'); var style = getComputedStyle(cell);
      return { rowHeight: node.getBoundingClientRect().height, whiteSpace: style.whiteSpace, overflow: style.textOverflow };
    });
    assert.deepStrictEqual(nowrapGeometry, { rowHeight: 26, whiteSpace: 'nowrap', overflow: 'ellipsis' });
    await page.click('.wrap-text-button');
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    assert.strictEqual(await page.$eval('.wrap-text-button', function (node) { return node.getAttribute('aria-pressed'); }), 'true');
    assert.ok(await page.$eval('.wrap-text-button', function (node) { return getComputedStyle(node).boxShadow.indexOf('inset') !== -1; }));
    const wrappedGeometry = await page.evaluate(function () {
      function geometry(selector) {
        var row = document.querySelector(selector); var cell = row.querySelector('.data-cell'); var style = getComputedStyle(cell);
        return { rowHeight: row.getBoundingClientRect().height, cellHeight: cell.getBoundingClientRect().height, scrollHeight: cell.scrollHeight, whiteSpace: style.whiteSpace, overflow: style.textOverflow };
      }
      return {
        regular: geometry('.table-card[data-table-index="0"] [data-row-id="1"]'),
        pinned: geometry('.table-card[data-table-index="0"] .pinned-row'),
        header: getComputedStyle(document.querySelector('.sort-button')).whiteSpace,
        filter: getComputedStyle(document.querySelector('.filter-cell')).whiteSpace
      };
    });
    assert.ok(wrappedGeometry.regular.rowHeight > 26 && wrappedGeometry.pinned.rowHeight > 26);
    assert.strictEqual(wrappedGeometry.regular.rowHeight, wrappedGeometry.regular.cellHeight);
    assert.ok(wrappedGeometry.regular.scrollHeight <= wrappedGeometry.regular.cellHeight);
    assert.strictEqual(wrappedGeometry.regular.whiteSpace, 'normal');
    assert.strictEqual(wrappedGeometry.regular.overflow, 'clip');
    assert.strictEqual(wrappedGeometry.header, 'nowrap');
    assert.strictEqual(wrappedGeometry.filter, 'nowrap');
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'Перенос не должен отключать виртуализацию');
    await page.$eval('.grid-viewport', function (node) { node.scrollTop = 5000; });
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    async function topWrappedRow() {
      return page.$eval('.grid-viewport', function (viewport) {
        var target = viewport.getBoundingClientRect().top + 120; var rows = viewport.querySelectorAll('.virtual-body .data-row'); var best = null; var distance = Infinity;
        for (var index = 0; index < rows.length; index += 1) {
          var current = Math.abs(rows[index].getBoundingClientRect().top - target);
          if (current < distance) { distance = current; best = rows[index].getAttribute('data-row-id'); }
        }
        return best;
      });
    }
    const anchorBeforeResize = await topWrappedRow();
    await page.setViewport({ width: 460, height: 700 });
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    assert.strictEqual(await topWrappedRow(), anchorBeforeResize, 'Изменение ширины должно сохранять логическую верхнюю строку');
    assert.ok(await page.$$eval('.virtual-body .data-row', function (nodes) {
      var rows = Array.prototype.map.call(nodes, function (node) { var rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; }).sort(function (left, right) { return left.top - right.top; });
      for (var index = 1; index < rows.length; index += 1) if (rows[index].top < rows[index - 1].bottom - 1) return false;
      return true;
    }), 'Многострочные строки не должны накладываться после resize');
    const anchorBeforeScale = await topWrappedRow();
    await page.$eval('.table-card[data-table-index="0"] input[type="range"]', function (input) { input.value = '110'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    assert.strictEqual(await topWrappedRow(), anchorBeforeScale, 'Изменение масштаба должно сохранять логическую верхнюю строку');
    await page.$eval('.grid-viewport', function (node) { node.scrollTop = node.scrollHeight; });
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    assert.ok(await page.$('.table-card[data-table-index="0"] [data-row-id="9999"]'), 'В режиме переноса должна быть доступна последняя строка');
    assert.ok(await page.$$eval('.data-row', function (nodes) { return nodes.length; }) < 100, 'Пул строк с переносом должен оставаться ограниченным');
    assert.strictEqual(await page.evaluate(function () {
      return window.setData({ tables: [{ name: 'Сохранение режима', columns: ['Текст'], rows: [{ columns: ['Длинный текст после setData Длинный текст после setData'] }] }] });
    }), true);
    assert.strictEqual(await page.$eval('.wrap-text-button', function (node) { return node.getAttribute('aria-pressed'); }), 'true');
    await page.click('.wrap-text-button');
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    assert.deepStrictEqual(await page.$eval('.data-row', function (node) { var cell = node.querySelector('.data-cell'); return { height: node.getBoundingClientRect().height, whiteSpace: getComputedStyle(cell).whiteSpace }; }), { height: 26, whiteSpace: 'nowrap' });
    await page.setViewport({ width: 1280, height: 800 });

    assert.strictEqual(await page.evaluate(function () {
      return window.init({
        tables: [{
          id: 'metrics',
          name: 'Показатели',
          columns: [
            { id: 'city', name: 'Город' },
            { id: 'amount', name: 'Сумма' },
            { id: 'comment', name: 'Комментарий' }
          ],
          rows: [{ columns: ['Москва', '100', 'Главный'] }, { columns: ['Казань', '200', 'Резервный'] }]
        }],
        settings: {
          version: 1,
          globalFilter: 'моск',
          tables: [{
            id: 'metrics',
            scale: 120,
            columnOrder: ['amount', 'city', 'comment'],
            pinnedColumns: ['amount'],
            pinnedRows: [1],
            columns: [
              { id: 'city', width: 210, filter: { text: '', exact: false, values: ['Москва'] } },
              { id: 'amount', width: 190, aggregate: 'sum' },
              { id: 'comment', visible: false }
            ]
          }]
        }
      });
    }), true);
    assert.strictEqual(await page.$eval('.wrap-text-button', function (node) { return node.getAttribute('aria-pressed'); }), 'false');
    assert.strictEqual(await page.$eval('.scale-value', function (node) { return node.textContent; }), '120%');
    assert.deepStrictEqual(await page.$$eval('.header-cell .sort-button', function (nodes) {
      return nodes.map(function (node) { return node.textContent; });
    }), ['Сумма', 'Город']);
    assert.strictEqual(await page.$$eval('.data-row:not(.pinned-row)', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.$$eval('.pinned-row', function (nodes) { return nodes.length; }), 1);
    assert.ok(await page.$('.header-cell[data-column="1"].pinned-column'));
    assert.strictEqual(await page.$eval('.totals-cell[data-column="1"]', function (node) { return node.textContent; }), '100');

    const settingsSnapshot = await page.evaluate(function () {
      var json = window.getSettings();
      return { type: typeof json, json: json, value: JSON.parse(json) };
    });
    assert.strictEqual(settingsSnapshot.type, 'string');
    assert.strictEqual(settingsSnapshot.value.version, 1);
    assert.strictEqual(settingsSnapshot.value.tables[0].id, 'metrics');
    assert.deepStrictEqual(settingsSnapshot.value.tables[0].columnOrder, ['amount', 'city', 'comment']);
    assert.deepStrictEqual(settingsSnapshot.value.tables[0].pinnedColumns, ['amount']);
    assert.deepStrictEqual(settingsSnapshot.value.tables[0].pinnedRows, [1]);
    assert.strictEqual(settingsSnapshot.value.tables[0].columns[0].width, 210);
    assert.deepStrictEqual(settingsSnapshot.value.tables[0].columns[0].filter.values, ['Москва']);

    assert.strictEqual(await page.evaluate(function () {
      return window.setSettings(JSON.stringify({
        globalFilter: '',
        tables: [{ id: 'metrics', index: 99, scale: 150, columnOrder: ['city'], pinnedColumns: [], pinnedRows: [], columns: [
          { id: 'city', filter: null },
          { id: 'amount', aggregate: 'average', filter: { values: [] } },
          { id: 'comment', visible: true }
        ] }]
      }));
    }), true);
    assert.strictEqual(await page.$eval('.scale-value', function (node) { return node.textContent; }), '150%');
    assert.deepStrictEqual(await page.$$eval('.header-cell .sort-button', function (nodes) {
      return nodes.map(function (node) { return node.textContent; });
    }), ['Город', 'Сумма', 'Комментарий']);
    assert.strictEqual(await page.$$eval('.data-row:not(.pinned-row)', function (nodes) { return nodes.length; }), 0);

    assert.strictEqual(await page.evaluate(function (snapshot) { return window.setSettings(snapshot); }, settingsSnapshot.json), true);
    assert.strictEqual(await page.$eval('.scale-value', function (node) { return node.textContent; }), '120%');
    assert.deepStrictEqual(await page.$$eval('.header-cell .sort-button', function (nodes) {
      return nodes.map(function (node) { return node.textContent; });
    }), ['Сумма', 'Город']);
    assert.strictEqual(await page.$$eval('.data-row:not(.pinned-row)', function (nodes) { return nodes.length; }), 0);
    assert.strictEqual(await page.$$eval('.pinned-row', function (nodes) { return nodes.length; }), 1);
    assert.ok(await page.$('.header-cell[data-column="1"].pinned-column'));

    const errorsBeforeValidation = errors.length;
    assert.strictEqual(await page.evaluate(function () { return window.setData('{"tables":[],}'); }), false);
    assert.ok(await page.$('.error-box'));
    assert.strictEqual(errors.length, errorsBeforeValidation + 1);
    errors.splice(errorsBeforeValidation, 1);
    assert.strictEqual(await page.evaluate(function () { return window.setData({ tables: [] }); }), true);
    assert.ok(await page.$('.empty-state'));

    assert.strictEqual(await page.evaluate(function () {
      window.dispatchEvent(new Event('scroll'));
      return (' ' + document.documentElement.className + ' ').indexOf(' scrollbar-active ') !== -1;
    }), true);
    assert.strictEqual(await page.evaluate(function () { return window.destroy(); }), true);
    assert.strictEqual(await page.evaluate(function () { return window.addContextMenuItem('После destroy', 'EVENT_AFTER_DESTROY'); }), false);
    assert.deepStrictEqual(await page.evaluate(function () {
      return [
        window.setNegativeNumberColor('red'),
        window.setCellValuePresentation('0', '<0>'),
        window.setCellValueColor('0', 'gray'),
        window.setShowEmptyReferences(true),
        window.setEmptyReferenceColor('gray'),
        window.getSettings(),
        window.setSettings({})
      ];
    }), [false, false, false, false, false, false, false]);
    assert.strictEqual(await page.evaluate(function () { return (' ' + document.documentElement.className + ' ').indexOf(' scrollbar-active ') !== -1; }), false, 'destroy должен очистить активность страницы');

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
