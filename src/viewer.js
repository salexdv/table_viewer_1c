var model = require('./model');

var currentApp = null;
var SCROLLBAR_HIDE_DELAY = 1000;
var AGGREGATES = [
  { value: 'sum', label: 'Сумма' },
  { value: 'average', label: 'Среднее' },
  { value: 'min', label: 'Минимум' },
  { value: 'max', label: 'Максимум' },
  { value: 'count', label: 'Количество' }
];
var COLUMN_AGGREGATES = [{ value: 'none', label: 'Нет' }].concat(AGGREGATES);

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

function menuGroup() {
  var group = element('div', 'menu-group');
  group.setAttribute('role', 'group');
  return group;
}

function appendMenuGroup(menu, group) {
  if (!group || !group.children.length) return false;
  if (menu.children.length) {
    var separator = element('div', 'menu-separator');
    separator.setAttribute('role', 'separator');
    menu.appendChild(separator);
  }
  menu.appendChild(group);
  return true;
}

function addMenuItem(parent, text, onClick, className) {
  var item = addButton(parent, text, '', onClick, 'menu-item' + (className ? ' ' + className : ''));
  item.setAttribute('role', 'menuitem');
  return item;
}

function addSubmenu(app, parent, label, build) {
  var wrapper = element('div', 'menu-submenu');
  var trigger = addMenuItem(wrapper, label, function (event) {
    event.preventDefault();
    event.stopPropagation();
    app.toggleSubmenu(wrapper, submenu, trigger);
  }, 'menu-submenu-trigger');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  var submenu = element('div', 'context-menu context-submenu');
  submenu.setAttribute('role', 'menu');
  var group = menuGroup();
  build(group);
  appendMenuGroup(submenu, group);
  wrapper.appendChild(submenu);
  wrapper.addEventListener('mouseenter', function () { app.openSubmenu(wrapper, submenu, trigger); });
  trigger.addEventListener('focus', function () { app.openSubmenu(wrapper, submenu, trigger); });
  parent.appendChild(wrapper);
  return wrapper;
}

function bindSearchInput(input, onChange) {
  var previousValue = input.value;
  function handleChange() {
    if (input.value === previousValue) return;
    previousValue = input.value;
    onChange();
  }
  input.addEventListener('input', handleChange);
  input.addEventListener('search', handleChange);
  input.addEventListener('change', handleChange);
  return handleChange;
}

function addSearchControl(parent, controlClass, inputClass, placeholder, label, clearLabel, value, onChange) {
  var control = element('div', 'search-control ' + controlClass);
  var input = element('input', 'search-input ' + inputClass);
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  input.value = value || '';
  var clearButton = element('button', 'search-clear-button', '×');
  clearButton.type = 'button';
  clearButton.title = clearLabel;
  clearButton.setAttribute('aria-label', clearLabel);
  function updateClearButton() {
    clearButton.style.display = input.value ? '' : 'none';
  }
  var notify = bindSearchInput(input, function () {
    updateClearButton();
    onChange(input.value);
  });
  clearButton.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    input.value = '';
    notify();
    input.focus();
  });
  control.appendChild(input);
  control.appendChild(clearButton);
  parent.appendChild(control);
  updateClearButton();
  return { control: control, input: input, clearButton: clearButton };
}

function appendHighlightedText(parent, text, ranges) {
  if (!ranges.length) {
    parent.textContent = text;
    return;
  }
  var offset = 0;
  for (var index = 0; index < ranges.length; index += 1) {
    var range = ranges[index];
    if (range.start > offset) parent.appendChild(document.createTextNode(text.slice(offset, range.start)));
    var mark = element('mark', 'search-highlight');
    mark.textContent = text.slice(range.start, range.end);
    parent.appendChild(mark);
    offset = range.end;
  }
  if (offset < text.length) parent.appendChild(document.createTextNode(text.slice(offset)));
}

function displayHighlightRanges(value, text, queries) {
  var matchedQueries = [];
  for (var index = 0; index < queries.length; index += 1) {
    if (model.matchesSearch(value, queries[index])) matchedQueries.push(queries[index]);
  }
  return model.findSearchHighlightRanges(text, matchedQueries);
}

