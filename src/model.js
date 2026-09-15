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

function validateCell(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!isFinite(value)) fail(path, 'число должно быть конечным');
    return value;
  }
  if (isLinkCell(value)) return { label: value.label, ref: value.ref };
  fail(path, 'ожидалось простое значение или объект { label, ref }');
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
  for (var tableIndex = 0; tableIndex < source.tables.length; tableIndex += 1) {
    var rawTable = source.tables[tableIndex];
    var tablePath = '$.tables[' + tableIndex + ']';
    if (!isObject(rawTable)) fail(tablePath, 'ожидался объект');
    if (typeof rawTable.name !== 'string') fail(tablePath + '.name', 'ожидалась строка');
    if (!Array.isArray(rawTable.columns)) fail(tablePath + '.columns', 'ожидался массив строк');
    if (!Array.isArray(rawTable.rows)) fail(tablePath + '.rows', 'ожидался массив');

    var columns = rawTable.columns.map(function (column, columnIndex) {
      if (typeof column !== 'string') fail(tablePath + '.columns[' + columnIndex + ']', 'ожидалась строка');
      return column;
    });
    var roots = new Array(rawTable.rows.length);
    var table = { name: rawTable.name, columns: columns, rows: roots, isTree: false, nodeCount: 0 };
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

  return { tables: tables };
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
  var nodes = allNodes(table);
  for (var index = 0; index < table.columns.length; index += 1) {
    widths.push(initialColumnWidth(table, nodes, index));
    filters.push('');
    valueFilters.push(null);
    columnAggregates.push('none');
  }
  return {
    collapsed: false,
    collapsedRows: {},
    columnFilters: filters,
    exactFilters: {},
    valueFilters: valueFilters,
    columnAggregates: columnAggregates,
    hiddenColumns: {},
    pinnedColumns: [],
    pinnedRows: [],
    rowNumberWidth: initialRowNumberWidth(table),
    widths: widths,
    scale: 100,
    sort: { column: -1, direction: null },
    selection: null,
    rowWindow: null
  };
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
  cellText: cellText,
  parseNumeric: parseNumeric,
  parseDate: parseDate,
  detectColumnTypes: detectColumnTypes,
  makeTableState: makeTableState,
  buildVisibleRows: buildVisibleRows,
  getAvailableValues: getAvailableValues,
  applyRowWindow: applyRowWindow,
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
  allNodes: allNodes
};
