/**
 * NanoPro Parser - Number Parsing Utilities
 * 
 * Handles parsing of numeric values from invoice text with support for:
 * - Currency symbols ($, €, £, ¥, ₹)
 * - Thousands separators (comma or period)
 * - Decimal separators (period or comma)
 * - Negative numbers
 * - Various number formats (US, EU)
 */

const NanoProParser = (function() {
  'use strict';

  // Currency symbols to strip
  const CURRENCY_SYMBOLS = /[$€£¥₹]/g;
  
  // Whitespace and common separators
  const WHITESPACE = /\s+/g;
  
  // Numeric patterns for validation
  const NUMERIC_PATTERNS = {
    // Integer: 5, -3, 100
    integer: /^-?\d+$/,
    
    // US decimal: 5.00, -3.50, 1234.56
    usDecimal: /^-?\d+\.\d{1,2}$/,
    
    // US with thousands: 1,234 or 1,234.56
    usThousands: /^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$/,
    
    // EU decimal: 5,00 or 1234,56
    euDecimal: /^-?\d+,\d{1,2}$/,
    
    // EU with thousands: 1.234 or 1.234,56
    euThousands: /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/,
    
    // Any number-like pattern (for initial detection)
    anyNumeric: /^-?[\d.,]+$/
  };

  /**
   * Detect the number format (US or EU)
   * US: 1,234.56 (comma = thousands, period = decimal)
   * EU: 1.234,56 (period = thousands, comma = decimal)
   */
  function detectFormat(text) {
    const cleaned = text.replace(CURRENCY_SYMBOLS, '').replace(WHITESPACE, '');
    
    // Check for both separators
    const hasComma = cleaned.includes(',');
    const hasPeriod = cleaned.includes('.');
    
    if (hasComma && hasPeriod) {
      // Both present - last one is decimal separator
      const lastComma = cleaned.lastIndexOf(',');
      const lastPeriod = cleaned.lastIndexOf('.');
      
      if (lastComma > lastPeriod) {
        return 'EU'; // 1.234,56
      } else {
        return 'US'; // 1,234.56
      }
    }
    
    if (hasComma) {
      // Only comma - check position and digits after
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        return 'EU'; // Likely 5,50 (EU decimal)
      }
      return 'US'; // Likely 1,234 (US thousands)
    }
    
    if (hasPeriod) {
      // Only period - check position and digits after
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length <= 2) {
        return 'US'; // Likely 5.50 (US decimal)
      }
      // Could be EU thousands like 1.234, but assume US decimal for safety
      return 'US';
    }
    
    return 'US'; // Default to US format
  }

  /**
   * Parse a numeric string to a number
   * Returns { value: number, confidence: 0-1, original: string }
   */
  function parse(text) {
    if (!text || typeof text !== 'string') {
      return { value: null, confidence: 0, original: text, error: 'INVALID_INPUT' };
    }

    // Clean the text
    let cleaned = text.trim();
    
    // Remove currency symbols
    cleaned = cleaned.replace(CURRENCY_SYMBOLS, '');
    
    // Remove whitespace
    cleaned = cleaned.replace(WHITESPACE, '');
    
    // Handle parentheses as negative (accounting notation)
    const isNegativeParens = /^\([\d.,]+\)$/.test(cleaned);
    if (isNegativeParens) {
      cleaned = '-' + cleaned.replace(/[()]/g, '');
    }
    
    // Check if it looks like a number
    if (!NUMERIC_PATTERNS.anyNumeric.test(cleaned)) {
      return { value: null, confidence: 0, original: text, error: 'NOT_NUMERIC' };
    }

    // Detect format
    const format = detectFormat(cleaned);
    
    let normalized;
    let confidence = 1;
    
    if (format === 'EU') {
      // EU format: periods are thousands, commas are decimals
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: commas are thousands, periods are decimals
      normalized = cleaned.replace(/,/g, '');
    }
    
    // Parse to float
    const value = parseFloat(normalized);
    
    if (isNaN(value)) {
      return { value: null, confidence: 0, original: text, error: 'PARSE_FAILED' };
    }
    
    // Reduce confidence for ambiguous cases
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      // Could be either format
      confidence = 0.8;
    }
    
    return {
      value: value,
      confidence: confidence,
      original: text,
      format: format
    };
  }

  /**
   * Check if a value is plausible for a given column type
   */
  function isPlausible(value, columnType) {
    if (value === null || isNaN(value)) {
      return { plausible: false, reason: 'INVALID_VALUE' };
    }

    switch (columnType) {
      case 'qty':
        // Quantity: typically positive, often integer, reasonable range
        if (value < 0) {
          return { plausible: true, reason: 'NEGATIVE_QTY', confidence: 0.6 };
        }
        if (value > 100000) {
          return { plausible: true, reason: 'VERY_LARGE_QTY', confidence: 0.5 };
        }
        if (Number.isInteger(value)) {
          return { plausible: true, confidence: 1 };
        }
        // Decimal quantity (e.g., 1.5 units)
        return { plausible: true, confidence: 0.9 };

      case 'price':
        // Price: typically positive, any decimal
        if (value < 0) {
          return { plausible: true, reason: 'NEGATIVE_PRICE', confidence: 0.6 };
        }
        if (value === 0) {
          return { plausible: true, reason: 'ZERO_PRICE', confidence: 0.7 };
        }
        return { plausible: true, confidence: 1 };

      case 'amount':
        // Amount: can be any value (negative for credits)
        return { plausible: true, confidence: 1 };

      default:
        return { plausible: true, confidence: 0.8 };
    }
  }

  /**
   * Extract all numeric-looking text from a string
   * Useful for finding numbers in mixed content
   */
  function extractNumbers(text) {
    if (!text) return [];
    
    // Match number patterns including currency
    const pattern = /[$€£¥₹]?\s*-?[\d.,]+\s*[$€£¥₹]?/g;
    const matches = text.match(pattern) || [];
    
    return matches
      .map(m => parse(m.trim()))
      .filter(p => p.value !== null);
  }

  /**
   * Round to specified decimal places (for comparison)
   */
  function round(value, decimals = 2) {
    if (value === null || isNaN(value)) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Check if two values are equal within tolerance
   */
  function isEqual(a, b, tolerance = 0.01) {
    if (a === null || b === null) return false;
    return Math.abs(a - b) <= tolerance;
  }

  /**
   * Format a number for display
   */
  function formatNumber(value, decimals = 2) {
    if (value === null || isNaN(value)) return 'N/A';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // Public API
  return {
    parse,
    detectFormat,
    isPlausible,
    extractNumbers,
    round,
    isEqual,
    formatNumber,
    NUMERIC_PATTERNS
  };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.NanoProParser = NanoProParser;
}
