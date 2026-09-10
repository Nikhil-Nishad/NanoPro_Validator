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

    // 3. trade_partner_name check
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

// Test 4: trade_partner_name presence
{
    console.log('Test 4: trade_partner_name check');
    const validTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: 'Acme Supply Co' }
    });
    assert.strictEqual(validTP.tradePartner.status, 'VALID');

    const blankTP = evaluateSidebarValidation({
        environment: { raw: 'prod' },
        isRental: [{ raw: 'False' }],
        tradePartnerName: { raw: '   ' }
    });
    assert.strictEqual(blankTP.tradePartner.status, 'ERROR');
    assert.strictEqual(blankTP.isValid, false);

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

console.log('--- ALL 8 TEST SUITES PASSED SUCCESSFULLY! ---');
