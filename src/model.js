function ValidationError(path, message) {
  this.name = 'ValidationError';
  this.path = path;
  this.message = path + ': ' + message;
  if (Error.captureStackTrace) Error.captureStackTrace(this, ValidationError);
}
ValidationError.prototype = Object.create(Error.prototype);
ValidationError.prototype.constructor = ValidationError;

function fail(path, message) {
  throw new ValidationError(path, message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLinkCell(value) {
  return isObject(value) && typeof value.label === 'string' && typeof value.ref === 'string';
}

var EMPTY_REFERENCE_COLOR = '#6d7d91';

function scalarValueKey(value) {
  if (value === null) return 'null:';
  if (typeof value === 'string') return 'string:' + value;
  if (typeof value === 'boolean') return 'boolean:' + String(value);
  if (typeof value === 'number' && isFinite(value)) return 'number:' + String(value === 0 ? 0 : value);
  return null;
}

function setScalarRule(rules, value, replacement) {
  var key = scalarValueKey(value);
  if (key === null) return false;
  if (replacement === null) delete rules[key];
  else rules[key] = replacement;
  return true;
}

function isEmptyReference(value) {
  return isLinkCell(value) && /0{32}$/.test(value.ref);
}

function emptyReferenceText(value) {
  if (!isEmptyReference(value)) return null;
  var match = /^e1cib\/data\/([^?]+)\?ref=/.exec(value.ref);
  return match && match[1] ? '<' + match[1] + ' (пустая)>' : '<пустая ссылка>';
}

function makeDisplaySettings() {
  return {
    negativeNumberColor: null,
    presentations: Object.create(null),
    colors: Object.create(null),
    showEmptyReferences: false,
    emptyReferenceColor: EMPTY_REFERENCE_COLOR
  };
}

function resolveCellDisplay(value, settings) {
  var source = settings || makeDisplaySettings();
  if (source.showEmptyReferences && isEmptyReference(value)) {
    return {
      text: emptyReferenceText(value),
      color: source.emptyReferenceColor || EMPTY_REFERENCE_COLOR,
      isLink: false,
      isEmptyReference: true
    };
  }

  var text = cellText(value);
  var color = null;
  var key = scalarValueKey(value);
  if (key !== null && source.presentations && hasOwn(source.presentations, key)) text = source.presentations[key];
  if (key !== null && source.colors && hasOwn(source.colors, key)) color = source.colors[key];
  else if (source.negativeNumberColor) {
    var parsed = parseNumeric(value);
    if (parsed && parsed.value < 0) color = source.negativeNumberColor;
  }
  return { text: text, color: color, isLink: isLinkCell(value), isEmptyReference: false };
}

function validateCell(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!isFinite(value)) fail(path, 'число должно быть конечным');
    return value;
  }
  if (isLinkCell(value)) return { label: value.label, ref: value.ref };
  fail(path, 'ожидалось простое значение или объект { label, ref }');
}

function validateKnownFields(value, allowed, path) {
  for (var key in value) {
    if (hasOwn(value, key) && !hasOwn(allowed, key)) fail(path + '.' + key, 'неизвестное поле');
  }
}

function validateIdentifier(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'ожидалась непустая строка');
  return value;
}

function validateTarget(source, path) {
  var target = {};
  if (!hasOwn(source, 'id') && !hasOwn(source, 'index')) fail(path, 'ожидалось поле id или index');
  if (hasOwn(source, 'id')) target.id = validateIdentifier(source.id, path + '.id');
  if (hasOwn(source, 'index')) {
    if (typeof source.index !== 'number' || !isFinite(source.index) || source.index < 0 || Math.floor(source.index) !== source.index) {
      fail(path + '.index', 'ожидалось целое неотрицательное число');
    }
    target.index = source.index;
  }
  return target;
}

function targetKey(target) {
  return hasOwn(target, 'id') ? 'id:' + target.id : 'index:' + target.index;
}

function parseFilterPatch(source, path) {
  if (source === null) return null;
  if (!isObject(source)) fail(path, 'ожидался объект или null');
  validateKnownFields(source, { text: true, exact: true, values: true }, path);
  var filter = {};
  if (hasOwn(source, 'text')) {
    if (typeof source.text !== 'string') fail(path + '.text', 'ожидалась строка');
    filter.text = source.text;
  }
  if (hasOwn(source, 'exact')) {
    if (typeof source.exact !== 'boolean') fail(path + '.exact', 'ожидалось boolean-значение');
    filter.exact = source.exact;
  }
  if (hasOwn(source, 'values')) {
    if (source.values === null) filter.values = null;
    else {
      if (!Array.isArray(source.values)) fail(path + '.values', 'ожидался массив строк или null');
      filter.values = source.values.map(function (value, index) {
        if (typeof value !== 'string') fail(path + '.values[' + index + ']', 'ожидалась строка');
        return value;
      });
    }
  }
  return filter;
}

function parseColumnSettingsPatch(source, path) {
  if (!isObject(source)) fail(path, 'ожидался объект');
  validateKnownFields(source, {
    id: true, index: true, visible: true, width: true, aggregate: true, filter: true
  }, path);
  var result = validateTarget(source, path);
  if (hasOwn(source, 'visible')) {
    if (typeof source.visible !== 'boolean') fail(path + '.visible', 'ожидалось boolean-значение');
    result.visible = source.visible;
  }
  if (hasOwn(source, 'width')) {
    if (typeof source.width !== 'number' || !isFinite(source.width) || source.width < 60) {
      fail(path + '.width', 'ожидалось конечное число не меньше 60');
    }
    result.width = source.width;
  }
  if (hasOwn(source, 'aggregate')) {
    if (['none', 'sum', 'average', 'min', 'max', 'count'].indexOf(source.aggregate) === -1) {
      fail(path + '.aggregate', 'неподдерживаемая функция итога');
    }
    result.aggregate = source.aggregate;
  }
  if (hasOwn(source, 'filter')) result.filter = parseFilterPatch(source.filter, path + '.filter');
  return result;
}

