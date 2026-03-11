
---

# PRD — Nanonets Single File Page Detection (Chrome Extension)

## 1. Overview

Implement a **high-performance page detection system** for a Chrome extension that runs **only on Nanonets OCR single-file pages**.

The extension must:

* Activate **only on single file view**
* Ignore **file list pages**
* Detect **SPA navigation (URL changes without reload)**
* Execute **instantly and efficiently**
* Avoid unnecessary DOM observers or heavy polling

Target domain:

```
https://app.nanonets.com
```

---

# 2. Problem

Nanonets is a **Single Page Application (SPA)** using **hash routing**.

Navigation happens via:

```
window.location.hash
```

Examples:

### Single File Page

```
#/ocr/test/{modelId}/{fileId}
```

Example:

```
#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39/fa84f094-1667-11f1-93aa-a6667fa9940c
```

### File List Page

```
#/ocr/test/{modelId}
```

Example:

```
#/ocr/test/9dc157f9-363e-4456-bfc4-039cc7f16d39
```

Chrome extensions **cannot target hash routes directly via manifest match patterns**, so detection must be done **inside the content script**.

---

# 3. Goal

Run extension logic **only when the URL matches**:

```
#/ocr/test/{modelId}/{fileId}
```

And **never run on**:

```
#/ocr/test/{modelId}
```

Also detect navigation when users:

* open files
* go back to list
* switch between files

without page reload.

---

# 4. Functional Requirements

### FR1 — URL Pattern Detection

The extension must detect:

```
#/ocr/test/{modelId}/{fileId}
```

Pattern rule:

```
^#/ocr/test/[^/]+/[^/?]+
```

Where:

* `{modelId}` = UUID
* `{fileId}` = UUID

---

### FR2 — Initial Page Load Detection

When the content script loads, it must immediately check if the current page is a **single file page**.

---

### FR3 — SPA Navigation Detection

The extension must detect **URL changes without page reload**.

Required triggers:

* `hashchange`
* `history.pushState`
* `history.replaceState`

---

### FR4 — Debounced Execution

Ensure extension logic runs **only once per page state**.

Avoid repeated executions caused by multiple navigation events.

---

# 5. Non-Functional Requirements

### Performance

The detection system must:

* Run in **<1ms**
* Avoid heavy DOM observers
* Avoid continuous polling
* Avoid unnecessary memory allocations

Use **simple string/regex matching**.

---

### Reliability

Must work even if:

* Nanonets updates UI
* DOM structure changes
* React components rerender

URL detection must **not rely on DOM structure**.

---

### Idempotency

Extension logic must run **only once per file page load**.

If the user navigates between files, logic must re-run.

---

# 6. Architecture

```
content script
     │
     ├── url detector
     │
     ├── navigation listener
     │
     └── extension feature initializer
```

---

# 7. Implementation Specification

## 7.1 Manifest

```json
{
  "manifest_version": 3,
  "name": "Nanonets Helper",
  "version": "1.0",
  "content_scripts": [
    {
      "matches": ["https://app.nanonets.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

---

# 7.2 URL Detection Utility

```javascript
function isSingleFilePage() {
  const hash = window.location.hash;
  return /^#\/ocr\/test\/[^/]+\/[^/?]+/.test(hash);
}
```

This ensures detection of:

```
#/ocr/test/modelId/fileId
```

---

# 7.3 Navigation Observer

Implement a lightweight **URL change observer**.

```javascript
let lastUrl = location.href;

function detectNavigation() {
  const currentUrl = location.href;

  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    handlePageChange();
  }
}
```

---

# 7.4 Event Hooks

Attach listeners to detect SPA navigation.

```javascript
window.addEventListener("hashchange", detectNavigation);

const pushState = history.pushState;
history.pushState = function () {
  pushState.apply(history, arguments);
  detectNavigation();
};

const replaceState = history.replaceState;
history.replaceState = function () {
  replaceState.apply(history, arguments);
  detectNavigation();
};
```

---

# 7.5 Page Handler

```javascript
let initializedForFile = null;

function handlePageChange() {
  if (!isSingleFilePage()) return;

  const hash = location.hash;

  if (hash === initializedForFile) return;

  initializedForFile = hash;

  initializeExtension();
}
```

---

# 7.6 Extension Entry Point

```javascript
function initializeExtension() {
  console.log("Single file page detected");

  // extension logic here
}
```

---

# 8. Execution Flow

```
content script loads
        │
        ▼
check URL
        │
        ▼
if single file page
        │
        ▼
initialize extension
        │
        ▼
listen for SPA navigation
        │
        ▼
if URL changes
        │
        ▼
re-evaluate page type
```

---

# 9. Production Optimization Tips

### Use Regex Instead of Split

Regex is faster and cleaner than multiple `.split()` operations.

Preferred:

```
regex.test(hash)
```

Avoid:

```
hash.split("/")
```

---

### Avoid MutationObserver

React apps re-render frequently. DOM observers can cause **performance degradation**.

URL detection is **more reliable and faster**.

---

### Guard Against Duplicate Initialization

Always track the **current file hash**.

```
initializedForFile
```

This prevents:

* duplicate injections
* repeated UI creation
* performance issues

---

### Use document_idle

Ensures React UI loads first.

```
run_at: document_idle
```

Prevents race conditions.

---

### Keep Detection Logic Stateless

Avoid storing complex state or DOM references.

Only track:

```
lastUrl
initializedForFile
```

---

# 10. Success Criteria

The extension must:

✔ Run only on:

```
#/ocr/test/{modelId}/{fileId}
```

✔ Never run on:

```
#/ocr/test/{modelId}
```

✔ Detect SPA navigation instantly

✔ Execute logic only once per file page

✔ Have negligible performance overhead

---
