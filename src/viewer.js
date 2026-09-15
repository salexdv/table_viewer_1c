var model = require('./model');

var currentApp = null;
var AGGREGATES = [
  { value: 'sum', label: 'Сумма' },
  { value: 'average', label: 'Среднее' },
  { value: 'min', label: 'Минимум' },
  { value: 'max', label: 'Максимум' },
  { value: 'count', label: 'Количество' }
];

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function findClassTarget(target, className, root) {
  var node = target;
  while (node && node !== root) {
    var classes = node.getAttribute ? node.getAttribute('class') : '';
    if ((' ' + classes + ' ').indexOf(' ' + className + ' ') !== -1) return node;
    node = node.parentNode;
  }
  return null;
}

function setClass(node, className, enabled) {
  var classes = String(node.className || '').split(/\s+/); var result = []; var found = false;
  for (var index = 0; index < classes.length; index += 1) {
    if (!classes[index]) continue;
    if (classes[index] === className) { found = true; if (!enabled) continue; }
    result.push(classes[index]);
  }
  if (enabled && !found) result.push(className);
  node.className = result.join(' ');
}

function addButton(parent, text, title, onClick, className) {
  var button = element('button', className || 'button', text);
  button.type = 'button';
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  parent.appendChild(button);
  return button;
}

function requestFrame(callback) {
  var request = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
  return request ? request.call(window, callback) : window.setTimeout(callback, 16);
}

function cancelFrame(frame) {
  var cancel = window.cancelAnimationFrame || window.webkitCancelAnimationFrame;
  if (cancel) cancel.call(window, frame);
  else window.clearTimeout(frame);
}

function addIconButton(parent, iconName, label, onClick, className) {
  var button = addButton(parent, '', label, onClick, className || 'icon-button');
  button.setAttribute('aria-label', label);
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'button-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (iconName === 'expand-all') path.setAttribute('d', 'M2.5 2.5 8 7l5.5-4.5M2.5 8.5 8 13l5.5-4.5');
  else if (iconName === 'collapse-all') path.setAttribute('d', 'M2.5 7.5 8 3l5.5 4.5M2.5 13.5 8 9l5.5 4.5');
  else {
    path.setAttribute('d', iconName === 'expand-tree'
      ? 'M2 2v12M2 5h4M2 11h4M7 2.5h7v7H7zM9 6h3M10.5 4.5v3M7 11h7'
      : 'M2 2v12M2 5h4M2 11h4M7 2.5h7v7H7zM9 6h3M7 11h7');
  }
  svg.appendChild(path);
  button.appendChild(svg);
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

function aggregateLabel(value) {
  for (var index = 0; index < AGGREGATES.length; index += 1) {
    if (AGGREGATES[index].value === value) return AGGREGATES[index].label;
  }
  return AGGREGATES[0].label;
}

function formatAggregate(result, aggregate) {
  if (result.value === null) return '—';
  if (aggregate === 'count') return String(result.value);
  return model.formatNumber(result.value, result.kind);
}

function copySelectionMap(source) {
  var target = Object.create(null);
  if (!source) return target;
  for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = true;
  return target;
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
  this.filterPanel = null;
  this.globalSearchTimer = null;
  this.layoutFrame = null;
  this.selectionAggregate = 'sum';
  this.selectionView = null;
  this.onDocumentMouseUp = this.stopSelection.bind(this);
  this.onDocumentMouseDown = this.onOutsidePointer.bind(this);
  this.onWindowResize = this.scheduleTableLayouts.bind(this);
  document.addEventListener('mouseup', this.onDocumentMouseUp);
  document.addEventListener('click', this.onDocumentMouseDown);
  window.addEventListener('resize', this.onWindowResize);
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
        else { this.showWaiting(); return false; }
      } else source = raw;
    }
    this.data = model.parseData(source);
    this.states = this.data.tables.map(model.makeTableState);
    this.globalFilter = '';
    this.selectionAggregate = 'sum';
    this.selectionView = null;
    this.render();
    return true;
  } catch (error) {
    this.showError(error);
    return false;
  }
};

ViewerApp.prototype.showWaiting = function () {
  clear(this.root);
  var waiting = element('div', 'waiting-state', 'Ожидение данных...');
  waiting.setAttribute('role', 'status');
  this.root.appendChild(waiting);
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
      self.resetRowWindows();
      self.clearSelection();
      self.refreshTables();
    }, 120);
  });
  toolbar.appendChild(search);
  var columnsButton = addButton(toolbar, 'Колонки', 'Настроить отображение колонок', function (event) {
    event.stopPropagation();
    self.toggleColumnPanel(columnsButton);
  });
  addIconButton(toolbar, 'expand-all', 'Развернуть все', function () { self.expandAll(); }, 'icon-button command-icon-button expand-all-button');
  addIconButton(toolbar, 'collapse-all', 'Свернуть все', function () { self.collapseAll(); }, 'icon-button command-icon-button collapse-all-button');
  addButton(toolbar, 'Экспорт', 'Передать в 1С команду экспорта', function () { self.bridge.send('EVENT_EXPORT', {}); }, 'button button-primary export-button export-button-temporarily-hidden');
  var selectionControl = element('div', 'selection-control');
  this.selectionAggregateSelect = element('select', 'selection-aggregate');
  this.selectionAggregateSelect.setAttribute('aria-label', 'Функция для выделенных ячеек');
  for (var aggregateIndex = 0; aggregateIndex < AGGREGATES.length; aggregateIndex += 1) {
    var option = element('option', '', AGGREGATES[aggregateIndex].label);
    option.value = AGGREGATES[aggregateIndex].value;
    this.selectionAggregateSelect.appendChild(option);
  }
  this.selectionAggregateSelect.value = this.selectionAggregate;
  this.selectionAggregateSelect.disabled = true;
  this.selectionAggregateSelect.addEventListener('change', function () {
    self.selectionAggregate = self.selectionAggregateSelect.value;
    if (self.selectionView) self.updateSelection(self.selectionView);
  });
  selectionControl.appendChild(this.selectionAggregateSelect);
  this.selectionSummary = element('output', 'selection-summary', 'Числа не выделены');
  selectionControl.appendChild(this.selectionSummary);
  toolbar.appendChild(selectionControl);
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
    view.renderGrid();
  }
  this.updateTableLayouts();
};