function parsePinnedColumns(source, path) {
  if (!Array.isArray(source)) fail(path, 'ожидался массив id или индексов');
  var seen = Object.create(null);
  return source.map(function (reference, index) {
    var key;
    if (typeof reference === 'string' && reference.trim()) key = 'id:' + reference;
    else if (typeof reference === 'number' && isFinite(reference) && reference >= 0 && Math.floor(reference) === reference) {
      key = 'index:' + reference;
    } else fail(path + '[' + index + ']', 'ожидался непустой строковый id или целый неотрицательный индекс');
    if (hasOwn(seen, key)) fail(path + '[' + index + ']', 'ссылка на колонку повторяется');
    seen[key] = true;
    return reference;
  });
}

function parsePinnedRows(source, path) {
  if (!Array.isArray(source)) fail(path, 'ожидался массив номеров или путей строк');
  var seen = Object.create(null);
  return source.map(function (reference, index) {
    var key;
    if (typeof reference === 'number' && isFinite(reference) && reference >= 1 && Math.floor(reference) === reference) {
      key = String(reference);
    } else if (typeof reference === 'string' && /^[1-9]\d*(?:\.[1-9]\d*)+$/.test(reference)) {
      key = reference;
    } else fail(path + '[' + index + ']', 'ожидался целый положительный номер или 1-based путь строки');
    if (hasOwn(seen, key)) fail(path + '[' + index + ']', 'ссылка на строку повторяется');
    seen[key] = true;
    return reference;
  });
}

function parseTableSettingsPatch(source, path) {
  if (!isObject(source)) fail(path, 'ожидался объект');
  validateKnownFields(source, {
    id: true, index: true, scale: true, columnOrder: true, columns: true, pinnedColumns: true, pinnedRows: true
  }, path);
  var result = validateTarget(source, path);
  if (hasOwn(source, 'scale')) {
    if (
      typeof source.scale !== 'number' || !isFinite(source.scale) || source.scale < 50 || source.scale > 200 ||
      Math.floor(source.scale) !== source.scale || source.scale % 10 !== 0
    ) fail(path + '.scale', 'ожидалось целое число от 50 до 200 с шагом 10');
    result.scale = source.scale;
  }
  if (hasOwn(source, 'columnOrder')) {
    if (!Array.isArray(source.columnOrder)) fail(path + '.columnOrder', 'ожидался массив id или индексов');
    var orderSeen = Object.create(null);
    result.columnOrder = source.columnOrder.map(function (reference, index) {
      var key;
      if (typeof reference === 'string' && reference.trim()) key = 'id:' + reference;
      else if (typeof reference === 'number' && isFinite(reference) && reference >= 0 && Math.floor(reference) === reference) key = 'index:' + reference;
      else fail(path + '.columnOrder[' + index + ']', 'ожидался непустой строковый id или целый неотрицательный индекс');
      if (hasOwn(orderSeen, key)) fail(path + '.columnOrder[' + index + ']', 'ссылка на колонку повторяется');
      orderSeen[key] = true;
      return reference;
    });
  }
  if (hasOwn(source, 'columns')) {
    if (!Array.isArray(source.columns)) fail(path + '.columns', 'ожидался массив');
    var columnsSeen = Object.create(null);
    result.columns = source.columns.map(function (column, index) {
      var parsed = parseColumnSettingsPatch(column, path + '.columns[' + index + ']');
      var key = targetKey(parsed);
      if (hasOwn(columnsSeen, key)) fail(path + '.columns[' + index + ']', 'настройки колонки повторяются');
      columnsSeen[key] = true;
      return parsed;
    });
  }
  if (hasOwn(source, 'pinnedColumns')) result.pinnedColumns = parsePinnedColumns(source.pinnedColumns, path + '.pinnedColumns');
  if (hasOwn(source, 'pinnedRows')) result.pinnedRows = parsePinnedRows(source.pinnedRows, path + '.pinnedRows');
  return result;
}

function parseViewSettingsObject(source, path) {
  if (!isObject(source)) fail(path, 'ожидался объект');
  validateKnownFields(source, { version: true, theme: true, globalFilter: true, tables: true }, path);
  var result = {};
  if (hasOwn(source, 'version')) {
    if (source.version !== 1) fail(path + '.version', 'поддерживается только версия 1');
    result.version = 1;
  }
  if (hasOwn(source, 'theme')) {
    if (source.theme !== 'light' && source.theme !== 'dark') fail(path + '.theme', 'ожидалось light или dark');
    result.theme = source.theme;
  }
  if (hasOwn(source, 'globalFilter')) {
    if (typeof source.globalFilter !== 'string') fail(path + '.globalFilter', 'ожидалась строка');
    result.globalFilter = source.globalFilter;
  }
  if (hasOwn(source, 'tables')) {
    if (!Array.isArray(source.tables)) fail(path + '.tables', 'ожидался массив');
    var tablesSeen = Object.create(null);
    result.tables = source.tables.map(function (table, index) {
      var parsed = parseTableSettingsPatch(table, path + '.tables[' + index + ']');
      var key = targetKey(parsed);
      if (hasOwn(tablesSeen, key)) fail(path + '.tables[' + index + ']', 'настройки таблицы повторяются');
      tablesSeen[key] = true;
      return parsed;
    });
  }
  return result;
}

function parseViewSettings(input) {
  var source = input;
  if (typeof input === 'string') {
    try {
      source = JSON.parse(input);
    } catch (error) {
      fail('$', 'не удалось разобрать JSON — ' + error.message);
    }
  }
  return parseViewSettingsObject(source, '$');
}

