/**
 * NanoPro Scanner - DOM Value Identification
 * 
 * 4-Layer Value Identification Strategy:
 * 1. Header Detection - Find column headers by text
 * 2. Geometry Mapping - Map X-axis zones for each column
 * 3. Value Scanning - Extract all numeric values from DOM
 * 4. Row Grouping - Group values by Y-position into rows
 * 
 * Updated for React-based UIs with values inside buttons/inputs
 */

const NanoProScanner = (function () {
    'use strict';

    // Column header text variations (case-insensitive matching)
    // Extended with many more variations to catch React-rendered headers
    const COLUMN_HEADERS = {
        qty: [
            'qty', 'quantity', 'units', 'count', 'no.', 'no',
            'qnty', 'qtty', 'quan', 'pcs', 'pieces', 'nos',
            'qty.', 'quantity.', 'unit', 'items'
        ],
        price: [
            'item_price', 'item price', 'unit price', 'price', 'rate',
            'unit_price', 'unit_rate', 'item-price', 'unit-price',
            'unitprice', 'itemprice', 'price/unit', 'price per unit',
            'cost', 'unit cost', 'unit_cost', 'rate/unit', 'each',
            'price.', 'rate.', 'mrp', 'value', 'item price'
        ],
        amount: [
            'line_amount', 'line amount', 'amount', 'total', 'line total',
            'line_total', 'ext', 'extension', 'line-amount', 'line-total',
            'lineamount', 'linetotal', 'extended', 'extended amount',
            'net amount', 'net_amount', 'subtotal', 'sub total', 'sub_total',
            'amount.', 'total.', 'value', 'sum', 'gross', 'net'
        ]
    };

    // Geometry tolerances
    const CONFIG = {
        columnTolerance: 25,    // px - increased tolerance for column boundary matching
        rowTolerance: 12,       // px - increased for React rendered rows
        minColumnWidth: 20,     // px - reduced minimum expected column width
        maxColumnWidth: 400,    // px - increased maximum expected column width
        headerSearchDepth: 15,  // levels to search for headers
        debugMode: true         // Enable verbose logging
    };

    /**
     * Scanner class - main value identification engine
     */
    class Scanner {
        constructor() {
            this.columnMap = null;
            this.lastScanTime = null;
            this.cachedRows = null;
        }

        /**
         * Log helper for debug mode
         */
        log(...args) {
            if (CONFIG.debugMode) {
                console.log('[NanoPro Scanner]', ...args);
            }
        }

        /**
         * Main scan entry point
         * Returns: { success, rows, columnMap, errors }
         */
        scan() {
            this.lastScanTime = Date.now();

            try {
                // Phase 1: Find column headers
                this.log('Phase 1: Finding column headers...');
                const headers = this.findColumnHeaders();

                this.log('Headers found:', {
                    qty: headers.qty ? headers.qty.text : 'NOT FOUND',
                    price: headers.price ? headers.price.text : 'NOT FOUND',
                    amount: headers.amount ? headers.amount.text : 'NOT FOUND'
                });

                if (!headers.qty || !headers.price || !headers.amount) {
                    const missing = [];
                    if (!headers.qty) missing.push('Qty');
                    if (!headers.price) missing.push('Price');
                    if (!headers.amount) missing.push('Amount');

                    return {
                        success: false,
                        error: 'MISSING_HEADERS',
                        message: `Could not find column headers: ${missing.join(', ')}`,
                        found: headers,
                        debug: this.getAllTextElements()
                    };
                }

                // Phase 2: Build column geometry map
                this.log('Phase 2: Building column geometry map...');
                this.columnMap = this.buildColumnMap(headers);
                this.log('Column map:', this.columnMap);

                // Phase 3: Extract numeric values from DOM
                this.log('Phase 3: Extracting numeric values...');
                const values = this.extractNumericNodes(headers);
                this.log(`Found ${values.length} numeric values`);

                if (values.length === 0) {
                    return {
                        success: false,
                        error: 'NO_VALUES',
                        message: 'No numeric values found in line items area',
                        columnMap: this.columnMap
                    };
                }

                // Phase 4: Map values to columns
                this.log('Phase 4: Mapping values to columns...');
                const mappedValues = this.mapValuesToColumns(values, this.columnMap);
                this.log(`Mapped ${mappedValues.length} values to columns`);

                // Phase 5: Group into rows
                this.log('Phase 5: Grouping into rows...');
                const rows = this.groupIntoRows(mappedValues);
                this.log(`Grouped into ${rows.length} rows`);

                this.cachedRows = rows;

                return {
                    success: true,
                    rows: rows,
                    columnMap: this.columnMap,
                    valueCount: values.length,
                    rowCount: rows.length
                };

            } catch (error) {
                console.error('[NanoPro Scanner] Scan failed:', error);
                return {
                    success: false,
                    error: 'SCAN_EXCEPTION',
                    message: error.message
                };
            }
        }

        /**
         * Get all text elements for debugging
         */
        getAllTextElements() {
            const elements = [];
            const allEls = document.querySelectorAll('*');

            for (const el of allEls) {
                const text = this.getAllTextContent(el).toLowerCase().trim();
                if (text && text.length < 50) {
                    elements.push({
                        tag: el.tagName,
                        text: text,
                        className: el.className
                    });
                }
            }

            return elements.slice(0, 100); // Limit for debugging
        }

        /**
         * Phase 1: Find column headers by text matching
         * Improved to handle React-rendered content
         */
        findColumnHeaders() {
            const headers = {
                qty: null,
                price: null,
                amount: null
            };

            // Get all potential header elements (including React-specific elements)
            const allElements = document.querySelectorAll('th, td, div, span, button, label, p, h1, h2, h3, h4, h5, h6, [role="columnheader"], [class*="header"], [class*="column"], [class*="Header"], [class*="Column"]');

            this.log(`Scanning ${allElements.length} potential header elements...`);

            for (const element of allElements) {
                // Skip hidden elements
                if (!this.isVisible(element)) continue;

                // Get ALL text content (including nested children)
                const fullText = this.getAllTextContent(element).toLowerCase().trim();

                // Also try direct text content
                const directText = this.getDirectTextContent(element).toLowerCase().trim();

                // Combine both for matching
                const textsToCheck = [fullText, directText].filter(t => t && t.length > 0 && t.length < 100);

                if (textsToCheck.length === 0) continue;

                // Check against each column type
                for (const [columnType, variations] of Object.entries(COLUMN_HEADERS)) {
                    if (headers[columnType]) continue; // Already found

                    for (const text of textsToCheck) {
                        for (const variation of variations) {
                            // Exact match or contains match
                            if (text === variation ||
                                text.includes(variation) ||
                                text.replace(/[_\-\s]/g, '').includes(variation.replace(/[_\-\s]/g, ''))) {

                                const rect = element.getBoundingClientRect();

                                // Validate it's a reasonable header position
                                if (rect.width >= CONFIG.minColumnWidth &&
                                    rect.width <= CONFIG.maxColumnWidth &&
                                    rect.height > 0) {

                                    this.log(`Found ${columnType} header:`, text, 'at', rect);

                                    headers[columnType] = {
                                        element: element,
                                        text: text,
                                        matchedVariation: variation,
                                        rect: rect
                                    };
                                    break;
                                }
                            }
                        }
                        if (headers[columnType]) break;
                    }
                }

                // Early exit if all found
                if (headers.qty && headers.price && headers.amount) {
                    this.log('All headers found!');
                    break;
                }
            }

            return headers;
        }

        /**
         * Phase 2: Build column X-axis zones from headers
         */
        buildColumnMap(headers) {
            const columnMap = {};

            for (const [columnType, header] of Object.entries(headers)) {
                if (!header) continue;

                const rect = header.rect;
                const centerX = (rect.left + rect.right) / 2;

                columnMap[columnType] = {
                    name: columnType,
                    headerText: header.text,
                    xMin: rect.left - CONFIG.columnTolerance,
                    xMax: rect.right + CONFIG.columnTolerance,
                    centerX: centerX,
                    headerY: rect.bottom // Values should be below this Y
                };
            }

            return columnMap;
        }

        /**
         * Phase 3: Extract all numeric text nodes from DOM
         * Improved to handle React buttons and inputs
         */
        extractNumericNodes(headers) {
            const values = [];

            // Determine the Y-boundary (values should be below headers)
            const headerBottomY = Math.max(
                headers.qty?.rect.bottom || 0,
                headers.price?.rect.bottom || 0,
                headers.amount?.rect.bottom || 0
            );

            this.log('Looking for values below Y:', headerBottomY);

            // Method 1: Find all elements that might contain numbers
            // This includes buttons, inputs, spans, divs commonly used in React
            const potentialContainers = document.querySelectorAll(
                'button, input, span, div, td, p, [contenteditable], [class*="cell"], [class*="Cell"], [class*="value"], [class*="Value"], [class*="amount"], [class*="Amount"], [class*="price"], [class*="Price"], [class*="qty"], [class*="Qty"]'
            );

            for (const element of potentialContainers) {
                if (!this.isVisible(element)) continue;

                const rect = element.getBoundingClientRect();

                // Must be below headers
                if (rect.top <= headerBottomY) continue;

                // Get text content
                let text = '';

                if (element.tagName === 'INPUT') {
                    text = element.value || '';
                } else {
                    text = this.getAllTextContent(element).trim();
                }

                if (!text) continue;

                // Parse the text as a number
                const parsed = NanoProParser.parse(text);

                if (parsed.value !== null) {
                    values.push({
                        text: text,
                        value: parsed.value,
                        confidence: parsed.confidence,
                        rect: rect,
                        centerX: (rect.left + rect.right) / 2,
                        centerY: (rect.top + rect.bottom) / 2,
                        element: element
                    });
                }
            }

            // Method 2: Also walk text nodes for any we might have missed
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const text = node.textContent.trim();
                        if (!text) return NodeFilter.FILTER_REJECT;
                        if (!this.isVisible(node.parentElement)) return NodeFilter.FILTER_REJECT;
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = node.textContent.trim();

                const parsed = NanoProParser.parse(text);

                if (parsed.value !== null) {
                    try {
                        const range = document.createRange();
                        range.selectNode(node);
                        const rect = range.getBoundingClientRect();
                        range.detach();

                        // Only include values below headers
                        if (rect.top > headerBottomY) {
                            // Check if we already have this value (avoid duplicates)
                            const isDuplicate = values.some(v =>
                                Math.abs(v.centerX - (rect.left + rect.right) / 2) < 5 &&
                                Math.abs(v.centerY - (rect.top + rect.bottom) / 2) < 5
                            );

                            if (!isDuplicate) {
                                values.push({
                                    text: text,
                                    value: parsed.value,
                                    confidence: parsed.confidence,
                                    rect: rect,
                                    centerX: (rect.left + rect.right) / 2,
                                    centerY: (rect.top + rect.bottom) / 2,
                                    element: node.parentElement
                                });
                            }
                        }
                    } catch (e) {
                        // Range creation can fail for some nodes
                    }
                }
            }

            this.log('Extracted values:', values.map(v => ({ text: v.text, value: v.value, x: Math.round(v.centerX), y: Math.round(v.centerY) })));

            return values;
        }

        /**
         * Phase 4: Map values to columns based on X-position
         */
        mapValuesToColumns(values, columnMap) {
            const mapped = values.map(value => {
                let assignedColumn = null;
                let bestDistance = Infinity;

                for (const [columnType, column] of Object.entries(columnMap)) {
                    // Check if value is within column X-range
                    if (value.centerX >= column.xMin && value.centerX <= column.xMax) {
                        const distance = Math.abs(value.centerX - column.centerX);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            assignedColumn = columnType;
                        }
                    }
                }

                return {
                    ...value,
                    column: assignedColumn
                };
            }).filter(v => v.column !== null); // Only keep values assigned to columns

            this.log('Mapped values:', mapped.map(v => ({ value: v.value, column: v.column, y: Math.round(v.centerY) })));

            return mapped;
        }

        /**
         * Phase 5: Group values into rows by Y-position
         */
        groupIntoRows(mappedValues) {
            if (mappedValues.length === 0) return [];

            // Sort by Y position
            const sorted = [...mappedValues].sort((a, b) => a.centerY - b.centerY);

            const rows = [];
            let currentRow = {
                y: sorted[0].centerY,
                values: [],
                qty: null,
                price: null,
                amount: null
            };

            for (const value of sorted) {
                // Check if this value belongs to current row
                if (Math.abs(value.centerY - currentRow.y) <= CONFIG.rowTolerance) {
                    currentRow.values.push(value);
                    if (value.column === 'qty') currentRow.qty = value;
                    if (value.column === 'price') currentRow.price = value;
                    if (value.column === 'amount') currentRow.amount = value;
                    // Update row Y to average
                    currentRow.y = currentRow.values.reduce((sum, v) => sum + v.centerY, 0) / currentRow.values.length;
                } else {
                    // Start new row
                    if (currentRow.values.length > 0) {
                        rows.push(this.finalizeRow(currentRow, rows.length));
                    }
                    currentRow = {
                        y: value.centerY,
                        values: [value],
                        qty: value.column === 'qty' ? value : null,
                        price: value.column === 'price' ? value : null,
                        amount: value.column === 'amount' ? value : null
                    };
                }
            }

            // Don't forget last row
            if (currentRow.values.length > 0) {
                rows.push(this.finalizeRow(currentRow, rows.length));
            }

            return rows;
        }

        /**
         * Finalize row data structure
         */
        finalizeRow(row, index) {
            return {
                index: index,
                y: row.y,
                qty: row.qty ? {
                    value: row.qty.value,
                    text: row.qty.text,
                    confidence: row.qty.confidence
                } : null,
                price: row.price ? {
                    value: row.price.value,
                    text: row.price.text,
                    confidence: row.price.confidence
                } : null,
                amount: row.amount ? {
                    value: row.amount.value,
                    text: row.amount.text,
                    confidence: row.amount.confidence
                } : null,
                valueCount: row.values.length,
                isComplete: row.qty !== null && row.price !== null && row.amount !== null
            };
        }

        /**
         * Check if an element is visible
         */
        isVisible(element) {
            if (!element) return false;

            // Quick check for common hidden cases
            if (element.offsetParent === null && element.tagName !== 'BODY' && element.tagName !== 'HTML') {
                // Could be hidden, but also could be fixed/absolute positioned
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                }
            }

            const style = window.getComputedStyle(element);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;

            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;

            return true;
        }

        /**
         * Get direct text content (excluding nested elements)
         */
        getDirectTextContent(element) {
            let text = '';
            for (const child of element.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    text += child.textContent;
                }
            }
            return text;
        }

        /**
         * Get all text content (including nested elements)
         */
        getAllTextContent(element) {
            return element.textContent || element.innerText || '';
        }

        /**
         * Get cached rows from last scan
         */
        getCachedRows() {
            return this.cachedRows;
        }

        /**
         * Get column map from last scan
         */
        getColumnMap() {
            return this.columnMap;
        }

        /**
         * Debug: Highlight detected columns and values
         */
        debugHighlight() {
            // Remove existing highlights
            document.querySelectorAll('.nanopro-debug').forEach(el => el.remove());

            if (!this.columnMap) {
                console.log('[NanoPro Debug] No column map available. Run scan() first.');
                return;
            }

            // Highlight column zones
            for (const [type, col] of Object.entries(this.columnMap)) {
                const highlight = document.createElement('div');
                highlight.className = 'nanopro-debug';
                highlight.style.cssText = `
          position: fixed;
          left: ${col.xMin}px;
          top: ${col.headerY}px;
          width: ${col.xMax - col.xMin}px;
          height: 500px;
          background: ${type === 'qty' ? 'rgba(0,255,0,0.1)' :
                        type === 'price' ? 'rgba(0,0,255,0.1)' :
                            'rgba(255,0,0,0.1)'};
          border: 2px dashed ${type === 'qty' ? 'green' :
                        type === 'price' ? 'blue' : 'red'};
          pointer-events: none;
          z-index: 99999;
        `;
                highlight.innerHTML = `<span style="background:white;padding:2px;font-size:10px;">${type}: ${col.headerText}</span>`;
                document.body.appendChild(highlight);
            }

            console.log('[NanoPro Debug] Column zones highlighted');
            console.log('[NanoPro Debug] Column map:', this.columnMap);
            console.log('[NanoPro Debug] Cached rows:', this.cachedRows);
        }

        /**
         * Debug: List all potential header texts found on page
         */
        debugListHeaders() {
            const texts = new Set();
            const allElements = document.querySelectorAll('th, td, div, span, button, label, [role="columnheader"]');

            for (const el of allElements) {
                const text = this.getAllTextContent(el).toLowerCase().trim();
                if (text && text.length > 0 && text.length < 50) {
                    texts.add(text);
                }
            }

            console.log('[NanoPro Debug] All potential header texts on page:');
            console.log([...texts].sort());
            return [...texts].sort();
        }
    }

    // Create singleton instance
    const scanner = new Scanner();

    // Public API
    return {
        scan: () => scanner.scan(),
        getCachedRows: () => scanner.getCachedRows(),
        getColumnMap: () => scanner.getColumnMap(),
        debugHighlight: () => scanner.debugHighlight(),
        debugListHeaders: () => scanner.debugListHeaders(),
        CONFIG: CONFIG,
        COLUMN_HEADERS: COLUMN_HEADERS
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NanoProScanner = NanoProScanner;
}