ViewerApp.prototype.refreshTables = function () {
  for (var index = 0; index < this.tableViews.length; index += 1) this.tableViews[index].refreshData();
  var visible = 0;
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) if (this.tableViews[viewIndex].card.style.display !== 'none') visible += 1;
  var old = this.tablesHost.querySelector('.global-empty-state');
  if (old) old.parentNode.removeChild(old);
  if (!visible && String(this.globalFilter || '').trim()) this.tablesHost.appendChild(element('div', 'empty-state global-empty-state', 'Совпадений не найдено.'));
  this.updateTableLayouts();
};

ViewerApp.prototype.scheduleTableLayouts = function () {
  var self = this;
  if (this.layoutFrame) return;
  this.layoutFrame = requestFrame(function () {
    self.layoutFrame = null;
    self.updateTableLayouts();
  });
};

ViewerApp.prototype.updateTableLayouts = function () {
  var visible = 0;
  for (var index = 0; index < this.tableViews.length; index += 1) {
    if (this.tableViews[index].card.style.display !== 'none') visible += 1;
  }
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) {
    var view = this.tableViews[viewIndex];
    if (view.card.style.display === 'none' || view.state.collapsed || !view.viewport) continue;
    view.applyHeight(visible === 1);
    view.applyWidths();
    view.renderVirtualRows();
  }
};

ViewerApp.prototype.resetRowWindows = function () {
  for (var index = 0; index < this.states.length; index += 1) this.states[index].rowWindow = null;
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
          self.renderColumnPanel(anchor);
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
  if (this.filterPanel && !this.filterPanel.contains(event.target)) this.closeFilterPanel();
};

ViewerApp.prototype.openAggregateMenu = function (view, columnIndex, anchor) {
  var self = this;
  this.closeMenu();
  var menu = element('div', 'context-menu aggregate-menu');
  menu.setAttribute('role', 'menu');
  for (var index = 0; index < AGGREGATES.length; index += 1) {
    (function (aggregate) {
      var active = view.state.columnAggregates[columnIndex] === aggregate.value;
      addButton(menu, (active ? '✓ ' : '') + aggregate.label, '', function () {
        view.state.columnAggregates[columnIndex] = aggregate.value;
        anchor.title = 'Функция итога: ' + aggregate.label;
        anchor.setAttribute('aria-label', anchor.title);
        self.closeMenu();
        view.renderFooter();
      }, 'menu-item' + (active ? ' menu-item-active' : ''));
    })(AGGREGATES[index]);
  }
  document.body.appendChild(menu);
  this.menu = menu;
  var rect = anchor.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(rect.bottom + 3, window.innerHeight - menu.offsetHeight - 4)) + 'px';
};

ViewerApp.prototype.closeFilterPanel = function () {
  if (this.filterPanel && this.filterPanel.parentNode) this.filterPanel.parentNode.removeChild(this.filterPanel);
  this.filterPanel = null;
};