function parseData(input) {
  var source = input;
  if (typeof input === 'string') {
    try {
      source = JSON.parse(input);
    } catch (error) {
      fail('$', 'не удалось разобрать JSON — ' + error.message);
    }
  }

  if (!isObject(source)) fail('$', 'ожидался объект');
  if (!Array.isArray(source.tables)) fail('$.tables', 'ожидался массив');

  var tables = [];
  var tableIds = Object.create(null);
  for (var tableIndex = 0; tableIndex < source.tables.length; tableIndex += 1) {
    var rawTable = source.tables[tableIndex];
    var tablePath = '$.tables[' + tableIndex + ']';
    if (!isObject(rawTable)) fail(tablePath, 'ожидался объект');
    if (typeof rawTable.name !== 'string') fail(tablePath + '.name', 'ожидалась строка');
    if (!Array.isArray(rawTable.columns)) fail(tablePath + '.columns', 'ожидался массив колонок');
    if (!Array.isArray(rawTable.rows)) fail(tablePath + '.rows', 'ожидался массив');

    var tableId;
    if (hasOwn(rawTable, 'id')) {
      tableId = validateIdentifier(rawTable.id, tablePath + '.id');
      if (hasOwn(tableIds, tableId)) fail(tablePath + '.id', 'идентификатор таблицы повторяется');
      tableIds[tableId] = true;
    }

    var columnIds = [];
    var seenColumnIds = Object.create(null);
    var columns = rawTable.columns.map(function (column, columnIndex) {
      var columnPath = tablePath + '.columns[' + columnIndex + ']';
      if (typeof column === 'string') {
        columnIds.push(null);
        return column;
      }
      if (!isObject(column)) fail(columnPath, 'ожидалась строка или объект { id, name }');
      validateKnownFields(column, { id: true, name: true }, columnPath);
      var columnId = validateIdentifier(column.id, columnPath + '.id');
      if (typeof column.name !== 'string') fail(columnPath + '.name', 'ожидалась строка');
      if (hasOwn(seenColumnIds, columnId)) fail(columnPath + '.id', 'идентификатор колонки повторяется');
      seenColumnIds[columnId] = true;
      columnIds.push(columnId);
      return column.name;
    });
    var roots = new Array(rawTable.rows.length);
    var table = { id: tableId, name: rawTable.name, columns: columns, columnIds: columnIds, rows: roots, isTree: false, nodeCount: 0 };
    var stack = [];

    for (var rootIndex = rawTable.rows.length - 1; rootIndex >= 0; rootIndex -= 1) {
      stack.push({
        raw: rawTable.rows[rootIndex],
        target: roots,
        targetIndex: rootIndex,
        path: tablePath + '.rows[' + rootIndex + ']',
        id: String(rootIndex),
        originalIndex: rootIndex
      });
    }

    while (stack.length) {
      var item = stack.pop();
      if (!isObject(item.raw)) fail(item.path, 'ожидался объект строки');
      if (!Array.isArray(item.raw.columns)) fail(item.path + '.columns', 'ожидался массив');
      if (item.raw.columns.length !== columns.length) {
        fail(item.path + '.columns', 'ожидалось ' + columns.length + ' ячеек, получено ' + item.raw.columns.length);
      }
      if (item.raw.children !== undefined && !Array.isArray(item.raw.children)) {
        fail(item.path + '.children', 'ожидался массив');
      }

      var cells = item.raw.columns.map(function (cell, cellIndex) {
        return validateCell(cell, item.path + '.columns[' + cellIndex + ']');
      });
      var rawChildren = item.raw.children || [];
      var children = new Array(rawChildren.length);
      var node = {
        id: item.id,
        originalIndex: item.originalIndex,
        columns: cells,
        children: children
      };
      item.target[item.targetIndex] = node;
      table.nodeCount += 1;
      if (rawChildren.length) table.isTree = true;

      for (var childIndex = rawChildren.length - 1; childIndex >= 0; childIndex -= 1) {
        stack.push({
          raw: rawChildren[childIndex],
          target: children,
          targetIndex: childIndex,
          path: item.path + '.children[' + childIndex + ']',
          id: item.id + '.' + childIndex,
          originalIndex: childIndex
        });
      }
    }

    table.columnTypes = detectColumnTypes(table);
    tables.push(table);
  }

  var result = { tables: tables };
  if (hasOwn(source, 'settings')) result.settings = parseViewSettingsObject(source.settings, '$.settings');
  return result;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (isLinkCell(value)) return value.label;
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  return String(value);
}

function parseNumeric(value) {
  if (typeof value === 'number' && isFinite(value)) return { kind: 'number', value: value };
  if (typeof value !== 'string') return null;

  var raw = value.replace(/[\u00a0\u202f]/g, ' ').trim();
  if (!raw) return null;
  var percent = /%$/.test(raw);
  if (percent) raw = raw.slice(0, -1).trim();
  raw = raw.replace(/\s+/g, '');
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) return null;

  var unsigned = raw.replace(/^[+-]/, '');
  var integerPart = unsigned.split(/[.,]/)[0];
  if (integerPart.length > 1 && integerPart.charAt(0) === '0') return null;

  var number = Number(raw.replace(',', '.'));
  if (!isFinite(number)) return null;
  return { kind: percent ? 'percent' : 'number', value: number };
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  var match = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  var day = Number(match[1]);
  var month = Number(match[2]);
  var year = Number(match[3]);
  var hours = Number(match[4] || 0);
  var minutes = Number(match[5] || 0);
  var seconds = Number(match[6] || 0);
  var date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hours || date.getMinutes() !== minutes || date.getSeconds() !== seconds
  ) return null;
  return date.getTime();
}

function allNodes(table) {
  var result = [];
  var stack = table.rows.slice().reverse();
  while (stack.length) {
    var node = stack.pop();
    result.push(node);
    for (var index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
  }
  return result;
}

function detectColumnTypes(table) {
  var nodes = allNodes(table);
  var result = [];

  for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
    var found = false;
    var numericKind = null;
    var numeric = true;
    var dated = true;

    for (var rowIndex = 0; rowIndex < nodes.length; rowIndex += 1) {
      var value = nodes[rowIndex].columns[columnIndex];
      if (value === null || (typeof value === 'string' && !value.trim())) continue;
      found = true;
      var parsedNumber = parseNumeric(value);
      var parsedDate = parseDate(value);
      if (!parsedNumber) numeric = false;
      else if (numericKind === null) numericKind = parsedNumber.kind;
      else if (numericKind !== parsedNumber.kind) numeric = false;
      if (parsedDate === null) dated = false;
    }

    if (found && numeric) result.push(numericKind || 'number');
    else if (found && dated) result.push('date');
    else result.push('text');
  }
  return result;
}