function isValidCssColor(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  var probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = value;
  return probe.style.color !== '';
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
  for (var index = 0; index < COLUMN_AGGREGATES.length; index += 1) {
    if (COLUMN_AGGREGATES[index].value === value) return COLUMN_AGGREGATES[index].label;
  }
  return COLUMN_AGGREGATES[0].label;
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
  this.pageScrollbarTimer = null;
  this.selectionResults = null;
  this.selectionPopup = null;
  this.selectionButton = null;
  this.customContextMenuItems = [];
  this.displaySettings = model.makeDisplaySettings();
  this.onDocumentMouseUp = this.stopSelection.bind(this);
  this.onDocumentMouseDown = this.onOutsidePointer.bind(this);
  this.onDocumentKeyDown = this.onKeyDown.bind(this);
  this.onWindowResize = this.scheduleTableLayouts.bind(this);
  this.onWindowScroll = this.activatePageScrollbar.bind(this);
  document.addEventListener('mouseup', this.onDocumentMouseUp);
  document.addEventListener('click', this.onDocumentMouseDown);
  document.addEventListener('keydown', this.onDocumentKeyDown);
  window.addEventListener('resize', this.onWindowResize);
  window.addEventListener('scroll', this.onWindowScroll);
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
    this.selectionResults = null;
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
  this.closeSelectionPopup();
  clear(this.root);
  this.tableViews = [];
  var toolbar = element('div', 'global-toolbar');
  addSearchControl(toolbar, 'global-search-control', 'global-search', 'Поиск по всем таблицам…', 'Глобальный поиск', 'Очистить глобальный поиск', this.globalFilter, function (value) {
    if (self.globalSearchTimer) clearTimeout(self.globalSearchTimer);
    self.globalSearchTimer = setTimeout(function () {
      self.globalFilter = value;
      self.resetRowRanges();
      self.clearSelection();
      self.refreshTables();
    }, 120);
  });
  var commands = element('div', 'toolbar-commands');
  var columnsGroup = element('div', 'toolbar-group toolbar-columns-group');
  var columnsButton = addButton(columnsGroup, 'Колонки', 'Настроить отображение колонок', function (event) {
    event.stopPropagation();
    self.toggleColumnPanel(columnsButton);
  });
  commands.appendChild(columnsGroup);
  var globalGroup = element('div', 'toolbar-group toolbar-global-group');
  addIconButton(globalGroup, 'collapse-all', 'Свернуть все', function () { self.collapseAll(); }, 'icon-button command-icon-button collapse-all-button');
  addIconButton(globalGroup, 'expand-all', 'Развернуть все', function () { self.expandAll(); }, 'icon-button command-icon-button expand-all-button');
  addButton(globalGroup, 'Экспорт', 'Передать в 1С команду экспорта', function () { self.bridge.send('EVENT_EXPORT', {}); }, 'button button-primary export-button export-button-temporarily-hidden');
  commands.appendChild(globalGroup);
  var selectionGroup = element('div', 'toolbar-group toolbar-selection-group');
  this.selectionButton = addButton(selectionGroup, 'Ʃ', 'Показать итоги выделенных ячеек', function (event) {
    event.stopPropagation();
    self.toggleSelectionPopup();
  }, 'button selection-aggregate-button');
  this.selectionButton.setAttribute('aria-label', this.selectionButton.title);
  this.selectionButton.setAttribute('aria-haspopup', 'true');
  this.selectionButton.setAttribute('aria-expanded', 'false');
  this.selectionButton.setAttribute('aria-controls', 'selection-aggregates-popup');
  commands.appendChild(selectionGroup);
  toolbar.appendChild(commands);
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
  this.positionSelectionPopup();
};

ViewerApp.prototype.resetRowRanges = function () {
  for (var index = 0; index < this.states.length; index += 1) {
    this.states[index].rowWindow = null;
    this.states[index].hiddenRows = {};
  }
};

ViewerApp.prototype.toggleColumnPanel = function (anchor) {
  this.closeSelectionPopup();
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
          setTimeout(function () {
            if (self.columnPanel === panel) self.renderColumnPanel(anchor);
          }, 0);
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
  if (this.selectionPopup && !this.selectionPopup.contains(event.target) && event.target !== this.selectionButton) this.closeSelectionPopup();
};

ViewerApp.prototype.onKeyDown = function (event) {
  if ((event.key === 'Escape' || event.keyCode === 27) && this.menu) this.closeMenu();
  if ((event.key === 'Escape' || event.keyCode === 27) && this.selectionPopup) this.closeSelectionPopup();
};

ViewerApp.prototype.openSubmenu = function (wrapper, submenu, trigger) {
  if (!this.menu || !this.menu.contains(wrapper)) return;
  var wrappers = this.menu.querySelectorAll('.menu-submenu-open');
  for (var index = 0; index < wrappers.length; index += 1) {
    if (wrappers[index] === wrapper) continue;
    setClass(wrappers[index], 'menu-submenu-open', false);
    var oldTrigger = wrappers[index].querySelector('.menu-submenu-trigger');
    if (oldTrigger) oldTrigger.setAttribute('aria-expanded', 'false');
  }
  setClass(wrapper, 'menu-submenu-open', true);
  trigger.setAttribute('aria-expanded', 'true');
  submenu.style.left = '0px';
  submenu.style.top = '0px';
  var rect = wrapper.getBoundingClientRect();
  var width = submenu.offsetWidth;
  var height = submenu.offsetHeight;
  var left = rect.right + 3;
  if (left + width > window.innerWidth - 4) left = rect.left - width - 3;
  var top = Math.max(4, Math.min(rect.top - 4, window.innerHeight - height - 4));
  submenu.style.left = Math.max(4, left) + 'px';
  submenu.style.top = top + 'px';
};

ViewerApp.prototype.toggleSubmenu = function (wrapper, submenu, trigger) {
  if ((' ' + wrapper.className + ' ').indexOf(' menu-submenu-open ') !== -1) {
    setClass(wrapper, 'menu-submenu-open', false);
    trigger.setAttribute('aria-expanded', 'false');
    return;
  }
  this.openSubmenu(wrapper, submenu, trigger);
};

