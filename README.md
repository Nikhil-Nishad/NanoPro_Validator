# 🧮 NanoPro Validator

> Chrome/Edge extension that validates invoice line item calculations on Nanonets review pages.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-gray)

---

## ✨ Features

- **Visual Table Selection** — Snipping-tool-like interface to select invoice tables
- **Smart Column Detection** — Automatically identifies Qty, Item_Price, Line_Amount columns
- **Fuzzy Matching** — Tolerates OCR errors in column headers
- **Multi-Row Validation** — Validates all rows simultaneously
- **Live Calculations** — Shows expected vs actual with large, readable display
- **Intelligent Suggestions** — Provides correction recommendations with confidence scores
- **Keyboard Shortcuts** — Quick access without mouse
- **Auto-Reset** — Resets automatically when navigating between documents

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

### Method 1: Click the Badge
1. Look for the purple **📐 Click to Select Table** badge at the top of the page
2. Click the badge or refresh button
3. Drag to select the table area containing line items
4. Release to validate

### Method 2: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | Start table selection |
| `Alt+Shift+V` | Toggle validation panel |
| `Alt+Shift+R` | Reset extension state |

### Method 3: Extension Icon
Click the NanoPro icon in your browser toolbar to start selection.

---

## 📊 Understanding Results

### Badge States

| Badge | Color | Meaning |
|-------|-------|---------|
| 📐 Click to Select | Purple | Ready to scan |
| ✂️ Select Table Area | Cyan | Selection mode active |
| 🔄 Validating... | Blue | Processing |
| ✅ X/X Valid | Green | All calculations correct |
| ❌ X Errors Found | Red | Some calculations incorrect |
| ⚠️ Incomplete Data | Orange | Missing values in some rows |

### Panel Display
- **Summary Bar**: Shows count of valid/invalid rows
- **Each Row**: Displays `Qty × Price = Amount` with large 18px font
- **Valid Rows**: Green checkmark with confirmed calculation
- **Invalid Rows**: Red X with expected value and correction suggestions

---

## 📁 Project Structure

```
NanoPro_extension/
├── manifest.json           # Extension configuration (MV3)
├── README.md               # This file
│
├── src/
│   ├── background.js       # Service worker for keyboard shortcuts
│   │
│   ├── content/            # Content scripts (run on Nanonets pages)
│   │   ├── index.js        # Main entry point, orchestrates workflow
│   │   ├── parser.js       # Number parsing with format detection
│   │   ├── selector.js     # Region selection UI (snipping tool)
│   │   ├── capture.js      # DOM text extraction from selection
│   │   ├── tableParser.js  # Grid detection and column identification
│   │   ├── validator.js    # Calculation validation engine
│   │   ├── suggester.js    # Correction suggestion generator
│   │   ├── scanner.js      # [Legacy] Original DOM scanner
│   │   └── observer.js     # [Legacy] DOM mutation observer
│   │
│   └── ui/                 # User interface components
│       ├── overlay.js      # Shadow DOM container + all CSS
│       ├── badge.js        # Floating status badge
│       └── panel.js        # Results panel with suggestions
│
└── icons/                  # Extension icons
    ├── icon16.png          # Toolbar icon (16×16)
    ├── icon48.png          # Extension page icon (48×48)
    ├── icon128.png         # Chrome Web Store icon (128×128)
    └── *.svg               # SVG versions (backup)
```

### File Descriptions

| File | Purpose |
|------|---------|
| **manifest.json** | Chrome extension configuration with permissions, icons, keyboard shortcuts |
| **background.js** | Service worker that routes keyboard commands to content scripts |
| **index.js** | Main orchestrator: initializes UI, handles selection, triggers validation |
| **parser.js** | Parses numbers from various formats (currencies, decimals, negatives) |
| **selector.js** | Creates snipping-tool overlay for region selection |
| **capture.js** | Extracts text elements from DOM within selected region |
| **tableParser.js** | Groups text into rows/columns, identifies Qty/Price/Amount columns |
| **validator.js** | Validates `Qty × Price = Amount` with 0.05 tolerance |
| **suggester.js** | Generates correction suggestions with confidence scores |
| **overlay.js** | Shadow DOM isolation + all CSS styles |
| **badge.js** | Floating badge showing current state |
| **panel.js** | Expandable panel showing all validation results |