function normalizeSearch(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function parseSearchQuery(value) {
  var normalized = normalizeSearch(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function matchesSearchFragments(value, fragments) {
  if (!fragments.length) return false;
  var text = normalizeSearch(cellText(value));
  var offset = 0;
  for (var index = 0; index < fragments.length; index += 1) {
    var found = text.indexOf(fragments[index], offset);
    if (found === -1) return false;
    offset = found + fragments[index].length;
  }
  return true;
}

function matchesSearch(value, query) {
  return matchesSearchFragments(value, parseSearchQuery(query));
}

function mergeRanges(ranges) {
  ranges.sort(function (left, right) {
    return left.start === right.start ? left.end - right.end : left.start - right.start;
  });
  var merged = [];
  for (var index = 0; index < ranges.length; index += 1) {
    var current = ranges[index];
    var previous = merged.length ? merged[merged.length - 1] : null;
    if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else merged.push({ start: current.start, end: current.end });
  }
  return merged;
}

function findSearchHighlightRanges(value, queries) {
  var source = cellText(value);
  var text = source.toLocaleLowerCase();
  var list = Array.isArray(queries) ? queries : [queries];
  var ranges = [];
  for (var queryIndex = 0; queryIndex < list.length; queryIndex += 1) {
    var fragments = parseSearchQuery(list[queryIndex]);
    if (!matchesSearchFragments(source, fragments)) continue;
    for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
      var fragment = fragments[fragmentIndex];
      var offset = 0;
      while (offset <= text.length - fragment.length) {
        var found = text.indexOf(fragment, offset);
        if (found === -1) break;
        ranges.push({ start: found, end: found + fragment.length });
        offset = found + fragment.length;
      }
    }
  }
  return mergeRanges(ranges);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function rowMatches(row, state, globalFilter, ignoredColumn) {
  var globalFragments = parseSearchQuery(globalFilter);
  if (globalFragments.length) {
    var globalMatch = false;
    for (var cellIndex = 0; cellIndex < row.columns.length; cellIndex += 1) {
      if (matchesSearchFragments(row.columns[cellIndex], globalFragments)) {
        globalMatch = true;
        break;
      }
    }
    if (!globalMatch) return false;
  }

  for (var index = 0; index < state.columnFilters.length; index += 1) {
    if (index === ignoredColumn) continue;
    var filter = state.columnFilters[index];
    var actual = normalizeSearch(cellText(row.columns[index]));
    var filterFragments = parseSearchQuery(filter);
    if (filterFragments.length) {
      var expected = normalizeSearch(filter);
      if (state.exactFilters[index]) {
        if (actual !== expected) return false;
      } else if (!matchesSearchFragments(row.columns[index], filterFragments)) return false;
    }
    var selected = state.valueFilters && state.valueFilters[index];
    if (selected && !hasOwn(selected, cellText(row.columns[index]))) return false;
  }
  return true;
}

function hasActiveFilters(state, globalFilter) {
  if (parseSearchQuery(globalFilter).length) return true;
  for (var index = 0; index < state.columnFilters.length; index += 1) {
    if (parseSearchQuery(state.columnFilters[index]).length) return true;
    if (state.valueFilters && state.valueFilters[index]) return true;
  }
  return false;
}

function compareCells(left, right, type) {
  var leftText = cellText(left).trim();
  var rightText = cellText(right).trim();
  var leftEmpty = leftText === '';
  var rightEmpty = rightText === '';
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  if (type === 'number' || type === 'percent') {
    return parseNumeric(left).value - parseNumeric(right).value;
  }
  if (type === 'date') return parseDate(left) - parseDate(right);
  return leftText.toLocaleLowerCase().localeCompare(rightText.toLocaleLowerCase());
}

function sortedSiblings(rows, table, state) {
  var result = rows.slice();
  if (!state.sort || state.sort.column < 0 || !state.sort.direction) return result;
  var direction = state.sort.direction === 'desc' ? -1 : 1;
  var column = state.sort.column;
  var type = table.columnTypes[column];
  result.sort(function (left, right) {
    var leftEmpty = cellText(left.columns[column]).trim() === '';
    var rightEmpty = cellText(right.columns[column]).trim() === '';
    if (leftEmpty || rightEmpty) {
      if (leftEmpty && rightEmpty) return left.originalIndex - right.originalIndex;
      return leftEmpty ? 1 : -1;
    }
    var compared = compareCells(left.columns[column], right.columns[column], type);
    if (compared === 0) return left.originalIndex - right.originalIndex;
    return compared * direction;
  });
  return result;
}

function buildKeepMap(table, state, globalFilter) {
  var keep = {};
  var order = [];
  var stack = table.rows.slice().reverse();
  while (stack.length) {
    var node = stack.pop();
    order.push(node);
    for (var index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
  }
  for (var orderIndex = order.length - 1; orderIndex >= 0; orderIndex -= 1) {
    var current = order[orderIndex];
    var retained = rowMatches(current, state, globalFilter);
    for (var childIndex = 0; childIndex < current.children.length && !retained; childIndex += 1) {
      retained = !!keep[current.children[childIndex].id];
    }
    keep[current.id] = retained;
  }
  return keep;
}

function buildVisibleRows(table, state, globalFilter) {
  var filtering = hasActiveFilters(state, globalFilter);
  var keep = filtering ? buildKeepMap(table, state, globalFilter) : null;
  var visible = [];
  var roots = sortedSiblings(table.rows, table, state);
  var retainedRoots = [];
  var stack = [];

  for (var rootKeepIndex = 0; rootKeepIndex < roots.length; rootKeepIndex += 1) {
    if (!keep || keep[roots[rootKeepIndex].id]) retainedRoots.push(roots[rootKeepIndex]);
  }
  for (var rootIndex = retainedRoots.length - 1; rootIndex >= 0; rootIndex -= 1) {
    stack.push({ node: retainedRoots[rootIndex], depth: 0, number: String(rootIndex + 1) });
  }

  while (stack.length) {
    var item = stack.pop();
    var expanded = filtering || !state.collapsedRows[item.node.id];
    visible.push({
      id: item.node.id,
      row: item.node,
      depth: item.depth,
      number: item.number,
      hasChildren: item.node.children.length > 0,
      expanded: expanded
    });
    if (!expanded || !item.node.children.length) continue;

    var children = sortedSiblings(item.node.children, table, state);
    var retainedChildren = [];
    for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
      if (!keep || keep[children[childIndex].id]) retainedChildren.push(children[childIndex]);
    }
    for (var retainedIndex = retainedChildren.length - 1; retainedIndex >= 0; retainedIndex -= 1) {
      stack.push({
        node: retainedChildren[retainedIndex],
        depth: item.depth + 1,
        number: item.number + '.' + (retainedIndex + 1)
      });
    }
  }
  return visible;
}

function getAvailableValues(table, state, globalFilter, columnIndex) {
  var nodes = allNodes(table);
  var seen = Object.create(null);
  var values = [];
  for (var index = 0; index < nodes.length; index += 1) {
    if (!rowMatches(nodes[index], state, globalFilter, columnIndex)) continue;
    var value = cellText(nodes[index].columns[columnIndex]);
    if (hasOwn(seen, value)) continue;
    seen[value] = true;
    values.push({ value: value, label: value === '' ? '(Пустые)' : value });
  }
  var type = table.columnTypes[columnIndex];
  values.sort(function (left, right) {
    return compareCells(left.value, right.value, type);
  });
  return values;
}

function applyRowWindow(rows, rowWindow) {
  if (!rowWindow) return { rows: rows, hiddenBefore: 0, hiddenAfter: 0 };
  var start = Math.max(0, Math.min(rows.length, Number(rowWindow.start) || 0));
  var rawEnd = rowWindow.end === null || rowWindow.end === undefined ? rows.length - 1 : Number(rowWindow.end);
  var end = Math.max(-1, Math.min(rows.length - 1, isFinite(rawEnd) ? rawEnd : rows.length - 1));
  if (end < start) return { rows: [], hiddenBefore: start, hiddenAfter: Math.max(0, rows.length - start) };
  return {
    rows: rows.slice(start, end + 1),
    hiddenBefore: start,
    hiddenAfter: Math.max(0, rows.length - end - 1)
  };
}

function applyHiddenRows(rows, hiddenRows) {
  var visibleRows = [];
  var items = [];
  var hiddenIds = [];

  function appendMarker() {
    if (!hiddenIds.length) return;
    items.push({ kind: 'marker', ids: hiddenIds });
    hiddenIds = [];
  }

  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    if (hiddenRows && hiddenRows[row.id]) {
      hiddenIds.push(row.id);
      continue;
    }
    appendMarker();
    items.push({ kind: 'row', row: row, visibleIndex: visibleRows.length });
    visibleRows.push(row);
  }
  appendMarker();
  return { rows: visibleRows, items: items };
}

function treeDepth(table) {
  var maximum = 0;
  var stack = [];
  for (var rootIndex = table.rows.length - 1; rootIndex >= 0; rootIndex -= 1) {
    stack.push({ node: table.rows[rootIndex], level: 1 });
  }
  while (stack.length) {
    var item = stack.pop();
    maximum = Math.max(maximum, item.level);
    for (var childIndex = item.node.children.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push({ node: item.node.children[childIndex], level: item.level + 1 });
    }
  }
  return maximum;
}

function collapsedRowsForLevel(table, level) {
  var maximum = treeDepth(table);
  var target = Math.max(1, Math.min(maximum, Number(level) || 1));
  var collapsed = {};
  var stack = [];
  for (var rootIndex = table.rows.length - 1; rootIndex >= 0; rootIndex -= 1) {
    stack.push({ node: table.rows[rootIndex], level: 1 });
  }
  while (stack.length) {
    var item = stack.pop();
    if (item.node.children.length && item.level >= target) collapsed[item.node.id] = true;
    for (var childIndex = item.node.children.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push({ node: item.node.children[childIndex], level: item.level + 1 });
    }
  }
  return collapsed;
}

function initialColumnWidth(table, nodes, columnIndex) {
  var headerWidth = table.columns[columnIndex].length * 8 + 48;
  var contentWidth = 0;
  for (var index = 0; index < nodes.length; index += 1) {
    contentWidth = Math.max(contentWidth, cellText(nodes[index].columns[columnIndex]).length * 7 + 22);
  }
  return Math.max(88, Math.min(360, Math.max(headerWidth, contentWidth)));
}

function initialRowNumberWidth(table) {
  var width = 56;
  var stack = [];
  for (var rootIndex = table.rows.length - 1; rootIndex >= 0; rootIndex -= 1) {
    stack.push({ node: table.rows[rootIndex], number: String(rootIndex + 1), depth: 0 });
  }
  while (stack.length) {
    var item = stack.pop();
    width = Math.max(width, 12 + 20 + item.depth * 12 + item.number.length * 8);
    for (var childIndex = item.node.children.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push({ node: item.node.children[childIndex], number: item.number + '.' + (childIndex + 1), depth: item.depth + 1 });
    }
  }
  return Math.min(220, width);
}

function makeTableState(table) {
  var widths = [];
  var filters = [];
  var valueFilters = [];
  var columnAggregates = [];
  var columnOrder = [];
  var nodes = allNodes(table);
  for (var index = 0; index < table.columns.length; index += 1) {
    widths.push(initialColumnWidth(table, nodes, index));
    filters.push('');
    valueFilters.push(null);
    columnAggregates.push('none');
    columnOrder.push(index);
  }
  return {
    collapsed: false,
    collapsedRows: {},
    columnFilters: filters,
    exactFilters: {},
    valueFilters: valueFilters,
    columnAggregates: columnAggregates,
    hiddenColumns: {},
    columnOrder: columnOrder,
    pinnedColumns: [],
    pinnedRows: [],
    rowNumberWidth: initialRowNumberWidth(table),
    widths: widths,
    scale: 100,
    sort: { column: -1, direction: null },
    selection: null,
    rowWindow: null,
    hiddenRows: {}
  };
}

function cloneMap(source) {
  var result = Object.create(null);
  if (!source) return result;
  for (var key in source) if (hasOwn(source, key)) result[key] = source[key];
  return result;
}

function cloneValueFilters(source) {
  var result = [];
  for (var index = 0; index < source.length; index += 1) {
    if (source[index] === null) result.push(null);
    else result.push(cloneMap(source[index]));
  }
  return result;
}

function cloneTableState(state) {
  return {
    collapsed: state.collapsed,
    collapsedRows: cloneMap(state.collapsedRows),
    columnFilters: state.columnFilters.slice(),
    exactFilters: cloneMap(state.exactFilters),
    valueFilters: cloneValueFilters(state.valueFilters),
    columnAggregates: state.columnAggregates.slice(),
    hiddenColumns: cloneMap(state.hiddenColumns),
    columnOrder: state.columnOrder.slice(),
    pinnedColumns: state.pinnedColumns.slice(),
    pinnedRows: state.pinnedRows.slice(),
    rowNumberWidth: state.rowNumberWidth,
    widths: state.widths.slice(),
    scale: state.scale,
    sort: { column: state.sort.column, direction: state.sort.direction },
    selection: state.selection ? {
      startRow: state.selection.startRow,
      endRow: state.selection.endRow,
      startColumn: state.selection.startColumn,
      endColumn: state.selection.endColumn
    } : null,
    rowWindow: state.rowWindow ? { start: state.rowWindow.start, end: state.rowWindow.end } : null,
    hiddenRows: cloneMap(state.hiddenRows)
  };
}

function findTableIndex(data, target) {
  var index;
  if (hasOwn(target, 'id')) {
    for (index = 0; index < data.tables.length; index += 1) if (data.tables[index].id === target.id) return index;
    return -1;
  }
  return target.index < data.tables.length ? target.index : -1;
}

function findColumnIndex(table, reference) {
  var index;
  if (typeof reference === 'string') {
    for (index = 0; index < table.columnIds.length; index += 1) if (table.columnIds[index] === reference) return index;
    return -1;
  }
  return reference < table.columns.length ? reference : -1;
}

function findColumnTargetIndex(table, target) {
  return hasOwn(target, 'id') ? findColumnIndex(table, target.id) : findColumnIndex(table, target.index);
}

function warningTarget(target) {
  return hasOwn(target, 'id') ? 'id=' + JSON.stringify(target.id) : 'index=' + target.index;
}

function applyColumnOrder(table, state, references, path, warnings) {
  var resolved = [];
  var seen = Object.create(null);
  for (var index = 0; index < references.length; index += 1) {
    var columnIndex = findColumnIndex(table, references[index]);
    if (columnIndex === -1) {
      warnings.push(path + '[' + index + ']: колонка не найдена, ссылка пропущена');
      continue;
    }
    if (hasOwn(seen, columnIndex)) fail(path + '[' + index + ']', 'ссылки указывают на одну колонку');
    seen[columnIndex] = true;
    resolved.push(columnIndex);
  }
  for (var orderIndex = 0; orderIndex < state.columnOrder.length; orderIndex += 1) {
    var current = state.columnOrder[orderIndex];
    if (!hasOwn(seen, current)) resolved.push(current);
  }
  state.columnOrder = resolved;
}

function valuesToMap(values) {
  if (values === null) return null;
  var result = Object.create(null);
  for (var index = 0; index < values.length; index += 1) result[values[index]] = true;
  return result;
}

function applyFilterPatch(state, columnIndex, filter) {
  if (filter === null) {
    state.columnFilters[columnIndex] = '';
    delete state.exactFilters[columnIndex];
    state.valueFilters[columnIndex] = null;
    return;
  }
  if (hasOwn(filter, 'text')) state.columnFilters[columnIndex] = filter.text;
  if (hasOwn(filter, 'exact')) {
    if (filter.exact) state.exactFilters[columnIndex] = true;
    else delete state.exactFilters[columnIndex];
  }
  if (hasOwn(filter, 'values')) state.valueFilters[columnIndex] = valuesToMap(filter.values);
}

function applyPinnedColumns(table, state, references, path, warnings) {
  var resolved = [];
  var seen = Object.create(null);
  var missing = false;
  for (var index = 0; index < references.length; index += 1) {
    var columnIndex = findColumnIndex(table, references[index]);
    if (columnIndex === -1) {
      warnings.push(path + '[' + index + ']: колонка не найдена, фиксация колонок сброшена');
      missing = true;
      continue;
    }
    if (hasOwn(seen, columnIndex)) fail(path + '[' + index + ']', 'ссылки указывают на одну колонку');
    seen[columnIndex] = true;
    resolved.push(columnIndex);
  }
  state.pinnedColumns = missing ? [] : resolved;
}

function rowReferenceToId(reference) {
  if (typeof reference === 'number') return String(reference - 1);
  return reference.split('.').map(function (part) { return String(Number(part) - 1); }).join('.');
}

function rowIdToReference(id) {
  var parts = id.split('.');
  if (parts.length === 1) return Number(parts[0]) + 1;
  return parts.map(function (part) { return String(Number(part) + 1); }).join('.');
}

function applyPinnedRows(table, state, references, path, warnings) {
  var nodes = allNodes(table);
  var available = Object.create(null);
  for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) available[nodes[nodeIndex].id] = true;
  var resolved = [];
  var seen = Object.create(null);
  var missing = false;
  for (var index = 0; index < references.length; index += 1) {
    var id = rowReferenceToId(references[index]);
    if (!hasOwn(available, id)) {
      warnings.push(path + '[' + index + ']: строка не найдена, фиксация строк сброшена');
      missing = true;
      continue;
    }
    if (hasOwn(seen, id)) fail(path + '[' + index + ']', 'ссылки указывают на одну строку');
    seen[id] = true;
    resolved.push(id);
  }
  state.pinnedRows = missing ? [] : resolved;
}

function applyViewSettings(data, states, globalFilter, settings, theme) {
  var nextStates = states.map(cloneTableState);
  var nextGlobalFilter = globalFilter;
  var nextTheme = theme === 'dark' ? 'dark' : 'light';
  var warnings = [];
  var filtersChanged = Object.create(null);
  if (hasOwn(settings, 'theme')) nextTheme = settings.theme;
  if (hasOwn(settings, 'globalFilter')) {
    nextGlobalFilter = settings.globalFilter;
    for (var globalIndex = 0; globalIndex < nextStates.length; globalIndex += 1) filtersChanged[globalIndex] = true;
  }

  var tablePatches = settings.tables || [];
  var resolvedTables = Object.create(null);
  for (var patchIndex = 0; patchIndex < tablePatches.length; patchIndex += 1) {
    var tablePatch = tablePatches[patchIndex];
    var tablePath = '$.tables[' + patchIndex + ']';
    var tableIndex = findTableIndex(data, tablePatch);
    if (tableIndex === -1) {
      warnings.push(tablePath + ': таблица ' + warningTarget(tablePatch) + ' не найдена, настройки пропущены');
      continue;
    }
    if (hasOwn(resolvedTables, tableIndex)) fail(tablePath, 'настройки указывают на уже настроенную таблицу');
    resolvedTables[tableIndex] = true;
    var table = data.tables[tableIndex];
    var state = nextStates[tableIndex];
    if (hasOwn(tablePatch, 'scale')) state.scale = tablePatch.scale;
    if (hasOwn(tablePatch, 'columnOrder')) applyColumnOrder(table, state, tablePatch.columnOrder, tablePath + '.columnOrder', warnings);
    if (hasOwn(tablePatch, 'pinnedColumns')) applyPinnedColumns(table, state, tablePatch.pinnedColumns, tablePath + '.pinnedColumns', warnings);
    if (hasOwn(tablePatch, 'pinnedRows')) applyPinnedRows(table, state, tablePatch.pinnedRows, tablePath + '.pinnedRows', warnings);

    var columnPatches = tablePatch.columns || [];
    var resolvedColumns = Object.create(null);
    for (var columnPatchIndex = 0; columnPatchIndex < columnPatches.length; columnPatchIndex += 1) {
      var columnPatch = columnPatches[columnPatchIndex];
      var columnPath = tablePath + '.columns[' + columnPatchIndex + ']';
      var columnIndex = findColumnTargetIndex(table, columnPatch);
      if (columnIndex === -1) {
        warnings.push(columnPath + ': колонка ' + warningTarget(columnPatch) + ' не найдена, настройки пропущены');
        continue;
      }
      if (hasOwn(resolvedColumns, columnIndex)) fail(columnPath, 'настройки указывают на уже настроенную колонку');
      resolvedColumns[columnIndex] = true;
      if (hasOwn(columnPatch, 'visible')) {
        if (columnPatch.visible) delete state.hiddenColumns[columnIndex];
        else state.hiddenColumns[columnIndex] = true;
      }
      if (hasOwn(columnPatch, 'width')) state.widths[columnIndex] = columnPatch.width;
      if (hasOwn(columnPatch, 'aggregate')) {
        var numeric = table.columnTypes[columnIndex] === 'number' || table.columnTypes[columnIndex] === 'percent';
        if (columnPatch.aggregate !== 'none' && !numeric) {
          warnings.push(columnPath + '.aggregate: функция итога несовместима с типом колонки, настройка пропущена');
        } else state.columnAggregates[columnIndex] = columnPatch.aggregate;
      }
      if (hasOwn(columnPatch, 'filter')) {
        applyFilterPatch(state, columnIndex, columnPatch.filter);
        filtersChanged[tableIndex] = true;
      }
    }
  }

  for (var filterTableIndex in filtersChanged) {
    if (!hasOwn(filtersChanged, filterTableIndex)) continue;
    nextStates[filterTableIndex].rowWindow = null;
    nextStates[filterTableIndex].hiddenRows = {};
  }
  return { states: nextStates, globalFilter: nextGlobalFilter, theme: nextTheme, warnings: warnings };
}

function valueFilterSnapshot(filter) {
  return filter === null ? null : Object.keys(filter);
}

function getViewSettings(data, states, globalFilter, theme) {
  var result = { version: 1, theme: theme === 'dark' ? 'dark' : 'light', globalFilter: globalFilter, tables: [] };
  for (var tableIndex = 0; tableIndex < data.tables.length; tableIndex += 1) {
    var table = data.tables[tableIndex];
    var state = states[tableIndex];
    var tableSettings = {
      index: tableIndex,
      scale: state.scale,
      columnOrder: state.columnOrder.map(function (columnIndex) {
        return table.columnIds[columnIndex] === null ? columnIndex : table.columnIds[columnIndex];
      }),
      pinnedColumns: state.pinnedColumns.map(function (columnIndex) {
        return table.columnIds[columnIndex] === null ? columnIndex : table.columnIds[columnIndex];
      }),
      pinnedRows: state.pinnedRows.map(rowIdToReference),
      columns: []
    };
    if (table.id !== undefined) tableSettings.id = table.id;
    for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
      var columnSettings = {
        index: columnIndex,
        visible: !state.hiddenColumns[columnIndex],
        width: state.widths[columnIndex],
        aggregate: state.columnAggregates[columnIndex],
        filter: {
          text: state.columnFilters[columnIndex],
          exact: !!state.exactFilters[columnIndex],
          values: valueFilterSnapshot(state.valueFilters[columnIndex])
        }
      };
      if (table.columnIds[columnIndex] !== null) columnSettings.id = table.columnIds[columnIndex];
      tableSettings.columns.push(columnSettings);
    }
    result.tables.push(tableSettings);
  }
  return result;
}

