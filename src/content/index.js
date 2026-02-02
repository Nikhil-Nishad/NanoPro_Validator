/**
 * NanoPro Validator - Main Content Script (Selection Mode)
 * 
 * Entry point for the extension using manual selection + text extraction.
 * User selects the table area, extension extracts text and validates.
 * Resets on page navigation.
 */

(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        autoValidate: false,
        observeMutations: false,
        retryAttempts: 0
    };

    // State
    let isInitialized = false;
    let validationResult = null;
    let lastSelection = null;
    let currentUrl = window.location.href;

    /**
     * Initialize the extension
     */
    function initialize() {
        if (isInitialized) {
            console.log('[NanoPro] Already initialized');
            return;
        }

        console.log('[NanoPro] Initializing validator extension (Selection Mode)...');

        // Check if we're on a Nanonets page
        if (!isNanonetsPage()) {
            console.log('[NanoPro] Not a Nanonets page, skipping initialization');
            return;
        }

        // Inject UI overlay
        NanoProOverlay.inject();
        const container = NanoProOverlay.getContainer();

        if (!container) {
            console.error('[NanoPro] Failed to create overlay container');
            return;
        }

        // Create UI components
        NanoProBadge.create(container);
        NanoProPanel.create(container);

        // Set up badge interactions - clicking starts selection
        NanoProBadge.onRefresh(startSelectionMode);
        NanoProBadge.onClick(() => {
            if (validationResult && validationResult.summary) {
                NanoProPanel.toggle();
            } else {
                // No result yet, start selection
                startSelectionMode();
            }
        });

        // Set initial state - ready to scan
        NanoProBadge.setReady();

        // Watch for page navigation (SPA support)
        setupNavigationWatcher();

        isInitialized = true;
        console.log('[NanoPro] Initialization complete - Click the badge or refresh to select table area');
    }

    /**
     * Check if current page is a Nanonets page
     */
    function isNanonetsPage() {
        const url = window.location.href;
        return url.includes('nanonets.com');
    }

    /**
     * Setup watcher for page navigation (SPA detection)
     */
    function setupNavigationWatcher() {
        // Use History API to detect navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            handleNavigation();
        };

        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            handleNavigation();
        };

        // Also watch for popstate (back/forward buttons)
        window.addEventListener('popstate', handleNavigation);

        // Poll for URL changes (fallback for edge cases)
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                handleNavigation();
            }
        }, 1000);
    }

    /**
     * Handle page navigation - reset extension state
     */
    function handleNavigation() {
        const newUrl = window.location.href;

        if (newUrl !== currentUrl) {
            console.log('[NanoPro] Page changed, resetting...');
            currentUrl = newUrl;
            resetState();
        }
    }

    /**
     * Reset extension state
     */
    function resetState() {
        validationResult = null;
        lastSelection = null;
        NanoProPanel.close();
        NanoProBadge.setReady();
        console.log('[NanoPro] State reset - ready for new selection');
    }

    /**
     * Start the selection mode for table capture
     */
    function startSelectionMode() {
        if (NanoProSelector.isActive()) {
            console.log('[NanoPro] Selection already active');
            return;
        }

        console.log('[NanoPro] Starting selection mode...');
        NanoProBadge.setSelecting();

        NanoProSelector.start((selection) => {
            if (selection) {
                lastSelection = selection;
                processSelection(selection);
            } else {
                // Selection cancelled
                console.log('[NanoPro] Selection cancelled');
                updateBadgeState();
            }
        });
    }

    /**
     * Process the selected region
     */
    async function processSelection(selection) {
        console.log('[NanoPro] Processing selection:', selection);
        NanoProBadge.setLoading();

        try {
            // Step 1: Extract text from the selected region
            const textElements = NanoProCapture.extractTextFromRegion(selection);

            if (textElements.length === 0) {
                console.warn('[NanoPro] No text found in selection');
                NanoProBadge.setNoData();
                return;
            }

            console.log(`[NanoPro] Extracted ${textElements.length} text elements`);
            console.log('[NanoPro] Sample elements:', textElements.slice(0, 5));

            // Step 2: Parse into table structure
            const tableResult = NanoProTableParser.parseTable(textElements);

            if (!tableResult.success) {
                console.warn('[NanoPro] Table parsing failed:', tableResult.error);
                NanoProBadge.setNoData();
                return;
            }

            console.log(`[NanoPro] Parsed table with ${tableResult.rows.length} rows, ${tableResult.columns.length} columns`);

            // Step 3: Extract validation rows
            const validationData = NanoProTableParser.extractValidationRows(
                tableResult.rows,
                tableResult.columnMapping
            );

            if (!validationData.success) {
                console.warn('[NanoPro] Could not identify columns:', validationData.error);
                NanoProBadge.setNoData();
                showColumnSelectionUI(tableResult);
                return;
            }

            console.log(`[NanoPro] Ready to validate ${validationData.rows.length} rows`);
            console.log('[NanoPro] Validation data:', validationData.rows);

            // Step 4: Validate calculations
            validationResult = NanoProValidator.validateAll(validationData.rows);

            if (!validationResult.success) {
                console.error('[NanoPro] Validation failed:', validationResult.error);
                NanoProBadge.setNoData();
                return;
            }

            // Step 5: Update UI
            updateUI(validationResult);

            // Step 6: Auto-open panel to show results
            NanoProPanel.open();

            console.log('[NanoPro] Validation complete:', validationResult.summary);

        } catch (error) {
            console.error('[NanoPro] Processing error:', error);
            NanoProBadge.setNoData();
        }
    }

    /**
     * Show UI for manual column selection
     */
    function showColumnSelectionUI(tableResult) {
        console.log('[NanoPro] Could not auto-detect columns. Found columns at positions:');
        tableResult.columns.forEach((col, i) => {
            const headerCell = tableResult.rows[0]?.cells[i];
            console.log(`  Column ${i}: "${headerCell?.text || '(empty)'}" at X=${Math.round(col.center)}`);
        });
        console.log('[NanoPro] Please ensure the table has headers like "Qty", "Item_Price", "Line_Amount"');
    }

    /**
     * Update UI based on validation results
     */
    function updateUI(result) {
        const { summary } = result;

        if (summary.invalid > 0) {
            NanoProBadge.setInvalid(summary.invalid, summary.total);
        } else if (summary.incomplete > 0) {
            NanoProBadge.setIncomplete();
        } else {
            NanoProBadge.setValid(summary.total);
        }

        // Update panel content
        NanoProPanel.render(result);
    }

    /**
     * Update badge based on current state
     */
    function updateBadgeState() {
        if (validationResult && validationResult.summary) {
            updateUI(validationResult);
        } else {
            NanoProBadge.setReady();
        }
    }

    /**
     * Cleanup function
     */
    function cleanup() {
        NanoProSelector.cancel();
        NanoProOverlay.remove();
        isInitialized = false;
        validationResult = null;
        console.log('[NanoPro] Cleaned up');
    }

    /**
     * Expose public API for debugging
     */
    window.NanoPro = {
        select: startSelectionMode,
        getResult: () => validationResult,
        getLastSelection: () => lastSelection,
        reset: resetState,
        cleanup: cleanup,
        reinitialize: () => {
            cleanup();
            setTimeout(initialize, 100);
        },
        // Debug helpers
        debug: {
            captureRegion: (sel) => NanoProCapture.extractTextFromRegion(sel || lastSelection),
            parseTable: (texts) => NanoProTableParser.parseTable(texts),
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 100);
    }

    console.log('[NanoPro] Content script loaded (Selection Mode)');

    // Listen for keyboard shortcut commands from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'NANOPRO_COMMAND') {
            console.log('[NanoPro] Received command:', message.command);

            switch (message.command) {
                case 'start-selection':
                    startSelectionMode();
                    break;
                case 'toggle-panel':
                    if (validationResult) {
                        NanoProPanel.toggle();
                    } else {
                        startSelectionMode();
                    }
                    break;
                case 'reset-extension':
                    resetState();
                    break;
            }

            sendResponse({ success: true });
        }
        return true; // Keep message channel open for async response
    });

})();
