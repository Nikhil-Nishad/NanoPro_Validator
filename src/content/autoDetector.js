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

    const HEADER_PATTERNS = {
        qty: /^(qty|qty_ordered|quantity|line_item_quantity|units|count)$/i,
        price: /^(item_price|unit_price|price|rate|line_item_unit_price|unit_cost)$/i,
        amount: /^(line_amount|amount|total|line_total|line_item_amount|net_amount|item_amount)$/i,
        item_no: /^(item_no|item_no_2|item_number|part_no|part_number|sku|product_id|product_code)$/i,
    };

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

    function buildResult(scope, headers) {
        const columnMapping = mapHeaders(headers);
        const foundCols = Object.entries(columnMapping).filter(([k, v]) => v);

        if (foundCols.length < 2) {
            console.log('[NanoPro AutoDetector] Not enough validation columns mapped:',
                headers.map(h => h.name), '→ mapped:', foundCols.map(([k]) => k));
            return null;
        }

        console.log('[NanoPro AutoDetector] Column mapping:', Object.fromEntries(
            Object.entries(columnMapping).map(([k, v]) => [k, v ? v.name : null])
        ));

        const rows = extractRows(scope, headers, columnMapping);
        if (rows.length === 0) {
            console.log('[NanoPro AutoDetector] No data rows extracted');
            return null;
        }

        console.log(`[NanoPro AutoDetector] Extracted ${rows.length} data rows`);
        return {
            success: true,
            rows: rows,
            columnMapping: columnMapping,
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
            if (c.offsetHeight > 50 && c.querySelectorAll('input[type="text"]').length >= 3) {
                console.log('[NanoPro AutoDetector] S3: shrink-0 > overflow-hidden ✅');
                return c;
            }
        }

        // S4: overflow-auto with many inputs (table area)
        const scrollables = document.querySelectorAll('.overflow-auto');
        for (const s of scrollables) {
            const inputs = s.querySelectorAll('input[type="text"]');
            if (inputs.length >= 6 && s.offsetHeight > 50) {
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
        const allInputs = document.querySelectorAll('input[type="text"]');
        if (allInputs.length >= 6) {
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
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
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

        // Log ALL header X positions (not just mapped ones)
        for (const hdr of headers) {
            const mapped = Object.entries(columnMapping).find(([k, v]) => v && v.name === hdr.name);
            console.log(`[NanoPro AutoDetector] Header "${hdr.name}" centerX: ${Math.round(hdr.centerX)} ${mapped ? '→ ' + mapped[0] : '(unmapped)'}`);
        }

        // Collect ALL data inputs
        const allInputs = container.querySelectorAll('input');
        const dataInputs = [];

        for (const input of allInputs) {
            if (input.classList.contains('MuiAutocomplete-input')) continue;
            if (input.placeholder === 'Select a column label') continue;
            const inputType = (input.type || 'text').toLowerCase();
            if (inputType !== 'text' && inputType !== '' && inputType !== 'search') continue;

            const rect = input.getBoundingClientRect();
            if (rect.top < headerY - 5 || rect.width <= 0 || rect.height <= 0) continue;

            dataInputs.push({
                text: (input.value || '').trim(),
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                rect
            });
        }

        // Fallback: document-wide
        if (!dataInputs.length && container !== document.body) {
            console.log('[NanoPro AutoDetector] No data inputs in container, trying document-wide');
            for (const input of document.querySelectorAll('input')) {
                if (input.classList.contains('MuiAutocomplete-input')) continue;
                if (input.placeholder === 'Select a column label') continue;
                const inputType = (input.type || 'text').toLowerCase();
                if (inputType !== 'text' && inputType !== '' && inputType !== 'search') continue;
                const rect = input.getBoundingClientRect();
                if (rect.top < headerY - 5 || rect.width <= 0 || rect.height <= 0) continue;
                dataInputs.push({
                    text: (input.value || '').trim(),
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                    rect
                });
            }
        }

        console.log(`[NanoPro AutoDetector] Data inputs found: ${dataInputs.length}`);
        if (!dataInputs.length) return [];

        // ═══ COLUMN-FIRST APPROACH ═══
        // Instead of grouping by Y (fragile with many columns),
        // assign each input to its closest header column, then zip by row index.

        // Step 1: Assign each data input to its closest header (by X distance)
        const columnBuckets = {};
        for (const hdr of headers) {
            columnBuckets[hdr.name] = [];
        }

        for (const input of dataInputs) {
            let closestHeader = null, closestDist = Infinity;
            for (const hdr of headers) {
                const dist = Math.abs(input.centerX - hdr.centerX);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestHeader = hdr;
                }
            }
            if (closestHeader && closestDist < 1500) {
                columnBuckets[closestHeader.name].push(input);
            }
        }

        // Step 2: Sort each column bucket by Y (top to bottom = row order)
        for (const name of Object.keys(columnBuckets)) {
            columnBuckets[name].sort((a, b) => a.centerY - b.centerY);
        }

        // Log column assignments
        for (const [name, bucket] of Object.entries(columnBuckets)) {
            console.log(`[NanoPro AutoDetector] Column "${name}": ${bucket.length} cells`, bucket.map(c => `"${c.text}"`));
        }

        // Step 3: Determine row count from the mapped columns we care about
        const mappedColumns = {};
        for (const [type, hdr] of Object.entries(columnMapping)) {
            if (hdr && columnBuckets[hdr.name]) {
                mappedColumns[type] = columnBuckets[hdr.name];
            }
        }

        const rowCount = Math.max(...Object.values(mappedColumns).map(c => c.length), 0);
        if (rowCount === 0) {
            console.log('[NanoPro AutoDetector] No data cells in mapped columns');
            return [];
        }

        // Step 4: Build rows by zipping column data at each row index
        const rows = [];
        for (let i = 0; i < rowCount; i++) {
            const row = { qty: null, price: null, amount: null, item_no: null };

            for (const [type, cells] of Object.entries(mappedColumns)) {
                if (cells[i]) {
                    row[type] = cells[i].text !== undefined && cells[i].text !== null ? cells[i].text : '';
                }
            }

            console.log(`[NanoPro AutoDetector] Row ${i + 1}:`, row);
            if (row.qty || row.price || row.amount) rows.push(row);
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
     */
    function extractElementValue(el) {
        if (!el) return '';
        const input = el.querySelector('input, textarea');
        if (input) return (input.value || '').trim();
        const span = el.querySelector('span');
        if (span) return (span.textContent || '').trim();
        return (el.textContent || '').trim();
    }

    /**
     * Find a sidebar field row container by searching for a label span
     */
    function findSidebarFieldRow(labelName) {
        const target = labelName.toLowerCase().replace(/[\s_-]+/g, '');
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
            const text = (span.textContent || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
            if (text === target) {
                const row = span.closest('[data-index]') || span.closest('.absolute') || span.parentElement?.parentElement;
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
     */
    function findEnvironment() {
        console.log('[NanoPro AutoDetector] Looking for Environment in sidebar...');
        const testIdEls = document.querySelectorAll('[data-testid*="label_box_div_Environment" i], [data-testid*="label_box_div_environment" i]');
        for (const el of testIdEls) {
            const val = extractElementValue(el);
            if (val) {
                console.log(`[NanoPro AutoDetector] Environment found via data-testid: "${val}"`);
                return { value: val, raw: val, selector: 'data-testid' };
            }
        }

        const row = findSidebarFieldRow('Environment');
        if (row) {
            const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
            const val = extractElementValue(ocrDiv || row);
            if (val) {
                console.log(`[NanoPro AutoDetector] Environment found via label scan: "${val}"`);
                return { value: val, raw: val, selector: 'label-scan' };
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

            const val = extractElementValue(el);
            if (val !== '') {
                results.push({
                    value: val,
                    raw: val,
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
                        const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
                        const val = extractElementValue(ocrDiv || row);
                        if (val !== '') {
                            results.push({
                                value: val,
                                raw: val,
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
        const testIdEls = document.querySelectorAll('[data-testid*="label_box_div_trade_partner_name" i]');
        for (const el of testIdEls) {
            const val = extractElementValue(el);
            if (val !== undefined && val !== null) {
                console.log(`[NanoPro AutoDetector] trade_partner_name found via data-testid: "${val}"`);
                return { value: val, raw: val, selector: 'data-testid' };
            }
        }

        const row = findSidebarFieldRow('trade_partner_name') || findSidebarFieldRow('trade partner name');
        if (row) {
            const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
            const val = extractElementValue(ocrDiv || row);
            if (val !== undefined && val !== null) {
                console.log(`[NanoPro AutoDetector] trade_partner_name found via label scan: "${val}"`);
                return { value: val, raw: val, selector: 'label-scan' };
            }
        }

        console.log('[NanoPro AutoDetector] trade_partner_name not found in sidebar');
        return null;
    }

    /**
     * Detect document page info (current page and total pages)
     * Identifies page numbers next to or within spans with text "Page".
     * If page number is not present, defaults to single page (Page 1 of 1).
     */
    function detectPageInfo() {
        try {
            // S1: Nanonets pagination control — <span>Page</span> followed by <input> and <span>of Y</span>
            const allSpans = document.querySelectorAll('span');
            for (const span of allSpans) {
                const text = (span.textContent || '').trim();
                if (/^page$/i.test(text)) {
                    const nextEl = span.nextElementSibling;
                    if (nextEl) {
                        const input = nextEl.tagName === 'INPUT' ? nextEl : nextEl.querySelector('input');
                        if (input) {
                            const curVal = input.value || input.getAttribute('value');
                            const maxVal = input.getAttribute('max') || input.max;
                            // Check sibling after input for "of Y"
                            const afterInput = nextEl.nextElementSibling;
                            const afterText = (afterInput?.textContent || '').trim();
                            const afterMatch = afterText.match(/(?:of|\/)\s*(\d+)/i);

                            const parsedTotal = afterMatch ? parseInt(afterMatch[1], 10) :
                                              (maxVal ? parseInt(maxVal, 10) : 1);
                            const totalPages = (parsedTotal && parsedTotal > 0) ? parsedTotal : 1;
                            const parsedCur = curVal ? parseInt(curVal, 10) : 1;
                            const currentPage = (parsedCur && parsedCur > 0) ? parsedCur : 1;

                            const info = {
                                currentPage: currentPage,
                                totalPages: totalPages,
                                isMultiPage: totalPages > 1,
                                raw: `Page ${currentPage} of ${totalPages}`,
                                source: 'nanonets-pager'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (pager): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }
                }
            }

            // S2: General pattern matching across elements (direct text or siblings)
            const allElements = document.querySelectorAll('span, div, p');
            for (const el of allElements) {
                const text = (el.textContent || '').trim();

                // Direct text "Page 1 of 3", "Page 1 / 3", "Page: 1 of 3"
                const directMatch = text.match(/page\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
                if (directMatch) {
                    const currentPage = parseInt(directMatch[1], 10) || 1;
                    const totalPages = parseInt(directMatch[2], 10) || 1;
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

                // Span has literal text "Page" or "Page:"
                if (/^page\s*[:#]?$/i.test(text)) {
                    const nextEl = el.nextElementSibling;
                    if (nextEl) {
                        const nextText = (nextEl.textContent || '').trim();
                        const siblingMatch = nextText.match(/^(\d+)\s*(?:of|\/)\s*(\d+)/i);
                        if (siblingMatch) {
                            const currentPage = parseInt(siblingMatch[1], 10) || 1;
                            const totalPages = parseInt(siblingMatch[2], 10) || 1;
                            const info = {
                                currentPage: currentPage,
                                totalPages: totalPages,
                                isMultiPage: totalPages > 1,
                                raw: `Page ${currentPage} of ${totalPages}`,
                                source: 'next-sibling'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (sibling): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }

                    const parent = el.parentElement;
                    if (parent) {
                        const parentText = (parent.textContent || '').trim();
                        const pMatch = parentText.match(/page\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) ||
                                      parentText.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
                        if (pMatch) {
                            const currentPage = parseInt(pMatch[1], 10) || 1;
                            const totalPages = parseInt(pMatch[2], 10) || 1;
                            const info = {
                                currentPage: currentPage,
                                totalPages: totalPages,
                                isMultiPage: totalPages > 1,
                                raw: `Page ${currentPage} of ${totalPages}`,
                                source: 'parent-text'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (parent): Current=${info.currentPage}, Total=${info.totalPages}`);
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
            invoiceAmount: findInvoiceAmount(),
            environment: findEnvironment(),
            isRental: findIsRental(),
            tradePartnerName: findTradePartnerName(),
            pageInfo: detectPageInfo()
        };
    }

    function isTableVisible() {
        const el = document.querySelector('[data-rbd-droppable-id]') ||
            document.querySelector(PRIMARY_SELECTOR);
        return el ? el.offsetHeight > 0 : false;
    }

    return {
        detect: detect,
        diagnose: diagnose,
        findInvoiceAmount: findInvoiceAmount,
        findEnvironment: findEnvironment,
        findIsRental: findIsRental,
        findTradePartnerName: findTradePartnerName,
        detectPageInfo: detectPageInfo,
        findSidebarFields: findSidebarFields,
        isTableVisible: isTableVisible,
        PRIMARY_SELECTOR: PRIMARY_SELECTOR
    };
})();

if (typeof window !== 'undefined') {
    window.NanoProAutoDetector = NanoProAutoDetector;
}
