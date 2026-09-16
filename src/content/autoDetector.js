/**
 * NanoPro Auto Detector v2.0 — Non-Intrusive Edition
 * 
 * ⚠️ SECURITY MODEL: This module operates ONLY through content script
 * DOM reads (isolated world). It NEVER:
 * - Patches window.fetch or XMLHttpRequest
 * - Injects scripts into the page's MAIN world
 * - Dispatches custom events detectable by the page
 * - Modifies DOM elements or attributes on the page
 * - Makes any network requests
 * 
 * All DOM reads (querySelector, input.value, getBoundingClientRect) are
 * performed from Chrome's isolated content script world, which is
 * completely invisible to the host page's JavaScript.
 * 
 * Detection strategies (all DOM read-only):
 * 1. MuiAutocomplete headers + positioned input cells
 * 2. data-rbd-droppable containers
 * 3. overflow-auto containers with inputs
 * 4. Document-wide input scan with heuristics
 */

const NanoProAutoDetector = (function () {
    'use strict';

    const PRIMARY_SELECTOR = '#root > div.flex.h-screen > div.relative.h-full.grow.overflow-auto > div > div > div.grow.overflow-auto > div > div > div > div.shrink-0 > div.relative.overflow-hidden > div';

    // Explicitly excluded table headers that must never be matched as calculation columns
    const EXCLUDED_HEADERS = /^(cyl_returned|cyl_shipped|computations|unit_of_measure|description|item_no_2|qty_ordered)$/i;

    const REQUIRED_TABLE_COLUMNS = [
        { key: 'amount', name: 'Line_Amount' },
        { key: 'item_no', name: 'Item_No' },
        { key: 'price', name: 'Item_Price' },
        { key: 'qty', name: 'Qty' }
    ];

    const HEADER_PATTERNS = {
        qty: /^(qty|quantity|units|count)$/i,
        price: /^(item_price|unit_price|price|rate|unit_cost)$/i,
        amount: /^(line_amount|amount|total|line_total|net_amount|item_amount)$/i,
        item_no: /^(item_no|item_number|item_#|item#|item_num|part_no|sku|item_code)$/i,
    };

    const DATA_INPUT_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])';

    // ═══════════════════════════════════════════════════════
    // MAIN DETECTION (DOM-only, non-intrusive)
    // ═══════════════════════════════════════════════════════

    function detect() {
        console.log('[NanoPro AutoDetector] Starting detection (DOM-only)...');

        // Try DOM strategies
        const domResult = tryDomDetection();
        if (domResult) {
            console.log('[NanoPro AutoDetector] ✅ Detection succeeded:', domResult.method);
            return domResult;
        }

        // All strategies failed — auto-log diagnostics
        console.warn('[NanoPro AutoDetector] ❌ All strategies failed. Diagnostic report:');
        diagnose();

        return {
            success: false,
            error: 'ALL_STRATEGIES_FAILED',
            message: 'Could not detect table. Check console for diagnostic report. Try reloading the page or using Manual mode.'
        };
    }

    // ═══════════════════════════════════════════════════════
    // DOM DETECTION STRATEGIES
    // ═══════════════════════════════════════════════════════

    function tryDomDetection() {
        // Find container
        const container = findContainer();
        if (!container) {
            console.log('[NanoPro AutoDetector] No container found');
            return null;
        }
        console.log('[NanoPro AutoDetector] Container found:', container.tagName, container.className?.substring(0, 60));

        // Find headers
        let headers = findHeaders(container);
        if (headers.length === 0) {
            // Fallback: try document-wide
            headers = findHeaders(document);
            if (headers.length > 0) {
                console.log('[NanoPro AutoDetector] Headers found via document-wide search');
                return buildResult(document.body, headers);
            }
            console.log('[NanoPro AutoDetector] No headers found');
            return null;
        }

        console.log('[NanoPro AutoDetector] Headers found:', headers.map(h => `${h.name}(${h.source})`));
        return buildResult(container, headers);
    }

    function checkRequiredColumns(columnMapping) {
        const missing = [];
        const errors = [];
        for (const col of REQUIRED_TABLE_COLUMNS) {
            const exists = columnMapping && columnMapping[col.key] !== null && columnMapping[col.key] !== undefined;
            if (!exists) {
                missing.push(col.name);
                errors.push({
                    field: col.name,
                    column: col.name,
                    reason: 'MISSING_REQUIRED_COLUMN',
                    message: `Required column "${col.name}" does not exist in the table`
                });
            }
        }
        return {
            isValid: missing.length === 0,
            missingColumns: missing,
            errors: errors
        };
    }

    function buildResult(scope, headers) {
        const columnMapping = mapHeaders(headers);
        const foundCols = Object.entries(columnMapping).filter(([k, v]) => v);
        const columnCheck = checkRequiredColumns(columnMapping);

        // If no validation columns mapped, only accept if container headers exist inside a table container
        if (foundCols.length === 0 && (scope === document.body || headers.length < 2)) {
            console.log('[NanoPro AutoDetector] No validation columns mapped and insufficient container headers:',
                headers.map(h => h.name));
            return null;
        }

        console.log('[NanoPro AutoDetector] Column mapping:', Object.fromEntries(
            Object.entries(columnMapping).map(([k, v]) => [k, v ? v.name : null])
        ));
        if (!columnCheck.isValid) {
            console.warn('[NanoPro AutoDetector] ❌ Missing required column(s):', columnCheck.missingColumns.join(', '));
        }

        const rows = extractRows(scope, headers, columnMapping);
        if (rows.length === 0 && columnCheck.isValid) {
            console.log('[NanoPro AutoDetector] No data rows extracted');
            return null;
        }

        console.log(`[NanoPro AutoDetector] Extracted ${rows.length} data rows`);
        return {
            success: true,
            rows: rows,
            columnMapping: columnMapping,
            missingColumns: columnCheck.missingColumns,
            columnErrors: columnCheck.errors,
            headerCount: headers.length,
            rowCount: rows.length,
            method: 'dom-detection'
        };
    }

    // ── Container finding (read-only DOM queries) ──

    function findContainer() {
        // S1: data-rbd-droppable-id (Nanonets drag-drop table)
        const droppable = document.querySelector('[data-rbd-droppable-id]');
        if (droppable && droppable.offsetHeight > 0) {
            console.log('[NanoPro AutoDetector] S1: data-rbd-droppable ✅');
            return droppable;
        }

        // S2: Primary CSS selector (user-provided)
        try {
            const el = document.querySelector(PRIMARY_SELECTOR);
            if (el && el.offsetHeight > 0) {
                console.log('[NanoPro AutoDetector] S2: Primary selector ✅');
                return el;
            }
        } catch (e) { /* invalid selector */ }

        // S3: shrink-0 > overflow-hidden
        const s3 = document.querySelectorAll('div.shrink-0 > div.relative.overflow-hidden');
        for (const c of s3) {
            if (c.offsetHeight > 50 && c.querySelectorAll(DATA_INPUT_SELECTOR).length >= 3) {
                console.log('[NanoPro AutoDetector] S3: shrink-0 > overflow-hidden ✅');
                return c;
            }
        }

        // S4: overflow-auto with many inputs (table area)
        const scrollables = document.querySelectorAll('.overflow-auto');
        for (const s of scrollables) {
            const inputs = s.querySelectorAll(DATA_INPUT_SELECTOR);
            if (inputs.length >= 4 && s.offsetHeight > 50) {
                console.log('[NanoPro AutoDetector] S4: overflow-auto container ✅');
                return s;
            }
        }

        // S5: translateX column containers
        const cols = document.querySelectorAll('div.select-none[style*="translateX"]');
        if (cols.length >= 3) {
            console.log('[NanoPro AutoDetector] S5: translateX columns ✅');
            return cols[0].parentElement;
        }

        // S6: fallback to document body
        const allInputs = document.querySelectorAll(DATA_INPUT_SELECTOR);
        if (allInputs.length >= 4) {
            console.log('[NanoPro AutoDetector] S6: document body fallback');
            return document.body;
        }

        return null;
    }

    // ── Header finding (read-only DOM queries) ──

    function findHeaders(scope) {
        let headers = [];

        // H1: MuiAutocomplete-input with value
        scope.querySelectorAll('input.MuiAutocomplete-input').forEach(input => {
            const val = (input.value || '').trim();
            if (val) {
                const rect = input.getBoundingClientRect();
                if (rect.width > 0) headers.push({ name: val, centerX: rect.left + rect.width / 2, rect, source: 'H1' });
            }
        });

        // H2: placeholder="Select a column label"
        if (!headers.length) {
            scope.querySelectorAll('input[placeholder="Select a column label"]').forEach(input => {
                const val = (input.value || '').trim();
                if (val) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0) headers.push({ name: val, centerX: rect.left + rect.width / 2, rect, source: 'H2' });
                }
            });
        }

        // H3: MuiTextField-root[title] or MuiFormControl[title]
        if (!headers.length) {
            scope.querySelectorAll('.MuiTextField-root[title], div[title][class*="MuiFormControl"]').forEach(div => {
                const title = (div.getAttribute('title') || '').trim();
                if (title) {
                    const rect = div.getBoundingClientRect();
                    if (rect.width > 0) headers.push({ name: title, centerX: rect.left + rect.width / 2, rect, source: 'H3' });
                }
            });
        }

        // H4: Heuristic — column-name-like inputs at the topmost Y
        if (!headers.length) {
            const candidateInputs = Array.from(scope.querySelectorAll('input[type="text"]')).filter(i => {
                const val = (i.value || '').trim();
                return val && /^[a-z_\s]{2,30}$/i.test(val) && !(/^\d/.test(val));
            });
            if (candidateInputs.length >= 3) {
                const topY = Math.min(...candidateInputs.map(i => i.getBoundingClientRect().top));
                candidateInputs.filter(i => Math.abs(i.getBoundingClientRect().top - topY) < 20).forEach(input => {
                    const rect = input.getBoundingClientRect();
                    headers.push({ name: input.value.trim(), centerX: rect.left + rect.width / 2, rect, source: 'H4' });
                });
            }
        }

        // H5: Buttons inside sticky header
        if (!headers.length) {
            const stickyRow = scope.querySelector('.sticky.top-0, div[class*="sticky"]');
            if (stickyRow) {
                stickyRow.querySelectorAll('button').forEach(btn => {
                    const text = (btn.textContent || '').trim();
                    if (text && text.length < 30 && !text.includes('Add') && !text.includes('Delete')) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0) headers.push({ name: text, centerX: rect.left + rect.width / 2, rect, source: 'H5' });
                    }
                });
            }
        }

        // Deduplicate and sort left to right
        headers.sort((a, b) => a.centerX - b.centerX);
        const unique = [];
        for (const h of headers) {
            if (!unique.some(u => u.name === h.name && Math.abs(u.centerX - h.centerX) < 30)) unique.push(h);
        }
        return unique;
    }

    // ── Column mapping ──

    function mapHeaders(headers) {
        const mapping = { qty: null, price: null, amount: null, item_no: null };

        // Pass 1: Look for exact preferred header matches (e.g. "Qty", "Item_Price", "Line_Amount", "Item_No")
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
            if (EXCLUDED_HEADERS.test(norm)) continue;

            if (!mapping.qty && norm === 'qty') mapping.qty = header;
            if (!mapping.price && norm === 'item_price') mapping.price = header;
            if (!mapping.amount && norm === 'line_amount') mapping.amount = header;
            if (!mapping.item_no && (norm === 'item_no' || norm === 'item_#' || norm === 'item#')) mapping.item_no = header;
        }

        // Pass 2: Secondary patterns if primary not matched, strictly excluding non-target columns
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
            if (EXCLUDED_HEADERS.test(norm)) continue;

            for (const [type, pattern] of Object.entries(HEADER_PATTERNS)) {
                if (mapping[type]) continue;
                if (pattern.test(norm) || pattern.test(header.name.toLowerCase())) {
                    mapping[type] = header;
                    break;
                }
            }
        }
        return mapping;
    }

    // ── Data extraction (read-only) ──

    function extractRows(container, headers, columnMapping) {
        const headerY = Math.max(...headers.map(h => h.rect.bottom), 0);
        console.log('[NanoPro AutoDetector] Header bottom Y:', headerY);

        for (const hdr of headers) {
            const mapped = Object.entries(columnMapping).find(([k, v]) => v && v.name === hdr.name);
            console.log(`[NanoPro AutoDetector] Header "${hdr.name}" centerX: ${Math.round(hdr.centerX)} ${mapped ? '→ ' + mapped[0] : '(unmapped)'}`);
        }

        // Helper to match an input to the closest header among ALL headers in the table.
        // This ensures non-mapped columns like Cyl_Returned, Cyl_Shipped, Description, Qty_Ordered
        // are identified as themselves and NEVER wrongly assigned to Item_Price or Qty!
        function getHeaderForInput(inputCenterX) {
            // First pass: Direct span match
            for (const hdr of headers) {
                if (hdr.rect && typeof hdr.rect.left === 'number' && typeof hdr.rect.right === 'number') {
                    if (inputCenterX >= (hdr.rect.left - 6) && inputCenterX <= (hdr.rect.right + 6)) {
                        return hdr;
                    }
                }
            }
            // Second pass: Closest header by center X (within 80px distance limit)
            let closestHdr = null;
            let closestDist = 80;
            for (const hdr of headers) {
                const dist = Math.abs(inputCenterX - hdr.centerX);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestHdr = hdr;
                }
            }
            return closestHdr;
        }

        function assignCell(row, matchedHdr, val) {
            if (!matchedHdr) return;
            if (columnMapping.qty && matchedHdr.name === columnMapping.qty.name) {
                row.qty = val;
            } else if (columnMapping.price && matchedHdr.name === columnMapping.price.name) {
                row.price = val;
            } else if (columnMapping.amount && matchedHdr.name === columnMapping.amount.name) {
                row.amount = val;
            } else if (columnMapping.item_no && matchedHdr.name === columnMapping.item_no.name) {
                row.item_no = val;
            }
        }

        // Strategy A: Row containers via data-rbd-draggable-id (Nanonets line items)
        let rowContainers = Array.from(container.querySelectorAll('[data-rbd-draggable-id]'));
        if (!rowContainers.length && container !== document.body) {
            rowContainers = Array.from(document.querySelectorAll('[data-rbd-draggable-id]'));
        }

        if (rowContainers.length > 0) {
            console.log(`[NanoPro AutoDetector] Strategy A: Found ${rowContainers.length} [data-rbd-draggable-id] row containers`);

            // Sort row containers by numeric ID or DOM order/translateY
            rowContainers.sort((a, b) => {
                const idA = parseInt(a.getAttribute('data-rbd-draggable-id'), 10);
                const idB = parseInt(b.getAttribute('data-rbd-draggable-id'), 10);
                if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                return rectA.top - rectB.top;
            });

            const rows = [];
            for (let i = 0; i < rowContainers.length; i++) {
                const rowEl = rowContainers[i];
                const inputs = Array.from(rowEl.querySelectorAll('input, textarea, [contenteditable="true"]'));
                const row = { qty: null, price: null, amount: null, item_no: null };

                for (const input of inputs) {
                    if (input.classList && input.classList.contains('MuiAutocomplete-input')) continue;
                    if (input.placeholder === 'Select a column label') continue;
                    const inputType = (input.type || 'text').toLowerCase();
                    if (inputType !== 'text' && inputType !== '' && inputType !== 'search' && inputType !== 'number' && input.tagName !== 'TEXTAREA' && !input.isContentEditable) continue;

                    const rect = input.getBoundingClientRect();
                    const centerX = rect.width > 0 ? (rect.left + rect.width / 2) : 0;
                    const matchedHdr = getHeaderForInput(centerX);

                    if (matchedHdr) {
                        const rawVal = input.value !== undefined ? input.value : (input.textContent || '');
                        const val = (rawVal !== undefined && rawVal !== null) ? rawVal.trim() : '';
                        assignCell(row, matchedHdr, val);
                    }
                }

                // If row has any data or inputs are identified, retain it
                const hasAnyData = row.qty !== null || row.price !== null || row.amount !== null || row.item_no !== null;
                if (hasAnyData || inputs.length > 0) {
                    console.log(`[NanoPro AutoDetector] Row ${i + 1} (rbd):`, row);
                    rows.push(row);
                }
            }

            if (rows.length > 0) {
                return rows;
            }
        }

        // Strategy B: Y-coordinate clustering across data inputs (for virtualized or non-rbd tables)
        const allCandidateInputs = Array.from(
            (container.querySelectorAll('input').length ? container : document).querySelectorAll('input')
        );

        const dataInputs = [];
        for (const input of allCandidateInputs) {
            if (input.classList.contains('MuiAutocomplete-input')) continue;
            if (input.placeholder === 'Select a column label') continue;
            const inputType = (input.type || 'text').toLowerCase();
            if (inputType !== 'text' && inputType !== '' && inputType !== 'search' && inputType !== 'number') continue;

            const rect = input.getBoundingClientRect();
            if (rect.height <= 0 || rect.width <= 0) continue;
            if (headerY > 0 && rect.bottom <= headerY) continue;

            dataInputs.push({
                text: (input.value || '').trim(),
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                rect
            });
        }

        console.log(`[NanoPro AutoDetector] Strategy B: Found ${dataInputs.length} data inputs for clustering`);
        if (!dataInputs.length) return [];

        // Cluster inputs by vertical Y position (tolerance +/- 14px)
        dataInputs.sort((a, b) => a.centerY - b.centerY);

        const rowClusters = [];
        for (const item of dataInputs) {
            let placed = false;
            for (const cluster of rowClusters) {
                const avgY = cluster.totalY / cluster.items.length;
                if (Math.abs(item.centerY - avgY) <= 14) {
                    cluster.items.push(item);
                    cluster.totalY += item.centerY;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                rowClusters.push({
                    items: [item],
                    totalY: item.centerY
                });
            }
        }

        // Build rows from clusters
        const rows = [];
        for (let i = 0; i < rowClusters.length; i++) {
            const cluster = rowClusters[i];
            const row = { qty: null, price: null, amount: null, item_no: null };

            for (const item of cluster.items) {
                const matchedHdr = getHeaderForInput(item.centerX);
                if (matchedHdr) {
                    const val = item.text !== undefined && item.text !== null ? item.text : '';
                    assignCell(row, matchedHdr, val);
                }
            }

            const hasAnyData = row.qty !== null || row.price !== null || row.amount !== null || row.item_no !== null;
            if (hasAnyData || cluster.items.length > 0) {
                console.log(`[NanoPro AutoDetector] Row ${i + 1} (cluster):`, row);
                rows.push(row);
            }
        }

        return rows;
    }

    // ═══════════════════════════════════════════════════════
    // DIAGNOSTICS (auto-runs on failure, content script only)
    // ═══════════════════════════════════════════════════════

    function diagnose() {
        console.log('%c╔══════════════════════════════════════════════════════╗', 'color: #00ff00; font-weight: bold');
        console.log('%c║  NanoPro Diagnostic Report (DOM-only, non-intrusive) ║', 'color: #00ff00; font-weight: bold');
        console.log('%c╚══════════════════════════════════════════════════════╝', 'color: #00ff00; font-weight: bold');

        // Container strategies
        const strategies = [
            { name: 'S1: data-rbd-droppable-id', sel: '[data-rbd-droppable-id]' },
            { name: 'S2: Primary CSS selector', sel: PRIMARY_SELECTOR },
            { name: 'S3: shrink-0 > overflow-hidden', sel: 'div.shrink-0 > div.relative.overflow-hidden' },
            { name: 'S4: overflow-auto', sel: '.overflow-auto' },
            { name: 'S5: translateX columns', sel: 'div.select-none[style*="translateX"]' }
        ];

        console.log('\n%c— CONTAINERS —', 'color: #ffaa00; font-weight: bold');
        for (const s of strategies) {
            try {
                const els = document.querySelectorAll(s.sel);
                const icon = els.length > 0 ? '✅' : '❌';
                console.log(`  ${icon} ${s.name}: ${els.length} elements`,
                    els.length > 0 ? `(${els[0].offsetWidth}x${els[0].offsetHeight}px)` : '');
            } catch (e) { console.log(`  💥 ${s.name}: selector error`); }
        }

        // Header strategies
        console.log('\n%c— HEADERS —', 'color: #ffaa00; font-weight: bold');
        const headerChecks = [
            { name: 'H1: MuiAutocomplete-input', sel: 'input.MuiAutocomplete-input', fn: el => el.value },
            { name: 'H2: placeholder="Select a column label"', sel: 'input[placeholder="Select a column label"]', fn: el => el.value },
            { name: 'H3: MuiTextField-root[title]', sel: '.MuiTextField-root[title]', fn: el => el.getAttribute('title') },
        ];

        for (const h of headerChecks) {
            try {
                const els = document.querySelectorAll(h.sel);
                const vals = Array.from(els).map(h.fn).filter(v => v);
                console.log(`  ${vals.length > 0 ? '✅' : '❌'} ${h.name}: ${vals.length}`,
                    vals.length > 0 ? vals : '');
            } catch (e) { console.log(`  💥 ${h.name}: error`); }
        }

        // All inputs summary
        console.log('\n%c— INPUT INVENTORY —', 'color: #ffaa00; font-weight: bold');
        const allInputs = document.querySelectorAll('input[type="text"]');
        const withValues = Array.from(allInputs).filter(i => i.value.trim());
        console.log(`  Total: ${allInputs.length} text inputs, ${withValues.length} with values`);

        if (withValues.length > 0 && withValues.length <= 100) {
            const grouped = {};
            for (const input of withValues) {
                const y = Math.round(input.getBoundingClientRect().top / 15) * 15;
                if (!grouped[y]) grouped[y] = [];
                grouped[y].push({
                    value: input.value,
                    x: Math.round(input.getBoundingClientRect().left),
                    isMui: input.classList.contains('MuiAutocomplete-input')
                });
            }
            const sortedKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
            for (const y of sortedKeys) {
                const items = grouped[y].sort((a, b) => a.x - b.x);
                const tag = items[0].isMui ? ' [HEADER ROW]' : '';
                console.log(`  Y=${y}${tag}:`, items.map(i => i.value));
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════
    // SIDEBAR FIELDS EXTRACTION & VALIDATION HELPERS
    // ═══════════════════════════════════════════════════════

    /**
     * Extract text or input value from a container element
     * If labelToExclude is passed, avoids picking up the label itself
     */
    /**
     * Extract text or input value from a container element
     * If labelToExclude is passed, avoids picking up the label itself
     */
    function extractElementValue(el, labelToExclude = null) {
        if (!el) return '';
        const cleanLabel = labelToExclude ? labelToExclude.toLowerCase().replace(/[^\w]/g, '') : null;
        const excludeRegex = cleanLabel ? new RegExp(`^(?:model[_\s]*)?${cleanLabel}[:\s*#_-]*$`, 'i') : null;

        // Priority 1: input with non-empty value
        const input = el.querySelector('input, textarea, select');
        if (input) {
            const val = (input.value || '').trim();
            if (val && (!excludeRegex || !excludeRegex.test(val.replace(/[^\w]/g, '')))) {
                return val;
            }
        }

        // Priority 2: .ocr_text or specific OCR element
        const ocr = el.classList?.contains('ocr_text') ? el : el.querySelector('.ocr_text, [data-testid*="ocr" i]');
        if (ocr) {
            const ocrVal = (ocr.textContent || '').trim();
            if (ocrVal && (!excludeRegex || !excludeRegex.test(ocrVal.replace(/[^\w]/g, '')))) {
                return ocrVal;
            }
        }

        // Priority 3: [data-testid*="label_box_div"] or chips
        const testIdBox = el.querySelector('[data-testid*="label_box_div"], .MuiChip-label, [class*="chip" i], [class*="badge" i], [class*="value" i], [role="combobox"], .MuiSelect-select');
        if (testIdBox && testIdBox !== el) {
            const boxVal = (testIdBox.textContent || '').trim();
            if (boxVal && (!excludeRegex || !excludeRegex.test(boxVal.replace(/[^\w]/g, '')))) {
                return boxVal;
            }
        }

        // Priority 4: leaf spans, excluding any span that is just the label
        const spans = el.querySelectorAll('span, p, div');
        for (const span of spans) {
            if (span.children.length > 0) continue;
            const text = (span.textContent || '').trim();
            if (!text) continue;
            if (excludeRegex && excludeRegex.test(text.replace(/[^\w]/g, ''))) {
                continue; // Skip label text
            }
            return text;
        }

        // Fallback: entire text content excluding label
        const fullText = (el.textContent || '').trim();
        if (excludeRegex && excludeRegex.test(fullText.replace(/[^\w]/g, ''))) {
            return '';
        }
        return fullText;
    }

    /**
     * Extract the field value from a row container by filtering out the label
     */
    function extractRowValue(row, labelRegex) {
        if (!row) return null;

        // 1. Inputs or textareas
        const inputs = row.querySelectorAll('input, textarea, select');
        for (const input of inputs) {
            const v = (input.value || '').trim();
            if (v && !labelRegex.test(v)) {
                return v;
            }
        }

        // 2. OCR text elements
        const ocrs = row.querySelectorAll('.ocr_text, [data-testid*="ocr" i], [class*="ocr" i]');
        for (const ocr of ocrs) {
            const v = (ocr.textContent || '').trim();
            if (v && !labelRegex.test(v)) {
                return v;
            }
        }

        // 3. Material-UI chips, selects, dropdown values
        const chips = row.querySelectorAll('.MuiChip-label, [class*="chip" i], [class*="badge" i], [class*="value" i], [role="combobox"], .MuiSelect-select');
        for (const chip of chips) {
            const v = (chip.textContent || '').trim();
            if (v && !labelRegex.test(v)) {
                return v;
            }
        }

        // 4. All leaf spans or text elements in the row
        const spans = row.querySelectorAll('span, p, div, strong, b');
        for (const span of spans) {
            if (span.children.length > 0) continue;
            const v = (span.textContent || '').trim();
            if (v && !labelRegex.test(v)) {
                return v;
            }
        }

        return null;
    }

    /**
     * Find a sidebar field row container by searching for a label
     */
    function findSidebarFieldRow(labelName) {
        const cleanLabel = (labelName || '').toLowerCase().replace(/[^\w]/g, '');
        const targetRegex = new RegExp(`^(?:model[_\s]*)?${cleanLabel}[:\s*#_-]*$`, 'i');

        const candidateEls = document.querySelectorAll('span, label, p, div, h6, strong, b');
        for (const el of candidateEls) {
            if (el.closest && el.closest('#nanopro-root, .nanopro-panel, .nanopro-badge')) continue;
            if (el.children.length > 2) continue;

            const text = (el.textContent || '').trim();
            const cleanText = text.toLowerCase().replace(/[^\w]/g, '');
            if (cleanText === cleanLabel || targetRegex.test(text)) {
                const row = el.closest('[data-index], .absolute, [class*="row" i], [class*="field" i], [data-rbd-draggable-id], [role="row"], [class*="Item" i]') || 
                            el.parentElement?.parentElement || el.parentElement;
                if (row) return row;
            }
        }
        return null;
    }

    /**
     * Find invoice_amount from sidebar and check for multiple instances
     */
    function findInvoiceAmount() {
        console.log('[NanoPro AutoDetector] Looking for invoice_amount in sidebar...');

        const testIdEls = document.querySelectorAll('[data-testid="label_box_div_invoice_amount"], [data-testid*="label_box_div_invoice_amount" i]');
        const foundInstances = [];

        if (testIdEls.length > 0) {
            for (const el of testIdEls) {
                const valStr = extractElementValue(el);
                if (valStr) {
                    const parsed = NanoProParser.parse(valStr);
                    if (parsed && parsed.value !== null) {
                        foundInstances.push({
                            value: parsed.value,
                            confidence: parsed.confidence,
                            raw: valStr,
                            selector: 'data-testid'
                        });
                    }
                }
            }

            if (foundInstances.length > 1) {
                console.warn(`[NanoPro AutoDetector] MULTIPLE invoice_amount instances found (${foundInstances.length})`);
                return {
                    value: foundInstances[0].value,
                    count: foundInstances.length,
                    multiple: true,
                    instances: foundInstances,
                    raw: foundInstances.map(i => i.raw).join(', '),
                    selector: 'data-testid'
                };
            } else if (foundInstances.length === 1) {
                const single = foundInstances[0];
                console.log(`[NanoPro AutoDetector] invoice_amount found via data-testid: ${single.value}`);
                return {
                    value: single.value,
                    confidence: single.confidence,
                    count: 1,
                    multiple: false,
                    raw: single.raw,
                    selector: 'data-testid'
                };
            }
        }

        // S2: Label text scan — find span containing "invoice_amount", then read sibling value
        const target = 'invoiceamount';
        const allSpans = document.querySelectorAll('span');
        const seenRows = new Set();

        for (const span of allSpans) {
            const text = (span.textContent || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
            if (text === target || text === 'totalamount') {
                const row = span.closest('[data-index]') || span.closest('.absolute') || span.parentElement?.parentElement;
                if (row && !seenRows.has(row)) {
                    seenRows.add(row);
                    const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
                    const valStr = extractElementValue(ocrDiv);
                    if (valStr) {
                        const parsed = NanoProParser.parse(valStr);
                        if (parsed && parsed.value !== null) {
                            foundInstances.push({
                                value: parsed.value,
                                confidence: parsed.confidence,
                                raw: valStr,
                                selector: 'label-scan'
                            });
                        }
                    } else {
                        // Fallback: numeric sibling
                        const spans = row.querySelectorAll('span');
                        for (const s of spans) {
                            if (s === span) continue;
                            const val = (s.textContent || '').trim();
                            if (val && NanoProParser.NUMERIC_PATTERNS.anyNumeric.test(val.replace(/[$€£¥₹,]/g, ''))) {
                                const parsed = NanoProParser.parse(val);
                                if (parsed && parsed.value !== null) {
                                    foundInstances.push({
                                        value: parsed.value,
                                        confidence: parsed.confidence * 0.9,
                                        raw: val,
                                        selector: 'sibling-numeric'
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (foundInstances.length > 1) {
            console.warn(`[NanoPro AutoDetector] MULTIPLE invoice_amount instances found via scan (${foundInstances.length})`);
            return {
                value: foundInstances[0].value,
                count: foundInstances.length,
                multiple: true,
                instances: foundInstances,
                raw: foundInstances.map(i => i.raw).join(', '),
                selector: 'label-scan'
            };
        } else if (foundInstances.length === 1) {
            const single = foundInstances[0];
            console.log(`[NanoPro AutoDetector] invoice_amount found via label scan: ${single.value}`);
            return {
                value: single.value,
                confidence: single.confidence,
                count: 1,
                multiple: false,
                raw: single.raw,
                selector: 'label-scan'
            };
        }

        console.log('[NanoPro AutoDetector] invoice_amount not found in sidebar');
        return null;
    }

    /**
     * Find Environment field from sidebar (must be 'prod')
     * Multi-strategy detection guarantees extraction across all Nanonets UI states
     */
    function findEnvironment() {
        console.log('[NanoPro AutoDetector] Looking for Environment in sidebar...');
        const labelRegex = /^(?:model[_\s]*)?env(?:ironment)?[:\s*#_-]*$/i;

        function cleanEnvVal(raw) {
            if (!raw || typeof raw !== 'string') return null;
            const trimmed = raw.trim();
            if (!trimmed || labelRegex.test(trimmed)) return null;
            return trimmed;
        }

        // Strategy 1: Dedicated input or select elements
        const inputSelectors = [
            'input[data-testid*="environment" i]',
            'input[name*="environment" i]',
            'input[id*="environment" i]',
            'input[aria-label*="environment" i]',
            '[data-testid*="environment" i] input',
            '[data-testid*="env" i] input',
            'select[name*="environment" i]',
            'select[data-testid*="environment" i]'
        ];
        for (const sel of inputSelectors) {
            const inputs = document.querySelectorAll(sel);
            for (const input of inputs) {
                if (input.closest && input.closest('#nanopro-root, .nanopro-panel, .nanopro-badge')) continue;
                const val = cleanEnvVal(input.value);
                if (val) {
                    console.log(`[NanoPro AutoDetector] Environment found via input [${sel}]: "${val}"`);
                    return { value: val, raw: val, selector: 'input-attr' };
                }
            }
        }

        // Strategy 2: data-testid elements matching Environment
        const testIdSelectors = [
            '[data-testid*="label_box_div_Environment" i]',
            '[data-testid*="label_box_div_environment" i]',
            '[data-testid*="Environment" i]',
            '[data-testid*="environment" i]'
        ];
        for (const sel of testIdSelectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
                if (el.closest && el.closest('#nanopro-root, .nanopro-panel, .nanopro-badge')) continue;

                // 2a. Self check
                const valSelf = cleanEnvVal(extractElementValue(el, 'Environment'));
                if (valSelf) {
                    console.log(`[NanoPro AutoDetector] Environment found via data-testid self: "${valSelf}"`);
                    return { value: valSelf, raw: valSelf, selector: 'data-testid' };
                }

                // 2b. Next sibling check (common in Nanonets: label box followed by value box)
                if (el.nextElementSibling) {
                    const valSib = cleanEnvVal(extractElementValue(el.nextElementSibling, 'Environment'));
                    if (valSib) {
                        console.log(`[NanoPro AutoDetector] Environment found via data-testid sibling: "${valSib}"`);
                        return { value: valSib, raw: valSib, selector: 'data-testid-sibling' };
                    }
                }

                // 2c. Enclosing row check
                const row = el.closest('[data-index], .absolute, [class*="row" i], [class*="field" i], [role="row"], [class*="Item" i]') || el.parentElement;
                if (row && row !== el) {
                    const valRow = cleanEnvVal(extractRowValue(row, labelRegex));
                    if (valRow) {
                        console.log(`[NanoPro AutoDetector] Environment found via data-testid row: "${valRow}"`);
                        return { value: valRow, raw: valRow, selector: 'data-testid-row' };
                    }
                }
            }
        }

        // Strategy 3: Text label scan across candidate elements
        const labelCandidates = document.querySelectorAll('span, label, p, div, h6, strong, b');
        for (const el of labelCandidates) {
            if (el.closest && el.closest('#nanopro-root, .nanopro-panel, .nanopro-badge')) continue;
            if (el.children.length > 2) continue;

            const text = (el.textContent || '').trim();
            if (labelRegex.test(text)) {
                // 3a. Next sibling
                if (el.nextElementSibling) {
                    const valSib = cleanEnvVal(extractElementValue(el.nextElementSibling, 'Environment'));
                    if (valSib) {
                        console.log(`[NanoPro AutoDetector] Environment found via label sibling: "${valSib}"`);
                        return { value: valSib, raw: valSib, selector: 'label-sibling' };
                    }
                }

                // 3b. Enclosing row
                const row = el.closest('[data-index], .absolute, [class*="row" i], [class*="field" i], [data-rbd-draggable-id], [role="row"], [class*="Item" i], [class*="container" i]') ||
                            el.parentElement?.parentElement || el.parentElement;
                if (row) {
                    const valRow = cleanEnvVal(extractRowValue(row, labelRegex));
                    if (valRow) {
                        console.log(`[NanoPro AutoDetector] Environment found via label scan row: "${valRow}"`);
                        return { value: valRow, raw: valRow, selector: 'label-scan' };
                    }
                }
            }
        }

        console.log('[NanoPro AutoDetector] Environment not found in sidebar');
        return null;
    }

    /**
     * Find all is_rental fields from sidebar (can have multiple instances)
     */
    function findIsRental() {
        console.log('[NanoPro AutoDetector] Looking for is_rental in sidebar...');
        const results = [];
        const seenRows = new Set();

        // S1: all data-testid matching is_rental
        const testIdEls = document.querySelectorAll('[data-testid*="label_box_div_is_rental" i]');
        for (const el of testIdEls) {
            const row = el.closest('[data-index]') || el.closest('.absolute') || el;
            if (row && seenRows.has(row)) continue;
            if (row) seenRows.add(row);

            const key = row?.getAttribute('data-index') || 
                        row?.getAttribute('data-rbd-draggable-id') || 
                        el.getAttribute('data-testid') || 
                        el.id || 
                        null;

            const val = extractElementValue(el);
            if (val !== '') {
                results.push({
                    value: val,
                    raw: val,
                    key: key,
                    selector: 'data-testid'
                });
            }
        }

        // S2: Label text scan if S1 found nothing
        if (results.length === 0) {
            const target = 'isrental';
            const allSpans = document.querySelectorAll('span');
            for (const span of allSpans) {
                const text = (span.textContent || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
                if (text === target) {
                    const row = span.closest('[data-index]') || span.closest('.absolute') || span.parentElement?.parentElement;
                    if (row && !seenRows.has(row)) {
                        seenRows.add(row);
                        const key = row?.getAttribute('data-index') || 
                                    row?.getAttribute('data-rbd-draggable-id') || 
                                    row?.id || null;
                        const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
                        const val = extractElementValue(ocrDiv || row);
                        if (val !== '') {
                            results.push({
                                value: val,
                                raw: val,
                                key: key,
                                selector: 'label-scan'
                            });
                        }
                    }
                }
            }
        }

        console.log(`[NanoPro AutoDetector] is_rental found ${results.length} instance(s):`, results.map(r => r.value));
        return results;
    }

    /**
     * Find trade_partner_name from sidebar
     */
    function findTradePartnerName() {
        console.log('[NanoPro AutoDetector] Looking for trade_partner_name in sidebar...');
        const labelStrings = /^(trade[_\s]*partner[_\s]*(?:name)?)$/i;

        const testIdEls = document.querySelectorAll('[data-testid*="label_box_div_trade_partner_name" i]');
        for (const el of testIdEls) {
            const val = extractElementValue(el, 'trade_partner_name');
            if (val !== undefined && val !== null && val.trim() !== '' && !labelStrings.test(val.trim())) {
                console.log(`[NanoPro AutoDetector] trade_partner_name found via data-testid: "${val.trim()}"`);
                return { value: val.trim(), raw: val.trim(), selector: 'data-testid' };
            }
        }

        const row = findSidebarFieldRow('trade_partner_name') || findSidebarFieldRow('trade partner name');
        if (row) {
            const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
            const val = extractElementValue(ocrDiv || row, 'trade_partner_name');
            if (val !== undefined && val !== null && val.trim() !== '' && !labelStrings.test(val.trim())) {
                console.log(`[NanoPro AutoDetector] trade_partner_name found via label scan: "${val.trim()}"`);
                return { value: val.trim(), raw: val.trim(), selector: 'label-scan' };
            }
        }

        console.log('[NanoPro AutoDetector] trade_partner_name not found in sidebar');
        return null;
    }

    /**
     * Find invoice_number from sidebar
     */
    function findInvoiceNumber() {
        console.log('[NanoPro AutoDetector] Looking for invoice_number in sidebar...');
        
        // Priority 1: data-testid attributes
        const testIdSelectors = [
            '[data-testid*="label_box_div_invoice_number" i]',
            '[data-testid*="label_box_div_invoice_no" i]',
            '[data-testid*="label_box_div_inv_no" i]',
            '[data-testid*="label_box_div_invoice#" i]',
            '[data-testid*="label_box_div_invoice_id" i]'
        ];
        for (const sel of testIdSelectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
                const val = extractElementValue(el, 'invoice_number');
                if (val && !/^(invoice[_\s]*(?:number|no|#|id)|inv[_\s]*(?:no|#|id))$/i.test(val.trim())) {
                    console.log(`[NanoPro AutoDetector] invoice_number found via data-testid: "${val.trim()}"`);
                    return { value: val.trim(), raw: val.trim(), selector: 'data-testid' };
                }
            }
        }

        // Priority 2: Label row scan
        const labelNames = ['invoice_number', 'invoice_no', 'inv_no', 'invoice number', 'invoice no', 'invoice #', 'invoice_id'];
        for (const name of labelNames) {
            const row = findSidebarFieldRow(name);
            if (row) {
                const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
                let val = ocrDiv ? extractElementValue(ocrDiv, name) : '';
                if (!val || /^(invoice[_\s]*(?:number|no|#|id)|inv[_\s]*(?:no|#|id))$/i.test(val.trim())) {
                    val = extractElementValue(row, name);
                }
                if (val && !/^(invoice[_\s]*(?:number|no|#|id)|inv[_\s]*(?:no|#|id))$/i.test(val.trim())) {
                    console.log(`[NanoPro AutoDetector] invoice_number found via label scan: "${val.trim()}"`);
                    return { value: val.trim(), raw: val.trim(), selector: 'label-scan' };
                }
            }
        }

        console.log('[NanoPro AutoDetector] invoice_number not found in sidebar');
        return null;
    }

    /**
     * Detect document page info (current page and total pages)
     * Resilient multi-strategy detection:
     * 1. Nanonets & viewer pager controls (input next to "Page", "of Y", etc.)
     * 2. Active pager input with sibling/parent "of Y" (excluding tables/grids)
     * 3. Direct page text in viewer/toolbar ("Page X of Y", "X / Y", etc.)
     * 4. Multi-page thumbnail strips (requires multiple sibling thumbnails)
     * 5. URL query/hash parameters
     * 6. General DOM text scanning
     */
    function detectPageInfo() {
        try {
            // S1: Nanonets Pager Control — <span>Page</span> followed by <input> and <span>of Y</span>
            const allSpans = document.querySelectorAll('span, label, p, div');
            for (const span of allSpans) {
                if (span.children.length > 2) continue;
                const text = (span.textContent || '').trim();
                if (/^page\s*[:#]?$/i.test(text)) {
                    const nextEl = span.nextElementSibling;
                    if (nextEl) {
                        const input = nextEl.tagName === 'INPUT' ? nextEl : nextEl.querySelector('input');
                        if (input) {
                            const curVal = (input.value || input.getAttribute('value') || '').trim();
                            const curNum = parseInt(curVal, 10);
                            const maxVal = input.getAttribute('max') || input.max;

                            const afterInput = nextEl.nextElementSibling;
                            const afterText = (afterInput?.textContent || '').trim();
                            const afterMatch = afterText.match(/(?:of|\/)\s*(\d+)/i);

                            const parent = span.parentElement;
                            const parentText = (parent?.textContent || '').trim();
                            const parentMatch = parentText.match(/(?:of|\/)\s*(\d+)/i);

                            const totalMatch = afterMatch || parentMatch;
                            const total = totalMatch ? parseInt(totalMatch[1], 10) : (maxVal ? parseInt(maxVal, 10) : null);
                            const current = (!isNaN(curNum) && curNum > 0) ? curNum : 1;

                            if (total && total > 0) {
                                const info = {
                                    currentPage: current,
                                    totalPages: total,
                                    isMultiPage: total > 1,
                                    raw: `Page ${current} of ${total}`,
                                    source: 'nanonets-pager'
                                };
                                console.log(`[NanoPro AutoDetector] Page info detected (nanonets-pager): Current=${info.currentPage}, Total=${info.totalPages}`);
                                return info;
                            }
                        }
                    }
                }
            }

            // S2: Active Pager Control via <input> element anywhere in document (excluding tables/grids/overlays)
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                if (input.closest('table, [role="table"], [role="row"], [class*="table" i], [class*="grid" i], [data-rbd-droppable-id], .nanopro-overlay, #nanopro-root, .nanopro-panel, [class*="table-footer" i], [class*="rows-per-page" i]')) {
                    continue;
                }
                const inputType = (input.type || '').toLowerCase();
                if (['checkbox', 'radio', 'button', 'submit', 'hidden', 'file', 'image'].includes(inputType)) {
                    continue;
                }

                const curValStr = (input.value || input.getAttribute('value') || '').trim();
                const curNum = parseInt(curValStr, 10);
                if (!isNaN(curNum) && curNum > 0 && curNum <= 9999) {
                    const maxVal = input.getAttribute('max') || input.max;
                    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
                    const inputClass = (input.className || '').toLowerCase();
                    const inputName = (input.name || '').toLowerCase();
                    const inputId = (input.id || '').toLowerCase();
                    const isInsidePagerContainer = !!input.closest('[role="toolbar"], [class*="toolbar" i], [class*="footer" i], [class*="pager" i], [class*="pagination" i], [class*="viewer" i], [class*="pdf" i]');

                    // Sibling check
                    const nextEl = input.nextElementSibling;
                    const nextText = (nextEl?.textContent || '').trim();
                    const siblingMatch = nextText.match(/(?:of|\/)\s*(\d+)/i);

                    // Parent check
                    const parent = input.parentElement;
                    const parentText = (parent?.textContent || '').trim();
                    const parentMatch = parentText.match(/(?:of|\/)\s*(\d+)/i);

                    const prevEl = input.previousElementSibling;
                    const prevText = (prevEl?.textContent || '').trim();
                    const hasPageWord = /page/i.test(prevText) || /page/i.test(parentText) ||
                                        ariaLabel.includes('page') || inputClass.includes('page') ||
                                        inputName.includes('page') || inputId.includes('page');

                    const totalMatch = siblingMatch || parentMatch;
                    if ((totalMatch || maxVal) && (hasPageWord || isInsidePagerContainer || totalMatch)) {
                        const total = totalMatch ? parseInt(totalMatch[1], 10) : parseInt(maxVal, 10);
                        if (total && total > 0 && curNum <= total) {
                            const info = {
                                currentPage: curNum,
                                totalPages: total,
                                isMultiPage: total > 1,
                                raw: `Page ${curNum} of ${total}`,
                                source: 'active-pager-input'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (active-pager-input): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }
                }
            }

            // S3: Direct Viewer / Toolbar Text ("Page X of Y", "Page X / Y", or "X of Y" in viewer/toolbar)
            const textContainers = document.querySelectorAll('[role="toolbar"], header, nav, [class*="toolbar" i], [class*="footer" i], [class*="header" i], [class*="viewer" i], [class*="pager" i], [class*="pagination" i], [class*="pdf" i], [data-testid*="page" i], [data-testid*="pagination" i]');
            for (const tb of textContainers) {
                if (tb.closest('table, [role="table"], [role="row"], [class*="table" i], .nanopro-overlay, #nanopro-root, .nanopro-panel')) {
                    continue;
                }
                const text = (tb.textContent || '').trim();
                // Check for explicit "Page X of Y" or "Page: X / Y"
                const pageMatch = text.match(/\bpage\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
                if (pageMatch) {
                    const curr = parseInt(pageMatch[1], 10);
                    const total = parseInt(pageMatch[2], 10);
                    if (curr > 0 && total > 0 && curr <= total) {
                        const info = {
                            currentPage: curr,
                            totalPages: total,
                            isMultiPage: total > 1,
                            raw: `Page ${curr} of ${total}`,
                            source: 'toolbar-page-text'
                        };
                        console.log(`[NanoPro AutoDetector] Page info detected (toolbar-page-text): Current=${info.currentPage}, Total=${info.totalPages}`);
                        return info;
                    }
                }

                // If element itself is concise (e.g. "<div class='pager'> 1 / 3 </div>"), check for "X of Y" or "X / Y"
                if (text.length <= 30) {
                    const conciseMatch = text.match(/^(\d+)\s*(?:of|\/)\s*(\d+)$/i);
                    if (conciseMatch) {
                        const curr = parseInt(conciseMatch[1], 10);
                        const total = parseInt(conciseMatch[2], 10);
                        if (curr > 0 && total > 0 && curr <= total && total <= 9999) {
                            const info = {
                                currentPage: curr,
                                totalPages: total,
                                isMultiPage: total > 1,
                                raw: `Page ${curr} of ${total}`,
                                source: 'toolbar-concise-text'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (toolbar-concise-text): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }
                }
            }

            // S4: Multi-Page Thumbnail Strip (Resilient, requires multiple thumbnail siblings or explicit thumbnail list)
            const thumbnailContainers = document.querySelectorAll('[class*="thumbnail" i], [class*="page-list" i], [class*="pages-list" i], [class*="pages" i], [data-testid*="thumbnail" i], [data-testid*="page-list" i], [role="tablist"]');
            for (const container of thumbnailContainers) {
                if (container.closest('table, [role="table"], .nanopro-overlay, #nanopro-root, .nanopro-panel')) {
                    continue;
                }
                // Look for thumbnail items inside container
                const items = container.querySelectorAll('[role="listitem"], [role="tab"], [class*="thumbnail" i], [class*="page-card" i], [class*="page" i], [data-testid*="thumbnail" i], [data-page], [data-page-number]');
                if (items && items.length > 1) {
                    const totalThumbs = items.length;
                    let activeIndex = -1;
                    let activePageNum = null;

                    items.forEach((item, idx) => {
                        const isSelected = item.matches('[aria-selected="true"], [data-selected="true"], [class*="selected" i], [class*="active" i], [class*="border-blue" i], [class*="ring-blue" i], [class*="border-primary" i], [class*="border-indigo" i], [class*="bg-blue" i], [class*="bg-indigo" i], [aria-current="page"], [data-state="active"], [data-active="true"]') ||
                                           !!item.querySelector('[aria-selected="true"], [data-selected="true"], [class*="selected" i], [class*="active" i], [class*="border-blue" i], [class*="ring-blue" i], [class*="border-primary" i], [class*="border-indigo" i], [class*="bg-blue" i], [class*="bg-indigo" i], [aria-current="page"], [data-state="active"], [data-active="true"]');
                        if (isSelected) {
                            activeIndex = idx + 1;
                            const attrVal = item.getAttribute('data-page') || item.getAttribute('data-page-number');
                            if (attrVal) {
                                const p = parseInt(attrVal, 10);
                                if (!isNaN(p) && p > 0) activePageNum = p;
                            }
                            const tMatch = (item.textContent || '').trim().match(/\b(?:page\s*[:#]?)?(\d+)\b/i);
                            if (!activePageNum && tMatch) {
                                const p = parseInt(tMatch[1], 10);
                                if (!isNaN(p) && p > 0 && p <= totalThumbs) activePageNum = p;
                            }
                        }
                    });

                    // Only accept S4 if an active thumbnail was genuinely identified!
                    // Never default to Page 1 when thumbnail selection is uncertain, to prevent pre-empting true pager inputs.
                    if (activePageNum || activeIndex > 0) {
                        const currentPage = activePageNum || activeIndex;
                        const totalPages = Math.max(totalThumbs, currentPage);
                        const info = {
                            currentPage: currentPage,
                            totalPages: totalPages,
                            isMultiPage: totalPages > 1,
                            raw: `Page ${currentPage} of ${totalPages}`,
                            source: 'thumbnail-strip'
                        };
                        console.log(`[NanoPro AutoDetector] Page info detected (thumbnail-strip): Current=${info.currentPage}, Total=${info.totalPages}`);
                        return info;
                    }
                }
            }

            // S5: URL Query or Hash page parameters
            if (typeof window !== 'undefined' && window.location) {
                const url = window.location.href + ' ' + window.location.hash;
                const pageMatch = url.match(/[?&#](?:page|page_number|pageNum|pageNumber)=(\d+)/i) ||
                                  url.match(/(?:\/|#)page\/(\d+)/i);
                const totalMatch = url.match(/[?&#](?:total_pages|totalPages|num_pages)=(\d+)/i);
                if (pageMatch) {
                    const currentPage = parseInt(pageMatch[1], 10) || 1;
                    const totalPages = totalMatch ? (parseInt(totalMatch[1], 10) || currentPage) : Math.max(currentPage, 1);
                    const info = {
                        currentPage: currentPage,
                        totalPages: totalPages,
                        isMultiPage: totalPages > 1,
                        raw: `Page ${currentPage} of ${totalPages}`,
                        source: 'url-param'
                    };
                    console.log(`[NanoPro AutoDetector] Page info detected (url-param): Current=${info.currentPage}, Total=${info.totalPages}`);
                    return info;
                }
            }

            // S6: General pattern matching across elements (direct text or parent)
            const allElements = document.querySelectorAll('span, div, p');
            for (const el of allElements) {
                if (el.closest('table, [role="table"], [role="row"], .nanopro-overlay, #nanopro-root, .nanopro-panel')) {
                    continue;
                }
                const text = (el.textContent || '').trim();
                if (text.length > 80) continue;

                // Match "Page 1 of 3", "Page: 1 / 3"
                const directMatch = text.match(/\bpage\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
                if (directMatch) {
                    const currentPage = parseInt(directMatch[1], 10) || 1;
                    const totalPages = parseInt(directMatch[2], 10) || 1;
                    if (currentPage <= totalPages && totalPages > 0) {
                        const info = {
                            currentPage: currentPage,
                            totalPages: totalPages,
                            isMultiPage: totalPages > 1,
                            raw: `Page ${currentPage} of ${totalPages}`,
                            source: 'direct-text'
                        };
                        console.log(`[NanoPro AutoDetector] Page info detected (direct): Current=${info.currentPage}, Total=${info.totalPages}`);
                        return info;
                    }
                }

                // Match concise "1 / 3" or "1 of 3" (without word "page", but with clear bounded length)
                if (text.length <= 25) {
                    const conciseMatch = text.match(/^(\d+)\s*(?:of|\/)\s*(\d+)$/i);
                    if (conciseMatch) {
                        const currentPage = parseInt(conciseMatch[1], 10) || 1;
                        const totalPages = parseInt(conciseMatch[2], 10) || 1;
                        if (currentPage <= totalPages && totalPages > 1 && totalPages <= 500) {
                            const info = {
                                currentPage: currentPage,
                                totalPages: totalPages,
                                isMultiPage: true,
                                raw: `Page ${currentPage} of ${totalPages}`,
                                source: 'direct-concise-text'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (direct-concise-text): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[NanoPro AutoDetector] Error detecting page info:', e);
        }

        // Fallback: If page number is not there, consider it as only one page
        return {
            currentPage: 1,
            totalPages: 1,
            isMultiPage: false,
            raw: 'Page 1 of 1',
            source: 'default-single-page'
        };
    }

    /**
     * Unified sidebar fields aggregator
     */
    function findSidebarFields() {
        return {
            invoiceNumber: findInvoiceNumber(),
            invoiceAmount: findInvoiceAmount(),
            environment: findEnvironment(),
            isRental: findIsRental(),
            tradePartnerName: findTradePartnerName(),
            pageInfo: detectPageInfo()
        };
    }

    /**
     * Check if two URLs or hashes belong to the same document instance (including multi-page pages)
     * Supports both full URLs and hash strings, with optional invoice number checking.
     */
    function isSameDocumentInstance(hashA, hashB, invoiceNumA = null, invoiceNumB = null) {
        if (!hashA || !hashB) return false;

        // If both invoice numbers are known and DIFFERENT, they are distinct invoices!
        if (invoiceNumA && invoiceNumB && invoiceNumA.trim() !== '' && invoiceNumB.trim() !== '') {
            if (invoiceNumA.trim().toLowerCase() !== invoiceNumB.trim().toLowerCase()) {
                console.log(`[NanoPro AutoDetector] Different invoice numbers: "${invoiceNumA}" vs "${invoiceNumB}" -> different invoice instance`);
                return false;
            }
        }

        if (hashA === hashB) return true;

        // Broaden route support: /ocr/test/, /ocr/, /review/, /workflow/, /models/
        const pattern = /#\/(?:ocr|review|workflow|models)(?:\/test)?\/([a-f0-9-]+)\/([a-f0-9-]+)/i;
        const matchA = hashA.match(pattern);
        const matchB = hashB.match(pattern);

        if (!matchA || !matchB) return false;

        const modelIdA = matchA[1].toLowerCase();
        const fileIdA = matchA[2].split('?')[0].split('/')[0].toLowerCase();
        const modelIdB = matchB[1].toLowerCase();
        const fileIdB = matchB[2].split('?')[0].split('/')[0].toLowerCase();

        if (modelIdA !== modelIdB) return false;
        if (fileIdA === fileIdB) return true;

        // If both invoice numbers are known and IDENTICAL, they belong to the same invoice instance!
        if (invoiceNumA && invoiceNumB && invoiceNumA.trim() !== '' && invoiceNumA.trim().toLowerCase() === invoiceNumB.trim().toLowerCase()) {
            console.log(`[NanoPro AutoDetector] Same invoice number "${invoiceNumA}" across files -> same invoice instance`);
            return true;
        }

        // Check if both are UUIDv1 for pages of the same multipage document
        const partsA = fileIdA.split('-');
        const partsB = fileIdB.split('-');

        if (partsA.length === 5 && partsB.length === 5) {
            const sameNode = partsA[4] === partsB[4];
            const sameTimeMid = partsA[1] === partsB[1];
            const sameTimeHi = partsA[2] === partsB[2];

            if (sameNode && sameTimeMid && sameTimeHi) {
                const lowA = parseInt(partsA[0], 16);
                const lowB = parseInt(partsB[0], 16);
                if (!isNaN(lowA) && !isNaN(lowB) && Math.abs(lowA - lowB) <= 0x1000000) {
                    return true;
                }
                if (partsA[0].slice(0, 4) === partsB[0].slice(0, 4)) {
                    return true;
                }
            }
        }

        return false;
    }

    function isTableVisible() {
        const el = document.querySelector('[data-rbd-droppable-id]') ||
            document.querySelector(PRIMARY_SELECTOR);
        return el ? el.offsetHeight > 0 : false;
    }

    return {
        detect: detect,
        diagnose: diagnose,
        findInvoiceNumber: findInvoiceNumber,
        findInvoiceAmount: findInvoiceAmount,
        findEnvironment: findEnvironment,
        findIsRental: findIsRental,
        findTradePartnerName: findTradePartnerName,
        detectPageInfo: detectPageInfo,
        findSidebarFields: findSidebarFields,
        isSameDocumentInstance: isSameDocumentInstance,
        isTableVisible: isTableVisible,
        checkRequiredColumns: checkRequiredColumns,
        REQUIRED_TABLE_COLUMNS: REQUIRED_TABLE_COLUMNS,
        PRIMARY_SELECTOR: PRIMARY_SELECTOR
    };
})();

if (typeof window !== 'undefined') {
    window.NanoProAutoDetector = NanoProAutoDetector;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NanoProAutoDetector;
}

