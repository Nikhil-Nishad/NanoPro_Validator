/**
 * NanoPro Screenshot Capture
 * 
 * Captures a region of the visible page as an image.
 * Uses html2canvas for accurate rendering.
 */

const NanoProCapture = (function () {
    'use strict';

    /**
     * Capture a region of the page as a canvas
     * @param {Object} region - {x, y, width, height}
     * @returns {Promise<HTMLCanvasElement>}
     */
    async function captureRegion(region) {
        console.log('[NanoPro Capture] Capturing region:', region);

        // Method 1: Use native canvas capture from visible viewport
        // This works by rendering the visible content to a canvas

        try {
            // Create a canvas for the selected region
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size with device pixel ratio for crisp text
            const dpr = window.devicePixelRatio || 1;
            canvas.width = region.width * dpr;
            canvas.height = region.height * dpr;
            canvas.style.width = region.width + 'px';
            canvas.style.height = region.height + 'px';
            ctx.scale(dpr, dpr);

            // We'll use a different approach - capture the DOM elements in the region
            // and render them to canvas

            // For now, use the simpler approach of capturing via background script
            // which has access to chrome.tabs.captureVisibleTab

            // However, content scripts can't use that API directly
            // So we'll use a workaround: render DOM to canvas manually

            const imageData = await captureViaDOM(region);
            return imageData;

        } catch (error) {
            console.error('[NanoPro Capture] Capture failed:', error);
            throw error;
        }
    }

    /**
     * Capture by rendering DOM elements to canvas
     * Simplified approach that works in content scripts
     */
    async function captureViaDOM(region) {
        // Create an offscreen canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        canvas.width = region.width * dpr;
        canvas.height = region.height * dpr;
        ctx.scale(dpr, dpr);

        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, region.width, region.height);

        // Find all text elements in the region
        const elements = document.elementsFromPoint(
            region.x + region.width / 2,
            region.y + region.height / 2
        );

        // Get all visible elements in the region
        const allElements = document.querySelectorAll('*');
        const textElements = [];

        for (const el of allElements) {
            const rect = el.getBoundingClientRect();

            // Check if element is in region
            if (rect.right < region.x || rect.left > region.x + region.width) continue;
            if (rect.bottom < region.y || rect.top > region.y + region.height) continue;

            // Get computed style
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            // Get text content
            const text = getDirectText(el);
            if (text) {
                textElements.push({
                    text: text,
                    x: rect.left - region.x,
                    y: rect.top - region.y + rect.height / 2,
                    fontSize: parseFloat(style.fontSize) || 14,
                    fontFamily: style.fontFamily || 'sans-serif',
                    color: style.color || '#000000'
                });
            }
        }

        // Render text to canvas
        for (const item of textElements) {
            ctx.font = `${item.fontSize}px ${item.fontFamily}`;
            ctx.fillStyle = item.color;
            ctx.textBaseline = 'middle';
            ctx.fillText(item.text, item.x, item.y);
        }

        console.log(`[NanoPro Capture] Rendered ${textElements.length} text elements to canvas`);

        return canvas;
    }

    /**
     * Get direct text content of an element (excluding children)
     */
    function getDirectText(element) {
        let text = '';
        for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent.trim();
            }
        }
        return text;
    }

    /**
     * Convert canvas to data URL
     */
    function canvasToDataURL(canvas, format = 'image/png') {
        return canvas.toDataURL(format);
    }

    /**
     * Convert canvas to Blob
     */
    function canvasToBlob(canvas, format = 'image/png') {
        return new Promise((resolve) => {
            canvas.toBlob(resolve, format);
        });
    }

    /**
     * Extract text directly from DOM elements in region
     * This is a fallback that doesn't require OCR
     */
    function extractTextFromRegion(region) {
        const texts = [];
        const allElements = document.querySelectorAll('*');

        for (const el of allElements) {
            const rect = el.getBoundingClientRect();

            // v2: Added 3px buffer to prevent edge elements from being clipped
            const buffer = 3;
            if (rect.right < region.x - buffer || rect.left > region.x + region.width + buffer) continue;
            if (rect.bottom < region.y - buffer || rect.top > region.y + region.height + buffer) continue;
            if (rect.width === 0 || rect.height === 0) continue;

            // Get computed style
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            // Get ALL text content (including from buttons, inputs, etc.)
            let text = '';

            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                text = el.value || '';
            } else if (el.tagName === 'SELECT') {
                text = el.options[el.selectedIndex]?.text || '';
            } else {
                // Get direct text only to avoid duplicates
                text = getDirectText(el);
            }

            if (text) {
                texts.push({
                    text: text,
                    x: rect.left,
                    y: rect.top,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2,
                    width: rect.width,
                    height: rect.height,
                    element: el.tagName
                });
            }
        }

        // Sort by position (top to bottom, left to right)
        texts.sort((a, b) => {
            const rowDiff = Math.abs(a.centerY - b.centerY);
            if (rowDiff > 10) {
                return a.centerY - b.centerY; // Different rows
            }
            return a.centerX - b.centerX; // Same row, sort left to right
        });

        console.log(`[NanoPro Capture] Extracted ${texts.length} text elements from region`);
        return texts;
    }

    // Public API
    return {
        captureRegion: captureRegion,
        extractTextFromRegion: extractTextFromRegion,
        canvasToDataURL: canvasToDataURL,
        canvasToBlob: canvasToBlob
    };

})();

// Export
if (typeof window !== 'undefined') {
    window.NanoProCapture = NanoProCapture;
}
