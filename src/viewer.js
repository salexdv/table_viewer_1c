var model = require('./model');

var currentApp = null;

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function addButton(parent, text, title, onClick, className) {
  var button = element('button', className || 'button', text);
  button.type = 'button';
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  parent.appendChild(button);
  return button;
}

function arrayIndex(array, value) {
  for (var index = 0; index < array.length; index += 1) if (array[index] === value) return index;
  return -1;
}

function removeValue(array, value) {
  var index = arrayIndex(array, value);
  if (index !== -1) array.splice(index, 1);
}

function getDemoData() {
  return {
    tables: [
      {
        name: 'Заявки на ремонт',
        columns: ['Ссылка', 'Номер', 'Дата', 'Описание', 'Статус', 'Стоимость'],
        rows: [
          { columns: [{ label: 'Заявка 000000001', ref: 'e1cib/data/Документ.ЗаявкаНаРемонт?ref=1' }, '000000001', '06.09.2026 14:18:01', 'Почините принтер', 'Закрыта', '1 250,50'] },
          { columns: [{ label: 'Заявка 000000002', ref: 'e1cib/data/Документ.ЗаявкаНаРемонт?ref=2' }, '000000002', '07.09.2026 09:30:00', 'Купите тонер', 'В работе', '850'] }
        ]
      },
      {
        name: 'Дерево номенклатуры',
        columns: ['Наименование', 'Код', 'Тип', 'Ставка НДС'],
        rows: [{
          columns: ['Оборудование', '00-000001', 'Группа', null],
          children: [{
            columns: ['Оргтехника', '00-000010', 'Группа', null],
            children: [
              { columns: ['Принтер', '000394', 'Товар', '20%'], children: [] },
              { columns: ['Сканер', '000395', 'Товар', '20%'], children: [] }
            ]
          }]
        }]
      }
    ]
  };
}

function createBridge() {
  if (!Array.isArray(window.events_queue)) window.events_queue = [];
  var button = document.getElementById('event-button');
  function onClick(event) {
    if (window.events_queue.length) event.eventData1C = window.events_queue.shift();
  }
  if (button) button.addEventListener('click', onClick);
  return {
    send: function (eventName, eventParams) {
      window.events_queue.push({ event: eventName, params: eventParams === undefined ? {} : eventParams });
      setTimeout(function () {
        var target = document.getElementById('event-button');
        if (target) target.click();
      }, 10);
    },
    fire: function () {
      var target = document.getElementById('event-button');
      if (target) target.click();
    },
    destroy: function () { if (button) button.removeEventListener('click', onClick); }
  };
}

function ViewerApp(root) {
  this.root = root;
  this.data = { tables: [] };
  this.states = [];
  this.tableViews = [];
  this.globalFilter = '';
  this.draggingView = null;
  this.bridge = createBridge();
  this.menu = null;
  this.columnPanel = null;
  this.globalSearchTimer = null;
  this.onDocumentMouseUp = this.stopSelection.bind(this);
  this.onDocumentMouseDown = this.onOutsidePointer.bind(this);
  document.addEventListener('mouseup', this.onDocumentMouseUp);
  document.addEventListener('click', this.onDocumentMouseDown);
}

ViewerApp.prototype.load = function (input) {
  try {
    var source = input;
    if (source === undefined) {
      var dataNode = document.getElementById('data');
      if (!dataNode) throw new Error('#data: элемент с данными не найден');
      var raw = dataNode.textContent.trim();
      if (raw.length === 6 && raw.charCodeAt(0) === 95 && raw.charCodeAt(1) === 68 && raw.charCodeAt(2) === 65 && raw.charCodeAt(3) === 84 && raw.charCodeAt(4) === 65 && raw.charCodeAt(5) === 95) {
        if (/^https?:$/.test(window.location.protocol)) source = getDemoData();
        else throw new Error('$: плейсхолдер _DATA_ не заменён данными');
      } else source = raw;
    }
    this.data = model.parseData(source);
    this.states = this.data.tables.map(model.makeTableState);
    this.globalFilter = '';
    this.render();
    return true;
  } catch (error) {
    this.showError(error);
    return false;
  }
};

ViewerApp.prototype.showError = function (error) {
  clear(this.root);
  var box = element('section', 'error-box');
  box.setAttribute('role', 'alert');
  box.appendChild(element('strong', 'error-title', 'Не удалось построить таблицы'));
  box.appendChild(element('div', 'error-message', error && error.message ? error.message : String(error)));
  this.root.appendChild(box);
  if (window.console && console.error) console.error(error);
};

