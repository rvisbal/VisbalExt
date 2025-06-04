Visbal Extension UI
│
├── Top Tab Bar
│   ├── Apex Log (tab)
│   ├── SOQL (tab)
│   └── Execute Apex (tab)
│
├── Left Side Panel
│   └── Visbal Test
│       └── Test Classes
│           ├── Test Case List Dropdown
│           ├── Select All Checkbox
│           ├── Execution Mode Selector (e.g., Parallel)
│           ├── Run/Stop Buttons
│           ├── Error Display (if any)
│           └── List of Test Classes
│               ├── AnyObjectRollerUpperTest
│               ├── BridgeSelectorTest
│               ├── CacheManagerTest
│               └── ... (other test classes)
│
└── Context Menu (on code selection)
    ├── Show Git History for Selection
    ├── Go to Definition
    └── Go to References

# 1. Apex Log (Tab/Panel)

**Main View/Panel:**
- `src/views/apexLogTab.ts` — main logic for the Apex Log panel
- `src/views/apexLogTabHTML.ts` — HTML template for the webview

**Supporting Services/Utils:**
- `src/services/cacheService.ts` — log caching
- `src/services/sfdxService.ts` — Salesforce CLI interaction
- `src/services/orgListCacheService.ts` — org list caching
- `src/services/statusBarService.ts` — status bar updates
- `src/utils/orgUtils.ts` — org utilities
- `src/types/salesforceLog.ts` — log type definitions

# 2. SOQL (Tab/Panel)

**Main View/Panel:**
- `src/views/soqlPanelView.ts` — main logic for SOQL panel

**Supporting Services/Utils:**
- `src/services/metadataService.ts` — SOQL execution
- `src/services/orgListCacheService.ts`
- `src/services/sfdxService.ts`
- `src/utils/orgUtils.ts`

# 3. Execute Apex (Tab/Panel)

**Main View/Panel:**
- `src/views/samplePanelView.ts` — main logic for Execute Apex panel

**Supporting Services/Utils:**
- `src/services/metadataService.ts` — Apex execution
- `src/services/orgListCacheService.ts`
- `src/services/sfdxService.ts`
- `src/utils/orgUtils.ts`

# 4. Visbal Test (Left Side Panel)

**Test Class Explorer:**
- `src/views/testClassExplorerView.ts` — main logic for test class explorer
- `src/views/testRunResultsView.ts` — test run results tree
- `src/views/testResultsView.ts` — test results panel
- `src/views/testSummaryView.ts` — test summary panel

**Supporting Services/Utils:**
- `src/services/metadataService.ts` — test class/method discovery
- `src/services/storageService.ts` — test class/method caching
- `src/services/sfdxService.ts` — test execution
- `src/services/statusBarService.ts`
- `src/utils/orgUtils.ts`
- `src/models/testCaseList.ts` — test case list management
- `src/types/testClass.ts` — test class type definitions

# 5. Menu Selection: "Show Git History for Selection"

**Context Menu/Command:**
- `src/views/gitHistoryView.ts` — webview for git history
- `src/services/gitService.ts` — fetches git history for selection

# Shared/Supporting Files
- `src/extension.ts` — registers all views, commands, and providers
- `src/models/logInterfaces.ts` — interfaces for logs, tabs, etc.
- `src/utils/logParsingUtils.ts` — log parsing for display
- `src/utils/debugConfigUtils.ts` — debug config utilities
- `src/types/salesforceTypes.ts` — Salesforce type definitions