function calculateAggregates(values) {
  var count = 0;
  var sum = 0;
  var minimum = null;
  var maximum = null;
  var kind = null;
  var mixedKinds = false;
  for (var index = 0; index < values.length; index += 1) {
    var parsed = parseNumeric(values[index]);
    if (!parsed) continue;
    count += 1;
    sum += parsed.value;
    if (minimum === null || parsed.value < minimum) minimum = parsed.value;
    if (maximum === null || parsed.value > maximum) maximum = parsed.value;
    if (kind === null) kind = parsed.kind;
    else if (kind !== parsed.kind) mixedKinds = true;
  }
  return {
    count: count,
    kind: mixedKinds ? 'number' : (kind || 'number'),
    results: {
      sum: sum,
      average: count ? sum / count : null,
      min: minimum,
      max: maximum,
      count: count
    }
  };
}

function calculateAggregate(values, aggregate) {
  var aggregates = calculateAggregates(values);
  var value = hasOwn(aggregates.results, aggregate) ? aggregates.results[aggregate] : null;
  return { count: aggregates.count, value: value, kind: aggregates.kind };
}

function calculateColumnAggregate(table, visibleRows, columnIndex, aggregate) {
  var values = [];
  for (var index = 0; index < visibleRows.length; index += 1) values.push(visibleRows[index].row.columns[columnIndex]);
  var result = calculateAggregate(values, aggregate);
  if (aggregate !== 'count') result.kind = table.columnTypes[columnIndex] === 'percent' ? 'percent' : 'number';
  return result;
}