ViewerApp.prototype.render = function () {
  var self = this;
  clear(this.root);
  this.tableViews = [];
  var toolbar = element('div', 'global-toolbar');
  var search = element('input', 'global-search');
  search.type = 'search';
  search.placeholder = 'Поиск по всем таблицам…';
  search.setAttribute('aria-label', 'Глобальный поиск');
  search.value = this.globalFilter;
  search.addEventListener('input', function () {
    if (self.globalSearchTimer) clearTimeout(self.globalSearchTimer);
    self.globalSearchTimer = setTimeout(function () {
      self.globalFilter = search.value;
      self.clearSelection();
      self.refreshTables();
    }, 120);
  });
  toolbar.appendChild(search);
  var columnsButton = addButton(toolbar, 'Колонки', 'Настроить отображение колонок', function (event) {
    event.stopPropagation();
    self.toggleColumnPanel(columnsButton);
  });
  addButton(toolbar, 'Развернуть все', 'Показать все таблицы и узлы дерева', function () { self.expandAll(); });
  addButton(toolbar, 'Свернуть все', 'Свернуть все таблицы и узлы дерева', function () { self.collapseAll(); });
  addButton(toolbar, 'Экспорт', 'Передать в 1С команду экспорта', function () { self.bridge.send('EVENT_EXPORT', {}); }, 'button button-primary');
  this.selectionSummary = element('output', 'selection-summary', 'Сумма: 0');
  toolbar.appendChild(this.selectionSummary);
  this.root.appendChild(toolbar);
  this.tablesHost = element('main', 'tables-host');
  this.root.appendChild(this.tablesHost);
  if (!this.data.tables.length) {
    this.tablesHost.appendChild(element('div', 'empty-state', 'В данных нет таблиц.'));
    return;
  }
  for (var index = 0; index < this.data.tables.length; index += 1) {
    var view = new TableView(this, this.data.tables[index], this.states[index], index);
    this.tableViews.push(view);
    this.tablesHost.appendChild(view.card);
  }
};

ViewerApp.prototype.refreshTables = function () {
  for (var index = 0; index < this.tableViews.length; index += 1) this.tableViews[index].refreshData();
  var visible = 0;
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) if (this.tableViews[viewIndex].card.style.display !== 'none') visible += 1;
  var old = this.tablesHost.querySelector('.global-empty-state');
  if (old) old.parentNode.removeChild(old);
  if (!visible && String(this.globalFilter || '').trim()) this.tablesHost.appendChild(element('div', 'empty-state global-empty-state', 'Совпадений не найдено.'));
};

ViewerApp.prototype.toggleColumnPanel = function (anchor) {
  if (this.columnPanel) { this.closeColumnPanel(); return; }
  var self = this;
  var panel = element('div', 'column-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Отображение колонок');
  addButton(panel, 'Показать все', 'Сбросить отбор колонок', function () {
    for (var stateIndex = 0; stateIndex < self.states.length; stateIndex += 1) self.states[stateIndex].hiddenColumns = {};
    self.clearSelection();
    for (var viewIndex = 0; viewIndex < self.tableViews.length; viewIndex += 1) self.tableViews[viewIndex].renderGrid();
    self.renderColumnPanel(anchor);
  }, 'button panel-reset');
  this.root.appendChild(panel);
  this.columnPanel = panel;
  this.renderColumnPanel(anchor);
};

ViewerApp.prototype.renderColumnPanel = function (anchor) {
  var self = this;
  var panel = this.columnPanel;
  if (!panel) return;
  while (panel.children.length > 1) panel.removeChild(panel.lastChild);
  for (var tableIndex = 0; tableIndex < this.data.tables.length; tableIndex += 1) {
    var table = this.data.tables[tableIndex];
    panel.appendChild(element('div', 'column-group-title', table.name || 'Таблица ' + (tableIndex + 1)));
    for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
      (function (currentTable, currentColumn) {
        var label = element('label', 'column-option');
        var checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !self.states[currentTable].hiddenColumns[currentColumn];
        checkbox.addEventListener('change', function () {
          if (checkbox.checked) delete self.states[currentTable].hiddenColumns[currentColumn];
          else self.states[currentTable].hiddenColumns[currentColumn] = true;
          self.clearSelection();
          self.tableViews[currentTable].renderGrid();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(table.columns[currentColumn]));
        panel.appendChild(label);
      })(tableIndex, columnIndex);
    }
  }
  var rect = anchor.getBoundingClientRect();
  panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 330)) + 'px';
  panel.style.top = rect.bottom + 5 + 'px';
};

