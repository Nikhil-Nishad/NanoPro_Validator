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

    const HEADER_PATTERNS = {
        qty: /^(qty|quantity|units|count)$/i,
        price: /^(item_price|unit_price|price|rate|unit_cost)$/i,
        amount: /^(line_amount|amount|total|line_total|net_amount|item_amount)$/i,
        item_no: /^(item_no|item_number|part_no|sku)$/i,
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

        // Pass 1: Look for exact preferred header matches (e.g. "Qty", "Item_Price", "Line_Amount", "Item_No")
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
            if (EXCLUDED_HEADERS.test(norm)) continue;

            if (!mapping.qty && norm === 'qty') mapping.qty = header;
            if (!mapping.price && norm === 'item_price') mapping.price = header;
            if (!mapping.amount && norm === 'line_amount') mapping.amount = header;
            if (!mapping.item_no && norm === 'item_no') mapping.item_no = header;
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
                    if (inputCenterX >= (hdr.rect.left - 4) && inputCenterX <= (hdr.rect.right + 4)) {
                        return hdr;
                    }
                }
            }
            // Second pass: Closest header by center X
            let closestHdr = null;
            let closestDist = Infinity;
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
                const inputs = Array.from(rowEl.querySelectorAll('input'));
                const row = { qty: null, price: null, amount: null, item_no: null };

                for (const input of inputs) {
                    if (input.classList.contains('MuiAutocomplete-input')) continue;
                    if (input.placeholder === 'Select a column label') continue;
                    const inputType = (input.type || 'text').toLowerCase();
                    if (inputType !== 'text' && inputType !== '' && inputType !== 'search' && inputType !== 'number') continue;

                    const rect = input.getBoundingClientRect();
                    const centerX = rect.width > 0 ? (rect.left + rect.width / 2) : 0;
                    const matchedHdr = getHeaderForInput(centerX);

                    if (matchedHdr) {
                        const val = (input.value !== undefined && input.value !== null) ? input.value.trim() : '';
                        assignCell(row, matchedHdr, val);
                    }
                }

                // If row has any data or is identified, retain it
                const hasAnyData = row.qty !== null || row.price !== null || row.amount !== null || row.item_no !== null;
                if (hasAnyData) {
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
            if (hasAnyData && (row.qty || row.price || row.amount || row.item_no)) {
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
    function extractElementValue(el, labelToExclude = null) {
        if (!el) return '';
        const input = el.querySelector('input, textarea');
        if (input) return (input.value || '').trim();

        // Priority 1: .ocr_text or specific OCR element
        const ocr = el.classList?.contains('ocr_text') ? el : el.querySelector('.ocr_text');
        if (ocr) {
            const ocrVal = (ocr.textContent || '').trim();
            if (ocrVal) return ocrVal;
        }

        // Priority 2: [data-testid*="label_box_div"] or [data-testid*="ocr"]
        const testIdBox = el.querySelector('[data-testid*="label_box_div"], [data-testid*="ocr"]');
        if (testIdBox && testIdBox !== el) {
            const boxVal = (testIdBox.textContent || '').trim();
            if (boxVal) return boxVal;
        }

        // Priority 3: spans, excluding any span that is just the label
        const normLabel = labelToExclude ? labelToExclude.toLowerCase().replace(/[\s_-]+/g, '') : null;
        const spans = el.querySelectorAll('span');
        for (const span of spans) {
            const text = (span.textContent || '').trim();
            if (!text) continue;
            if (normLabel && text.toLowerCase().replace(/[\s_-]+/g, '') === normLabel) {
                continue; // Skip the label text span
            }
            return text;
        }

        // Fallback: entire text content excluding label
        const fullText = (el.textContent || '').trim();
        if (normLabel && fullText.toLowerCase().replace(/[\s_-]+/g, '') === normLabel) {
            return '';
        }
        return fullText;
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
            const val = extractElementValue(el, 'Environment');
            if (val && val.toLowerCase() !== 'environment') {
                console.log(`[NanoPro AutoDetector] Environment found via data-testid: "${val}"`);
                return { value: val, raw: val, selector: 'data-testid' };
            }
        }

        const row = findSidebarFieldRow('Environment');
        if (row) {
            const ocrDiv = row.querySelector('.ocr_text, [data-testid*="label_box_div"]');
            let val = ocrDiv ? extractElementValue(ocrDiv, 'Environment') : '';
            if (!val || val.toLowerCase() === 'environment') {
                val = extractElementValue(row, 'Environment');
            }
            if (val && val.toLowerCase() !== 'environment') {
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
     * Prioritizes active interactive pagers, URL params, and active thumbnail highlights.
     * Prevents false matches from static thumbnail 1 in document order.
     */
    function detectPageInfo() {
        try {
            // S1: Active Pager Control — <input> element used for pagination (interactive viewer)
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                // Never treat table cells, rows, droppable grid inputs, or extension overlay inputs as pager control
                if (input.closest('table, [role="table"], [role="row"], [class*="table" i], [class*="grid" i], [data-rbd-droppable-id], .nanopro-overlay, #nanopro-root, .nanopro-panel')) {
                    continue;
                }

                const curValStr = (input.value || input.getAttribute('value') || '').trim();
                const curNum = parseInt(curValStr, 10);
                if (!isNaN(curNum) && curNum > 0 && curNum <= 9999) {
                    // Check if this input is a pager input
                    const maxVal = input.getAttribute('max') || input.max;
                    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
                    const inputClass = (input.className || '').toLowerCase();
                    const inputName = (input.name || '').toLowerCase();
                    const inputId = (input.id || '').toLowerCase();
                    const isInsidePagerContainer = !!input.closest('[role="toolbar"], [class*="toolbar" i], [class*="footer" i], [class*="pager" i], [class*="pagination" i], [class*="viewer" i]');
                    const isPagerInput = ariaLabel.includes('page') || ariaLabel.includes('pager') ||
                                         inputClass.includes('page') || inputClass.includes('pager') ||
                                         inputName.includes('page') || inputId.includes('page') ||
                                         isInsidePagerContainer;

                    // Check sibling element for "of Y" or "/ Y"
                    const nextEl = input.nextElementSibling;
                    const nextText = (nextEl?.textContent || '').trim();
                    const siblingMatch = nextText.match(/(?:of|\/)\s*(\d+)/i);

                    // Check parent text for "of Y" or "/ Y"
                    const parent = input.parentElement;
                    const parentText = (parent?.textContent || '').trim();
                    const parentMatch = parentText.match(/(?:of|\/)\s*(\d+)/i);

                    const totalMatch = siblingMatch || parentMatch;
                    if (isPagerInput && (totalMatch || maxVal)) {
                        const total = totalMatch ? parseInt(totalMatch[1], 10) : parseInt(maxVal, 10);
                        if (total && total > 0) {
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

            // S2: URL Query or Hash page parameters
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

            // S3: Active / Selected Page Thumbnail in sidebar
            const activeThumbnailSelectors = [
                '[aria-selected="true"]',
                '[data-selected="true"]',
                '[class*="selected" i]',
                '[class*="active" i]',
                '[class*="border-blue" i]',
                '[class*="ring-blue" i]'
            ];
            for (const sel of activeThumbnailSelectors) {
                const activeEls = document.querySelectorAll(sel);
                for (const el of activeEls) {
                    const text = (el.textContent || '').trim();
                    const match = text.match(/page\s*[:#]?\s*(\d+)(?:\s*(?:of|\/)\s*(\d+))?/i) ||
                                  text.match(/^(\d+)(?:\s*(?:of|\/)\s*(\d+))?$/);
                    if (match) {
                        const cur = parseInt(match[1], 10);
                        if (cur > 0) {
                            let total = match[2] ? parseInt(match[2], 10) : null;
                            if (!total) {
                                const parentList = el.closest('[role="list"], [role="tablist"], .overflow-auto, [class*="thumbnail" i], [class*="pages" i]');
                                if (parentList) {
                                    const cleanSel = sel.replace(/\[aria-selected="true"\]|\[data-selected="true"\]/, '').trim();
                                    let siblingThumbs = [];
                                    if (cleanSel.length > 0) {
                                        try {
                                            siblingThumbs = parentList.querySelectorAll(cleanSel);
                                        } catch (e) {}
                                    }
                                    if (siblingThumbs.length <= 1) {
                                        try {
                                            siblingThumbs = parentList.querySelectorAll('[role="listitem"], [role="tab"], [class*="thumbnail" i], [class*="page" i]');
                                        } catch (e) {}
                                    }
                                    if (siblingThumbs.length > 1) {
                                        total = siblingThumbs.length;
                                    }
                                }
                            }
                            const totalPages = (total && total > 0) ? total : Math.max(cur, 1);
                            const info = {
                                currentPage: cur,
                                totalPages: totalPages,
                                isMultiPage: totalPages > 1,
                                raw: `Page ${cur} of ${totalPages}`,
                                source: 'active-thumbnail'
                            };
                            console.log(`[NanoPro AutoDetector] Page info detected (active-thumbnail): Current=${info.currentPage}, Total=${info.totalPages}`);
                            return info;
                        }
                    }
                }
            }

            // S4: Viewer Toolbar / Header / Footer text (outside thumbnail sidebar)
            const toolbarEls = document.querySelectorAll('[role="toolbar"], header, nav, [class*="toolbar" i], [class*="footer" i], [class*="header" i], [class*="viewer" i], [class*="pager" i], [class*="pagination" i]');
            for (const tb of toolbarEls) {
                const text = (tb.textContent || '').trim();
                const match = text.match(/page\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) ||
                              text.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
                if (match) {
                    const currentPage = parseInt(match[1], 10) || 1;
                    const totalPages = parseInt(match[2], 10) || 1;
                    const info = {
                        currentPage: currentPage,
                        totalPages: totalPages,
                        isMultiPage: totalPages > 1,
                        raw: `Page ${currentPage} of ${totalPages}`,
                        source: 'toolbar-text'
                    };
                    console.log(`[NanoPro AutoDetector] Page info detected (toolbar): Current=${info.currentPage}, Total=${info.totalPages}`);
                    return info;
                }
            }

            // S5: General pattern matching across leaf elements (excluding inactive thumbnail containers)
            const allSpans = document.querySelectorAll('span, div, p');
            for (const el of allSpans) {
                if (el.children.length > 0) continue;
                if (el.closest('[class*="thumbnail" i]:not([class*="selected" i]):not([class*="active" i])')) continue;

                const text = (el.textContent || '').trim();
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
        PRIMARY_SELECTOR: PRIMARY_SELECTOR
    };
})();

if (typeof window !== 'undefined') {
    window.NanoProAutoDetector = NanoProAutoDetector;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NanoProAutoDetector;
}

