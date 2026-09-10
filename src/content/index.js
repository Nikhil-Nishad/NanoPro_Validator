/**
 * NanoPro Validator v2.0 — Main Content Script
 * 
 * Entry point with dual-mode support:
 * - Manual mode: User selects the table area with snipping tool
 * - Automatic mode: Auto-detects the table via CSS selectors
 * 
 * Mode persists via chrome.storage.local.
 * Resets on page navigation.
 */

(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        autoValidate: false,
        observeMutations: true,
        retryAttempts: 3,
        retryDelay: 1000,
        autoDetectDelay: 500  // Wait for React to render
    };

    // State
    let isInitialized = false;
    let currentMode = 'auto'; // 'auto' | 'manual'
    let validationResult = null;
    let lastSelection = null;
    let autoDetectTimer = null;
    let autoPollTimer = null;
    let lastDetectedStateHash = null;
    let initializedForFile = null;

    // Multi-page document state store (session scoped per invoice file)
    let multiPageStore = {
        fileHash: null,
        totalPages: 1,
        lastInvoiceAmount: null,
        pages: {} // pageNum -> { sumAmount: number, rowCount: number, results: array, timestamp: number }
    };

    /**
     * Initialize the extension
     */
    async function initialize() {
        if (isInitialized) {
            console.log('[NanoPro] Already initialized');
            return;
        }

        console.log('[NanoPro v2] Initializing validator extension...');

        if (!isNanonetsPage()) {
            console.log('[NanoPro] Not a Nanonets page, skipping initialization');
            return;
        }


        // v2: Load saved mode preference
        await loadMode();

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

        // Set up badge interactions
        NanoProBadge.onRefresh(handleRefresh);
        NanoProBadge.onClick(() => {
            if (validationResult && validationResult.summary) {
                NanoProPanel.toggle();
            } else {
                handleRefresh();
            }
        });

        // v2: Set up mode toggle callback
        NanoProBadge.onModeToggle(toggleMode);

        // Update badge for current mode
        updateBadgeForMode();

        // Start auto-detection if in auto mode
        if (currentMode === 'auto') {
            scheduleAutoDetect();
        }

        isInitialized = true;
        console.log(`[NanoPro v3] Initialization complete — Mode: ${currentMode}`);
    }

    /**
     * Check if current page is a Nanonets page
     */
    function isNanonetsPage() {
        return window.location.href.includes('nanonets.com');
    }

    /**
     * Check if current page is a single file page
     */
    function isSingleFilePage() {
        const hash = window.location.hash;
        return /^#\/ocr\/test\/[^/]+\/[^/?]+/.test(hash);
    }


    // ────────────────────────────────────────────────────────
    // MODE MANAGEMENT (v2)
    // ────────────────────────────────────────────────────────

    /**
     * Load mode from chrome.storage.local
     */
    async function loadMode() {
        try {
            const result = await chrome.storage.local.get('nanoProMode');
            currentMode = result.nanoProMode || 'manual';
            console.log('[NanoPro v2] Loaded mode:', currentMode);
        } catch (e) {
            console.log('[NanoPro v2] Could not load mode, defaulting to manual');
            currentMode = 'manual';
        }
    }

    /**
     * Save mode to chrome.storage.local
     */
    async function saveMode(mode) {
        try {
            await chrome.storage.local.set({ nanoProMode: mode });
            console.log('[NanoPro v2] Saved mode:', mode);
        } catch (e) {
            console.log('[NanoPro v2] Could not save mode');
        }
    }

    /**
     * Toggle between auto and manual modes
     */
    async function toggleMode() {
        const newMode = currentMode === 'auto' ? 'manual' : 'auto';
        console.log(`[NanoPro v2] Switching mode: ${currentMode} → ${newMode}`);

        currentMode = newMode;
        await saveMode(newMode);

        // Reset state when switching modes
        validationResult = null;
        lastSelection = null;
        NanoProPanel.close();

        // Update badge display
        updateBadgeForMode();

        // Handle mode-specific setup
        if (newMode === 'auto') {
            scheduleAutoDetect();
            setupMutationObserver();
        } else {
            clearAutoDetect();
            teardownMutationObserver();
            NanoProBadge.setReady();
        }
    }

    /**
     * Update badge state text for current mode
     */
    function updateBadgeForMode() {
        if (typeof NanoProBadge.setMode === 'function') {
            NanoProBadge.setMode(currentMode);
        }
    }

    // ────────────────────────────────────────────────────────
    // AUTOMATIC MODE (v2)
    // ────────────────────────────────────────────────────────

    /**
     * Schedule auto-detection after delay (wait for React render)
     */
    function scheduleAutoDetect() {
        clearAutoDetect();
        console.log(`[NanoPro v2] Auto-detect scheduled in ${CONFIG.autoDetectDelay}ms`);
        autoDetectTimer = setTimeout(runAutoDetection, CONFIG.autoDetectDelay);

        // Start non-intrusive 1-second background polling for fast recalculation
        autoPollTimer = setInterval(() => {
            if (currentMode === 'auto') {
                runAutoDetection(0, true); // true = isBackgroundPoll
            }
        }, 1000);
    }

    /**
     * Clear pending auto-detection and background polling
     */
    function clearAutoDetect() {
        if (autoDetectTimer) {
            clearTimeout(autoDetectTimer);
            autoDetectTimer = null;
        }
        if (autoPollTimer) {
            clearInterval(autoPollTimer);
            autoPollTimer = null;
        }
    }

    /**
     * Run automatic table detection and validation
     */
    async function runAutoDetection(retryCount = 0, isBackgroundPoll = false) {
        if (currentMode !== 'auto') return;

        if (!isBackgroundPoll) {
            console.log(`[NanoPro v2] Running auto-detection (attempt ${retryCount + 1})...`);
            NanoProBadge.setLoading();
        }

        try {
            // Use AutoDetector to find and extract table
            const detectResult = NanoProAutoDetector.detect();

            if (!detectResult.success) {
                if (!isBackgroundPoll) {
                    console.warn('[NanoPro v2] Auto-detection failed:', detectResult.message);
                }

                // Retry if table might not have loaded yet
                if (retryCount < CONFIG.retryAttempts && !isBackgroundPoll) {
                    console.log(`[NanoPro v2] Retrying in ${CONFIG.retryDelay}ms...`);
                    autoDetectTimer = setTimeout(
                        () => runAutoDetection(retryCount + 1),
                        CONFIG.retryDelay
                    );
                    return;
                }

                NanoProBadge.setNoData();
                lastDetectedStateHash = null;
                return;
            }

            // --- State Hashing for Performance ---
            // Create a simple string representation of the parsed table + sidebar fields to check if DOM changed
            const sidebarFields = NanoProAutoDetector.findSidebarFields ? 
                NanoProAutoDetector.findSidebarFields() : 
                { invoiceAmount: NanoProAutoDetector.findInvoiceAmount() };

            const isRentalHash = (sidebarFields.isRental || []).map(r => r.raw).join(',');
            const sidebarHash = [
                sidebarFields.invoiceAmount?.raw || 'no-inv',
                sidebarFields.invoiceAmount?.multiple ? 'multi-inv' : '',
                sidebarFields.environment?.raw || 'no-env',
                isRentalHash,
                sidebarFields.tradePartnerName?.raw || 'no-tp',
                sidebarFields.pageInfo?.raw || 'no-page'
            ].join('|');

            const currentStateHash = JSON.stringify(detectResult.rows) + '|' + sidebarHash;

            if (currentStateHash === lastDetectedStateHash) {
                // The inputs on the screen haven't changed since last validation, silently discard to save cycles
                return;
            }

            if (isBackgroundPoll) {
                console.log(`[NanoPro v2] Background poll detected changes, re-validating...`);
                NanoProBadge.setLoading();
            }

            // Cache the new hash
            lastDetectedStateHash = currentStateHash;

            // We have extracted rows — validate them
            processAutoDetectedRows(detectResult.rows, detectResult.columnMapping, sidebarFields);

        } catch (error) {
            console.error('[NanoPro v2] Auto-detection error:', error);
            NanoProBadge.setNoData();
        }
    }

    /**
     * Process auto-detected rows through validation pipeline
     */
    function processAutoDetectedRows(rows, columnMapping, sidebarFields = null) {
        console.log(`[NanoPro v3] Validating ${rows.length} auto-detected rows`);

        const fields = sidebarFields || (NanoProAutoDetector.findSidebarFields ? 
            NanoProAutoDetector.findSidebarFields() : 
            { invoiceAmount: NanoProAutoDetector.findInvoiceAmount(), pageInfo: NanoProAutoDetector.detectPageInfo() });

        const pageInfo = fields.pageInfo || { currentPage: 1, totalPages: 1, isMultiPage: false, raw: 'Page 1 of 1' };
        const currentPage = pageInfo.currentPage || 1;
        const totalPages = pageInfo.totalPages || 1;

        // Convert raw string values to the {value, confidence} format the validator expects
        // NanoProParser.parse() returns { value: number, confidence: 0-1, original: string }
        const validationRows = rows.map(row => ({
            qty: row.qty ? NanoProParser.parse(row.qty) : null,
            price: row.price ? NanoProParser.parse(row.price) : null,
            amount: row.amount ? NanoProParser.parse(row.amount) : null
        }));

        // Keep raw item_no for each row (not parsed as number)
        // Use ?? instead of || to preserve empty strings ("" is a valid blank value)
        const rawItemNos = rows.map(row => row.item_no ?? null);
        const hasItemNoColumn = !!(columnMapping && columnMapping.item_no);

        console.log('[NanoPro v3] Validation input:', validationRows);
        console.log('[NanoPro v3] Item_No column detected:', hasItemNoColumn);

        // Validate calculations
        validationResult = NanoProValidator.validateAll(validationRows);

        if (!validationResult.success) {
            console.error('[NanoPro v3] Validation failed:', validationResult.error);
            NanoProBadge.setNoData();
            return;
        }

        // Calculate current page's sum of Line_Amount
        let pageSum = 0;
        let pageSummedRows = 0;
        for (const row of validationResult.results) {
            if (row.actual !== undefined && row.actual !== null) {
                pageSum += row.actual;
                pageSummedRows++;
            } else if (row.originalRow?.amount?.value !== null && row.originalRow?.amount?.value !== undefined) {
                pageSum += row.originalRow.amount.value;
                pageSummedRows++;
            }
        }
        pageSum = NanoProParser.round(pageSum, 2);

        // Update multiPageStore
        if (multiPageStore.fileHash !== window.location.hash) {
            multiPageStore.fileHash = window.location.hash;
            multiPageStore.pages = {};
            multiPageStore.lastInvoiceAmount = null;
        }
        multiPageStore.totalPages = Math.max(multiPageStore.totalPages || 1, totalPages);
        multiPageStore.pages[currentPage] = {
            sumAmount: pageSum,
            rowCount: pageSummedRows,
            results: validationResult.results,
            timestamp: Date.now()
        };
        if (fields.invoiceAmount) {
            multiPageStore.lastInvoiceAmount = fields.invoiceAmount;
        }

        // Attach supplementary validations
        attachTotalValidation(validationResult, fields.invoiceAmount, pageInfo);
        const sidebarResult = attachSidebarValidation(validationResult, fields);
        attachItemNoValidation(validationResult, rawItemNos, hasItemNoColumn, sidebarResult?.rentalStatus);

        // Update UI
        updateUI(validationResult);
        NanoProPanel.render(validationResult);

        console.log('[NanoPro v3] Auto-validation complete:', validationResult.summary);

        // Start mutation observer for live re-validation
        setupMutationObserver();
    }

    /**
     * Attach total validation:
     * - If single page: compares current page line amount sum with invoice_amount
     * - If multi-page: accumulates Line_Amount from all pages/tables and verifies
     *   that the cumulative sum equals the invoice_amount (located on the last page)
     */
    function attachTotalValidation(result, invoiceAmountInput = null, pageInfo = null) {
        if (!result || !result.success || !result.results) return;

        try {
            const page = pageInfo || (result.sidebarValidation?.pageInfo) || NanoProAutoDetector.detectPageInfo();
            const currentPage = page?.currentPage || 1;
            const totalPages = Math.max(page?.totalPages || 1, multiPageStore.totalPages || 1);
            const isMultiPage = totalPages > 1;

            // Current page line amount sum
            let pageSum = 0;
            let pageSummedRows = 0;
            for (const row of result.results) {
                if (row.actual !== undefined && row.actual !== null) {
                    pageSum += row.actual;
                    pageSummedRows++;
                } else if (row.originalRow && row.originalRow.amount && row.originalRow.amount.value !== null) {
                    pageSum += row.originalRow.amount.value;
                    pageSummedRows++;
                }
            }
            pageSum = NanoProParser.round(pageSum, 2);

            // Cumulative sum across all pages in multiPageStore
            let cumulativeSum = 0;
            let totalSummedRows = 0;
            const recordedPages = Object.keys(multiPageStore.pages).map(Number).sort((a, b) => a - b);
            const pageBreakdown = {};

            for (const p of recordedPages) {
                const pData = multiPageStore.pages[p];
                cumulativeSum += pData.sumAmount;
                totalSummedRows += pData.rowCount;
                pageBreakdown[p] = pData.sumAmount;
            }
            cumulativeSum = NanoProParser.round(cumulativeSum, 2);

            const missingPages = [];
            for (let p = 1; p <= totalPages; p++) {
                if (!multiPageStore.pages[p]) {
                    missingPages.push(p);
                }
            }
            const hasAllPages = missingPages.length === 0;
            const isLastPage = (currentPage === totalPages);

            // Find invoice_amount from parameter, sidebar or cache
            const invoiceAmount = invoiceAmountInput || 
                                  NanoProAutoDetector.findInvoiceAmount() || 
                                  multiPageStore.lastInvoiceAmount;

            if (invoiceAmount) {
                multiPageStore.lastInvoiceAmount = invoiceAmount;
            }

            // --- Multiplicity check ---
            if (invoiceAmount && invoiceAmount.multiple) {
                result.totalValidation = {
                    isMultiPage: isMultiPage,
                    currentPage: currentPage,
                    totalPages: totalPages,
                    pageSum: pageSum,
                    sumAmount: isMultiPage ? cumulativeSum : pageSum,
                    summedRows: isMultiPage ? totalSummedRows : pageSummedRows,
                    recordedPages: recordedPages,
                    missingPages: missingPages,
                    pageBreakdown: pageBreakdown,
                    invoiceAmount: invoiceAmount.value,
                    invoiceAmountRaw: invoiceAmount.raw,
                    status: 'MULTIPLE_INSTANCES',
                    message: `Multiple invoice_amount instances found (${invoiceAmount.count})`
                };
                console.warn(`[NanoPro] Total: Multiple invoice_amount instances (${invoiceAmount.count})`);
                return;
            }

            // --- SINGLE PAGE DOCUMENT ---
            if (!isMultiPage) {
                if (!invoiceAmount) {
                    result.totalValidation = {
                        isMultiPage: false,
                        currentPage: 1,
                        totalPages: 1,
                        pageSum: pageSum,
                        sumAmount: pageSum,
                        summedRows: pageSummedRows,
                        invoiceAmount: null,
                        status: 'NOT_FOUND',
                        message: 'invoice_amount not found in sidebar'
                    };
                    console.log(`[NanoPro] Total: Sum=${pageSum} | Invoice Amount: not found`);
                    return;
                }

                const diff = NanoProParser.round(Math.abs(pageSum - invoiceAmount.value), 2);
                const tolerance = 0.10;
                const isMatch = diff <= tolerance;

                result.totalValidation = {
                    isMultiPage: false,
                    currentPage: 1,
                    totalPages: 1,
                    pageSum: pageSum,
                    sumAmount: pageSum,
                    summedRows: pageSummedRows,
                    invoiceAmount: invoiceAmount.value,
                    invoiceAmountRaw: invoiceAmount.raw,
                    difference: diff,
                    tolerance: tolerance,
                    status: isMatch ? 'MATCH' : 'MISMATCH',
                    selector: invoiceAmount.selector
                };

                console.log(`[NanoPro] Single Page Total: Sum=${pageSum} | Invoice=${invoiceAmount.value} | Diff=${diff} | ${isMatch ? '✅ Match' : '❌ Mismatch'}`);
                return;
            }

            // --- MULTI PAGE DOCUMENT ---
            // If we are NOT on the last page and don't have all pages recorded:
            if (!isLastPage && !hasAllPages) {
                result.totalValidation = {
                    isMultiPage: true,
                    currentPage: currentPage,
                    totalPages: totalPages,
                    pageSum: pageSum,
                    sumAmount: cumulativeSum,
                    summedRows: totalSummedRows,
                    recordedPages: recordedPages,
                    missingPages: missingPages,
                    pageBreakdown: pageBreakdown,
                    invoiceAmount: invoiceAmount?.value || null,
                    status: 'MULTI_PAGE_PENDING',
                    message: `Page ${currentPage} of ${totalPages} recorded (Sum: $${pageSum.toFixed(2)}). Visited [${recordedPages.join(', ')}] of ${totalPages}. Navigate to page ${totalPages} for final invoice total.`
                };
                console.log(`[NanoPro] MultiPage: Page ${currentPage}/${totalPages} recorded (Sum: ${pageSum}, Cumulative: ${cumulativeSum}). Pending page ${totalPages}.`);
                return;
            }

            // We are on the last page, or we have recorded all pages!
            if (!invoiceAmount) {
                result.totalValidation = {
                    isMultiPage: true,
                    currentPage: currentPage,
                    totalPages: totalPages,
                    pageSum: pageSum,
                    sumAmount: cumulativeSum,
                    summedRows: totalSummedRows,
                    recordedPages: recordedPages,
                    missingPages: missingPages,
                    pageBreakdown: pageBreakdown,
                    invoiceAmount: null,
                    status: 'NOT_FOUND',
                    message: `invoice_amount not found on last page (Page ${totalPages})`
                };
                console.log(`[NanoPro] MultiPage: Cumulative Sum=${cumulativeSum} | invoice_amount not found on last page`);
                return;
            }

            if (!hasAllPages) {
                // On last page, but skipped earlier pages
                result.totalValidation = {
                    isMultiPage: true,
                    currentPage: currentPage,
                    totalPages: totalPages,
                    pageSum: pageSum,
                    sumAmount: cumulativeSum,
                    summedRows: totalSummedRows,
                    recordedPages: recordedPages,
                    missingPages: missingPages,
                    pageBreakdown: pageBreakdown,
                    invoiceAmount: invoiceAmount.value,
                    invoiceAmountRaw: invoiceAmount.raw,
                    status: 'PAGES_MISSING',
                    message: `Missing earlier pages: [${missingPages.join(', ')}] of ${totalPages}. Please visit all pages to accumulate all line items.`
                };
                console.warn(`[NanoPro] MultiPage: Missing pages [${missingPages.join(', ')}] of ${totalPages}`);
                return;
            }

            // All pages recorded & invoice_amount present! Compare cumulative sum to invoice_amount
            const diff = NanoProParser.round(Math.abs(cumulativeSum - invoiceAmount.value), 2);
            const tolerance = 0.10;
            const isMatch = diff <= tolerance;

            result.totalValidation = {
                isMultiPage: true,
                currentPage: currentPage,
                totalPages: totalPages,
                pageSum: pageSum,
                sumAmount: cumulativeSum,
                summedRows: totalSummedRows,
                recordedPages: recordedPages,
                missingPages: [],
                pageBreakdown: pageBreakdown,
                invoiceAmount: invoiceAmount.value,
                invoiceAmountRaw: invoiceAmount.raw,
                difference: diff,
                tolerance: tolerance,
                status: isMatch ? 'MATCH' : 'MISMATCH',
                selector: invoiceAmount.selector
            };

            console.log(`[NanoPro] MultiPage Total (${totalPages} pages): Cumulative Sum=${cumulativeSum} | Invoice=${invoiceAmount.value} | Diff=${diff} | ${isMatch ? '✅ Match' : '❌ Mismatch'}`);

        } catch (e) {
            console.warn('[NanoPro] Total validation error:', e.message);
            result.totalValidation = { status: 'ERROR', message: e.message };
        }
    }

    /**
     * Attach Sidebar Validations:
     * 1. Environment === 'prod' (case-insensitive)
     * 2. is_rental: all instances must be identical (all True or all False)
     * 3. trade_partner_name: must be present and not null or blank
     * 4. invoice_amount: must not have multiple instances
     */
    function attachSidebarValidation(result, sidebarFields) {
        if (!result || !result.success) return { rentalStatus: null };

        try {
            const env = sidebarFields?.environment !== undefined ? 
                sidebarFields.environment : NanoProAutoDetector.findEnvironment();
            const rentalInstances = sidebarFields?.isRental !== undefined ? 
                sidebarFields.isRental : NanoProAutoDetector.findIsRental();
            const tradePartner = sidebarFields?.tradePartnerName !== undefined ? 
                sidebarFields.tradePartnerName : NanoProAutoDetector.findTradePartnerName();
            const pageInfo = sidebarFields?.pageInfo !== undefined ? 
                sidebarFields.pageInfo : NanoProAutoDetector.detectPageInfo();
            const invoiceAmount = sidebarFields?.invoiceAmount !== undefined ? 
                sidebarFields.invoiceAmount : NanoProAutoDetector.findInvoiceAmount();

            const errors = [];
            const warnings = [];

            // 1. Environment check: must be present and equal to "prod" (case-insensitive)
            let envStatus = 'VALID';
            let envMessage = '';
            if (!env || !env.raw || env.raw.trim() === '') {
                envStatus = 'ERROR';
                envMessage = 'Environment not found in sidebar';
                errors.push({ field: 'Environment', message: envMessage });
            } else if (env.raw.trim().toLowerCase() !== 'prod') {
                envStatus = 'ERROR';
                envMessage = `Environment is "${env.raw.trim()}", expected "prod"`;
                errors.push({ field: 'Environment', message: envMessage });
            } else {
                envMessage = 'prod';
            }

            // 2. is_rental check: must be present and all values must be identical (all True or all False)
            let rentalStatus = {
                status: 'VALID',
                allTrue: false,
                allFalse: false,
                isConsistent: false,
                values: [],
                message: ''
            };

            if (!rentalInstances || rentalInstances.length === 0) {
                rentalStatus.status = 'ERROR';
                rentalStatus.message = 'is_rental not found in sidebar';
                errors.push({ field: 'is_rental', message: rentalStatus.message });
            } else {
                const normalizedValues = rentalInstances.map(r => (r.raw || '').trim().toLowerCase());
                rentalStatus.values = rentalInstances.map(r => (r.raw || '').trim());

                const firstVal = normalizedValues[0];
                const allSame = normalizedValues.every(v => v === firstVal);

                if (!allSame) {
                    rentalStatus.status = 'ERROR';
                    rentalStatus.isConsistent = false;
                    rentalStatus.message = `Inconsistent is_rental values: [${rentalStatus.values.join(', ')}]`;
                    errors.push({ field: 'is_rental', message: rentalStatus.message });
                } else {
                    rentalStatus.isConsistent = true;
                    if (firstVal === 'true') {
                        rentalStatus.allTrue = true;
                        rentalStatus.message = 'All True (Rental)';
                    } else if (firstVal === 'false') {
                        rentalStatus.allFalse = true;
                        rentalStatus.message = 'All False (Non-Rental)';
                    } else {
                        rentalStatus.status = 'ERROR';
                        rentalStatus.message = `Invalid is_rental value: "${rentalStatus.values[0]}"`;
                        errors.push({ field: 'is_rental', message: rentalStatus.message });
                    }
                }
            }

            // 3. trade_partner_name check: must be present and not null/blank
            let tradePartnerStatus = 'VALID';
            let tradePartnerMessage = '';
            if (!tradePartner || tradePartner.raw === null || tradePartner.raw === undefined) {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = 'trade_partner_name not found in sidebar';
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else if (tradePartner.raw.trim() === '') {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = 'trade_partner_name is blank';
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else {
                tradePartnerMessage = tradePartner.raw.trim();
            }

            // 4. invoice_amount multiplicity check
            let invoiceAmountMultiplicity = { status: 'VALID', message: '' };
            if (invoiceAmount && invoiceAmount.multiple) {
                invoiceAmountMultiplicity.status = 'ERROR';
                invoiceAmountMultiplicity.message = `Multiple instances of invoice_amount detected (${invoiceAmount.count})`;
                errors.push({ field: 'invoice_amount', message: invoiceAmountMultiplicity.message });
            }

            const sidebarValidation = {
                isValid: errors.length === 0,
                errors: errors,
                warnings: warnings,
                environment: {
                    status: envStatus,
                    value: env?.raw?.trim() || null,
                    message: envMessage
                },
                isRental: rentalStatus,
                tradePartner: {
                    status: tradePartnerStatus,
                    value: tradePartner?.raw?.trim() || null,
                    message: tradePartnerMessage
                },
                invoiceAmountMultiplicity: invoiceAmountMultiplicity,
                pageInfo: pageInfo
            };

            result.sidebarValidation = sidebarValidation;
            console.log('[NanoPro] Sidebar validation:', sidebarValidation);
            return { rentalStatus };

        } catch (e) {
            console.warn('[NanoPro] Sidebar validation error:', e.message);
            result.sidebarValidation = {
                isValid: false,
                errors: [{ field: 'sidebar', message: e.message }],
                warnings: []
            };
            return { rentalStatus: null };
        }
    }

    /**
     * Attach Item_No validation:
     * - Check Item_No is not ONLY "-R" (flag as ERROR if so)
     * - If is_rental is all True, item_no should have -R suffix (flag as CAUTION if missing)
     * - If is_rental is all False, item_no must NOT have -R suffix (flag as ERROR if present)
     * - Check for blank Item_No when column exists
     */
    function attachItemNoValidation(result, rawItemNos, hasItemNoColumn = true, rentalStatus = null) {
        if (!result || !result.success || !result.results) return;

        try {
            const warnings = [];
            const errors = [];
            const ENDS_WITH_R_PATTERN = /-\s*R\s*$/i; 
            const ONLY_R_PATTERN = /^-\s*R\s*$/i;

            for (let i = 0; i < result.results.length; i++) {
                const itemNo = rawItemNos[i] !== undefined ? rawItemNos[i] : null;
                const rowNumber = result.results[i].rowNumber || (i + 1);
                let reason = null;
                let severity = 'CAUTION'; // 'CAUTION' or 'ERROR'

                if (itemNo === null || itemNo === undefined) {
                    // Only flag as BLANK if the column actually exists in the table headers
                    if (hasItemNoColumn) {
                        reason = 'BLANK';
                        severity = 'CAUTION';
                    }
                } else if (typeof itemNo === 'string' && itemNo.trim() === '') {
                    reason = 'BLANK';
                    severity = 'CAUTION';
                } else if (typeof itemNo === 'string') {
                    const trimmed = itemNo.trim();
                    const hasDashRSuffix = ENDS_WITH_R_PATTERN.test(trimmed);
                    const isOnlyDashR = ONLY_R_PATTERN.test(trimmed);

                    // Rule 3: Must NOT be ONLY -R
                    if (isOnlyDashR) {
                        reason = 'ONLY_DASH_R';
                        severity = 'ERROR';
                    } else if (rentalStatus && rentalStatus.isConsistent) {
                        // Rule 4: If is_rental is all True only then there should be -R in item_no
                        if (rentalStatus.allTrue) {
                            if (!hasDashRSuffix) {
                                reason = 'MISSING_DASH_R';
                                severity = 'CAUTION'; // As requested by user: flag as caution
                            }
                        } else if (rentalStatus.allFalse) {
                            if (hasDashRSuffix) {
                                reason = 'UNEXPECTED_DASH_R';
                                severity = 'ERROR';
                            }
                        }
                    } else if (rentalStatus && rentalStatus.status === 'ERROR') {
                        // If is_rental had error/inconsistent, flag unexpected -R as error
                        if (hasDashRSuffix) {
                            reason = 'UNEXPECTED_DASH_R';
                            severity = 'ERROR';
                        }
                    }
                }

                if (reason) {
                    const item = {
                        rowIndex: i,
                        rowNumber: rowNumber,
                        value: itemNo,
                        reason: reason,
                        severity: severity
                    };
                    warnings.push(item);
                    if (severity === 'ERROR') {
                        errors.push(item);
                    }

                    // Annotate the row result
                    result.results[i].itemNoWarning = true;
                    result.results[i].itemNoValue = itemNo;
                    result.results[i].itemNoReason = reason;
                    result.results[i].itemNoSeverity = severity;
                } else {
                    result.results[i].itemNoWarning = false;
                    result.results[i].itemNoValue = itemNo;
                    result.results[i].itemNoReason = null;
                    result.results[i].itemNoSeverity = null;
                }
            }

            result.itemNoWarnings = warnings;
            result.itemNoErrors = errors;

            if (warnings.length > 0) {
                console.log(`[NanoPro] Item_No: ${warnings.length} issue(s) found:`,
                    warnings.map(w => `Row ${w.rowNumber}: [${w.severity}] ${w.reason} ("${w.value}")`));
            } else {
                console.log('[NanoPro] Item_No: All rows OK');
            }

        } catch (e) {
            console.warn('[NanoPro] Item_No validation error:', e.message);
            result.itemNoWarnings = [];
            result.itemNoErrors = [];
        }
    }

    /**
     * Setup DOM mutation observer for auto-mode re-validation
     */
    function setupMutationObserver() {
        if (mutationObserver || currentMode !== 'auto') return;

        const target = document.querySelector(NanoProAutoDetector.PRIMARY_SELECTOR);
        if (!target) return;

        let debounceTimer = null;

        mutationObserver = new MutationObserver((mutations) => {
            // Debounce: only re-validate after mutations settle
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log('[NanoPro v2] Table mutation detected, re-validating...');
                runAutoDetection();
            }, 300);
        });

        mutationObserver.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['value']
        });

        console.log('[NanoPro v2] MutationObserver active on table container');
    }

    /**
     * Teardown mutation observer
     */
    function teardownMutationObserver() {
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
            console.log('[NanoPro v2] MutationObserver disconnected');
        }
    }

    // ────────────────────────────────────────────────────────
    // MANUAL MODE (unchanged from v1)
    // ────────────────────────────────────────────────────────

    /**
     * Handle refresh/badge click action based on mode
     */
    function handleRefresh() {
        if (currentMode === 'auto') {
            runAutoDetection();
        } else {
            startSelectionMode();
        }
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
                console.log('[NanoPro] Selection cancelled');
                updateBadgeState();
            }
        });
    }

    /**
     * Process the selected region (manual mode)
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

            // Step 4b: Attach sidebar & multi-page validations
            const fields = NanoProAutoDetector.findSidebarFields ? 
                NanoProAutoDetector.findSidebarFields() : 
                { invoiceAmount: NanoProAutoDetector.findInvoiceAmount(), pageInfo: NanoProAutoDetector.detectPageInfo() };

            const pageInfo = fields.pageInfo || { currentPage: 1, totalPages: 1, isMultiPage: false, raw: 'Page 1 of 1' };
            const currentPage = pageInfo.currentPage || 1;
            const totalPages = pageInfo.totalPages || 1;

            // Compute page sum
            let pageSum = 0;
            let pageSummedRows = 0;
            for (const row of validationResult.results) {
                if (row.actual !== undefined && row.actual !== null) {
                    pageSum += row.actual;
                    pageSummedRows++;
                } else if (row.originalRow?.amount?.value !== null && row.originalRow?.amount?.value !== undefined) {
                    pageSum += row.originalRow.amount.value;
                    pageSummedRows++;
                }
            }
            pageSum = NanoProParser.round(pageSum, 2);

            // Update multiPageStore
            if (multiPageStore.fileHash !== window.location.hash) {
                multiPageStore.fileHash = window.location.hash;
                multiPageStore.pages = {};
                multiPageStore.lastInvoiceAmount = null;
            }
            multiPageStore.totalPages = Math.max(multiPageStore.totalPages || 1, totalPages);
            multiPageStore.pages[currentPage] = {
                sumAmount: pageSum,
                rowCount: pageSummedRows,
                results: validationResult.results,
                timestamp: Date.now()
            };
            if (fields.invoiceAmount) {
                multiPageStore.lastInvoiceAmount = fields.invoiceAmount;
            }

            attachTotalValidation(validationResult, fields.invoiceAmount, pageInfo);
            attachSidebarValidation(validationResult, fields);

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

    // ────────────────────────────────────────────────────────
    // NAVIGATION & UI (shared)
    // ────────────────────────────────────────────────────────

    /**
     * Setup watcher for page navigation (SPA detection)
     */
    function setupNavigationWatcher() {
        // Fallback for native popstate events
        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('hashchange', handleNavigation);

        // React SPA polling: Check URL hash changes periodically since 
        // isolated content scripts cannot reliably intercept history.pushState 
        // without injecting scripts into the main page world.
        setInterval(() => {
            const currentHash = window.location.hash;
            if (currentHash !== initializedForFile && 
                !(initializedForFile === null && !isSingleFilePage())) {
                handleNavigation();
            }
        }, 500);
    }

    /**
     * Handle page navigation — reset and re-detect
     */
    function handleNavigation() {
        const currentHash = window.location.hash;

        if (!isSingleFilePage()) {
            if (isInitialized) {
                console.log('[NanoPro v3] Left single file page, cleaning up...');
                cleanup();
                initializedForFile = null;
            }
            return;
        }

        if (currentHash === initializedForFile) {
            return; // Already initialized for this file
        }

        console.log(`[NanoPro v3] Entered single file page: ${currentHash}`);
        initializedForFile = currentHash;

        if (isInitialized) {
            console.log('[NanoPro v3] File changed, resetting state...');
            resetState();
            if (currentMode === 'auto') {
                scheduleAutoDetect();
            }
        } else {
            initialize();
        }
    }

    /**
     * Reset extension state
     */
    function resetState() {
        validationResult = null;
        lastSelection = null;
        lastDetectedStateHash = null;
        multiPageStore = {
            fileHash: window.location.hash,
            totalPages: 1,
            lastInvoiceAmount: null,
            pages: {}
        };
        clearAutoDetect();
        teardownMutationObserver();
        NanoProPanel.close();

        if (currentMode === 'auto') {
            NanoProBadge.setState('ready');
        } else {
            NanoProBadge.setReady();
        }

        console.log('[NanoPro v3] State reset');
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
        const sidebarErrors = result.sidebarValidation?.errors || [];
        const itemNoErrors = result.itemNoErrors || [];
        const itemNoWarnings = (result.itemNoWarnings || []).filter(w => w.severity !== 'ERROR');

        const hasTotalMismatch = result.totalValidation && result.totalValidation.status === 'MISMATCH';
        const hasTotalNotFound = result.totalValidation && result.totalValidation.status === 'NOT_FOUND';
        const hasTotalMultiple = result.totalValidation && result.totalValidation.status === 'MULTIPLE_INSTANCES';
        const hasTotalPagesMissing = result.totalValidation && result.totalValidation.status === 'PAGES_MISSING';
        const isMultiPagePending = result.totalValidation && result.totalValidation.status === 'MULTI_PAGE_PENDING';

        // Errors: calculation mismatches, sidebar failures, item_no critical errors, multiple totals
        const totalErrorCount = (summary?.invalid || 0) + sidebarErrors.length + itemNoErrors.length + (hasTotalMultiple ? 1 : 0);

        // Cautions: item_no cautions (e.g. missing -R on rental), total mismatch/missing, or missing earlier pages
        const isCaution = itemNoWarnings.length > 0 || hasTotalMismatch || hasTotalNotFound || hasTotalPagesMissing;

        const badgeEl = NanoProOverlay.getShadow()?.querySelector('.nanopro-badge');

        // Trigger shake animation if there are errors or cautions
        if ((totalErrorCount > 0 || isCaution) && badgeEl) {
            badgeEl.classList.remove('shake');
            void badgeEl.offsetWidth; // Trigger reflow to restart CSS animation
            badgeEl.classList.add('shake');
        }

        if (totalErrorCount > 0) {
            if (badgeEl) badgeEl.classList.remove('has-caution');
            NanoProBadge.setInvalid(totalErrorCount, summary?.total || 0);

            const textEl = badgeEl?.querySelector('.nanopro-badge-text');
            if (textEl) {
                const errorReasons = [];
                if (summary?.invalid > 0) errorReasons.push(`${summary.invalid} Calc Error${summary.invalid > 1 ? 's' : ''}`);
                if (sidebarErrors.length > 0) errorReasons.push(`${sidebarErrors[0].field} Error`);
                if (itemNoErrors.length > 0) errorReasons.push(`Item_No Error`);
                if (hasTotalMultiple) errorReasons.push(`Multiple Totals`);
                textEl.textContent = `❌ ` + errorReasons.join(' | ');
            }
        } else if (summary?.incomplete > 0) {
            if (badgeEl) badgeEl.classList.remove('has-caution');
            NanoProBadge.setIncomplete();
        } else if (isCaution) {
            if (badgeEl) badgeEl.classList.add('has-caution');
            NanoProBadge.setIncomplete();

            let cautionMessages = [];
            if (hasTotalPagesMissing) cautionMessages.push(`Missing Pages`);
            if (hasTotalMismatch) cautionMessages.push(result.totalValidation?.isMultiPage ? 'Multi Total Mismatch' : 'Total Mismatch');
            if (hasTotalNotFound) cautionMessages.push('Missing Total');
            if (itemNoWarnings.length > 0) cautionMessages.push(`${itemNoWarnings.length} Item Caution${itemNoWarnings.length > 1 ? 's' : ''}`);

            const textEl = badgeEl?.querySelector('.nanopro-badge-text');
            if (textEl) {
                textEl.textContent = `⚠️ ` + cautionMessages.join(' | ');
            }
        } else {
            if (badgeEl) badgeEl.classList.remove('has-caution');
            NanoProBadge.setValid(summary?.total || 0);

            const textEl = badgeEl?.querySelector('.nanopro-badge-text');
            if (textEl) {
                if (isMultiPagePending) {
                    const tv = result.totalValidation;
                    textEl.textContent = `📄 Page ${tv.currentPage}/${tv.totalPages} (${tv.recordedPages.length}/${tv.totalPages} Scanned)`;
                } else if (result.totalValidation?.isMultiPage && result.totalValidation?.status === 'MATCH') {
                    textEl.textContent = `✅ All ${result.totalValidation.totalPages} Pages Match`;
                }
            }
        }

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
        clearAutoDetect();
        teardownMutationObserver();
        NanoProOverlay.remove();
        isInitialized = false;
        validationResult = null;
        console.log('[NanoPro v2] Cleaned up');
    }

    /**
     * Expose public API for debugging
     */
    window.NanoPro = {
        select: startSelectionMode,
        autoDetect: runAutoDetection,
        getResult: () => validationResult,
        getLastSelection: () => lastSelection,
        getMode: () => currentMode,
        setMode: async (mode) => {
            if (mode === 'auto' || mode === 'manual') {
                currentMode = mode;
                await saveMode(mode);
                updateBadgeForMode();
            }
        },
        reset: resetState,
        cleanup: cleanup,
        reinitialize: () => {
            cleanup();
            setTimeout(initialize, 100);
        },
        debug: {
            captureRegion: (sel) => NanoProCapture.extractTextFromRegion(sel || lastSelection),
            parseTable: (texts) => NanoProTableParser.parseTable(texts),
            detectTable: () => NanoProAutoDetector.detect(),
            diagnose: () => NanoProAutoDetector.diagnose()
        }
    };

    // Boot sequence for v3 SPA handling
    function boot() {
        if (!isNanonetsPage()) return;
        
        setupNavigationWatcher();
        handleNavigation(); // Trigger initial page load check
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 100);
    }

    console.log('[NanoPro v3] Content script loaded');

    // Listen for keyboard shortcut commands from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'NANOPRO_COMMAND') {
            console.log('[NanoPro v2] Received command:', message.command);

            switch (message.command) {
                case 'start-selection':
                    startSelectionMode();
                    break;
                case 'toggle-panel':
                    if (validationResult) {
                        NanoProPanel.toggle();
                    } else {
                        handleRefresh();
                    }
                    break;
                case 'reset-extension':
                    resetState();
                    break;
                case 'toggle-mode':
                    toggleMode();
                    break;
            }

            sendResponse({ success: true });
        }
        return true;
    });

})();