ViewerApp.prototype.closeColumnPanel = function () {
  if (this.columnPanel && this.columnPanel.parentNode) this.columnPanel.parentNode.removeChild(this.columnPanel);
  this.columnPanel = null;
};

ViewerApp.prototype.onOutsidePointer = function (event) {
  if (this.menu && !this.menu.contains(event.target)) this.closeMenu();
  if (this.columnPanel && !this.columnPanel.contains(event.target)) this.closeColumnPanel();
};

ViewerApp.prototype.openMenu = function (view, entry, columnIndex, x, y) {
  var self = this;
  this.closeMenu();
  var menu = element('div', 'context-menu');
  menu.setAttribute('role', 'menu');
  if (columnIndex >= 0) {
    var columnPinned = arrayIndex(view.state.pinnedColumns, columnIndex) !== -1;
    addButton(menu, columnPinned ? 'Открепить колонку' : 'Зафиксировать колонку', '', function () {
      if (columnPinned) removeValue(view.state.pinnedColumns, columnIndex);
      else view.state.pinnedColumns.push(columnIndex);
      self.clearSelection(); self.closeMenu(); view.renderGrid();
    }, 'menu-item');
  }
  var rowPinned = arrayIndex(view.state.pinnedRows, entry.id) !== -1;
  addButton(menu, rowPinned ? 'Открепить строку' : 'Зафиксировать строку', '', function () {
    if (rowPinned) removeValue(view.state.pinnedRows, entry.id);
    else view.state.pinnedRows.push(entry.id);
    self.closeMenu(); view.refreshData();
  }, 'menu-item');
  if (columnIndex >= 0) {
    addButton(menu, 'Отбор по значению', '', function () {
      view.state.columnFilters[columnIndex] = model.cellText(entry.row.columns[columnIndex]);
      view.state.exactFilters[columnIndex] = true;
      self.clearSelection(); self.closeMenu(); view.renderGrid();
    }, 'menu-item');
  }
  document.body.appendChild(menu);
  this.menu = menu;
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - menu.offsetWidth - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - menu.offsetHeight - 4)) + 'px';
};

ViewerApp.prototype.closeMenu = function () {
  if (this.menu && this.menu.parentNode) this.menu.parentNode.removeChild(this.menu);
  this.menu = null;
};

ViewerApp.prototype.beginSelection = function (view, rowIndex, columnIndex, shiftKey) {
  if (shiftKey && view.state.selection) {
    view.state.selection.endRow = rowIndex; view.state.selection.endColumn = columnIndex;
  } else {
    this.clearSelection();
    view.state.selection = { startRow: rowIndex, endRow: rowIndex, startColumn: columnIndex, endColumn: columnIndex };
  }
  this.draggingView = view; view.renderRows(); this.updateSelection(view);
};

ViewerApp.prototype.extendSelection = function (view, rowIndex, columnIndex) {
  if (this.draggingView !== view || !view.state.selection) return;
  view.state.selection.endRow = rowIndex; view.state.selection.endColumn = columnIndex;
  view.renderRows(); this.updateSelection(view);
};
ViewerApp.prototype.stopSelection = function () { this.draggingView = null; };
ViewerApp.prototype.clearSelection = function () {
  for (var index = 0; index < this.states.length; index += 1) this.states[index].selection = null;
  this.draggingView = null;
  if (this.selectionSummary) this.selectionSummary.textContent = 'Сумма: 0';
};
ViewerApp.prototype.updateSelection = function (view) {
  var total = model.calculateSelectionSum(view.table, view.visibleRows, view.state.selection, view.visibleColumns);
  this.selectionSummary.textContent = 'Выделено чисел: ' + total.count + ' · Сумма: ' + model.formatNumber(total.sum, 'number');
};

