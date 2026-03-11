# System Design: NanoPro v3 Dynamic Validation Engine

**Goal:** Create a scalable, robust validation engine that handles complex, seller-specific rules for 100+ independent users. The system must reduce manual validation effort, remain 100% non-intrusive to the Nanonets React SPA, and provide an intuitive way to manage rules.

## 1. Architectural Overview

To support a large user base with varying Nanonets configurations (different OCR templates, different seller rules), the validation engine must be entirely separated from the DOM-reading logic. 

**Core Components:**
1. **Rule Engine Core (`validator.js`)**: A standalone JavaScript module that evaluates a JSON-based schema of rules against extracted data.
2. **Data Aggregator (`autoDetector.js`)**: Gathers all fields from the Nanonets UI. Crucially, it will now also hook into the **Nanonets Native JSON View** (if available) to pull high-fidelity data, falling back to DOM scraping when necessary.
3. **Rule Storage (`chrome.storage.sync` / `local`)**: Stores the user's rule configurations. `sync` allows rules to roam securely across a user's logged-in Chrome browsers.
4. **Options UI (`options.html/js`)**: A dedicated extension settings page allowing users to build, import, and export rules visually or via raw JSON.

---

## 2. The Rule Schema (JSON)

The heart of the system is a deterministic JSON schema.

### Rule Types
- **Global Rules:** Apply to every invoice, regardless of seller (e.g., `invoice_date` cannot be null).
- **Seller-Specific Rules:** Apply only when `seller_name` matches a trigger condition (Regex or exact match).
- **Conditional (IF/THEN) Rules:** Complex cross-field validation.

### Example Schema Design
```json
{
  "version": "1.0",
  "global": [
    { "field": "invoice_date", "condition": "not_null" },
    { "field": "invoice_amount", "condition": "is_numeric" },
    { "field": "is_rental", "condition": "all_match" } 
  ],
  "sellers": [
    {
      "trigger": { "field": "seller_name", "match": "regex", "value": "(?i).*Home Depot.*" },
      "rules": [
        { "field": "supplier_account", "condition": "regex", "value": "^HD-\\d+$" },
        { 
          "type": "conditional",
          "if": { "field": "temp_route", "condition": "contains", "value": "rent" },
          "then": { "field": "is_rental", "condition": "equals", "value": "True" }
        }
      ]
    }
  ]
}
```

---

## 3. Data Extraction Pipeline (Leveraging Nanonets JSON)

Currently, the extension relies entirely on DOM selectors, which are fragile. Nanonets provides a native JSON view of the extracted data.

**New Extraction Strategy:**
1. **Attempt JSON Hook:** Analyze the Nanonets React state (if accessible safely via a background proxy or by reading the payload of XHR/fetch requests via a `devtools` or `declarativeNetRequest` background worker, though XHR interception is intrusive—so we must evaluate this carefully).
2. **DOM Fallback:** If the JSON data payload cannot be read *non-intrusively*, fall back to an aggressive DOM DOM scrape of the `input` attributes.
3. **Data Normalization:** Output a flat key-value dictionary (e.g., `{ "seller_name": "Home Depot", "is_rental": ["True", "True"] }`) that the Rule Engine Core can process.

---

## 4. Addressing V3 Features Non-Intrusively & Backward Compatibility

- **Non-Breaking Previous Extension Elements:** The existing `validateAll()` mathematical check (Qty * Price = Amount) will act as the "Base Validation Payload". The new Dynamic Rule Engine will be an *additive layer*. If no rules are defined in the schema, the extension behaves exactly like v2/v3-alpha.
- **Undetectable:** The extension will continue to use `document_idle` injection and Shadow DOM isolation. It will not mutate the Nanonets React state tree directly.

---

## 5. Development Sprints (Roadmap)

### Sprint 1: Engine Foundation & Data Normalization
- Refactor `autoDetector.js` to extract *all* visible fields on the left pane (not just tables).
- Create a `normalizer.js` to convert the chaotic DOM state into a clean `{key: value}` dictionary.
- Create the core `RuleEvaluator` class that can parse the proposed JSON schema.
- **Deliverable:** The extension can read a hardcoded JSON schema and flag arbitrary fields on the UI without breaking the existing math checks.

### Sprint 2: Storage & Importing
- Integrate `chrome.storage.sync`.
- Build a basic `options.html` page where a power user can paste a raw JSON string of rules.
- Implement an Import/Export feature so teams can share rule configurations easily file by file.
- **Deliverable:** Users can dynamically update their ruleset without republishing the extension.

### Sprint 3: Visual Rule Builder UI
- Build a React or Vanilla JS drag-and-drop interface in the Options page.
- Users can click "Add Rule", select a field from a dropdown, choose an operator (`Equals`, `Contains`, `Regex`), and set the target.
- **Deliverable:** A no-code interface for configuring the JSON schema.

### Sprint 4 (Optional/AI Add-on): Natural Language Rule Generation
- Add an OpenAI API key input field in the Options page.
- "Type a rule in English" -> LLM generates the exact JSON schema required and saves it.
- **Deliverable:** Maximum flexibility where the LLM does the configuration, but the local engine executes the rules instantly in 0ms.
