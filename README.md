# 🧮 NanoPro Validator

> Chrome/Edge extension that validates invoice line item calculations, sidebar fields, and rental consistency on Nanonets review pages.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-gray)

---

## 🆕 What's New in 3.0.0
- **Sidebar Field Validations**:
  - **`Environment` Check**: Verifies that `Environment` is present in the sidebar and equals `"prod"` (case-insensitive: `prod`, `PROD`, etc.). Non-prod or missing environments are flagged as errors.
  - **`is_rental` Multi-Value Consistency**: When multiple `is_rental` entries appear in the sidebar, checks that all values are identical (either all `True` or all `False`). Mixed values or missing fields are flagged as errors.
  - **`trade_partner_name` Presence**: Verifies that `trade_partner_name` is present in the sidebar and is not blank or null.
  - **Single `invoice_amount` Verification**: Enforces that only a single instance/number for `invoice_amount` exists in the sidebar. Multiple instances are flagged as errors.
- **`Item_No` Cross-Validation & Suffix Rules**:
  - **Not Only `-R`**: An `Item_No` cannot be just `"-R"` or `"-r"` (flagged as ❌ error). It can only contain `-R` as a suffix following content (e.g. `SKU123-R`).
  - **Rental Cross-Validation**:
    - When `is_rental` is **all True**: line items should have the `-R` suffix. Missing suffixes are flagged with ⚠️ caution.
    - When `is_rental` is **all False**: line items must **NOT** have `-R` suffix. Unexpected suffixes are flagged as ❌ errors.
- **Document Page Number Detection**:
  - Full-fledged detection of current page and total pages (e.g., `Page 1 of 4`) by reading Nanonets pagination controls (`Page` span, page input, and `of X` indicator).
  - Displayed live in the Sidebar Fields section of the validation panel.
- **High-Performance SPA Route Detection**: Strictly scopes execution to single-file document paths with seamless 500ms hash tracking across React SPA transitions.
- **Dedicated Sidebar Fields Panel UI**: Clean, modern card grid in the details panel showing real-time validation statuses for Environment, Trade Partner, is_rental, and Page Info.
- **Smart Auto-Recalculation**: Live re-validation hashes both table rows and all sidebar field states to instantly drop redundant cycles while instantly catching edits.

---

## ✨ Features

- **Dual Mode** — Automatic detection or manual table selection
- **Auto Detection** — Column-first DOM analysis finds Qty, Price, Amount automatically
- **Sidebar Field Validation** — Validates `Environment` (`prod`), `is_rental` consistency, and non-blank `trade_partner_name`
- **Invoice Total Validation** — Compares sum of line amounts against sidebar `invoice_amount` (detects multiple totals)
- **Item_No Cross-Validation** — Enforces `-R` suffix consistency linked to `is_rental` status and forbids standalone `-R`
- **Document Page Detection** — Identifies current page and total document pages
- **Visual Table Selection** — Snipping-tool-like interface for manual mode
- **Draggable UI** — Hold `Ctrl` and drag to reposition the extension overlay
- **Resizable Panel** — Drag the bottom-right corner to adjust the details panel
- **Smart Column Detection** — Identifies Qty, Item_Price, Line_Amount from MUI headers
- **Multi-Row Validation** — Validates all rows: `Qty × Price = Amount`
- **Intelligent Suggestions** — Correction recommendations with confidence scores
- **Non-Intrusive** — Operates entirely through content script DOM reads (invisible to the page)
- **Keyboard Shortcuts** — Quick access without mouse
- **High-Performance Route Tracking** — Strictly limits bounds to single file document paths, automatically cleaning up and resetting state upon SPA hash navigation

---

## 📦 Installation

### Chrome / Edge (Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `NanoPro_extension` folder
6. Navigate to any Nanonets review page

---

## 🚀 Usage

### Auto Mode (Default after first toggle)
1. Look for the badge at the top of the page
2. Click **Auto/Manual** toggle to switch to Auto mode
3. Extension automatically detects the table and sidebar fields
4. Invoice total, environment, rental status, trade partner, and item numbers are validated automatically

### Manual Mode
1. Click the badge or press `Alt+Shift+S`
2. Drag to select the table area containing line items
3. Release to validate

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | Start table selection (manual mode) |
| `Alt+Shift+V` | Toggle validation panel |
| `Alt+Shift+R` | Reset extension state |
| `Alt+Shift+M` | Toggle Auto/Manual mode |
| `Ctrl+Drag`   | Move the extension overlay |

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