ViewerApp.prototype.expandAll = function () {
  for (var index = 0; index < this.states.length; index += 1) { this.states[index].collapsed = false; this.states[index].collapsedRows = {}; }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.collapseAll = function () {
  for (var index = 0; index < this.states.length; index += 1) {
    this.states[index].collapsed = true; this.states[index].collapsedRows = {};
    var nodes = model.allNodes(this.data.tables[index]);
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) if (nodes[nodeIndex].children.length) this.states[index].collapsedRows[nodes[nodeIndex].id] = true;
  }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.setTableCollapsed = function (tableIndex, collapsed) {
  if (!this.states[tableIndex]) return false;
  this.states[tableIndex].collapsed = !!collapsed; this.clearSelection(); this.tableViews[tableIndex].updateCollapsed(); return true;
};
ViewerApp.prototype.setTreeExpanded = function (tableIndex, expanded) {
  if (!this.states[tableIndex]) return false;
  var state = this.states[tableIndex]; state.collapsedRows = {};
  if (!expanded) {
    var nodes = model.allNodes(this.data.tables[tableIndex]);
    for (var index = 0; index < nodes.length; index += 1) if (nodes[index].children.length) state.collapsedRows[nodes[index].id] = true;
  }
  this.clearSelection(); this.tableViews[tableIndex].refreshData(); return true;
};
ViewerApp.prototype.destroy = function () {
  if (this.globalSearchTimer) clearTimeout(this.globalSearchTimer);
  document.removeEventListener('mouseup', this.onDocumentMouseUp);
  document.removeEventListener('click', this.onDocumentMouseDown);
  this.closeMenu(); this.closeColumnPanel(); this.bridge.destroy(); clear(this.root);
};

function TableView(app, table, state, tableIndex) {
  this.app = app; this.table = table; this.state = state; this.tableIndex = tableIndex;
  this.visibleRows = []; this.visibleColumns = []; this.bodyEntries = []; this.pinnedEntries = [];
  this.rowHeight = 26; this.scrollTimer = null; this.card = this.createCard(); this.renderGrid();
}

TableView.prototype.createCard = function () {
  var self = this;
  var card = element('section', 'table-card'); card.setAttribute('data-table-index', String(this.tableIndex));
  var titlebar = element('header', 'table-titlebar');
  this.collapseButton = addButton(titlebar, '−', 'Свернуть таблицу', function () { self.state.collapsed = !self.state.collapsed; self.app.clearSelection(); self.updateCollapsed(); }, 'icon-button');
  titlebar.appendChild(element('strong', 'table-title', this.table.name || 'Таблица ' + (this.tableIndex + 1)));
  this.count = element('span', 'table-count'); titlebar.appendChild(this.count); titlebar.appendChild(element('span', 'title-spacer'));
  if (this.table.isTree) {
    addButton(titlebar, 'Раскрыть дерево', '', function () { self.app.setTreeExpanded(self.tableIndex, true); }, 'button button-small');
    addButton(titlebar, 'Свернуть дерево', '', function () { self.app.setTreeExpanded(self.tableIndex, false); }, 'button button-small');
  }
  var scaleLabel = element('label', 'scale-control'); scaleLabel.appendChild(document.createTextNode('Масштаб '));
  var slider = element('input'); slider.type = 'range'; slider.min = '50'; slider.max = '200'; slider.step = '10'; slider.value = String(this.state.scale); slider.setAttribute('aria-label', 'Масштаб таблицы');
  this.scaleOutput = element('span', 'scale-value', this.state.scale + '%');
  slider.addEventListener('input', function () { self.state.scale = Number(slider.value); self.scaleOutput.textContent = self.state.scale + '%'; self.app.clearSelection(); self.renderGrid(); });
  scaleLabel.appendChild(slider); scaleLabel.appendChild(this.scaleOutput); titlebar.appendChild(scaleLabel);
  card.appendChild(titlebar); this.gridHost = element('div', 'grid-host'); card.appendChild(this.gridHost); return card;
};

TableView.prototype.getColumnLayout = function () {
  var scale = this.state.scale / 100; var pinned = []; var regular = []; var seen = {};
  for (var pinIndex = 0; pinIndex < this.state.pinnedColumns.length; pinIndex += 1) {
    var pin = this.state.pinnedColumns[pinIndex];
    if (!this.state.hiddenColumns[pin] && !seen[pin]) { pinned.push(pin); seen[pin] = true; }
  }
  for (var index = 0; index < this.table.columns.length; index += 1) if (!this.state.hiddenColumns[index] && !seen[index]) regular.push(index);
  this.visibleColumns = pinned.concat(regular);
  var numberWidth = Math.round(84 * scale); var left = numberWidth; var columns = [];
  for (var visibleIndex = 0; visibleIndex < this.visibleColumns.length; visibleIndex += 1) {
    var column = this.visibleColumns[visibleIndex]; var isPinned = arrayIndex(pinned, column) !== -1; var width = Math.max(60, Math.round(this.state.widths[column] * scale));
    columns.push({ modelIndex: column, visibleIndex: visibleIndex, width: width, pinned: isPinned, left: isPinned ? left : 0 });
    if (isPinned) left += width;
  }
  return { numberWidth: numberWidth, columns: columns, totalWidth: numberWidth + columns.reduce(function (sum, item) { return sum + item.width; }, 0) };
};

TableView.prototype.styleCell = function (cell, layout, header) {
  cell.style.width = layout.width + 'px'; cell.style.minWidth = layout.width + 'px'; cell.style.maxWidth = layout.width + 'px'; cell.setAttribute('data-column', String(layout.modelIndex));
  if (layout.pinned) { cell.className += ' pinned-column'; cell.style.position = '-webkit-sticky'; cell.style.position = 'sticky'; cell.style.left = layout.left + 'px'; if (header) cell.style.zIndex = '8'; }
};

TableView.prototype.numberCell = function (entry) {
  var self = this; var cell = element('div', 'grid-cell number-cell'); cell.setAttribute('role', 'gridcell');
  cell.style.width = this.layout.numberWidth + 'px'; cell.style.minWidth = this.layout.numberWidth + 'px'; cell.style.maxWidth = this.layout.numberWidth + 'px'; cell.style.position = '-webkit-sticky'; cell.style.position = 'sticky'; cell.style.left = '0'; cell.style.zIndex = '5';
  cell.style.paddingLeft = Math.min(4 + entry.depth * 12, Math.max(4, this.layout.numberWidth - 50)) + 'px';
  if (entry.hasChildren) {
    var toggle = addButton(cell, entry.expanded ? '−' : '+', entry.expanded ? 'Свернуть строку' : 'Развернуть строку', function (event) { event.stopPropagation(); if (entry.expanded) self.state.collapsedRows[entry.id] = true; else delete self.state.collapsedRows[entry.id]; self.app.clearSelection(); self.refreshData(); }, 'tree-toggle');
    toggle.setAttribute('aria-expanded', entry.expanded ? 'true' : 'false');
  } else cell.appendChild(element('span', 'tree-spacer', ''));
  cell.appendChild(element('span', 'row-number', entry.number));
  cell.addEventListener('contextmenu', function (event) { event.preventDefault(); self.app.openMenu(self, entry, -1, event.clientX, event.clientY); });
  return cell;
};

TableView.prototype.renderGrid = function () {
  var self = this; var oldTop = this.viewport ? this.viewport.scrollTop : 0; var oldLeft = this.viewport ? this.viewport.scrollLeft : 0;
  clear(this.gridHost); this.layout = this.getColumnLayout(); this.rowHeight = Math.max(20, Math.round(26 * this.state.scale / 100));
  this.viewport = element('div', 'grid-viewport'); this.viewport.setAttribute('role', 'grid'); this.viewport.setAttribute('aria-label', this.table.name);
  this.content = element('div', 'grid-content'); this.content.style.width = this.layout.totalWidth + 'px'; this.content.style.minWidth = '100%'; this.viewport.appendChild(this.content); this.gridHost.appendChild(this.viewport);
  this.header = element('div', 'grid-row header-row'); this.header.setAttribute('role', 'row'); this.header.style.height = this.rowHeight + 'px';
  var numberHeader = element('div', 'grid-cell header-cell number-cell', '№'); numberHeader.setAttribute('role', 'columnheader'); numberHeader.style.width = this.layout.numberWidth + 'px'; numberHeader.style.minWidth = this.layout.numberWidth + 'px'; numberHeader.style.maxWidth = this.layout.numberWidth + 'px'; numberHeader.style.position = '-webkit-sticky'; numberHeader.style.position = 'sticky'; numberHeader.style.left = '0'; numberHeader.style.zIndex = '9'; this.header.appendChild(numberHeader);
  for (var headerIndex = 0; headerIndex < this.layout.columns.length; headerIndex += 1) {
    (function (layout) {
      var cell = element('div', 'grid-cell header-cell'); cell.setAttribute('role', 'columnheader'); self.styleCell(cell, layout, true);
      var sort = self.state.sort; var indicator = sort.column === layout.modelIndex ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
      var button = element('button', 'sort-button', self.table.columns[layout.modelIndex] + indicator); button.type = 'button'; button.title = 'Сортировать по колонке'; button.addEventListener('click', function () { self.toggleSort(layout.modelIndex); }); cell.appendChild(button);
      var resizer = element('span', 'column-resizer'); resizer.title = 'Изменить ширину колонки'; resizer.addEventListener('mousedown', function (event) { self.beginResize(event, layout.modelIndex); }); cell.appendChild(resizer); self.header.appendChild(cell);
    })(this.layout.columns[headerIndex]);
  }
  this.content.appendChild(this.header);
  this.filterRow = element('div', 'grid-row filter-row'); this.filterRow.setAttribute('role', 'row'); this.filterRow.style.height = this.rowHeight + 'px';
  var filterNumber = element('div', 'grid-cell filter-cell number-cell'); filterNumber.style.width = this.layout.numberWidth + 'px'; filterNumber.style.minWidth = this.layout.numberWidth + 'px'; filterNumber.style.maxWidth = this.layout.numberWidth + 'px'; filterNumber.style.position = '-webkit-sticky'; filterNumber.style.position = 'sticky'; filterNumber.style.left = '0'; filterNumber.style.zIndex = '9'; this.filterRow.appendChild(filterNumber);
  for (var filterIndex = 0; filterIndex < this.layout.columns.length; filterIndex += 1) {
    (function (layout) {
      var cell = element('div', 'grid-cell filter-cell'); self.styleCell(cell, layout, true); var input = element('input', 'column-filter'); input.type = 'search'; input.placeholder = 'Фильтр…'; input.value = self.state.columnFilters[layout.modelIndex]; input.setAttribute('aria-label', 'Фильтр по колонке ' + self.table.columns[layout.modelIndex]);
      input.addEventListener('input', function () { self.state.columnFilters[layout.modelIndex] = input.value; delete self.state.exactFilters[layout.modelIndex]; self.app.clearSelection(); self.refreshData(); }); cell.appendChild(input); self.filterRow.appendChild(cell);
    })(this.layout.columns[filterIndex]);
  }
  this.content.appendChild(this.filterRow); this.pinnedHost = element('div', 'pinned-rows'); this.content.appendChild(this.pinnedHost); this.body = element('div', 'virtual-body'); this.content.appendChild(this.body); this.footer = element('div', 'grid-row totals-row'); this.footer.setAttribute('role', 'row'); this.content.appendChild(this.footer);
  this.viewport.addEventListener('scroll', function () { if (self.scrollTimer) return; self.scrollTimer = setTimeout(function () { self.scrollTimer = null; self.renderVirtualRows(); }, 0); });
  this.refreshData(); this.viewport.scrollTop = oldTop; this.viewport.scrollLeft = oldLeft; this.renderVirtualRows();
};

TableView.prototype.toggleSort = function (column) {
  if (this.state.sort.column !== column) this.state.sort = { column: column, direction: 'asc' };
  else if (this.state.sort.direction === 'asc') this.state.sort.direction = 'desc';
  else if (this.state.sort.direction === 'desc') this.state.sort = { column: -1, direction: null };
  else this.state.sort = { column: column, direction: 'asc' };
  this.app.clearSelection(); this.renderGrid();
};

TableView.prototype.beginResize = function (event, columnIndex) {
  var self = this; event.preventDefault(); event.stopPropagation(); var startX = event.clientX; var startWidth = this.state.widths[columnIndex]; var scale = this.state.scale / 100;
  function move(moveEvent) { self.state.widths[columnIndex] = Math.max(60, startWidth + (moveEvent.clientX - startX) / scale); self.applyWidths(); }
  function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
};

TableView.prototype.applyWidths = function () {
  this.layout = this.getColumnLayout(); this.content.style.width = this.layout.totalWidth + 'px';
  for (var index = 0; index < this.layout.columns.length; index += 1) {
    var layout = this.layout.columns[index]; var cells = this.content.querySelectorAll('[data-column="' + layout.modelIndex + '"]');
    for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) { cells[cellIndex].style.width = layout.width + 'px'; cells[cellIndex].style.minWidth = layout.width + 'px'; cells[cellIndex].style.maxWidth = layout.width + 'px'; if (layout.pinned) cells[cellIndex].style.left = layout.left + 'px'; }
  }
};

