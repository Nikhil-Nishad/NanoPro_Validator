# 🧮 NanoPro Validator

> Chrome/Edge extension that validates invoice line item calculations, sidebar fields, rental consistency, virtualized sidebar scrolling memory, and multi-page cumulative totals on Nanonets review pages.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-gray)

---

## 🔄 Version Comparison: Version 2.0 vs Version 3.0

The following table and breakdown clearly distinguish what was introduced in **Version 2.0** versus the advanced capabilities added in **Version 3.0**:

| Capability | Version 2.0 (Foundations) | Version 3.0 (Enterprise Suite) |
|---|---|---|
| **Document Page Handling** | Single-page / active DOM table only | **Full Multi-Page Support** + Single-page fallback |
| **Invoice Total Validation** | Compares active table sum to `invoice_amount` | **Cumulative Multi-Page Sum**: Adds line amounts across all pages/tables to match `invoice_amount` on the last page |
| **Sidebar Field Checks** | None (only scanned `invoice_amount`) | **Strict Sidebar Validation**: `Environment=prod`, `is_rental` consistency, non-blank `trade_partner_name` |
| **Virtualized Sidebar Scrolling** | Lost fields scrolled out of DOM view | **Persistent Field Memory**: Remembers fields when user scrolls sidebar to bottom and back to top; shows `(remembered)` status |
| **Multiple Totals Guard** | Not checked (took first match) | **Multiplicity Error**: Flags error if multiple `invoice_amount` instances exist |
| **`Item_No` Validation** | Basic `-R` caution tag | **Deep Cross-Validation**: Prohibits standalone `"-R"`; validates `-R` suffix against `is_rental` (`all True` vs `all False`) |
| **Page Number Detection** | Not supported | **Auto-detects Page Info** (`Page X of Y`) via Nanonets pagination controls |
| **Multi-Page URL Instance Matching** | Basic URL hash equality check | **UUIDv1 Pattern Matching**: Recognizes page URLs within the same file instance (e.g. `b8c39de8...` vs `b8c39e6e...`) to retain state across pages |
| **SPA Route Tracking** | Basic URL listener | **Session-Scoped File Hash Tracking**: Cleans up and isolates multi-page stores and sidebar memory between distinct documents |
| **UI Experience** | Standard row list + total card | **Dedicated Sidebar Fields Grid**, multi-page progress badges, and page-by-page breakdown pills |

---

### 📦 What's in Version 2.0
- **Dual Mode Operation**:
  - **Auto Mode**: Heuristic column and container detection finding `Qty`, `Item_Price`, and `Line_Amount` automatically.
  - **Manual Mode**: Visual drag-to-snip overlay tool to manually select line item tables.
- **Row-Level Math Validation**: Validates `Qty × Price = Amount` for every row with configurable tolerance (±$0.05).
- **Intelligent Correction Suggester**: Suggests expected numbers with confidence scores for erroneous rows.
- **Basic Single-Table Total Check**: Sums the active table's line amounts and checks against the sidebar `invoice_amount`.
- **Draggable & Resizable Shadow DOM UI**: Floating badge (`Ctrl+Drag` to move) and panel (resizable corner) that never leak styles into or conflict with Nanonets styles.

---

### 🚀 What's New in Version 3.0
1. **Multi-Page Line Amount Accumulation & Single-Page Fallback**:
   - **Single-Page Fallback**: If page numbers are not detected, the document is seamlessly treated as a 1-page document (`Page 1 of 1`).
   - **Cumulative Total Aggregation**: For multi-page invoices (`Page 1 of N`), line amounts from tables across **all pages are automatically recorded and summed** as the reviewer navigates through the document.
   - **Last Page Final Invoice Matching**: Enforces that the cumulative sum of all pages equals the final `invoice_amount` (located on the last page).
   - **Smart Navigation Guidance**: Shows informative progress states on earlier pages (`Page 1 of 3 recorded... navigate to page 3 to validate`) and warns if earlier pages were skipped (`Missing earlier pages [1, 2]`).