ViewerApp.prototype.openAggregateMenu = function (view, columnIndex, anchor) {
  var self = this;
  this.closeSelectionPopup();
  this.closeMenu();
  var menu = element('div', 'context-menu aggregate-menu');
  menu.setAttribute('role', 'menu');
  for (var index = 0; index < COLUMN_AGGREGATES.length; index += 1) {
    (function (aggregate) {
      var active = view.state.columnAggregates[columnIndex] === aggregate.value;
      addButton(menu, (active ? '✓ ' : '') + aggregate.label, '', function () {
        view.state.columnAggregates[columnIndex] = aggregate.value;
        anchor.title = 'Функция итога: ' + aggregate.label;
        anchor.setAttribute('aria-label', anchor.title);
        self.closeMenu();
        view.renderFooter();
        view.updateStickyPositions();
        self.scheduleTableLayouts();
      }, 'menu-item' + (active ? ' menu-item-active' : ''));
    })(COLUMN_AGGREGATES[index]);
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

ViewerApp.prototype.addContextMenuItem = function (title, eventName) {
  if (typeof title !== 'string' || !title.trim() || typeof eventName !== 'string' || !eventName.trim()) return false;
  this.customContextMenuItems.push({ title: title, eventName: eventName });
  return true;
};

ViewerApp.prototype.refreshCellDisplays = function () {
  if (this.tablesHost && this.tablesHost.parentNode === this.root) this.refreshTables();
};

ViewerApp.prototype.setNegativeNumberColor = function (color) {
  if (color !== null && !isValidCssColor(color)) return false;
  this.displaySettings.negativeNumberColor = color;
  this.refreshCellDisplays();
  return true;
};

ViewerApp.prototype.setCellValuePresentation = function (value, presentation) {
  if (presentation !== null && typeof presentation !== 'string') return false;
  if (!model.setScalarRule(this.displaySettings.presentations, value, presentation)) return false;
  this.refreshCellDisplays();
  return true;
};

ViewerApp.prototype.setCellValueColor = function (value, color) {
  if (color !== null && !isValidCssColor(color)) return false;
  if (!model.setScalarRule(this.displaySettings.colors, value, color)) return false;
  this.refreshCellDisplays();
  return true;
};

ViewerApp.prototype.setShowEmptyReferences = function (enabled) {
  this.displaySettings.showEmptyReferences = !!enabled;
  this.refreshCellDisplays();
  return true;
};

ViewerApp.prototype.setEmptyReferenceColor = function (color) {
  if (color !== null && !isValidCssColor(color)) return false;
  this.displaySettings.emptyReferenceColor = color === null ? model.EMPTY_REFERENCE_COLOR : color;
  this.refreshCellDisplays();
  return true;
};

ViewerApp.prototype.openValueFilter = function (view, columnIndex, anchor) {
  var self = this;
  this.closeSelectionPopup();
  this.closeFilterPanel();
  this.closeMenu();
  var values = model.getAvailableValues(view.table, view.state, this.globalFilter, columnIndex);
  var active = view.state.valueFilters[columnIndex];
  var draft = copySelectionMap(active);
  if (!active) for (var allIndex = 0; allIndex < values.length; allIndex += 1) draft[values[allIndex].value] = true;

  var panel = element('div', 'value-filter-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Фильтр значений колонки ' + view.table.columns[columnIndex]);
  var searchControl = addSearchControl(panel, 'value-filter-search-control', 'value-filter-search', 'Найти значение…', 'Поиск значений', 'Очистить поиск значений', '', filterValues);
  var search = searchControl.input;
  var commands = element('div', 'value-filter-commands'); panel.appendChild(commands);
  var list = element('div', 'value-filter-list'); list.setAttribute('role', 'group');
  var canvas = element('div', 'value-filter-canvas'); list.appendChild(canvas); panel.appendChild(list);
  var actions = element('div', 'value-filter-actions'); panel.appendChild(actions);
  var filtered = values.slice();
  var itemHeight = 27;

  function filterValues(value) {
    var needle = String(value || '').trim().toLocaleLowerCase();
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
    view.resetRowRanges();
    self.clearSelection(); self.closeFilterPanel(); view.refreshData(); view.updateFilterButtons();
  }, 'button button-primary button-small');
  addButton(actions, 'Отмена', '', function () { self.closeFilterPanel(); }, 'button button-small');
  addButton(actions, 'Очистить фильтр', '', function () {
    view.state.valueFilters[columnIndex] = null; view.resetRowRanges();
    self.clearSelection(); self.closeFilterPanel(); view.refreshData(); view.updateFilterButtons();
  }, 'button button-small');
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
  this.closeSelectionPopup();
  this.closeMenu();
  var menu = element('div', 'context-menu');
  menu.setAttribute('role', 'menu');

  var filterGroup = menuGroup();
  if (columnIndex >= 0) {
    addMenuItem(filterGroup, 'Отбор по значению', function () {
      view.state.columnFilters[columnIndex] = model.cellText(entry.row.columns[columnIndex]);
      view.state.exactFilters[columnIndex] = true;
      view.resetRowRanges();
      self.clearSelection(); self.closeMenu(); view.renderGrid();
    });
  }
  appendMenuGroup(menu, filterGroup);

  var pinGroup = menuGroup();
  var rowPinned = arrayIndex(view.state.pinnedRows, entry.id) !== -1;
  addMenuItem(pinGroup, rowPinned ? 'Открепить строку' : 'Зафиксировать строку', function () {
    if (rowPinned) removeValue(view.state.pinnedRows, entry.id);
    else view.state.pinnedRows.push(entry.id);
    self.closeMenu(); view.refreshData();
  });
  if (columnIndex >= 0) {
    var columnPinned = arrayIndex(view.state.pinnedColumns, columnIndex) !== -1;
    addMenuItem(pinGroup, columnPinned ? 'Открепить колонку' : 'Зафиксировать колонку', function () {
      if (columnPinned) removeValue(view.state.pinnedColumns, columnIndex);
      else view.state.pinnedColumns.push(columnIndex);
      self.clearSelection(); self.closeMenu(); view.renderGrid();
    });
  }
  appendMenuGroup(menu, pinGroup);

  var collapseGroup = menuGroup();
  addSubmenu(this, collapseGroup, 'Сворачивание', function (submenuGroup) {
    addMenuItem(submenuGroup, 'Свернуть выделенные', function () {
      self.closeMenu(); view.hideSelectedRows(entry);
    });
    addMenuItem(submenuGroup, 'Свернуть до', function () {
      self.closeMenu(); view.hideRowsAt(entry, true);
    });
    addMenuItem(submenuGroup, 'Свернуть после', function () {
      self.closeMenu(); view.hideRowsAt(entry, false);
    });
  });
  appendMenuGroup(menu, collapseGroup);

  if (view.table.isTree) {
    var groupingGroup = menuGroup();
    addSubmenu(this, groupingGroup, 'Уровень группировки', function (submenuGroup) {
      var maximum = model.treeDepth(view.table);
      for (var level = 1; level <= maximum; level += 1) {
        (function (targetLevel) {
          addMenuItem(submenuGroup, 'Уровень ' + targetLevel, function () {
            self.closeMenu(); view.setGroupingLevel(targetLevel);
          });
        })(level);
      }
    });
    appendMenuGroup(menu, groupingGroup);
  }

  if (columnIndex >= 0) {
    var customGroup = menuGroup();
    var value = entry.row.columns[columnIndex];
    for (var itemIndex = 0; itemIndex < this.customContextMenuItems.length; itemIndex += 1) {
      (function (item) {
        addMenuItem(customGroup, item.title, function () {
          var params = model.isLinkCell(value) ? { value: value.label, ref: value.ref } : { value: value };
          self.closeMenu(); self.bridge.send(item.eventName, params);
        }, 'custom-menu-item');
      })(this.customContextMenuItems[itemIndex]);
    }
    appendMenuGroup(menu, customGroup);
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

ViewerApp.prototype.positionSelectionPopup = function () {
  if (!this.selectionPopup || !this.selectionButton) return;
  var rect = this.selectionButton.getBoundingClientRect();
  this.selectionPopup.style.left = Math.max(4, Math.min(rect.right - this.selectionPopup.offsetWidth, window.innerWidth - this.selectionPopup.offsetWidth - 4)) + 'px';
  this.selectionPopup.style.top = Math.max(4, Math.min(rect.bottom + 3, window.innerHeight - this.selectionPopup.offsetHeight - 4)) + 'px';
};

ViewerApp.prototype.renderSelectionPopup = function () {
  if (!this.selectionPopup) return;
  clear(this.selectionPopup);
  if (!this.selectionResults || !this.selectionResults.count) {
    this.selectionPopup.appendChild(element('div', 'selection-empty', 'Числа не выделены'));
    this.positionSelectionPopup();
    return;
  }
  for (var index = 0; index < AGGREGATES.length; index += 1) {
    var aggregate = AGGREGATES[index];
    var row = element('div', 'selection-result-row');
    row.appendChild(element('span', 'selection-result-label', aggregate.label));
    row.appendChild(element('span', 'selection-result-value', formatAggregate({
      value: this.selectionResults.results[aggregate.value],
      kind: this.selectionResults.kind
    }, aggregate.value)));
    this.selectionPopup.appendChild(row);
  }
  this.positionSelectionPopup();
};

ViewerApp.prototype.toggleSelectionPopup = function () {
  if (this.selectionPopup) { this.closeSelectionPopup(); return; }
  this.closeMenu();
  this.closeColumnPanel();
  this.closeFilterPanel();
  var popup = element('div', 'selection-aggregates-popup');
  popup.id = 'selection-aggregates-popup';
  popup.setAttribute('role', 'tooltip');
  document.body.appendChild(popup);
  this.selectionPopup = popup;
  this.selectionButton.setAttribute('aria-expanded', 'true');
  this.selectionButton.setAttribute('aria-describedby', popup.id);
  this.renderSelectionPopup();
};

ViewerApp.prototype.closeSelectionPopup = function () {
  if (this.selectionPopup && this.selectionPopup.parentNode) this.selectionPopup.parentNode.removeChild(this.selectionPopup);
  this.selectionPopup = null;
  if (this.selectionButton) {
    this.selectionButton.setAttribute('aria-expanded', 'false');
    this.selectionButton.removeAttribute('aria-describedby');
  }
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
  this.selectionResults = null;
  this.renderSelectionPopup();
};
ViewerApp.prototype.updateSelection = function (view) {
  this.selectionResults = model.calculateSelectionAggregates(view.table, view.visibleRows, view.state.selection, view.visibleColumns);
  this.renderSelectionPopup();
};

ViewerApp.prototype.expandAll = function () {
  for (var index = 0; index < this.states.length; index += 1) { this.states[index].collapsed = false; this.states[index].collapsedRows = {}; this.states[index].rowWindow = null; this.states[index].hiddenRows = {}; }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.collapseAll = function () {
  for (var index = 0; index < this.states.length; index += 1) {
    this.states[index].collapsed = true; this.states[index].collapsedRows = {}; this.states[index].rowWindow = null; this.states[index].hiddenRows = {};
    var nodes = model.allNodes(this.data.tables[index]);
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) if (nodes[nodeIndex].children.length) this.states[index].collapsedRows[nodes[nodeIndex].id] = true;
  }
  this.clearSelection();
  for (var viewIndex = 0; viewIndex < this.tableViews.length; viewIndex += 1) this.tableViews[viewIndex].updateCollapsed();
};
ViewerApp.prototype.setTableCollapsed = function (tableIndex, collapsed) {
  if (!this.states[tableIndex]) return false;
  this.states[tableIndex].collapsed = !!collapsed; this.states[tableIndex].rowWindow = null; this.states[tableIndex].hiddenRows = {}; this.clearSelection(); this.tableViews[tableIndex].updateCollapsed(); return true;
};
ViewerApp.prototype.setTreeExpanded = function (tableIndex, expanded) {
  if (!this.states[tableIndex]) return false;
  var state = this.states[tableIndex]; state.collapsedRows = {}; state.rowWindow = null; state.hiddenRows = {};
  if (!expanded) {
    var nodes = model.allNodes(this.data.tables[tableIndex]);
    for (var index = 0; index < nodes.length; index += 1) if (nodes[index].children.length) state.collapsedRows[nodes[index].id] = true;
  }
  this.clearSelection(); this.tableViews[tableIndex].refreshData(); return true;
};
ViewerApp.prototype.activatePageScrollbar = function () {
  var self = this; var root = document.documentElement;
  setClass(root, 'scrollbar-active', true);
  if (this.pageScrollbarTimer !== null) clearTimeout(this.pageScrollbarTimer);
  this.pageScrollbarTimer = setTimeout(function () {
    self.pageScrollbarTimer = null;
    setClass(root, 'scrollbar-active', false);
  }, SCROLLBAR_HIDE_DELAY);
};
ViewerApp.prototype.cancelPageScrollbar = function () {
  if (this.pageScrollbarTimer !== null) clearTimeout(this.pageScrollbarTimer);
  this.pageScrollbarTimer = null;
  setClass(document.documentElement, 'scrollbar-active', false);
};
ViewerApp.prototype.destroy = function () {
  if (this.globalSearchTimer) clearTimeout(this.globalSearchTimer);
  if (this.layoutFrame) cancelFrame(this.layoutFrame);
  for (var index = 0; index < this.tableViews.length; index += 1) this.tableViews[index].cancelScheduledRender();
  document.removeEventListener('mouseup', this.onDocumentMouseUp);
  document.removeEventListener('click', this.onDocumentMouseDown);
  document.removeEventListener('keydown', this.onDocumentKeyDown);
  window.removeEventListener('resize', this.onWindowResize);
  window.removeEventListener('scroll', this.onWindowScroll);
  this.cancelPageScrollbar();
  this.closeMenu(); this.closeColumnPanel(); this.closeFilterPanel(); this.closeSelectionPopup(); this.bridge.destroy(); clear(this.root);
};

function TableView(app, table, state, tableIndex) {
  this.app = app; this.table = table; this.state = state; this.tableIndex = tableIndex;
  this.allVisibleRows = []; this.visibleRows = []; this.visibleColumns = []; this.bodyEntries = []; this.pinnedEntries = [];
  this.hiddenBefore = 0; this.hiddenAfter = 0; this.filterButtons = {};
  this.rowHeight = 26; this.scrollFrame = null; this.scrollbarTimer = null; this.virtualRows = []; this.virtualStart = -1; this.virtualEnd = -1; this.card = this.createCard();
}

TableView.prototype.createCard = function () {
  var self = this;
  var card = element('section', 'table-card'); card.setAttribute('data-table-index', String(this.tableIndex));
  var titlebar = element('header', 'table-titlebar');
  this.collapseButton = addButton(titlebar, '−', 'Свернуть таблицу', function () { self.state.collapsed = !self.state.collapsed; self.resetRowRanges(); self.app.clearSelection(); self.updateCollapsed(); }, 'icon-button');
  titlebar.appendChild(element('strong', 'table-title', this.table.name || 'Таблица ' + (this.tableIndex + 1)));
  this.count = element('span', 'table-count'); titlebar.appendChild(this.count); titlebar.appendChild(element('span', 'title-spacer'));
  if (this.table.isTree) {
    var treeCommands = element('div', 'tree-command-group');
    addIconButton(treeCommands, 'expand-tree', 'Раскрыть дерево', function () { self.app.setTreeExpanded(self.tableIndex, true); }, 'icon-button tree-command-button expand-tree-button');
    addIconButton(treeCommands, 'collapse-tree', 'Свернуть дерево', function () { self.app.setTreeExpanded(self.tableIndex, false); }, 'icon-button tree-command-button collapse-tree-button');
    titlebar.appendChild(treeCommands);
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
  var hiddenMarker = findClassTarget(event.target, 'hidden-row-marker', this.content);
  if (hiddenMarker) {
    event.preventDefault(); event.stopPropagation();
    this.restoreHiddenRange(hiddenMarker._hiddenRowIds || []);
    return;
  }
  var toggle = findClassTarget(event.target, 'tree-toggle', this.content);
  if (toggle) {
    var toggleRow = findClassTarget(toggle, 'data-row', this.content); var toggleEntry = this.entryForRow(toggleRow);
    if (!toggleEntry) return;
    event.preventDefault(); event.stopPropagation();
    if (toggleEntry.expanded) this.state.collapsedRows[toggleEntry.id] = true;
    else delete this.state.collapsedRows[toggleEntry.id];
    this.resetRowRanges(); this.app.clearSelection(); this.refreshData(); return;
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
      addSearchControl(control, 'column-filter-search-control', 'column-filter', 'Фильтр…', 'Фильтр по колонке ' + self.table.columns[layout.modelIndex], 'Очистить фильтр по колонке ' + self.table.columns[layout.modelIndex], self.state.columnFilters[layout.modelIndex], function (value) { self.state.columnFilters[layout.modelIndex] = value; delete self.state.exactFilters[layout.modelIndex]; self.resetRowRanges(); self.app.clearSelection(); self.refreshData(); });
      var valuesButton = element('button', 'value-filter-button', '▾'); valuesButton.type = 'button'; valuesButton.title = 'Выбрать значения колонки'; valuesButton.setAttribute('aria-label', valuesButton.title);
      valuesButton.addEventListener('click', function (event) { event.stopPropagation(); self.app.openValueFilter(self, layout.modelIndex, valuesButton); });
      self.filterButtons[layout.modelIndex] = valuesButton;
      control.appendChild(valuesButton); cell.appendChild(control); self.filterRow.appendChild(cell);
    })(this.layout.columns[filterIndex]);
  }
  this.content.appendChild(this.filterRow); this.pinnedHost = element('div', 'pinned-rows'); this.content.appendChild(this.pinnedHost);
  this.beforeMarker = element('button', 'range-marker range-marker-before'); this.beforeMarker.type = 'button'; this.beforeMarker.addEventListener('click', function () { self.restoreHiddenRows(true); }); this.content.appendChild(this.beforeMarker);
  this.body = element('div', 'virtual-body'); this.virtualRows = []; this.virtualStart = -1; this.virtualEnd = -1; this.content.appendChild(this.body);
  this.afterMarker = element('button', 'range-marker range-marker-after'); this.afterMarker.type = 'button'; this.afterMarker.addEventListener('click', function () { self.restoreHiddenRows(false); }); this.content.appendChild(this.afterMarker);
  this.footer = element('div', 'grid-row totals-row'); this.footer.setAttribute('role', 'row'); this.content.appendChild(this.footer);
  this.viewport.addEventListener('scroll', function () {
    self.activateScrollbar();
    if (self.scrollFrame !== null) return;
    self.scrollFrame = requestFrame(function () { self.scrollFrame = null; self.renderVirtualRows(); });
  });
  this.refreshData(); this.updateFilterButtons(); this.viewport.scrollTop = oldTop; this.viewport.scrollLeft = oldLeft; this.renderVirtualRows();
};

TableView.prototype.activateScrollbar = function () {
  var self = this; var viewport = this.viewport;
  setClass(viewport, 'scrollbar-active', true);
  if (this.scrollbarTimer !== null) clearTimeout(this.scrollbarTimer);
  this.scrollbarTimer = setTimeout(function () {
    setClass(viewport, 'scrollbar-active', false);
    if (self.viewport === viewport) self.scrollbarTimer = null;
  }, SCROLLBAR_HIDE_DELAY);
};

TableView.prototype.cancelScheduledRender = function () {
  if (this.scrollFrame !== null) { cancelFrame(this.scrollFrame); this.scrollFrame = null; }
  if (this.scrollbarTimer !== null) { clearTimeout(this.scrollbarTimer); this.scrollbarTimer = null; }
  if (this.viewport) setClass(this.viewport, 'scrollbar-active', false);
};

TableView.prototype.toggleSort = function (column) {
  if (this.state.sort.column !== column) this.state.sort = { column: column, direction: 'asc' };
  else if (this.state.sort.direction === 'asc') this.state.sort.direction = 'desc';
  else if (this.state.sort.direction === 'desc') this.state.sort = { column: -1, direction: null };
  else this.state.sort = { column: column, direction: 'asc' };
  this.resetRowRanges(); this.app.clearSelection(); this.renderGrid();
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
  var hiddenMarkers = this.content.querySelectorAll('.hidden-row-marker');
  for (var markerIndex = 0; markerIndex < hiddenMarkers.length; markerIndex += 1) hiddenMarkers[markerIndex].style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px';
  for (var index = 0; index < this.layout.columns.length; index += 1) {
    var layout = this.layout.columns[index]; var cells = this.content.querySelectorAll('[data-column="' + layout.modelIndex + '"]');
    for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) { cells[cellIndex].style.width = layout.width + 'px'; cells[cellIndex].style.minWidth = layout.width + 'px'; cells[cellIndex].style.maxWidth = layout.width + 'px'; if (layout.pinned) cells[cellIndex].style.left = layout.left + 'px'; }
  }
};

TableView.prototype.applyHeight = function (singleVisible) {
  if (!this.viewport) return;
  var markerCount = (this.hiddenBefore ? 1 : 0) + (this.hiddenAfter ? 1 : 0);
  var fixedRows = 2 + this.pinnedEntries.length + markerCount + (this.hasVisibleColumnAggregates() ? 1 : 0);
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
  var projection = model.applyHiddenRows(windowed.rows, this.state.hiddenRows);
  this.visibleRows = projection.rows; this.hiddenBefore = windowed.hiddenBefore; this.hiddenAfter = windowed.hiddenAfter;
  var activeGlobal = String(this.app.globalFilter || '').trim() !== '';
  this.card.style.display = activeGlobal && !windowed.rows.length ? 'none' : ''; this.count.textContent = '(' + this.visibleRows.length + ' / ' + this.table.nodeCount + ')';
  var pinnedMap = {}; var pinned = [];
  for (var pinIndex = 0; pinIndex < this.state.pinnedRows.length; pinIndex += 1) {
    for (var visibleIndex = 0; visibleIndex < this.visibleRows.length; visibleIndex += 1) if (this.visibleRows[visibleIndex].id === this.state.pinnedRows[pinIndex]) { pinned.push({ entry: this.visibleRows[visibleIndex], visibleIndex: visibleIndex }); pinnedMap[this.visibleRows[visibleIndex].id] = true; break; }
  }
  this.bodyEntries = [];
  for (var itemIndex = 0; itemIndex < projection.items.length; itemIndex += 1) {
    var item = projection.items[itemIndex];
    if (item.kind === 'marker') this.bodyEntries.push({ kind: 'marker', ids: item.ids });
    else if (!pinnedMap[item.row.id]) this.bodyEntries.push({ kind: 'row', entry: item.row, visibleIndex: item.visibleIndex });
  }
  this.pinnedEntries = pinned; this.resetVirtualRows(); this.body.style.height = this.bodyEntries.length * this.rowHeight + 'px';
  this.applyHeight(false);
  this.renderPinnedRows(); this.renderRangeMarkers(); this.renderFooter(); this.renderVirtualRows(); this.updateStickyPositions(); this.updateFilterButtons();
  this.app.scheduleTableLayouts();
};
TableView.prototype.updateStickyPositions = function () { this.header.style.top = '0'; this.filterRow.style.top = this.rowHeight + 'px'; this.pinnedHost.style.top = this.rowHeight * 2 + 'px'; this.pinnedHost.style.height = this.pinnedEntries.length * this.rowHeight + 'px'; this.beforeMarker.style.height = this.rowHeight + 'px'; this.afterMarker.style.height = this.rowHeight + 'px'; this.footer.style.height = this.hasVisibleColumnAggregates() ? this.rowHeight + 'px' : '0'; };
TableView.prototype.renderPinnedRows = function () { clear(this.pinnedHost); if (!this.pinnedEntries.length) { this.pinnedHost.style.display = 'none'; return; } this.pinnedHost.style.display = 'block'; for (var index = 0; index < this.pinnedEntries.length; index += 1) this.pinnedHost.appendChild(this.renderRow(this.pinnedEntries[index].entry, this.pinnedEntries[index].visibleIndex, true)); };
TableView.prototype.renderRangeMarkers = function () { this.beforeMarker.style.display = this.hiddenBefore ? 'block' : 'none'; this.beforeMarker.textContent = this.hiddenBefore ? 'Показать ' + this.hiddenBefore + ' скрытых строк' : ''; this.afterMarker.style.display = this.hiddenAfter ? 'block' : 'none'; this.afterMarker.textContent = this.hiddenAfter ? 'Показать ' + this.hiddenAfter + ' скрытых строк' : ''; };

TableView.prototype.resetRowRanges = function () {
  this.state.rowWindow = null;
  this.state.hiddenRows = {};
};

TableView.prototype.hideSelectedRows = function (entry) {
  var clickedIndex = -1;
  for (var index = 0; index < this.visibleRows.length; index += 1) {
    if (this.visibleRows[index].id === entry.id) { clickedIndex = index; break; }
  }
  if (clickedIndex < 0) return;
  var start = clickedIndex;
  var end = clickedIndex;
  var selection = this.state.selection;
  if (selection) {
    var selectedStart = Math.min(selection.startRow, selection.endRow);
    var selectedEnd = Math.max(selection.startRow, selection.endRow);
    if (clickedIndex >= selectedStart && clickedIndex <= selectedEnd) {
      start = Math.max(0, selectedStart);
      end = Math.min(this.visibleRows.length - 1, selectedEnd);
    }
  }
  for (var rowIndex = start; rowIndex <= end; rowIndex += 1) this.state.hiddenRows[this.visibleRows[rowIndex].id] = true;
  this.app.clearSelection(); this.refreshData();
};

TableView.prototype.restoreHiddenRange = function (ids) {
  for (var index = 0; index < ids.length; index += 1) delete this.state.hiddenRows[ids[index]];
  this.app.clearSelection(); this.refreshData();
};

TableView.prototype.setGroupingLevel = function (level) {
  this.state.collapsedRows = model.collapsedRowsForLevel(this.table, level);
  this.resetRowRanges();
  this.app.clearSelection(); this.refreshData();
};

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

TableView.prototype.createHiddenMarker = function () {
  var marker = element('button', 'range-marker hidden-row-marker');
  marker.type = 'button';
  return marker;
};

TableView.prototype.updateHiddenMarker = function (marker, ids) {
  marker._hiddenRowIds = ids.slice();
  marker.textContent = 'Показать ' + ids.length + ' скрытых строк';
  marker.style.height = this.rowHeight + 'px';
  marker.style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px';
};

TableView.prototype.renderVirtualRows = function () {
  if (!this.body || this.state.collapsed) return;
  if (!this.bodyEntries.length) {
    if (this.virtualStart === 0 && this.virtualEnd === 0) return;
    this.resetVirtualRows();
    if (!this.pinnedEntries.length && !this.hiddenBefore && !this.hiddenAfter) {
      var emptyRow = element('div', 'grid-empty-row', 'Нет строк, соответствующих фильтру.'); emptyRow.style.height = this.rowHeight + 'px'; this.body.appendChild(emptyRow);
    }
    this.virtualStart = 0; this.virtualEnd = 0; return;
  }
  var fixed = (2 + this.pinnedEntries.length + (this.hiddenBefore ? 1 : 0)) * this.rowHeight;
  var relativeTop = Math.max(0, this.viewport.scrollTop - fixed); var overscan = 8;
  var count = Math.ceil(this.viewport.clientHeight / this.rowHeight) + overscan * 2;
  var targetCount = Math.min(this.bodyEntries.length, count);
  var start = Math.max(0, Math.floor(relativeTop / this.rowHeight) - overscan);
  start = Math.min(start, this.bodyEntries.length - targetCount); var end = start + targetCount;
  if (start === this.virtualStart && end === this.virtualEnd) return;

  var target = {}; var kept = {}; var freeRows = []; var freeMarkers = []; var index;
  for (index = start; index < end; index += 1) target[index] = true;
  for (index = 0; index < this.virtualRows.length; index += 1) {
    var oldItem = this.virtualRows[index];
    if (target[oldItem.index]) kept[oldItem.index] = oldItem;
    else {
      if (oldItem.node.parentNode === this.body) this.body.removeChild(oldItem.node);
      if (oldItem.kind === 'marker') freeMarkers.push(oldItem); else freeRows.push(oldItem);
    }
  }

  var nextRows = [];
  for (index = start; index < end; index += 1) {
    var item = kept[index];
    var data = this.bodyEntries[index];
    if (item && item.kind !== data.kind) {
      if (item.node.parentNode === this.body) this.body.removeChild(item.node);
      if (item.kind === 'marker') freeMarkers.push(item); else freeRows.push(item);
      item = null;
    }
    if (!item) {
      if (data.kind === 'marker') item = freeMarkers.length ? freeMarkers.pop() : { node: this.createHiddenMarker(), index: -1, kind: 'marker' };
      else item = freeRows.length ? freeRows.pop() : { node: this.createRow(false), index: -1, kind: 'row' };
      item.index = index;
      item.kind = data.kind;
      if (data.kind === 'marker') this.updateHiddenMarker(item.node, data.ids);
      else this.updateRow(item.node, data.entry, data.visibleIndex, false);
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
    var layout = this.layout.columns[index]; var type = this.table.columnTypes[layout.modelIndex]; var numericClass = type === 'number' || type === 'percent' ? ' numeric-cell' : '';
    var cell = element('div', 'grid-cell data-cell' + numericClass); cell.setAttribute('role', 'gridcell'); cell.setAttribute('data-visible-column', String(layout.visibleIndex)); this.styleCell(cell, layout, false); row.appendChild(cell);
  }
  return row;
};

TableView.prototype.updateRow = function (row, entry, visibleRowIndex, pinned) {
  row.className = 'grid-row data-row' + (pinned ? ' pinned-row' : ''); row.setAttribute('data-row-id', entry.id); row.setAttribute('data-visible-row', String(visibleRowIndex));
  row.style.height = this.rowHeight + 'px'; row.style.width = Math.max(this.layout.totalWidth, this.viewport.clientWidth || 0) + 'px'; this.updateNumberCell(row.children[0], entry);
  for (var layoutIndex = 0; layoutIndex < this.layout.columns.length; layoutIndex += 1) {
    var layout = this.layout.columns[layoutIndex]; var value = entry.row.columns[layout.modelIndex]; var cell = row.children[layoutIndex + 1]; var display = model.resolveCellDisplay(value, this.app.displaySettings); var title = display.text; var type = this.table.columnTypes[layout.modelIndex];
    cell.className = 'grid-cell data-cell' + (type === 'number' || type === 'percent' ? ' numeric-cell' : '') + (layout.pinned ? ' pinned-column' : '') + (display.isEmptyReference ? ' empty-reference-cell' : ''); cell.title = title; cell.style.color = display.color || ''; cell.setAttribute('data-visible-column', String(layout.visibleIndex)); cell.setAttribute('data-column', String(layout.modelIndex)); clear(cell);
    var ranges = displayHighlightRanges(value, title, [this.app.globalFilter, this.state.columnFilters[layout.modelIndex]]);
    if (display.isLink) { var link = element('a', 'cell-link'); link.href = '#'; appendHighlightedText(link, title, ranges); cell.appendChild(link); }
    else appendHighlightedText(cell, title, ranges);
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

TableView.prototype.hasVisibleColumnAggregates = function () {
  for (var index = 0; index < this.layout.columns.length; index += 1) {
    var aggregate = this.state.columnAggregates[this.layout.columns[index].modelIndex];
    if (aggregate && aggregate !== 'none') return true;
  }
  return false;
};
TableView.prototype.renderFooter = function () {
  clear(this.footer);
  if (!this.hasVisibleColumnAggregates()) { this.footer.style.display = 'none'; return; }
  this.footer.style.display = '';
  var number = element('div', 'grid-cell totals-cell number-cell', 'Итого'); number.style.width = this.layout.numberWidth + 'px'; number.style.minWidth = this.layout.numberWidth + 'px'; number.style.maxWidth = this.layout.numberWidth + 'px'; number.style.position = '-webkit-sticky'; number.style.position = 'sticky'; number.style.left = '0'; number.style.zIndex = '9'; this.footer.appendChild(number);
  for (var index = 0; index < this.layout.columns.length; index += 1) { var layout = this.layout.columns[index]; var type = this.table.columnTypes[layout.modelIndex]; var aggregate = this.state.columnAggregates[layout.modelIndex]; var text = ''; if ((type === 'number' || type === 'percent') && aggregate && aggregate !== 'none') { var result = model.calculateColumnAggregate(this.table, this.visibleRows, layout.modelIndex, aggregate); text = formatAggregate(result, aggregate); } var cell = element('div', 'grid-cell totals-cell' + (type === 'number' || type === 'percent' ? ' numeric-cell' : ''), text); this.styleCell(cell, layout, true); cell.title = text; this.footer.appendChild(cell); }
};
TableView.prototype.updateCollapsed = function () { this.gridHost.style.display = this.state.collapsed ? 'none' : ''; this.collapseButton.textContent = this.state.collapsed ? '+' : '−'; this.collapseButton.title = this.state.collapsed ? 'Развернуть таблицу' : 'Свернуть таблицу'; if (!this.state.collapsed) this.refreshData(); this.app.scheduleTableLayouts(); };

function installPublicApi() {
  window.init = function (data) { if (currentApp) currentApp.destroy(); var root = document.getElementById('app'); if (!root) return false; currentApp = new ViewerApp(root); return currentApp.load(data); };
  window.setData = function (data) { if (!currentApp) return window.init(data); return currentApp.load(data); };
  window.setTableCollapsed = function (tableIndex, collapsed) { return currentApp ? currentApp.setTableCollapsed(Number(tableIndex), collapsed) : false; };
  window.setTreeExpanded = function (tableIndex, expanded) { return currentApp ? currentApp.setTreeExpanded(Number(tableIndex), expanded) : false; };
  window.expandAll = function () { if (!currentApp) return false; currentApp.expandAll(); return true; };
  window.collapseAll = function () { if (!currentApp) return false; currentApp.collapseAll(); return true; };
  window.addContextMenuItem = function (title, eventName) { return currentApp ? currentApp.addContextMenuItem(title, eventName) : false; };
  window.setNegativeNumberColor = function (color) { return currentApp ? currentApp.setNegativeNumberColor(color) : false; };
  window.setCellValuePresentation = function (value, presentation) { return currentApp ? currentApp.setCellValuePresentation(value, presentation) : false; };
  window.setCellValueColor = function (value, color) { return currentApp ? currentApp.setCellValueColor(value, color) : false; };
  window.setShowEmptyReferences = function (enabled) { return currentApp ? currentApp.setShowEmptyReferences(enabled) : false; };
  window.setEmptyReferenceColor = function (color) { return currentApp ? currentApp.setEmptyReferenceColor(color) : false; };
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