TableView.prototype.refreshData = function () {
  this.visibleRows = model.buildVisibleRows(this.table, this.state, this.app.globalFilter); var activeGlobal = String(this.app.globalFilter || '').trim() !== '';
  this.card.style.display = activeGlobal && !this.visibleRows.length ? 'none' : ''; this.count.textContent = '(' + this.visibleRows.length + ' / ' + this.table.nodeCount + ')';
  var pinnedMap = {}; var pinned = [];
  for (var pinIndex = 0; pinIndex < this.state.pinnedRows.length; pinIndex += 1) {
    for (var visibleIndex = 0; visibleIndex < this.visibleRows.length; visibleIndex += 1) if (this.visibleRows[visibleIndex].id === this.state.pinnedRows[pinIndex]) { pinned.push({ entry: this.visibleRows[visibleIndex], visibleIndex: visibleIndex }); pinnedMap[this.visibleRows[visibleIndex].id] = true; break; }
  }
  this.bodyEntries = [];
  for (var rowIndex = 0; rowIndex < this.visibleRows.length; rowIndex += 1) if (!pinnedMap[this.visibleRows[rowIndex].id]) this.bodyEntries.push({ entry: this.visibleRows[rowIndex], visibleIndex: rowIndex });
  this.pinnedEntries = pinned; this.body.style.height = this.bodyEntries.length * this.rowHeight + 'px';
  var naturalHeight = (2 + pinned.length + Math.min(this.bodyEntries.length, 14) + 1) * this.rowHeight + 2; var maxHeight = Math.max(240, Math.min(620, Math.round(window.innerHeight * 0.58))); this.viewport.style.height = Math.max(3 * this.rowHeight + 2, Math.min(naturalHeight, maxHeight)) + 'px';
  this.renderPinnedRows(); this.renderFooter(); this.renderVirtualRows(); this.updateStickyPositions();
};
TableView.prototype.updateStickyPositions = function () { this.header.style.top = '0'; this.filterRow.style.top = this.rowHeight + 'px'; this.pinnedHost.style.top = this.rowHeight * 2 + 'px'; this.pinnedHost.style.height = this.pinnedEntries.length * this.rowHeight + 'px'; this.footer.style.height = this.rowHeight + 'px'; };
TableView.prototype.renderPinnedRows = function () { clear(this.pinnedHost); if (!this.pinnedEntries.length) { this.pinnedHost.style.display = 'none'; return; } this.pinnedHost.style.display = 'block'; for (var index = 0; index < this.pinnedEntries.length; index += 1) this.pinnedHost.appendChild(this.renderRow(this.pinnedEntries[index].entry, this.pinnedEntries[index].visibleIndex, true)); };

