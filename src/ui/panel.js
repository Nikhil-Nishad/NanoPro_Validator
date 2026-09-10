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

      // Render sidebar field validations
      if (validationResult.sidebarValidation) {
        html += this.renderSidebarValidation(validationResult.sidebarValidation);
      }

      // Item_No caution summary
      const itemNoWarnings = validationResult.itemNoWarnings || [];
      const itemNoErrors = validationResult.itemNoErrors || [];
      const itemNoCautions = itemNoWarnings.filter(w => w.severity !== 'ERROR');

      if (itemNoErrors.length > 0) {
        html += `
          <div class="nanopro-error-summary">
            ❌ ${itemNoErrors.length} Item_No error${itemNoErrors.length > 1 ? 's' : ''}
          </div>
        `;
      }

      if (itemNoCautions.length > 0) {
        html += `
          <div class="nanopro-caution-summary">
            ⚠️ ${itemNoCautions.length} Item_No caution${itemNoCautions.length > 1 ? 's' : ''}
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
     * Render Item_No caution/error tag for a row (if applicable)
     */
    renderItemNoCautionTag(row) {
      if (!row.itemNoWarning) return '';

      const isError = row.itemNoSeverity === 'ERROR';
      const reasonText = this.formatItemNoReason(row.itemNoReason, row.itemNoValue);
      return `<div class="nanopro-caution-tag ${isError ? 'nanopro-tag-error' : ''}">${isError ? '❌' : '⚠️'} Item_No: ${reasonText}</div>`;
    }

    /**
     * Format human-readable reason for Item_No caution/error
     */
    formatItemNoReason(reason, value) {
      switch (reason) {
        case 'COLUMN_NOT_FOUND': return 'Not found';
        case 'BLANK': return 'Blank';
        case 'DASH_R': return `"${value?.trim() || '-R'}" detected`;
        case 'ONLY_DASH_R': return 'Cannot be only "-R"';
        case 'MISSING_DASH_R': return 'Missing "-R" suffix (Rental)';
        case 'UNEXPECTED_DASH_R': return 'Unexpected "-R" suffix (Non-Rental)';
        default: return reason || 'Unknown';
      }
    }

    /**
     * Render sidebar validations section (Environment, Trade Partner, is_rental, Page Info)
     */
    renderSidebarValidation(sidebar) {
      if (!sidebar) return '';

      const env = sidebar.environment;
      const rental = sidebar.isRental;
      const partner = sidebar.tradePartner;
      const page = sidebar.pageInfo;

      const envPass = env && env.status === 'VALID';
      const rentalPass = rental && rental.status === 'VALID';
      const partnerPass = partner && partner.status === 'VALID';

      return `
        <div class="nanopro-sidebar-section">
          <div class="nanopro-sidebar-header">
            <span class="nanopro-sidebar-title">📋 Sidebar Fields</span>
            ${sidebar.isValid ? 
              '<span class="nanopro-pill nanopro-pill-valid">Passed</span>' : 
              '<span class="nanopro-pill nanopro-pill-error">Issues</span>'}
          </div>
          <div class="nanopro-sidebar-grid">
            <div class="nanopro-sidebar-card ${envPass ? 'card-valid' : 'card-error'}">
              <div class="nanopro-card-title">
                <span class="nanopro-card-icon">${envPass ? '✓' : '✗'}</span>
                <span>Environment</span>
              </div>
              <div class="nanopro-card-desc" title="${env?.value || ''}">
                ${envPass ? ('prod' + (env?.isRemembered ? ' (remembered)' : '')) : (env?.message || 'Missing')}
              </div>
            </div>

            <div class="nanopro-sidebar-card ${partnerPass ? 'card-valid' : 'card-error'}">
              <div class="nanopro-card-title">
                <span class="nanopro-card-icon">${partnerPass ? '✓' : '✗'}</span>
                <span>Trade Partner</span>
              </div>
              <div class="nanopro-card-desc" title="${partner?.value || ''}">
                ${partnerPass ? ((partner.value || 'Present') + (partner?.isRemembered ? ' (remembered)' : '')) : (partner?.message || 'Missing')}
              </div>
            </div>

            <div class="nanopro-sidebar-card ${rentalPass ? 'card-valid' : 'card-error'}">
              <div class="nanopro-card-title">
                <span class="nanopro-card-icon">${rentalPass ? '✓' : '✗'}</span>
                <span>is_rental</span>
              </div>
              <div class="nanopro-card-desc" title="${rental?.values ? rental.values.join(', ') : ''}">
                ${rental?.message || (rentalPass ? 'Consistent' : 'Error')}
              </div>
            </div>

            ${page ? `
            <div class="nanopro-sidebar-card card-info">
              <div class="nanopro-card-title">
                <span class="nanopro-card-icon">📄</span>
                <span>Page Info</span>
              </div>
              <div class="nanopro-card-desc">
                ${page.totalPages ? `Page ${page.currentPage} of ${page.totalPages}` : `Page ${page.currentPage}`}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    /**
     * Render total validation: sum vs invoice_amount (single page or cumulative multi-page)
     */
    renderTotalValidation(total) {
      if (!total) return '';

      const sumFormatted = NanoProParser.formatNumber(total.sumAmount);
      const isMulti = !!total.isMultiPage;

      if (total.status === 'MULTI_PAGE_PENDING') {
        const pageSumFormatted = NanoProParser.formatNumber(total.pageSum);
        const breakdownItems = Object.entries(total.pageBreakdown || {})
          .map(([p, amt]) => `<span class="nanopro-pill nanopro-pill-info">Page ${p}: $${NanoProParser.formatNumber(amt)}</span>`)
          .join(' ');

        return `
          <div class="nanopro-total nanopro-total-info">
            <div class="nanopro-total-header">
              <span class="nanopro-total-title">📄 Multi-Page Document (Page ${total.currentPage} of ${total.totalPages})</span>
              <span class="nanopro-pill nanopro-pill-info">${total.recordedPages ? total.recordedPages.length : 1} of ${total.totalPages} Recorded</span>
            </div>
            <div class="nanopro-total-values" style="margin-top: 6px;">
              <span class="nanopro-total-sum">Current Page Sum: ${pageSumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-sum">Cumulative Sum: ${sumFormatted}</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: #475569;">
              👉 Navigate to page ${total.totalPages} (last page) to validate against final invoice_amount.
            </div>
            ${breakdownItems ? `<div style="margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;">${breakdownItems}</div>` : ''}
          </div>
        `;
      }

      if (total.status === 'PAGES_MISSING') {
        const invoiceFormatted = NanoProParser.formatNumber(total.invoiceAmount);
        return `
          <div class="nanopro-total nanopro-total-mismatch">
            <div class="nanopro-total-header">
              <span class="nanopro-total-title">⚠️ Multi-Page Total: Missing Earlier Pages</span>
              <span class="nanopro-pill nanopro-pill-error">Pages [${(total.missingPages || []).join(', ')}] Missing</span>
            </div>
            <div class="nanopro-total-values" style="margin-top: 6px;">
              <span class="nanopro-total-sum">Recorded Sum: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-invoice">Invoice: ${invoiceFormatted}</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: #dc2626; font-weight: 500;">
              Please navigate through page(s) [${(total.missingPages || []).join(', ')}] so all line items are accumulated.
            </div>
          </div>
        `;
      }

      if (total.status === 'NOT_FOUND') {
        return `
          <div class="nanopro-total nanopro-total-info">
            <div class="nanopro-total-label">${isMulti ? `Multi-Page Invoice Total (${total.totalPages} Pages)` : 'Invoice Total'}</div>
            <div class="nanopro-total-values">
              <span class="nanopro-total-sum">${isMulti ? 'Cumulative Sum' : 'Sum'}: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-note">invoice_amount not found in sidebar</span>
            </div>
          </div>
        `;
      }

      if (total.status === 'MULTIPLE_INSTANCES') {
        return `
          <div class="nanopro-total nanopro-total-mismatch">
            <div class="nanopro-total-label">❌ Multiple Invoice Totals</div>
            <div class="nanopro-total-values">
              <span class="nanopro-total-sum">${isMulti ? 'Cumulative Sum' : 'Sum'}: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-note" style="color: #dc2626; font-weight: 600;">
                ${total.message}
              </span>
            </div>
          </div>
        `;
      }

      if (total.status === 'ERROR') {
        return `
          <div class="nanopro-total nanopro-total-info">
            <div class="nanopro-total-label">${isMulti ? `Multi-Page Invoice Total (${total.totalPages} Pages)` : 'Invoice Total'}</div>
            <div class="nanopro-total-values">
              <span class="nanopro-total-sum">${isMulti ? 'Cumulative Sum' : 'Sum'}: ${sumFormatted}</span>
              <span class="nanopro-total-sep">|</span>
              <span class="nanopro-total-note">Error: ${total.message}</span>
            </div>
          </div>
        `;
      }

      const invoiceFormatted = NanoProParser.formatNumber(total.invoiceAmount);
      const diffFormatted = NanoProParser.formatNumber(total.difference);
      const isMatch = total.status === 'MATCH';

      const breakdownItems = isMulti && total.pageBreakdown ? Object.entries(total.pageBreakdown)
        .map(([p, amt]) => `<span class="nanopro-pill ${isMatch ? 'nanopro-pill-valid' : 'nanopro-pill-info'}">Page ${p}: $${NanoProParser.formatNumber(amt)}</span>`)
        .join(' ') : '';

      return `
        <div class="nanopro-total ${isMatch ? 'nanopro-total-match' : 'nanopro-total-mismatch'}">
          <div class="nanopro-total-header">
            <span class="nanopro-total-title">${isMatch ? '✅' : '❌'} ${isMulti ? `Multi-Page Invoice Total (${total.totalPages} Pages)` : 'Invoice Total'}</span>
            ${isMulti ? `<span class="nanopro-pill ${isMatch ? 'nanopro-pill-valid' : 'nanopro-pill-error'}">${isMatch ? 'All Pages Match' : 'Mismatch'}</span>` : ''}
          </div>
          <div class="nanopro-total-values" style="margin-top: 6px;">
            <span class="nanopro-total-sum">${isMulti ? 'Cumulative Sum' : 'Sum'}: ${sumFormatted}</span>
            <span class="nanopro-total-sep">|</span>
            <span class="nanopro-total-invoice">Invoice: ${invoiceFormatted}${total.isRemembered ? ' (remembered)' : ''}</span>
            ${!isMatch ? `<span class="nanopro-total-sep">|</span><span class="nanopro-total-diff">Diff: ${diffFormatted}</span>` : ''}
          </div>
          ${breakdownItems ? `<div style="margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap;">${breakdownItems}</div>` : ''}
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