ViewerApp.prototype.openValueFilter = function (view, columnIndex, anchor) {
  var self = this;
  this.closeFilterPanel();
  this.closeMenu();
  var values = model.getAvailableValues(view.table, view.state, this.globalFilter, columnIndex);
  var active = view.state.valueFilters[columnIndex];
  var draft = copySelectionMap(active);
  if (!active) for (var allIndex = 0; allIndex < values.length; allIndex += 1) draft[values[allIndex].value] = true;

  var panel = element('div', 'value-filter-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Фильтр значений колонки ' + view.table.columns[columnIndex]);
  var search = element('input', 'value-filter-search');
  search.type = 'search'; search.placeholder = 'Найти значение…'; search.setAttribute('aria-label', 'Поиск значений');
  panel.appendChild(search);
  var commands = element('div', 'value-filter-commands'); panel.appendChild(commands);
  var list = element('div', 'value-filter-list'); list.setAttribute('role', 'group');
  var canvas = element('div', 'value-filter-canvas'); list.appendChild(canvas); panel.appendChild(list);
  var actions = element('div', 'value-filter-actions'); panel.appendChild(actions);
  var filtered = values.slice();
  var itemHeight = 27;

  function filterValues() {
    var needle = String(search.value || '').trim().toLocaleLowerCase();
    filtered = [];
    for (var index = 0; index < values.length; index += 1) {
      if (!needle || values[index].label.toLocaleLowerCase().indexOf(needle) !== -1) filtered.push(values[index]);
    }
    list.scrollTop = 0;
    renderList();
  }
  function renderList() {
    clear(canvas);
    canvas.style.height = filtered.length * itemHeight + 'px';
    var start = Math.max(0, Math.floor(list.scrollTop / itemHeight) - 3);
    var end = Math.min(filtered.length, start + Math.ceil((list.clientHeight || 220) / itemHeight) + 6);
    for (var index = start; index < end; index += 1) {
      (function (item, position) {
        var label = element('label', 'value-filter-option');
        label.style.top = position * itemHeight + 'px';
        var checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = !!draft[item.value];
        checkbox.addEventListener('change', function () {
          if (checkbox.checked) draft[item.value] = true; else delete draft[item.value];
        });
        label.appendChild(checkbox); label.appendChild(document.createTextNode(item.label)); canvas.appendChild(label);
      })(filtered[index], index);
    }
  }
  function setFiltered(checked) {
    for (var index = 0; index < filtered.length; index += 1) {
      if (checked) draft[filtered[index].value] = true; else delete draft[filtered[index].value];
    }
    renderList();
  }
  addButton(commands, 'Выбрать все', '', function () { setFiltered(true); }, 'button button-small');
  addButton(commands, 'Снять все', '', function () { setFiltered(false); }, 'button button-small');
  addButton(actions, 'Применить', '', function () {
    var allSelected = values.length > 0;
    for (var index = 0; index < values.length && allSelected; index += 1) if (!draft[values[index].value]) allSelected = false;
    view.state.valueFilters[columnIndex] = allSelected ? null : copySelectionMap(draft);
    view.state.rowWindow = null;
    self.clearSelection(); self.closeFilterPanel(); view.refreshData(); view.updateFilterButtons();
  }, 'button button-primary button-small');
  addButton(actions, 'Отмена', '', function () { self.closeFilterPanel(); }, 'button button-small');
  addButton(actions, 'Очистить фильтр', '', function () {
    view.state.valueFilters[columnIndex] = null; view.state.rowWindow = null;
    self.clearSelection(); self.closeFilterPanel(); view.refreshData(); view.updateFilterButtons();
  }, 'button button-small');
  search.addEventListener('input', filterValues);
  list.addEventListener('scroll', renderList);
  panel.addEventListener('click', function (event) { event.stopPropagation(); });
  document.body.appendChild(panel); this.filterPanel = panel;
  var rect = anchor.getBoundingClientRect();
  panel.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 4)) + 'px';
  panel.style.top = Math.max(4, Math.min(rect.bottom + 3, window.innerHeight - panel.offsetHeight - 4)) + 'px';
  renderList(); search.focus();
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
  if (!view.table.isTree) {
    addButton(menu, 'Свернуть строки до', '', function () {
      self.closeMenu(); view.hideRowsAt(entry, true);
    }, 'menu-item');
    addButton(menu, 'Свернуть строки после', '', function () {
      self.closeMenu(); view.hideRowsAt(entry, false);
    }, 'menu-item');
  }
  if (columnIndex >= 0) {
    addButton(menu, 'Отбор по значению', '', function () {
      view.state.columnFilters[columnIndex] = model.cellText(entry.row.columns[columnIndex]);
      view.state.exactFilters[columnIndex] = true;
      view.state.rowWindow = null;
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
  this.draggingView = view; view.updateRenderedSelection(); this.updateSelection(view);
};

ViewerApp.prototype.extendSelection = function (view, rowIndex, columnIndex) {
  if (this.draggingView !== view || !view.state.selection) return;
  view.state.selection.endRow = rowIndex; view.state.selection.endColumn = columnIndex;
  view.updateRenderedSelection(); this.updateSelection(view);
};
ViewerApp.prototype.stopSelection = function () { this.draggingView = null; };
ViewerApp.prototype.clearSelection = function () {
  for (var index = 0; index < this.states.length; index += 1) this.states[index].selection = null;
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateRenderedSelection();
  this.draggingView = null;
  this.selectionView = null;
  if (this.selectionSummary) this.selectionSummary.textContent = 'Числа не выделены';
  if (this.selectionAggregateSelect) this.selectionAggregateSelect.disabled = true;
};
ViewerApp.prototype.updateSelection = function (view) {
  var result = model.calculateSelectionAggregate(view.table, view.visibleRows, view.state.selection, view.visibleColumns, this.selectionAggregate);
  this.selectionView = result.count ? view : null;
  this.selectionAggregateSelect.disabled = !result.count;
  if (!result.count) { this.selectionSummary.textContent = 'Числа не выделены'; return; }
  this.selectionSummary.textContent = 'Выделено чисел: ' + result.count + ' · ' + aggregateLabel(this.selectionAggregate) + ': ' + formatAggregate(result, this.selectionAggregate);
};

ViewerApp.prototype.expandAll = function () {
  for (var index = 0; index < this.states.length; index += 1) { this.states[index].collapsed = false; this.states[index].collapsedRows = {}; this.states[index].rowWindow = null; }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.collapseAll = function () {
  for (var index = 0; index < this.states.length; index += 1) {
    this.states[index].collapsed = true; this.states[index].collapsedRows = {}; this.states[index].rowWindow = null;
    var nodes = model.allNodes(this.data.tables[index]);
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) if (nodes[nodeIndex].children.length) this.states[index].collapsedRows[nodes[nodeIndex].id] = true;
  }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.setTableCollapsed = function (tableIndex, collapsed) {
  if (!this.states[tableIndex]) return false;
  this.states[tableIndex].collapsed = !!collapsed; this.states[tableIndex].rowWindow = null; this.clearSelection(); this.tableViews[tableIndex].updateCollapsed(); return true;
};
ViewerApp.prototype.setTreeExpanded = function (tableIndex, expanded) {
  if (!this.states[tableIndex]) return false;
  var state = this.states[tableIndex]; state.collapsedRows = {}; state.rowWindow = null;
  if (!expanded) {
    var nodes = model.allNodes(this.data.tables[tableIndex]);
    for (var index = 0; index < nodes.length; index += 1) if (nodes[index].children.length) state.collapsedRows[nodes[index].id] = true;
  }
  this.clearSelection(); this.tableViews[tableIndex].refreshData(); return true;
};
ViewerApp.prototype.destroy = function () {
  if (this.globalSearchTimer) clearTimeout(this.globalSearchTimer);
  if (this.layoutFrame) cancelFrame(this.layoutFrame);
  for (var index = 0; index < this.tableViews.length; index += 1) this.tableViews[index].cancelScheduledRender();
  document.removeEventListener('mouseup', this.onDocumentMouseUp);
  document.removeEventListener('click', this.onDocumentMouseDown);
  window.removeEventListener('resize', this.onWindowResize);
  this.closeMenu(); this.closeColumnPanel(); this.closeFilterPanel(); this.bridge.destroy(); clear(this.root);
};

function TableView(app, table, state, tableIndex) {
  this.app = app; this.table = table; this.state = state; this.tableIndex = tableIndex;
  this.allVisibleRows = []; this.visibleRows = []; this.visibleColumns = []; this.bodyEntries = []; this.pinnedEntries = [];
  this.hiddenBefore = 0; this.hiddenAfter = 0; this.filterButtons = {};
  this.rowHeight = 26; this.scrollFrame = null; this.virtualRows = []; this.virtualStart = -1; this.virtualEnd = -1; this.card = this.createCard();
}

TableView.prototype.createCard = function () {
  var self = this;
  var card = element('section', 'table-card'); card.setAttribute('data-table-index', String(this.tableIndex));
  var titlebar = element('header', 'table-titlebar');
  this.collapseButton = addButton(titlebar, '−', 'Свернуть таблицу', function () { self.state.collapsed = !self.state.collapsed; self.state.rowWindow = null; self.app.clearSelection(); self.updateCollapsed(); }, 'icon-button');
  titlebar.appendChild(element('strong', 'table-title', this.table.name || 'Таблица ' + (this.tableIndex + 1)));
  this.count = element('span', 'table-count'); titlebar.appendChild(this.count); titlebar.appendChild(element('span', 'title-spacer'));
  if (this.table.isTree) {
    addIconButton(titlebar, 'expand-tree', 'Раскрыть дерево', function () { self.app.setTreeExpanded(self.tableIndex, true); }, 'icon-button tree-command-button expand-tree-button');
    addIconButton(titlebar, 'collapse-tree', 'Свернуть дерево', function () { self.app.setTreeExpanded(self.tableIndex, false); }, 'icon-button tree-command-button collapse-tree-button');
  }
  var scaleLabel = element('label', 'scale-control'); scaleLabel.appendChild(document.createTextNode('Масштаб '));
  var slider = element('input'); slider.type = 'range'; slider.min = '50'; slider.max = '200'; slider.step = '10'; slider.value = String(this.state.scale); slider.setAttribute('aria-label', 'Масштаб таблицы');
  this.scaleOutput = element('span', 'scale-value', this.state.scale + '%');
  slider.addEventListener('input', function () { self.state.scale = Number(slider.value); self.scaleOutput.textContent = self.state.scale + '%'; self.app.clearSelection(); self.renderGrid(); });
  scaleLabel.appendChild(slider); scaleLabel.appendChild(this.scaleOutput); titlebar.appendChild(scaleLabel);
  card.appendChild(titlebar); this.gridHost = element('div', 'grid-host'); card.appendChild(this.gridHost); return card;
};

TableView.prototype.getColumnLayout = function (availableWidth) {
  var scale = this.state.scale / 100; var pinned = []; var regular = []; var seen = {};
  for (var pinIndex = 0; pinIndex < this.state.pinnedColumns.length; pinIndex += 1) {
    var pin = this.state.pinnedColumns[pinIndex];
    if (!this.state.hiddenColumns[pin] && !seen[pin]) { pinned.push(pin); seen[pin] = true; }
  }
  for (var index = 0; index < this.table.columns.length; index += 1) if (!this.state.hiddenColumns[index] && !seen[index]) regular.push(index);
  this.visibleColumns = pinned.concat(regular);
  var numberWidth = Math.max(42, Math.round(this.state.rowNumberWidth * scale)); var rawWidths = []; var rawTotal = 0;
  for (var visibleIndex = 0; visibleIndex < this.visibleColumns.length; visibleIndex += 1) {
    var rawWidth = Math.max(60, Math.round(this.state.widths[this.visibleColumns[visibleIndex]] * scale));
    rawWidths.push(rawWidth); rawTotal += rawWidth;
  }
  var dataWidth = Math.max(0, Number(availableWidth) - numberWidth); var stretch = rawTotal > 0 && dataWidth > rawTotal ? dataWidth / rawTotal : 1;
  var left = numberWidth; var columns = []; var usedWidth = 0;
  for (var layoutIndex = 0; layoutIndex < this.visibleColumns.length; layoutIndex += 1) {
    var column = this.visibleColumns[layoutIndex]; var isPinned = arrayIndex(pinned, column) !== -1;
    var width = stretch > 1 && layoutIndex === this.visibleColumns.length - 1 ? dataWidth - usedWidth : Math.round(rawWidths[layoutIndex] * stretch);
    usedWidth += width;
    columns.push({ modelIndex: column, visibleIndex: layoutIndex, width: width, pinned: isPinned, left: isPinned ? left : 0 });
    if (isPinned) left += width;
  }
  return { numberWidth: numberWidth, columns: columns, totalWidth: numberWidth + usedWidth };
};

TableView.prototype.styleCell = function (cell, layout, header) {
  cell.style.width = layout.width + 'px'; cell.style.minWidth = layout.width + 'px'; cell.style.maxWidth = layout.width + 'px'; cell.setAttribute('data-column', String(layout.modelIndex));
  if (layout.pinned) { cell.className += ' pinned-column'; cell.style.position = '-webkit-sticky'; cell.style.position = 'sticky'; cell.style.left = layout.left + 'px'; if (header) cell.style.zIndex = '8'; }
};

TableView.prototype.createNumberCell = function () {
  var cell = element('div', 'grid-cell number-cell'); cell.setAttribute('role', 'gridcell');
  cell.style.width = this.layout.numberWidth + 'px'; cell.style.minWidth = this.layout.numberWidth + 'px'; cell.style.maxWidth = this.layout.numberWidth + 'px'; cell.style.position = '-webkit-sticky'; cell.style.position = 'sticky'; cell.style.left = '0'; cell.style.zIndex = '5';
  return cell;
};

TableView.prototype.updateNumberCell = function (cell, entry) {
  clear(cell);
  cell.style.paddingLeft = Math.min(4 + entry.depth * 12, Math.max(4, this.layout.numberWidth - 50)) + 'px';
  if (entry.hasChildren) {
    var toggle = element('button', 'tree-toggle', entry.expanded ? '−' : '+'); toggle.type = 'button'; toggle.title = entry.expanded ? 'Свернуть строку' : 'Развернуть строку';
    toggle.setAttribute('aria-expanded', entry.expanded ? 'true' : 'false');
    cell.appendChild(toggle);
  } else cell.appendChild(element('span', 'tree-spacer', ''));
  cell.appendChild(element('span', 'row-number', entry.number));
};

TableView.prototype.entryForRow = function (row) {
  if (!row) return null;
  var index = Number(row.getAttribute('data-visible-row'));
  return isFinite(index) ? this.visibleRows[index] : null;
};

TableView.prototype.onGridClick = function (event) {
  var toggle = findClassTarget(event.target, 'tree-toggle', this.content);
  if (toggle) {
    var toggleRow = findClassTarget(toggle, 'data-row', this.content); var toggleEntry = this.entryForRow(toggleRow);
    if (!toggleEntry) return;
    event.preventDefault(); event.stopPropagation();
    if (toggleEntry.expanded) this.state.collapsedRows[toggleEntry.id] = true;
    else delete this.state.collapsedRows[toggleEntry.id];
    this.state.rowWindow = null; this.app.clearSelection(); this.refreshData(); return;
  }
  var link = findClassTarget(event.target, 'cell-link', this.content);
  if (!link) return;
  var cell = findClassTarget(link, 'data-cell', this.content); var row = findClassTarget(cell, 'data-row', this.content); var entry = this.entryForRow(row);
  if (!entry) return;
  var value = entry.row.columns[Number(cell.getAttribute('data-column'))];
  if (!model.isLinkCell(value)) return;
  event.preventDefault(); event.stopPropagation(); this.app.bridge.send('EVENT_ON_LINK_CLICK', { label: value.label, href: value.ref });
};

TableView.prototype.onGridMouseDown = function (event) {
  var cell = findClassTarget(event.target, 'data-cell', this.content);
  if (!cell || event.button !== 0 || findClassTarget(event.target, 'cell-link', cell)) return;
  var row = findClassTarget(cell, 'data-row', this.content); var entry = this.entryForRow(row);
  if (!entry) return;
  event.preventDefault();
  this.app.beginSelection(this, Number(row.getAttribute('data-visible-row')), Number(cell.getAttribute('data-visible-column')), event.shiftKey);
};

TableView.prototype.onGridMouseOver = function (event) {
  var cell = findClassTarget(event.target, 'data-cell', this.content);
  if (!cell || (event.relatedTarget && cell.contains(event.relatedTarget))) return;
  var row = findClassTarget(cell, 'data-row', this.content);
  if (!this.entryForRow(row)) return;
  this.app.extendSelection(this, Number(row.getAttribute('data-visible-row')), Number(cell.getAttribute('data-visible-column')));
};

TableView.prototype.onGridContextMenu = function (event) {
  var cell = findClassTarget(event.target, 'data-cell', this.content);
  var number = cell ? null : findClassTarget(event.target, 'number-cell', this.content);
  var target = cell || number;
  if (!target) return;
  var row = findClassTarget(target, 'data-row', this.content); var entry = this.entryForRow(row);
  if (!entry) return;
  event.preventDefault(); this.app.openMenu(this, entry, cell ? Number(cell.getAttribute('data-column')) : -1, event.clientX, event.clientY);
};

TableView.prototype.renderGrid = function () {
  var self = this; var oldTop = this.viewport ? this.viewport.scrollTop : 0; var oldLeft = this.viewport ? this.viewport.scrollLeft : 0;
  this.cancelScheduledRender();
  clear(this.gridHost); this.filterButtons = {}; this.layout = this.getColumnLayout(); this.rowHeight = Math.max(20, Math.round(26 * this.state.scale / 100));
  this.viewport = element('div', 'grid-viewport'); this.viewport.setAttribute('role', 'grid'); this.viewport.setAttribute('aria-label', this.table.name);
  this.content = element('div', 'grid-content'); this.content.style.width = this.layout.totalWidth + 'px'; this.content.style.minWidth = '100%'; this.viewport.appendChild(this.content); this.gridHost.appendChild(this.viewport);
  this.content.addEventListener('click', function (event) { self.onGridClick(event); });
  this.content.addEventListener('mousedown', function (event) { self.onGridMouseDown(event); });
  this.content.addEventListener('mouseover', function (event) { self.onGridMouseOver(event); });
  this.content.addEventListener('contextmenu', function (event) { self.onGridContextMenu(event); });
  this.header = element('div', 'grid-row header-row'); this.header.setAttribute('role', 'row'); this.header.style.height = this.rowHeight + 'px';
  var numberHeader = element('div', 'grid-cell header-cell number-cell', '№'); numberHeader.setAttribute('role', 'columnheader'); numberHeader.style.width = this.layout.numberWidth + 'px'; numberHeader.style.minWidth = this.layout.numberWidth + 'px'; numberHeader.style.maxWidth = this.layout.numberWidth + 'px'; numberHeader.style.position = '-webkit-sticky'; numberHeader.style.position = 'sticky'; numberHeader.style.left = '0'; numberHeader.style.zIndex = '9';
  var numberResizer = element('span', 'column-resizer number-resizer'); numberResizer.title = 'Изменить ширину колонки номеров'; numberResizer.addEventListener('mousedown', function (event) { self.beginNumberResize(event); }); numberHeader.appendChild(numberResizer); this.header.appendChild(numberHeader);
  for (var headerIndex = 0; headerIndex < this.layout.columns.length; headerIndex += 1) {
    (function (layout) {
      var cell = element('div', 'grid-cell header-cell'); cell.setAttribute('role', 'columnheader'); self.styleCell(cell, layout, true);
      var sort = self.state.sort; var indicator = sort.column === layout.modelIndex ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
      var button = element('button', 'sort-button', self.table.columns[layout.modelIndex] + indicator); button.type = 'button'; button.title = 'Сортировать по колонке'; button.addEventListener('click', function () { self.toggleSort(layout.modelIndex); }); cell.appendChild(button);
      var type = self.table.columnTypes[layout.modelIndex];
      if (type === 'number' || type === 'percent') {
        var aggregateButton = element('button', 'aggregate-button', 'ƒ'); aggregateButton.type = 'button';
        aggregateButton.title = 'Функция итога: ' + aggregateLabel(self.state.columnAggregates[layout.modelIndex]);
        aggregateButton.setAttribute('aria-label', aggregateButton.title);
        aggregateButton.addEventListener('click', function (event) { event.stopPropagation(); self.app.openAggregateMenu(self, layout.modelIndex, aggregateButton); });
        cell.appendChild(aggregateButton);
      }
      var resizer = element('span', 'column-resizer'); resizer.title = 'Изменить ширину колонки'; resizer.addEventListener('mousedown', function (event) { self.beginResize(event, layout.modelIndex); }); cell.appendChild(resizer); self.header.appendChild(cell);
    })(this.layout.columns[headerIndex]);
  }
  this.content.appendChild(this.header);
  this.filterRow = element('div', 'grid-row filter-row'); this.filterRow.setAttribute('role', 'row'); this.filterRow.style.height = this.rowHeight + 'px';
  var filterNumber = element('div', 'grid-cell filter-cell number-cell'); filterNumber.style.width = this.layout.numberWidth + 'px'; filterNumber.style.minWidth = this.layout.numberWidth + 'px'; filterNumber.style.maxWidth = this.layout.numberWidth + 'px'; filterNumber.style.position = '-webkit-sticky'; filterNumber.style.position = 'sticky'; filterNumber.style.left = '0'; filterNumber.style.zIndex = '9'; this.filterRow.appendChild(filterNumber);
  for (var filterIndex = 0; filterIndex < this.layout.columns.length; filterIndex += 1) {
    (function (layout) {
      var cell = element('div', 'grid-cell filter-cell'); self.styleCell(cell, layout, true);
      var control = element('div', 'filter-control');
      var input = element('input', 'column-filter'); input.type = 'search'; input.placeholder = 'Фильтр…'; input.value = self.state.columnFilters[layout.modelIndex]; input.setAttribute('aria-label', 'Фильтр по колонке ' + self.table.columns[layout.modelIndex]);
      input.addEventListener('input', function () { self.state.columnFilters[layout.modelIndex] = input.value; delete self.state.exactFilters[layout.modelIndex]; self.state.rowWindow = null; self.app.clearSelection(); self.refreshData(); });
      var valuesButton = element('button', 'value-filter-button', '▾'); valuesButton.type = 'button'; valuesButton.title = 'Выбрать значения колонки'; valuesButton.setAttribute('aria-label', valuesButton.title);
      valuesButton.addEventListener('click', function (event) { event.stopPropagation(); self.app.openValueFilter(self, layout.modelIndex, valuesButton); });
      self.filterButtons[layout.modelIndex] = valuesButton;
      control.appendChild(input); control.appendChild(valuesButton); cell.appendChild(control); self.filterRow.appendChild(cell);
    })(this.layout.columns[filterIndex]);
  }
  this.content.appendChild(this.filterRow); this.pinnedHost = element('div', 'pinned-rows'); this.content.appendChild(this.pinnedHost);
  this.beforeMarker = element('button', 'range-marker range-marker-before'); this.beforeMarker.type = 'button'; this.beforeMarker.addEventListener('click', function () { self.restoreHiddenRows(true); }); this.content.appendChild(this.beforeMarker);
  this.body = element('div', 'virtual-body'); this.virtualRows = []; this.virtualStart = -1; this.virtualEnd = -1; this.content.appendChild(this.body);
  this.afterMarker = element('button', 'range-marker range-marker-after'); this.afterMarker.type = 'button'; this.afterMarker.addEventListener('click', function () { self.restoreHiddenRows(false); }); this.content.appendChild(this.afterMarker);
  this.footer = element('div', 'grid-row totals-row'); this.footer.setAttribute('role', 'row'); this.content.appendChild(this.footer);
  this.viewport.addEventListener('scroll', function () {
    if (self.scrollFrame !== null) return;
    self.scrollFrame = requestFrame(function () { self.scrollFrame = null; self.renderVirtualRows(); });
  });
  this.refreshData(); this.updateFilterButtons(); this.viewport.scrollTop = oldTop; this.viewport.scrollLeft = oldLeft; this.renderVirtualRows();
};

TableView.prototype.cancelScheduledRender = function () {
  if (this.scrollFrame === null) return;
  cancelFrame(this.scrollFrame); this.scrollFrame = null;
};

TableView.prototype.toggleSort = function (column) {
  if (this.state.sort.column !== column) this.state.sort = { column: column, direction: 'asc' };
  else if (this.state.sort.direction === 'asc') this.state.sort.direction = 'desc';
  else if (this.state.sort.direction === 'desc') this.state.sort = { column: -1, direction: null };
  else this.state.sort = { column: column, direction: 'asc' };
  this.state.rowWindow = null; this.app.clearSelection(); this.renderGrid();
};

TableView.prototype.updateFilterButtons = function () {
  for (var key in this.filterButtons) {
    if (!Object.prototype.hasOwnProperty.call(this.filterButtons, key)) continue;
    var active = !!this.state.valueFilters[Number(key)];
    this.filterButtons[key].className = 'value-filter-button' + (active ? ' value-filter-button-active' : '');
    this.filterButtons[key].setAttribute('aria-pressed', active ? 'true' : 'false');
  }
};

TableView.prototype.beginResize = function (event, columnIndex) {
  var self = this; event.preventDefault(); event.stopPropagation(); var startX = event.clientX; var startWidth = this.state.widths[columnIndex]; var scale = this.state.scale / 100;
  function move(moveEvent) { self.state.widths[columnIndex] = Math.max(60, startWidth + (moveEvent.clientX - startX) / scale); self.applyWidths(); }
  function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
};

TableView.prototype.beginNumberResize = function (event) {
  var self = this; event.preventDefault(); event.stopPropagation(); var startX = event.clientX; var startWidth = this.state.rowNumberWidth; var scale = this.state.scale / 100;
  function move(moveEvent) { self.state.rowNumberWidth = Math.max(42, startWidth + (moveEvent.clientX - startX) / scale); self.applyWidths(); }
  function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
};

TableView.prototype.applyWidths = function () {
  if (!this.viewport || !this.content) return;
  this.layout = this.getColumnLayout(this.viewport.clientWidth || 0); this.content.style.width = this.layout.totalWidth + 'px';
  var numberCells = this.content.querySelectorAll('.number-cell');
  for (var numberIndex = 0; numberIndex < numberCells.length; numberIndex += 1) {
    var numberCell = numberCells[numberIndex]; numberCell.style.width = this.layout.numberWidth + 'px'; numberCell.style.minWidth = this.layout.numberWidth + 'px'; numberCell.style.maxWidth = this.layout.numberWidth + 'px';
    var numberRow = findClassTarget(numberCell, 'data-row', this.content); var numberEntry = this.entryForRow(numberRow);
    if (numberEntry) numberCell.style.paddingLeft = Math.min(4 + numberEntry.depth * 12, Math.max(4, this.layout.numberWidth - 50)) + 'px';
  }
  var rows = this.content.querySelectorAll('.data-row');
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) rows[rowIndex].style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px';
  for (var index = 0; index < this.layout.columns.length; index += 1) {
    var layout = this.layout.columns[index]; var cells = this.content.querySelectorAll('[data-column="' + layout.modelIndex + '"]');
    for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) { cells[cellIndex].style.width = layout.width + 'px'; cells[cellIndex].style.minWidth = layout.width + 'px'; cells[cellIndex].style.maxWidth = layout.width + 'px'; if (layout.pinned) cells[cellIndex].style.left = layout.left + 'px'; }
  }
};

TableView.prototype.applyHeight = function (singleVisible) {
  if (!this.viewport) return;
  var markerCount = (this.hiddenBefore ? 1 : 0) + (this.hiddenAfter ? 1 : 0);
  var fixedRows = 2 + this.pinnedEntries.length + markerCount + 1;
  var minimum = 3 * this.rowHeight + 2;
  var naturalRows = fixedRows + this.bodyEntries.length;
  var naturalHeight = naturalRows * this.rowHeight + 2;
  var limit;
  if (singleVisible) {
    var top = this.viewport.getBoundingClientRect().top;
    limit = Math.max(minimum, Math.floor(window.innerHeight - top - 8));
  } else {
    limit = Math.max(240, Math.min(620, Math.round(window.innerHeight * 0.58)));
    naturalHeight = (fixedRows + Math.min(this.bodyEntries.length, 14)) * this.rowHeight + 2;
  }
  this.viewport.style.height = Math.max(minimum, Math.min(naturalHeight, limit)) + 'px';
};

TableView.prototype.refreshData = function () {
  this.allVisibleRows = model.buildVisibleRows(this.table, this.state, this.app.globalFilter);
  var windowed = model.applyRowWindow(this.allVisibleRows, this.state.rowWindow);
  this.visibleRows = windowed.rows; this.hiddenBefore = windowed.hiddenBefore; this.hiddenAfter = windowed.hiddenAfter;
  var activeGlobal = String(this.app.globalFilter || '').trim() !== '';
  this.card.style.display = activeGlobal && !this.visibleRows.length ? 'none' : ''; this.count.textContent = '(' + this.visibleRows.length + ' / ' + this.table.nodeCount + ')';
  var pinnedMap = {}; var pinned = [];
  for (var pinIndex = 0; pinIndex < this.state.pinnedRows.length; pinIndex += 1) {
    for (var visibleIndex = 0; visibleIndex < this.visibleRows.length; visibleIndex += 1) if (this.visibleRows[visibleIndex].id === this.state.pinnedRows[pinIndex]) { pinned.push({ entry: this.visibleRows[visibleIndex], visibleIndex: visibleIndex }); pinnedMap[this.visibleRows[visibleIndex].id] = true; break; }
  }
  this.bodyEntries = [];
  for (var rowIndex = 0; rowIndex < this.visibleRows.length; rowIndex += 1) if (!pinnedMap[this.visibleRows[rowIndex].id]) this.bodyEntries.push({ entry: this.visibleRows[rowIndex], visibleIndex: rowIndex });
  this.pinnedEntries = pinned; this.resetVirtualRows(); this.body.style.height = this.bodyEntries.length * this.rowHeight + 'px';
  this.applyHeight(false);
  this.renderPinnedRows(); this.renderRangeMarkers(); this.renderFooter(); this.renderVirtualRows(); this.updateStickyPositions(); this.updateFilterButtons();
  this.app.scheduleTableLayouts();
};
TableView.prototype.updateStickyPositions = function () { this.header.style.top = '0'; this.filterRow.style.top = this.rowHeight + 'px'; this.pinnedHost.style.top = this.rowHeight * 2 + 'px'; this.pinnedHost.style.height = this.pinnedEntries.length * this.rowHeight + 'px'; this.beforeMarker.style.height = this.rowHeight + 'px'; this.afterMarker.style.height = this.rowHeight + 'px'; this.footer.style.height = this.rowHeight + 'px'; };
TableView.prototype.renderPinnedRows = function () { clear(this.pinnedHost); if (!this.pinnedEntries.length) { this.pinnedHost.style.display = 'none'; return; } this.pinnedHost.style.display = 'block'; for (var index = 0; index < this.pinnedEntries.length; index += 1) this.pinnedHost.appendChild(this.renderRow(this.pinnedEntries[index].entry, this.pinnedEntries[index].visibleIndex, true)); };
TableView.prototype.renderRangeMarkers = function () { this.beforeMarker.style.display = this.hiddenBefore ? 'block' : 'none'; this.beforeMarker.textContent = this.hiddenBefore ? 'Показать ' + this.hiddenBefore + ' скрытых строк' : ''; this.afterMarker.style.display = this.hiddenAfter ? 'block' : 'none'; this.afterMarker.textContent = this.hiddenAfter ? 'Показать ' + this.hiddenAfter + ' скрытых строк' : ''; };

TableView.prototype.hideRowsAt = function (entry, before) {
  var index = -1;
  for (var rowIndex = 0; rowIndex < this.allVisibleRows.length; rowIndex += 1) if (this.allVisibleRows[rowIndex].id === entry.id) { index = rowIndex; break; }
  if (index < 0) return;
  var current = this.state.rowWindow || { start: 0, end: null };
  this.state.rowWindow = { start: before ? index : current.start, end: before ? current.end : index };
  this.app.clearSelection(); this.refreshData(); this.viewport.scrollTop = 0;
};

TableView.prototype.restoreHiddenRows = function (before) {
  if (!this.state.rowWindow) return;
  if (before) this.state.rowWindow.start = 0; else this.state.rowWindow.end = null;
  if (!this.state.rowWindow.start && this.state.rowWindow.end === null) this.state.rowWindow = null;
  this.app.clearSelection(); this.refreshData();
};

TableView.prototype.resetVirtualRows = function () {
  if (this.body) clear(this.body);
  this.virtualRows = []; this.virtualStart = -1; this.virtualEnd = -1;
};

TableView.prototype.renderVirtualRows = function () {
  if (!this.body || this.state.collapsed) return;
  if (!this.bodyEntries.length) {
    if (this.virtualStart === 0 && this.virtualEnd === 0) return;
    this.resetVirtualRows(); var emptyRow = element('div', 'grid-empty-row', 'Нет строк, соответствующих фильтру.'); emptyRow.style.height = this.rowHeight + 'px'; this.body.appendChild(emptyRow); this.virtualStart = 0; this.virtualEnd = 0; return;
  }
  var fixed = (2 + this.pinnedEntries.length + (this.hiddenBefore ? 1 : 0)) * this.rowHeight;
  var relativeTop = Math.max(0, this.viewport.scrollTop - fixed); var overscan = 8;
  var count = Math.ceil(this.viewport.clientHeight / this.rowHeight) + overscan * 2;
  var targetCount = Math.min(this.bodyEntries.length, count);
  var start = Math.max(0, Math.floor(relativeTop / this.rowHeight) - overscan);
  start = Math.min(start, this.bodyEntries.length - targetCount); var end = start + targetCount;
  if (start === this.virtualStart && end === this.virtualEnd) return;

  var target = {}; var kept = {}; var free = []; var index;
  for (index = start; index < end; index += 1) target[index] = true;
  for (index = 0; index < this.virtualRows.length; index += 1) {
    var oldItem = this.virtualRows[index];
    if (target[oldItem.index]) kept[oldItem.index] = oldItem;
    else { if (oldItem.node.parentNode === this.body) this.body.removeChild(oldItem.node); free.push(oldItem); }
  }

  var nextRows = [];
  for (index = start; index < end; index += 1) {
    var item = kept[index];
    if (!item) {
      item = free.length ? free.pop() : { node: this.createRow(false), index: -1 };
      var data = this.bodyEntries[index]; item.index = index; this.updateRow(item.node, data.entry, data.visibleIndex, false);
      item.node.style.position = 'absolute'; item.node.style.top = index * this.rowHeight + 'px';
      var reference = null;
      for (var nextIndex = index + 1; nextIndex < end; nextIndex += 1) {
        if (kept[nextIndex]) { reference = kept[nextIndex].node; break; }
      }
      this.body.insertBefore(item.node, reference);
    }
    nextRows.push(item);
  }
  this.virtualRows = nextRows; this.virtualStart = start; this.virtualEnd = end;
};

TableView.prototype.createRow = function (pinned) {
  var row = element('div', 'grid-row data-row' + (pinned ? ' pinned-row' : '')); row.setAttribute('role', 'row');
  row.style.height = this.rowHeight + 'px'; row.style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px'; row.appendChild(this.createNumberCell());
  for (var index = 0; index < this.layout.columns.length; index += 1) {
    var layout = this.layout.columns[index]; var cell = element('div', 'grid-cell data-cell'); cell.setAttribute('role', 'gridcell'); cell.setAttribute('data-visible-column', String(layout.visibleIndex)); this.styleCell(cell, layout, false); row.appendChild(cell);
  }
  return row;
};

TableView.prototype.updateRow = function (row, entry, visibleRowIndex, pinned) {
  row.className = 'grid-row data-row' + (pinned ? ' pinned-row' : ''); row.setAttribute('data-row-id', entry.id); row.setAttribute('data-visible-row', String(visibleRowIndex));
  row.style.height = this.rowHeight + 'px'; row.style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px'; this.updateNumberCell(row.children[0], entry);
  for (var layoutIndex = 0; layoutIndex < this.layout.columns.length; layoutIndex += 1) {
    var layout = this.layout.columns[layoutIndex]; var value = entry.row.columns[layout.modelIndex]; var cell = row.children[layoutIndex + 1]; var title = model.cellText(value);
    cell.className = 'grid-cell data-cell' + (layout.pinned ? ' pinned-column' : ''); cell.title = title; cell.setAttribute('data-visible-column', String(layout.visibleIndex)); cell.setAttribute('data-column', String(layout.modelIndex)); clear(cell);
    if (model.isLinkCell(value)) { var link = element('a', 'cell-link', value.label); link.href = '#'; cell.appendChild(link); }
    else cell.textContent = title;
    if (this.isSelected(visibleRowIndex, layout.visibleIndex)) cell.className += ' selected-cell';
  }
};

TableView.prototype.renderRow = function (entry, visibleRowIndex, pinned) {
  var row = this.createRow(pinned); this.updateRow(row, entry, visibleRowIndex, pinned); return row;
};
TableView.prototype.isSelected = function (rowIndex, columnIndex) { var selection = this.state.selection; if (!selection) return false; return rowIndex >= Math.min(selection.startRow, selection.endRow) && rowIndex <= Math.max(selection.startRow, selection.endRow) && columnIndex >= Math.min(selection.startColumn, selection.endColumn) && columnIndex <= Math.max(selection.startColumn, selection.endColumn); };

TableView.prototype.updateRenderedSelection = function () {
  if (!this.content) return;
  var cells = this.content.querySelectorAll('.data-row .data-cell');
  for (var index = 0; index < cells.length; index += 1) {
    var row = findClassTarget(cells[index], 'data-row', this.content);
    setClass(cells[index], 'selected-cell', this.isSelected(Number(row.getAttribute('data-visible-row')), Number(cells[index].getAttribute('data-visible-column'))));
  }
};

TableView.prototype.renderFooter = function () {
  clear(this.footer); var number = element('div', 'grid-cell totals-cell number-cell', 'Итого'); number.style.width = this.layout.numberWidth + 'px'; number.style.minWidth = this.layout.numberWidth + 'px'; number.style.maxWidth = this.layout.numberWidth + 'px'; number.style.position = '-webkit-sticky'; number.style.position = 'sticky'; number.style.left = '0'; number.style.zIndex = '9'; this.footer.appendChild(number);
  for (var index = 0; index < this.layout.columns.length; index += 1) { var layout = this.layout.columns[index]; var type = this.table.columnTypes[layout.modelIndex]; var text = ''; if (type === 'number' || type === 'percent') { var aggregate = this.state.columnAggregates[layout.modelIndex]; var result = model.calculateColumnAggregate(this.table, this.visibleRows, layout.modelIndex, aggregate); text = formatAggregate(result, aggregate); } var cell = element('div', 'grid-cell totals-cell', text); this.styleCell(cell, layout, true); cell.title = text; this.footer.appendChild(cell); }
};
TableView.prototype.updateCollapsed = function () { this.gridHost.style.display = this.state.collapsed ? 'none' : ''; this.collapseButton.textContent = this.state.collapsed ? '+' : '−'; this.collapseButton.title = this.state.collapsed ? 'Развернуть таблицу' : 'Свернуть таблицу'; if (!this.state.collapsed) this.refreshData(); this.app.scheduleTableLayouts(); };

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