2. **Multi-Page URL Pattern & Document Instance Matching**:
   - When flipping pages of a multi-page invoice, Nanonets generates consecutive UUIDv1 page URLs (for example:
     - Page 1: `https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39de8-a6eb-11f1-8c8d-4e5c90ea38a6`
     - Page 2: `https://app.nanonets.com/#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/b8c39e6e-a6eb-11f1-8c8e-4e5c90ea38a6`
   - NanoPro recognizes these URLs as belonging to the **same document instance**, preserving cumulative line items and remembered sidebar fields across page transitions.
   - When a completely different document is opened, all state is automatically reset for pristine isolation.
3. **Virtualized Sidebar Scrolling & Memory**:
   - In Nanonets, the sidebar uses virtual scrolling that unmounts elements when scrolled out of view.
   - Users can manually scroll down the sidebar to review fields and scroll back to the top: NanoPro intercepts scroll events via capture-phase listeners, **remembers every field discovered at any scroll position**, and displays them with a subtle `(remembered)` badge.
   - All rules (`Environment`, `trade_partner_name`, `is_rental`, `invoice_amount`) evaluate successfully even when the elements are currently unmounted from the DOM.
4. **Strict Sidebar Field Validations**:
   - **`Environment` Field**: Must be present and strictly equal `"prod"` (case-insensitive: `prod`, `PROD`).
   - **`is_rental` Consistency**: When multiple `is_rental` entries appear in the sidebar, checks that all entries are strictly identical (either all `True` or all `False`).
   - **`trade_partner_name` Presence**: Verifies that `trade_partner_name` is present and not blank or null.
   - **Single `invoice_amount` Check**: Flags an error if duplicate or multiple `invoice_amount` fields are present in the sidebar.
5. **`Item_No` Rental Cross-Validation**:
   - **No Standalone `"-R"`**: `Item_No` cannot be only `"-R"` (flagged as ❌ Error). It must be an actual SKU or text with `-R` suffix.
   - **When `is_rental` is all `True`**: Line items are expected to have the `-R` suffix. Missing suffixes are flagged with ⚠️ Caution.
   - **When `is_rental` is all `False`**: Line items must **NOT** have a `-R` suffix. Unexpected suffixes are flagged as ❌ Errors.
6. **Document Page Detection**:
   - Accurately reads Nanonets pagination controls (`<span>Page</span>`, `<input value="X" max="Y">`, and `<span>of Y</span>`).
7. **Dedicated Sidebar Fields UI Grid**:
   - Modern cards for Environment, Trade Partner, is_rental, and Page Info with live pass/fail icons and badges.
8. **Zero-Purple Design Compliance**:
   - Strictly engineered using slate, emerald, sky blue, amber, and coral color tokens.

---

## 🛠️ Build, Reload & Setup Instructions

Because NanoPro is built as a pure, lightweight Manifest V3 Chrome/Edge extension without bulky bundlers or heavy dependencies, **there is no complex compilation or build step**.

### 1. Validating the Extension ("Build")
To verify that all JavaScript source files and test suites pass with zero syntax errors:
```bash
# Verify JavaScript syntax across all modules
node -c src/background.js src/content/*.js src/ui/*.js

# Run the automated test suite (all 10 validation test suites)
node tests/sidebar_validation_test.js
```

### 2. How to Load the Extension in Chrome or Edge
1. Open your browser:
   - **Chrome**: Go to `chrome://extensions`
   - **Edge**: Go to `edge://extensions`
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. Click the **Load unpacked** button in the top-left.
4. In the folder picker dialog, select the project directory:
   `d:\Personal\Projects\NanoPro_extension` (the folder containing `manifest.json`).
5. The extension **NanoPro Validator v3.0.0** is now active!

### 3. How to Reload After Code Updates
Whenever you update code or pull changes:
1. Open `chrome://extensions`.
2. Locate the **NanoPro Validator** card.
3. Click the **Reload (🔄) icon** on the card.
4. Switch back to your Nanonets browser tab and press **F5** (or Ctrl+R) to refresh the page.
5. The latest version is immediately loaded and active.

### 4. How to Use the Extension
1. Open any Nanonets invoice review page (e.g. `https://app.nanonets.com/#/ocr/test/...`).
2. The **NanoPro badge** will appear floating at the top of the page.
3. Click the **Auto/Manual** button on the badge to switch to **Auto** mode (default).
4. **Validating Single-Page Documents**:
   - The extension auto-detects the table, validates `Qty × Price = Amount`, checks sidebar fields, and confirms the single-page total against `invoice_amount`.
5. **Validating Multi-Page Invoices**:
   - On **Page 1**, the extension records Page 1's line amounts and displays `📄 Page 1/N Recorded`.
   - Click **Next** (or flip pages) in Nanonets. The extension automatically records Page 2, Page 3, etc.
   - On the **Last Page** (where `invoice_amount` is located), the extension sums line amounts across all pages and validates the cumulative total against `invoice_amount`.
   - Click the badge or press `Alt+Shift+V` to open the panel for the complete page-by-page breakdown and sidebar field statuses.

---

## 📊 Understanding Results

### Badge States

| Badge | Meaning |
|-------|---------|
| 📐 Click to Select | Ready to scan (manual mode) |
| ✂️ Select Table Area | Selection mode active |
| 🔄 Validating... | Processing |
| ✅ X/X Valid | All calculations and sidebar fields passed |
| ❌ Errors Found | Calculations, sidebar fields, or Item_No errors found |
| ⚠️ Cautions Found | Total mismatch/missing or Item_No missing `-R` |

### Panel Display
- **Summary Bar**: Valid/invalid row count
- **Sidebar Fields Section**: Status cards for Environment (`prod`), Trade Partner, is_rental, and Page Info
- **Each Row**: `Qty × Price = Amount` with status icon and caution/error tags
- **Invoice Total**: Sum of line amounts vs `invoice_amount` (✅ Match / ❌ Mismatch / ❌ Multiple Totals)

---

## 📁 Project Structure

```
NanoPro_extension/
├── manifest.json           # Extension config (MV3)
├── README.md
│
├── src/
│   ├── background.js       # Service worker for keyboard shortcuts
│   │
│   ├── content/            # Content scripts (isolated world)
│   │   ├── index.js        # Main orchestrator, dual-mode support
│   │   ├── autoDetector.js # Auto table detection + invoice_amount extraction
│   │   ├── parser.js       # Number parsing with format detection
│   │   ├── selector.js     # Region selection UI (manual mode)
│   │   ├── capture.js      # DOM text extraction from selection
│   │   ├── tableParser.js  # Grid detection and column identification
│   │   ├── validator.js    # Calculation validation engine
│   │   ├── suggester.js    # Correction suggestion generator
│   │   └── scanner.js      # [Legacy] Original DOM scanner
│   │
│   └── ui/                 # User interface components
│       ├── overlay.js      # Shadow DOM container + all CSS
│       ├── badge.js        # Floating status badge with mode toggle
│       └── panel.js        # Results panel with totals + suggestions
│
└── icons/                  # Extension icons (16, 48, 128 + SVG)
```

---

## 🛡️ Non-Intrusive Security Model

NanoPro operates **exclusively through Chrome's isolated content script world**. The host page (Nanonets) **cannot detect** this extension.

### ✅ What we DO (safe, invisible)

| Action | Why Safe |
|--------|----------|
| Read `input.value` | Isolated world DOM read |
| `querySelectorAll()` | Pure DOM query, no JS trace |
| `getBoundingClientRect()` | Layout read, no mutation |
| `chrome.storage.local` | Sandboxed extension API |
| Shadow DOM overlay | Page can't traverse |

### ❌ What we NEVER do

- Patch `window.fetch` or `XMLHttpRequest`
- Inject scripts into the page's MAIN world
- Dispatch custom events detectable by the page
- Modify DOM elements or attributes on the page
- Make any network requests
- Expose `web_accessible_resources`

---

## ⚙️ Customization

### Validation Tolerance (per-row)

Edit `src/content/validator.js`:

```javascript
const CONFIG = {
  tolerance: 0.05,  // 5 cents tolerance for row validation
};
```

### Invoice Total Tolerance

The total validation uses ±$0.10 tolerance by default. This is set in `src/content/index.js` within the `attachTotalValidation()` function.

### Adding Column Name Aliases

Edit the `HEADER_PATTERNS` in `src/content/autoDetector.js`:

```javascript
const HEADER_PATTERNS = {
  qty: /^(qty|quantity|units|count|your_name)$/i,
  price: /^(item_price|unit_price|rate|your_name)$/i,
  amount: /^(line_amount|amount|total|your_name)$/i,
  item_no: /^(item_no|item_no_2|item_number|part_no|your_name)$/i,
};
```

---

## 🔧 Debugging

Open browser console (`F12` → Console) on a Nanonets page.

### Console Messages
- `[NanoPro AutoDetector]` — Detection strategy results
- `[NanoPro v2]` — Mode, validation pipeline
- `[NanoPro]` — Total validation, processing

### Diagnostics
If auto-detection fails, a diagnostic report is printed automatically showing which container/header/input strategies succeeded or failed.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Badge not appearing | Ensure you're on `*.nanonets.com`, reload extension |
| Auto mode shows "No Data" | Reload page, check console for diagnostic report |
| "Incomplete Data" | Some columns may not be detected — switch to Manual mode |
| Invoice total "not found" | `invoice_amount` field must be visible in sidebar |
| Keyboard shortcuts fail | Check `chrome://extensions/shortcuts` |

---

## 📜 License

MIT License — Free for personal and commercial use.

---

<p align="center">
  <strong>NanoPro Validator v3.0.0</strong><br>
  Built with ❤️ for invoice validation accuracy
</p>
