/**
 * NanoPro Suggester - Smart Correction Suggestions
 * 
 * For each invalid row, generates 3 possible corrections:
 * 1. Fix Amount (qty × price = new_amount)
 * 2. Fix Quantity (amount ÷ price = new_qty)
 * 3. Fix Price (amount ÷ qty = new_price)
 * 
 * Each suggestion includes a confidence score based on:
 * - Pattern matching with valid rows
 * - Plausibility of the corrected value
 * - Magnitude of the correction
 */

const NanoProSuggester = (function () {
    'use strict';

    /**
     * Suggester class
     */
    class Suggester {
        constructor() {
            this.patterns = null;
            this.validRows = [];
        }

        /**
         * Analyze patterns from valid rows
         * Called before generating suggestions
         */
        analyzePatterns(validRows) {
            this.validRows = validRows;

            if (validRows.length === 0) {
                this.patterns = {
                    commonPrices: [],
                    commonQuantities: [],
                    priceRange: { min: 0, max: Infinity },
                    qtyRange: { min: 0, max: Infinity },
                    avgPrice: null,
                    avgQty: null,
                    medianPrice: null,
                    medianQty: null
                };
                return this.patterns;
            }

            const prices = validRows.map(r => r.price).filter(p => p !== null);
            const quantities = validRows.map(r => r.qty).filter(q => q !== null);

            this.patterns = {
                commonPrices: this.findFrequent(prices, 3),
                commonQuantities: this.findFrequent(quantities, 3),
                priceRange: {
                    min: Math.min(...prices),
                    max: Math.max(...prices)
                },
                qtyRange: {
                    min: Math.min(...quantities),
                    max: Math.max(...quantities)
                },
                avgPrice: this.average(prices),
                avgQty: this.average(quantities),
                medianPrice: this.median(prices),
                medianQty: this.median(quantities)
            };

            return this.patterns;
        }

        /**
         * Generate 3 suggestions for an invalid row
         * 
         * @param {Object} invalidRow - Row with validation error
         * @returns {Array} Array of 3 suggestions, sorted by confidence
         */
        suggest(invalidRow) {
            const qty = invalidRow.qty;
            const price = invalidRow.price;
            const amount = invalidRow.actual;

            const suggestions = [];

            // Suggestion 1: Fix Amount
            // Assume qty and price are correct, recalculate amount
            if (qty !== null && price !== null) {
                const correctAmount = NanoProParser.round(qty * price, 2);
                suggestions.push({
                    id: 'fix_amount',
                    field: 'amount',
                    fieldLabel: 'Line Amount',
                    currentValue: amount,
                    suggestedValue: correctAmount,
                    difference: NanoProParser.round(Math.abs(amount - correctAmount), 2),
                    confidence: this.scoreAmountFix(qty, price, amount, correctAmount),
                    explanation: `If Qty (${qty}) and Price (${NanoProParser.formatNumber(price)}) are correct, Amount should be ${NanoProParser.formatNumber(correctAmount)}`
                });
            }

            // Suggestion 2: Fix Quantity
            // Assume price and amount are correct, recalculate qty
            if (price !== null && price !== 0 && amount !== null) {
                const correctQty = NanoProParser.round(amount / price, 2);
                suggestions.push({
                    id: 'fix_qty',
                    field: 'qty',
                    fieldLabel: 'Quantity',
                    currentValue: qty,
                    suggestedValue: correctQty,
                    difference: NanoProParser.round(Math.abs(qty - correctQty), 2),
                    confidence: this.scoreQtyFix(qty, price, amount, correctQty),
                    explanation: `If Price (${NanoProParser.formatNumber(price)}) and Amount (${NanoProParser.formatNumber(amount)}) are correct, Qty should be ${correctQty}`
                });
            }

            // Suggestion 3: Fix Price
            // Assume qty and amount are correct, recalculate price
            if (qty !== null && qty !== 0 && amount !== null) {
                const correctPrice = NanoProParser.round(amount / qty, 2);
                suggestions.push({
                    id: 'fix_price',
                    field: 'price',
                    fieldLabel: 'Unit Price',
                    currentValue: price,
                    suggestedValue: correctPrice,
                    difference: NanoProParser.round(Math.abs(price - correctPrice), 2),
                    confidence: this.scorePriceFix(qty, price, amount, correctPrice),
                    explanation: `If Qty (${qty}) and Amount (${NanoProParser.formatNumber(amount)}) are correct, Price should be ${NanoProParser.formatNumber(correctPrice)}`
                });
            }

            // Sort by confidence (highest first)
            suggestions.sort((a, b) => b.confidence - a.confidence);

            // Mark the top suggestion
            if (suggestions.length > 0) {
                suggestions[0].isRecommended = true;
            }

            return suggestions;
        }

        /**
         * Score for fixing the amount
         * Higher confidence if:
         * - Qty is an integer
         * - Price matches common prices
         * - Price is within expected range
         */
        scoreAmountFix(qty, price, currentAmount, correctAmount) {
            let score = 0.5; // Base score

            // Qty is integer (more likely correct)
            if (Number.isInteger(qty)) {
                score += 0.15;
            }

            // Price matches common prices from valid rows
            if (this.patterns && this.patterns.commonPrices.includes(price)) {
                score += 0.2;
            }

            // Price is within expected range
            if (this.patterns && this.patterns.priceRange) {
                if (price >= this.patterns.priceRange.min && price <= this.patterns.priceRange.max) {
                    score += 0.1;
                }
            }

            // The correction is relatively small (less likely to be a data entry error)
            const changeRatio = Math.abs(correctAmount - currentAmount) / Math.max(currentAmount, 1);
            if (changeRatio < 0.1) {
                score += 0.05; // Small change, could be rounding
            }

            return Math.min(NanoProParser.round(score, 2), 1);
        }

        /**
         * Score for fixing the quantity
         * Higher confidence if:
         * - Suggested qty is an integer
         * - Price and amount seem correct (match patterns)
         */
        scoreQtyFix(currentQty, price, amount, correctQty) {
            let score = 0.3; // Lower base score (qty changes are less common)

            // Suggested qty is an integer
            if (Number.isInteger(correctQty)) {
                score += 0.2;
            } else if (correctQty % 0.5 === 0) {
                // Half-unit quantities are common
                score += 0.1;
            }

            // Price matches common prices
            if (this.patterns && this.patterns.commonPrices.includes(price)) {
                score += 0.15;
            }

            // Qty is within expected range
            if (this.patterns && this.patterns.qtyRange) {
                if (correctQty >= this.patterns.qtyRange.min && correctQty <= this.patterns.qtyRange.max) {
                    score += 0.1;
                }
            }

            // Current qty is suspiciously different from others
            if (this.patterns && this.patterns.medianQty) {
                const deviation = Math.abs(currentQty - this.patterns.medianQty) / this.patterns.medianQty;
                if (deviation > 0.5) {
                    score += 0.1; // Current qty seems off
                }
            }

            return Math.min(NanoProParser.round(score, 2), 1);
        }

        /**
         * Score for fixing the price
         * Higher confidence if:
         * - Suggested price matches common prices
         * - Qty is an integer
         */
        scorePriceFix(qty, currentPrice, amount, correctPrice) {
            let score = 0.35; // Medium base score

            // Qty is an integer (more likely correct)
            if (Number.isInteger(qty)) {
                score += 0.1;
            }

            // Suggested price matches common prices
            if (this.patterns && this.patterns.commonPrices.includes(correctPrice)) {
                score += 0.25;
            }

            // Suggested price is within expected range
            if (this.patterns && this.patterns.priceRange) {
                if (correctPrice >= this.patterns.priceRange.min && correctPrice <= this.patterns.priceRange.max) {
                    score += 0.1;
                }
            }

            // Current price doesn't match common prices (might be the error)
            if (this.patterns && this.patterns.commonPrices.length > 0) {
                if (!this.patterns.commonPrices.includes(currentPrice)) {
                    score += 0.1;
                }
            }

            return Math.min(NanoProParser.round(score, 2), 1);
        }

        /**
         * Find most frequent values
         */
        findFrequent(values, topN = 3) {
            if (values.length === 0) return [];

            const freq = {};
            values.forEach(v => {
                const key = NanoProParser.round(v, 2);
                freq[key] = (freq[key] || 0) + 1;
            });

            return Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN)
                .map(([val]) => parseFloat(val));
        }

        /**
         * Calculate median
         */
        median(values) {
            if (values.length === 0) return null;
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
                ? sorted[mid]
                : (sorted[mid - 1] + sorted[mid]) / 2;
        }

        /**
         * Calculate average
         */
        average(values) {
            if (values.length === 0) return null;
            return NanoProParser.round(values.reduce((a, b) => a + b, 0) / values.length, 2);
        }

        /**
         * Get current patterns
         */
        getPatterns() {
            return this.patterns;
        }
    }

    // Create singleton instance
    const suggester = new Suggester();

    // Public API
    return {
        analyzePatterns: (validRows) => suggester.analyzePatterns(validRows),
        suggest: (invalidRow) => suggester.suggest(invalidRow),
        getPatterns: () => suggester.getPatterns()
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NanoProSuggester = NanoProSuggester;
}
