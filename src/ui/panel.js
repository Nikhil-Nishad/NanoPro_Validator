/**
 * NanoPro Panel - Expandable Results Panel
 * 
 * Shows detailed validation results including:
 * - ALL rows (valid AND invalid)
 * - Expected vs actual calculations
 * - 3 correction suggestions with confidence scores for invalid rows
 */

const NanoProPanel = (function () {
  'use strict';

  /**
   * Panel class
   */
  class Panel {
    constructor() {
      this.element = null;
      this.isOpen = false;
      this.lastResults = null;
    }

    /**
     * Create the panel element
     */
    create(container) {
      if (this.element) {
        this.element.remove();
      }

      this.element = document.createElement('div');
      this.element.className = 'nanopro-panel';
      this.element.innerHTML = `
        <div class="nanopro-panel-header">
          <span class="nanopro-panel-title">NanoPro Validator</span>
          <button class="nanopro-panel-close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="nanopro-panel-body"></div>
      `;

      // Close button handler
      const closeBtn = this.element.querySelector('.nanopro-panel-close');
      closeBtn.addEventListener('click', () => this.close());

      container.appendChild(this.element);

      // Setup resize handle (overlay owns the interaction logic)
      if (typeof NanoProOverlay !== 'undefined' && NanoProOverlay.setupResize) {
        NanoProOverlay.setupResize(this.element);
      }

      return this.element;
    }

    /**
     * Open the panel
     */
    open() {
      if (!this.element) return;
      this.element.classList.add('open');
      this.isOpen = true;
    }

    /**
     * Close the panel
     */
    close() {
      if (!this.element) return;
      this.element.classList.remove('open');
      this.isOpen = false;
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    /**
     * Render validation results - ALL ROWS
     */
    render(validationResult) {
      if (!this.element) return;

      this.lastResults = validationResult;
      const body = this.element.querySelector('.nanopro-panel-body');

      if (!validationResult || !validationResult.success) {
        body.innerHTML = `
          <div class="nanopro-empty">
            <div class="nanopro-empty-icon">📋</div>
            <div>No validation data available</div>
          </div>
        `;
        return;
      }

      const { summary, results, invalidRows, validRows } = validationResult;

      // Analyze patterns for suggestions
      const validRowData = validRows.map(r => ({
        qty: r.qty,
        price: r.price,
        amount: r.actual
      }));
      NanoProSuggester.analyzePatterns(validRowData);

      // Render ALL rows in order
      let html = `
        <div class="nanopro-summary">
          <span class="nanopro-summary-valid">✅ ${summary.valid}</span>
          <span class="nanopro-summary-invalid">❌ ${summary.invalid}</span>
          <span class="nanopro-summary-total">(${summary.total} total)</span>
        </div>
      `;

      // Item_No caution summary
      const itemNoWarnings = validationResult.itemNoWarnings || [];
      if (itemNoWarnings.length > 0) {
        html += `
          <div class="nanopro-caution-summary">
            ⚠️ ${itemNoWarnings.length} Item_No caution${itemNoWarnings.length > 1 ? 's' : ''}
          </div>
        `;
      }

      for (const row of results) {
        if (row.status === 'VALID') {
          html += this.renderValidRow(row);
        } else if (row.status === 'INVALID') {
          const suggestions = NanoProSuggester.suggest(row);
          html += this.renderInvalidRow(row, suggestions);
        } else if (row.status === 'INCOMPLETE') {
          html += this.renderIncompleteRow(row);
        }
      }

      // Render total validation (sum vs invoice_amount)
      if (validationResult.totalValidation) {
        html += this.renderTotalValidation(validationResult.totalValidation);
      }

      body.innerHTML = html;
    }

    /**
     * Render a valid row
     */
    renderValidRow(row) {
      return `
        <div class="nanopro-row nanopro-row-valid">
          <div class="nanopro-row-header">
            <div class="nanopro-row-icon nanopro-icon-valid">✓</div>
            <span class="nanopro-row-label nanopro-label-valid">Row ${row.rowNumber}: Valid</span>
          </div>
          <div class="nanopro-row-values">
            <div class="nanopro-row-calc nanopro-calc-large">
              <span class="nanopro-calc-qty">${row.qty}</span>
              <span class="nanopro-calc-op">×</span>
              <span class="nanopro-calc-price">${NanoProParser.formatNumber(row.price)}</span>
              <span class="nanopro-calc-op">=</span>
              <span class="nanopro-calc-result nanopro-calc-valid">${NanoProParser.formatNumber(row.actual)}</span>
            </div>
            ${this.renderItemNoCautionTag(row)}
          </div>
        </div>
      `;
    }

    /**
     * Render a single invalid row
     */
    renderInvalidRow(row, suggestions) {
      const suggestionsHtml = suggestions.map(s => `
        <div class="nanopro-suggestion ${s.isRecommended ? 'recommended' : ''}">
          <span class="nanopro-suggestion-star">${s.isRecommended ? '⭐' : '○'}</span>
          <span class="nanopro-suggestion-text">
            ${s.fieldLabel} should be <strong>${NanoProParser.formatNumber(s.suggestedValue)}</strong>
          </span>
          <div class="nanopro-suggestion-confidence">
            <div class="nanopro-confidence-bar">
              <div class="nanopro-confidence-fill" style="width: ${s.confidence * 100}%"></div>
            </div>
            <span class="nanopro-confidence-text">${Math.round(s.confidence * 100)}%</span>
          </div>
        </div>
      `).join('');

      return `
        <div class="nanopro-row nanopro-row-invalid">
          <div class="nanopro-row-header">
            <div class="nanopro-row-icon nanopro-icon-invalid">✗</div>
            <span class="nanopro-row-label nanopro-label-invalid">Row ${row.rowNumber}: Invalid</span>
          </div>
          <div class="nanopro-row-values">
            <div class="nanopro-row-calc nanopro-calc-large">
              <span class="nanopro-calc-qty">${row.qty}</span>
              <span class="nanopro-calc-op">×</span>
              <span class="nanopro-calc-price">${NanoProParser.formatNumber(row.price)}</span>
              <span class="nanopro-calc-op">=</span>
              <span class="nanopro-calc-result nanopro-calc-actual">${NanoProParser.formatNumber(row.actual)}</span>
            </div>
            <div class="nanopro-calc-expected">
              Expected: <strong>${NanoProParser.formatNumber(row.expected)}</strong>
              <span class="nanopro-calc-diff">(off by ${NanoProParser.formatNumber(row.difference)})</span>
            </div>
            ${this.renderItemNoCautionTag(row)}
          </div>
          <div class="nanopro-suggestions">
            <div class="nanopro-suggestion-label">💡 Suggestions</div>
            ${suggestionsHtml}
          </div>
        </div>
      `;
    }

    /**
     * Render a single incomplete row
     */
    renderIncompleteRow(row) {
      const missing = row.missing.map(m => {
        switch (m) {
          case 'qty': return 'Quantity';
          case 'price': return 'Price';
          case 'amount': return 'Amount';
          default: return m;
        }
      }).join(', ');

      return `
        <div class="nanopro-row nanopro-row-incomplete">
          <div class="nanopro-row-header">
            <div class="nanopro-row-icon nanopro-icon-incomplete">!</div>
            <span class="nanopro-row-label nanopro-label-incomplete">Row ${row.rowNumber}: Missing Data</span>
          </div>
          <div class="nanopro-row-values">
            <div class="nanopro-row-calc">
              Missing: ${missing}
            </div>
            ${this.renderItemNoCautionTag(row)}
          </div>
        </div>
      `;
    }

    /**
     * Render Item_No caution tag for a row (if applicable)
     */
    renderItemNoCautionTag(row) {
      if (!row.itemNoWarning) return '';

      const reasonText = this.formatItemNoReason(row.itemNoReason, row.itemNoValue);
      return `<div class="nanopro-caution-tag">⚠️ Item_No: ${reasonText}</div>`;
    }

    /**
     * Format human-readable reason for Item_No caution
     */
    formatItemNoReason(reason, value) {
      switch (reason) {
        case 'COLUMN_NOT_FOUND': return 'Not found';
        case 'BLANK': return 'Blank';
        case 'DASH_R': return `"${value?.trim() || '-R'}" detected`;
        default: return reason || 'Unknown';
      }
    }

    /**
     * Render total validation: sum vs invoice_amount
     */
    renderTotalValidation(total) {
      if (!total) return '';

      const sumFormatted = NanoProParser.formatNumber(total.sumAmount);

      if (total.status === 'NOT_FOUND') {
        return `
          <div class="nanopro-total nanopro-total-info">
            <div class="nanopro-total-label">Invoice Total</div>
            <div class="nanopro-total-values">
              <span class="nanopro-total-sum">Sum: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-note">invoice_amount not found in sidebar</span>
            </div>
          </div>
        `;
      }

      if (total.status === 'ERROR') {
        return `
          <div class="nanopro-total nanopro-total-info">
            <div class="nanopro-total-label">Invoice Total</div>
            <div class="nanopro-total-values">
              <span class="nanopro-total-sum">Sum: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-note">Error: ${total.message}</span>
            </div>
          </div>
        `;
      }

      const invoiceFormatted = NanoProParser.formatNumber(total.invoiceAmount);
      const diffFormatted = NanoProParser.formatNumber(total.difference);
      const isMatch = total.status === 'MATCH';

      return `
        <div class="nanopro-total ${isMatch ? 'nanopro-total-match' : 'nanopro-total-mismatch'}">
          <div class="nanopro-total-label">${isMatch ? '✅' : '❌'} Invoice Total</div>
          <div class="nanopro-total-values">
            <span class="nanopro-total-sum">Sum: ${sumFormatted}</span>
            <span class="nanopro-total-sep">|</span>
            <span class="nanopro-total-invoice">Invoice: ${invoiceFormatted}</span>
            ${!isMatch ? `<span class="nanopro-total-sep">|</span><span class="nanopro-total-diff">Diff: ${diffFormatted}</span>` : ''}
          </div>
        </div>
      `;
    }

    /**
     * Check if panel is open
     */
    getIsOpen() {
      return this.isOpen;
    }

    /**
     * Remove panel
     */
    remove() {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
      this.isOpen = false;
    }
  }

  // Create singleton instance
  const panel = new Panel();

  // Public API
  return {
    create: (container) => panel.create(container),
    open: () => panel.open(),
    close: () => panel.close(),
    toggle: () => panel.toggle(),
    render: (results) => panel.render(results),
    isOpen: () => panel.getIsOpen(),
    remove: () => panel.remove()
  };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.NanoProPanel = NanoProPanel;
}
