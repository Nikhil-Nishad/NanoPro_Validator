# 📘 NanoPro Validator — Comprehensive Rules & Checks Specification

> **Document Version:** 4.0.0  
> **Target Environment:** `https://app.nanonets.com`  
> **Extension Architecture:** Manifest V3, Shadow DOM Isolated UI, Pure Modular JavaScript  

---

## Table of Contents
1. [System Architecture & Scope](#1-system-architecture--scope)
2. [Document Lifecycle & Navigation Engine](#2-document-lifecycle--navigation-engine)
3. [Sidebar Field Checks & Rules](#3-sidebar-field-checks--rules)
4. [Table Header Recognition & Column Isolation](#4-table-header-recognition--column-isolation)
5. [Line Item Math & Calculation Rules](#5-line-item-math--calculation-rules)
6. [Item_No Rules & Rental Cross-Validation](#6-item_no-rules--rental-cross-validation)
7. [Multi-Page Accumulation & Invoice Amount Matching](#7-multi-page-accumulation--invoice-amount-matching)
8. [Extension State Machine (Verified, Caution, Error, Incomplete)](#8-extension-state-machine)
9. [Comprehensive Master Rules Table](#9-comprehensive-master-rules-table)

---

## 1. System Architecture & Scope

### 1.1 Strict Origin Isolation
* **Allowed Origin:** `https://app.nanonets.com` alone.
* **Manifest Permissions:**
  ```json
  "host_permissions": ["https://app.nanonets.com/*"],
  "content_scripts": [{ "matches": ["https://app.nanonets.com/*"] }]
  ```
* **Runtime Verification:** `isNanonetsPage()` rejects `nanonets.com`, `www.nanonets.com`, staging domains, and outside sites.

### 1.2 Opened File vs. File List Isolation
* **Opened File URL Pattern:**
  ```
  https://app.nanonets.com/#/ocr/test/{modelId}/{fileId}?rowsPerPage=
  https://app.nanonets.com/#/ocr/{modelId}/{fileId}
  https://app.nanonets.com/#/review/{modelId}/{fileId}
  ```
  Requires both a valid `modelId` AND `fileId` (typically UUID or alphanumeric file tokens).
* **File List / Overview URL Pattern (Extension SUPPRESSED):**
  ```
  https://app.nanonets.com/#/ocr/test/{modelId}?rowsPerPage
  https://app.nanonets.com/#/ocr/{modelId}
  ```
  Contains only `modelId` without an opened `fileId`.
* **Sub-Tab Suppression:** Non-file routes (e.g. `/settings`, `/train`, `/files`, `/metrics`, `/integrations`, `/rules`, `/activity`, `/export`, `/upload`, `/analytics`, `/logs`) are ignored.
* **Dynamic DOM Mount/Unmount:**
  - **When file list is open:** The extension does **NOT** inject badge or panel into the DOM. Zero visual presence.
  - **When a file is clicked:** The extension detects the file route and mounts the Shadow DOM container.
  - **When returning to file list:** The extension invokes `cleanup()`, unmounting and completely removing the Shadow DOM from `document.body`.

---

## 2. Document Lifecycle & Navigation Engine

### 2.1 Three-Layer Real-Time Navigation Tracking
To ensure the extension never displays stale data or requires manual page refreshes, it employs 3 distinct navigation detection mechanisms running on a 100ms watcher:

1. **Method 1: URL Route & Hash Tracking**
   - Continuously monitors `window.location.href` and `window.location.hash`.
   - Differentiates between document switches, page flips within the same multi-page file, and navigation back to the file list.
2. **Method 2: Sidebar `invoice_number` Tracking**
   - Continuously tracks the value of `invoice_number` in the Nanonets sidebar.
   - If `invoice_number` changes from its previous value (e.g. from `INV-1001` to `INV-1002`), an instant document switch is detected even if the SPA hash transition lagged.
   - If the field temporarily unmounts due to virtualized scrolling, the last known value is safely preserved.
3. **Method 3: Multi-Page Pagination Tracking**
   - Reads the active page from the Nanonets pagination widget (`<input value="X">` or `<span>of Y</span>` or thumbnail selection).
   - If the page number changes (e.g. from Page 1 to Page 2), automatically saves Page 1 results and scans Page 2.

### 2.2 40% Sidebar Scroll Threshold Recheck
- Attaches capture-phase scroll listeners to the sidebar container (`.sidebar`, `[class*="sidebar"]`, `[class*="field-list"]`).
- When user scrolls vertically by **40% or more** (`deltaY >= clientHeight * 0.40`), triggers an automatic recheck to capture newly mounted virtualized fields.

### 2.3 Continuous 1.5s Periodic Table State Heartbeat
- Runs every **1500ms** (`CONFIG.tableRecheckInterval = 1500`) to detect live user edits in table cells (e.g. user corrected a Qty or Line_Amount in Nanonets).
- Uses hash comparison of table cell values (`hashTableState`):
  - If identical: zero DOM reflows, returns silently.
  - If modified: immediately recalculates row math, recomputes cumulative totals, and updates UI.
- **Wipe Protection:** If a page previously had confirmed table rows, a temporary detection hiccup will never overwrite it into a 0-row page.

### 2.4 Document Instance Partitioning (UUIDv1 & Invoice Number)
- Multi-page files generated in Nanonets produce consecutive UUIDv1 page IDs (e.g. `...-a6eb-11f1-8c8d-...` vs `...-a6eb-11f1-8c8e-...`).
- `isSameDocumentInstance()` groups related URLs and matching `invoice_number` values together into a single multi-page session.
- Opening an invoice with a different `invoice_number` or non-consecutive UUID cleanly resets the multi-page session store.

---

## 3. Sidebar Field Checks & Rules

| Field Name | Target Requirement | Safe / Valid State | Caution State | Error State |
|---|---|---|---|---|
| **`Environment`** | Must identify environment as Production | Case-insensitive equal to `"prod"` (e.g. `prod`, `PROD`) | — | Value missing, blank, or equals `test`, `dev`, `stage`, `staging`, `demo` |
| **`is_rental`** | Consistency across all occurrences | All instances are strictly identical (`all True` OR `all False`) | — | Mixed values on same document (e.g. one `True` and one `False`), or invalid value |
| **`trade_partner_name`** | Presence of valid trading partner ID | Contains at least 2 alphanumeric characters (e.g. `"INSTANTLRN"`, `"ABC"`) | — | Blank, null, only whitespace, punctuation only (e.g. `---`), or matches label text (`"Trade Partner Name"`) |
| **`invoice_amount` Multiplicity** | Exactly one invoice total | Exactly 1 `invoice_amount` field in the sidebar | — | Multiple instances detected (`count > 1`) |

### Per-File Environment Isolation & In-File Scrolling Memory
- **Mandatory Check on Every File:** `Environment: prod` must be checked and confirmed for **all files independently**.
- **In-File Memory:** Once `Environment: prod` is detected on a file, it is safely remembered within that file instance (even when scrolled out of view or flipping between pages of a multi-page document).
- **Zero Cross-File Leakage:** When navigating to a new invoice file, **all environment memory is reset to null**. The extension **never carries over `Environment` across different files**. It must freshly verify `Environment: prod` on the new file's sidebar.

### Virtualized Scrolling Memory
- When fields scroll out of view and unmount from the DOM within the active document instance, their confirmed valid states are retained in `sidebarMemory`.

---

## 4. Table Header Recognition & Column Isolation

Nanonets tables often include visually or textually similar columns that must **never** be conflated:

| Target Column | Matched Headers (Case-Insensitive) | Strictly Excluded Non-Target Headers | Collision Danger Prevented |
|---|---|---|---|
| **`Item_Price`** | `item_price`, `unit_price`, `price`, `rate` | `cyl_returned`, `cyl_shipped`, `computations`, `unit_of_measure`, `description`, `item_no_2`, `qty_ordered` | **`Cyl_Returned`** (cylinders returned) was previously misidentified as `Item_Price`. Isolated with strict regexes. |
| **`Qty`** | `qty`, `quantity`, `count` | `cyl_shipped`, `qty_ordered`, `cyl_returned`, `computations` | **`Cyl_Shipped`** (cylinders shipped) was previously misidentified as `Qty`. Isolated with strict regexes. |
| **`Line_Amount`** | `line_amount`, `amount`, `total`, `ext_price`, `extended_amount` | `computations`, `unit_of_measure`, `item_no_2` | Prevents mapping to intermediate calculation columns. |
| **`Item_No`** | `item_no`, `item_number`, `part_no`, `sku` | `item_no_2`, `description`, `unit_of_measure`, `cyl_returned` | **`Item_No_2`** (secondary item number) was previously misidentified as primary `Item_No`. Isolated with exact name matching. |

### Header Detection Heuristics
1. **Direct header cell text matching** (`th`, `[role="columnheader"]`, `.header-cell`).
2. **Column bounding box alignment** (`getBoundingClientRect()` center X alignment) with data cells.
3. **Data cell fallback**: detects `[data-field-name]` or input placeholders when header row is virtualized.

---

## 5. Line Item Math & Calculation Rules

### 5.1 Row-Level Formula
$$\text{Line\_Amount} = \text{Qty} \times \text{Item\_Price}$$

* **Tolerance:** $\pm\$0.05$ (to account for rounding on multi-decimal fuel/gas rates).
* **Currency / Numeric Sanitization:**
  - Automatically strips `$`, `€`, `£`, commas, and whitespace before calculation.
  - Supports negative amounts: `-$15.00`, `($15.00)`, `-15.00`.
* **Zero Qty / Zero Price Handling:**
  - If $\text{Qty} = 0$, $\text{Line\_Amount}$ must equal $\$0.00$.
  - Informational rows with $\$0.00$ are validated cleanly.

### 5.2 Row Calculation States
* **VALID (Green):** $|\text{Qty} \times \text{Price} - \text{Amount}| \le 0.05$.
* **INVALID (Red):** $|\text{Qty} \times \text{Price} - \text{Amount}| > 0.05$.
  - Triggers error count on badge and side panel.
  - Automatically suggests expected amount or unit price with confidence rating.
* **INCOMPLETE (Blue/Gray):** Any of `Qty`, `Price`, or `Amount` is blank, missing, or unparseable.

---

## 6. Item_No Rules & Rental Cross-Validation

The `Item_No` field identifies parts/SKUs and must adhere to strict formatting and rental consistency rules:

### 6.1 Whitespace Prohibition (Rule 1)
* **Rule:** `Item_No` value **must NOT contain any spaces or whitespace** anywhere in the string (leading, trailing, internal, spaces, tabs, newlines).
* **Severity:** ❌ **ERROR** (`reason: 'CONTAINS_WHITESPACE'`)
* **Examples of Errors:**
  - `"CYL 001"` $\rightarrow$ ❌ ERROR (internal space)
  - `"PART-100 -R"` $\rightarrow$ ❌ ERROR (space before suffix)
  - `" ITEM-01"` $\rightarrow$ ❌ ERROR (leading space)
  - `"ITEM-02 "` $\rightarrow$ ❌ ERROR (trailing space)
  - `"SKU\t100"` $\rightarrow$ ❌ ERROR (tab character)
* **Examples of Safe Values:**
  - `"CYL-001"` $\rightarrow$ ✅ SAFE
  - `"PART-100-R"` $\rightarrow$ ✅ SAFE
  - `"12345678"` $\rightarrow$ ✅ SAFE

### 6.2 Standalone `"-R"` Prohibition (Rule 2)
* **Rule:** `Item_No` cannot be **ONLY** `"-R"` or `"-r"`. It must represent a genuine SKU/part identifier.
* **Severity:** ❌ **ERROR** (`reason: 'ONLY_DASH_R'`)
* **Example:**
  - `"-R"` $\rightarrow$ ❌ ERROR
  - `" -r "` $\rightarrow$ ❌ ERROR

### 6.3 Rental Suffix Cross-Validation with `is_rental` (Rules 3 & 4)
* **When `is_rental` is ALL `True`:**
  - Items are rental assets and should have the `"-R"` suffix.
  - If missing `"-R"` suffix $\rightarrow$ ⚠️ **CAUTION** (`reason: 'MISSING_DASH_R'`).
  - Example: `Item_No = "CYL-001"` on rental doc $\rightarrow$ ⚠️ Caution ("Missing -R suffix (Rental)").
* **When `is_rental` is ALL `False`:**
  - Items are sales/consumables and must **NOT** have a `"-R"` suffix.
  - If `"-R"` suffix is detected $\rightarrow$ ❌ **ERROR** (`reason: 'UNEXPECTED_DASH_R'`).
  - Example: `Item_No = "CYL-001-R"` on non-rental doc $\rightarrow$ ❌ Error ("Unexpected -R suffix (Non-Rental)").

### 6.4 Blank Item_No (Rule 5)
* **Rule:** If an `Item_No` column exists in the table header, no row should have a blank or missing value.
* **Severity:** ⚠️ **CAUTION** (`reason: 'BLANK'`)

---

## 7. Multi-Page Accumulation & Invoice Amount Matching

### 7.1 Single-Page vs Multi-Page Detection
* **Page Info Detection Priority:**
  1. Priority 1: Nanonets pagination input (`<span>Page</span> <input value="X" max="Y"> <span>of Y</span>`).
  2. Priority 2: Selected page thumbnail indicator (`.thumbnail.active`, `.page-active`).
  3. Priority 3: Fallback `Page 1 of 1` if no pagination controls exist.

### 7.2 Cumulative Multi-Page Summation
$$\text{Cumulative Sum} = \sum_{p=1}^{Y} \sum_{r \in \text{rows}(p)} \text{Line\_Amount}(r)$$

* **Earlier Pages ($1$ to $Y-1$):**
  - Line amounts are recorded and cached in `multiPageStore.pages[pageNum]`.
  - Extension displays progress: `Page X of Y recorded ($Sum)... navigate to page Y to validate final invoice total`.
  - `invoice_amount` should **NOT** appear on earlier pages.
* **Last Page ($Y$ of $Y$):**
  - The cumulative sum across **ALL** pages must match the final `invoice_amount` on the last page.
  - $|\text{Cumulative Sum} - \text{Invoice Amount}| \le 0.05$.
* **Missing Page Guard:**
  - If user skips from Page 1 directly to Page 3 without visiting Page 2:
  - Extension warns: ⚠️ `Missing earlier pages [2] (Multi-page total incomplete)`.

### 7.3 Table-less Pages (Cover, Receipt, T&C)
* Some multi-page documents have pages with **no line item table** (e.g. terms & conditions, delivery receipts).
* The extension cleanly recognizes these as valid table-less pages (`rowCount: 0`, `sumAmount: 0.00`).
* They do not crash the extension, do not throw false calculation errors, and contribute `$0.00` to the cumulative sum.

---

## 8. Extension State Machine

The floating badge and panel communicate document validity through 4 states:

```
┌─────────────────────────────────────────────────────────────┐
│                       DOCUMENT STATE                        │
├─────────────────┬───────────┬──────────────┬────────────────┤
│ State           │ Color     │ Badge Icon   │ Behavior       │
├─────────────────┼───────────┼──────────────┼────────────────┤
│ 1. VERIFIED     │ Emerald   │  Verified   │ No animation   │
│ 2. ERROR        │ Coral/Red │ ❌ Errors    │ Shake animate  │
│ 3. CAUTION      │ Amber     │ ⚠️ Caution   │ Shake animate  │
│ 4. INCOMPLETE   │ Sky Blue  │ ℹ️ Pending   │ No animation   │
└─────────────────┴───────────┴──────────────┴────────────────┘
```

### State Priority
$$\text{ERROR} \succ \text{CAUTION} \succ \text{INCOMPLETE} \succ \text{VERIFIED}$$

1. **ERROR (Highest Priority — Badge Turns Red with Shake):**
   - Any row calculation mismatch ($|\text{Qty} \times \text{Price} - \text{Amount}| > 0.05$).
   - `Environment` $\ne$ `"prod"`.
   - `is_rental` inconsistent (mixed `True` and `False`).
   - `trade_partner_name` blank, invalid, or only label.
   - Multiple `invoice_amount` fields detected.
   - `Item_No` contains any spaces/whitespace (`CONTAINS_WHITESPACE`).
   - `Item_No` is only `"-R"` (`ONLY_DASH_R`).
   - `Item_No` has unexpected `"-R"` on non-rental document (`UNEXPECTED_DASH_R`).
   - Last page cumulative line item sum $\ne$ `invoice_amount`.
   - **Multi-Page Error Pills:** Displays which exact pages have errors (e.g. `❌ P1, P3 Errors`).

2. **CAUTION (Medium Priority — Badge Turns Amber with Shake):**
   - `Item_No` missing `"-R"` suffix on rental document (`MISSING_DASH_R`).
   - `Item_No` blank in table row (`BLANK`).
   - Multi-page document has missing/skipped earlier pages (`PAGES_MISSING`).
   - All pages visited but `invoice_amount` not detected on last page.

3. **INCOMPLETE / PENDING (Informational — Sky Blue Badge):**
   - Currently on an earlier page of a multi-page document ($p < Y$).
   - Table cells are currently blank / being typed by user.

4. **VERIFIED (Success — Emerald Green Badge):**
   - All line items match formula.
   - All sidebar fields valid (`prod`, consistent rental, valid trade partner, single total).
   - All `Item_No` values pass formatting rules.
   - Cumulative total equals `invoice_amount` on the last page.

---

## 9. Comprehensive Master Rules Table

| ID | Category | Check / Target | Valid Condition | Caution Condition | Error Condition |
|---|---|---|---|---|---|
| **R01** | Scope | Hostname | `window.location.hostname === 'app.nanonets.com'` | — | Outside domains (extension inert) |
| **R02** | Scope | Route Type | `#/ocr/test/{mId}/{fId}` (file opened) | — | `#/ocr/test/{mId}` (file list: extension removed from DOM) |
| **R03** | Nav | URL Tracking | Hash/URL change triggers recheck | — | Navigation to non-file cleans up overlay |
| **R04** | Nav | Sidebar Invoice No | Identical across scroll; change triggers document reset | — | Different invoice number triggers new session |
| **R05** | Nav | Page Flip | Pager input / thumbnail change triggers page scan | — | — |
| **R06** | Nav | Sidebar Scroll | Scroll delta $\ge 40\%$ triggers field recheck | — | — |
| **R07** | Nav | Periodic Heartbeat | Polling every 1.5s detects live table edits | — | — |
| **R08** | Sidebar | `Environment` | Value strictly equals `"prod"` (case-insensitive) | — | Value is null, blank, or $\ne$ `"prod"` |
| **R09** | Sidebar | `is_rental` | All occurrences strictly match (`all True` or `all False`) | — | Mixed values (`True` and `False`) |
| **R10** | Sidebar | `trade_partner_name` | Contains $\ge 2$ alphanumeric chars (e.g. `"INSTANTLRN"`) | — | Blank, whitespace, punctuation (`---`), or label text |
| **R11** | Sidebar | `invoice_amount` Count | Exactly 1 field in sidebar | — | Multiple fields detected (`count > 1`) |
| **R12** | Table | Column Isolation | `Item_Price` $\ne$ `Cyl_Returned`; `Qty` $\ne$ `Cyl_Shipped` | — | Collisions prevented via strict negative regexes |
| **R13** | Table | Line Calculation | $|\text{Qty} \times \text{Price} - \text{Amount}| \le 0.05$ | — | $|\text{Qty} \times \text{Price} - \text{Amount}| > 0.05$ |
| **R14** | Item_No | Whitespace | Contains ZERO spaces or whitespace characters | — | Contains any space/tab/newline (`CONTAINS_WHITESPACE`) |
| **R15** | Item_No | Standalone -R | Contains part number / SKU | — | Value is only `"-R"` or `"-r"` (`ONLY_DASH_R`) |
| **R16** | Item_No | Rental Consistency | Ends in `"-R"` when `is_rental` is `True` | Missing `"-R"` on rental (`MISSING_DASH_R`) | Has `"-R"` on non-rental (`UNEXPECTED_DASH_R`) |
| **R17** | Item_No | Blank Cell | Cell populated with part number | Column exists but cell blank (`BLANK`) | — |
| **R18** | MultiPage | Cumulative Sum | $\sum \text{Line\_Amount} = \text{Invoice\_Amount}$ on last page | Skipping pages (`PAGES_MISSING`) | Last page cumulative total $\ne$ `invoice_amount` |
| **R19** | MultiPage | Total Placement | `invoice_amount` only on last page ($p = Y$) | Earlier page pending total verification | `invoice_amount` present on earlier page ($p < Y$) |
| **R20** | MultiPage | Table-less Pages | 0 rows, $\$0.00$ sum recorded cleanly without crash | — | — |
| **R21** | UI | Design System | Zero purple/violet tokens; Slate, Emerald, Coral, Amber | — | — |
