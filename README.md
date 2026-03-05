# 🧮 NanoPro Validator

> Chrome/Edge extension that validates invoice line item calculations on Nanonets review pages.

![Version](https://img.shields.io/badge/version-2.0.2-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-gray)

---

## 🆕 What's New in 2.0.2
- **Bug Fix**: Line amount is now correctly detected in tables with only 1 row (resolved wide-column alignment issue).
- **Draggable UI**: Hold `Ctrl` and drag anywhere on the overlay to reposition it.
- **Resizable Panel**: Drag the bottom-right corner of the summary panel to resize.
- **Item_No Validation**: Adds a ⚠️ caution tag when `Item_No` is `-R`, blank, or missing.
- **Overlay Caution Indicator**: Badge overlay turns yellow and shows a blinking red dot on sum mismatch or Item_No caution.
- **Smart Auto-Recalculation**: Auto mode now pairs DOM mutation observers with a non-intrusive background polling engine that instantly drops cycles if table inputs haven't fundamentally changed, eliminating UI lag.

---

## ✨ Features

- **Dual Mode** — Automatic detection or manual table selection
- **Auto Detection** — Column-first DOM analysis finds Qty, Price, Amount automatically
- **Invoice Total Validation** — Compares sum of line amounts against sidebar `invoice_amount`
- **Item_No Validation** — Flags rows where `Item_No` is `-R`, blank, or missing with ⚠️ caution
- **Visual Table Selection** — Snipping-tool-like interface for manual mode
- **Draggable UI** — Hold `Ctrl` and drag to reposition the extension overlay
- **Resizable Panel** — Drag the bottom-right corner to adjust the details panel
- **Smart Column Detection** — Identifies Qty, Item_Price, Line_Amount from MUI headers
- **Multi-Row Validation** — Validates all rows: `Qty × Price = Amount`
- **Intelligent Suggestions** — Correction recommendations with confidence scores
- **Non-Intrusive** — Operates entirely through content script DOM reads (invisible to the page)
- **Keyboard Shortcuts** — Quick access without mouse
- **Auto-Reset** — Resets automatically on SPA page navigation

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
3. Extension automatically detects the table and validates all rows
4. Invoice total is compared against sidebar `invoice_amount`

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

| Badge | Color | Meaning |
|-------|-------|---------|
| 📐 Click to Select | Purple | Ready to scan (manual mode) |
| ✂️ Select Table Area | Cyan | Selection mode active |
| 🔄 Validating... | Blue | Processing |
| ✅ X/X Valid | Green | All calculations correct |
| ❌ X Errors Found | Red | Some calculations incorrect |
| ⚠️ Incomplete Data | Orange | Missing values in some rows |
| ⚠️ Item_No Caution | Orange | Item_No is `-R`, blank, or missing |

### Panel Display
- **Summary Bar**: Count of valid/invalid rows
- **Each Row**: `Qty × Price = Amount` with status icon
- **Item_No Caution**: ⚠️ tag on rows where `Item_No` is `-R` (any spacing), blank, or column not found
- **Invoice Total**: Sum of line amounts vs `invoice_amount` (✅ Match / ❌ Mismatch)

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
  <strong>NanoPro Validator v2.0.0</strong><br>
  Built with ❤️ for invoice validation accuracy
</p>
