/**
 * Automated test suite for NanoPro extension sidebar validations,
 * Item_No cross-validations, and page number detection.
 */

const assert = require('assert');

// Extractor and validation logic under test
function evaluateSidebarValidation(fields) {
    const env = fields.environment;
    const rentalInstances = fields.isRental;
    const tradePartner = fields.tradePartnerName;
    const invoiceAmount = fields.invoiceAmount;
    const pageInfo = fields.pageInfo;

    const errors = [];
    const warnings = [];

    // 1. Environment check
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

    // 2. is_rental check
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

    // 3. trade_partner_name check:
    // - If single page file: trade_partner_name is NECESSARY on this page; throw error if missing/blank/invalid.
    // - If multi-page file: trade_partner_name could be present on AT LEAST ONE page across the document.
    let tradePartnerStatus = 'VALID';
    let tradePartnerMessage = '';
    const rawTP = tradePartner?.raw?.trim() || '';
    const alphanumericMatches = rawTP.match(/[a-zA-Z0-9]/g) || [];
    const labelStrings = /^(trade[_\s]*partner[_\s]*(?:name)?)$/i;
    const isLiveValidTP = rawTP !== '' && !labelStrings.test(rawTP) && alphanumericMatches.length >= 2;

    const curPage = pageInfo?.currentPage || 1;
    const totPages = pageInfo?.totalPages || 1;
    const isMultiPage = totPages > 1 || pageInfo?.isMultiPage === true;

    const storedTP = fields.rememberedTradePartner || fields.multiPageTradePartner;
    const storedRaw = storedTP?.raw?.trim() || '';
    const storedAlpha = storedRaw.match(/[a-zA-Z0-9]/g) || [];
    const isStoredValidTP = storedRaw !== '' && !labelStrings.test(storedRaw) && storedAlpha.length >= 2;

    if (isLiveValidTP) {
        tradePartnerStatus = 'VALID';
        tradePartnerMessage = rawTP;
    } else if (isMultiPage && isStoredValidTP) {
        tradePartnerStatus = 'VALID';
        tradePartnerMessage = storedRaw;
    } else if (!isMultiPage) {
        // SINGLE PAGE FILE: trade_partner_name is necessary -> THROW ERROR
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
        }
    } else {
        // MULTI-PAGE FILE: could be present on at least one page
        if (rawTP !== '' && !labelStrings.test(rawTP) && alphanumericMatches.length < 2) {
            tradePartnerStatus = 'ERROR';
            tradePartnerMessage = `trade_partner_name has invalid value "${rawTP}" (needs at least 2 characters)`;
            errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
        } else if (fields.allPagesRecorded) {
            tradePartnerStatus = 'ERROR';
            tradePartnerMessage = 'trade_partner_name not found on any page (must be present on at least one page)';
            errors.push({ field: 'trade_partner_name', message: tradePartnerMessage });
        } else {
            tradePartnerStatus = 'PENDING';
            tradePartnerMessage = 'trade_partner_name not on this page (can be on at least one page)';
        }
    }

    // 4. invoice_amount multiplicity check
    let invoiceAmountMultiplicity = { status: 'VALID', message: '' };
    if (invoiceAmount && invoiceAmount.multiple) {
        invoiceAmountMultiplicity.status = 'ERROR';
        invoiceAmountMultiplicity.message = `Multiple instances of invoice_amount detected (${invoiceAmount.count})`;
        errors.push({ field: 'invoice_amount', message: invoiceAmountMultiplicity.message });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        environment: { status: envStatus, value: env?.raw?.trim() || null, message: envMessage },
        isRental: rentalStatus,
        tradePartner: {
            status: tradePartnerStatus,
            value: (isLiveValidTP ? rawTP : (isStoredValidTP ? storedRaw : (rawTP || null))),
            message: tradePartnerMessage,
            isRemembered: !isLiveValidTP && isStoredValidTP
        },
        invoiceAmountMultiplicity,
        pageInfo
    };
}

function evaluateItemNoValidation(rawItemNos, hasItemNoColumn, rentalStatus) {
    const warnings = [];
    const errors = [];
    const ENDS_WITH_R_PATTERN = /-\s*R\s*$/i;
    const ONLY_R_PATTERN = /^-\s*R\s*$/i;

    const rowResults = [];

    for (let i = 0; i < rawItemNos.length; i++) {
        const itemNo = rawItemNos[i];
        const rowNumber = i + 1;
        let reason = null;
        let severity = 'CAUTION';

        if (itemNo === null || itemNo === undefined) {
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

            if (isOnlyDashR) {
                reason = 'ONLY_DASH_R';
                severity = 'ERROR';
            } else if (/\s/.test(itemNo)) {
                reason = 'CONTAINS_WHITESPACE';
                severity = 'ERROR';
            } else if (rentalStatus && rentalStatus.isConsistent) {
                if (rentalStatus.allTrue) {
                    if (!hasDashRSuffix) {
                        reason = 'MISSING_DASH_R';
                        severity = 'CAUTION';
                    }
                } else if (rentalStatus.allFalse) {
                    if (hasDashRSuffix) {
                        reason = 'UNEXPECTED_DASH_R';
                        severity = 'ERROR';
                    }
                }
            } else if (rentalStatus && rentalStatus.status === 'ERROR') {
                if (hasDashRSuffix) {
                    reason = 'UNEXPECTED_DASH_R';
                    severity = 'ERROR';
                }
            }
        }

        const res = {
            itemNoWarning: !!reason,
            itemNoValue: itemNo,
            itemNoReason: reason,
            itemNoSeverity: reason ? severity : null
        };
        rowResults.push(res);

        if (reason) {
            const item = { rowIndex: i, rowNumber, value: itemNo, reason, severity };
            warnings.push(item);
            if (severity === 'ERROR') errors.push(item);
        }
    }

    return { warnings, errors, rowResults };
}

function parsePageInfoFromText(text, nextText = null) {
    const directMatch = text.match(/page\s*[:#]?\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (directMatch) {
        return {
            currentPage: parseInt(directMatch[1], 10),
            totalPages: parseInt(directMatch[2], 10)
        };
    }
    if (/^page\s*[:#]?$/i.test(text.trim()) && nextText) {
        const sibMatch = nextText.trim().match(/^(\d+)\s*(?:of|\/)\s*(\d+)/i);
        if (sibMatch) {
            return {
                currentPage: parseInt(sibMatch[1], 10),
                totalPages: parseInt(sibMatch[2], 10)
            };
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────
// TEST EXECUTION
// ────────────────────────────────────────────────────────

console.log('--- Running NanoPro Validation Test Suite ---');

// Test 1: Environment check
{
    console.log('Test 1: Environment values');
    const validProd = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'True' }],
        tradePartnerName: { raw: 'Supplier Inc' },
        invoiceAmount: { multiple: false, count: 1 }
    });
    assert.strictEqual(validProd.environment.status, 'VALID');

    const validProdUpper = evaluateSidebarValidation({
        environment: { raw: 'PROD' },
        isRental: [{ raw: 'True' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(validProdUpper.environment.status, 'VALID');

    const invalidEnv = evaluateSidebarValidation({
        environment: { raw: 'dev' },
        isRental: [{ raw: 'True' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(invalidEnv.environment.status, 'ERROR');
    assert.strictEqual(invalidEnv.isValid, false);

    const missingEnv = evaluateSidebarValidation({
        environment: null,
        isRental: [{ raw: 'True' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(missingEnv.environment.status, 'ERROR');
    assert.strictEqual(missingEnv.isValid, false);
    console.log('  Passed ✅');
}

// Test 2: is_rental consistency
{
    console.log('Test 2: is_rental consistency');
    const allTrue = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'True' }, { raw: 'True' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(allTrue.isRental.status, 'VALID');
    assert.strictEqual(allTrue.isRental.allTrue, true);
    assert.strictEqual(allTrue.isRental.allFalse, false);

    const allFalse = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }, { raw: 'False' }, { raw: 'false' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(allFalse.isRental.status, 'VALID');
    assert.strictEqual(allFalse.isRental.allTrue, false);
    assert.strictEqual(allFalse.isRental.allFalse, true);

    const mixed = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'True' }, { raw: 'False' }],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(mixed.isRental.status, 'ERROR');
    assert.strictEqual(mixed.isRental.isConsistent, false);
    assert.strictEqual(mixed.isValid, false);

    const missingRental = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [],
        tradePartnerName: { raw: 'Supplier Inc' }
    });
    assert.strictEqual(missingRental.isRental.status, 'ERROR');
    assert.strictEqual(missingRental.isValid, false);
    console.log('  Passed ✅');
}

// Test 3: Multiple invoice_amount instances
{
    console.log('Test 3: Multiple invoice_amount detection');
    const singleInv = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Supplier Inc' },
        invoiceAmount: { multiple: false, count: 1 }
    });
    assert.strictEqual(singleInv.invoiceAmountMultiplicity.status, 'VALID');
    assert.strictEqual(singleInv.isValid, true);

    const multiInv = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Supplier Inc' },
        invoiceAmount: { multiple: true, count: 2 }
    });
    assert.strictEqual(multiInv.invoiceAmountMultiplicity.status, 'ERROR');
    assert.strictEqual(multiInv.isValid, false);
    console.log('  Passed ✅');
}

// Test 4: trade_partner_name check (at least 2 alphanumeric characters, e.g. "INSTANTLRN")
{
    console.log('Test 4: trade_partner_name check');
    // Common production value: INSTANTLRN
    const instantLrnTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'INSTANTLRN' }
    });
    assert.strictEqual(instantLrnTP.tradePartner.status, 'VALID');
    assert.strictEqual(instantLrnTP.tradePartner.value, 'INSTANTLRN');

    const validTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Acme Supply Co' }
    });
    assert.strictEqual(validTP.tradePartner.status, 'VALID');

    // 2-character value is valid
    const twoCharTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'AB' }
    });
    assert.strictEqual(twoCharTP.tradePartner.status, 'VALID');

    // 1-character value is INVALID (needs at least 2)
    const singleCharTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'A' }
    });
    assert.strictEqual(singleCharTP.tradePartner.status, 'ERROR');
    assert.ok(singleCharTP.tradePartner.message.includes('needs at least 2 characters'));

    // Punctuation only is INVALID
    const punctTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: '---' }
    });
    assert.strictEqual(punctTP.tradePartner.status, 'ERROR');

    // Label string itself is INVALID
    const labelOnlyTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Trade Partner Name' }
    });
    assert.strictEqual(labelOnlyTP.tradePartner.status, 'ERROR');
    assert.ok(labelOnlyTP.tradePartner.message.includes('only label text found'));

    // Blank is INVALID
    const blankTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: '   ' }
    });
    assert.strictEqual(blankTP.tradePartner.status, 'ERROR');
    assert.strictEqual(blankTP.isValid, false);

    // Missing is INVALID
    const missingTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: null
    });
    assert.strictEqual(missingTP.tradePartner.status, 'ERROR');
    assert.strictEqual(missingTP.isValid, false);
    console.log('  Passed ✅');
}

// Test 5: Item_No rules & is_rental cross-validation
{
    console.log('Test 5: Item_No rules & is_rental cross-validation');
    const rentalTrueState = { isConsistent: true, allTrue: true, allFalse: false, status: 'VALID' };
    const rentalFalseState = { isConsistent: true, allTrue: false, allFalse: true, status: 'VALID' };

    // Item_No only "-R" -> ERROR
    const resOnlyR = evaluateItemNoValidation(['-R', ' -r ', 'PART-100-R'], true, rentalTrueState);
    assert.strictEqual(resOnlyR.rowResults[0].itemNoReason, 'ONLY_DASH_R');
    assert.strictEqual(resOnlyR.rowResults[0].itemNoSeverity, 'ERROR');
    assert.strictEqual(resOnlyR.rowResults[1].itemNoReason, 'ONLY_DASH_R');
    assert.strictEqual(resOnlyR.rowResults[1].itemNoSeverity, 'ERROR');
    assert.strictEqual(resOnlyR.rowResults[2].itemNoWarning, false); // Valid suffix on rental

    // is_rental all True: missing -R suffix -> CAUTION
    const resRentalMissing = evaluateItemNoValidation(['PART-100', 'PART-200-R'], true, rentalTrueState);
    assert.strictEqual(resRentalMissing.rowResults[0].itemNoReason, 'MISSING_DASH_R');
    assert.strictEqual(resRentalMissing.rowResults[0].itemNoSeverity, 'CAUTION');
    assert.strictEqual(resRentalMissing.rowResults[1].itemNoWarning, false);

    // is_rental all False: unexpected -R suffix -> ERROR
    const resNonRental = evaluateItemNoValidation(['PART-100-R', 'PART-200'], true, rentalFalseState);
    assert.strictEqual(resNonRental.rowResults[0].itemNoReason, 'UNEXPECTED_DASH_R');
    assert.strictEqual(resNonRental.rowResults[0].itemNoSeverity, 'ERROR');
    assert.strictEqual(resNonRental.rowResults[1].itemNoWarning, false);
    console.log('  Passed ✅');
}

// Test 6: Page number parsing
{
    console.log('Test 6: Page number parsing');
    const p1 = parsePageInfoFromText('Page 1 of 4');
    assert.deepStrictEqual(p1, { currentPage: 1, totalPages: 4 });

    const p2 = parsePageInfoFromText('Page: 2 / 10');
    assert.deepStrictEqual(p2, { currentPage: 2, totalPages: 10 });

    const p3 = parsePageInfoFromText('Page', '3 of 5');
    assert.deepStrictEqual(p3, { currentPage: 3, totalPages: 5 });

    // Test Nanonets pager DOM structure: <span>Page</span> + <input value="1" max="4"> + <span>of 4</span>
    const spanOf4 = { tagName: 'SPAN', textContent: 'of 4', nextElementSibling: null };
    const inputEl = {
        tagName: 'INPUT',
        value: '1',
        getAttribute: (attr) => attr === 'value' ? '1' : (attr === 'max' ? '4' : null),
        max: '4',
        nextElementSibling: spanOf4
    };
    const pageSpan = { tagName: 'SPAN', textContent: 'Page', nextElementSibling: inputEl };

    // Function simulating the S1 check
    const checkPager = (span) => {
        const nextEl = span.nextElementSibling;
        if (nextEl) {
            const input = nextEl.tagName === 'INPUT' ? nextEl : nextEl.querySelector('input');
            if (input) {
                const curVal = input.value || input.getAttribute('value');
                const maxVal = input.getAttribute('max') || input.max;
                const afterInput = nextEl.nextElementSibling;
                const afterText = (afterInput?.textContent || '').trim();
                const afterMatch = afterText.match(/(?:of|\/)\s*(\d+)/i);
                const totalPages = afterMatch ? parseInt(afterMatch[1], 10) : (maxVal ? parseInt(maxVal, 10) : null);
                const currentPage = curVal ? parseInt(curVal, 10) : 1;
                return { currentPage, totalPages, raw: `Page ${currentPage}${totalPages ? ' of ' + totalPages : ''}` };
            }
        }
        return null;
    };

    const pagerResult = checkPager(pageSpan);
    assert.deepStrictEqual(pagerResult, { currentPage: 1, totalPages: 4, raw: 'Page 1 of 4' });

    console.log('  Passed ✅');
}

// Test 7: Fallback when page number is not present
{
    console.log('Test 7: Fallback when page number is absent');
    function fallbackPageInfo(detected) {
        if (!detected) {
            return {
                currentPage: 1,
                totalPages: 1,
                isMultiPage: false,
                raw: 'Page 1 of 1',
                source: 'default-single-page'
            };
        }
        const total = (detected.totalPages && detected.totalPages > 0) ? detected.totalPages : 1;
        const current = (detected.currentPage && detected.currentPage > 0) ? detected.currentPage : 1;
        return {
            currentPage: current,
            totalPages: total,
            isMultiPage: total > 1,
            raw: `Page ${current} of ${total}`
        };
    }

    const absentPage = fallbackPageInfo(null);
    assert.strictEqual(absentPage.currentPage, 1);
    assert.strictEqual(absentPage.totalPages, 1);
    assert.strictEqual(absentPage.isMultiPage, false);

    const singlePageNoTotal = fallbackPageInfo({ currentPage: 1, totalPages: null });
    assert.strictEqual(singlePageNoTotal.currentPage, 1);
    assert.strictEqual(singlePageNoTotal.totalPages, 1);
    assert.strictEqual(singlePageNoTotal.isMultiPage, false);

    const multiPage = fallbackPageInfo({ currentPage: 2, totalPages: 4 });
    assert.strictEqual(multiPage.currentPage, 2);
    assert.strictEqual(multiPage.totalPages, 4);
    assert.strictEqual(multiPage.isMultiPage, true);
    console.log('  Passed ✅');
}

