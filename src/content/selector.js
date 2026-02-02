/**
 * NanoPro Region Selector
 * 
 * Provides a snipping-tool-like interface for selecting
 * a region of the page to capture and process with OCR.
 */

const NanoProSelector = (function () {
    'use strict';

    let overlay = null;
    let selectionBox = null;
    let startX = 0;
    let startY = 0;
    let isSelecting = false;
    let onCompleteCallback = null;

    /**
     * Start the selection mode
     * @param {Function} onComplete - Callback with {x, y, width, height} when selection is done
     */
    function startSelection(onComplete) {
        if (overlay) {
            console.log('[NanoPro Selector] Already in selection mode');
            return;
        }

        onCompleteCallback = onComplete;

        // Create full-page overlay
        overlay = document.createElement('div');
        overlay.id = 'nanopro-selector-overlay';
        overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 2147483646;
      user-select: none;
    `;

        // Create selection box
        selectionBox = document.createElement('div');
        selectionBox.id = 'nanopro-selection-box';
        selectionBox.style.cssText = `
      position: fixed;
      border: 2px dashed #10b981;
      background: rgba(16, 185, 129, 0.1);
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `;

        // Create instruction text
        const instructions = document.createElement('div');
        instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 2147483647;
    `;
        instructions.innerHTML = `
      <strong>📐 Select the table area</strong><br>
      <span style="opacity: 0.8">Click and drag to select • ESC to cancel</span>
    `;
        overlay.appendChild(instructions);

        // Event handlers
        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keydown', handleKeyDown);

        document.body.appendChild(overlay);
        document.body.appendChild(selectionBox);

        console.log('[NanoPro Selector] Selection mode started');
    }

    /**
     * Handle mouse down - start selection
     */
    function handleMouseDown(e) {
        e.preventDefault();
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;

        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';
    }

    /**
     * Handle mouse move - update selection box
     */
    function handleMouseMove(e) {
        if (!isSelecting) return;
        e.preventDefault();

        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    }

    /**
     * Handle mouse up - complete selection
     */
    function handleMouseUp(e) {
        if (!isSelecting) return;
        e.preventDefault();
        isSelecting = false;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        // Minimum selection size
        if (width < 50 || height < 50) {
            console.log('[NanoPro Selector] Selection too small, cancelled');
            cancelSelection();
            return;
        }

        const selection = {
            x: left,
            y: top,
            width: width,
            height: height
        };

        console.log('[NanoPro Selector] Selection complete:', selection);

        // Clean up
        cleanup();

        // Notify callback
        if (onCompleteCallback) {
            onCompleteCallback(selection);
        }
    }

    /**
     * Handle ESC key to cancel
     */
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            console.log('[NanoPro Selector] Selection cancelled by user');
            cancelSelection();
        }
    }

    /**
     * Cancel the selection
     */
    function cancelSelection() {
        cleanup();
        if (onCompleteCallback) {
            onCompleteCallback(null);
        }
    }

    /**
     * Clean up DOM elements and listeners
     */
    function cleanup() {
        if (overlay) {
            overlay.removeEventListener('mousedown', handleMouseDown);
            overlay.removeEventListener('mousemove', handleMouseMove);
            overlay.removeEventListener('mouseup', handleMouseUp);
            overlay.remove();
            overlay = null;
        }
        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }
        document.removeEventListener('keydown', handleKeyDown);
        isSelecting = false;
    }

    /**
     * Check if currently in selection mode
     */
    function isActive() {
        return overlay !== null;
    }

    // Public API
    return {
        start: startSelection,
        cancel: cancelSelection,
        isActive: isActive
    };

})();

// Export
if (typeof window !== 'undefined') {
    window.NanoProSelector = NanoProSelector;
}
