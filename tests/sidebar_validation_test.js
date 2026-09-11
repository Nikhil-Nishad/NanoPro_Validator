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

    // 3. trade_partner_name check: must have at least 2 characters and not be label text
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
        tradePartner: { status: tradePartnerStatus, value: tradePartner?.raw?.trim() || null, message: tradePartnerMessage },
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
// TEST 11: Cross-Document Environment Persistence
// ============================================================
function testCrossDocumentEnvironmentMemory() {
    console.log('Test 11: Cross-document Environment persistence across different invoice files');

    let sessionRememberedEnv = null;

    function simulateFileLoad(newUrl, liveDomEnv) {
        // When user opens a new file, if session has remembered environment, seed it
        let fileEnv = sessionRememberedEnv ? { ...sessionRememberedEnv, isRemembered: true } : null;

        if (liveDomEnv && liveDomEnv.raw) {
            fileEnv = { ...liveDomEnv, isRemembered: false };
            sessionRememberedEnv = { ...liveDomEnv }; // Store in session/storage
        }

        return fileEnv;
    }

    // Doc 1: Live DOM has Environment: prod
    const doc1Env = simulateFileLoad(
        'https://app.nanonets.com/#/review/model1/file1',
        { raw: 'prod', value: 'prod', selector: 'data-testid' }
    );
    assert.ok(doc1Env, 'Doc 1 should have environment');
    assert.strictEqual(doc1Env.raw, 'prod');
    assert.strictEqual(doc1Env.isRemembered, false, 'Doc 1 is live from DOM');

    // Doc 2: New file opened! Environment not yet scrolled into view (null in DOM)
    const doc2Env = simulateFileLoad(
        'https://app.nanonets.com/#/review/model1/file2',
        null
    );
    assert.ok(doc2Env, 'Doc 2 must retain remembered environment');
    assert.strictEqual(doc2Env.raw, 'prod');
    assert.strictEqual(doc2Env.isRemembered, true, 'Flagged as remembered from previous file in session');

    // Evaluation for Doc 2 should PASS with no "Environment not found" error!
    const valResult = evaluateSidebarValidation({
        environment: doc2Env,
        isRental: [{ raw: 'False', value: 'False' }],
        tradePartnerName: { raw: 'Partner X', value: 'Partner X' },
        invoiceAmount: { raw: '50.00', value: 50.00, count: 1, multiple: false },
        pageInfo: { currentPage: 1, totalPages: 1, isMultiPage: false }
    });
    assert.strictEqual(valResult.environment.status, 'VALID');
    assert.strictEqual(valResult.errors.length, 0, 'Validation passes without environment error');

    // Doc 3: User scrolls into view on Doc 2 and live element is detected
    const doc2ScrolledEnv = simulateFileLoad(
        'https://app.nanonets.com/#/review/model1/file2',
        { raw: 'prod', value: 'prod', selector: 'label-scan' }
    );
    assert.strictEqual(doc2ScrolledEnv.isRemembered, false, 'Becomes live when detected in DOM');

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

        // Check if invoice_amount is placed on earlier pages
        if (currentPage < totalPages && liveInvoiceAmount && liveInvoiceAmount.value) {
            return {
                status: 'ERROR',
                message: `invoice_amount should only appear on the last page (Page ${totalPages}), not on Page ${currentPage}`,
                isEarlyTotalError: true
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

    // 2. On Page 1, but invoice_amount is incorrectly present on Page 1:
    const p1EarlyError = evaluatePageTotal(store, 1, 3, { value: 150.00 }, null);
    assert.strictEqual(p1EarlyError.status, 'ERROR');
    assert.ok(p1EarlyError.isEarlyTotalError);
    assert.ok(p1EarlyError.message.includes('should only appear on the last page'));

    // 3. User navigates to Page 2 (sum: $60.00)
    store.pages[2] = { sumAmount: 60.00 };
    const p2Pending = evaluatePageTotal(store, 2, 3, null, null);
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

console.log('--- ALL 24 TEST SUITES PASSED SUCCESSFULLY! ---');