---

## ⚙️ Customization

### Removing Keyboard Shortcuts

To disable keyboard shortcuts, edit `manifest.json`:

```json
// REMOVE this entire "commands" section:
"commands": {
  "start-selection": {
    "suggested_key": { ... },
    "description": "..."
  },
  // ... other commands
}
```

Also optionally remove `src/background.js` and the background section:
```json
// REMOVE this section:
"background": {
  "service_worker": "src/background.js"
}
```

### Changing Keyboard Shortcuts

Edit the `suggested_key` values in `manifest.json`:

```json
"commands": {
  "start-selection": {
    "suggested_key": {
      "default": "Ctrl+Shift+S",  // Change this
      "mac": "Command+Shift+S"    // Mac-specific
    }
  }
}
```

### Adjusting Validation Tolerance

Edit `src/content/validator.js`:

```javascript
const CONFIG = {
  tolerance: 0.05,  // Change to 0.01 for stricter validation
  // ...
};
```

### Modifying UI Fonts

All styles are in `src/ui/overlay.js`. Search for font-size values:

```javascript
.nanopro-calc-large {
  font-size: 18px;  // Main calculation display
}
.nanopro-suggestion-text {
  font-size: 15px;  // Suggestion text
}
```

### Adding New Column Names

Edit `src/content/tableParser.js`:

```javascript
const PRIMARY_COLUMNS = {
  qty: ['qty', 'qty_ordered', 'quantity', 'your_column_name'],
  price: ['item_price', 'unit_price', 'your_price_column'],
  amount: ['line_amount', 'amount', 'your_amount_column']
};
```

---

## 🔧 Debugging

Open browser console (`F12` → Console) on a Nanonets page.

### Debug Commands

```javascript
NanoPro.select();              // Trigger selection manually
NanoPro.getResult();           // View last validation result
NanoPro.getLastSelection();    // View last selection coordinates
NanoPro.reset();               // Reset extension state
NanoPro.cleanup();             // Remove all UI elements

// Advanced debugging
NanoPro.debug.captureRegion(); // Re-capture last selection
NanoPro.debug.parseTable(arr); // Parse text elements array
```

### Console Logs

The extension logs detailed information:
- `[NanoPro]` — Main extension events
- `[NanoPro TableParser]` — Row/column detection details
- `[NanoPro Background]` — Keyboard command routing

---

## 🛡️ Safety Guarantees

1. **Read-Only** — Never modifies Nanonets page content
2. **Isolated UI** — Uses Shadow DOM to prevent CSS conflicts
3. **No External Requests** — All processing happens locally
4. **No Data Storage** — Nothing persisted to disk
5. **Minimal Permissions** — Only `activeTab` permission required

---

## 🐛 Troubleshooting

### Badge not appearing
- Ensure you're on a `*.nanonets.com` page
- Reload the extension from `chrome://extensions`
- Check console for errors

### Columns not detected
- Ensure headers are visible in selection
- Expected headers: `Qty`, `Item_Price`, `Line_Amount`
- Check console for column mapping debug output

### Keyboard shortcuts not working
- Go to `chrome://extensions/shortcuts`
- Verify NanoPro shortcuts are assigned
- Check for conflicts with other extensions

### Wrong calculations shown
- Verify the selection includes column headers
- Check if columns are being correctly identified in console
- Try making a more precise selection

---

## 📜 License

MIT License — Free for personal and commercial use.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test on Nanonets pages
5. Submit a pull request

---

<p align="center">
  <strong>NanoPro Validator v1.1.0</strong><br>
  Built with ❤️ for invoice validation accuracy
</p>
