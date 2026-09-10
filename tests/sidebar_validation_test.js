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

console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
