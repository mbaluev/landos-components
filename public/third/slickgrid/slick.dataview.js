(function ($) {
    $.extend(true, window, {
        Slick: {
            Data: {
                DataView: DataView,
                Aggregators: {
                    Avg: AvgAggregator,
                    Min: MinAggregator,
                    Max: MaxAggregator,
                    Sum: SumAggregator
                }
            }
        }
    });

    /***
    * A sample Model implementation.
    * Provides a filtered view of the underlying data.
    *
    * Relies on the data item having an "id" property uniquely identifying it.
    */
    function DataView(options) {
        var self = this;

        var defaults = {
            groupItemMetadataProvider: null,
            inlineFilters: false
        };


        // private
        var idProperty = "id";  // property holding a unique row id
        var items = [];         // data by index
        var rows = [];          // data by row
        var idxById = {};       // indexes by id
        var rowsById = null;    // rows by id; lazy-calculated
        var filter = null;      // filter function
        var updated = null;     // updated item ids
        var suspend = false;    // suspends the recalculation
        var sortAsc = true;
        var fastSortField;
        var sortComparer;
        var refreshHints = {};
        var prevRefreshHints = {};
        var filterArgs;
        var filteredItems = [];
        var compiledFilter;
        var compiledFilterWithCaching;
        var filterCache = [];

        // grouping
        //var groupingGetter;
        //var groupingGetterIsAFn;
        //var groupingFormatter;
        //var groupingComparer;
        var groupings = [];
        var groups = [];
        var collapsedGroups = {};
        var aggregators;
        var aggregateCollapsed = true;
        var compiledAccumulators;

        var pagesize = 0;
        var pagenum = 0;
        var totalRows = 0;

        // events
        var onRowCountChanged = new Slick.Event();
        var onRowsChanged = new Slick.Event();
        var onPagingInfoChanged = new Slick.Event();

        options = $.extend(true, {}, defaults, options);


        function beginUpdate() {
            suspend = true;
        }

        function endUpdate() {
            suspend = false;
            refresh();
        }

        function setRefreshHints(hints) {
            refreshHints = hints;
        }

        function setFilterArgs(args) {
            filterArgs = args;
        }
        function getFilterArgs() {
            return filterArgs;
        }

        function updateIdxById(startingIndex) {
            startingIndex = startingIndex || 0;
            var id;
            for (var i = startingIndex, l = items.length; i < l; i++) {
                id = items[i][idProperty];
                if (id === undefined) {
                    throw "Each data element must implement a unique 'id' property";
                }
                idxById[id] = i;
            }
        }

        function ensureIdUniqueness() {
            var id;
            for (var i = 0, l = items.length; i < l; i++) {
                id = items[i][idProperty];
                if (id === undefined || idxById[id] !== i) {
                    throw "Each data element must implement a unique 'id' property";
                }
            }
        }

        function getItems() {
            return items;
        }

        function setItems(data, objectIdProperty) {
            if (objectIdProperty !== undefined) {
                idProperty = objectIdProperty;
            }
            items = filteredItems = data;
            idxById = {};
            updateIdxById();
            ensureIdUniqueness();
            refresh();
        }

        function setPagingOptions(args) {
            if (args.pageSize != undefined) {
                pagesize = args.pageSize;
                pagenum = Math.min(pagenum, Math.ceil(totalRows / pagesize));
            }

            if (args.pageNum != undefined) {
                pagenum = Math.min(args.pageNum, Math.ceil(totalRows / pagesize));
            }

            onPagingInfoChanged.notify(getPagingInfo(), null, self);

            refresh();
        }

        function getPagingInfo() {
            return { pageSize: pagesize, pageNum: pagenum, totalRows: totalRows };
        }

        function sort(comparer, ascending) {
            sortAsc = ascending;
            sortComparer = comparer;
            fastSortField = null;
            if (ascending === false) {
                items.reverse();
            }
            items.sort(comparer);
            if (ascending === false) {
                items.reverse();
            }
            idxById = {};
            updateIdxById();
            refresh();
        }

        /***
        * Provides a workaround for the extremely slow sorting in IE.
        * Does a [lexicographic] sort on a give column by temporarily overriding Object.prototype.toString
        * to return the value of that field and then doing a native Array.sort().
        */
        function fastSort(field, ascending) {
            sortAsc = ascending;
            fastSortField = field;
            sortComparer = null;
            var oldToString = Object.prototype.toString;
            Object.prototype.toString = (typeof field == "function") ? field : function () {
                return this[field]
            };
            // an extra reversal for descending sort keeps the sort stable
            // (assuming a stable native sort implementation, which isn't true in some cases)
            if (ascending === false) {
                items.reverse();
            }
            items.sort();
            Object.prototype.toString = oldToString;
            if (ascending === false) {
                items.reverse();
            }
            idxById = {};
            updateIdxById();
            refresh();
        }

        function reSort() {
            if (sortComparer) {
                sort(sortComparer, sortAsc);
            } else if (fastSortField) {
                fastSort(fastSortField, sortAsc);
            }
        }

        function setFilter(filterFn) {
            filter = filterFn;
            if (options.inlineFilters) {
                compiledFilter = compileFilter();
                compiledFilterWithCaching = compileFilterWithCaching();
            }
            refresh();
        }

        function groupBy(groupingsArray) {
            if (!options.groupItemMetadataProvider) {
                options.groupItemMetadataProvider = new Slick.Data.GroupItemMetadataProvider();
            }

            groupings = [];

            if (jQuery.isArray(groupingsArray)) {
                var i, g;
                var grouping;
                for (i = 0; i < groupingsArray.length; i++) {
                    g = groupingsArray[i];
                    grouping = {};
                    grouping.Getter = g.Getter;
                    grouping.GetterIsAFn = typeof grouping.Getter === "function";
                    grouping.Formatter = g.Formatter;
                    grouping.Comparer = g.Comparer;
                    groupings.push(grouping);
                }
            }
            collapsedGroups = {};
            groups = [];
            refresh();
        }

        function getGroupPath(group) {
            var path = group.value;

            var g = group.parent;
            while (g) {
                path = g.value + '\\' + path;
                g = g.parent;
            }

            return path;
        }

        function setAggregators(groupAggregators, includeCollapsed) {
            aggregators = groupAggregators;
            aggregateCollapsed = (includeCollapsed !== undefined)
          ? includeCollapsed : aggregateCollapsed;

            // pre-compile accumulator loops
            compiledAccumulators = [];
            var idx = aggregators.length;
            while (idx--) {
                compiledAccumulators[idx] = compileAccumulatorLoop(aggregators[idx]);
            }

            refresh();
        }

        function getItemByIdx(i) {
            return items[i];
        }

        function getIdxById(id) {
            return idxById[id];
        }

        function ensureRowsByIdCache() {
            if (!rowsById) {
                rowsById = {};
                for (var i = 0, l = rows.length; i < l; i++) {
                    rowsById[rows[i][idProperty]] = i;
                }
            }
        }

        function getRowById(id) {
            ensureRowsByIdCache();
            return rowsById[id];
        }

        function getItemById(id) {
            return items[idxById[id]];
        }

        function mapIdsToRows(idArray) {
            var rows = [];
            ensureRowsByIdCache();
            for (var i = 0, l = idArray.length; i < l; i++) {
                var row = rowsById[idArray[i]];
                if (row != null) {
                    rows[rows.length] = row;
                }
            }
            return rows;
        }

        function mapRowsToIds(rowArray) {
            var ids = [];
            for (var i = 0, l = rowArray.length; i < l; i++) {
                if (rowArray[i] < rows.length) {
                    ids[ids.length] = rows[rowArray[i]][idProperty];
                }
            }
            return ids;
        }

        function updateItem(id, item) {
            if (idxById[id] === undefined || id !== item[idProperty]) {
                throw "Invalid or non-matching id";
            }
            items[idxById[id]] = item;
            if (!updated) {
                updated = {};
            }
            updated[id] = true;
            refresh();
        }

        function insertItem(insertBefore, item) {
            items.splice(insertBefore, 0, item);
            updateIdxById(insertBefore);
            refresh();
        }

        function addItem(item) {
            items.push(item);
            updateIdxById(items.length - 1);
            refresh();
        }

        function deleteItem(id) {
            var idx = idxById[id];
            if (idx === undefined) {
                throw "Invalid id";
            }
            delete idxById[id];
            items.splice(idx, 1);
            updateIdxById(idx);
            refresh();
        }

        function getLength() {
            return rows.length;
        }

        function getItem(i) {
            return rows[i];
        }

        function setItem(i, value) {
            rows[i] = value;
        }

        function getItemMetadata(i) {
            var item = rows[i];
            if (item === undefined) {
                return null;
            }

            // overrides for group rows
            if (item.__group) {
                return options.groupItemMetadataProvider.getGroupRowMetadata(item);
            }

            // overrides for totals rows
            if (item.__groupTotals) {
                return options.groupItemMetadataProvider.getTotalsRowMetadata(item);
            }

            return null;
        }

        function setCollapsedGroups(newCollapsedGroups) {
            collapsedGroups = newCollapsedGroups;
            refresh();
        }

        function collapseGroup(group, recursive) {
            collapsedGroups[getGroupPath(group)] = true;

            if (recursive === true)
                for (var i = 0, l = group.groups.length; i < l; i++)
                    collapseGroup(group.groups[i], recursive);

            refresh();
        }

        function expandGroup(group, recursive) {
            delete collapsedGroups[getGroupPath(group)];
            
            if (recursive === true)
                for (var i = 0, l = group.groups.length; i < l; i++)
                    expandGroup(group.groups[i], recursive);

            refresh();
        }

        function getGroups() {
            return groups;
        }

        function extractGroups(rows) {
            var group, g;
            var val;
            var groups = [];
            var groupsByVal = {};
            var r;

            for (var i = 0, l = rows.length; i < l; i++) {
                r = rows[i];

                var parent = null;
                for (var j = 0; j < groupings.length; j++) {
                    var grouping = groupings[j];
                    val = (grouping.GetterIsAFn) ? grouping.Getter(r) : r[grouping.Getter];
                    val = val || 0;
                    if (parent)
                        group = parent.groupsByVal[val];
                    else
                        group = groupsByVal[val];

                    if (!group) {
                        group = new Slick.Group();
                        group.parent = parent;
                        group.level = j;
                        group.count = 0;
                        group.totalCount = 0;
                        group.value = val;
                        group.rows = [];
                        group.groups = [];
                        group.groupsByVal = {};
                        if (!parent) {
                            groups[groups.length] = group;
                            groupsByVal[val] = group;
                        } else {
                            parent.groups[parent.groups.length] = group;
                            parent.groupsByVal[val] = group;
                        }
                    }
                    parent = group;
                }
                group.rows[group.count++] = r;
                group.totalCount++;
                g = group.parent;
                while (g != null) {
                    g.totalCount++;
                    g = g.parent;
                }
            }

            return groups;
        }

        // TODO:  lazy totals calculation
        function calculateGroupTotals(group) {
            if (group.collapsed && !aggregateCollapsed) {
                return;
            }

            // TODO:  try moving iterating over groups into compiled accumulator
            var totals = new Slick.GroupTotals();
            var agg, idx = aggregators.length;
            while (idx--) {
                agg = aggregators[idx];
                agg.init();
                compiledAccumulators[idx].call(agg, group.rows);
                agg.storeResult(totals);
                if (group.groups && group.groups.length > 0) {
                    calculateTotals(group.groups);
                    compiledAccumulators[idx].call(agg, group.groups);
                    agg.storeResult(totals);
                }
            }
            totals.group = group;
            group.totals = totals;
        }

        function calculateTotals(groups) {
            var idx = groups.length;
            while (idx--) {
                calculateGroupTotals(groups[idx]);
            }
        }

        function finalizeGroups(groups, l) {
            if (!l) l = 0;
            var grouping = groupings[l];
            var idx = groups.length, g;
            while (idx--) {
                g = groups[idx];
                g.collapsed = (getGroupPath(g) in collapsedGroups);
                g.title = grouping.Formatter ? grouping.Formatter(g) : g.value;

                finalizeGroups(g.groups, l + 1);
            }
        }

        function flattenGroups(groups, groupedRows) {
            var g;
            for (var i = 0, l = groups.length; i < l; i++) {
                g = groups[i];
                groupedRows[groupedRows.length] = g;

                if (!g.collapsed) {

                    if (g.groups)
                        flattenGroups(g.groups, groupedRows);

                    for (var j = 0, jj = g.rows.length; j < jj; j++) {
                        groupedRows[groupedRows.length] = g.rows[j];
                    }
                }

                if (g.totals && (!g.collapsed || aggregateCollapsed)) {
                    groupedRows[groupedRows.length] = g.totals;
                }
            }
            return groupedRows;
        }

        function flattenGroupedRows(groups) {
            var groupedRows = [];
            flattenGroups(groups, groupedRows);
            return groupedRows;
        }

        function getFunctionInfo(fn) {
            var fnRegex = /^function[^(]*\(([^)]*)\)\s*{([\s\S]*)}$/;
            var matches = fn.toString().match(fnRegex);
            return {
                params: matches[1].split(","),
                body: matches[2]
            };
        }

        function compileAccumulatorLoop(aggregator) {
            var accumulatorInfo = getFunctionInfo(aggregator.accumulate);
            var fn = new Function(
          "_items",
          "for (var " + accumulatorInfo.params[0] + ", _i=0, _il=_items.length; _i<_il; _i++) {" +
              accumulatorInfo.params[0] + " = _items[_i]; " +
              accumulatorInfo.body +
              "}"
      );
            fn.displayName = fn.name = "compiledAccumulatorLoop";
            return fn;
        }

        function compileFilter() {
            var filterInfo = getFunctionInfo(filter);

            var filterBody = filterInfo.body
          .replace(/return false[;}]/gi, "{ continue _coreloop; }")
          .replace(/return true[;}]/gi, "{ _retval[_idx++] = $item$; continue _coreloop; }")
          .replace(/return ([^;}]+?);/gi,
          "{ if ($1) { _retval[_idx++] = $item$; }; continue _coreloop; }");

            // This preserves the function template code after JS compression,
            // so that replace() commands still work as expected.
            var tpl = [
            //"function(_items, _args) { ",
        "var _retval = [], _idx = 0; ",
        "var $item$, $args$ = _args; ",
        "_coreloop: ",
        "for (var _i = 0, _il = _items.length; _i < _il; _i++) { ",
        "$item$ = _items[_i]; ",
        "$filter$; ",
        "} ",
        "return _retval; "
            //"}"
      ].join("");
            tpl = tpl.replace(/\$filter\$/gi, filterBody);
            tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
            tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);

            var fn = new Function("_items,_args", tpl);
            fn.displayName = fn.name = "compiledFilter";
            return fn;
        }

        function compileFilterWithCaching() {
            var filterInfo = getFunctionInfo(filter);

            var filterBody = filterInfo.body
          .replace(/return false[;}]/gi, "{ continue _coreloop; }")
          .replace(/return true[;}]/gi, "{ _cache[_i] = true;_retval[_idx++] = $item$; continue _coreloop; }")
          .replace(/return ([^;}]+?);/gi,
          "{ if ((_cache[_i] = $1)) { _retval[_idx++] = $item$; }; continue _coreloop; }");

            // This preserves the function template code after JS compression,
            // so that replace() commands still work as expected.
            var tpl = [
            //"function(_items, _args, _cache) { ",
        "var _retval = [], _idx = 0; ",
        "var $item$, $args$ = _args; ",
        "_coreloop: ",
        "for (var _i = 0, _il = _items.length; _i < _il; _i++) { ",
        "$item$ = _items[_i]; ",
        "if (_cache[_i]) { ",
        "_retval[_idx++] = $item$; ",
        "continue _coreloop; ",
        "} ",
        "$filter$; ",
        "} ",
        "return _retval; "
            //"}"
      ].join("");
            tpl = tpl.replace(/\$filter\$/gi, filterBody);
            tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
            tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);

            var fn = new Function("_items,_args,_cache", tpl);
            fn.displayName = fn.name = "compiledFilterWithCaching";
            return fn;
        }

        function uncompiledFilter(items, args) {
            var retval = [], idx = 0;

            for (var i = 0, ii = items.length; i < ii; i++) {
                if (filter(items[i], args)) {
                    retval[idx++] = items[i];
                }
            }

            return retval;
        }

        function uncompiledFilterWithCaching(items, args, cache) {
            var retval = [], idx = 0, item;

            for (var i = 0, ii = items.length; i < ii; i++) {
                item = items[i];
                if (cache[i]) {
                    retval[idx++] = item;
                } else if (filter(item, args)) {
                    retval[idx++] = item;
                    cache[i] = true;
                }
            }

            return retval;
        }

        function getFilteredAndPagedItems(items) {
            if (filter) {
                var batchFilter = options.inlineFilters ? compiledFilter : uncompiledFilter;
                var batchFilterWithCaching = options.inlineFilters ? compiledFilterWithCaching : uncompiledFilterWithCaching;

                if (refreshHints.isFilterNarrowing) {
                    filteredItems = batchFilter(filteredItems, filterArgs);
                } else if (refreshHints.isFilterExpanding) {
                    filteredItems = batchFilterWithCaching(items, filterArgs, filterCache);
                } else if (!refreshHints.isFilterUnchanged) {
                    filteredItems = batchFilter(items, filterArgs);
                }
            } else {
                // special case:  if not filtering and not paging, the resulting
                // rows collection needs to be a copy so that changes due to sort
                // can be caught
                filteredItems = pagesize ? items : items.concat();
            }

            // get the current page
            var paged;
            if (pagesize) {
                if (filteredItems.length < pagenum * pagesize) {
                    pagenum = Math.floor(filteredItems.length / pagesize);
                }
                paged = filteredItems.slice(pagesize * pagenum, pagesize * pagenum + pagesize);
            } else {
                paged = filteredItems;
            }

            return { totalRows: filteredItems.length, rows: paged };
        }

        function getRowDiffs(rows, newRows) {
            var item, r, eitherIsNonData, diff = [];
            var from = 0, to = newRows.length;

            if (refreshHints && refreshHints.ignoreDiffsBefore) {
                from = Math.max(0,
            Math.min(newRows.length, refreshHints.ignoreDiffsBefore));
            }

            if (refreshHints && refreshHints.ignoreDiffsAfter) {
                to = Math.min(newRows.length,
            Math.max(0, refreshHints.ignoreDiffsAfter));
            }

            for (var i = from, rl = rows.length; i < to; i++) {
                if (i >= rl) {
                    diff[diff.length] = i;
                } else {
                    item = newRows[i];
                    r = rows[i];

                    if ((groupings.length > 0 && (eitherIsNonData = (item.__nonDataRow) || (r.__nonDataRow)) &&
              item.__group !== r.__group ||
              item.__updated ||
              item.__group && !item.equals(r))
              || (aggregators && eitherIsNonData &&
                    // no good way to compare totals since they are arbitrary DTOs
                    // deep object comparison is pretty expensive
                    // always considering them 'dirty' seems easier for the time being
              (item.__groupTotals || r.__groupTotals))
              || item[idProperty] != r[idProperty]
              || (updated && updated[item[idProperty]])
              ) {
                        diff[diff.length] = i;
                    }
                }
            }
            return diff;
        }

        function recalc(_items) {
            rowsById = null;

            if (refreshHints.isFilterNarrowing != prevRefreshHints.isFilterNarrowing ||
          refreshHints.isFilterExpanding != prevRefreshHints.isFilterExpanding) {
                filterCache = [];
            }

            var filteredItems = getFilteredAndPagedItems(_items);
            totalRows = filteredItems.totalRows;
            var newRows = filteredItems.rows;

            groups = [];
            if (groupings.length > 0) {
                groups = extractGroups(newRows);
                if (groups.length) {
                    finalizeGroups(groups);
                    if (aggregators) {
                        calculateTotals(groups);
                    }
                    if (groups.sort) {
                        try {
                            groups.sort(groupingComparer);
                        }
                        catch (error) {
                        }
                    }
                    newRows = flattenGroupedRows(groups);
                }
            }

            var diff = getRowDiffs(rows, newRows);

            rows = newRows;

            return diff;
        }

        function refresh() {
            if (suspend) {
                return;
            }

            var countBefore = rows.length;
            var totalRowsBefore = totalRows;

            var diff = recalc(items, filter); // pass as direct refs to avoid closure perf hit

            // if the current page is no longer valid, go to last page and recalc
            // we suffer a performance penalty here, but the main loop (recalc) remains highly optimized
            if (pagesize && totalRows < pagenum * pagesize) {
                pagenum = Math.floor(totalRows / pagesize);
                diff = recalc(items, filter);
            }

            updated = null;
            prevRefreshHints = refreshHints;
            refreshHints = {};

            if (totalRowsBefore != totalRows) {
                onPagingInfoChanged.notify(getPagingInfo(), null, self);
            }
            if (countBefore != rows.length) {
                onRowCountChanged.notify({ previous: countBefore, current: rows.length }, null, self);
            }
            if (diff.length > 0) {
                onRowsChanged.notify({ rows: diff }, null, self);
            }
        }

        /***
            * Wires the grid and the DataView together to keep row selection tied to item ids.
            * This is useful since, without it, the grid only knows about rows, so if the items
            * move around, the same rows stay selected instead of the selection moving along
            * with the items.
            *
            * NOTE:  This doesn't work with cell selection model.
            *
            * @param grid {Slick.Grid} The grid to sync selection with.
            * @param preserveHidden {Boolean} Whether to keep selected items that go out of the
            *     view due to them getting filtered out.
            * @param preserveHiddenOnSelectionChange {Boolean} Whether to keep selected items
            *     that are currently out of the view (see preserveHidden) as selected when selection
            *     changes.
            * @return {Slick.Event} An event that notifies when an internal list of selected row ids
            *     changes.  This is useful since, in combination with the above two options, it allows
            *     access to the full list selected row ids, and not just the ones visible to the grid.
            * @method syncGridSelection
            */
        function syncGridSelection(grid, preserveHidden, preserveHiddenOnSelectionChange) {
            var self = this;
            var inHandler;
            var selectedRowIds = self.mapRowsToIds(grid.getSelectedRows());
            var onSelectedRowIdsChanged = new Slick.Event();

            function setSelectedRowIds(rowIds) {
                if (selectedRowIds.join(",") == rowIds.join(",")) {
                    return;
                }

                selectedRowIds = rowIds;

                onSelectedRowIdsChanged.notify({
                    "grid": grid,
                    "ids": selectedRowIds
                }, new Slick.EventData(), self);
            }

            function update() {
                if (selectedRowIds.length > 0) {
                    inHandler = true;
                    var selectedRows = self.mapIdsToRows(selectedRowIds);
                    if (!preserveHidden) {
                        setSelectedRowIds(self.mapRowsToIds(selectedRows));       
                    }
                    grid.setSelectedRows(selectedRows);
                    inHandler = false;
                }
            }

            grid.onSelectedRowsChanged.subscribe(function(e, args) {
                if (inHandler) { return; }
                var newSelectedRowIds = self.mapRowsToIds(grid.getSelectedRows());
                if (!preserveHiddenOnSelectionChange || !grid.getOptions().multiSelect) {
                    setSelectedRowIds(newSelectedRowIds);
                } else {
                    // keep the ones that are hidden
                    var existing = $.grep(selectedRowIds, function(id) { return self.getRowById(id) === undefined; });
                    // add the newly selected ones
                    setSelectedRowIds(existing.concat(newSelectedRowIds));
                }
            });

            this.onRowsChanged.subscribe(update);

            this.onRowCountChanged.subscribe(update);

            return onSelectedRowIdsChanged;
        }	     
 		 

        function syncGridCellCssStyles(grid, key) {
            var hashById;
            var inHandler;

            // since this method can be called after the cell styles have been set,
            // get the existing ones right away
            storeCellCssStyles(grid.getCellCssStyles(key));

            function storeCellCssStyles(hash) {
                hashById = {};
                for (var row in hash) {
                    var id = rows[row][idProperty];
                    hashById[id] = hash[row];
                }
            }

            grid.onCellCssStylesChanged.subscribe(function (e, args) {
                if (inHandler) { return; }
                if (key != args.key) { return; }
                if (args.hash) {
                    storeCellCssStyles(args.hash);
                }
            });

            this.onRowsChanged.subscribe(function (e, args) {
                if (hashById) {
                    inHandler = true;
                    ensureRowsByIdCache();
                    var newHash = {};
                    for (var id in hashById) {
                        var row = rowsById[id];
                        if (row != undefined) {
                            newHash[row] = hashById[id];
                        }
                    }
                    grid.setCellCssStyles(key, newHash);
                    inHandler = false;
                }
            });
        }

        return {
            // methods
            "beginUpdate": beginUpdate,
            "endUpdate": endUpdate,
            "setPagingOptions": setPagingOptions,
            "getPagingInfo": getPagingInfo,
            "getItems": getItems,
            "setItems": setItems,
            "setFilter": setFilter,
            "sort": sort,
            "fastSort": fastSort,
            "reSort": reSort,
            "groupBy": groupBy,
            "setAggregators": setAggregators,
            "collapseGroup": collapseGroup,
            "expandGroup": expandGroup,
            "setCollapsedGroups": setCollapsedGroups,
            "getGroups": getGroups,
            "getGroupPath": getGroupPath,
            "getIdxById": getIdxById,
            "getRowById": getRowById,
            "getItemById": getItemById,
            "getItemByIdx": getItemByIdx,
            "mapRowsToIds": mapRowsToIds,
            "mapIdsToRows": mapIdsToRows,
            "setRefreshHints": setRefreshHints,
            "setFilterArgs": setFilterArgs,
            "getFilterArgs": getFilterArgs,
            "refresh": refresh,
            "updateItem": updateItem,
            "insertItem": insertItem,
            "addItem": addItem,
            "deleteItem": deleteItem,
            "syncGridSelection": syncGridSelection,
            "syncGridCellCssStyles": syncGridCellCssStyles,

            "getFilteredAndPagedItems": getFilteredAndPagedItems,

            // data provider methods
            "getLength": getLength,
            "getItem": getItem,
            "setItem": setItem,
            "getItemMetadata": getItemMetadata,

            // events
            "onRowCountChanged": onRowCountChanged,
            "onRowsChanged": onRowsChanged,
            "onPagingInfoChanged": onPagingInfoChanged
        };
    }

    function AvgAggregator(field) {
        this.field_ = field;

        this.init = function () {
            this.count_ = 0;
            this.nonNullCount_ = 0;
            this.sum_ = 0;
        };

        this.accumulate = function (item) {
            var val = item[this.field_];
            this.count_++;
            if (val != null && val != "" && val != NaN) {
                this.nonNullCount_++;
                this.sum_ += parseFloat(val);
            }
        };

        this.storeResult = function (groupTotals) {
            if (!groupTotals.avg) {
                groupTotals.avg = {};
            }
            if (this.nonNullCount_ != 0) {
                groupTotals.avg[this.field_] = this.sum_ / this.nonNullCount_;
            }
        };
    }

    function MinAggregator(field) {
        this.field_ = field;

        this.init = function () {
            this.min_ = null;
        };

        this.accumulate = function (item) {
            var val = item[this.field_];
            if (val != null && val != "" && val != NaN) {
                if (this.min_ == null || val < this.min_) {
                    this.min_ = val;
                }
            }
        };

        this.storeResult = function (groupTotals) {
            if (!groupTotals.min) {
                groupTotals.min = {};
            }
            groupTotals.min[this.field_] = this.min_;
        }
    }

    function MaxAggregator(field) {
        this.field_ = field;

        this.init = function () {
            this.max_ = null;
        };

        this.accumulate = function (item) {
            var val = item[this.field_];
            if (val != null && val != "" && val != NaN) {
                if (this.max_ == null || val > this.max_) {
                    this.max_ = val;
                }
            }
        };

        this.storeResult = function (groupTotals) {
            if (!groupTotals.max) {
                groupTotals.max = {};
            }
            groupTotals.max[this.field_] = this.max_;
        }
    }

    function SumAggregator(field) {
        this.field_ = field;

        this.init = function () {
            this.sum_ = null;
        };

        this.accumulate = function (item) {
            var val = item[this.field_];
            if (val != null && val != "" && val != NaN) {
                this.sum_ += parseFloat(val);
            }
        };

        this.storeResult = function (groupTotals) {
            if (!groupTotals.sum) {
                groupTotals.sum = {};
            }
            groupTotals.sum[this.field_] = this.sum_;
        }
    }

    // TODO:  add more built-in aggregators
    // TODO:  merge common aggregators in one to prevent needles iterating

})(jQuery);