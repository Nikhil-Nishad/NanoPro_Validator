/**
 * NanoPro Table Parser
 * 
 * Parses extracted text into a structured table format.
 * Uses smart grid detection and column identification.
 * 
 * Features:
 * - Recognizes "#" as row number column
 * - Fuzzy matching for OCR errors on column names
 * - Smart row separation using gaps
 * - Multi-row support
 */

const NanoProTableParser = (function () {
    'use strict';

    // Exact column names from Nanonets
    const PRIMARY_COLUMNS = {
        rowNum: ['#', 'no', 'no.', 's.no', 'sno', 'sr.no', 'sl.no'],
        qty: ['qty', 'qty_ordered', 'quantity'],
        price: ['item_price', 'unit_price', 'price', 'rate'],
        amount: ['line_amount', 'amount', 'total', 'line_total']
    };

    // All known column names (to skip during validation)
    const SKIP_COLUMNS = [
        '#', 'computations', 'cyl_returned', 'cyl_shipped', 'description',
        'item_no', 'item_no_2', 'unit_of_measure'
    ];

    // Fuzzy patterns for OCR tolerance
    const FUZZY_PATTERNS = {
        rowNum: [/^#$/i, /^no\.?$/i, /^s\.?no\.?$/i, /^sr\.?no\.?$/i],
        qty: [
            /^qty$/i,
            /^qty[_\s]?ordered$/i,
            /^q[ty]{1,2}$/i,
            /^quantity$/i
        ],
        price: [
            /^item[_\s]?price$/i,
            /^unit[_\s]?price$/i,
            /^[il]tem[_\s]?pr[il]ce$/i,
            /^price$/i,
            /^rate$/i
        ],
        amount: [
            /^line[_\s]?amount$/i,
            /^line[_\s]?am[o0]unt$/i,
            /^l[il]ne[_\s]?amount$/i,
            /^amount$/i,
            /^total$/i,
            /^line[_\s]?total$/i
        ]
    };

    /**
     * Levenshtein distance for fuzzy matching
     */
    function levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    /**
     * Match text to column type with fuzzy tolerance
     */
    function matchesColumnType(text, columnType) {
        const normalized = text.toLowerCase().replace(/\s+/g, '_').trim();

        // Check exact matches
        const exactMatches = PRIMARY_COLUMNS[columnType] || [];
        for (const exact of exactMatches) {
            if (normalized === exact || normalized.replace(/_/g, '') === exact.replace(/_/g, '')) {
                return { match: true, confidence: 1.0, method: 'exact' };
            }
        }

        // Check regex patterns
        const patterns = FUZZY_PATTERNS[columnType] || [];
        for (const pattern of patterns) {
            if (pattern.test(normalized)) {
                return { match: true, confidence: 0.9, method: 'pattern' };
            }
        }

        // Levenshtein distance (max 2 chars)
        for (const exact of exactMatches) {
            if (exact.length >= 3 && levenshtein(normalized, exact) <= 2) {
                return { match: true, confidence: 0.7, method: 'fuzzy' };
            }
        }

        return { match: false, confidence: 0 };
    }

    /**
     * Parse extracted text elements into a table structure
     */
    function parseTable(textElements) {
        if (!textElements || textElements.length === 0) {
            return { success: false, error: 'No text elements to parse' };
        }

        console.log('[NanoPro TableParser] Parsing', textElements.length, 'text elements');

        // Filter noise
        const filtered = textElements.filter(el =>
            el.text.trim().length > 0 &&
            el.text.length < 200 &&
            el.width > 3 &&
            el.height > 3
        );

        if (filtered.length < 3) {
            return { success: false, error: 'Too few text elements' };
        }

        // Step 1: Detect rows using gap analysis
        const rows = detectRowsSmartly(filtered);
        console.log('[NanoPro TableParser] Detected', rows.length, 'rows');

        if (rows.length < 2) {
            return { success: false, error: 'Need at least 2 rows (header + data)' };
        }

        // Step 2: Detect column structure
        const columns = detectColumnsSmartly(filtered, rows);
        console.log('[NanoPro TableParser] Detected', columns.length, 'columns');

        // Step 3: Map to table grid
        const tableData = mapToTableGrid(rows, columns);

        // Step 4: Identify columns
        const columnMapping = identifyColumns(tableData, columns);
        console.log('[NanoPro TableParser] Column mapping:', columnMapping);

        return {
            success: true,
            rows: tableData,
            columns: columns,
            columnMapping: columnMapping
        };
    }

    /**
     * Detect rows using gap analysis between Y positions
     */
    function detectRowsSmartly(elements) {
        // Sort by Y position
        const sorted = [...elements].sort((a, b) => a.centerY - b.centerY);

        // Collect Y positions
        const yPositions = sorted.map(el => el.centerY);

        // Calculate gaps between consecutive elements
        const gaps = [];
        for (let i = 1; i < yPositions.length; i++) {
            gaps.push({
                index: i,
                gap: yPositions[i] - yPositions[i - 1],
                y: yPositions[i - 1]
            });
        }

        // Calculate statistics
        const avgGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length || 10;
        const avgHeight = elements.reduce((sum, el) => sum + el.height, 0) / elements.length;

        // Row break threshold: larger gaps indicate new rows
        const rowBreakThreshold = Math.max(avgHeight * 0.7, avgGap * 1.5, 15);

        console.log('[NanoPro TableParser] Row detection - avgGap:', avgGap.toFixed(1),
            'avgHeight:', avgHeight.toFixed(1), 'threshold:', rowBreakThreshold.toFixed(1));

        // Group into rows
        const rows = [];
        let currentRow = {
            elements: [sorted[0]],
            minY: sorted[0].y,
            maxY: sorted[0].y + sorted[0].height,
            avgY: sorted[0].centerY
        };

        for (let i = 1; i < sorted.length; i++) {
            const el = sorted[i];
            const gap = el.centerY - currentRow.avgY;

            if (gap > rowBreakThreshold) {
                // Start new row
                currentRow.elements.sort((a, b) => a.centerX - b.centerX);
                rows.push(currentRow);
                currentRow = {
                    elements: [el],
                    minY: el.y,
                    maxY: el.y + el.height,
                    avgY: el.centerY
                };
            } else {
                // Same row
                currentRow.elements.push(el);
                currentRow.minY = Math.min(currentRow.minY, el.y);
                currentRow.maxY = Math.max(currentRow.maxY, el.y + el.height);
                // Recalculate average Y
                currentRow.avgY = currentRow.elements.reduce((sum, e) => sum + e.centerY, 0) / currentRow.elements.length;
            }
        }

        // Finalize last row
        currentRow.elements.sort((a, b) => a.centerX - b.centerX);
        rows.push(currentRow);

        return rows;
    }

    /**
     * Detect columns using gap analysis between X positions
     */
    function detectColumnsSmartly(elements, rows) {
        // Use the header row (first row) as reference for column positions
        const headerRow = rows[0];
        if (!headerRow || !headerRow.elements.length) {
            return detectColumnsByXClustering(elements);
        }

        // Get X positions from header elements
        const columns = headerRow.elements.map((el, idx) => ({
            index: idx,
            xMin: el.x - 20,
            xMax: el.x + el.width + 20,
            center: el.centerX,
            headerText: el.text
        }));

        // Expand column boundaries based on all data
        for (const el of elements) {
            for (const col of columns) {
                if (el.centerX >= col.xMin && el.centerX <= col.xMax) {
                    col.xMin = Math.min(col.xMin, el.x - 5);
                    col.xMax = Math.max(col.xMax, el.x + el.width + 5);
                    break;
                }
            }
        }

        // Sort columns left to right
        columns.sort((a, b) => a.center - b.center);

        return columns;
    }

    /**
     * Fallback: Detect columns by X clustering
     */
    function detectColumnsByXClustering(elements) {
        const centers = elements.map(el => el.centerX);
        const avgWidth = elements.reduce((sum, el) => sum + el.width, 0) / elements.length;
        const tolerance = Math.max(40, avgWidth * 0.8);

        const sorted = [...centers].sort((a, b) => a - b);
        const clusters = [];
        let currentCluster = { values: [sorted[0]], min: sorted[0], max: sorted[0] };

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - currentCluster.max <= tolerance) {
                currentCluster.values.push(sorted[i]);
                currentCluster.max = sorted[i];
            } else {
                currentCluster.center = currentCluster.values.reduce((a, b) => a + b, 0) / currentCluster.values.length;
                clusters.push(currentCluster);
                currentCluster = { values: [sorted[i]], min: sorted[i], max: sorted[i] };
            }
        }
        currentCluster.center = currentCluster.values.reduce((a, b) => a + b, 0) / currentCluster.values.length;
        clusters.push(currentCluster);

        return clusters.map((c, i) => ({
            index: i,
            xMin: c.min - 30,
            xMax: c.max + 30,
            center: c.center
        }));
    }

    /**
     * Map elements to table grid
     */
    function mapToTableGrid(rows, columns) {
        return rows.map((row, rowIndex) => {
            const cells = new Array(columns.length).fill(null);

            for (const el of row.elements) {
                // Find best matching column
                let bestCol = -1;
                let bestDist = Infinity;

                for (let i = 0; i < columns.length; i++) {
                    const col = columns[i];
                    if (el.centerX >= col.xMin && el.centerX <= col.xMax) {
                        const dist = Math.abs(el.centerX - col.center);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestCol = i;
                        }
                    }
                }

                if (bestCol >= 0) {
                    // Prefer longer text or first occurrence
                    if (cells[bestCol] === null) {
                        cells[bestCol] = {
                            text: el.text.trim(),
                            value: parseNumeric(el.text),
                            x: el.centerX,
                            y: el.centerY
                        };
                    } else if (el.text.length > cells[bestCol].text.length) {
                        cells[bestCol] = {
                            text: el.text.trim(),
                            value: parseNumeric(el.text),
                            x: el.centerX,
                            y: el.centerY
                        };
                    }
                }
            }

            return { index: rowIndex, y: row.avgY, cells };
        });
    }

    /**
     * Parse text as number
     */
    function parseNumeric(text) {
        if (!text) return null;

        let cleaned = text
            .replace(/[$€£¥₹₽,]/g, '')
            .replace(/\s/g, '')
            .trim();

        if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
            cleaned = '-' + cleaned.slice(1, -1);
        }

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Identify columns by header matching
     */
    function identifyColumns(tableData, columns) {
        if (tableData.length === 0 || columns.length === 0) return null;

        const headerRow = tableData[0];
        const mapping = { qty: null, price: null, amount: null, rowNum: null };

        console.log('[NanoPro TableParser] Header texts:',
            headerRow.cells.map((c, i) => `${i}:"${c?.text || ''}"`).join(', '));

        // Match each header
        for (let i = 0; i < headerRow.cells.length; i++) {
            const cell = headerRow.cells[i];
            if (!cell || !cell.text) continue;

            const text = cell.text;

            // Check each column type
            for (const columnType of ['rowNum', 'qty', 'price', 'amount']) {
                if (mapping[columnType] !== null) continue;

                const result = matchesColumnType(text, columnType);
                if (result.match) {
                    console.log(`[NanoPro] Matched "${text}" as ${columnType} (${result.method})`);
                    mapping[columnType] = i;
                    break;
                }
            }
        }

        // Fallback: infer from data patterns if headers not found
        if (mapping.qty === null || mapping.price === null || mapping.amount === null) {
            console.log('[NanoPro] Some columns not identified, trying data analysis...');
            inferFromData(tableData, mapping);
        }

        return mapping;
    }

    /**
     * Infer column types from data patterns
     */
    function inferFromData(tableData, mapping) {
        const dataRows = tableData.slice(1);
        if (dataRows.length === 0) return;

        const numColumns = Math.max(...tableData.map(r => r.cells.length));
        const colStats = [];

        for (let col = 0; col < numColumns; col++) {
            if (Object.values(mapping).includes(col)) continue;

            const values = dataRows
                .map(r => r.cells[col]?.value)
                .filter(v => v !== null && v !== undefined);

            if (values.length === 0) {
                colStats.push({ col, hasNumbers: false });
                continue;
            }

            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const max = Math.max(...values);
            const isInteger = values.every(v => Number.isInteger(v));
            const isSmall = max < 1000 && avg < 100;

            colStats.push({ col, hasNumbers: true, avg, max, isInteger, isSmall });
        }

        const numericCols = colStats.filter(c => c.hasNumbers);

        // Qty: small integers
        if (mapping.qty === null) {
            const qtyCandidate = numericCols.find(c => c.isInteger && c.isSmall);
            if (qtyCandidate) {
                mapping.qty = qtyCandidate.col;
                console.log(`[NanoPro] Inferred Qty at column ${qtyCandidate.col}`);
            }
        }

        // Amount: largest values (rightmost numeric typically)
        if (mapping.amount === null) {
            const remaining = numericCols.filter(c => c.col !== mapping.qty);
            const amountCandidate = remaining.sort((a, b) => b.avg - a.avg)[0];
            if (amountCandidate) {
                mapping.amount = amountCandidate.col;
                console.log(`[NanoPro] Inferred Amount at column ${amountCandidate.col}`);
            }
        }

        // Price: remaining numeric
        if (mapping.price === null) {
            const priceCandidate = numericCols.find(c =>
                c.col !== mapping.qty && c.col !== mapping.amount
            );
            if (priceCandidate) {
                mapping.price = priceCandidate.col;
                console.log(`[NanoPro] Inferred Price at column ${priceCandidate.col}`);
            }
        }
    }

    /**
     * Extract validation rows from parsed table
     */
    function extractValidationRows(tableData, columnMapping) {
        if (!columnMapping ||
            columnMapping.qty === null ||
            columnMapping.price === null ||
            columnMapping.amount === null) {
            return {
                success: false,
                error: 'Could not identify Qty, Price, Amount columns',
                mapping: columnMapping
            };
        }

        // Skip header row
        const dataRows = tableData.slice(1);

        const validationRows = dataRows.map((row, index) => {
            const qtyCell = row.cells[columnMapping.qty];
            const priceCell = row.cells[columnMapping.price];
            const amountCell = row.cells[columnMapping.amount];

            // Get row number if available
            let rowNumber = index + 1;
            if (columnMapping.rowNum !== null) {
                const rowNumCell = row.cells[columnMapping.rowNum];
                if (rowNumCell?.value) {
                    rowNumber = rowNumCell.value;
                }
            }

            return {
                index: index,
                displayRowNum: rowNumber,
                qty: qtyCell?.value !== null && qtyCell?.value !== undefined ? {
                    value: qtyCell.value,
                    text: qtyCell.text
                } : null,
                price: priceCell?.value !== null && priceCell?.value !== undefined ? {
                    value: priceCell.value,
                    text: priceCell.text
                } : null,
                amount: amountCell?.value !== null && amountCell?.value !== undefined ? {
                    value: amountCell.value,
                    text: amountCell.text
                } : null,
                isComplete: qtyCell?.value !== null && qtyCell?.value !== undefined &&
                    priceCell?.value !== null && priceCell?.value !== undefined &&
                    amountCell?.value !== null && amountCell?.value !== undefined
            };
        });

        // Filter empty rows
        const nonEmpty = validationRows.filter(row =>
            row.qty !== null || row.price !== null || row.amount !== null
        );

        console.log(`[NanoPro TableParser] Extracted ${nonEmpty.length} validation rows`);

        return { success: true, rows: nonEmpty };
    }

    // Public API
    return {
        parseTable: parseTable,
        extractValidationRows: extractValidationRows,
        matchesColumnType: matchesColumnType
    };

})();

// Export
if (typeof window !== 'undefined') {
    window.NanoProTableParser = NanoProTableParser;
}