TableView.prototype.renderVirtualRows = function () {
  if (!this.body || this.state.collapsed) return;
  var fixed = (2 + this.pinnedEntries.length) * this.rowHeight; var relativeTop = Math.max(0, this.viewport.scrollTop - fixed); var overscan = 8; var start = Math.max(0, Math.floor(relativeTop / this.rowHeight) - overscan); var count = Math.ceil(this.viewport.clientHeight / this.rowHeight) + overscan * 2; var end = Math.min(this.bodyEntries.length, start + count); clear(this.body);
  if (!this.bodyEntries.length) { var emptyRow = element('div', 'grid-empty-row', 'Нет строк, соответствующих фильтру.'); emptyRow.style.height = this.rowHeight + 'px'; this.body.appendChild(emptyRow); return; }
  for (var index = start; index < end; index += 1) { var data = this.bodyEntries[index]; var row = this.renderRow(data.entry, data.visibleIndex, false); row.style.position = 'absolute'; row.style.top = index * this.rowHeight + 'px'; this.body.appendChild(row); }
};
TableView.prototype.renderRows = function () { this.renderPinnedRows(); this.renderVirtualRows(); };

TableView.prototype.renderRow = function (entry, visibleRowIndex, pinned) {
  var self = this; var row = element('div', 'grid-row data-row' + (pinned ? ' pinned-row' : '')); row.setAttribute('role', 'row'); row.setAttribute('data-row-id', entry.id); row.setAttribute('data-visible-row', String(visibleRowIndex)); row.style.height = this.rowHeight + 'px'; row.style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px'; row.appendChild(this.numberCell(entry));
  for (var layoutIndex = 0; layoutIndex < this.layout.columns.length; layoutIndex += 1) {
    (function (layout) {
      var value = entry.row.columns[layout.modelIndex]; var cell = element('div', 'grid-cell data-cell'); cell.setAttribute('role', 'gridcell'); cell.setAttribute('data-visible-column', String(layout.visibleIndex)); self.styleCell(cell, layout, false); var title = model.cellText(value); cell.title = title;
      if (model.isLinkCell(value)) { var link = element('a', 'cell-link', value.label); link.href = '#'; link.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); self.app.bridge.send('EVENT_ON_LINK_CLICK', { label: value.label, href: value.ref }); }); cell.appendChild(link); } else cell.textContent = title;
      if (self.isSelected(visibleRowIndex, layout.visibleIndex)) cell.className += ' selected-cell';
      cell.addEventListener('mousedown', function (event) { if (event.button !== 0 || event.target.tagName.toLowerCase() === 'a') return; event.preventDefault(); self.app.beginSelection(self, visibleRowIndex, layout.visibleIndex, event.shiftKey); });
      cell.addEventListener('mouseenter', function () { self.app.extendSelection(self, visibleRowIndex, layout.visibleIndex); });
      cell.addEventListener('contextmenu', function (event) { event.preventDefault(); self.app.openMenu(self, entry, layout.modelIndex, event.clientX, event.clientY); }); row.appendChild(cell);
    })(this.layout.columns[layoutIndex]);
  }
  return row;
};
TableView.prototype.isSelected = function (rowIndex, columnIndex) { var selection = this.state.selection; if (!selection) return false; return rowIndex >= Math.min(selection.startRow, selection.endRow) && rowIndex <= Math.max(selection.startRow, selection.endRow) && columnIndex >= Math.min(selection.startColumn, selection.endColumn) && columnIndex <= Math.max(selection.startColumn, selection.endColumn); };

