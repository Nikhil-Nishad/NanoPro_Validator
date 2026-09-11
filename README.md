# 🧮 NanoPro Validator

> Chrome/Edge extension that validates invoice line item calculations, sidebar fields, rental consistency, virtualized sidebar scrolling memory, multi-page cumulative totals, whitespace integrity, and single-file page isolation on Nanonets review pages.

![Version](https://img.shields.io/badge/version-4.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-gray)

📖 **Detailed Documentation:** For an exhaustive encyclopedia of every check, rule, threshold, and regex, see [Docs/RULES_AND_CHECKS_SPECIFICATION.md](Docs/RULES_AND_CHECKS_SPECIFICATION.md).

---

## 🔄 Version Evolution: v2.0 vs v3.0 vs v4.0

| Capability | Version 2.0 (Foundations) | Version 3.0 (Multi-Page & Sidebar) | Version 4.0 (Enterprise Precision & Isolation) |
|---|---|---|---|
| **Domain Scope** | Generic `*.nanonets.com` | Generic `*.nanonets.com` | **Strict `app.nanonets.com` Alone**: Isolated in manifest and runtime |
| **Page View Isolation** | Present on all sub-pages | Present on all sub-pages | **Opened File Pages Only**: Inactive and completely unmounted from DOM on file list views (`#/ocr/test/{modelId}`) |
| **`Item_No` Whitespace** | Not checked | Not checked | **Zero-Whitespace Enforcement**: Spaces or tabs throw ❌ `Item_No Error` (`CONTAINS_WHITESPACE`) |
| **Header Collision Protection** | Basic text matching | Basic text matching | **Strict Column Isolation**: Negative lookaheads prevent `Item_Price` vs `Cyl_Returned`, `Qty` vs `Cyl_Shipped`, and `Item_No` vs `Item_No_2` |
| **Navigation Detection** | Basic URL listener | Basic URL listener | **3-Method Real-Time Tracking**: URL route, sidebar `invoice_number`, and pagination input changes |
| **Live Table Edits** | Recheck on reload/resnip | Recheck on reload/resnip | **Continuous 1.5s Heartbeat**: Automatically recalculates live table edits without page refresh |
| **Sidebar Scroll Recheck** | Passive memory | Remembers unmounted fields | **40% Scroll Threshold**: Triggers instant field rechecks on 40% vertical scroll |
| **Multi-Page Error Visibility** | Single status | Error count | **Per-Page Error Pills**: Displays which exact pages contain errors (e.g. `❌ P1, P3 Errors`) |
| **Table-less Pages** | Failed / error | Could trigger misses | **Safe Table-less Handling**: Cleanly recognizes 0-row cover pages and receipts ($0.00) without crashes |
| **Wipe Protection** | None | None | **DOM Miss Protection**: Preserves confirmed valid table data against temporary detection blips |

---

### 🚀 What's New in Version 4.0
1. **Zero-Whitespace Enforcement on `Item_No`**:
   - `Item_No` values must **NOT** contain any spaces or whitespace anywhere in the string (leading, trailing, internal, spaces, tabs, newlines).
   - Any whitespace throws an immediate ❌ **`Item_No Error`** (`reason: 'CONTAINS_WHITESPACE'`), triggering badge shake and turning the status Red.
2. **Opened File Activation vs File List Suppression (`app.nanonets.com` alone)**:
   - Manifest host permissions and content scripts are restricted strictly to `https://app.nanonets.com/*`.
   - The extension automatically detects when you are on the file list (`#/ocr/test/{modelId}?rowsPerPage`) and **unmounts the overlay completely from the DOM**, eliminating visual clutter.
   - When a file is opened (`#/ocr/test/{modelId}/{fileId}`), the extension automatically mounts and activates.
3. **Column Isolation & Anti-Collision Engine**:
   - Strict regex exclusions prevent confusing `Item_Price` with `Cyl_Returned`, `Qty` with `Cyl_Shipped`, or `Item_No` with `Item_No_2`.
4. **Three Real-Time Navigation Tracking Methods**:
   - Method 1: URL route and hash watcher.
   - Method 2: Sidebar `invoice_number` change detector (detects document switches even when SPA hash lags).
   - Method 3: Pagination input tracker for multi-page documents.
5. **Continuous 1.5s Periodic Table State Heartbeat**:
   - Rechecks table rows every 1.5 seconds. If a reviewer updates any quantity or price directly in Nanonets, calculations update instantly without requiring manual page reload.
6. **40% Side Panel Scroll Recheck**:
   - Automatically detects when the reviewer scrolls the sidebar by 40% or more, capturing virtualized fields that mounted into view.
7. **Multi-Page Error Tracking**:
   - Accurately tracks which specific pages in a multi-page document have errors and displays pills (e.g. `❌ P1, P3 Errors`).

---

### 📦 Key Foundations from Version 3.0 & 2.0
- **Cumulative Multi-Page Line Item Total**: Sums line items across all pages and validates against the final `invoice_amount` on the last page.
- **Strict Sidebar Fields**: `Environment === "prod"`, `is_rental` consistency (`all True` or `all False`), and `trade_partner_name` with $\ge 2$ characters.
- **Rental Cross-Validation**: `Item_No` cannot be only `"-R"`; `-R` suffix required on rentals (⚠️ Caution if missing) and forbidden on non-rentals (❌ Error if present).
- **Dual Mode UI**: Auto detection with visual snip manual mode fallback.
- **Zero-Purple Design System**: Clean slate, emerald, coral, amber, and sky blue tokens rendered inside an isolated Shadow DOM.

---

## 🛠️ Build, Reload & Setup Instructions

Because NanoPro is built as a pure, lightweight Manifest V3 Chrome/Edge extension without bulky bundlers or heavy dependencies, **there is no complex compilation or build step**.

### 1. Validating the Extension ("Build")
To verify that all JavaScript source files and test suites pass with zero syntax errors:
```bash
# Verify JavaScript syntax across all modules
node -c src/background.js src/content/*.js src/ui/*.js

# Run the automated test suite (all 25 validation test suites)
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
5. The extension **NanoPro Validator v4.0.0** is now active!

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
  <strong>NanoPro Validator v4.0.0</strong><br>
  Built with ❤️ for invoice validation accuracy
</p>