function calculateSelectionAggregates(table, visibleRows, selection, visibleColumns) {
  if (!selection) return calculateAggregates([]);
  var rowStart = Math.min(selection.startRow, selection.endRow);
  var rowEnd = Math.max(selection.startRow, selection.endRow);
  var columnStart = Math.min(selection.startColumn, selection.endColumn);
  var columnEnd = Math.max(selection.startColumn, selection.endColumn);
  var values = [];
  for (var rowIndex = rowStart; rowIndex <= rowEnd && rowIndex < visibleRows.length; rowIndex += 1) {
    for (var visibleIndex = columnStart; visibleIndex <= columnEnd && visibleIndex < visibleColumns.length; visibleIndex += 1) {
      var column = visibleColumns[visibleIndex];
      var type = table.columnTypes[column];
      if (type === 'number' || type === 'percent') values.push(visibleRows[rowIndex].row.columns[column]);
    }
  }
  return calculateAggregates(values);
}

function calculateSelectionAggregate(table, visibleRows, selection, visibleColumns, aggregate) {
  var aggregates = calculateSelectionAggregates(table, visibleRows, selection, visibleColumns);
  var value = hasOwn(aggregates.results, aggregate) ? aggregates.results[aggregate] : null;
  return { count: aggregates.count, value: value, kind: aggregates.kind };
}

