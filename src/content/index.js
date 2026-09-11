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
        retryAttempts: 10, // Increased for graceful loading of new files (10 * 350ms = 3.5s)
        retryDelay: 350,
        autoDetectDelay: 200  // Optimized for fast rendering response
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

    // Persisted across documents and sessions
    let lastRememberedEnvironment = null;

    async function loadRememberedEnvironment() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const data = await chrome.storage.local.get(['nanopro_last_environment']);
                if (data && data.nanopro_last_environment) {
                    lastRememberedEnvironment = data.nanopro_last_environment;
                    console.log('[NanoPro] Loaded remembered environment from storage:', lastRememberedEnvironment);
                }
            }
        } catch (e) {
            console.warn('[NanoPro] Error loading remembered environment:', e);
        }
    }

    async function saveRememberedEnvironment(env) {
        if (!env || !env.raw) return;
        lastRememberedEnvironment = { ...env, isRemembered: true };
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await chrome.storage.local.set({ nanopro_last_environment: lastRememberedEnvironment });
            }
        } catch (e) {
            // Ignore storage errors in isolated context
        }
    }

    // Multi-page document state store (session scoped per invoice file)
    let multiPageStore = {
        fileHash: null,
        totalPages: 1,
        lastInvoiceAmount: null,
        lastInvoiceNumber: null,
        pages: {} // pageNum -> { sumAmount: number, rowCount: number, results: array, timestamp: number }
    };

    // Sidebar fields persistent memory (retained while scrolling within the same document instance)
    let sidebarMemory = {
        instanceHash: null,
        environment: null,
        tradePartnerName: null,
        invoiceAmount: null,
        invoiceNumber: null,
        isRentalList: [],
        pageInfo: null
    };

    /**
     * Check if two URLs belong to the same document instance (including multi-page pages)
     * e.g.
     * https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6
     * https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6
     */
    function isSameDocumentInstance(hashA, hashB, invoiceNumA = null, invoiceNumB = null) {
        if (typeof NanoProAutoDetector !== 'undefined' && NanoProAutoDetector.isSameDocumentInstance) {
            return NanoProAutoDetector.isSameDocumentInstance(hashA, hashB, invoiceNumA, invoiceNumB);
        }
        if (!hashA || !hashB) return false;

        // If both invoice numbers are known and DIFFERENT, they are distinct invoices!
        if (invoiceNumA && invoiceNumB && invoiceNumA.trim() !== '' && invoiceNumB.trim() !== '') {
            if (invoiceNumA.trim().toLowerCase() !== invoiceNumB.trim().toLowerCase()) {
                return false;
            }
        }

        if (hashA === hashB) return true;

        // Broaden route support: /ocr/test/, /ocr/, /review/, /workflow/, /models/
        const pattern = /#\/(?:ocr|review|workflow|models)(?:\/test)?\/([a-f0-9-]+)\/([a-f0-9-]+)/i;
        const matchA = hashA.match(pattern);
        const matchB = hashB.match(pattern);

        if (!matchA || !matchB) return false;

        const modelIdA = matchA[1].toLowerCase();
        const fileIdA = matchA[2].split('?')[0].split('/')[0].toLowerCase();
        const modelIdB = matchB[1].toLowerCase();
        const fileIdB = matchB[2].split('?')[0].split('/')[0].toLowerCase();

        if (modelIdA !== modelIdB) return false;
        if (fileIdA === fileIdB) return true;

        // If both invoice numbers are identical, they belong to the same document/invoice
        if (invoiceNumA && invoiceNumB && invoiceNumA.trim() !== '' && invoiceNumA.trim().toLowerCase() === invoiceNumB.trim().toLowerCase()) {
            return true;
        }

        // Check if both are UUIDv1 for pages of the same multipage document
        const partsA = fileIdA.split('-');
        const partsB = fileIdB.split('-');

        if (partsA.length === 5 && partsB.length === 5) {
            const sameNode = partsA[4] === partsB[4];
            const sameTimeMid = partsA[1] === partsB[1];
            const sameTimeHi = partsA[2] === partsB[2];

            if (sameNode && sameTimeMid && sameTimeHi) {
                const lowA = parseInt(partsA[0], 16);
                const lowB = parseInt(partsB[0], 16);
                if (!isNaN(lowA) && !isNaN(lowB) && Math.abs(lowA - lowB) <= 0x1000000) {
                    return true;
                }
                if (partsA[0].slice(0, 4) === partsB[0].slice(0, 4)) {
                    return true;
                }
            }
        }

        return false;
    }


    /**
     * Scan sidebar fields and remember them across scrolling
     * Returns true if any new field was discovered or updated
     */
    function scanAndRememberSidebarFields() {
        if (!NanoProAutoDetector.findSidebarFields) return false;

        const currentHash = window.location.hash;
        if (!isSameDocumentInstance(sidebarMemory.instanceHash, currentHash)) {
            sidebarMemory = {
                instanceHash: currentHash,
                environment: lastRememberedEnvironment ? { ...lastRememberedEnvironment, isRemembered: true } : null,
                tradePartnerName: null,
                invoiceAmount: null,
                invoiceNumber: null,
                isRentalList: [],
                pageInfo: null
            };
        }

        const live = NanoProAutoDetector.findSidebarFields();
        let hasChanges = false;

        // 0. Invoice Number
        if (live.invoiceNumber && live.invoiceNumber.value) {
            const prevVal = sidebarMemory.invoiceNumber?.value;
            if (prevVal !== live.invoiceNumber.value) {
                // If invoice number changed across pages in multiPageStore, it's a new invoice
                if (multiPageStore.lastInvoiceNumber && 
                    multiPageStore.lastInvoiceNumber.toLowerCase() !== live.invoiceNumber.value.toLowerCase()) {
                    console.log(`[NanoPro v3] New invoice detected within document: "${multiPageStore.lastInvoiceNumber}" -> "${live.invoiceNumber.value}". Starting fresh multi-page accumulation.`);
                    multiPageStore.pages = {};
                    multiPageStore.lastInvoiceAmount = null;
                }
                multiPageStore.lastInvoiceNumber = live.invoiceNumber.value;
                sidebarMemory.invoiceNumber = { ...live.invoiceNumber, isRemembered: false };
                hasChanges = true;
            }
        }

        // 1. Environment
        if (live.environment && live.environment.raw) {
            const prevVal = sidebarMemory.environment?.raw;
            if (prevVal !== live.environment.raw || sidebarMemory.environment?.isRemembered) {
                sidebarMemory.environment = { ...live.environment, isRemembered: false };
                saveRememberedEnvironment(live.environment);
                hasChanges = true;
            }
        }

        // 2. Trade Partner Name
        if (live.tradePartnerName && live.tradePartnerName.raw) {
            const prevVal = sidebarMemory.tradePartnerName?.raw;
            if (prevVal !== live.tradePartnerName.raw) {
                sidebarMemory.tradePartnerName = { ...live.tradePartnerName, isRemembered: false };
                hasChanges = true;
            }
        }

        // 3. Invoice Amount
        if (live.invoiceAmount && live.invoiceAmount.raw) {
            const prevRaw = sidebarMemory.invoiceAmount?.raw;
            const prevMult = sidebarMemory.invoiceAmount?.multiple;
            if (prevRaw !== live.invoiceAmount.raw || prevMult !== live.invoiceAmount.multiple) {
                sidebarMemory.invoiceAmount = { ...live.invoiceAmount, isRemembered: false };
                hasChanges = true;
            }
        }

        // 4. is_rental (accumulate unique instances seen while scrolling)
        if (live.isRental && live.isRental.length > 0) {
            const existingKeys = new Set((sidebarMemory.isRentalList || []).map((item, idx) => item.key || `item_${idx}_${item.raw}`));
            let addedNew = false;
            const updatedList = [...(sidebarMemory.isRentalList || [])];

            live.isRental.forEach((item, idx) => {
                const k = item.key || `item_${updatedList.length}_${item.raw}`;
                if (!existingKeys.has(k)) {
                    existingKeys.add(k);
                    updatedList.push({ ...item, isRemembered: false });
                    addedNew = true;
                }
            });

            if (addedNew) {
                sidebarMemory.isRentalList = updatedList;
                hasChanges = true;
            }
        }

        // 5. Page Info
        if (live.pageInfo && live.pageInfo.source !== 'default-single-page') {
            const prevRaw = sidebarMemory.pageInfo?.raw;
            if (prevRaw !== live.pageInfo.raw) {
                sidebarMemory.pageInfo = live.pageInfo;
                hasChanges = true;
            }
        }

        return hasChanges;
    }

    /**
     * Get effective sidebar fields combining live DOM elements with remembered fields
     */
    function getEffectiveSidebarFields() {
        scanAndRememberSidebarFields();

        const isLiveEnv = !!NanoProAutoDetector.findEnvironment();
        const isLiveTP = !!NanoProAutoDetector.findTradePartnerName();
        const isLiveInv = !!NanoProAutoDetector.findInvoiceAmount();
        const isLiveInvNum = !!NanoProAutoDetector.findInvoiceNumber();

        const env = sidebarMemory.environment ? 
            { ...sidebarMemory.environment, isRemembered: !isLiveEnv } : 
            (lastRememberedEnvironment ? { ...lastRememberedEnvironment, isRemembered: true } : null);

        return {
            environment: env,
            tradePartnerName: sidebarMemory.tradePartnerName ? { ...sidebarMemory.tradePartnerName, isRemembered: !isLiveTP } : null,
            invoiceAmount: sidebarMemory.invoiceAmount ? { ...sidebarMemory.invoiceAmount, isRemembered: !isLiveInv } : null,
            invoiceNumber: sidebarMemory.invoiceNumber ? { ...sidebarMemory.invoiceNumber, isRemembered: !isLiveInvNum } : null,
            isRental: sidebarMemory.isRentalList && sidebarMemory.isRentalList.length > 0 ? sidebarMemory.isRentalList : [],
            pageInfo: sidebarMemory.pageInfo || NanoProAutoDetector.detectPageInfo()
        };
    }

    // ────────────────────────────────────────────────────────
    // SIDE PANEL SCROLL DETECTION (40% gesture threshold)
    // ────────────────────────────────────────────────────────

    let scrollGestureMap = new WeakMap();
    let scrollGestureResetTimers = new WeakMap();

    /**
     * Check if a scroll target belongs to the side panel
     */
    function isSidePanelElement(el) {
        if (!el || el === window || el === document) {
            // Check if active sidebar exists on screen
            const sidebar = document.querySelector('[data-testid*="sidebar" i], [class*="sidebar" i], [class*="drawer" i], [class*="panel" i]:not(.nanopro-panel)');
            return !!sidebar;
        }

        // Never consider our own overlay/panel
        if (el.closest && el.closest('.nanopro-panel, .nanopro-badge, .nanopro-overlay, #nanopro-root')) {
            return false;
        }

        // Check if element contains sidebar fields or labels
        if (el.querySelector && el.querySelector('[data-testid*="label_box_div"], [class*="ocr_text" i], [data-index]')) {
            return true;
        }

        // Check if element is inside a sidebar/panel/drawer container
        if (el.closest && el.closest('[data-testid*="sidebar" i], [class*="sidebar" i], [class*="drawer" i], [class*="properties" i], [role="complementary"]')) {
            return true;
        }

        // Geometry heuristic: side panel is typically on the right or left half of screen (< 65% width)
        if (el.getBoundingClientRect) {
            const rect = el.getBoundingClientRect();
            const isSide = (rect.left > window.innerWidth * 0.45 || rect.right < window.innerWidth * 0.55);
            const isNarrow = rect.width > 100 && rect.width < window.innerWidth * 0.65;
            const isScrollable = el.scrollHeight > el.clientHeight + 20;
            if (isSide && isNarrow && isScrollable) {
                return true;
            }
        }

        return false;
    }

    /**
     * Track scroll gesture and re-trigger state recheck if scrolled ~40% in a single time
     */
    function handleSidePanelScroll(target) {
        if (!target) return;

        const currentScrollTop = target === document || target === document.documentElement || target === window
            ? (window.pageYOffset || document.documentElement.scrollTop || 0)
            : (target.scrollTop || 0);

        const clientHeight = target === document || target === document.documentElement || target === window
            ? (window.innerHeight || document.documentElement.clientHeight || 1)
            : (target.clientHeight || 1);

        const scrollHeight = target === document || target === document.documentElement || target === window
            ? (document.documentElement.scrollHeight || 1)
            : (target.scrollHeight || 1);

        const maxScroll = Math.max(scrollHeight - clientHeight, 1);

        // Get or initialize gesture start
        const key = (target === window || target === document) ? document.documentElement : target;
        let gesture = scrollGestureMap.get(key);

        if (!gesture) {
            gesture = { startScrollTop: currentScrollTop, lastScrollTop: currentScrollTop, triggered: false };
            scrollGestureMap.set(key, gesture);
        }

        // Reset gesture after 400ms of scroll idle
        let timer = scrollGestureResetTimers.get(key);
        if (timer) clearTimeout(timer);
        scrollGestureResetTimers.set(key, setTimeout(() => {
            scrollGestureMap.delete(key);
        }, 400));

        // Calculate scroll delta in this single gesture
        const delta = Math.abs(currentScrollTop - gesture.startScrollTop);
        const fractionOfVisible = delta / clientHeight;
        const fractionOfTotal = delta / maxScroll;

        // "around 40% in a single time" -> threshold >= 0.38 (around 40%)
        const is40PercentScroll = (fractionOfVisible >= 0.38 || fractionOfTotal >= 0.38);

        if (is40PercentScroll && !gesture.triggered) {
            gesture.triggered = true; // Only trigger once per 40% swipe
            gesture.startScrollTop = currentScrollTop; // Reset start so a subsequent 40% swipe triggers again

            const pct = Math.round(Math.max(fractionOfVisible, fractionOfTotal) * 100);
            console.log(`[NanoPro v3] Side panel scrolled ~${pct}% (>=40% in single time). Re-triggering extension state recheck...`);

            // 1. Scan & remember any newly visible fields
            scanAndRememberSidebarFields();

            // 2. Re-trigger extension state recheck immediately
            const fields = getEffectiveSidebarFields();
            if (validationResult) {
                attachTotalValidation(validationResult, fields.invoiceAmount, fields.pageInfo);
                const sidebarResult = attachSidebarValidation(validationResult, fields);
                const rawItemNos = (validationResult.results || []).map(r => r.itemNoValue ?? null);
                attachItemNoValidation(validationResult, rawItemNos, true, sidebarResult?.rentalStatus);
                updateUI(validationResult);
            }

            // 3. In auto mode, also force auto-detection recheck
            if (currentMode === 'auto') {
                runAutoDetection(0, false, true /* force */, 2);
            }
        }
    }

    let scrollCaptureTimer = null;
    function setupScrollCapture() {
        window.addEventListener('scroll', (e) => {
            const target = e.target;

            // Check if this scroll is on the side panel
            if (isSidePanelElement(target)) {
                handleSidePanelScroll(target);
            }

            // Debounced field aggregator for newly visible fields
            if (scrollCaptureTimer) clearTimeout(scrollCaptureTimer);
            scrollCaptureTimer = setTimeout(() => {
                if (currentMode === 'auto' || validationResult) {
                    const hasNew = scanAndRememberSidebarFields();
                    if (hasNew && validationResult) {
                        console.log('[NanoPro v3] Discovered new sidebar fields on scroll, updating...');
                        const fields = getEffectiveSidebarFields();
                        attachTotalValidation(validationResult, fields.invoiceAmount, fields.pageInfo);
                        const sidebarResult = attachSidebarValidation(validationResult, fields);
                        const rawItemNos = (validationResult.results || []).map(r => r.itemNoValue ?? null);
                        attachItemNoValidation(validationResult, rawItemNos, true, sidebarResult?.rentalStatus);
                        updateUI(validationResult);
                    }
                }
            }, 250);
        }, { capture: true, passive: true });

        // Also track wheel events on side panel for trackpad/mousewheel flick gestures
        window.addEventListener('wheel', (e) => {
            const target = e.target;
            if (isSidePanelElement(target)) {
                const scrollable = target.closest ? target.closest('.overflow-auto, .overflow-y-auto, [class*="scroll" i], [class*="sidebar" i], [class*="drawer" i]') : target;
                if (scrollable) {
                    handleSidePanelScroll(scrollable);
                }
            }
        }, { capture: true, passive: true });
    }

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
        await loadRememberedEnvironment();

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

        // Setup capture-phase scroll listener to remember sidebar fields when scrolling
        setupScrollCapture();

        // Start reactive input listeners on table inputs
        setupInputListeners();

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
        return /^#\/(?:ocr|review|workflow|models)(?:\/test)?\/[^/]+\/[^/?]+/i.test(hash);
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
    function scheduleAutoDetect(maxRetries = CONFIG.retryAttempts) {
        clearAutoDetect();
        console.log(`[NanoPro v2] Auto-detect scheduled in ${CONFIG.autoDetectDelay}ms (maxRetries=${maxRetries})`);
        autoDetectTimer = setTimeout(() => runAutoDetection(0, false, false, maxRetries), CONFIG.autoDetectDelay);

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
     * @param {number} retryCount
     * @param {boolean} isBackgroundPoll
     * @param {boolean} force - if true, bypasses state hash deduplication
     * @param {number} maxRetries
     */
    async function runAutoDetection(retryCount = 0, isBackgroundPoll = false, force = false, maxRetries = CONFIG.retryAttempts) {
        if (currentMode !== 'auto') return;

        if (!isBackgroundPoll) {
            console.log(`[NanoPro v2] Running auto-detection (attempt ${retryCount + 1}/${maxRetries}, force=${force})...`);
            NanoProBadge.setLoading();
        }

        try {
            // Use AutoDetector to find and extract table
            const detectResult = NanoProAutoDetector.detect();

            if (!detectResult.success) {
                if (!isBackgroundPoll) {
                    console.warn('[NanoPro v2] Auto-detection failed:', detectResult.message);
                }

                // Check if this is a valid document page with NO TABLE (e.g. cover page, terms, signature, delivery slip)
                if (isSingleFilePage()) {
                    const pageFields = getEffectiveSidebarFields();
                    const pInfo = pageFields.pageInfo || NanoProAutoDetector.detectPageInfo();
                    const pageNum = pInfo?.currentPage || 1;
                    const isDocPage = pInfo && (pInfo.isMultiPage || pInfo.totalPages > 1 || 
                        pageFields.environment || pageFields.invoiceAmount || pageFields.tradePartnerName || pageFields.invoiceNumber);

                    if (isDocPage) {
                        // Quick wait of 1 retry (150ms) for table to render if page just transitioned
                        const maxTableWait = 1;
                        if (retryCount < maxTableWait && !isBackgroundPoll) {
                            console.log(`[NanoPro v3] Table not found yet on Page ${pageNum}, checking once more in 150ms...`);
                            autoDetectTimer = setTimeout(
                                () => runAutoDetection(retryCount + 1, false, force, maxTableWait),
                                150
                            );
                            return;
                        }

                        // Table did not appear — legitimately a table-less document page!
                        console.log(`[NanoPro v3] Document page (Page ${pageNum} of ${pInfo.totalPages}) has no table. Processing as 0-row page...`);
                        lastDetectedStateHash = 'tableless|P' + pageNum + '|' + (pageFields.invoiceNumber?.raw || '') + '|' + (pageFields.tradePartnerName?.raw || '');
                        processAutoDetectedRows([], {}, pageFields, true /* hasNoTable */);
                        return;
                    }
                }

                // Retry if table might not have loaded yet on initial load
                if (retryCount < maxRetries && !isBackgroundPoll) {
                    console.log(`[NanoPro v2] Retrying (${retryCount + 1}/${maxRetries}) in ${CONFIG.retryDelay}ms...`);
                    autoDetectTimer = setTimeout(
                        () => runAutoDetection(retryCount + 1, false, force, maxRetries),
                        CONFIG.retryDelay
                    );
                    return;
                }

                // CRITICAL: If we already have a valid validationResult,
                // NEVER wipe the badge to "No Data Found" due to temporary detection misses or DOM debounce!
                if (validationResult && validationResult.summary && validationResult.summary.total >= 0 && validationResult.success) {
                    console.log('[NanoPro v3] Preserving existing valid state despite temporary detection miss');
                    updateUI(validationResult);
                    return;
                }

                // If on a single file page and still loading in background, don't prematurely flash No Data
                if (isBackgroundPoll && isSingleFilePage()) {
                    return;
                }

                NanoProBadge.setNoData();
                lastDetectedStateHash = null;
                return;
            }

            // --- State Hashing for Performance ---
            const sidebarFields = getEffectiveSidebarFields();

            const isRentalHash = (sidebarFields.isRental || []).map(r => r.raw).join(',');
            const sidebarHash = [
                sidebarFields.invoiceNumber?.raw || 'no-invnum',
                sidebarFields.invoiceAmount?.raw || 'no-inv',
                sidebarFields.invoiceAmount?.multiple ? 'multi-inv' : '',
                sidebarFields.environment?.raw || 'no-env',
                isRentalHash,
                sidebarFields.tradePartnerName?.raw || 'no-tp',
                sidebarFields.pageInfo?.raw || 'no-page'
            ].join('|');

            const currentStateHash = JSON.stringify(detectResult.rows) + '|' + sidebarHash;

            const badgeState = NanoProBadge.getState ? NanoProBadge.getState() : null;
            const needsRefresh = force || badgeState === 'loading' || badgeState === 'noData' || badgeState === 'ready' || !validationResult;

            if (currentStateHash === lastDetectedStateHash && !needsRefresh) {
                // The inputs on the screen haven't changed and badge is already up to date, silently return
                return;
            }

            if (isBackgroundPoll && !needsRefresh) {
                console.log(`[NanoPro v2] Background poll detected changes, re-validating...`);
                NanoProBadge.setLoading();
            }

            // Cache the new hash
            lastDetectedStateHash = currentStateHash;

            // We have extracted rows — validate them
            processAutoDetectedRows(detectResult.rows, detectResult.columnMapping, sidebarFields, false);

        } catch (error) {
            console.error('[NanoPro v2] Auto-detection error:', error);
            if (validationResult && validationResult.summary && validationResult.success) {
                try {
                    updateUI(validationResult);
                } catch (e) {}
            } else {
                NanoProBadge.setNoData();
            }
        }
    }

    /**
     * Process auto-detected rows through validation pipeline
     */
    function processAutoDetectedRows(rows, columnMapping, sidebarFields = null, hasNoTable = false) {
        console.log(`[NanoPro v3] Validating ${rows.length} auto-detected rows (hasNoTable=${hasNoTable})`);

        const fields = sidebarFields || getEffectiveSidebarFields();

        const pageInfo = fields.pageInfo || { currentPage: 1, totalPages: 1, isMultiPage: false, raw: 'Page 1 of 1' };
        const currentPage = pageInfo.currentPage || 1;
        const totalPages = pageInfo.totalPages || 1;

        let validationRows = [];
        let rawItemNos = [];
        let hasItemNoColumn = false;

        if (hasNoTable || rows.length === 0) {
            validationResult = {
                success: true,
                results: [],
                summary: { total: 0, valid: 0, invalid: 0, incomplete: 0, caution: 0 },
                hasNoTable: true,
                validRows: [],
                invalidRows: []
            };
        } else {
            // Convert raw string values to the {value, confidence} format the validator expects
            validationRows = rows.map(row => ({
                qty: row.qty ? NanoProParser.parse(row.qty) : null,
                price: row.price ? NanoProParser.parse(row.price) : null,
                amount: row.amount ? NanoProParser.parse(row.amount) : null
            }));

            // Keep raw item_no for each row (not parsed as number)
            rawItemNos = rows.map(row => row.item_no ?? null);
            hasItemNoColumn = !!(columnMapping && columnMapping.item_no);

            console.log('[NanoPro v3] Validation input:', validationRows);
            console.log('[NanoPro v3] Item_No column detected:', hasItemNoColumn);

            // Validate calculations
            validationResult = NanoProValidator.validateAll(validationRows);

            if (!validationResult.success) {
                console.error('[NanoPro v3] Validation failed:', validationResult.error);
                NanoProBadge.setNoData();
                return;
            }
        }

        // Calculate current page's sum of Line_Amount
        let pageSum = 0;
        let pageSummedRows = 0;
        for (const row of (validationResult.results || [])) {
            if (row.actual !== undefined && row.actual !== null) {
                pageSum += row.actual;
                pageSummedRows++;
            } else if (row.originalRow?.amount?.value !== null && row.originalRow?.amount?.value !== undefined) {
                pageSum += row.originalRow.amount.value;
                pageSummedRows++;
            }
        }
        pageSum = NanoProParser.round(pageSum, 2);

        // Attach supplementary validations
        const sidebarResult = attachSidebarValidation(validationResult, fields);
        if (!hasNoTable && rows.length > 0) {
            attachItemNoValidation(validationResult, rawItemNos, hasItemNoColumn, sidebarResult?.rentalStatus);
        } else {
            validationResult.itemNoWarnings = [];
            validationResult.itemNoErrors = [];
        }

        // Compute error breakdown for this specific page
        const calcErrors = validationResult.summary?.invalid || 0;
        const itemNoErrors = validationResult.itemNoErrors?.length || 0;
        const itemNoWarnings = (validationResult.itemNoWarnings || []).filter(w => w.severity !== 'ERROR').length;
        const hasErrors = (calcErrors + itemNoErrors) > 0;
        const hasCautions = itemNoWarnings > 0;

        let errorSummary = hasNoTable ? 'No table (0 items)' : 'Valid';
        if (hasErrors) {
            const errParts = [];
            if (calcErrors > 0) errParts.push(`${calcErrors} calc error${calcErrors > 1 ? 's' : ''}`);
            if (itemNoErrors > 0) errParts.push(`${itemNoErrors} item_no error${itemNoErrors > 1 ? 's' : ''}`);
            errorSummary = errParts.join(', ');
        } else if (hasCautions) {
            errorSummary = `${itemNoWarnings} caution${itemNoWarnings > 1 ? 's' : ''}`;
        }

        // Check if invoice_number changed to partition multiPageStore
        const currentInvNum = fields.invoiceNumber?.value || null;
        if (currentInvNum && multiPageStore.lastInvoiceNumber && 
            currentInvNum.toLowerCase() !== multiPageStore.lastInvoiceNumber.toLowerCase()) {
            console.log(`[NanoPro v3] Invoice number changed (${multiPageStore.lastInvoiceNumber} -> ${currentInvNum}). Resetting multi-page accumulation.`);
            multiPageStore.pages = {};
            multiPageStore.lastInvoiceAmount = null;
        }
        if (currentInvNum) {
            multiPageStore.lastInvoiceNumber = currentInvNum;
        }

        // Update multiPageStore
        if (!isSameDocumentInstance(multiPageStore.fileHash, window.location.hash, multiPageStore.lastInvoiceNumber, currentInvNum)) {
            multiPageStore.fileHash = window.location.hash;
            multiPageStore.pages = {};
            multiPageStore.lastInvoiceAmount = null;
        }
        multiPageStore.totalPages = Math.max(multiPageStore.totalPages || 1, totalPages);
        multiPageStore.pages[currentPage] = {
            pageNumber: currentPage,
            sumAmount: pageSum,
            rowCount: pageSummedRows,
            totalRows: (validationResult.results || []).length,
            calcErrors: calcErrors,
            itemNoErrors: itemNoErrors,
            itemNoWarnings: itemNoWarnings,
            hasErrors: hasErrors,
            hasCautions: hasCautions,
            errorSummary: errorSummary,
            hasNoTable: !!hasNoTable,
            status: hasErrors ? 'INVALID' : (hasCautions ? 'CAUTION' : 'VALID'),
            results: validationResult.results || [],
            timestamp: Date.now()
        };
        if (fields.invoiceAmount) {
            multiPageStore.lastInvoiceAmount = fields.invoiceAmount;
        }

        // Attach total validation (calculates multi-page sums and aggregates page statuses)
        attachTotalValidation(validationResult, fields.invoiceAmount, pageInfo);

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
            const pagesWithErrors = [];
            const pagesWithCautions = [];
            const pageStatusList = [];

            for (const p of recordedPages) {
                const pData = multiPageStore.pages[p];
                cumulativeSum += pData.sumAmount;
                totalSummedRows += pData.rowCount;
                pageBreakdown[p] = pData.sumAmount;

                if (pData.hasErrors) {
                    pagesWithErrors.push(p);
                } else if (pData.hasCautions) {
                    pagesWithCautions.push(p);
                }
                pageStatusList.push({
                    page: p,
                    status: pData.status,
                    calcErrors: pData.calcErrors || 0,
                    itemNoErrors: pData.itemNoErrors || 0,
                    itemNoWarnings: pData.itemNoWarnings || 0,
                    errorSummary: pData.errorSummary || 'Valid',
                    hasNoTable: !!pData.hasNoTable,
                    sumAmount: pData.sumAmount || 0,
                    rowCount: pData.rowCount || 0,
                    totalRows: pData.totalRows || 0
                });
            }
            cumulativeSum = NanoProParser.round(cumulativeSum, 2);

            result.multiPageErrors = {
                isMultiPage: isMultiPage,
                currentPage: currentPage,
                totalPages: totalPages,
                pagesWithErrors: pagesWithErrors,
                pagesWithCautions: pagesWithCautions,
                pageStatusList: pageStatusList
            };

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
                    isRemembered: !!invoiceAmount.isRemembered,
                    difference: diff,
                    tolerance: tolerance,
                    status: isMatch ? 'MATCH' : 'MISMATCH',
                    selector: invoiceAmount.selector
                };

                console.log(`[NanoPro] Single Page Total: Sum=${pageSum} | Invoice=${invoiceAmount.value} | Diff=${diff} | ${isMatch ? '✅ Match' : '❌ Mismatch'}`);
                return;
            }

            // --- MULTI PAGE DOCUMENT ---
            // If we are NOT on the last page:
            if (!isLastPage) {
                const effectiveInv = invoiceAmount || multiPageStore.lastInvoiceAmount;
                // If all pages have been recorded AND we have an invoice amount (e.g. from previous visit to last page):
                if (hasAllPages && effectiveInv && effectiveInv.value !== null) {
                    const diff = NanoProParser.round(Math.abs(cumulativeSum - effectiveInv.value), 2);
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
                        pagesWithErrors: pagesWithErrors,
                        pagesWithCautions: pagesWithCautions,
                        pageStatusList: pageStatusList,
                        invoiceAmount: effectiveInv.value,
                        invoiceAmountRaw: effectiveInv.raw,
                        isRemembered: true,
                        difference: diff,
                        tolerance: tolerance,
                        status: isMatch ? 'MATCH' : 'MISMATCH',
                        selector: effectiveInv.selector,
                        message: isMatch
                            ? `All ${totalPages} pages accumulated ($${cumulativeSum.toFixed(2)}). Matches invoice_amount on Page ${totalPages}.`
                            : `All ${totalPages} pages accumulated ($${cumulativeSum.toFixed(2)}). Mismatches invoice_amount ($${effectiveInv.value.toFixed(2)}) on Page ${totalPages}.`
                    };
                    return;
                }

                // Earlier page still pending other pages or final invoice amount
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
                    pagesWithErrors: pagesWithErrors,
                    pagesWithCautions: pagesWithCautions,
                    pageStatusList: pageStatusList,
                    invoiceAmount: effectiveInv?.value || null,
                    status: 'MULTI_PAGE_PENDING',
                    message: `Page ${currentPage} of ${totalPages} recorded (Sum: $${pageSum.toFixed(2)}). Visited [${recordedPages.join(', ')}] of ${totalPages}. Navigate to page ${totalPages} for final invoice total.`
                };
                console.log(`[NanoPro] MultiPage: Page ${currentPage}/${totalPages} recorded (Sum: ${pageSum}, Cumulative: ${cumulativeSum}). Pending page ${totalPages}.`);
                return;
            }

            // We ARE on the last page!
            const effectiveInv = invoiceAmount || multiPageStore.lastInvoiceAmount;
            if (!effectiveInv || effectiveInv.value === null) {
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
                    pagesWithErrors: pagesWithErrors,
                    pagesWithCautions: pagesWithCautions,
                    pageStatusList: pageStatusList,
                    invoiceAmount: null,
                    status: 'NOT_FOUND',
                    message: hasAllPages
                        ? `All ${totalPages} pages accumulated ($${cumulativeSum.toFixed(2)}). Scroll sidebar to reveal invoice_amount for final verification.`
                        : `invoice_amount not found on last page (Page ${totalPages})`
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
                    pagesWithErrors: pagesWithErrors,
                    pagesWithCautions: pagesWithCautions,
                    pageStatusList: pageStatusList,
                    invoiceAmount: effectiveInv.value,
                    invoiceAmountRaw: effectiveInv.raw,
                    status: 'PAGES_MISSING',
                    message: `Missing earlier pages: [${missingPages.join(', ')}] of ${totalPages}. Please visit all pages to accumulate all line items.`
                };
                console.warn(`[NanoPro] MultiPage: Missing pages [${missingPages.join(', ')}] of ${totalPages}`);
                return;
            }

            // All pages recorded & invoice_amount present on last page! Compare cumulative sum to invoice_amount
            const diff = NanoProParser.round(Math.abs(cumulativeSum - effectiveInv.value), 2);
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
                pagesWithErrors: pagesWithErrors,
                pagesWithCautions: pagesWithCautions,
                pageStatusList: pageStatusList,
                invoiceAmount: effectiveInv.value,
                invoiceAmountRaw: effectiveInv.raw,
                isRemembered: !!effectiveInv.isRemembered,
                difference: diff,
                tolerance: tolerance,
                status: isMatch ? 'MATCH' : 'MISMATCH',
                selector: effectiveInv.selector,
                message: isMatch
                    ? `All ${totalPages} pages match invoice_amount ($${effectiveInv.value.toFixed(2)})`
                    : `Multi-page cumulative sum ($${cumulativeSum.toFixed(2)}) does not match invoice_amount ($${effectiveInv.value.toFixed(2)})`
            };

            console.log(`[NanoPro] MultiPage Total (${totalPages} pages): Cumulative Sum=${cumulativeSum} | Invoice=${effectiveInv.value} | Diff=${diff} | ${isMatch ? '✅ Match' : '❌ Mismatch'}`);

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

            // 3. trade_partner_name check: must be present and have a real value with at least 2 characters (e.g. "INSTANTLRN")
            let tradePartnerStatus = 'VALID';
            let tradePartnerMessage = '';
            const rawTP = tradePartner?.raw?.trim() || '';
            const alphanumericMatches = rawTP.match(/[a-zA-Z0-9]/g) || [];
            const labelStrings = /^(trade[_\s]*partner[_\s]*(?:name)?)$/i;

            if (!tradePartner || tradePartner.raw === null || tradePartner.raw === undefined) {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = 'trade_partner_name not found in sidebar';
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else if (rawTP === '') {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = 'trade_partner_name is blank';
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else if (labelStrings.test(rawTP)) {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = 'trade_partner_name has no value (only label text found)';
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else if (alphanumericMatches.length < 2) {
                tradePartnerStatus = 'ERROR';
                tradePartnerMessage = `trade_partner_name has invalid value "${rawTP}" (needs at least 2 characters)`;
                errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
            } else {
                tradePartnerMessage = rawTP;
            }

            // 4. invoice_amount multiplicity and page placement check
            let invoiceAmountMultiplicity = { status: 'VALID', message: '' };
            if (invoiceAmount && invoiceAmount.multiple) {
                invoiceAmountMultiplicity.status = 'ERROR';
                invoiceAmountMultiplicity.message = `Multiple instances of invoice_amount detected (${invoiceAmount.count})`;
                errors.push({ field: 'invoice_amount', message: invoiceAmountMultiplicity.message });
            }

            // Single multi-page invoice rule: invoice_amount must only be on the last page!
            const curPage = pageInfo?.currentPage || 1;
            const totPages = Math.max(pageInfo?.totalPages || 1, multiPageStore.totalPages || 1);
            const liveInvoiceAmount = NanoProAutoDetector.findInvoiceAmount();
            if (totPages > 1 && curPage < totPages && liveInvoiceAmount) {
                const placementMsg = `invoice_amount is present on Page ${curPage}, but should only be on the last page (Page ${totPages})`;
                errors.push({ field: 'invoice_amount', message: placementMsg });
                console.warn(`[NanoPro] Sidebar error: ${placementMsg}`);
            }

            const sidebarValidation = {
                isValid: errors.length === 0,
                errors: errors,
                warnings: warnings,
                environment: {
                    status: envStatus,
                    value: env?.raw?.trim() || null,
                    message: envMessage,
                    isRemembered: !!env?.isRemembered
                },
                isRental: rentalStatus,
                tradePartner: {
                    status: tradePartnerStatus,
                    value: tradePartner?.raw?.trim() || null,
                    message: tradePartnerMessage,
                    isRemembered: !!tradePartner?.isRemembered
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

        // Try to find container, or fallback to body
        const target = document.querySelector('[data-rbd-droppable-id]') ||
                       document.querySelector(NanoProAutoDetector.PRIMARY_SELECTOR) ||
                       document.querySelector('.overflow-auto') ||
                       document.body;
        if (!target) return;

        let debounceTimer = null;

        mutationObserver = new MutationObserver((mutations) => {
            // Only react to child node additions/removals
            let hasChildChange = false;
            for (const m of mutations) {
                if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
                    hasChildChange = true;
                    break;
                }
            }
            if (!hasChildChange) return;

            // Debounce: only re-validate after mutations settle
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log('[NanoPro v2] Table DOM change detected, re-validating...');
                runAutoDetection(0, false, false);
            }, 250);
        });

        mutationObserver.observe(target, {
            childList: true,
            subtree: true
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
    // REACTIVE USER INPUT LISTENERS
    // ────────────────────────────────────────────────────────

    let inputListenersAttached = false;
    let inputDebounceTimer = null;

    function handleUserInput(e) {
        if (currentMode !== 'auto' && !validationResult) return;
        const target = e.target;
        if (!target) return;

        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput) return;

        // Ignore events from our own extension overlay
        if (target.closest && (target.closest('.nanopro-badge') || target.closest('.nanopro-panel'))) {
            return;
        }

        // Fast debounce: re-validate 200ms after user edits any cell
        if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
        inputDebounceTimer = setTimeout(() => {
            console.log('[NanoPro] User input detected in table cell, re-validating...');
            if (currentMode === 'auto') {
                runAutoDetection(0, false, true); // force = true to recalculate immediately
            } else if (validationResult && lastSelection) {
                processSelection(lastSelection);
            }
        }, 200);
    }

    function setupInputListeners() {
        if (inputListenersAttached) return;
        document.addEventListener('input', handleUserInput, true);
        document.addEventListener('change', handleUserInput, true);
        document.addEventListener('paste', handleUserInput, true);
        inputListenersAttached = true;
        console.log('[NanoPro] Reactive table input listeners attached');
    }

    function teardownInputListeners() {
        if (!inputListenersAttached) return;
        document.removeEventListener('input', handleUserInput, true);
        document.removeEventListener('change', handleUserInput, true);
        document.removeEventListener('paste', handleUserInput, true);
        inputListenersAttached = false;
    }

    // ────────────────────────────────────────────────────────
    // MANUAL MODE (unchanged from v1)
    // ────────────────────────────────────────────────────────

    /**
     * Handle refresh/badge click action based on mode
     */
    function handleRefresh() {
        if (currentMode === 'auto') {
            runAutoDetection(0, false, true);
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
            const fields = getEffectiveSidebarFields();

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

            // Attach sidebar validation
            const sidebarResult = attachSidebarValidation(validationResult, fields);

            // Compute error breakdown for this page
            const calcErrors = validationResult.summary?.invalid || 0;
            const itemNoErrors = validationResult.itemNoErrors?.length || 0;
            const itemNoWarnings = (validationResult.itemNoWarnings || []).filter(w => w.severity !== 'ERROR').length;
            const hasErrors = (calcErrors + itemNoErrors) > 0;
            const hasCautions = itemNoWarnings > 0;

            let errorSummary = 'Valid';
            if (hasErrors) {
                const errParts = [];
                if (calcErrors > 0) errParts.push(`${calcErrors} calc error${calcErrors > 1 ? 's' : ''}`);
                if (itemNoErrors > 0) errParts.push(`${itemNoErrors} item_no error${itemNoErrors > 1 ? 's' : ''}`);
                errorSummary = errParts.join(', ');
            } else if (hasCautions) {
                errorSummary = `${itemNoWarnings} caution${itemNoWarnings > 1 ? 's' : ''}`;
            }

            // Check if invoice_number changed to partition multiPageStore
            const currentInvNum = fields.invoiceNumber?.value || null;
            if (currentInvNum && multiPageStore.lastInvoiceNumber && 
                currentInvNum.toLowerCase() !== multiPageStore.lastInvoiceNumber.toLowerCase()) {
                console.log(`[NanoPro] Invoice number changed (${multiPageStore.lastInvoiceNumber} -> ${currentInvNum}). Resetting multi-page accumulation.`);
                multiPageStore.pages = {};
                multiPageStore.lastInvoiceAmount = null;
            }
            if (currentInvNum) {
                multiPageStore.lastInvoiceNumber = currentInvNum;
            }

            // Update multiPageStore
            if (!isSameDocumentInstance(multiPageStore.fileHash, window.location.hash, multiPageStore.lastInvoiceNumber, currentInvNum)) {
                multiPageStore.fileHash = window.location.hash;
                multiPageStore.pages = {};
                multiPageStore.lastInvoiceAmount = null;
            }
            multiPageStore.totalPages = Math.max(multiPageStore.totalPages || 1, totalPages);
            multiPageStore.pages[currentPage] = {
                pageNumber: currentPage,
                sumAmount: pageSum,
                rowCount: pageSummedRows,
                totalRows: validationResult.results.length,
                calcErrors: calcErrors,
                itemNoErrors: itemNoErrors,
                itemNoWarnings: itemNoWarnings,
                hasErrors: hasErrors,
                hasCautions: hasCautions,
                errorSummary: errorSummary,
                status: hasErrors ? 'INVALID' : (hasCautions ? 'CAUTION' : 'VALID'),
                results: validationResult.results,
                timestamp: Date.now()
            };
            if (fields.invoiceAmount) {
                multiPageStore.lastInvoiceAmount = fields.invoiceAmount;
            }

            attachTotalValidation(validationResult, fields.invoiceAmount, pageInfo);

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

    let lastObservedHref = typeof window !== 'undefined' ? window.location.href : '';
    let lastObservedPageNum = null;
    let lastKnownInvoiceNumber = null;

    /**
     * Check navigation via 3 tracking methods:
     * Method 1: Keep tracking the URL. If anything changes, reload/refresh extension state to reverify from start.
     * Method 2: Keep tracking "invoice_number" in sidebar. If it changes, page/document changed.
     *           If it is temporarily not visible then visible again on same page, user scrolled.
     * Method 3: Keep tracking the page number for multi-page documents. If single-page file, not applicable.
     */
    function checkNavigationAndPageFlip() {
        const currentHref = window.location.href;
        const currentHash = window.location.hash;

        // ─────────────────────────────────────────────────────────────
        // METHOD 1: URL Tracking
        // ─────────────────────────────────────────────────────────────
        if (currentHash !== initializedForFile || currentHref !== lastObservedHref) {
            console.log(`[NanoPro v3] Method 1: URL changed (${lastObservedHref} -> ${currentHref})`);
            lastObservedHref = currentHref;
            handleNavigation();
            return;
        }

        if (!isSingleFilePage()) return;

        // ─────────────────────────────────────────────────────────────
        // METHOD 2: Sidebar invoice_number Tracking
        // ─────────────────────────────────────────────────────────────
        const liveInvNumObj = NanoProAutoDetector.findInvoiceNumber ? NanoProAutoDetector.findInvoiceNumber() : null;
        const liveInvNum = (liveInvNumObj && liveInvNumObj.value) ? liveInvNumObj.value.trim() : null;

        if (liveInvNum) {
            if (lastKnownInvoiceNumber === null) {
                lastKnownInvoiceNumber = liveInvNum;
                sidebarMemory.invoiceNumber = liveInvNumObj;
                multiPageStore.lastInvoiceNumber = liveInvNum;
            } else if (liveInvNum.toLowerCase() !== lastKnownInvoiceNumber.toLowerCase()) {
                console.log(`[NanoPro v3] Method 2: invoice_number changed (${lastKnownInvoiceNumber} -> ${liveInvNum}). Resetting and reverifying from start!`);
                lastKnownInvoiceNumber = liveInvNum;
                resetState();
                lastKnownInvoiceNumber = liveInvNum;
                sidebarMemory.invoiceNumber = liveInvNumObj;
                multiPageStore.lastInvoiceNumber = liveInvNum;
                NanoProBadge.setLoading();
                if (currentMode === 'auto') {
                    scheduleAutoDetect(10);
                }
                return;
            }
        }
        // If liveInvNum is null/invisible: User merely scrolled the sidebar. Retain lastKnownInvoiceNumber, DO NOT reset!

        // ─────────────────────────────────────────────────────────────
        // METHOD 3: Page Number Tracking for Multi-Page Files
        // ─────────────────────────────────────────────────────────────
        const pageInfo = NanoProAutoDetector.detectPageInfo ? NanoProAutoDetector.detectPageInfo() : null;
        if (pageInfo && (pageInfo.totalPages > 1 || pageInfo.isMultiPage)) {
            // Only applicable for multi-page documents
            if (lastObservedPageNum !== null && pageInfo.currentPage !== lastObservedPageNum) {
                console.log(`[NanoPro v3] Method 3: Multi-page flip detected: P${lastObservedPageNum} -> P${pageInfo.currentPage} of ${pageInfo.totalPages}`);
                lastObservedPageNum = pageInfo.currentPage;
                handlePageFlip(pageInfo);
            } else if (lastObservedPageNum === null) {
                lastObservedPageNum = pageInfo.currentPage;
            }
        }
    }

    /**
     * Handle page flip within the same document (page navigation)
     */
    function handlePageFlip(newPageInfo) {
        console.log(`[NanoPro v3] Handling page flip to Page ${newPageInfo.currentPage}...`);
        sidebarMemory.pageInfo = newPageInfo;
        lastDetectedStateHash = null;
        NanoProBadge.setLoading();
        if (currentMode === 'auto') {
            clearAutoDetect();
            // Fast execution: 100ms delay, max 2 retries (300ms max)
            autoDetectTimer = setTimeout(() => runAutoDetection(0, false, true /* force */, 2), 100);
            autoPollTimer = setInterval(() => {
                if (currentMode === 'auto') {
                    runAutoDetection(0, true);
                }
            }, 1000);
        }
    }

    /**
     * Setup watcher for page navigation (SPA detection)
     */
    function setupNavigationWatcher() {
        // Fallback for native popstate events
        window.addEventListener('popstate', checkNavigationAndPageFlip);
        window.addEventListener('hashchange', checkNavigationAndPageFlip);

        // Click capture on links, buttons, thumbnails, and pagination elements to detect switches instantly (<20ms)
        document.addEventListener('click', (e) => {
            const navEl = e.target.closest('a, button, [role="button"], [role="tab"], [data-testid], input[type="number"], .cursor-pointer, [class*="thumbnail" i], [class*="page" i], [class*="pager" i], [class*="pagination" i]');
            if (navEl) {
                setTimeout(checkNavigationAndPageFlip, 20);
                setTimeout(checkNavigationAndPageFlip, 80);
                setTimeout(checkNavigationAndPageFlip, 200);
            }
        }, { capture: true, passive: true });

        // Input and change events on page inputs (e.g. typing a page number)
        document.addEventListener('input', (e) => {
            if (e.target.matches && e.target.matches('input[type="number"], input[class*="page" i], input[aria-label*="page" i]')) {
                setTimeout(checkNavigationAndPageFlip, 40);
            }
        }, { capture: true, passive: true });

        document.addEventListener('change', (e) => {
            if (e.target.matches && e.target.matches('input[type="number"], input[class*="page" i], input[aria-label*="page" i]')) {
                setTimeout(checkNavigationAndPageFlip, 40);
            }
        }, { capture: true, passive: true });

        // Fast 100ms polling for URL and DOM page number changes (so page/file change is caught in <100ms)
        setInterval(checkNavigationAndPageFlip, 100);
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

        // Check if navigation is within the SAME document instance (e.g. flipping pages of same multipage invoice)
        const currentLiveInvNum = NanoProAutoDetector.findInvoiceNumber?.()?.value || null;
        const prevInvNum = multiPageStore.lastInvoiceNumber || sidebarMemory.invoiceNumber?.value || null;

        if (initializedForFile && isSameDocumentInstance(initializedForFile, currentHash, prevInvNum, currentLiveInvNum)) {
            console.log(`[NanoPro v3] Multi-page navigation within same document instance: ${currentHash}`);
            initializedForFile = currentHash;
            // Retain multiPageStore and sidebarMemory! Re-run detection on the new page.
            sidebarMemory.pageInfo = null; // Clear cached pageInfo so new page is detected!
            lastDetectedStateHash = null; // Clear hash so it doesn't short-circuit!
            NanoProBadge.setLoading();
            if (currentMode === 'auto') {
                scheduleAutoDetect(8);
            }
            return;
        }

        console.log(`[NanoPro v3] Entered new document instance: ${currentHash}`);
        initializedForFile = currentHash;
        lastObservedPageNum = null;
        lastKnownInvoiceNumber = null;

        if (isInitialized) {
            console.log('[NanoPro v3] New document opened, instantly clearing previous state and loading...');
            // INSTANTLY wipe old document's "Verified" status so it NEVER lingers!
            resetState();
            NanoProBadge.setLoading();
            if (currentMode === 'auto') {
                scheduleAutoDetect(10);
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
        lastObservedPageNum = null;
        lastKnownInvoiceNumber = null;
        multiPageStore = {
            fileHash: window.location.hash,
            totalPages: 1,
            lastInvoiceAmount: null,
            lastInvoiceNumber: null,
            pages: {}
        };
        sidebarMemory = {
            instanceHash: window.location.hash,
            environment: lastRememberedEnvironment ? { ...lastRememberedEnvironment, isRemembered: true } : null,
            tradePartnerName: null,
            invoiceAmount: null,
            invoiceNumber: null,
            isRentalList: [],
            pageInfo: null
        };
        clearAutoDetect();
        teardownMutationObserver();
        NanoProPanel.close();

        if (currentMode === 'auto') {
            NanoProBadge.setLoading();
        } else {
            NanoProBadge.setReady();
        }

        console.log('[NanoPro v3] State reset for new document instance');
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

        const mpErrors = result.multiPageErrors || result.totalValidation;
        const isMulti = !!(mpErrors && mpErrors.isMultiPage);
        const pagesWithErrors = mpErrors?.pagesWithErrors || [];
        const currentPage = mpErrors?.currentPage || 1;
        const otherPagesWithErrors = pagesWithErrors.filter(p => p !== currentPage);

        const hasTotalMismatch = result.totalValidation && result.totalValidation.status === 'MISMATCH';
        const hasTotalNotFound = result.totalValidation && result.totalValidation.status === 'NOT_FOUND';
        const hasTotalMultiple = result.totalValidation && result.totalValidation.status === 'MULTIPLE_INSTANCES';
        const hasTotalPagesMissing = result.totalValidation && result.totalValidation.status === 'PAGES_MISSING';
        const isMultiPagePending = result.totalValidation && result.totalValidation.status === 'MULTI_PAGE_PENDING';

        // Errors: current page errors (calculation mismatches, sidebar failures, item_no errors, multiple totals) + errors on other scanned pages
        const currentPageErrorCount = (summary?.invalid || 0) + sidebarErrors.length + itemNoErrors.length + (hasTotalMultiple ? 1 : 0);
        const totalErrorCount = currentPageErrorCount + (isMulti ? otherPagesWithErrors.length : 0);

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
                if (isMulti && pagesWithErrors.length > 0) {
                    const pagesStr = pagesWithErrors.map(p => `P${p}`).join(', ');
                    const errLabel = pagesWithErrors.length > 1 ? 'Errors' : 'Error';
                    textEl.textContent = `❌ ${pagesStr} ${errLabel}`;
                } else {
                    const errorReasons = [];
                    if (summary?.invalid > 0) errorReasons.push(`${summary.invalid} Calc Error${summary.invalid > 1 ? 's' : ''}`);
                    if (sidebarErrors.length > 0) errorReasons.push(`${sidebarErrors[0].field} Error`);
                    if (itemNoErrors.length > 0) errorReasons.push(`Item_No Error`);
                    if (hasTotalMultiple) errorReasons.push(`Multiple Totals`);
                    textEl.textContent = `❌ ` + errorReasons.join(' | ');
                }
            }
        } else if (summary?.incomplete > 0) {
            if (badgeEl) badgeEl.classList.remove('has-caution');
            NanoProBadge.setIncomplete();
        } else if (isCaution) {
            if (badgeEl) badgeEl.classList.add('has-caution');
            NanoProBadge.setIncomplete();

            let cautionMessages = [];
            const isAllScannedPendingTotal = hasTotalNotFound && result.totalValidation?.isMultiPage && 
                (result.totalValidation.recordedPages?.length === result.totalValidation.totalPages);

            if (hasTotalPagesMissing) cautionMessages.push(`Missing Pages`);
            if (hasTotalMismatch) cautionMessages.push(result.totalValidation?.isMultiPage ? 'Multi Total Mismatch' : 'Total Mismatch');
            if (hasTotalNotFound) {
                cautionMessages.push(isAllScannedPendingTotal ? 'Scroll to Total' : 'Missing Total');
            }
            if (itemNoWarnings.length > 0) cautionMessages.push(`${itemNoWarnings.length} Item Caution${itemNoWarnings.length > 1 ? 's' : ''}`);

            const textEl = badgeEl?.querySelector('.nanopro-badge-text');
            if (textEl) {
                if (isAllScannedPendingTotal && cautionMessages.length === 1) {
                    textEl.textContent = `📄 All ${result.totalValidation.totalPages} Scanned | Scroll to Total`;
                } else {
                    textEl.textContent = `⚠️ ` + cautionMessages.join(' | ');
                }
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
        teardownInputListeners();
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
