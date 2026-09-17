# Graph Report - NanoPro_extension  (2026-09-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 416 nodes · 677 edges · 48 communities (27 shown, 21 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `40f7d61c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Recent Changes (2026-09-17)
- **Bug Fix (index.js / `runAutoDetection`):** Page 1 table data was being erased when navigating to Page 2.
  - **Root Cause:** During a background poll after a page flip, the table for the new page (Page 2) hadn't loaded yet. The detector couldn't find the table and resolved the page number from stale `sidebarMemory.pageInfo` — which still reported Page 1. It then called `processAutoDetectedRows([], hasNoTable=true)` which overwrote `multiPageStore.pages[1]` with `hasNoTable: true`, erasing the confirmed table data.
  - **Fix:** Added two guards in `runAutoDetection`:
    1. If a **background poll** fails to find a table but the page already has confirmed table data → silently return (don't overwrite).
    2. If the **resolved pageNum is stale** (differs from `lastObservedPageNum`) → skip the tableless write to protect stored data.

## Community Hubs (Navigation)
- design_system.py
- index.js
- manifest.json
- verify_all.py
- PerformanceChecker
- sidebar_validation_test.js
- checklist.py
- commands
- evaluateSidebarValidation
- run_full_scan
- convert_rules.py
- i18n_checker.py
- session_manager.py
- BM25
- main
- find_web_pages
- seo_checker.py
- auto_preview.py
- schema_validator.py
- accessibility_checker.py
- UXAuditor
- lint_runner.py
- check_python_coverage
- MobileAuditor
- test_runner.py
- testSidebarScrollingMemory
- get_summary
- testColumnIsolationAndStrictHeaders
- testResilientMultiPageDetectionAndDynamicDiscovery
- testSingleFilePageActivationVsFileListSuppression
- testInvoiceNumberPartitioning
- capture.js
- observer.js
- parser.js
- scanner.js
- selector.js
- suggester.js
- tableParser.js
- validator.js
- badge.js
- overlay.js
- panel.js
- testMultiPageErrorTracking
- testPageWithoutTable
- testPanelRenderSafeWithEmptyValidRows
- testPrioritizedPageDetection
- testThreeNavigationTrackingMethods

## God Nodes (most connected - your core abstractions)
1. `runAutoDetection()` - 13 edges
2. `handleFullRefresh()` - 12 edges
3. `DesignSystemGenerator` - 11 edges
4. `PerformanceChecker` - 11 edges
5. `checkNavigationAndPageFlip()` - 11 edges
6. `initialize()` - 11 edges
7. `processAutoDetectedRows()` - 11 edges
8. `processSelection()` - 11 edges
9. `setupScrollCapture()` - 10 edges
10. `toggleMode()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `NanoProAutoDetector` --indirect_call--> `isSameDocumentInstance()`  [INFERRED]
  src/content/autoDetector.js → src/content/index.js
- `_generate_intelligent_overrides()` --calls--> `search()`  [EXTRACTED]
  .agent/.shared/ui-ux-pro-max/scripts/design_system.py → .agent/.shared/ui-ux-pro-max/scripts/core.py

## Import Cycles
- None detected.

## Communities (48 total, 21 thin omitted)

### Community 0 - "design_system.py"
Cohesion: 0.07
Nodes (37): detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search stack-specific guidelines, search() (+29 more)

### Community 1 - "index.js"
Cohesion: 0.15
Nodes (46): attachItemNoValidation(), attachSidebarValidation(), attachTotalValidation(), boot(), checkNavigationAndPageFlip(), checkSidebarErrorRecovery(), checkSidebarWatchAndRecovery(), cleanup() (+38 more)

### Community 2 - "manifest.json"
Cohesion: 0.09
Nodes (22): action, default_icon, default_title, author, background, service_worker, content_scripts, 16 (+14 more)

### Community 3 - "verify_all.py"
Cohesion: 0.18
Nodes (17): Colors, main(), print_error(), print_final_report(), print_header(), print_step(), print_success(), print_warning() (+9 more)

### Community 4 - "PerformanceChecker"
Cohesion: 0.15
Nodes (9): main(), PerformanceChecker, Check for data fetching in useEffect (Section 4), Check for missing React.memo, useMemo, useCallback (Section 5), Check for unoptimized images (Section 6), Generate final report, Check for sequential await patterns (Section 1), Check for barrel imports (Section 2) (+1 more)

### Community 5 - "sidebar_validation_test.js"
Cohesion: 0.11
Nodes (9): assert, evaluateItemNoValidation(), testItemNoWhitespaceProhibition(), testMultiPageTotalPlacement(), testPageTransitionWithTablelessPage(), testPeriodicTableRecheckEvery1to2Seconds(), testSidePanelScrollThreshold(), testTablelessPageAccumulationAndStateIsolation() (+1 more)

### Community 6 - "checklist.py"
Cohesion: 0.27
Nodes (14): check_script_exists(), Colors, main(), print_error(), print_header(), print_step(), print_success(), print_summary() (+6 more)

### Community 7 - "commands"
Cohesion: 0.19
Nodes (15): commands, reset-extension, start-selection, toggle-mode, toggle-panel, description, suggested_key, description (+7 more)

### Community 8 - "evaluateSidebarValidation"
Cohesion: 0.18
Nodes (9): evaluateSidebarValidation(), testCrossDocumentEnvironmentMemory(), testEnvironmentExtractionResilienceAndRefreshRewatch(), testFullReverificationAndSidebarRecoveryGating(), simulateHandleFullRefresh(), simulateRecoveryCheck(), testSidebarAutoTurnOffAndReEditRewatch(), isSidebarErrorOrCautionActive() (+1 more)

### Community 9 - "run_full_scan"
Cohesion: 0.27
Nodes (12): main(), Any, Validate no hardcoded secrets (OWASP A04). Checks: API keys, tokens, passwords,…, Validate dangerous code patterns (OWASP A05). Checks: Injection risks, XSS,…, Validate security configuration (OWASP A02). Checks: Security headers, CORS,…, Execute security validation scans., Validate supply chain security (OWASP A03). Checks: npm audit, lock file…, run_full_scan() (+4 more)

### Community 10 - "convert_rules.py"
Cohesion: 0.27
Nodes (11): generate_section_file(), group_rules_by_section(), main(), parse_frontmatter(), parse_rule_file(), Path, Group all rules by their section prefix, Generate a merged section file (+3 more)

### Community 11 - "i18n_checker.py"
Cohesion: 0.29
Nodes (10): check_hardcoded_strings(), check_locale_completeness(), find_locale_files(), flatten_keys(), main(), Path, Flatten nested dict keys., Check for hardcoded strings in code files. (+2 more)

### Community 12 - "session_manager.py"
Cohesion: 0.50
Nodes (8): analyze_package_json(), count_files(), detect_features(), get_project_root(), main(), print_status(), Any, Path

### Community 13 - "BM25"
Cohesion: 0.28
Nodes (5): BM25, BM25 ranking algorithm for text search, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query

### Community 14 - "main"
Cohesion: 0.39
Nodes (8): check_api_code(), check_openapi_spec(), find_api_files(), main(), Path, Find API-related files., Check OpenAPI/Swagger specification., Check API code for common issues.

### Community 15 - "find_web_pages"
Cohesion: 0.39
Nodes (8): check_page(), find_web_pages(), is_page_file(), main(), Path, Check a single web page for GEO elements., Check if this file is likely a public-facing page., Find public-facing web pages only.

### Community 16 - "seo_checker.py"
Cohesion: 0.39
Nodes (8): check_page(), find_pages(), is_page_file(), main(), Path, Check if this file is likely a public-facing page., Find page files to check., Check a single page for SEO issues.

### Community 17 - "auto_preview.py"
Cohesion: 0.54
Nodes (7): get_project_root(), get_start_command(), is_running(), main(), start_server(), status_server(), stop_server()

### Community 18 - "schema_validator.py"
Cohesion: 0.48
Nodes (6): find_schema_files(), main(), Path, Find database schema files., Validate Prisma schema file., validate_prisma_schema()

### Community 19 - "accessibility_checker.py"
Cohesion: 0.48
Nodes (6): check_accessibility(), find_html_files(), main(), Path, Find all HTML/JSX/TSX files., Check a single file for accessibility issues.

### Community 21 - "lint_runner.py"
Cohesion: 0.48
Nodes (6): detect_project_type(), main(), Path, Detect project type and available linters., Run a single linter and return results., run_linter()

### Community 22 - "check_python_coverage"
Cohesion: 0.48
Nodes (6): check_python_coverage(), check_typescript_coverage(), main(), Path, Check TypeScript type coverage., Check Python type hints coverage.

### Community 24 - "test_runner.py"
Cohesion: 0.48
Nodes (6): detect_test_framework(), main(), Path, Detect test framework and commands., Run tests and return results., run_tests()

### Community 25 - "testSidebarScrollingMemory"
Cohesion: 0.33
Nodes (3): NanoProAutoDetector, testDocumentInstanceMatching(), testSidebarScrollingMemory()

### Community 26 - "get_summary"
Cohesion: 0.50
Nodes (4): get_summary(), Run Lighthouse audit on URL., Generate summary based on scores., run_lighthouse()

### Community 29 - "testSingleFilePageActivationVsFileListSuppression"
Cohesion: 0.83
Nodes (4): testSingleFilePageActivationVsFileListSuppression(), checkIsSingleFilePage(), isAppNanonets(), simulateNavigation()

## Knowledge Gaps
- **34 isolated node(s):** `Colors`, `Colors`, `default_title`, `author`, `service_worker` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NanoProAutoDetector` connect `testSidebarScrollingMemory` to `index.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `isSameDocumentInstance()` connect `index.js` to `testSidebarScrollingMemory`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `testSidebarScrollingMemory()` connect `testSidebarScrollingMemory` to `evaluateSidebarValidation`, `sidebar_validation_test.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `handleFullRefresh()` (e.g. with `boot()` and `initialize()`) actually correct?**
  _`handleFullRefresh()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Colors`, `Colors`, `default_title` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `design_system.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06560283687943262 - nodes in this community are weakly interconnected._
- **Should `manifest.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._