function calculateTotals(table, visibleRows) {
  var totals = new Array(table.columns.length);
  for (var columnIndex = 0; columnIndex < totals.length; columnIndex += 1) totals[columnIndex] = null;
  for (var typeIndex = 0; typeIndex < table.columnTypes.length; typeIndex += 1) {
    if (table.columnTypes[typeIndex] === 'number' || table.columnTypes[typeIndex] === 'percent') totals[typeIndex] = 0;
  }
  for (var rowIndex = 0; rowIndex < visibleRows.length; rowIndex += 1) {
    for (var index = 0; index < totals.length; index += 1) {
      if (totals[index] === null) continue;
      var parsed = parseNumeric(visibleRows[rowIndex].row.columns[index]);
      if (parsed) totals[index] += parsed.value;
    }
  }
  return totals;
}

function calculateSelectionSum(table, visibleRows, selection, visibleColumns) {
  var result = calculateSelectionAggregate(table, visibleRows, selection, visibleColumns, 'sum');
  return { count: result.count, sum: result.value };
}

function formatNumber(value, kind) {
  var rounded = Math.round(value * 1000000) / 1000000;
  var text = String(rounded).replace('.', ',');
  return kind === 'percent' ? text + '%' : text;
}

module.exports = {
  ValidationError: ValidationError,
  parseData: parseData,
  parseViewSettings: parseViewSettings,
  applyViewSettings: applyViewSettings,
  getViewSettings: getViewSettings,
  cellText: cellText,
  parseNumeric: parseNumeric,
  parseDate: parseDate,
  detectColumnTypes: detectColumnTypes,
  makeTableState: makeTableState,
  buildVisibleRows: buildVisibleRows,
  getAvailableValues: getAvailableValues,
  applyRowWindow: applyRowWindow,
  applyHiddenRows: applyHiddenRows,
  treeDepth: treeDepth,
  collapsedRowsForLevel: collapsedRowsForLevel,
  calculateAggregates: calculateAggregates,
  calculateAggregate: calculateAggregate,
  calculateColumnAggregate: calculateColumnAggregate,
  calculateSelectionAggregates: calculateSelectionAggregates,
  calculateSelectionAggregate: calculateSelectionAggregate,
  calculateTotals: calculateTotals,
  calculateSelectionSum: calculateSelectionSum,
  formatNumber: formatNumber,
  hasActiveFilters: hasActiveFilters,
  parseSearchQuery: parseSearchQuery,
  matchesSearch: matchesSearch,
  findSearchHighlightRanges: findSearchHighlightRanges,
  isLinkCell: isLinkCell,
  EMPTY_REFERENCE_COLOR: EMPTY_REFERENCE_COLOR,
  scalarValueKey: scalarValueKey,
  setScalarRule: setScalarRule,
  isEmptyReference: isEmptyReference,
  emptyReferenceText: emptyReferenceText,
  makeDisplaySettings: makeDisplaySettings,
  resolveCellDisplay: resolveCellDisplay,
  allNodes: allNodes
};
