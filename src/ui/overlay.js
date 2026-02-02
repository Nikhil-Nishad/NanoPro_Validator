/**
 * NanoPro Overlay - Shadow DOM Container
 * 
 * Creates an isolated Shadow DOM container for the extension UI.
 * Prevents CSS leakage in both directions.
 */

const NanoProOverlay = (function () {
  'use strict';

  // Overlay styles (injected into Shadow DOM)
  const STYLES = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 15px;
      line-height: 1.5;
      color: #1f2937;
    }

    * {
      box-sizing: border-box;
    }

    .nanopro-container {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }

    .nanopro-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: white;
      border-radius: 9999px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
    }

    .nanopro-badge:hover {
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.1);
      transform: translateY(-1px);
    }

    .nanopro-badge.valid {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
    }

    .nanopro-badge.invalid {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
    }

    .nanopro-badge.incomplete {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
    }

    .nanopro-badge.loading {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
    }

    .nanopro-badge.ready {
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: white;
    }

    .nanopro-badge.selecting {
      background: linear-gradient(135deg, #06b6d4, #0891b2);
      color: white;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }

    .nanopro-badge-icon {
      font-size: 18px;
    }

    .nanopro-badge-text {
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
    }

    .nanopro-badge-refresh {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-left: 4px;
    }

    .nanopro-badge-refresh:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: rotate(180deg);
    }

    .nanopro-badge-refresh svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .nanopro-panel {
      width: 380px;
      max-height: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      display: none;
    }

    .nanopro-panel.open {
      display: block;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .nanopro-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .nanopro-panel-title {
      font-weight: 600;
      font-size: 14px;
      color: #1e293b;
    }

    .nanopro-panel-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: #64748b;
      transition: all 0.2s ease;
    }

    .nanopro-panel-close:hover {
      background: #e2e8f0;
      color: #1e293b;
    }

    .nanopro-panel-body {
      max-height: 340px;
      overflow-y: auto;
      padding: 12px;
    }

    .nanopro-row {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .nanopro-row:last-child {
      margin-bottom: 0;
    }

    .nanopro-row-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .nanopro-row-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #ef4444;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .nanopro-row-label {
      font-weight: 600;
      font-size: 14px;
      color: #b91c1c;
    }

    .nanopro-row-values {
      background: white;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .nanopro-row-calc {
      color: #6b7280;
    }

    .nanopro-row-calc-expected {
      color: #059669;
      font-weight: 600;
    }

    .nanopro-row-calc-actual {
      color: #dc2626;
      text-decoration: line-through;
    }

    .nanopro-suggestions {
      margin-top: 8px;
    }

    .nanopro-suggestion-label {
      font-size: 13px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    .nanopro-suggestion {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #fecaca;
    }

    .nanopro-suggestion:last-child {
      border-bottom: none;
    }

    .nanopro-suggestion.recommended {
      background: #ecfdf5;
      margin: 0 -12px;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #a7f3d0;
    }

    .nanopro-suggestion-star {
      color: #fbbf24;
      font-size: 16px;
    }

    .nanopro-suggestion-text {
      flex: 1;
      font-size: 15px;
      color: #374151;
    }

    .nanopro-suggestion-confidence {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .nanopro-confidence-bar {
      width: 50px;
      height: 5px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
    }

    .nanopro-confidence-fill {
      height: 100%;
      background: #10b981;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .nanopro-confidence-text {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      min-width: 36px;
      text-align: right;
    }

    .nanopro-empty {
      text-align: center;
      padding: 24px;
      color: #6b7280;
    }

    .nanopro-empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    /* Summary bar */
    .nanopro-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
    }

    .nanopro-summary-valid {
      color: #059669;
    }

    .nanopro-summary-invalid {
      color: #dc2626;
    }

    .nanopro-summary-total {
      color: #6b7280;
      font-weight: 400;
    }

    /* Valid row styling */
    .nanopro-row-valid {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }

    .nanopro-icon-valid {
      background: #10b981;
    }

    .nanopro-label-valid {
      color: #059669;
    }

    /* Invalid row styling */
    .nanopro-row-invalid {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .nanopro-icon-invalid {
      background: #ef4444;
    }

    .nanopro-label-invalid {
      color: #b91c1c;
    }

    /* Incomplete row styling */
    .nanopro-row-incomplete {
      background: #fffbeb;
      border-color: #fcd34d;
    }

    .nanopro-icon-incomplete {
      background: #f59e0b;
    }

    .nanopro-label-incomplete {
      color: #b45309;
    }

    /* Large calculation display */
    .nanopro-calc-large {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .nanopro-calc-qty {
      color: #374151;
    }

    .nanopro-calc-op {
      color: #9ca3af;
    }

    .nanopro-calc-price {
      color: #374151;
    }

    .nanopro-calc-result {
      padding: 2px 8px;
      border-radius: 4px;
    }

    .nanopro-calc-valid {
      background: #d1fae5;
      color: #059669;
    }

    .nanopro-calc-actual {
      background: #fee2e2;
      color: #dc2626;
      text-decoration: line-through;
    }

    .nanopro-calc-expected {
      font-size: 14px;
      color: #059669;
      margin-top: 6px;
      font-weight: 500;
    }

    .nanopro-calc-diff {
      color: #9ca3af;
      font-weight: 400;
    }

    .nanopro-empty {
      text-align: center;
      padding: 24px;
      color: #6b7280;
    }

    .nanopro-empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    /* Scrollbar styling */
    .nanopro-panel-body::-webkit-scrollbar {
      width: 6px;
    }

    .nanopro-panel-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .nanopro-panel-body::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 3px;
    }

    .nanopro-panel-body::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `;

  /**
   * Overlay class
   */
  class Overlay {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.container = null;
      this.isInjected = false;
    }

    /**
     * Inject the overlay into the page
     */
    inject() {
      if (this.isInjected) {
        console.log('[NanoPro Overlay] Already injected');
        return this.shadow;
      }

      // Create host element
      this.host = document.createElement('div');
      this.host.id = 'nanopro-validator-host';
      this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';

      // Attach shadow DOM (closed for isolation)
      this.shadow = this.host.attachShadow({ mode: 'closed' });

      // Inject styles
      const styleEl = document.createElement('style');
      styleEl.textContent = STYLES;
      this.shadow.appendChild(styleEl);

      // Create container
      this.container = document.createElement('div');
      this.container.className = 'nanopro-container';
      this.shadow.appendChild(this.container);

      // Append to body
      document.body.appendChild(this.host);
      this.isInjected = true;

      console.log('[NanoPro Overlay] Injected successfully');
      return this.shadow;
    }

    /**
     * Remove the overlay from the page
     */
    remove() {
      if (this.host && this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
      this.host = null;
      this.shadow = null;
      this.container = null;
      this.isInjected = false;

      console.log('[NanoPro Overlay] Removed');
    }

    /**
     * Get the container element
     */
    getContainer() {
      return this.container;
    }

    /**
     * Get the shadow root
     */
    getShadow() {
      return this.shadow;
    }

    /**
     * Check if overlay is active
     */
    isActive() {
      return this.isInjected && this.host && this.host.parentNode;
    }
  }

  // Create singleton instance
  const overlay = new Overlay();

  // Public API
  return {
    inject: () => overlay.inject(),
    remove: () => overlay.remove(),
    getContainer: () => overlay.getContainer(),
    getShadow: () => overlay.getShadow(),
    isActive: () => overlay.isActive()
  };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.NanoProOverlay = NanoProOverlay;
}