TableView.prototype.renderFooter = function () {
  clear(this.footer); var number = element('div', 'grid-cell totals-cell number-cell', 'Итого'); number.style.width = this.layout.numberWidth + 'px'; number.style.minWidth = this.layout.numberWidth + 'px'; number.style.maxWidth = this.layout.numberWidth + 'px'; number.style.position = '-webkit-sticky'; number.style.position = 'sticky'; number.style.left = '0'; number.style.zIndex = '9'; this.footer.appendChild(number);
  var totals = model.calculateTotals(this.table, this.visibleRows);
  for (var index = 0; index < this.layout.columns.length; index += 1) { var layout = this.layout.columns[index]; var value = totals[layout.modelIndex]; var text = value === null ? '' : model.formatNumber(value, this.table.columnTypes[layout.modelIndex]); var cell = element('div', 'grid-cell totals-cell', text); this.styleCell(cell, layout, true); cell.title = text; this.footer.appendChild(cell); }
};
TableView.prototype.updateCollapsed = function () { this.gridHost.style.display = this.state.collapsed ? 'none' : ''; this.collapseButton.textContent = this.state.collapsed ? '+' : '−'; this.collapseButton.title = this.state.collapsed ? 'Развернуть таблицу' : 'Свернуть таблицу'; if (!this.state.collapsed) this.refreshData(); };