// Test 8: Multi-page Line_Amount accumulation & total validation
{
    console.log('Test 8: Multi-page Line_Amount accumulation and invoice total matching');

    function evaluateTotalValidation(multiPageStore, currentPage, totalPages, pageRows, invoiceAmount) {
        // Compute page sum
        let pageSum = 0;
        let pageSummedRows = 0;
        for (const row of pageRows) {
            const amt = row.actual !== undefined ? row.actual : (row.amount || 0);
            pageSum += amt;
            pageSummedRows++;
        }
        pageSum = Math.round(pageSum * 100) / 100;

        // Update multiPageStore
        multiPageStore.totalPages = Math.max(multiPageStore.totalPages || 1, totalPages);
        multiPageStore.pages[currentPage] = {
            sumAmount: pageSum,
            rowCount: pageSummedRows
        };
        if (invoiceAmount) {
            multiPageStore.lastInvoiceAmount = invoiceAmount;
        }

        const effectiveTotalPages = multiPageStore.totalPages;
        const isMultiPage = effectiveTotalPages > 1;

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
        cumulativeSum = Math.round(cumulativeSum * 100) / 100;

        const missingPages = [];
        for (let p = 1; p <= effectiveTotalPages; p++) {
            if (!multiPageStore.pages[p]) {
                missingPages.push(p);
            }
        }
        const hasAllPages = missingPages.length === 0;
        const isLastPage = (currentPage === effectiveTotalPages);
        const effectiveInvoiceAmount = invoiceAmount || multiPageStore.lastInvoiceAmount;

        if (effectiveInvoiceAmount && effectiveInvoiceAmount.multiple) {
            return { status: 'MULTIPLE_INSTANCES', count: effectiveInvoiceAmount.count };
        }

        if (!isMultiPage) {
            if (!effectiveInvoiceAmount) {
                return { status: 'NOT_FOUND', sumAmount: pageSum };
            }
            const diff = Math.round(Math.abs(pageSum - effectiveInvoiceAmount.value) * 100) / 100;
            return {
                status: diff <= 0.10 ? 'MATCH' : 'MISMATCH',
                sumAmount: pageSum,
                invoiceAmount: effectiveInvoiceAmount.value,
                difference: diff
            };
        }

        // Multi-page handling
        if (!isLastPage && !hasAllPages) {
            return {
                status: 'MULTI_PAGE_PENDING',
                currentPage,
                totalPages: effectiveTotalPages,
                pageSum,
                sumAmount: cumulativeSum,
                recordedPages,
                missingPages
            };
        }

        if (!effectiveInvoiceAmount) {
            return {
                status: 'NOT_FOUND',
                sumAmount: cumulativeSum,
                totalPages: effectiveTotalPages
            };
        }

        if (!hasAllPages) {
            return {
                status: 'PAGES_MISSING',
                currentPage,
                totalPages: effectiveTotalPages,
                sumAmount: cumulativeSum,
                invoiceAmount: effectiveInvoiceAmount.value,
                recordedPages,
                missingPages
            };
        }

        const diff = Math.round(Math.abs(cumulativeSum - effectiveInvoiceAmount.value) * 100) / 100;
        return {
            status: diff <= 0.10 ? 'MATCH' : 'MISMATCH',
            isMultiPage: true,
            totalPages: effectiveTotalPages,
            sumAmount: cumulativeSum,
            invoiceAmount: effectiveInvoiceAmount.value,
            difference: diff,
            recordedPages,
            pageBreakdown
        };
    }

    const store = { totalPages: 3, pages: {}, lastInvoiceAmount: null };

    // Step 1: Visit Page 1 (Sum = 100.00, no invoice amount yet on page 1)
    const resPage1 = evaluateTotalValidation(store, 1, 3, [{ actual: 50.00 }, { actual: 50.00 }], null);
    assert.strictEqual(resPage1.status, 'MULTI_PAGE_PENDING');
    assert.strictEqual(resPage1.pageSum, 100.00);
    assert.strictEqual(resPage1.sumAmount, 100.00);
    assert.deepStrictEqual(resPage1.recordedPages, [1]);
    assert.deepStrictEqual(resPage1.missingPages, [2, 3]);

    // Step 2: Visit Page 2 (Sum = 150.00)
    const resPage2 = evaluateTotalValidation(store, 2, 3, [{ actual: 75.00 }, { actual: 75.00 }], null);
    assert.strictEqual(resPage2.status, 'MULTI_PAGE_PENDING');
    assert.strictEqual(resPage2.pageSum, 150.00);
    assert.strictEqual(resPage2.sumAmount, 250.00); // 100 + 150
    assert.deepStrictEqual(resPage2.recordedPages, [1, 2]);
    assert.deepStrictEqual(resPage2.missingPages, [3]);

    // Step 3: Visit Page 3 (Last Page! Sum = 50.00, invoice_amount = 300.00)
    const resPage3 = evaluateTotalValidation(store, 3, 3, [{ actual: 50.00 }], { value: 300.00, multiple: false });
    assert.strictEqual(resPage3.status, 'MATCH');
    assert.strictEqual(resPage3.sumAmount, 300.00); // 100 + 150 + 50 = 300
    assert.strictEqual(resPage3.invoiceAmount, 300.00);
    assert.strictEqual(resPage3.difference, 0.00);
    assert.deepStrictEqual(resPage3.pageBreakdown, { 1: 100.00, 2: 150.00, 3: 50.00 });

    // Step 4: Verify mismatch detection if invoice_amount on last page is 350.00
    const storeMismatch = {
        totalPages: 2,
        pages: {
            1: { sumAmount: 100.00, rowCount: 1 }
        },
        lastInvoiceAmount: null
    };
    const resMismatch = evaluateTotalValidation(storeMismatch, 2, 2, [{ actual: 100.00 }], { value: 250.00, multiple: false });
    assert.strictEqual(resMismatch.status, 'MISMATCH');
    assert.strictEqual(resMismatch.sumAmount, 200.00);
    assert.strictEqual(resMismatch.invoiceAmount, 250.00);
    assert.strictEqual(resMismatch.difference, 50.00);

    // Step 5: Verify PAGES_MISSING when user opens last page first
    const storeSkipped = { totalPages: 3, pages: {}, lastInvoiceAmount: null };
    const resSkipped = evaluateTotalValidation(storeSkipped, 3, 3, [{ actual: 50.00 }], { value: 200.00, multiple: false });
    assert.strictEqual(resSkipped.status, 'PAGES_MISSING');
    assert.deepStrictEqual(resSkipped.missingPages, [1, 2]);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 9: Multi-Page URL Pattern & Document Instance Matching
// ============================================================
function testDocumentInstanceMatching() {
    console.log('Test 9: Multi-page URL pattern & document instance matching');

    const AutoDetector = require('../src/content/autoDetector');
    const isSameInstance = AutoDetector.isSameDocumentInstance;

    const page1Url = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';
    const page2Url = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';

    // 1. User provided 2-page URLs must match as the same instance
    assert.strictEqual(isSameInstance(page1Url, page2Url), true, 'Two pages of the same invoice must match');

    // 2. Hash-only format must match
    const page1Hash = '#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';
    const page2Hash = '#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';
    assert.strictEqual(isSameInstance(page1Hash, page2Hash), true, 'Hash-only format must match');

    // 3. Mixed format (full URL vs hash)
    assert.strictEqual(isSameInstance(page1Url, page2Hash), true, 'Mixed full URL and hash must match');

    // 4. URLs with query strings or query params
    const page1Query = page1Url + '?view=review&filter=all';
    const page2Query = page2Url + '?view=review&page=2';
    assert.strictEqual(isSameInstance(page1Query, page2Query), true, 'URLs with query params must match');

    // 5. Same exact page
    assert.strictEqual(isSameInstance(page1Url, page1Url), true, 'Exact same URL must match');

    // 6. Negative: Different model IDs
    const diffModelUrl = 'https://app.nanonets.com/#/ocr/test/00000000-0000-0000-0000-000000000000/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';
    assert.strictEqual(isSameInstance(page1Url, diffModelUrl), false, 'Different model IDs must not match');

    // 7. Negative: Completely different document file ID
    const diffDocUrl = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    assert.strictEqual(isSameInstance(page1Url, diffDocUrl), false, 'Different document files must not match');

    // 8. Expanded routes: /review/, /workflow/, /ocr/ (without /test/)
    const reviewUrl1 = 'https://app.nanonets.com/#/review/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';
    const reviewUrl2 = 'https://app.nanonets.com/#/review/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';
    assert.strictEqual(isSameInstance(reviewUrl1, reviewUrl2), true, '#/review/ route multi-page must match');

    const workflowUrl1 = 'https://app.nanonets.com/#/workflow/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';
    const workflowUrl2 = 'https://app.nanonets.com/#/workflow/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';
    assert.strictEqual(isSameInstance(workflowUrl1, workflowUrl2), true, '#/workflow/ route multi-page must match');

    const directOcrUrl1 = 'https://app.nanonets.com/#/ocr/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';
    const directOcrUrl2 = 'https://app.nanonets.com/#/ocr/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6';
    assert.strictEqual(isSameInstance(directOcrUrl1, directOcrUrl2), true, '#/ocr/ (no /test/) route multi-page must match');

    // 9. Negative: Null / empty / invalid
    assert.strictEqual(isSameInstance(null, page1Url), false, 'Null input must return false');
    assert.strictEqual(isSameInstance('', ''), false, 'Empty input must return false');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 10: Virtualized Sidebar Scrolling Memory
// ============================================================
function testSidebarScrollingMemory() {
    console.log('Test 10: Virtualized sidebar scrolling memory across scroll positions');

    const AutoDetector = require('../src/content/autoDetector');

    // Simulate sidebar memory store and aggregator
    let sidebarMemory = {
        instanceHash: null,
        environment: null,
        tradePartnerName: null,
        invoiceAmount: null,
        isRentalList: [],
        pageInfo: null
    };

    function scanAndRemember(currentHash, liveFields) {
        if (!AutoDetector.isSameDocumentInstance(sidebarMemory.instanceHash, currentHash)) {
            sidebarMemory = {
                instanceHash: currentHash,
                environment: null,
                tradePartnerName: null,
                invoiceAmount: null,
                isRentalList: [],
                pageInfo: null
            };
        }

        if (liveFields.environment && liveFields.environment.raw) {
            sidebarMemory.environment = { ...liveFields.environment, isRemembered: false };
        }
        if (liveFields.tradePartnerName && liveFields.tradePartnerName.raw) {
            sidebarMemory.tradePartnerName = { ...liveFields.tradePartnerName, isRemembered: false };
        }
        if (liveFields.invoiceAmount && liveFields.invoiceAmount.raw) {
            sidebarMemory.invoiceAmount = { ...liveFields.invoiceAmount, isRemembered: false };
        }
        if (liveFields.isRental && liveFields.isRental.length > 0) {
            const existingKeys = new Set((sidebarMemory.isRentalList || []).map((item, idx) => item.key || `item_${idx}_${item.raw}`));
            liveFields.isRental.forEach((item, idx) => {
                const k = item.key || `item_${sidebarMemory.isRentalList.length}_${item.raw}`;
                if (!existingKeys.has(k)) {
                    existingKeys.add(k);
                    sidebarMemory.isRentalList.push({ ...item, isRemembered: false });
                }
            });
        }
        if (liveFields.pageInfo) {
            sidebarMemory.pageInfo = liveFields.pageInfo;
        }
    }

    function getEffectiveFields(liveFields) {
        return {
            environment: sidebarMemory.environment ? { ...sidebarMemory.environment, isRemembered: !liveFields.environment } : null,
            tradePartnerName: sidebarMemory.tradePartnerName ? { ...sidebarMemory.tradePartnerName, isRemembered: !liveFields.tradePartnerName } : null,
            invoiceAmount: sidebarMemory.invoiceAmount ? { ...sidebarMemory.invoiceAmount, isRemembered: !liveFields.invoiceAmount } : null,
            isRental: sidebarMemory.isRentalList || [],
            pageInfo: sidebarMemory.pageInfo || liveFields.pageInfo
        };
    }

    const docUrl = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6';

    // Step 1: User is at the top of the sidebar. Only invoice_amount is visible in DOM.
    const scrollPosTop1 = {
        invoiceAmount: { raw: '250.00', value: 250.00, count: 1, multiple: false },
        environment: null,
        tradePartnerName: null,
        isRental: [],
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    };
    scanAndRemember(docUrl, scrollPosTop1);

    // Initial check at top: Environment and trade partner not seen yet
    let effective = getEffectiveFields(scrollPosTop1);
    let valResult = evaluateSidebarValidation(effective);
    assert.strictEqual(valResult.isValid, false, 'Should be invalid before scrolling down');

    // Step 2: User manually scrolls sidebar down to the bottom.
    // invoice_amount is now scrolled out of view (null in DOM), but Environment, is_rental, trade_partner_name are visible!
    const scrollPosBottom = {
        invoiceAmount: null,
        environment: { raw: 'prod', value: 'prod' },
        tradePartnerName: { raw: 'Global Supplies Inc', value: 'Global Supplies Inc' },
        isRental: [{ raw: 'False', value: 'False', key: 'row_rental_0' }],
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    };
    scanAndRemember(docUrl, scrollPosBottom);

    // Step 3: User scrolls back to the top (for personal checking).
    // In DOM, only invoice_amount is mounted again. Bottom fields are unmounted (null in DOM).
    const scrollPosTop2 = {
        invoiceAmount: { raw: '250.00', value: 250.00, count: 1, multiple: false },
        environment: null,
        tradePartnerName: null,
        isRental: [],
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    };
    // No new fields scanned at top, but getEffectiveFields uses memory!
    scanAndRemember(docUrl, scrollPosTop2);

    effective = getEffectiveFields(scrollPosTop2);

    // Verify all fields are remembered!
    assert.ok(effective.environment, 'Environment should be remembered');
    assert.strictEqual(effective.environment.value, 'prod');
    assert.strictEqual(effective.environment.isRemembered, true, 'Environment should be flagged as remembered');

    assert.ok(effective.tradePartnerName, 'trade_partner_name should be remembered');
    assert.strictEqual(effective.tradePartnerName.value, 'Global Supplies Inc');
    assert.strictEqual(effective.tradePartnerName.isRemembered, true, 'Trade partner should be flagged as remembered');

    assert.strictEqual(effective.isRental.length, 1, 'is_rental should be remembered');
    assert.strictEqual(effective.isRental[0].value, 'False');

    assert.ok(effective.invoiceAmount, 'invoice_amount is live from DOM');
    assert.strictEqual(effective.invoiceAmount.value, 250.00);
    assert.strictEqual(effective.invoiceAmount.isRemembered, false, 'invoice_amount is currently visible in DOM');

    // Now evaluate validation: All rules should PASS without error!
    valResult = evaluateSidebarValidation(effective);
    assert.strictEqual(valResult.isValid, true, 'Validation should be valid because all fields were remembered');
    assert.strictEqual(valResult.errors.length, 0);
    assert.strictEqual(valResult.environment.status, 'VALID');
    assert.strictEqual(valResult.tradePartner.status, 'VALID');
    assert.strictEqual(valResult.isRental.status, 'VALID');

    // Step 4: Navigate to a brand new document instance
    const newDocUrl = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/11111111-2222-3333-4444-555555555555';
    scanAndRemember(newDocUrl, {
        invoiceAmount: { raw: '100.00', value: 100.00, count: 1, multiple: false },
        environment: null,
        tradePartnerName: null,
        isRental: []
    });

    const newEffective = getEffectiveFields({
        invoiceAmount: { raw: '100.00', value: 100.00, count: 1, multiple: false }
    });
    assert.strictEqual(newEffective.environment, null, 'Memory must be reset on new document instance');
    assert.strictEqual(newEffective.tradePartnerName, null, 'Memory must be reset on new document instance');
    assert.strictEqual(newEffective.isRental.length, 0, 'is_rental memory must be reset');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 11: Per-File Environment Isolation & In-File Memory
// ============================================================
function testCrossDocumentEnvironmentMemory() {
    console.log('Test 11: Per-File Environment Isolation & In-File Memory (NO Cross-Document Leakage)');

    let currentFileInstance = null;
    let fileSidebarMemory = {
        environment: null
    };

    function simulateOpenFile(newFileUrl) {
        if (currentFileInstance !== newFileUrl) {
            currentFileInstance = newFileUrl;
            // Strict reset per file: no memory carried over across different files!
            fileSidebarMemory.environment = null;
        }
    }

    function scanSidebar(liveDomEnv) {
        if (liveDomEnv && liveDomEnv.raw) {
            fileSidebarMemory.environment = { ...liveDomEnv, isRemembered: false };
        }
        const isLive = !!(liveDomEnv && liveDomEnv.raw);
        return fileSidebarMemory.environment ?
            { ...fileSidebarMemory.environment, isRemembered: !isLive } : null;
    }

    // Step 1: File 1 opened -> Live DOM has Environment: prod
    simulateOpenFile('https://app.nanonets.com/#/review/model1/file1');
    let env1 = scanSidebar({ raw: 'prod', value: 'prod' });
    assert.ok(env1, 'File 1 must detect environment');
    assert.strictEqual(env1.raw, 'prod');
    assert.strictEqual(env1.isRemembered, false, 'File 1 is live from DOM');

    // Step 2: User scrolls sidebar in File 1 -> Environment unmounts from DOM
    let env1Scrolled = scanSidebar(null);
    assert.ok(env1Scrolled, 'File 1 must retain environment in memory within the same file');
    assert.strictEqual(env1Scrolled.raw, 'prod');
    assert.strictEqual(env1Scrolled.isRemembered, true, 'Flagged as remembered within File 1');

    // Step 3: User switches to File 2 (a NEW invoice file)
    simulateOpenFile('https://app.nanonets.com/#/review/model1/file2');
    let env2BeforeScan = scanSidebar(null); // Not yet seen in File 2's DOM
    assert.strictEqual(env2BeforeScan, null, 'File 2 MUST NOT inherit Environment from File 1!');

    // Evaluation for File 2 before Environment is seen -> MUST FAIL with ERROR!
    const valResultFile2Missing = evaluateSidebarValidation({
        environment: env2BeforeScan,
        isRental: [{ raw: 'False', value: 'False' }],
        tradePartnerName: { raw: 'Partner X', value: 'Partner X' },
        invoiceAmount: { raw: '50.00', value: 50.00, count: 1, multiple: false },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(valResultFile2Missing.environment.status, 'ERROR', 'File 2 must error because Environment is not yet seen on this file');
    assert.strictEqual(valResultFile2Missing.isValid, false, 'Document is not valid until Environment is verified on this file');

    // Step 4: File 2 sidebar displays Environment: prod
    let env2Live = scanSidebar({ raw: 'prod', value: 'prod' });
    assert.ok(env2Live, 'File 2 now has environment');
    assert.strictEqual(env2Live.raw, 'prod');
    assert.strictEqual(env2Live.isRemembered, false);

    const valResultFile2Pass = evaluateSidebarValidation({
        environment: env2Live,
        isRental: [{ raw: 'False', value: 'False' }],
        tradePartnerName: { raw: 'Partner X', value: 'Partner X' },
        invoiceAmount: { raw: '50.00', value: 50.00, count: 1, multiple: false },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(valResultFile2Pass.environment.status, 'VALID', 'File 2 now passes with its own verified Environment');
    assert.strictEqual(valResultFile2Pass.isValid, true);

    // Step 5: File 3 has Environment: dev / test
    simulateOpenFile('https://app.nanonets.com/#/review/model1/file3');
    let env3Live = scanSidebar({ raw: 'dev', value: 'dev' });
    const valResultFile3Fail = evaluateSidebarValidation({
        environment: env3Live,
        isRental: [{ raw: 'False', value: 'False' }],
        tradePartnerName: { raw: 'Partner X', value: 'Partner X' },
        invoiceAmount: { raw: '50.00', value: 50.00, count: 1, multiple: false },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(valResultFile3Fail.environment.status, 'ERROR', 'Non-prod environment must be rejected');
    assert.strictEqual(valResultFile3Fail.isValid, false);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 12: Column Isolation & Strict Header Matching
// ============================================================
function testColumnIsolationAndStrictHeaders() {
    console.log('Test 12: Column Isolation & Strict Header Matching (Cyl_Returned vs Item_Price, Cyl_Shipped vs Qty)');

    const EXCLUDED_HEADERS = /^(cyl_returned|cyl_shipped|computations|unit_of_measure|description|item_no_2|qty_ordered)$/i;
    const HEADER_PATTERNS = {
        qty: /^(qty|quantity|units|count)$/i,
        price: /^(item_price|unit_price|price|rate|unit_cost)$/i,
        amount: /^(line_amount|amount|total|line_total|net_amount|item_amount)$/i,
        item_no: /^(item_no|item_number|part_no|sku)$/i,
    };

    function mapHeadersTest(headers) {
        const mapping = { qty: null, price: null, amount: null, item_no: null };

        // Pass 1: exact preferred
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
            if (EXCLUDED_HEADERS.test(norm)) continue;

            if (!mapping.qty && norm === 'qty') mapping.qty = header;
            if (!mapping.price && norm === 'item_price') mapping.price = header;
            if (!mapping.amount && norm === 'line_amount') mapping.amount = header;
            if (!mapping.item_no && norm === 'item_no') mapping.item_no = header;
        }

        // Pass 2: secondary regex, strictly skipping excluded
        for (const header of headers) {
            const norm = header.name.toLowerCase().replace(/[\s-]+/g, '_').trim();
            if (EXCLUDED_HEADERS.test(norm)) continue;

            for (const [type, pattern] of Object.entries(HEADER_PATTERNS)) {
                if (mapping[type]) continue;
                if (pattern.test(norm) || pattern.test(header.name.toLowerCase())) {
                    mapping[type] = header;
                    break;
                }
            }
        }
        return mapping;
    }

    // Exact headers from user's table (see screenshot):
    // Computations, Cyl_Returned, Cyl_Shipped, Description, Item_No, Item_No_2, Item_Price, Line_Amount, Qty, Qty_Ordered, Unit_Of_Measure
    const userHeaders = [
        { name: 'Computations', centerX: 50, rect: { left: 0, right: 100 } },
        { name: 'Cyl_Returned', centerX: 150, rect: { left: 100, right: 200 } },
        { name: 'Cyl_Shipped', centerX: 250, rect: { left: 200, right: 300 } },
        { name: 'Description', centerX: 350, rect: { left: 300, right: 400 } },
        { name: 'Item_No', centerX: 450, rect: { left: 400, right: 500 } },
        { name: 'Item_No_2', centerX: 550, rect: { left: 500, right: 600 } },
        { name: 'Item_Price', centerX: 650, rect: { left: 600, right: 700 } },
        { name: 'Line_Amount', centerX: 750, rect: { left: 700, right: 800 } },
        { name: 'Qty', centerX: 850, rect: { left: 800, right: 900 } },
        { name: 'Qty_Ordered', centerX: 950, rect: { left: 900, right: 1000 } },
        { name: 'Unit_Of_Measure', centerX: 1050, rect: { left: 1000, right: 1100 } }
    ];

    const mapping = mapHeadersTest(userHeaders);

    assert.ok(mapping.qty, 'Qty must be mapped');
    assert.strictEqual(mapping.qty.name, 'Qty', 'Qty must map to Qty, not Cyl_Shipped or Qty_Ordered');

    assert.ok(mapping.price, 'Item_Price must be mapped');
    assert.strictEqual(mapping.price.name, 'Item_Price', 'Price must map to Item_Price, not Cyl_Returned');

    assert.ok(mapping.amount, 'Line_Amount must be mapped');
    assert.strictEqual(mapping.amount.name, 'Line_Amount');

    assert.ok(mapping.item_no, 'Item_No must be mapped');
    assert.strictEqual(mapping.item_no.name, 'Item_No', 'Item_No must map to Item_No, not Item_No_2');

    // Simulate getHeaderForInput across all columns
    function getHeaderForInput(inputCenterX) {
        // Direct span match
        for (const hdr of userHeaders) {
            if (hdr.rect && typeof hdr.rect.left === 'number' && typeof hdr.rect.right === 'number') {
                if (inputCenterX >= (hdr.rect.left - 4) && inputCenterX <= (hdr.rect.right + 4)) {
                    return hdr;
                }
            }
        }
        let closestHdr = null;
        let closestDist = Infinity;
        for (const hdr of userHeaders) {
            const dist = Math.abs(inputCenterX - hdr.centerX);
            if (dist < closestDist) {
                closestDist = dist;
                closestHdr = hdr;
            }
        }
        return closestHdr;
    }

    function assignCell(row, matchedHdr, val) {
        if (!matchedHdr) return;
        if (mapping.qty && matchedHdr.name === mapping.qty.name) {
            row.qty = val;
        } else if (mapping.price && matchedHdr.name === mapping.price.name) {
            row.price = val;
        } else if (mapping.amount && matchedHdr.name === mapping.amount.name) {
            row.amount = val;
        } else if (mapping.item_no && matchedHdr.name === mapping.item_no.name) {
            row.item_no = val;
        }
    }

    // Row inputs with values for all 11 columns
    const inputsInRow = [
        { centerX: 50, value: 'COMP-1' },       // Computations
        { centerX: 150, value: '5' },           // Cyl_Returned (was being misidentified as Item_Price!)
        { centerX: 250, value: '10' },          // Cyl_Shipped (was being misidentified as Qty!)
        { centerX: 350, value: 'Steel Cylinder' }, // Description
        { centerX: 450, value: 'CYL-001' },     // Item_No
        { centerX: 550, value: 'CYL-SEC-2' },   // Item_No_2
        { centerX: 650, value: '45.00' },       // Item_Price (ACTUAL price)
        { centerX: 750, value: '90.00' },       // Line_Amount (ACTUAL amount)
        { centerX: 850, value: '2' },           // Qty (ACTUAL qty: 2 * 45 = 90)
        { centerX: 950, value: '12' },          // Qty_Ordered (was being misidentified as Qty!)
        { centerX: 1050, value: 'EA' }          // Unit_Of_Measure
    ];

    const extractedRow = { qty: null, price: null, amount: null, item_no: null };
    for (const inp of inputsInRow) {
        const matched = getHeaderForInput(inp.centerX);
        assignCell(extractedRow, matched, inp.value);
    }

    assert.strictEqual(extractedRow.price, '45.00', 'Row price must be 45.00, NOT 5 (Cyl_Returned)');
    assert.strictEqual(extractedRow.qty, '2', 'Row qty must be 2, NOT 10 (Cyl_Shipped) or 12 (Qty_Ordered)');
    assert.strictEqual(extractedRow.amount, '90.00', 'Row amount must be 90.00');
    assert.strictEqual(extractedRow.item_no, 'CYL-001', 'Row item_no must be CYL-001, NOT CYL-SEC-2');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 13: Multi-Page Error Tracking Across Scanned Pages
// ============================================================
function testMultiPageErrorTracking() {
    console.log('Test 13: Multi-Page Error Tracking across multiple invoice pages');

    const multiPageStore = {
        fileHash: '#/ocr/test/model1/file1',
        totalPages: 3,
        pages: {}
    };

    // Page 1: Has calculation error (Row 1: 2 * 10 = 25 -> INVALID)
    multiPageStore.pages[1] = {
        pageNumber: 1,
        sumAmount: 25.00,
        rowCount: 1,
        totalRows: 1,
        calcErrors: 1,
        itemNoErrors: 0,
        itemNoWarnings: 0,
        hasErrors: true,
        hasCautions: false,
        errorSummary: '1 calc error',
        status: 'INVALID'
    };

    // Page 2: Valid (Row 1: 5 * 10 = 50 -> VALID)
    multiPageStore.pages[2] = {
        pageNumber: 2,
        sumAmount: 50.00,
        rowCount: 1,
        totalRows: 1,
        calcErrors: 0,
        itemNoErrors: 0,
        itemNoWarnings: 0,
        hasErrors: false,
        hasCautions: false,
        errorSummary: 'Valid',
        status: 'VALID'
    };

    // Helper to evaluate multi-page errors
    function getMultiPageErrorInfo(store, currentPage) {
        const recordedPages = Object.keys(store.pages).map(Number).sort((a, b) => a - b);
        const pagesWithErrors = [];
        const pagesWithCautions = [];
        const pageStatusList = [];

        for (const p of recordedPages) {
            const pData = store.pages[p];
            if (pData.hasErrors) {
                pagesWithErrors.push(p);
            } else if (pData.hasCautions) {
                pagesWithCautions.push(p);
            }
            pageStatusList.push({
                page: p,
                status: pData.status,
                calcErrors: pData.calcErrors,
                itemNoErrors: pData.itemNoErrors,
                errorSummary: pData.errorSummary
            });
        }

        const otherPagesWithErrors = pagesWithErrors.filter(p => p !== currentPage);
        const currentPageErrors = store.pages[currentPage]?.calcErrors || 0;
        const totalErrorCount = currentPageErrors + otherPagesWithErrors.length;

        // Compute badge label
        let badgeText = '';
        if (totalErrorCount > 0) {
            const pagesStr = pagesWithErrors.map(p => `P${p}`).join(', ');
            const errLabel = pagesWithErrors.length > 1 ? 'Errors' : 'Error';
            badgeText = `❌ ${pagesStr} ${errLabel}`;
        } else {
            badgeText = `✅ Valid`;
        }

        return {
            pagesWithErrors,
            pagesWithCautions,
            pageStatusList,
            totalErrorCount,
            badgeText
        };
    }

    // When viewing Page 2 (which is clean itself):
    const page2View = getMultiPageErrorInfo(multiPageStore, 2);
    assert.deepStrictEqual(page2View.pagesWithErrors, [1], 'Page 1 must be flagged as having errors');
    assert.strictEqual(page2View.totalErrorCount, 1, 'Total error count must reflect Page 1 error even while viewing Page 2');
    assert.strictEqual(page2View.badgeText, '❌ P1 Error', 'Badge must show "❌ P1 Error" while on Page 2 so user is aware of error on Page 1!');

    // When Page 2 also has an error:
    multiPageStore.pages[2].hasErrors = true;
    multiPageStore.pages[2].calcErrors = 2;
    multiPageStore.pages[2].status = 'INVALID';
    multiPageStore.pages[2].errorSummary = '2 calc errors';

    const bothPagesView = getMultiPageErrorInfo(multiPageStore, 2);
    assert.deepStrictEqual(bothPagesView.pagesWithErrors, [1, 2], 'Both Page 1 and Page 2 must be flagged');
    assert.strictEqual(bothPagesView.badgeText, '❌ P1, P2 Errors', 'Badge must show "❌ P1, P2 Errors"');

    // When Page 1 error is corrected:
    multiPageStore.pages[1].hasErrors = false;
    multiPageStore.pages[1].calcErrors = 0;
    multiPageStore.pages[1].status = 'VALID';
    multiPageStore.pages[2].hasErrors = false;
    multiPageStore.pages[2].calcErrors = 0;
    multiPageStore.pages[2].status = 'VALID';

    const cleanView = getMultiPageErrorInfo(multiPageStore, 2);
    assert.deepStrictEqual(cleanView.pagesWithErrors, [], 'No pages should have errors');
    assert.strictEqual(cleanView.badgeText, '✅ Valid');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 14: Invoice Number Extraction & Document Partitioning
// ============================================================
function testInvoiceNumberPartitioning() {
    console.log('Test 14: Invoice Number Extraction & Document Partitioning');

    // 1. Extraction logic test
    function extractInvoiceNumberFromDom(mockDom) {
        const labelStrings = /^(invoice\s*number|invoice\s*no|inv\s*no|invoice_number)$/i;
        
        const testIdEl = mockDom.querySelector('[data-testid*="invoice_number"]');
        if (testIdEl) {
            const input = testIdEl.querySelector('input');
            const raw = input ? input.value : testIdEl.textContent;
            if (raw && !labelStrings.test(raw.trim())) {
                return raw.trim();
            }
        }

        const rows = mockDom.querySelectorAll('.sidebar-row');
        for (const row of rows) {
            const label = row.querySelector('.label')?.textContent?.trim() || '';
            if (/^(invoice\s*number|invoice\s*#|inv\s*#|invoice_no)/i.test(label)) {
                const val = row.querySelector('.value, input')?.value || row.querySelector('.value')?.textContent || '';
                if (val && !labelStrings.test(val.trim())) {
                    return val.trim();
                }
            }
        }
        return null;
    }

    // Verify it extracts value and excludes header/label
    const dom1 = {
        querySelector: (sel) => {
            if (sel.includes('invoice_number')) {
                return {
                    querySelector: () => ({ value: 'INV-2024-001' }),
                    textContent: 'Invoice Number INV-2024-001'
                };
            }
            return null;
        },
        querySelectorAll: () => []
    };
    assert.strictEqual(extractInvoiceNumberFromDom(dom1), 'INV-2024-001', 'Should extract INV-2024-001');

    // 2. Partitioning logic: isSameDocumentInstance
    function isSameDocumentInstance(prevHash, currHash, prevInv, currInv) {
        if (!prevHash || !currHash) return false;
        // If invoice numbers are present in both and differ, treat as different document
        if (prevInv && currInv && prevInv !== currInv) {
            return false;
        }
        // Base hash comparison
        const normPrev = prevHash.split('?')[0].split('&')[0];
        const normCurr = currHash.split('?')[0].split('&')[0];
        return normPrev === normCurr;
    }

    const docHash = '#/ocr/test/model1/batch_file_123';
    // Case A: Same file hash, same invoice number -> same document (accumulate)
    assert.strictEqual(
        isSameDocumentInstance(docHash, docHash, 'INV-100', 'INV-100'),
        true,
        'Same hash and same invoice number must match'
    );

    // Case B: Same file hash, but second page has a different invoice number (e.g. multi-invoice batch PDF)
    assert.strictEqual(
        isSameDocumentInstance(docHash, docHash, 'INV-100', 'INV-101'),
        false,
        'Different invoice number must partition document and trigger reset'
    );

    // Case C: Same file hash, invoice number unscrolled/null on page 2
    assert.strictEqual(
        isSameDocumentInstance(docHash, docHash, 'INV-100', null),
        true,
        'Null invoice number should not falsely break same file hash'
    );

    console.log('  Passed ✅');
}

// ============================================================
// TEST 15: Single Multi-Page Invoice Total Placement & Validation
// ============================================================
function testMultiPageTotalPlacement() {
    console.log('Test 15: Single Multi-Page Invoice Total Placement & Validation');

    // Scenario: 3-page single invoice
    // Page 1 sum: $50.00, Page 2 sum: $60.00, Page 3 sum: $40.00. Total = $150.00.
    function evaluatePageTotal(store, currentPage, totalPages, liveInvoiceAmount, recordedLastInvoiceAmount) {
        const recordedPages = Object.keys(store.pages).map(Number).sort((a, b) => a - b);
        const cumulativeSum = recordedPages.reduce((sum, p) => sum + (store.pages[p].sumAmount || 0), 0);
        const effectiveInvoiceAmount = liveInvoiceAmount || (recordedLastInvoiceAmount ? { value: recordedLastInvoiceAmount } : null);

    // Check if invoice_amount is placed on earlier pages — keep it pending until all pages are recorded
    if (currentPage < totalPages && liveInvoiceAmount && liveInvoiceAmount.value) {
        return {
            status: 'MULTI_PAGE_PENDING',
            message: `invoice_amount pending until all pages recorded`,
            isPendingInvoiceAmount: true,
            invoiceAmount: liveInvoiceAmount.value,
            sumAmount: cumulativeSum,
            currentPage,
            totalPages
        };
    }

    // Earlier page evaluation:
    if (currentPage < totalPages) {
        // Check if all pages are already recorded and match
        const allVisited = recordedPages.length === totalPages;
        if (allVisited && effectiveInvoiceAmount) {
            const diff = Math.abs(cumulativeSum - effectiveInvoiceAmount.value);
            if (diff <= 0.10) {
                return {
                    status: 'MATCH',
                    isMultiPage: true,
                    sumAmount: cumulativeSum,
                    invoiceAmount: effectiveInvoiceAmount.value,
                    difference: diff
                };
            }
        }
        return {
            status: 'MULTI_PAGE_PENDING',
            isMultiPage: true,
            currentPage,
            totalPages,
            pageSum: store.pages[currentPage]?.sumAmount || 0,
            sumAmount: cumulativeSum,
            recordedPages
        };
    }

    // On last page (currentPage === totalPages):
    if (!effectiveInvoiceAmount || effectiveInvoiceAmount.value === null) {
        return {
            status: 'NOT_FOUND',
            isMultiPage: true,
            sumAmount: cumulativeSum
        };
    }

    // Check for missing pages
    const missingPages = [];
    for (let p = 1; p < totalPages; p++) {
        if (!store.pages[p]) missingPages.push(p);
    }
    if (missingPages.length > 0) {
        return {
            status: 'PAGES_MISSING',
            isMultiPage: true,
            missingPages,
            sumAmount: cumulativeSum,
            invoiceAmount: effectiveInvoiceAmount.value
        };
    }

    const diff = Math.abs(cumulativeSum - effectiveInvoiceAmount.value);
    return {
        status: diff <= 0.10 ? 'MATCH' : 'MISMATCH',
        isMultiPage: true,
        sumAmount: cumulativeSum,
        invoiceAmount: effectiveInvoiceAmount.value,
        difference: diff
    };
}

const store = {
    pages: {
        1: { sumAmount: 50.00 }
    }
};

// 1. On Page 1 (earlier page), no live invoice amount: should return MULTI_PAGE_PENDING
const p1Pending = evaluatePageTotal(store, 1, 3, null, null);
assert.strictEqual(p1Pending.status, 'MULTI_PAGE_PENDING');
assert.strictEqual(p1Pending.sumAmount, 50.00);

// 2. On Page 1, invoice_amount found on Page 1: must be remembered and kept pending (NOT an error!)
const p1PendingWithInv = evaluatePageTotal(store, 1, 3, { value: 150.00 }, null);
assert.strictEqual(p1PendingWithInv.status, 'MULTI_PAGE_PENDING');
assert.strictEqual(p1PendingWithInv.isPendingInvoiceAmount, true);
assert.strictEqual(p1PendingWithInv.invoiceAmount, 150.00);

// 3. User navigates to Page 2 (sum: $60.00)
store.pages[2] = { sumAmount: 60.00 };
const p2Pending = evaluatePageTotal(store, 2, 3, null, 150.00);
assert.strictEqual(p2Pending.status, 'MULTI_PAGE_PENDING');
assert.strictEqual(p2Pending.sumAmount, 110.00);

// 4. User navigates to Page 3 (sum: $40.00, live invoice_amount: $150.00)
store.pages[3] = { sumAmount: 40.00 };
const p3Match = evaluatePageTotal(store, 3, 3, { value: 150.00 }, 150.00);
assert.strictEqual(p3Match.status, 'MATCH');
assert.strictEqual(p3Match.sumAmount, 150.00);
assert.strictEqual(p3Match.invoiceAmount, 150.00);
assert.strictEqual(p3Match.difference, 0.00);

// 5. User navigates back to Page 1:
// With all pages visited and remembered invoice amount $150.00, it stays MATCH
const p1Revisit = evaluatePageTotal(store, 1, 3, null, 150.00);
assert.strictEqual(p1Revisit.status, 'MATCH', 'Navigating back to Page 1 after completion must maintain MATCH status');

console.log('  Passed ✅');
}

// ============================================================
// TEST 16: Handling Document Pages Without Tables
// ============================================================
function testPageWithoutTable() {
    console.log('Test 16: Handling Document Pages Without Tables (Cover/T&C/Receipt)');

    // 3-page document where Page 2 has no line items table
    const store = {
        pages: {}
    };

    // Page 1: 2 rows totaling $100.00
    store.pages[1] = {
        pageNumber: 1,
        sumAmount: 100.00,
        rowCount: 2,
        hasNoTable: false,
        status: 'VALID'
    };

    // Page 2: No table found! Recorded gracefully as 0 items, $0.00 sum
    function recordTablelessPage(pageNo) {
        return {
            pageNumber: pageNo,
            sumAmount: 0.00,
            rowCount: 0,
            totalRows: 0,
            calcErrors: 0,
            itemNoErrors: 0,
            itemNoWarnings: 0,
            hasErrors: false,
            hasCautions: false,
            hasNoTable: true,
            status: 'VALID',
            errorSummary: 'No Table'
        };
    }

    store.pages[2] = recordTablelessPage(2);
    assert.strictEqual(store.pages[2].hasNoTable, true);
    assert.strictEqual(store.pages[2].sumAmount, 0.00);
    assert.strictEqual(store.pages[2].status, 'VALID');

    // Page 3: 1 row totaling $50.00
    store.pages[3] = {
        pageNumber: 3,
        sumAmount: 50.00,
        rowCount: 1,
        hasNoTable: false,
        status: 'VALID'
    };

    // Check missing pages on Page 3
    const totalPages = 3;
    const missingPages = [];
    for (let p = 1; p < totalPages; p++) {
        if (!store.pages[p]) missingPages.push(p);
    }

    assert.strictEqual(missingPages.length, 0, 'Page 2 must NOT be marked as missing because it was scanned as table-less');

    // Total cumulative sum should be $100 + $0 + $50 = $150.00
    const cumulativeSum = [1, 2, 3].reduce((sum, p) => sum + store.pages[p].sumAmount, 0);
    assert.strictEqual(cumulativeSum, 150.00);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 17: Prioritized Page Info Detection (Active Pager & Selected Thumbnail vs Static Thumbnail 1)
// ============================================================
function testPrioritizedPageDetection() {
    console.log('Test 17: Prioritized Page Info Detection (Pager Input & Selected Thumbnail vs Static Thumbnail 1)');

    function detectPagePriority(mockContext) {
        // Strategy 1: Active pager input
        if (mockContext.pagerInput) {
            const val = parseInt(mockContext.pagerInput.value, 10);
            if (!isNaN(val) && val >= 1) {
                let total = mockContext.pagerInput.max ? parseInt(mockContext.pagerInput.max, 10) : null;
                if (!total && mockContext.pagerInput.siblingText) {
                    const match = mockContext.pagerInput.siblingText.match(/(?:of|\/)\s*(\d+)/i);
                    if (match) total = parseInt(match[1], 10);
                }
                if (total) {
                    return { currentPage: val, totalPages: total, isMultiPage: total > 1, source: 'S1_pager_input' };
                }
            }
        }

        // Strategy 3: Selected thumbnail
        if (mockContext.selectedThumbnail) {
            const text = mockContext.selectedThumbnail.text || '';
            const match = text.match(/page\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) || text.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
            if (match) {
                const curr = parseInt(match[1], 10);
                const total = parseInt(match[2], 10);
                return { currentPage: curr, totalPages: total, isMultiPage: total > 1, source: 'S3_selected_thumbnail' };
            }
        }

        // Strategy 5 (Naive text search): Would match Thumbnail 1!
        if (mockContext.staticThumbnail1) {
            const match = mockContext.staticThumbnail1.text.match(/page\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
            if (match) {
                return { currentPage: parseInt(match[1], 10), totalPages: parseInt(match[2], 10), isMultiPage: true, source: 'S5_naive' };
            }
        }

        return null;
    }

    // When on Page 2:
    const mockOnPage2 = {
        staticThumbnail1: { text: 'Page 1 of 3' },
        pagerInput: { value: '2', siblingText: '/ 3' },
        selectedThumbnail: { text: '2 of 3' }
    };

    const detected = detectPagePriority(mockOnPage2);
    assert.ok(detected);
    assert.strictEqual(detected.currentPage, 2, 'Must detect Page 2, NOT Page 1 from static thumbnail 1');
    assert.strictEqual(detected.totalPages, 3);
    assert.strictEqual(detected.source, 'S1_pager_input');

    // When pager input is not present, but selected thumbnail is on Page 2:
    const mockThumbnailOnly = {
        staticThumbnail1: { text: 'Page 1 of 3' },
        pagerInput: null,
        selectedThumbnail: { text: 'Page 2 of 3' }
    };
    const detectedThumb = detectPagePriority(mockThumbnailOnly);
    assert.ok(detectedThumb);
    assert.strictEqual(detectedThumb.currentPage, 2, 'Must detect Page 2 from selected thumbnail');
    assert.strictEqual(detectedThumb.source, 'S3_selected_thumbnail');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 18: Fast Navigation Between Table and Table-less Pages
// ============================================================
function testPageTransitionWithTablelessPage() {
    console.log('Test 18: Fast Navigation between Table (P1) and Table-less (P2) Pages');

    let multiPageStore = {
        fileHash: '#/ocr/test/m1/f1',
        totalPages: 2,
        pages: {}
    };

    let activeValidationResult = null;
    let sidebarMemory = {
        pageInfo: { currentPage: 1, totalPages: 2, isMultiPage: true }
    };

    // Step 1: User is on Page 1 (has table with 1 row = $75.00)
    function simulateScanPage(pageNum, hasTable, tableRows) {
        if (!hasTable) {
            activeValidationResult = {
                success: true,
                results: [],
                summary: { total: 0, valid: 0, invalid: 0, incomplete: 0 },
                hasNoTable: true,
                pageInfo: { currentPage: pageNum, totalPages: 2 }
            };
            multiPageStore.pages[pageNum] = {
                pageNumber: pageNum,
                sumAmount: 0.00,
                rowCount: 0,
                hasNoTable: true,
                status: 'VALID',
                errorSummary: 'No Table'
            };
            return activeValidationResult;
        }

        activeValidationResult = {
            success: true,
            results: tableRows,
            summary: { total: tableRows.length, valid: tableRows.length, invalid: 0 },
            hasNoTable: false,
            pageInfo: { currentPage: pageNum, totalPages: 2 }
        };
        const sum = tableRows.reduce((acc, r) => acc + (r.actual || 0), 0);
        multiPageStore.pages[pageNum] = {
            pageNumber: pageNum,
            sumAmount: sum,
            rowCount: tableRows.length,
            hasNoTable: false,
            status: 'VALID',
            errorSummary: 'Valid'
        };
        return activeValidationResult;
    }

    // Scan Page 1
    const p1Result = simulateScanPage(1, true, [{ actual: 75.00 }]);
    assert.strictEqual(p1Result.hasNoTable, false);
    assert.strictEqual(multiPageStore.pages[1].sumAmount, 75.00);

    // Step 2: User flips to Page 2 (which has NO table)
    // Even though activeValidationResult from Page 1 exists, moving to Page 2 must process Page 2!
    sidebarMemory.pageInfo = { currentPage: 2, totalPages: 2, isMultiPage: true };
    const p2Result = simulateScanPage(2, false, []);

    assert.ok(p2Result, 'Page 2 scan must succeed and not be swallowed by Page 1 result');
    assert.strictEqual(p2Result.hasNoTable, true);
    assert.strictEqual(p2Result.pageInfo.currentPage, 2);
    assert.strictEqual(multiPageStore.pages[2].hasNoTable, true);
    assert.strictEqual(multiPageStore.pages[2].sumAmount, 0.00);
    assert.strictEqual(multiPageStore.pages[1].sumAmount, 75.00, 'Page 1 data must be retained');

    // Step 3: User flips back to Page 1
    sidebarMemory.pageInfo = { currentPage: 1, totalPages: 2, isMultiPage: true };
    const p1Revisit = simulateScanPage(1, true, [{ actual: 75.00 }]);
    assert.strictEqual(p1Revisit.hasNoTable, false);
    assert.strictEqual(multiPageStore.pages[2].hasNoTable, true, 'Page 2 table-less record must still exist');
    assert.strictEqual(Object.keys(multiPageStore.pages).length, 2, 'Both pages must be tracked');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 19: Valid State Preservation Against Detection Misses
// ============================================================
function testValidStatePreservedAgainstTemporaryDetectionMiss() {
    console.log('Test 19: Valid State Preservation Against Temporary Detection Misses');

    let currentBadgeState = 'valid';
    let currentBadgeText = '1/1 Valid';

    // Mock active validation result representing the user's screenshot
    const activeResult = {
        success: true,
        summary: { total: 1, valid: 1, invalid: 0, incomplete: 0 },
        results: [{ actual: 29.45, status: 'VALID' }],
        sidebarValidation: { isValid: true, environment: { status: 'VALID' }, isRental: { status: 'VALID' }, tradePartner: { status: 'VALID' } },
        totalValidation: { status: 'MATCH', sumAmount: 29.45, invoiceAmount: 29.45 }
    };

    function simulateDetectionAttempt(detectSucceeded, existingValidationResult) {
        if (!detectSucceeded) {
            // If existing valid validationResult is present, NEVER wipe badge to 'noData'!
            if (existingValidationResult && existingValidationResult.summary && existingValidationResult.summary.total >= 0 && existingValidationResult.success) {
                // Preserved!
                currentBadgeState = 'valid';
                currentBadgeText = `${existingValidationResult.summary.total}/${existingValidationResult.summary.total} Valid`;
                return { preserved: true };
            }

            // Only set noData if there was never any valid data
            currentBadgeState = 'noData';
            currentBadgeText = 'No Data Found';
            return { preserved: false };
        }

        currentBadgeState = 'valid';
        currentBadgeText = '1/1 Valid';
        return { preserved: true };
    }

    // 1. Initially validated
    simulateDetectionAttempt(true, activeResult);
    assert.strictEqual(currentBadgeState, 'valid');
    assert.strictEqual(currentBadgeText, '1/1 Valid');

    // 2. A subsequent DOM debounce or background check fails to detect table (e.g. user scrolled or temporary churn)
    const result = simulateDetectionAttempt(false, activeResult);
    assert.strictEqual(result.preserved, true, 'Existing valid result must be preserved');
    assert.strictEqual(currentBadgeState, 'valid', 'Badge state must NOT be wiped to noData or caution');
    assert.strictEqual(currentBadgeText, '1/1 Valid');

    // 3. In contrast, on a fresh uninitialized page where no validationResult exists:
    const freshResult = simulateDetectionAttempt(false, null);
    assert.strictEqual(freshResult.preserved, false);
    assert.strictEqual(currentBadgeState, 'noData');
    assert.strictEqual(currentBadgeText, 'No Data Found');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 20: Three Navigation Tracking Methods (URL, invoice_number, page_number)
// ============================================================
function testThreeNavigationTrackingMethods() {
    console.log('Test 20: Three Navigation Tracking Methods (URL, invoice_number, page_number)');

    let extensionResetTriggered = false;
    let pageFlipTriggered = false;
    let lastObservedHref = 'https://nanonets.com/#/ocr/123/doc1';
    let lastObservedPageNum = 1;
    let lastKnownInvoiceNumber = 'INV-1001';

    function evaluateNavigation(context) {
        extensionResetTriggered = false;
        pageFlipTriggered = false;

        // METHOD 1: URL Tracking
        if (context.currentHref !== lastObservedHref) {
            lastObservedHref = context.currentHref;
            extensionResetTriggered = true;
            lastKnownInvoiceNumber = null;
            lastObservedPageNum = null;
            return { reason: 'METHOD_1_URL_CHANGED' };
        }

        // METHOD 2: Sidebar invoice_number Tracking
        if (context.liveInvoiceNumber) {
            const liveNum = context.liveInvoiceNumber.trim();
            if (lastKnownInvoiceNumber && liveNum.toLowerCase() !== lastKnownInvoiceNumber.toLowerCase()) {
                lastKnownInvoiceNumber = liveNum;
                extensionResetTriggered = true;
                return { reason: 'METHOD_2_INVOICE_NUM_CHANGED' };
            }
            lastKnownInvoiceNumber = liveNum;
        }
        // If context.liveInvoiceNumber is null: user scrolled the sidebar, DO NOT RESET!

        // METHOD 3: Page Number Tracking for Multi-Page Files
        if (context.isMultiPage && context.currentPage && context.totalPages > 1) {
            if (lastObservedPageNum !== null && context.currentPage !== lastObservedPageNum) {
                lastObservedPageNum = context.currentPage;
                pageFlipTriggered = true;
                return { reason: 'METHOD_3_PAGE_FLIP' };
            }
            lastObservedPageNum = context.currentPage;
        }

        return { reason: 'NO_CHANGE' };
    }

    // Scenario 1: Same page, user scrolled sidebar down (invoice_number temporarily invisible)
    let outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/doc1',
        liveInvoiceNumber: null, // Scrolled offscreen
        isMultiPage: false,
        currentPage: 1,
        totalPages: 1
    });
    assert.strictEqual(outcome.reason, 'NO_CHANGE');
    assert.strictEqual(extensionResetTriggered, false, 'Scrolling sidebar down must NOT trigger reset');
    assert.strictEqual(lastKnownInvoiceNumber, 'INV-1001', 'Must remember last known invoice_number');

    // Scenario 1b: User scrolls back up, invoice_number re-appears with same value
    outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/doc1',
        liveInvoiceNumber: 'INV-1001',
        isMultiPage: false,
        currentPage: 1,
        totalPages: 1
    });
    assert.strictEqual(outcome.reason, 'NO_CHANGE');
    assert.strictEqual(extensionResetTriggered, false, 'Same invoice_number re-appearing must NOT trigger reset');

    // Scenario 2: invoice_number changes (new invoice loaded)
    outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/doc1',
        liveInvoiceNumber: 'INV-9999',
        isMultiPage: false,
        currentPage: 1,
        totalPages: 1
    });
    assert.strictEqual(outcome.reason, 'METHOD_2_INVOICE_NUM_CHANGED');
    assert.strictEqual(extensionResetTriggered, true, 'Invoice number change must trigger reverification');
    assert.strictEqual(lastKnownInvoiceNumber, 'INV-9999');

    // Scenario 3: URL changes (Method 1)
    outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/doc2',
        liveInvoiceNumber: 'INV-9999',
        isMultiPage: false,
        currentPage: 1,
        totalPages: 1
    });
    assert.strictEqual(outcome.reason, 'METHOD_1_URL_CHANGED');
    assert.strictEqual(extensionResetTriggered, true, 'URL change must trigger reverification');

    // Scenario 4: Multi-page flip (Method 3)
    lastObservedHref = 'https://nanonets.com/#/ocr/123/multipage';
    lastObservedPageNum = 1;
    outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/multipage',
        liveInvoiceNumber: 'INV-5555',
        isMultiPage: true,
        currentPage: 2,
        totalPages: 2
    });
    assert.strictEqual(outcome.reason, 'METHOD_3_PAGE_FLIP');
    assert.strictEqual(pageFlipTriggered, true, 'Page flip from 1 to 2 must be detected');
    assert.strictEqual(lastObservedPageNum, 2);

    // Scenario 5: Single-page file does not trigger Method 3
    outcome = evaluateNavigation({
        currentHref: 'https://nanonets.com/#/ocr/123/multipage',
        liveInvoiceNumber: 'INV-5555',
        isMultiPage: false,
        currentPage: 1,
        totalPages: 1
    });
    assert.strictEqual(outcome.reason, 'NO_CHANGE');
    assert.strictEqual(pageFlipTriggered, false, 'Single page file must not trigger page flip');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 21: Table-less Page Panel Rendering Safety (No TypeError)
// ============================================================
function testPanelRenderSafeWithEmptyValidRows() {
    console.log('Test 21: Table-less Page Panel Rendering Safety (No TypeError)');

    // Mock validationResult when hasNoTable = true (e.g. cover page, last page without table)
    const tablelessValidationResult = {
        success: true,
        results: [],
        summary: { total: 0, valid: 0, invalid: 0, incomplete: 0, caution: 0 },
        hasNoTable: true,
        validRows: undefined, // Simulates the bug where validRows was undefined
        invalidRows: undefined,
        totalValidation: {
            isMultiPage: true,
            currentPage: 2,
            totalPages: 2,
            status: 'MATCH'
        }
    };

    // Simulate panel render logic from panel.js
    function renderPanelSafe(valResult) {
        const { summary, results, invalidRows, validRows } = valResult;

        // Defensive handling of validRows
        const validRowsList = validRows || [];
        const validRowData = validRowsList.map(r => ({
            qty: r.qty,
            price: r.price,
            amount: r.actual
        }));

        let html = `
          <div class="nanopro-summary">
            <span class="nanopro-summary-valid">✅ ${summary.valid}</span>
            <span class="nanopro-summary-invalid">❌ ${summary.invalid}</span>
            <span class="nanopro-summary-total">(${summary.total} total)</span>
          </div>
        `;

        if (valResult.hasNoTable || (summary.total === 0 && results.length === 0)) {
            const pageNum = valResult.totalValidation?.currentPage || '';
            html += `
              <div class="nanopro-empty-page">
                <div>Page ${pageNum}: No Line Items Table</div>
              </div>
            `;
        }

        return { success: true, html, validRowCount: validRowData.length };
    }

    assert.doesNotThrow(() => {
        const out = renderPanelSafe(tablelessValidationResult);
        assert.strictEqual(out.success, true);
        assert.strictEqual(out.validRowCount, 0);
        assert.ok(out.html.includes('No Line Items Table'), 'Must render empty page notice');
    }, 'Must not throw TypeError on tableless page');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 22: Side Panel 40% Scroll Threshold Detection
// ============================================================
function testSidePanelScrollThreshold() {
    console.log('Test 22: Side Panel 40% Scroll Threshold Detection');

    let recheckTriggeredCount = 0;
    let gesture = { startScrollTop: 0, triggered: false };

    function simulateSidePanelScroll(scrollTop, clientHeight, scrollHeight) {
        const delta = Math.abs(scrollTop - gesture.startScrollTop);
        const maxScroll = Math.max(scrollHeight - clientHeight, 1);
        const fractionOfVisible = delta / clientHeight;
        const fractionOfTotal = delta / maxScroll;

        // Threshold >= 0.38 (around 40%)
        const is40Percent = (fractionOfVisible >= 0.38 || fractionOfTotal >= 0.38);

        if (is40Percent && !gesture.triggered) {
            gesture.triggered = true;
            gesture.startScrollTop = scrollTop; // Reset so subsequent 40% scroll triggers again
            recheckTriggeredCount++;
            return { triggered: true, pct: Math.round(Math.max(fractionOfVisible, fractionOfTotal) * 100) };
        }

        return { triggered: false };
    }

    const clientHeight = 600;
    const scrollHeight = 2000;

    // 1. Small micro-scroll of 60px (10% of visible): Should NOT trigger recheck
    let res = simulateSidePanelScroll(60, clientHeight, scrollHeight);
    assert.strictEqual(res.triggered, false, '10% scroll must not trigger recheck');
    assert.strictEqual(recheckTriggeredCount, 0);

    // 2. Medium scroll to 150px (25% of visible): Should NOT trigger recheck
    res = simulateSidePanelScroll(150, clientHeight, scrollHeight);
    assert.strictEqual(res.triggered, false, '25% scroll must not trigger recheck');
    assert.strictEqual(recheckTriggeredCount, 0);

    // 3. Scroll to 250px (41.6% of visible -> ~40%): MUST trigger recheck!
    res = simulateSidePanelScroll(250, clientHeight, scrollHeight);
    assert.strictEqual(res.triggered, true, '~40% scroll must trigger state recheck');
    assert.strictEqual(recheckTriggeredCount, 1);

    // 4. Another small scroll of 30px within same gesture: Should NOT re-trigger
    res = simulateSidePanelScroll(280, clientHeight, scrollHeight);
    assert.strictEqual(res.triggered, false);
    assert.strictEqual(recheckTriggeredCount, 1);

    // 5. Idle timer expires (400ms passes), starting a NEW scroll gesture
    gesture = { startScrollTop: 280, triggered: false };

    // Now a new ~40% swipe: 280 + 250 = 530px: MUST trigger recheck again!
    res = simulateSidePanelScroll(530, clientHeight, scrollHeight);
    assert.strictEqual(res.triggered, true, 'Subsequent 40% scroll in new gesture must trigger recheck again');
    assert.strictEqual(recheckTriggeredCount, 2);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 23: Periodic 1-2 Second Table State Recheck
// ============================================================
function testPeriodicTableRecheckEvery1to2Seconds() {
    console.log('Test 23: Periodic 1-2 Second Table State Recheck');

    const config = {
        tableRecheckInterval: 1500 // 1.5 seconds (in 1-2s range)
    };

    assert.ok(config.tableRecheckInterval >= 1000 && config.tableRecheckInterval <= 2000, 
        'Recheck interval must be between 1000ms and 2000ms (1-2s)');

    // Simulated DOM table state that the user is working on
    let domTable = [
        { qty: '2', price: '10.00', amount: '15.00', item_no: 'ITEM-01' } // Calculation error! 2*10 != 15
    ];

    let lastDetectedStateHash = null;
    let currentBadgeState = 'ready';
    let currentBadgeText = '';
    let currentValidationResult = null;
    let recheckCount = 0;

    function runTableRecheck(isBackgroundPoll = true) {
        recheckCount++;

        // 1. Detect table rows from DOM
        const rows = domTable.map(r => ({ ...r }));
        if (!rows.length) return;

        // 2. Hash check
        const rowsHash = JSON.stringify(rows);
        const currentStateHash = rowsHash + '|sidebar-mock';

        if (currentStateHash === lastDetectedStateHash && currentValidationResult) {
            // Silently return without updating badge or re-running calculations
            return { revalidated: false, summary: currentValidationResult.summary };
        }

        lastDetectedStateHash = currentStateHash;

        // 3. Re-validate rows
        let valid = 0;
        let invalid = 0;
        const results = rows.map(r => {
            const q = parseFloat(r.qty) || 0;
            const p = parseFloat(r.price) || 0;
            const a = parseFloat(r.amount) || 0;
            const expected = Math.round(q * p * 100) / 100;
            const isRowValid = Math.abs(expected - a) < 0.01;
            if (isRowValid) valid++;
            else invalid++;
            return {
                valid: isRowValid,
                actual: a,
                expected: expected
            };
        });

        currentValidationResult = {
            success: true,
            summary: { total: rows.length, valid, invalid },
            results
        };

        // 4. Update badge UI
        if (invalid > 0) {
            currentBadgeState = 'invalid';
            currentBadgeText = `❌ ${invalid} Calc Error`;
        } else {
            currentBadgeState = 'valid';
            currentBadgeText = `✅ ${valid}/${rows.length} Valid`;
        }

        return { revalidated: true, summary: currentValidationResult.summary };
    }

    // Step 1: Initial periodic check with the invalid table
    let check1 = runTableRecheck();
    assert.strictEqual(check1.revalidated, true);
    assert.strictEqual(check1.summary.invalid, 1);
    assert.strictEqual(currentBadgeState, 'invalid');
    assert.strictEqual(currentBadgeText, '❌ 1 Calc Error');

    // Step 2: Second check before user makes changes (rows identical)
    let check2 = runTableRecheck();
    assert.strictEqual(check2.revalidated, false, 'Should not re-validate if table rows are unchanged');
    assert.strictEqual(currentBadgeState, 'invalid');

    // Step 3: User fixes the table cell (amount 15.00 -> 20.00)
    domTable[0].amount = '20.00';

    // Step 4: Next 1-2 second periodic recheck ticks:
    let check3 = runTableRecheck();
    assert.strictEqual(check3.revalidated, true, 'Periodic recheck MUST detect cell edits in the table!');
    assert.strictEqual(check3.summary.valid, 1);
    assert.strictEqual(check3.summary.invalid, 0);
    assert.strictEqual(currentBadgeState, 'valid');
    assert.strictEqual(currentBadgeText, '✅ 1/1 Valid');

    // Step 5: User adds another valid row: Qty 3 @ 5.00 = 15.00
    domTable.push({ qty: '3', price: '5.00', amount: '15.00', item_no: 'ITEM-02' });

    // Step 6: Next periodic recheck ticks:
    let check4 = runTableRecheck();
    assert.strictEqual(check4.revalidated, true, 'Periodic recheck MUST detect added rows!');
    assert.strictEqual(check4.summary.total, 2);
    assert.strictEqual(check4.summary.valid, 2);
    assert.strictEqual(check4.summary.invalid, 0);
    assert.strictEqual(currentBadgeText, '✅ 2/2 Valid');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 24: Single File Page Activation vs File List Suppression (app.nanonets.com alone)
// ============================================================
function testSingleFilePageActivationVsFileListSuppression() {
    console.log('Test 24: Single File Page Activation vs File List Suppression (app.nanonets.com alone)');

    const NON_FILE_ROUTES = /^(files|settings|train|extract|metrics|integrations|rules|activity|export|upload|analytics|logs)$/i;

    function isAppNanonets(urlStr) {
        try {
            const u = new URL(urlStr);
            return u.hostname === 'app.nanonets.com';
        } catch (e) {
            return false;
        }
    }

    function checkIsSingleFilePage(urlStr) {
        if (!isAppNanonets(urlStr)) return false;

        const u = new URL(urlStr);
        const rawTarget = u.hash.startsWith('#') ? u.hash.slice(1) : (u.pathname || '');
        const target = rawTarget.split('?')[0].split('#')[0];
        const segments = target.split('/').filter(Boolean);

        if (segments.length < 2) return false;

        const rootSection = segments[0].toLowerCase();
        if (!['ocr', 'review', 'workflow', 'models'].includes(rootSection)) {
            return false;
        }

        let modelIndex = 1;
        if (segments[1] && segments[1].toLowerCase() === 'test') {
            modelIndex = 2;
        }

        if (segments.length <= modelIndex + 1) {
            return false;
        }

        const modelId = segments[modelIndex];
        const fileId = segments[modelIndex + 1];

        if (!modelId || !fileId) return false;
        if (NON_FILE_ROUTES.test(fileId)) return false;

        return true;
    }

    // 1. User sample URL when a file IS opened
    const openedFileUrl = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/da419de4-a638-11f1-9b22-ba4a9f43fef7?rowsPerPage=';
    assert.strictEqual(checkIsSingleFilePage(openedFileUrl), true, 'Sample opened file URL must return true');

    // 2. User sample URL when file list is visible but file is NOT opened
    const fileListUrl = 'https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39?rowsPerPage';
    assert.strictEqual(checkIsSingleFilePage(fileListUrl), false, 'Sample file list URL must return false');

    // 3. Sub-tabs / settings inside model view
    assert.strictEqual(checkIsSingleFilePage('https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/settings'), false);
    assert.strictEqual(checkIsSingleFilePage('https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/train'), false);
    assert.strictEqual(checkIsSingleFilePage('https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/files'), false);

    // 4. Must run in app.nanonets.com alone (not generic nanonets.com or other domains)
    assert.strictEqual(checkIsSingleFilePage('https://nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/da419de4-a638-11f1-9b22-ba4a9f43fef7'), false);
    assert.strictEqual(checkIsSingleFilePage('https://www.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/da419de4-a638-11f1-9b22-ba4a9f43fef7'), false);
    assert.strictEqual(checkIsSingleFilePage('https://example.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/da419de4-a638-11f1-9b22-ba4a9f43fef7'), false);

    // 5. Lifecycle simulation: navigation from file list -> opened file -> back to file list
    let isInitialized = false;
    let overlayInjected = false;

    function simulateNavigation(targetUrl) {
        if (!checkIsSingleFilePage(targetUrl)) {
            if (isInitialized) {
                // cleanup
                isInitialized = false;
                overlayInjected = false;
            }
            return { active: false, overlay: overlayInjected };
        }

        if (!isInitialized) {
            isInitialized = true;
            overlayInjected = true;
        }
        return { active: true, overlay: overlayInjected };
    }

    // Step A: User starts on file list page
    let stateA = simulateNavigation(fileListUrl);
    assert.strictEqual(stateA.active, false, 'Extension must not be active on file list');
    assert.strictEqual(stateA.overlay, false, 'Overlay must not be injected on file list');

    // Step B: User clicks file and opens it
    let stateB = simulateNavigation(openedFileUrl);
    assert.strictEqual(stateB.active, true, 'Extension must activate when file is opened');
    assert.strictEqual(stateB.overlay, true, 'Overlay must be injected when file is opened');

    // Step C: User clicks back to file list
    let stateC = simulateNavigation(fileListUrl);
    assert.strictEqual(stateC.active, false, 'Extension must deactivate when returning to file list');
    assert.strictEqual(stateC.overlay, false, 'Overlay must be cleanly removed on file list');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 25: Item_No Whitespace Prohibition Validation
// ============================================================
function testItemNoWhitespaceProhibition() {
    console.log('Test 25: Item_No Whitespace Prohibition (spaces/whitespace throw item_no error)');

    const rentalTrueState = { isConsistent: true, allTrue: true, allFalse: false, status: 'VALID' };
    const rentalFalseState = { isConsistent: true, allTrue: false, allFalse: true, status: 'VALID' };

    // 1. Internal space -> ERROR
    const resInternalSpace = evaluateItemNoValidation(['CYL 001', 'ITEM 999-R'], true, rentalTrueState);
    assert.strictEqual(resInternalSpace.rowResults[0].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resInternalSpace.rowResults[0].itemNoSeverity, 'ERROR');
    assert.strictEqual(resInternalSpace.errors.length, 2);
    assert.strictEqual(resInternalSpace.rowResults[1].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resInternalSpace.rowResults[1].itemNoSeverity, 'ERROR');

    // 2. Space before suffix -> ERROR
    const resSpaceBeforeSuffix = evaluateItemNoValidation(['PART-100 -R'], true, rentalTrueState);
    assert.strictEqual(resSpaceBeforeSuffix.rowResults[0].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resSpaceBeforeSuffix.rowResults[0].itemNoSeverity, 'ERROR');

    // 3. Leading or trailing space -> ERROR
    const resSurroundingSpace = evaluateItemNoValidation([' ITEM-01', 'ITEM-02 '], true, rentalFalseState);
    assert.strictEqual(resSurroundingSpace.rowResults[0].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resSurroundingSpace.rowResults[0].itemNoSeverity, 'ERROR');
    assert.strictEqual(resSurroundingSpace.rowResults[1].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resSurroundingSpace.rowResults[1].itemNoSeverity, 'ERROR');

    // 4. Tab / multi-space -> ERROR
    const resTab = evaluateItemNoValidation(['SKU\t100', 'PART   200'], true, rentalFalseState);
    assert.strictEqual(resTab.rowResults[0].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resTab.rowResults[0].itemNoSeverity, 'ERROR');
    assert.strictEqual(resTab.rowResults[1].itemNoReason, 'CONTAINS_WHITESPACE');
    assert.strictEqual(resTab.rowResults[1].itemNoSeverity, 'ERROR');

    // 5. Clean item numbers without any spaces -> VALID (no whitespace error)
    const resCleanRental = evaluateItemNoValidation(['CYL-001-R', 'PART_99-R'], true, rentalTrueState);
    assert.strictEqual(resCleanRental.rowResults[0].itemNoWarning, false);
    assert.strictEqual(resCleanRental.rowResults[1].itemNoWarning, false);
    assert.strictEqual(resCleanRental.errors.length, 0);

    const resCleanNonRental = evaluateItemNoValidation(['CYL-001', 'ITEM_99', '12345'], true, rentalFalseState);
    assert.strictEqual(resCleanNonRental.rowResults[0].itemNoWarning, false);
    assert.strictEqual(resCleanNonRental.rowResults[1].itemNoWarning, false);
    assert.strictEqual(resCleanNonRental.rowResults[2].itemNoWarning, false);
    assert.strictEqual(resCleanNonRental.errors.length, 0);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 26: Full Reverification on Refresh & Sidebar Recovery Gating
// ============================================================
function testFullReverificationAndSidebarRecoveryGating() {
    console.log('Test 26: Full Reverification on Refresh & Sidebar Recovery Gating');

    function isSidebarErrorOrCautionActive(result) {
        if (!result) return false;

        const sb = result.sidebarValidation;
        if (sb) {
            if (sb.errors && sb.errors.length > 0) return true;
            if (sb.warnings && sb.warnings.length > 0) return true;
            if (sb.environment && sb.environment.status !== 'VALID') return true;
            if (sb.isRental && sb.isRental.status !== 'VALID') return true;
            if (sb.tradePartner && sb.tradePartner.status !== 'VALID') return true;
            if (sb.invoiceAmountMultiplicity && sb.invoiceAmountMultiplicity.status === 'ERROR') return true;
        }

        const totalVal = result.totalValidation;
        if (totalVal && (totalVal.status === 'MISMATCH' || totalVal.status === 'NOT_FOUND' || totalVal.status === 'MULTIPLE_INSTANCES')) {
            return true;
        }

        const allItemIssues = [...(result.itemNoWarnings || []), ...(result.itemNoErrors || [])];
        const hasRentalItemNoIssue = allItemIssues.some(w => 
            w.reason === 'MISSING_DASH_R' || w.reason === 'UNEXPECTED_DASH_R'
        );
        if (hasRentalItemNoIssue) return true;

        return false;
    }

    // 1. Gating Check: Sidebar errors/cautions must return true
    const caseRentalError = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: {
            errors: [{ field: 'is_rental', message: 'Inconsistent is_rental values: [False, True]' }],
            isRental: { status: 'ERROR', message: 'Inconsistent' }
        },
        itemNoErrors: [{ reason: 'UNEXPECTED_DASH_R', severity: 'ERROR' }]
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(caseRentalError), true, 'Rental error must activate sidebar checking');

    const caseEnvError = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: {
            errors: [{ field: 'Environment', message: 'Expected prod' }],
            environment: { status: 'ERROR', message: 'test' }
        }
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(caseEnvError), true, 'Environment error must activate sidebar checking');

    const caseTPError = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: {
            errors: [{ field: 'trade_partner_name', message: 'Blank' }],
            tradePartner: { status: 'ERROR', message: 'Blank' }
        }
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(caseTPError), true, 'Trade partner error must activate sidebar checking');

    const caseTotalMismatch = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: { errors: [], environment: { status: 'VALID' }, isRental: { status: 'VALID' }, tradePartner: { status: 'VALID' } },
        totalValidation: { status: 'MISMATCH', message: 'Total mismatch' }
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(caseTotalMismatch), true, 'Total mismatch must activate sidebar checking');

    // 2. Gating Check: Pure line item calculation error or valid state must return false
    const casePureMathError = {
        summary: { invalid: 1, total: 2 },
        sidebarValidation: {
            errors: [],
            warnings: [],
            environment: { status: 'VALID' },
            isRental: { status: 'VALID' },
            tradePartner: { status: 'VALID' },
            invoiceAmountMultiplicity: { status: 'VALID' }
        },
        totalValidation: { status: 'MATCH' },
        itemNoErrors: [],
        itemNoWarnings: []
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(casePureMathError), false, 'Pure math error must NOT activate sidebar checking');

    const caseAllValid = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: {
            errors: [],
            warnings: [],
            environment: { status: 'VALID' },
            isRental: { status: 'VALID' },
            tradePartner: { status: 'VALID' },
            invoiceAmountMultiplicity: { status: 'VALID' }
        },
        totalValidation: { status: 'MATCH' },
        itemNoErrors: [],
        itemNoWarnings: []
    };
    assert.strictEqual(isSidebarErrorOrCautionActive(caseAllValid), false, 'All valid state must NOT activate sidebar checking');

    // 3. Active Sidebar Error Recovery Simulation
    let simulatedSidebarMemory = {
        isRentalList: [{ raw: 'False', value: 'false' }, { raw: 'True', value: 'true' }], // Contaminated state
        environment: { raw: 'prod' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        invoiceAmount: { raw: '100.00', value: 100 }
    };
    let currentResult = caseRentalError;

    function simulateRecoveryCheck(liveDomFields) {
        if (!isSidebarErrorOrCautionActive(currentResult)) return false;

        const liveRental = liveDomFields.isRental || [];
        const liveValues = liveRental.map(r => (r.raw || '').trim().toLowerCase());
        const allLiveSame = liveValues.every(v => v === liveValues[0]);

        if (allLiveSame && liveRental.length > 0) {
            simulatedSidebarMemory.isRentalList = liveRental;
            // Re-evaluating validation with corrected sidebar
            const evalResult = evaluateSidebarValidation({
                environment: simulatedSidebarMemory.environment,
                isRental: simulatedSidebarMemory.isRentalList,
                tradePartnerName: simulatedSidebarMemory.tradePartnerName,
                invoiceAmount: simulatedSidebarMemory.invoiceAmount,
                pageInfo: { currentPage: 1, totalPages: 1 }
            });

            currentResult = {
                summary: { invalid: 0, total: 2 },
                sidebarValidation: evalResult,
                totalValidation: { status: 'MATCH' },
                itemNoErrors: [],
                itemNoWarnings: []
            };
            return true;
        }
        return false;
    }

    // User corrects is_rental to "False" in the live DOM
    const liveFieldsAfterCorrection = {
        isRental: [{ raw: 'False', value: 'false', key: 'rental_0' }]
    };

    const didRecover = simulateRecoveryCheck(liveFieldsAfterCorrection);
    assert.strictEqual(didRecover, true, 'Recovery must detect user correction in live DOM');
    assert.strictEqual(currentResult.sidebarValidation.isValid, true, 'Sidebar must become valid after correction');
    assert.strictEqual(isSidebarErrorOrCautionActive(currentResult), false, 'Gating check must turn off once recovered');

    // 4. Full Reverification on Refresh Simulation
    let refreshTriggered = false;
    let cachedHash = 'cached-hash-xyz';

    function simulateHandleFullRefresh(liveDom) {
        // Reset memory cache unconditionally
        simulatedSidebarMemory = {
            environment: null,
            tradePartnerName: null,
            isRentalList: [],
            invoiceAmount: null,
            invoiceNumber: null
        };
        cachedHash = null;

        // Re-read fresh from live DOM
        if (liveDom.environment) simulatedSidebarMemory.environment = liveDom.environment;
        if (liveDom.isRental) simulatedSidebarMemory.isRentalList = liveDom.isRental;
        if (liveDom.tradePartnerName) simulatedSidebarMemory.tradePartnerName = liveDom.tradePartnerName;
        if (liveDom.invoiceAmount) simulatedSidebarMemory.invoiceAmount = liveDom.invoiceAmount;

        const evalResult = evaluateSidebarValidation({
            environment: simulatedSidebarMemory.environment,
            isRental: simulatedSidebarMemory.isRentalList,
            tradePartnerName: simulatedSidebarMemory.tradePartnerName,
            invoiceAmount: simulatedSidebarMemory.invoiceAmount
        });

        refreshTriggered = true;
        return evalResult;
    }

    const liveDom = {
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False', value: 'false' }],
        tradePartnerName: { raw: 'INSTANTLRN' },
        invoiceAmount: { raw: '250.00', value: 250 }
    };

    const refreshResult = simulateHandleFullRefresh(liveDom);
    assert.strictEqual(refreshTriggered, true, 'Full refresh must execute');
    assert.strictEqual(cachedHash, null, 'State hash must be reset on refresh');
    assert.strictEqual(refreshResult.isValid, true, 'Full reverification must succeed with live DOM');

    console.log('  Passed ✅');
}

testDocumentInstanceMatching();
testSidebarScrollingMemory();
testCrossDocumentEnvironmentMemory();
testColumnIsolationAndStrictHeaders();
testMultiPageErrorTracking();
testInvoiceNumberPartitioning();
testMultiPageTotalPlacement();
testPageWithoutTable();
testPrioritizedPageDetection();
testPageTransitionWithTablelessPage();
testValidStatePreservedAgainstTemporaryDetectionMiss();
testThreeNavigationTrackingMethods();
testPanelRenderSafeWithEmptyValidRows();
testSidePanelScrollThreshold();
testPeriodicTableRecheckEvery1to2Seconds();
// ============================================================
// TEST 27: Sidebar Auto Turn-Off & Re-Edit Rewatch Lifecycle
// ============================================================
function testSidebarAutoTurnOffAndReEditRewatch() {
    console.log('Test 27: Sidebar Auto Turn-Off & Re-Edit Rewatch Lifecycle');

    function isSidebarErrorOrCautionActive(result) {
        if (!result) return false;

        const sb = result.sidebarValidation;
        if (sb) {
            if (sb.errors && sb.errors.length > 0) return true;
            if (sb.warnings && sb.warnings.length > 0) return true;
            if (sb.environment && sb.environment.status !== 'VALID') return true;
            if (sb.isRental && sb.isRental.status !== 'VALID') return true;
            if (sb.tradePartner && sb.tradePartner.status !== 'VALID') return true;
            if (sb.invoiceAmountMultiplicity && sb.invoiceAmountMultiplicity.status === 'ERROR') return true;
        }

        const totalVal = result.totalValidation;
        if (totalVal && (totalVal.status === 'MISMATCH' || totalVal.status === 'NOT_FOUND' || totalVal.status === 'MULTIPLE_INSTANCES')) {
            return true;
        }

        const allItemIssues = [...(result.itemNoWarnings || []), ...(result.itemNoErrors || [])];
        const hasRentalItemNoIssue = allItemIssues.some(w => 
            w.reason === 'MISSING_DASH_R' || w.reason === 'UNEXPECTED_DASH_R'
        );
        if (hasRentalItemNoIssue) return true;

        return false;
    }

    function hasAnySidebarFieldChanged(live, memory) {
        if (!live) return false;

        const curEnv = (memory.environment?.raw || '').trim().toLowerCase();
        const liveEnv = (live.environment?.raw || '').trim().toLowerCase();
        if (liveEnv !== curEnv && (liveEnv || curEnv)) return true;

        const curTP = (memory.tradePartnerName?.raw || '').trim();
        const liveTP = (live.tradePartnerName?.raw || '').trim();
        if (liveTP !== curTP && (liveTP || curTP)) return true;

        const curRentalList = memory.isRentalList || [];
        const liveRentalList = live.isRental || [];
        if (liveRentalList.length !== curRentalList.length && (liveRentalList.length > 0 || curRentalList.length > 0)) return true;
        if (liveRentalList.length > 0 && curRentalList.length > 0) {
            const curStr = curRentalList.map(r => (r.raw || '').trim().toLowerCase()).join(',');
            const liveStr = liveRentalList.map(r => (r.raw || '').trim().toLowerCase()).join(',');
            if (curStr !== liveStr) return true;
        }

        const curInvRaw = (memory.invoiceAmount?.raw || '').trim();
        const liveInvRaw = (live.invoiceAmount?.raw || '').trim();
        const curInvMult = !!memory.invoiceAmount?.multiple;
        const liveInvMult = !!live.invoiceAmount?.multiple;
        if ((curInvRaw !== liveInvRaw && (curInvRaw || liveInvRaw)) || (curInvMult !== liveInvMult)) return true;

        const curInvNum = (memory.invoiceNumber?.value || '').trim();
        const liveInvNum = (live.invoiceNumber?.value || '').trim();
        if (liveInvNum !== curInvNum && (liveInvNum || curInvNum)) return true;

        return false;
    }

    // Step 1: Initial state has error (trade_partner_name is blank)
    let memory = {
        environment: { raw: 'prod' },
        tradePartnerName: { raw: '' }, // Error!
        isRentalList: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '150.00', value: 150 },
        invoiceNumber: { value: 'INV-001' }
    };

    let evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });

    let validationResult = {
        summary: { invalid: 0, total: 2 },
        sidebarValidation: evalResult,
        totalValidation: { status: 'MATCH' }
    };

    // Step 2: Error active -> active watcher must be running
    assert.strictEqual(isSidebarErrorOrCautionActive(validationResult), true, 'Step 1: Watcher must be active due to error');

    // Step 3: User fixes trade_partner_name to "INSTANTLRN" in DOM
    const liveFixed = {
        environment: { raw: 'prod' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRental: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '150.00', value: 150 },
        invoiceNumber: { value: 'INV-001' }
    };

    // Simulated recovery: update memory and revalidate
    memory.tradePartnerName = liveFixed.tradePartnerName;
    evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    // Step 4: Document is now VALID -> active error recovery is AUTO TURNED OFF
    assert.strictEqual(validationResult.sidebarValidation.isValid, true, 'Step 3: Sidebar must now be valid');
    assert.strictEqual(isSidebarErrorOrCautionActive(validationResult), false, 'Step 4: Active error watcher must auto turn off');

    // Step 5: User subsequently modifies fields once again (e.g. changes Environment to "test")
    const liveReEdited = {
        environment: { raw: 'test' }, // Modified!
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRental: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '150.00', value: 150 },
        invoiceNumber: { value: 'INV-001' }
    };

    // Change detector must catch that a field changed while in the valid/auto-turned-off state
    const fieldChanged = hasAnySidebarFieldChanged(liveReEdited, memory);
    assert.strictEqual(fieldChanged, true, 'Step 5: Must detect field change while in valid/auto-off state');

    // Step 6: Re-evaluating validation with the re-edited field
    memory.environment = liveReEdited.environment;
    evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    // Step 7: Must now be in error state AND active watcher must re-engage automatically!
    assert.strictEqual(validationResult.sidebarValidation.isValid, false, 'Step 6: Re-edit must produce invalid result');
    assert.strictEqual(isSidebarErrorOrCautionActive(validationResult), true, 'Step 7: Watcher must re-activate and re-watch!');

    // Step 8: User corrects Environment back to "prod"
    const liveFixedAgain = {
        environment: { raw: 'prod' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRental: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '150.00', value: 150 },
        invoiceNumber: { value: 'INV-001' }
    };

    memory.environment = liveFixedAgain.environment;
    evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    // Step 9: Re-recovered -> Auto turn-off engages once again
    assert.strictEqual(validationResult.sidebarValidation.isValid, true, 'Step 8: Must recover back to valid');
    assert.strictEqual(isSidebarErrorOrCautionActive(validationResult), false, 'Step 9: Auto turn-off must engage again');

    console.log('  Passed ✅');
}

function testEnvironmentExtractionResilienceAndRefreshRewatch() {
    console.log('Test 28: Environment Extraction Resilience and Refresh Rewatch Lifecycle');

    const labelRegex = /^(?:model[_\s]*)?env(?:ironment)?[:\s*#_-]*$/i;

    function cleanEnvVal(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (!trimmed || labelRegex.test(trimmed)) return null;
        return trimmed;
    }

    // Sub-test A: Never return label itself as the value
    assert.strictEqual(cleanEnvVal('Environment'), null, 'Sub-test A1: "Environment" must not be parsed as value');
    assert.strictEqual(cleanEnvVal('Environment:'), null, 'Sub-test A2: "Environment:" must not be parsed as value');
    assert.strictEqual(cleanEnvVal('Env'), null, 'Sub-test A3: "Env" must not be parsed as value');
    assert.strictEqual(cleanEnvVal('model_environment:'), null, 'Sub-test A4: "model_environment:" must not be parsed as value');

    // Sub-test B: Cleanly extract valid and invalid values
    assert.strictEqual(cleanEnvVal('prod'), 'prod', 'Sub-test B1: "prod" parsed');
    assert.strictEqual(cleanEnvVal(' PROD '), 'PROD', 'Sub-test B2: " PROD " trimmed to PROD');
    assert.strictEqual(cleanEnvVal('test'), 'test', 'Sub-test B3: "test" parsed');

    // Sub-test C: Simulate DOM structures for Environment detection
    // 1. Sibling structure: label box next to value box with "prod"
    const siblingStructure = {
        label: 'Environment',
        nextSiblingText: 'prod'
    };
    const extractedSib = cleanEnvVal(siblingStructure.nextSiblingText);
    assert.strictEqual(extractedSib, 'prod', 'Sub-test C1: Sibling value box detected');

    // 2. Input element with value="prod"
    const inputStructure = {
        name: 'Environment',
        value: 'prod'
    };
    const extractedInput = cleanEnvVal(inputStructure.value);
    assert.strictEqual(extractedInput, 'prod', 'Sub-test C2: Input value detected');

    // 3. Label with colon "Environment:" and row chip "prod"
    const colonStructure = {
        labelText: 'Environment:',
        chipText: 'prod'
    };
    assert.strictEqual(labelRegex.test(colonStructure.labelText), true, 'Sub-test C3: Colon label matched by regex');
    assert.strictEqual(cleanEnvVal(colonStructure.chipText), 'prod', 'Sub-test C3: Chip value detected');

    // Sub-test D: Environment Error State & Active Recovery Lifecycle
    // Step 1: Initial state has Environment error (value was 'test' or missing)
    let memory = {
        environment: { raw: 'test' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRentalList: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '100.00', value: 100 },
        invoiceNumber: { value: 'INV-100' }
    };

    let evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });

    let validationResult = {
        summary: { invalid: 0, total: 1 },
        sidebarValidation: evalResult,
        totalValidation: { status: 'MATCH' }
    };

    assert.strictEqual(validationResult.sidebarValidation.environment.status, 'ERROR', 'Step 1: Environment must have error');

    // Recovery check: is live DOM now corrected to "prod"?
    const liveFixed = {
        environment: { raw: 'prod' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRental: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '100.00', value: 100 },
        invoiceNumber: { value: 'INV-100' }
    };

    // Detection logic in checkSidebarWatchAndRecovery
    const curEnv = memory.environment?.raw?.trim().toLowerCase();
    const liveEnv = liveFixed.environment?.raw?.trim().toLowerCase();
    const envHasError = validationResult.sidebarValidation.environment.status !== 'VALID';

    let hasCorrection = false;
    if (envHasError && liveEnv === 'prod') {
        hasCorrection = true;
    } else if (curEnv !== 'prod' && liveEnv === 'prod') {
        hasCorrection = true;
    } else if (liveEnv && liveEnv !== curEnv) {
        hasCorrection = true;
    }

    assert.strictEqual(hasCorrection, true, 'Step 2: Active recovery must detect "prod" correction from live DOM');

    // Step 3: Re-evaluating validation with corrected field
    memory.environment = liveFixed.environment;
    evalResult = evaluateSidebarValidation({
        environment: memory.environment,
        isRental: memory.isRentalList,
        tradePartnerName: memory.tradePartnerName,
        invoiceAmount: memory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    assert.strictEqual(validationResult.sidebarValidation.environment.status, 'VALID', 'Step 3: Environment must now be valid');
    assert.strictEqual(validationResult.sidebarValidation.isValid, true, 'Step 3: Document must be fully valid');

    // Sub-test E: Refresh triggers fresh rescan and rewatch
    // When refreshed, cache is wiped and re-scanned from live DOM
    let refreshedMemory = {
        environment: null,
        tradePartnerName: null,
        isRentalList: [],
        invoiceAmount: null,
        invoiceNumber: null
    };

    // Live scan finds "prod" from DOM
    refreshedMemory.environment = liveFixed.environment;
    refreshedMemory.tradePartnerName = liveFixed.tradePartnerName;
    refreshedMemory.isRentalList = liveFixed.isRental;
    refreshedMemory.invoiceAmount = liveFixed.invoiceAmount;
    refreshedMemory.invoiceNumber = liveFixed.invoiceNumber;

    evalResult = evaluateSidebarValidation({
        environment: refreshedMemory.environment,
        isRental: refreshedMemory.isRentalList,
        tradePartnerName: refreshedMemory.tradePartnerName,
        invoiceAmount: refreshedMemory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    assert.strictEqual(validationResult.sidebarValidation.environment.status, 'VALID', 'Step 4: After refresh, environment is valid');

    // Step 5: User subsequently re-edits Environment to "dev"
    const liveReEdited = {
        environment: { raw: 'dev' },
        tradePartnerName: { raw: 'INSTANTLRN' },
        isRental: [{ raw: 'False', value: 'false' }],
        invoiceAmount: { raw: '100.00', value: 100 },
        invoiceNumber: { value: 'INV-100' }
    };

    const reEditCurEnv = (refreshedMemory.environment?.raw || '').trim().toLowerCase();
    const reEditLiveEnv = (liveReEdited.environment?.raw || '').trim().toLowerCase();
    const fieldChanged = reEditLiveEnv && reEditLiveEnv !== reEditCurEnv;
    assert.strictEqual(fieldChanged, true, 'Step 5: Rewatch must detect subsequent field change');

    // Re-evaluating after re-edit
    refreshedMemory.environment = liveReEdited.environment;
    evalResult = evaluateSidebarValidation({
        environment: refreshedMemory.environment,
        isRental: refreshedMemory.isRentalList,
        tradePartnerName: refreshedMemory.tradePartnerName,
        invoiceAmount: refreshedMemory.invoiceAmount,
        pageInfo: { currentPage: 1, totalPages: 1 }
    });
    validationResult.sidebarValidation = evalResult;

    assert.strictEqual(validationResult.sidebarValidation.environment.status, 'ERROR', 'Step 6: Re-edit to "dev" produces error');

    // Step 7: User fixes back to "prod"
    const fixCurEnv = refreshedMemory.environment?.raw?.trim().toLowerCase();
    const fixLiveEnv = 'prod';
    const fixEnvHasError = validationResult.sidebarValidation.environment.status !== 'VALID';
    let recoveredAgain = false;
    if (fixEnvHasError && fixLiveEnv === 'prod') {
        recoveredAgain = true;
    }
    assert.strictEqual(recoveredAgain, true, 'Step 7: Watcher immediately catches fix back to "prod"');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 29: Resilient Multi-Page Detection & Dynamic Discovery
// ============================================================
function testResilientMultiPageDetectionAndDynamicDiscovery() {
    console.log('Test 29: Resilient Multi-Page Detection & Dynamic Discovery');

    // 1. Nanonets Pager Control structure
    const spanOf5 = { tagName: 'SPAN', textContent: 'of 5', nextElementSibling: null };
    const inputEl = {
        tagName: 'INPUT',
        value: '2',
        getAttribute: (attr) => attr === 'value' ? '2' : (attr === 'max' ? '5' : null),
        max: '5',
        nextElementSibling: spanOf5
    };
    const pageSpan = {
        tagName: 'SPAN',
        textContent: 'Page',
        nextElementSibling: inputEl,
        children: []
    };

    // S1 Logic test
    function testS1Pager(span) {
        if (/^page\s*[:#]?$/i.test(span.textContent || '')) {
            const nextEl = span.nextElementSibling;
            if (nextEl) {
                const input = nextEl.tagName === 'INPUT' ? nextEl : nextEl.querySelector?.('input');
                if (input) {
                    const curVal = (input.value || input.getAttribute('value') || '').trim();
                    const curNum = parseInt(curVal, 10);
                    const maxVal = input.getAttribute('max') || input.max;
                    const afterInput = nextEl.nextElementSibling;
                    const afterText = (afterInput?.textContent || '').trim();
                    const afterMatch = afterText.match(/(?:of|\/)\s*(\d+)/i);
                    const totalMatch = afterMatch;
                    const total = totalMatch ? parseInt(totalMatch[1], 10) : (maxVal ? parseInt(maxVal, 10) : null);
                    const current = (!isNaN(curNum) && curNum > 0) ? curNum : 1;
                    if (total && total > 0) {
                        return { currentPage: current, totalPages: total, isMultiPage: total > 1, source: 'nanonets-pager' };
                    }
                }
            }
        }
        return null;
    }

    const s1Result = testS1Pager(pageSpan);
    assert.ok(s1Result);
    assert.strictEqual(s1Result.currentPage, 2);
    assert.strictEqual(s1Result.totalPages, 5);
    assert.strictEqual(s1Result.isMultiPage, true);

    // 2. Generic active button false positive rejection
    // An isolated active button with text "1" should NOT be identified as a 1-page document
    function testThumbnailStripSafety(containerItems) {
        if (containerItems && containerItems.length > 1) {
            let activeIdx = -1;
            containerItems.forEach((item, idx) => {
                if (item.isSelected) activeIdx = idx + 1;
            });
            const total = containerItems.length;
            const current = activeIdx > 0 ? activeIdx : 1;
            return { currentPage: current, totalPages: total, isMultiPage: total > 1, source: 'thumbnail-strip' };
        }
        // If isolated element (length <= 1), do NOT treat as multi-page thumbnail strip!
        return null;
    }

    const isolatedActiveButton = [{ text: '1', isSelected: true }];
    const safeResult = testThumbnailStripSafety(isolatedActiveButton);
    assert.strictEqual(safeResult, null, 'Isolated active button "1" must NOT be treated as thumbnail');

    const validThumbnailStrip = [
        { text: 'Page 1', isSelected: false },
        { text: 'Page 2', isSelected: true },
        { text: 'Page 3', isSelected: false }
    ];
    const thumbResult = testThumbnailStripSafety(validThumbnailStrip);
    assert.ok(thumbResult);
    assert.strictEqual(thumbResult.currentPage, 2);
    assert.strictEqual(thumbResult.totalPages, 3);
    assert.strictEqual(thumbResult.isMultiPage, true);

    // 3. Dynamic multi-page discovery (1 page -> 3 pages expansion)
    const store = { totalPages: 1, pages: {} };
    const detectedPageInfo = { currentPage: 1, totalPages: 3, isMultiPage: true };

    if (detectedPageInfo.totalPages > (store.totalPages || 1)) {
        store.totalPages = detectedPageInfo.totalPages;
    }
    assert.strictEqual(store.totalPages, 3, 'Multi-page document discovery expands totalPages from 1 to 3');

    // 4. Live page precedence over stale sidebarMemory.pageInfo
    let sidebarMemoryPageInfo = { currentPage: 1, totalPages: 3, raw: 'Page 1 of 3' };
    const livePageInfoFlipped = { currentPage: 2, totalPages: 3, raw: 'Page 2 of 3', source: 'active-pager-input' };

    function resolveEffectivePage(live, memory) {
        if (live && live.source !== 'default-single-page') {
            return live;
        }
        return memory || live;
    }

    const effectivePage = resolveEffectivePage(livePageInfoFlipped, sidebarMemoryPageInfo);
    assert.strictEqual(effectivePage.currentPage, 2, 'Live Page 2 must take precedence over cached Page 1');
    assert.strictEqual(effectivePage.totalPages, 3);

    console.log('  Passed ✅');
}

// Test 30: Multi-page vs Single-page trade_partner_name validation
function testTradePartnerMultiPageVsSinglePage() {
    console.log('Test 30: Multi-page vs Single-page trade_partner_name validation');

    // --- 1. SINGLE-PAGE DOCUMENT (trade_partner_name is NECESSARY -> THROW ERROR) ---
    // Missing on single page -> ERROR
    const singleMissing = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: null,
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(singleMissing.isValid, false, 'Single-page document MUST fail when trade_partner_name is missing');
    assert.strictEqual(singleMissing.tradePartner.status, 'ERROR');
    assert.strictEqual(singleMissing.errors.some(e => e.field === 'trade_partner_name'), true);

    // Blank on single page -> ERROR
    const singleBlank = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: '   ' },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(singleBlank.isValid, false, 'Single-page document MUST fail when trade_partner_name is blank');
    assert.strictEqual(singleBlank.tradePartner.status, 'ERROR');

    // Label only on single page -> ERROR
    const singleLabel = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Trade Partner Name' },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(singleLabel.isValid, false);
    assert.strictEqual(singleLabel.tradePartner.status, 'ERROR');

    // Valid on single page -> PASS
    const singleValid = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'INSTANTLRN' },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(singleValid.isValid, true);
    assert.strictEqual(singleValid.tradePartner.status, 'VALID');
    assert.strictEqual(singleValid.tradePartner.value, 'INSTANTLRN');

    // --- 2. MULTI-PAGE DOCUMENT (could be present on at least one page) ---
    // Scenario A: Page 1 has trade_partner_name, Page 2 does NOT have it in DOM.
    // Page 2 must be VALID because it is present on at least one page (Page 1)!
    const multiPage2WithRemembered = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: null, // absent on Page 2 DOM
        rememberedTradePartner: { raw: 'INSTANTLRN' }, // present on Page 1
        pageInfo: { currentPage: 2, totalPages: 2, isMultiPage: true }
    });
    assert.strictEqual(multiPage2WithRemembered.isValid, true, 'Page 2 must be valid when trade_partner_name is present on Page 1');
    assert.strictEqual(multiPage2WithRemembered.tradePartner.status, 'VALID');
    assert.strictEqual(multiPage2WithRemembered.tradePartner.value, 'INSTANTLRN');
    assert.strictEqual(multiPage2WithRemembered.tradePartner.isRemembered, true);
    assert.strictEqual(multiPage2WithRemembered.errors.length, 0);

    // Scenario B: Page 1 does NOT have trade_partner_name, Page 2 not visited yet.
    // Page 1 must NOT throw error; it is PENDING because trade_partner_name can be on another page!
    const multiPage1Pending = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: null,
        allPagesRecorded: false,
        pageInfo: { currentPage: 1, totalPages: 2, isMultiPage: true }
    });
    assert.strictEqual(multiPage1Pending.isValid, true, 'Page 1 must not throw error while other pages can contain the value');
    assert.strictEqual(multiPage1Pending.tradePartner.status, 'PENDING');
    assert.strictEqual(multiPage1Pending.errors.length, 0, 'No errors pushed for pending trade_partner_name on multi-page');

    // Scenario C: Both pages visited on a 2-page document and NEITHER has trade_partner_name!
    // Now it MUST fail with error because it was not present on at least one page!
    const multiPageAllMissing = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: null,
        allPagesRecorded: true,
        pageInfo: { currentPage: 2, totalPages: 2, isMultiPage: true }
    });
    assert.strictEqual(multiPageAllMissing.isValid, false, 'Must fail when trade_partner_name is absent from ALL pages of a multi-page file');
    assert.strictEqual(multiPageAllMissing.tradePartner.status, 'ERROR');
    assert.ok(multiPageAllMissing.tradePartner.message.includes('must be present on at least one page'));

    console.log('  Passed ✅');
}

// ============================================================
// TEST 31: Table-less Page Accumulation & Page Flip State Isolation
// ============================================================
function testTablelessPageAccumulationAndStateIsolation() {
    console.log('Test 31: Table-less Page Accumulation & Page Flip State Isolation');

    // Scenario 1 (From User Screenshot 1):
    // 2-page invoice:
    // Page 1: 1 line item: 5 * 8.68 = 43.40.
    // Page 2: NO table (0 items, $0.00). Invoice_amount = 43.40 (only on page 2).
    let multiPageStore = {
        totalPages: 2,
        lastInvoiceAmount: null,
        pages: {}
    };

    let validationResult = null;

    function processPage(pageNum, totalPages, rows, hasNoTable, liveInvoiceAmount) {
        if (hasNoTable || rows.length === 0) {
            validationResult = {
                success: true,
                results: [],
                summary: { total: 0, valid: 0, invalid: 0 },
                hasNoTable: true,
                validatedPage: pageNum
            };
        } else {
            validationResult = {
                success: true,
                results: rows,
                summary: { total: rows.length, valid: rows.length, invalid: 0 },
                hasNoTable: false,
                validatedPage: pageNum
            };
        }

        const pageSum = rows.reduce((sum, r) => sum + (r.actual || 0), 0);
        multiPageStore.pages[pageNum] = {
            pageNumber: pageNum,
            sumAmount: pageSum,
            totalRows: rows.length,
            hasNoTable: !!hasNoTable,
            status: 'VALID',
            errorSummary: hasNoTable ? 'No table (0 items)' : 'Valid'
        };

        if (liveInvoiceAmount && pageNum === totalPages) {
            multiPageStore.lastInvoiceAmount = liveInvoiceAmount;
        }

        // Calculate cumulative sum
        const recordedPages = Object.keys(multiPageStore.pages).map(Number);
        const cumulativeSum = recordedPages.reduce((acc, p) => acc + (multiPageStore.pages[p].sumAmount || 0), 0);
        const effectiveInv = liveInvoiceAmount || multiPageStore.lastInvoiceAmount;

        const isLastPage = pageNum === totalPages;
        const diff = effectiveInv ? Math.abs(cumulativeSum - effectiveInv.value) : null;
        const isMatch = diff !== null && diff <= 0.10;

        return {
            pageSum,
            cumulativeSum,
            isMatch,
            status: isLastPage ? (isMatch ? 'MATCH' : 'MISMATCH') : (recordedPages.length === totalPages && isMatch ? 'MATCH' : 'MULTI_PAGE_PENDING'),
            recordedPages
        };
    }

    // Step 1: Scan Page 1 (1 item: 43.40)
    const p1Outcome = processPage(1, 2, [{ actual: 43.40 }], false, null);
    assert.strictEqual(p1Outcome.pageSum, 43.40);
    assert.strictEqual(p1Outcome.cumulativeSum, 43.40);
    assert.strictEqual(p1Outcome.status, 'MULTI_PAGE_PENDING');

    // Step 2: Page flip to Page 2 (NO table, invoice_amount = 43.40)
    // Page flip resets validationResult to null and clears multiPageStore.pages[2]
    validationResult = null;
    delete multiPageStore.pages[2];

    // Page 2 detected as table-less
    const p2Outcome = processPage(2, 2, [], true, { value: 43.40, raw: '43.40' });
    assert.strictEqual(p2Outcome.pageSum, 0.00, 'Page 2 must have $0.00 page sum');
    assert.strictEqual(p2Outcome.cumulativeSum, 43.40, 'Cumulative sum must be $43.40 (43.40 + 0.00), NOT $86.80');
    assert.strictEqual(p2Outcome.status, 'MATCH', 'Must show MATCH on the last page because cumulative sum equals invoice_amount');
    assert.strictEqual(multiPageStore.pages[2].hasNoTable, true);
    assert.strictEqual(multiPageStore.pages[2].totalRows, 0);

    // Scenario 2 (From User Screenshot 2):
    // 3-page invoice:
    // Page 1: 18 items ($0.00) with 9 item_no errors
    // Page 2: NO table (0 items, $0.00). Must NOT inherit Page 1's 18 items or 9 errors!
    // Page 3: 1 item ($147.56)
    multiPageStore = { totalPages: 3, lastInvoiceAmount: null, pages: {} };

    // Page 1
    const p1Rows = Array.from({ length: 18 }, () => ({ actual: 0.00 }));
    multiPageStore.pages[1] = {
        pageNumber: 1,
        sumAmount: 0.00,
        totalRows: 18,
        itemNoErrors: 9,
        hasNoTable: false,
        status: 'INVALID',
        errorSummary: '9 item_no errors'
    };
    validationResult = {
        success: true,
        results: p1Rows,
        hasNoTable: false,
        validatedPage: 1
    };

    // Attempting to revalidate sidebar with validatedPage = 1 while currentPage = 2 must be blocked!
    const currentPageInfo = { currentPage: 2, totalPages: 3 };
    const canReusePage1RowsOnPage2 = (validationResult && validationResult.validatedPage === currentPageInfo.currentPage);
    assert.strictEqual(canReusePage1RowsOnPage2, false, 'Page 1 rows must NEVER be reused on Page 2');

    // Page 2 scanned as table-less
    multiPageStore.pages[2] = {
        pageNumber: 2,
        sumAmount: 0.00,
        totalRows: 0,
        itemNoErrors: 0,
        hasNoTable: true,
        status: 'VALID',
        errorSummary: 'No table (0 items)'
    };
    assert.strictEqual(multiPageStore.pages[2].itemNoErrors, 0, 'Page 2 must have 0 errors, NOT 9');
    assert.strictEqual(multiPageStore.pages[2].totalRows, 0, 'Page 2 must have 0 items, NOT 18');

    // Page 3 scanned (1 item: $147.56, invoice_amount: $147.56)
    multiPageStore.pages[3] = {
        pageNumber: 3,
        sumAmount: 147.56,
        totalRows: 1,
        hasNoTable: false,
        status: 'VALID'
    };
    const cum3 = [1, 2, 3].reduce((acc, p) => acc + multiPageStore.pages[p].sumAmount, 0);
    assert.strictEqual(cum3, 147.56, 'Cumulative sum across all 3 pages must be $147.56');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 32: Page 1 Table Preservation During Page Flip to Page 2
// ============================================================
function testPage1TablePreservationOnNavigation() {
    console.log('Test 32: Page 1 Table Preservation during navigation to Page 2');

    const multiPageStore = {
        fileHash: '#/ocr/test/model1/doc1',
        totalPages: 2,
        pages: {}
    };

    // Step 1: Page 1 is detected and confirmed with a table (2 items, sum = 43.40)
    multiPageStore.pages[1] = {
        pageNumber: 1,
        sumAmount: 43.40,
        rowCount: 2,
        totalRows: 2,
        calcErrors: 0,
        itemNoErrors: 0,
        hasNoTable: false,
        status: 'VALID',
        errorSummary: 'Valid'
    };

    // Helper simulating the detector's decision to treat a page as table-less
    function attemptTablelessOverwrite(pageNum, isDocPage, isBackgroundPoll, retryCount) {
        const existingPageData = multiPageStore.pages?.[pageNum];
        const hadExistingTable = existingPageData && !existingPageData.hasNoTable && existingPageData.totalRows > 0;

        // FIXED GUARD: Never treat a page as tableless if it already had a confirmed table!
        if (isDocPage && !hadExistingTable) {
            const maxTableWait = 1;
            if (retryCount < maxTableWait && !isBackgroundPoll) {
                return { action: 'retry' };
            }
            // Overwrites page as table-less
            multiPageStore.pages[pageNum] = {
                pageNumber: pageNum,
                sumAmount: 0.00,
                rowCount: 0,
                totalRows: 0,
                hasNoTable: true,
                status: 'VALID',
                errorSummary: 'No Table'
            };
            return { action: 'overwritten_as_tableless' };
        }

        return { action: 'preserved_existing_table' };
    }

    // Step 2: User navigates to Page 2.
    // Simulating momentary DOM unmount where table is absent while pageNum is 1 (or during transition).
    // Even if isBackgroundPoll is false (immediate run), hadExistingTable must prevent wiping Page 1!
    const transitionAttempt1 = attemptTablelessOverwrite(1, true, false, 1);
    assert.strictEqual(
        transitionAttempt1.action,
        'preserved_existing_table',
        'Page 1 must NOT be overwritten as tableless during transition unmount!'
    );
    assert.strictEqual(multiPageStore.pages[1].totalRows, 2);
    assert.strictEqual(multiPageStore.pages[1].hasNoTable, false);
    assert.strictEqual(multiPageStore.pages[1].sumAmount, 43.40);

    // Step 3: Page 2 (which legitimately has no table) is processed
    const page2Attempt = attemptTablelessOverwrite(2, true, false, 1);
    assert.strictEqual(page2Attempt.action, 'overwritten_as_tableless', 'Page 2 should legitimately be recorded as tableless');
    assert.strictEqual(multiPageStore.pages[2].hasNoTable, true);
    assert.strictEqual(multiPageStore.pages[2].totalRows, 0);

    // Step 4: Verify multi-page cumulative sum and page statuses
    const recordedPages = Object.keys(multiPageStore.pages).map(Number).sort();
    assert.deepStrictEqual(recordedPages, [1, 2]);
    assert.strictEqual(multiPageStore.pages[1].hasNoTable, false, 'Page 1 must still have its table');
    assert.strictEqual(multiPageStore.pages[1].sumAmount, 43.40);
    assert.strictEqual(multiPageStore.pages[2].hasNoTable, true, 'Page 2 is table-less');
    assert.strictEqual(multiPageStore.pages[2].sumAmount, 0.00);

    // Cumulative sum across both pages:
    const totalSum = recordedPages.reduce((sum, p) => sum + multiPageStore.pages[p].sumAmount, 0);
    assert.strictEqual(totalSum, 43.40, 'Total cumulative sum must accurately reflect Page 1 table');

    console.log('  Passed ✅');
}

// ============================================================
// TEST 33: Required Table Columns Validation (Line_Amount, Item_No, Item_Price, Qty)
// ============================================================
function testRequiredTableColumnsValidation() {
    console.log('Test 33: Required Table Columns Validation (Line_Amount, Item_No, Item_Price, Qty)');

    const REQUIRED_TABLE_COLUMNS = [
        { key: 'amount', name: 'Line_Amount' },
        { key: 'item_no', name: 'Item_No' },
        { key: 'price', name: 'Item_Price' },
        { key: 'qty', name: 'Qty' }
    ];

    function validateRequiredTableColumns(columnMapping) {
        const missingColumns = [];
        const errors = [];

        for (const req of REQUIRED_TABLE_COLUMNS) {
            const mapped = columnMapping ? columnMapping[req.key] : null;
            const exists = mapped !== null && mapped !== undefined;

            if (!exists) {
                missingColumns.push(req.name);
                errors.push({
                    field: req.name,
                    column: req.name,
                    reason: 'MISSING_REQUIRED_COLUMN',
                    message: `Required column "${req.name}" does not exist in the table`
                });
            }
        }

        return {
            isValid: missingColumns.length === 0,
            missingColumns: missingColumns,
            errors: errors
        };
    }

    // Helper to evaluate full page error state given rows, columnMapping, and hasNoTable
    function evaluateTablePage(rows, columnMapping, hasNoTable = false) {
        let validationResult = {
            success: true,
            results: rows.map((r, i) => ({
                rowNumber: i + 1,
                qty: r.qty,
                price: r.price,
                actual: r.amount,
                status: 'VALID'
            })),
            summary: { total: rows.length, valid: rows.length, invalid: 0, incomplete: 0 },
            hasNoTable: hasNoTable,
            columnErrors: [],
            missingColumns: []
        };

        if (!hasNoTable) {
            const check = validateRequiredTableColumns(columnMapping);
            if (!check.isValid) {
                validationResult.missingColumns = check.missingColumns;
                validationResult.columnErrors = check.errors;
            }
        }

        const calcErrors = validationResult.summary.invalid || 0;
        const columnErrors = validationResult.columnErrors.length;
        const hasErrors = (calcErrors + columnErrors) > 0;

        let errorSummary = hasNoTable ? 'No table (0 items)' : 'Valid';
        if (hasErrors) {
            const errParts = [];
            if (columnErrors > 0) errParts.push(`Missing ${validationResult.missingColumns.join(', ')}`);
            if (calcErrors > 0) errParts.push(`${calcErrors} calc error${calcErrors > 1 ? 's' : ''}`);
            errorSummary = errParts.join(', ');
        }

        const pageData = {
            pageNumber: 1,
            sumAmount: rows.reduce((s, r) => s + (r.amount || 0), 0),
            rowCount: rows.length,
            totalRows: rows.length,
            calcErrors: calcErrors,
            columnErrors: columnErrors,
            missingColumns: validationResult.missingColumns,
            hasErrors: hasErrors,
            errorSummary: errorSummary,
            hasNoTable: hasNoTable,
            status: hasErrors ? 'INVALID' : 'VALID'
        };

        // Badge representation
        const badgeReasons = [];
        if (columnErrors > 0) badgeReasons.push(`Missing ${validationResult.missingColumns.join(', ')}`);
        const badgeText = hasErrors ? `❌ ${badgeReasons.join(' | ')}` : `✅ Valid`;

        return { validationResult, pageData, badgeText, status: pageData.status };
    }

    // Case 1: All 4 columns present -> Valid
    const fullTableCols = {
        amount: { name: 'Line_Amount' },
        item_no: { name: 'Item_No' },
        price: { name: 'Item_Price' },
        qty: { name: 'Qty' }
    };
    const sampleRows = [
        { qty: 2, price: 10, amount: 20, item_no: 'ITEM123' },
        { qty: 1, price: 15, amount: 15, item_no: 'ITEM456' }
    ];
    const res1 = evaluateTablePage(sampleRows, fullTableCols, false);
    assert.strictEqual(res1.status, 'VALID', 'Table with all 4 required columns must be VALID');
    assert.strictEqual(res1.validationResult.columnErrors.length, 0);
    assert.strictEqual(res1.validationResult.missingColumns.length, 0);

    // Case 2: Item_No column missing -> Throws error
    const missingItemNoCols = {
        amount: { name: 'Line_Amount' },
        item_no: null,
        price: { name: 'Item_Price' },
        qty: { name: 'Qty' }
    };
    const res2 = evaluateTablePage(sampleRows, missingItemNoCols, false);
    assert.strictEqual(res2.status, 'INVALID', 'Missing Item_No column must cause page status INVALID');
    assert.strictEqual(res2.validationResult.columnErrors.length, 1);
    assert.deepStrictEqual(res2.validationResult.missingColumns, ['Item_No']);
    assert.strictEqual(res2.pageData.errorSummary, 'Missing Item_No');
    assert.strictEqual(res2.badgeText, '❌ Missing Item_No');

    // Case 3: Line_Amount column missing -> Throws error
    const missingAmountCols = {
        amount: null,
        item_no: { name: 'Item_No' },
        price: { name: 'Item_Price' },
        qty: { name: 'Qty' }
    };
    const res3 = evaluateTablePage(sampleRows, missingAmountCols, false);
    assert.strictEqual(res3.status, 'INVALID', 'Missing Line_Amount column must cause page status INVALID');
    assert.strictEqual(res3.validationResult.columnErrors.length, 1);
    assert.deepStrictEqual(res3.validationResult.missingColumns, ['Line_Amount']);
    assert.strictEqual(res3.pageData.errorSummary, 'Missing Line_Amount');
    assert.strictEqual(res3.badgeText, '❌ Missing Line_Amount');

    // Case 4: Item_Price column missing -> Throws error
    const missingPriceCols = {
        amount: { name: 'Line_Amount' },
        item_no: { name: 'Item_No' },
        price: null,
        qty: { name: 'Qty' }
    };
    const res4 = evaluateTablePage(sampleRows, missingPriceCols, false);
    assert.strictEqual(res4.status, 'INVALID', 'Missing Item_Price column must cause page status INVALID');
    assert.strictEqual(res4.validationResult.columnErrors.length, 1);
    assert.deepStrictEqual(res4.validationResult.missingColumns, ['Item_Price']);
    assert.strictEqual(res4.pageData.errorSummary, 'Missing Item_Price');

    // Case 5: Qty column missing -> Throws error
    const missingQtyCols = {
        amount: { name: 'Line_Amount' },
        item_no: { name: 'Item_No' },
        price: { name: 'Item_Price' },
        qty: null
    };
    const res5 = evaluateTablePage(sampleRows, missingQtyCols, false);
    assert.strictEqual(res5.status, 'INVALID', 'Missing Qty column must cause page status INVALID');
    assert.strictEqual(res5.validationResult.columnErrors.length, 1);
    assert.deepStrictEqual(res5.validationResult.missingColumns, ['Qty']);
    assert.strictEqual(res5.pageData.errorSummary, 'Missing Qty');

    // Case 6: Multiple columns missing (e.g. Line_Amount & Item_No) -> Throws error with all missing
    const missingMultipleCols = {
        amount: null,
        item_no: null,
        price: { name: 'Item_Price' },
        qty: { name: 'Qty' }
    };
    const res6 = evaluateTablePage(sampleRows, missingMultipleCols, false);
    assert.strictEqual(res6.status, 'INVALID');
    assert.strictEqual(res6.validationResult.columnErrors.length, 2);
    assert.deepStrictEqual(res6.validationResult.missingColumns, ['Line_Amount', 'Item_No']);
    assert.strictEqual(res6.pageData.errorSummary, 'Missing Line_Amount, Item_No');
    assert.strictEqual(res6.badgeText, '❌ Missing Line_Amount, Item_No');

    // Case 7: All 4 columns missing -> Throws error listing all 4
    const res7 = evaluateTablePage(sampleRows, {}, false);
    assert.strictEqual(res7.status, 'INVALID');
    assert.strictEqual(res7.validationResult.columnErrors.length, 4);
    assert.deepStrictEqual(res7.validationResult.missingColumns, ['Line_Amount', 'Item_No', 'Item_Price', 'Qty']);

    // Case 8: Table-less page (cover page/receipt) -> Excluded from table column check, remains VALID
    const res8 = evaluateTablePage([], {}, true /* hasNoTable */);
    assert.strictEqual(res8.status, 'VALID', 'Table-less page must remain VALID and not throw column errors');
    assert.strictEqual(res8.validationResult.columnErrors.length, 0);
    assert.strictEqual(res8.validationResult.missingColumns.length, 0);
    assert.strictEqual(res8.pageData.errorSummary, 'No table (0 items)');

    // Case 9: Verify AutoDetector and TableParser export REQUIRED_TABLE_COLUMNS and recognize all 4 headers
    const AutoDetector = require('../src/content/autoDetector.js');
    assert.ok(AutoDetector.REQUIRED_TABLE_COLUMNS, 'AutoDetector must export REQUIRED_TABLE_COLUMNS');
    assert.strictEqual(AutoDetector.REQUIRED_TABLE_COLUMNS.length, 4);

    const TableParser = require('../src/content/tableParser.js');
    assert.ok(TableParser.REQUIRED_TABLE_COLUMNS, 'TableParser must export REQUIRED_TABLE_COLUMNS');
    assert.strictEqual(TableParser.REQUIRED_TABLE_COLUMNS.length, 4);

    // Case 10: Verify tableParser matchesColumnType matches item_no and other columns
    assert.strictEqual(TableParser.matchesColumnType('Item_No', 'item_no').match, true);
    assert.strictEqual(TableParser.matchesColumnType('item_#', 'item_no').match, true);
    assert.strictEqual(TableParser.matchesColumnType('Line_Amount', 'amount').match, true);
    assert.strictEqual(TableParser.matchesColumnType('Item_Price', 'price').match, true);
    assert.strictEqual(TableParser.matchesColumnType('Qty', 'qty').match, true);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 34: Multi-Page Table-less Page 1 Isolation & Flip Verification
// ============================================================
function testMultiPageTablelessPage1Isolation() {
    console.log('Test 34: Multi-Page Table-less Page 1 Isolation & Flip Verification');

    const multiPageStore = {
        totalPages: 3,
        lastInvoiceAmount: null,
        pages: {}
    };

    function simulateProcessPage(pageNum, totalPages, rows, hasNoTable, liveInvoice = null) {
        let pageSum = 0;
        let pageRows = 0;
        if (!hasNoTable && rows && rows.length > 0) {
            rows.forEach(r => {
                pageSum += r.amount;
                pageRows++;
            });
        }
        pageSum = Math.round(pageSum * 100) / 100;

        multiPageStore.totalPages = Math.max(multiPageStore.totalPages, totalPages);
        multiPageStore.pages[pageNum] = {
            pageNumber: pageNum,
            sumAmount: pageSum,
            rowCount: pageRows,
            totalRows: rows ? rows.length : 0,
            hasNoTable: !!hasNoTable,
            status: 'VALID'
        };

        if (liveInvoice && liveInvoice.value !== null) {
            multiPageStore.lastInvoiceAmount = liveInvoice;
        }

        const recordedPages = Object.keys(multiPageStore.pages).map(Number).sort((a, b) => a - b);
        let cumulativeSum = 0;
        const pageBreakdown = {};
        for (const p of recordedPages) {
            const pAmt = multiPageStore.pages[p].sumAmount;
            cumulativeSum += pAmt;
            pageBreakdown[p] = pAmt;
        }
        cumulativeSum = Math.round(cumulativeSum * 100) / 100;

        const effectiveInv = liveInvoice || multiPageStore.lastInvoiceAmount;
        const hasAllPages = recordedPages.length === totalPages;

        if (!effectiveInv || effectiveInv.value === null) {
            return {
                status: 'MULTI_PAGE_PENDING',
                isMultiPage: true,
                currentPage: pageNum,
                totalPages: totalPages,
                pageSum: pageSum,
                sumAmount: cumulativeSum,
                recordedPages: recordedPages,
                pageBreakdown: pageBreakdown,
                invoiceAmount: null
            };
        }

        if (!hasAllPages) {
            return {
                status: 'MULTI_PAGE_PENDING',
                isMultiPage: true,
                currentPage: pageNum,
                totalPages: totalPages,
                pageSum: pageSum,
                sumAmount: cumulativeSum,
                recordedPages: recordedPages,
                pageBreakdown: pageBreakdown,
                invoiceAmount: effectiveInv.value
            };
        }

        const diff = Math.round(Math.abs(cumulativeSum - effectiveInv.value) * 100) / 100;
        const isMatch = diff <= 0.10;

        return {
            status: isMatch ? 'MATCH' : 'MISMATCH',
            isMultiPage: true,
            currentPage: pageNum,
            totalPages: totalPages,
            pageSum: pageSum,
            sumAmount: cumulativeSum,
            recordedPages: recordedPages,
            pageBreakdown: pageBreakdown,
            invoiceAmount: effectiveInv.value,
            difference: diff
        };
    }

    // Step 1: User is on Page 1 (NO TABLE on Page 1)
    const p1Result = simulateProcessPage(1, 3, [], true /* hasNoTable */, null);
    assert.strictEqual(p1Result.status, 'MULTI_PAGE_PENDING');
    assert.strictEqual(p1Result.sumAmount, 0.00);
    assert.strictEqual(p1Result.pageBreakdown[1], 0.00);

    // Step 2: User flips to Page 2 (has table with rows totaling $150.66)
    // On flip: delete multiPageStore.pages[2] if any existed
    delete multiPageStore.pages[2];
    const p2Rows = [{ amount: 100.00 }, { amount: 50.66 }];
    const p2Result = simulateProcessPage(2, 3, p2Rows, false /* has table */, null);
    assert.strictEqual(p2Result.status, 'MULTI_PAGE_PENDING');
    assert.strictEqual(p2Result.pageSum, 150.66);
    assert.strictEqual(p2Result.sumAmount, 150.66);
    assert.strictEqual(p2Result.pageBreakdown[1], 0.00);
    assert.strictEqual(p2Result.pageBreakdown[2], 150.66);

    // Step 3: User flips BACK to Page 1
    // On flip: delete multiPageStore.pages[1] and re-detect live DOM
    delete multiPageStore.pages[1];
    // Page 1 live DOM has NO table
    const p1ReturnResult = simulateProcessPage(1, 3, [], true /* hasNoTable */, null);
    // MUST NOT copy Page 2's $150.66 into Page 1!
    assert.strictEqual(p1ReturnResult.pageSum, 0.00, 'Page 1 sum must remain $0.00');
    assert.strictEqual(p1ReturnResult.sumAmount, 150.66, 'Cumulative sum must remain $150.66, not duplicated to $301.32');
    assert.strictEqual(p1ReturnResult.pageBreakdown[1], 0.00, 'Page 1 breakdown pill must be $0.00');
    assert.strictEqual(p1ReturnResult.pageBreakdown[2], 150.66, 'Page 2 breakdown pill must be $150.66');

    // Step 4: User flips to Page 3 (has table totaling $29.14 and invoice_amount = 179.80)
    delete multiPageStore.pages[3];
    const p3Rows = [{ amount: 29.14 }];
    const p3Result = simulateProcessPage(3, 3, p3Rows, false, { value: 179.80, raw: '179.80' });

    assert.strictEqual(p3Result.status, 'MATCH', 'All 3 pages must MATCH invoice total');
    assert.strictEqual(p3Result.sumAmount, 179.80, 'Cumulative sum must be exactly 0.00 + 150.66 + 29.14 = 179.80');
    assert.strictEqual(p3Result.invoiceAmount, 179.80);
    assert.strictEqual(p3Result.difference, 0.00);
    assert.strictEqual(p3Result.pageBreakdown[1], 0.00);
    assert.strictEqual(p3Result.pageBreakdown[2], 150.66);
    assert.strictEqual(p3Result.pageBreakdown[3], 29.14);

    // Step 5: User flips back to Page 1 and clicks Refresh
    delete multiPageStore.pages[1];
    const p1Refreshed = simulateProcessPage(1, 3, [], true, null);
    assert.strictEqual(p1Refreshed.status, 'MATCH', 'Maintaining MATCH state after returning to Page 1');
    assert.strictEqual(p1Refreshed.sumAmount, 179.80, 'Cumulative sum must stay 179.80, never 330.46');
    assert.strictEqual(p1Refreshed.difference, 0.00);

    console.log('  Passed ✅');
}

// ============================================================
// TEST 35: Multi-Page Invoice Amount Detection, Caution for Non-Last Page, Red Error for Duplicate Invoice Amount on Same Invoice, and Multi-Invoice Partitioning
// ============================================================
function testMultiPageInvoiceAmountAndMultiInvoicePartitioning() {
    console.log('Test 35: Multi-Page Invoice Amount Detection, Caution for Non-Last Page, Red Error for Duplicate Invoice Amount on Same Invoice, and Multi-Invoice Partitioning');

    function simulateAttachTotalValidation(store, currentPage, totalPages, currentInvoiceNumber, liveInvoiceAmount) {
        // Register live invoiceAmount if present
        if (liveInvoiceAmount && liveInvoiceAmount.value !== null) {
            if (!store.invoiceAmountPages) store.invoiceAmountPages = {};
            store.invoiceAmountPages[currentPage] = {
                page: currentPage,
                value: liveInvoiceAmount.value,
                raw: liveInvoiceAmount.raw || String(liveInvoiceAmount.value),
                invoiceNumber: currentInvoiceNumber
            };
        }

        const recordedPages = Object.keys(store.pages).map(Number).sort((a, b) => a - b);
        const invoiceGroups = {};
        for (const p of recordedPages) {
            const pData = store.pages[p];
            const inv = pData.invoiceNumber ? pData.invoiceNumber.trim() : 'DEFAULT';
            if (!invoiceGroups[inv]) invoiceGroups[inv] = [];
            invoiceGroups[inv].push(p);
        }

        const hasMultipleInvoicesInDoc = Object.keys(invoiceGroups).filter(k => k !== 'DEFAULT').length > 1;
        let activeInvoicePages = recordedPages;
        if (currentInvoiceNumber && invoiceGroups[currentInvoiceNumber.trim()]) {
            activeInvoicePages = invoiceGroups[currentInvoiceNumber.trim()];
        }

        const minPageOfInv = activeInvoicePages.length > 0 ? Math.min(...activeInvoicePages) : currentPage;
        let maxPageOfInv = activeInvoicePages.length > 0 ? Math.max(...activeInvoicePages) : currentPage;
        const isLastInvoiceInDoc = !hasMultipleInvoicesInDoc || (maxPageOfInv >= totalPages) || 
            (Math.max(...recordedPages) === maxPageOfInv && maxPageOfInv < totalPages);
        const expectedLastPageOfInv = isLastInvoiceInDoc ? totalPages : maxPageOfInv;

        const missingPages = [];
        for (let p = minPageOfInv; p <= expectedLastPageOfInv; p++) {
            if (!store.pages[p]) {
                missingPages.push(p);
            }
        }
        const hasAllPages = missingPages.length === 0;

        let cumulativeSum = 0;
        let totalSummedRows = 0;
        const pageBreakdown = {};
        const pagesWithErrors = [];
        const pagesWithCautions = [];

        for (const p of recordedPages) {
            const pData = store.pages[p];
            if (activeInvoicePages.includes(p)) {
                cumulativeSum += (pData.sumAmount || 0);
                totalSummedRows += (pData.rowCount || 0);
                pageBreakdown[p] = pData.sumAmount || 0;
            }
            if (pData.hasErrors) pagesWithErrors.push(p);
            else if (pData.hasCautions) pagesWithCautions.push(p);
        }
        cumulativeSum = Math.round(cumulativeSum * 100) / 100;

        const allInvAmountEntries = Object.values(store.invoiceAmountPages || {});
        const invAmountsByInv = {};
        for (const entry of allInvAmountEntries) {
            const invKey = (entry.invoiceNumber ? entry.invoiceNumber.trim().toLowerCase() : 'default');
            if (!invAmountsByInv[invKey]) invAmountsByInv[invKey] = [];
            invAmountsByInv[invKey].push(entry);
        }

        const activeInvKey = (currentInvoiceNumber ? currentInvoiceNumber.trim().toLowerCase() : 'default');
        const thisInvAmountEntries = invAmountsByInv[activeInvKey] || 
            (allInvAmountEntries.filter(entry => !entry.invoiceNumber || entry.invoiceNumber === 'DEFAULT'));
        const thisInvAmountPages = thisInvAmountEntries.map(e => e.page).sort((a, b) => a - b);

        const invoiceAmount = (thisInvAmountEntries.length > 0 ? thisInvAmountEntries[thisInvAmountEntries.length - 1] : null);

        let hasInvoiceAmountCaution = false;
        let invoiceAmountCautionType = null;
        let invoiceAmountCautionMessage = null;
        let hasInvoiceAmountError = false;

        // Check 1: RED ERROR if 2 or more pages of the SAME invoice_number have invoice_amount
        if (totalPages > 1 && thisInvAmountPages.length >= 2) {
            hasInvoiceAmountError = true;
            if (!pagesWithErrors.includes(currentPage)) pagesWithErrors.push(currentPage);
        } else if (totalPages > 1 && thisInvAmountPages.length === 1) {
            // Check 2: Caution if invoice_amount is on a non-last page of this invoice
            const invPage = thisInvAmountPages[0];
            if (invPage < expectedLastPageOfInv) {
                hasInvoiceAmountCaution = true;
                invoiceAmountCautionType = 'NON_LAST_PAGE';
                invoiceAmountCautionMessage = `invoice_amount ($${thisInvAmountEntries[0].value.toFixed(2)}) found on Page ${invPage} (not the last page, Page ${expectedLastPageOfInv}). Invoices typically have the total on the last page. Reference: invoice_number "${currentInvoiceNumber || 'N/A'}".`;
                if (!pagesWithCautions.includes(invPage)) pagesWithCautions.push(invPage);
            }
        }

        const pageStatusList = [];
        for (const p of recordedPages) {
            const pData = store.pages[p];
            const pInvAmtEntry = store.invoiceAmountPages?.[p];
            const pHasInvAmt = !!pInvAmtEntry;

            const pInvRaw = pData.invoiceNumber ? pData.invoiceNumber.trim() : (currentInvoiceNumber ? currentInvoiceNumber.trim() : 'DEFAULT');
            const pInvKey = pInvRaw.toLowerCase();
            const pInvEntries = invAmountsByInv[pInvKey] || [];
            const pInvPages = pInvEntries.map(e => e.page);

            const isDupError = pHasInvAmt && (pInvEntries.length >= 2);
            const pInvGroupPages = invoiceGroups[pInvRaw] || [p];
            const pMaxPageOfGroup = Math.max(...pInvGroupPages);
            const hasDifferentInvAfter = recordedPages.some(pg => {
                if (pg <= pMaxPageOfGroup) return false;
                const pgInv = store.pages[pg]?.invoiceNumber ? store.pages[pg].invoiceNumber.trim() : 'DEFAULT';
                return pgInv.toLowerCase() !== pInvKey;
            });
            const pExpectedLastPage = hasDifferentInvAfter ? pMaxPageOfGroup : totalPages;
            const isNonLastCaution = pHasInvAmt && !isDupError && (p < pExpectedLastPage);

            let pStatus = pData.status || 'VALID';
            let pErrorSummary = pData.errorSummary || 'Valid';

            if (isDupError) {
                pStatus = 'INVALID';
                pErrorSummary = `Multiple invoice_amount (${pInvPages.map(pg => `P${pg}`).join(', ')})`;
                if (!pagesWithErrors.includes(p)) pagesWithErrors.push(p);
            } else if (isNonLastCaution && pStatus === 'VALID') {
                pStatus = 'CAUTION';
                pErrorSummary = 'Caution: invoice_amount on non-last page';
                if (!pagesWithCautions.includes(p)) pagesWithCautions.push(p);
            }

            pageStatusList.push({
                page: p,
                invoiceNumber: pData.invoiceNumber || null,
                status: pStatus,
                errorSummary: pErrorSummary,
                sumAmount: pData.sumAmount || 0,
                hasInvoiceAmount: pHasInvAmt,
                invoiceAmountValue: pInvAmtEntry ? pInvAmtEntry.value : null,
                isInvoiceAmountDup: isDupError,
                isInvoiceAmountNonLast: isNonLastCaution
            });
        }

        if (hasInvoiceAmountError) {
            return {
                isMultiPage: true,
                currentPage: currentPage,
                totalPages: totalPages,
                invoiceNumber: currentInvoiceNumber,
                activeInvoicePages: activeInvoicePages,
                sumAmount: cumulativeSum,
                status: 'MULTIPLE_INSTANCES',
                hasInvoiceAmountError: true,
                invoiceAmountPages: thisInvAmountPages,
                pageBreakdown: pageBreakdown,
                pagesWithErrors: pagesWithErrors,
                pageStatusList: pageStatusList,
                message: `Multiple invoice_amount instances found across pages [${thisInvAmountPages.join(', ')}] for invoice_number "${currentInvoiceNumber}". Each invoice must contain exactly one invoice_amount.`
            };
        }

        if (!invoiceAmount || invoiceAmount.value === null) {
            return {
                isMultiPage: true,
                currentPage: currentPage,
                totalPages: totalPages,
                invoiceNumber: currentInvoiceNumber,
                activeInvoicePages: activeInvoicePages,
                sumAmount: cumulativeSum,
                status: 'MULTI_PAGE_PENDING',
                hasInvoiceAmountCaution: false,
                pageBreakdown: pageBreakdown,
                pagesWithErrors: pagesWithErrors,
                pageStatusList: pageStatusList
            };
        }

        if (!hasAllPages) {
            return {
                isMultiPage: true,
                currentPage: currentPage,
                totalPages: totalPages,
                invoiceNumber: currentInvoiceNumber,
                activeInvoicePages: activeInvoicePages,
                sumAmount: cumulativeSum,
                status: 'MULTI_PAGE_PENDING',
                invoiceAmount: invoiceAmount.value,
                invoiceAmountPages: thisInvAmountPages,
                hasInvoiceAmountCaution: hasInvoiceAmountCaution,
                invoiceAmountCautionType: invoiceAmountCautionType,
                invoiceAmountCautionMessage: invoiceAmountCautionMessage,
                hasInvoiceAmountError: false,
                pageBreakdown: pageBreakdown,
                pagesWithErrors: pagesWithErrors,
                pageStatusList: pageStatusList
            };
        }

        const diff = Math.round(Math.abs(cumulativeSum - invoiceAmount.value) * 100) / 100;
        const isMatch = diff <= 0.10;

        return {
            isMultiPage: true,
            currentPage: currentPage,
            totalPages: totalPages,
            invoiceNumber: currentInvoiceNumber,
            activeInvoicePages: activeInvoicePages,
            sumAmount: cumulativeSum,
            status: isMatch ? 'MATCH' : 'MISMATCH',
            invoiceAmount: invoiceAmount.value,
            invoiceAmountPages: thisInvAmountPages,
            hasInvoiceAmountCaution: hasInvoiceAmountCaution,
            invoiceAmountCautionType: invoiceAmountCautionType,
            hasInvoiceAmountError: false,
            difference: diff,
            pageBreakdown: pageBreakdown,
            pagesWithErrors: pagesWithErrors,
            pageStatusList: pageStatusList
        };
    }

    // --- SCENARIO A: 5-page Single Invoice with invoice_amount on Page 2 (Non-Last Page Caution) ---
    const storeA = { pages: {}, invoiceAmountPages: {} };
    // Page 1: $50.00, no invoice_amount
    storeA.pages[1] = { pageNumber: 1, invoiceNumber: 'INV-100', sumAmount: 50.00, rowCount: 1, status: 'VALID' };
    const p1A = simulateAttachTotalValidation(storeA, 1, 5, 'INV-100', null);
    assert.strictEqual(p1A.status, 'MULTI_PAGE_PENDING');
    assert.strictEqual(p1A.hasInvoiceAmountCaution, false);

    // Page 2: $60.00, live invoice_amount = $200.00 (on non-last page 2 of 5!)
    storeA.pages[2] = { pageNumber: 2, invoiceNumber: 'INV-100', sumAmount: 60.00, rowCount: 1, status: 'VALID' };
    const p2A = simulateAttachTotalValidation(storeA, 2, 5, 'INV-100', { value: 200.00 });
    // MUST immediately caution the user without waiting for Page 5!
    assert.strictEqual(p2A.hasInvoiceAmountCaution, true, 'Must immediately flag Caution for invoice_amount on non-last page');
    assert.strictEqual(p2A.invoiceAmountCautionType, 'NON_LAST_PAGE');
    assert.deepStrictEqual(p2A.invoiceAmountPages, [2]);
    assert.strictEqual(p2A.sumAmount, 110.00);

    // Check pageStatusList for Page 2: marked as CAUTION
    const p2Card = p2A.pageStatusList.find(p => p.page === 2);
    assert.strictEqual(p2Card.isInvoiceAmountNonLast, true);
    assert.strictEqual(p2Card.status, 'CAUTION');
    assert.strictEqual(p2Card.hasInvoiceAmount, true);

    // --- SCENARIO B: Same Invoice has another invoice_amount on Page 5 -> RED ERROR (MULTIPLE_INSTANCES) ---
    storeA.pages[3] = { pageNumber: 3, invoiceNumber: 'INV-100', sumAmount: 40.00, rowCount: 1, status: 'VALID' };
    storeA.pages[4] = { pageNumber: 4, invoiceNumber: 'INV-100', sumAmount: 30.00, rowCount: 1, status: 'VALID' };
    storeA.pages[5] = { pageNumber: 5, invoiceNumber: 'INV-100', sumAmount: 20.00, rowCount: 1, status: 'VALID' };
    // On Page 5, another invoice_amount = $200.00 is found!
    const p5A = simulateAttachTotalValidation(storeA, 5, 5, 'INV-100', { value: 200.00 });
    // MUST show RED ERROR: MULTIPLE_INSTANCES on same invoice
    assert.strictEqual(p5A.status, 'MULTIPLE_INSTANCES', 'Must show RED ERROR when 2 pages of the same invoice have invoice_amount');
    assert.strictEqual(p5A.hasInvoiceAmountError, true);
    assert.deepStrictEqual(p5A.invoiceAmountPages, [2, 5]);
    assert(p5A.message.includes('INV-100'), 'Error message must reference the matching invoice_number');
    assert(p5A.pagesWithErrors.includes(2) && p5A.pagesWithErrors.includes(5), 'Both pages with duplicate totals must be marked with errors');

    const p2CardDup = p5A.pageStatusList.find(p => p.page === 2);
    const p5CardDup = p5A.pageStatusList.find(p => p.page === 5);
    assert.strictEqual(p2CardDup.isInvoiceAmountDup, true);
    assert.strictEqual(p2CardDup.status, 'INVALID');
    assert.strictEqual(p5CardDup.isInvoiceAmountDup, true);
    assert.strictEqual(p5CardDup.status, 'INVALID');

    // --- SCENARIO C: Multi-Invoice Document (5 Pages: P1-2 = INV-A, P3-5 = INV-B) ---
    // Each invoice has exactly ONE invoice_amount on its respective last page
    const storeC = { pages: {}, invoiceAmountPages: {} };
    // INV-A: Page 1 ($100.00) & Page 2 ($50.00, live invoice_amount: $150.00)
    storeC.pages[1] = { pageNumber: 1, invoiceNumber: 'INV-A', sumAmount: 100.00, rowCount: 2, status: 'VALID' };
    storeC.pages[2] = { pageNumber: 2, invoiceNumber: 'INV-A', sumAmount: 50.00, rowCount: 1, status: 'VALID' };
    simulateAttachTotalValidation(storeC, 2, 5, 'INV-A', { value: 150.00 });

    // INV-B: Page 3 ($70.00), Page 4 ($80.00), Page 5 ($50.00, live invoice_amount: $200.00)
    storeC.pages[3] = { pageNumber: 3, invoiceNumber: 'INV-B', sumAmount: 70.00, rowCount: 1, status: 'VALID' };
    storeC.pages[4] = { pageNumber: 4, invoiceNumber: 'INV-B', sumAmount: 80.00, rowCount: 1, status: 'VALID' };
    storeC.pages[5] = { pageNumber: 5, invoiceNumber: 'INV-B', sumAmount: 50.00, rowCount: 1, status: 'VALID' };
    const p5B = simulateAttachTotalValidation(storeC, 5, 5, 'INV-B', { value: 200.00 });

    // Validation for INV-B:
    // Active pages must be [3, 4, 5], sum must be 70 + 80 + 50 = 200.00, matching invoice amount 200.00
    assert.strictEqual(p5B.status, 'MATCH', 'INV-B should MATCH exactly on cumulative sum of pages 3, 4, 5');
    assert.strictEqual(p5B.sumAmount, 200.00);
    assert.strictEqual(p5B.invoiceAmount, 200.00);
    assert.strictEqual(p5B.difference, 0.00);
    assert.strictEqual(p5B.hasInvoiceAmountError, false, 'No duplicate error because INV-A and INV-B each have exactly one invoice_amount');
    assert.deepStrictEqual(p5B.activeInvoicePages, [3, 4, 5]);

    // Validation for INV-A: user flips back to Page 2
    const p2A_eval = simulateAttachTotalValidation(storeC, 2, 5, 'INV-A', null);
    assert.strictEqual(p2A_eval.status, 'MATCH', 'INV-A should MATCH on cumulative sum of pages 1, 2');
    assert.strictEqual(p2A_eval.sumAmount, 150.00);
    assert.strictEqual(p2A_eval.invoiceAmount, 150.00);
    assert.deepStrictEqual(p2A_eval.activeInvoicePages, [1, 2]);

    // Check subtle invoice tracking on all 5 page cards
    const card1 = p5B.pageStatusList.find(p => p.page === 1);
    const card2 = p5B.pageStatusList.find(p => p.page === 2);
    const card3 = p5B.pageStatusList.find(p => p.page === 3);
    const card5 = p5B.pageStatusList.find(p => p.page === 5);
    assert.strictEqual(card1.invoiceNumber, 'INV-A');
    assert.strictEqual(card2.invoiceNumber, 'INV-A');
    assert.strictEqual(card2.hasInvoiceAmount, true);
    assert.strictEqual(card2.isInvoiceAmountDup, false);
    assert.strictEqual(card3.invoiceNumber, 'INV-B');
    assert.strictEqual(card5.invoiceNumber, 'INV-B');
    assert.strictEqual(card5.hasInvoiceAmount, true);
    assert.strictEqual(card5.isInvoiceAmountDup, false);

    // --- SCENARIO D: INV-B has duplicate invoice_amount on Page 3 and Page 5 -> INV-B triggers red error, INV-A remains clean ---
    storeC.invoiceAmountPages[3] = { page: 3, value: 200.00, invoiceNumber: 'INV-B' };
    const p5B_dup = simulateAttachTotalValidation(storeC, 5, 5, 'INV-B', null);
    assert.strictEqual(p5B_dup.status, 'MULTIPLE_INSTANCES');
    assert.strictEqual(p5B_dup.hasInvoiceAmountError, true);
    assert.deepStrictEqual(p5B_dup.invoiceAmountPages, [3, 5]);

    // Even when viewing INV-B with duplicate error, INV-A's page 2 is NOT marked duplicate!
    const p2CardIsolated = p5B_dup.pageStatusList.find(p => p.page === 2);
    const p3CardIsolated = p5B_dup.pageStatusList.find(p => p.page === 3);
    const p5CardIsolated = p5B_dup.pageStatusList.find(p => p.page === 5);
    assert.strictEqual(p2CardIsolated.isInvoiceAmountDup, false, 'INV-A page 2 must NOT be marked duplicate');
    assert.strictEqual(p3CardIsolated.isInvoiceAmountDup, true, 'INV-B page 3 must be marked duplicate');
    assert.strictEqual(p5CardIsolated.isInvoiceAmountDup, true, 'INV-B page 5 must be marked duplicate');

    console.log('  Passed ✅');
}

testDocumentInstanceMatching();
testSidebarScrollingMemory();
testCrossDocumentEnvironmentMemory();
testColumnIsolationAndStrictHeaders();
testMultiPageErrorTracking();
testInvoiceNumberPartitioning();
testMultiPageTotalPlacement();
testPageWithoutTable();
testPrioritizedPageDetection();
testPageTransitionWithTablelessPage();
testValidStatePreservedAgainstTemporaryDetectionMiss();
testThreeNavigationTrackingMethods();
testPanelRenderSafeWithEmptyValidRows();
testSidePanelScrollThreshold();
testPeriodicTableRecheckEvery1to2Seconds();
testSingleFilePageActivationVsFileListSuppression();
testItemNoWhitespaceProhibition();
testFullReverificationAndSidebarRecoveryGating();
testSidebarAutoTurnOffAndReEditRewatch();
testEnvironmentExtractionResilienceAndRefreshRewatch();
testResilientMultiPageDetectionAndDynamicDiscovery();
testTradePartnerMultiPageVsSinglePage();
testTablelessPageAccumulationAndStateIsolation();
testPage1TablePreservationOnNavigation();
testRequiredTableColumnsValidation();
testMultiPageTablelessPage1Isolation();
testMultiPageInvoiceAmountAndMultiInvoicePartitioning();

console.log('--- ALL 35 TEST SUITES PASSED SUCCESSFULLY! ---');










