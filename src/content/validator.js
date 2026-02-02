/**
 * NanoPro Validator - Calculation Validation Engine
 * 
 * Validates line item calculations:
 * quantity × item_price = line_amount
 * 
 * Handles:
 * - Rounding tolerance
 * - Missing values
 * - Invalid calculations
 */

const NanoProValidator = (function () {
    'use strict';

    // Validation configuration
    const CONFIG = {
        tolerance: 0.05,        // Tolerance for floating point comparison (5 cents)
        strictMode: false,      // If true, exact match required
        allowNegative: true     // Allow negative values (credits/returns)
    };

    /**
     * Validation result status codes
     */
    const STATUS = {
        VALID: 'VALID',
        INVALID: 'INVALID',
        INCOMPLETE: 'INCOMPLETE',
        SKIPPED: 'SKIPPED'
    };

    /**
     * Validate a single row
     * 
     * @param {Object} row - Row object with qty, price, amount
     * @param {number} tolerance - Tolerance for comparison
     * @returns {Object} Validation result
     */
    function validateRow(row, tolerance = CONFIG.tolerance) {
        // Check for missing values
        const missing = [];
        if (!row.qty || row.qty.value === null) missing.push('qty');
        if (!row.price || row.price.value === null) missing.push('price');
        if (!row.amount || row.amount.value === null) missing.push('amount');

        if (missing.length > 0) {
            return {
                status: STATUS.INCOMPLETE,
                missing: missing,
                message: `Missing values: ${missing.join(', ')}`
            };
        }

        const qty = row.qty.value;
        const price = row.price.value;
        const amount = row.amount.value;

        // Calculate expected amount
        const expected = NanoProParser.round(qty * price, 2);
        const actual = NanoProParser.round(amount, 2);
        const difference = NanoProParser.round(Math.abs(expected - actual), 2);

        // Check if within tolerance
        const isValid = difference <= tolerance;

        if (isValid) {
            return {
                status: STATUS.VALID,
                qty: qty,
                price: price,
                expected: expected,
                actual: actual,
                difference: 0,
                confidence: Math.min(
                    row.qty.confidence || 1,
                    row.price.confidence || 1,
                    row.amount.confidence || 1
                )
            };
        }

        return {
            status: STATUS.INVALID,
            qty: qty,
            price: price,
            expected: expected,
            actual: actual,
            difference: difference,
            percentError: NanoProParser.round((difference / Math.abs(expected || 1)) * 100, 2),
            confidence: Math.min(
                row.qty.confidence || 1,
                row.price.confidence || 1,
                row.amount.confidence || 1
            )
        };
    }

    /**
     * Validate all rows
     * 
     * @param {Array} rows - Array of row objects
     * @param {number} tolerance - Tolerance for comparison
     * @returns {Object} Validation summary
     */
    function validateAll(rows, tolerance = CONFIG.tolerance) {
        if (!rows || rows.length === 0) {
            return {
                success: false,
                error: 'NO_ROWS',
                message: 'No rows to validate'
            };
        }

        const results = rows.map((row, index) => ({
            rowIndex: index,
            rowNumber: index + 1, // Human-readable row number
            ...validateRow(row, tolerance),
            originalRow: row
        }));

        // Categorize results
        const valid = results.filter(r => r.status === STATUS.VALID);
        const invalid = results.filter(r => r.status === STATUS.INVALID);
        const incomplete = results.filter(r => r.status === STATUS.INCOMPLETE);

        // Calculate overall status
        let overallStatus;
        if (invalid.length > 0) {
            overallStatus = 'HAS_ERRORS';
        } else if (incomplete.length > 0) {
            overallStatus = 'INCOMPLETE_DATA';
        } else {
            overallStatus = 'ALL_VALID';
        }

        return {
            success: true,
            overallStatus: overallStatus,
            summary: {
                total: results.length,
                valid: valid.length,
                invalid: invalid.length,
                incomplete: incomplete.length
            },
            results: results,
            validRows: valid,
            invalidRows: invalid,
            incompleteRows: incomplete,
            timestamp: Date.now()
        };
    }

    /**
     * Quick check if all rows are valid
     */
    function isAllValid(rows, tolerance = CONFIG.tolerance) {
        return rows.every(row => validateRow(row, tolerance).status === STATUS.VALID);
    }

    /**
     * Get only invalid rows
     */
    function getInvalidRows(rows, tolerance = CONFIG.tolerance) {
        return rows
            .map((row, index) => ({ index, ...validateRow(row, tolerance), row }))
            .filter(r => r.status === STATUS.INVALID);
    }

    /**
     * Calculate statistics about the validation
     */
    function getStatistics(validationResult) {
        if (!validationResult.success) return null;

        const { validRows, invalidRows, incompleteRows } = validationResult;

        // Analyze valid rows for patterns
        const prices = validRows.map(r => r.price).filter(p => p !== null);
        const quantities = validRows.map(r => r.qty).filter(q => q !== null);
        const amounts = validRows.map(r => r.actual).filter(a => a !== null);

        return {
            priceStats: calculateStats(prices),
            qtyStats: calculateStats(quantities),
            amountStats: calculateStats(amounts),
            errorRate: invalidRows.length / validationResult.summary.total,
            totalDifference: invalidRows.reduce((sum, r) => sum + (r.difference || 0), 0)
        };
    }

    /**
     * Calculate basic statistics for an array of numbers
     */
    function calculateStats(values) {
        if (values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);

        return {
            count: values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            sum: NanoProParser.round(sum, 2),
            mean: NanoProParser.round(sum / values.length, 2),
            median: sorted[Math.floor(sorted.length / 2)]
        };
    }

    /**
     * Set configuration options
     */
    function configure(options) {
        Object.assign(CONFIG, options);
    }

    // Public API
    return {
        validateRow,
        validateAll,
        isAllValid,
        getInvalidRows,
        getStatistics,
        configure,
        STATUS,
        CONFIG
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NanoProValidator = NanoProValidator;
}