function installPublicApi() {
  window.init = function (data) { if (currentApp) currentApp.destroy(); var root = document.getElementById('app'); if (!root) return false; currentApp = new ViewerApp(root); return currentApp.load(data); };
  window.setData = function (data) { if (!currentApp) return window.init(data); return currentApp.load(data); };
  window.setTableCollapsed = function (tableIndex, collapsed) { return currentApp ? currentApp.setTableCollapsed(Number(tableIndex), collapsed) : false; };
  window.setTreeExpanded = function (tableIndex, expanded) { return currentApp ? currentApp.setTreeExpanded(Number(tableIndex), expanded) : false; };
  window.expandAll = function () { if (!currentApp) return false; currentApp.expandAll(); return true; };
  window.collapseAll = function () { if (!currentApp) return false; currentApp.collapseAll(); return true; };
  window.sendEvent = function (eventName, eventParams) { if (!currentApp) return false; currentApp.bridge.send(eventName, eventParams); return true; };
  window.fireEvent = function () { if (!currentApp) return false; currentApp.bridge.fire(); return true; };
  window.destroy = function () { if (!currentApp) return false; currentApp.destroy(); currentApp = null; return true; };
}

function install() {
  installPublicApi();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.init(); });
  else window.init();
}

module.exports = { install: install };
