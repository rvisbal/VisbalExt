# Visbal Extension Architecture

## UI Structure Overview

```
Visbal Extension UI
│
├── Top Tab Bar (Panel Views)
│   ├── Orgs (tab) - Salesforce Organizations Management
│   ├── Apex Log (tab) - Log Analysis and Debugging
│   ├── SOQL (tab) - SOQL Query Execution
│   └── Execute Apex (tab) - Apex Code Execution
│
├── Left Side Panel (Activity Bar)
│   └── Visbal Test
│       ├── Test Classes (webview) - Test Class Explorer
│       ├── Running Tasks (tree view) - Test Execution Status
│       └── Test Summary (webview) - Test Results Summary
│
├── Debug Panel (when in debug mode)
│   └── Test Results (webview) - Debug-specific test results
│
└── Context Menus
    ├── Editor Context - Git History for Selection/File
    ├── Explorer Context - Git History for File
    └── Tab Context - Git History for File
```

## Core Architecture Components

### Essential Requirements

#### `extension.ts`
- **VS Code requires this file to exist**
- Contains the `activate()` function that VS Code calls
- Registers the basic UI components

#### `package.json`
- **VS Code requires this for extension metadata**
- Defines activation events, commands, and UI structure
- Lists dependencies and build scripts

### 1. Extension Entry Point (`src/extension.ts`)

**Purpose**: The bridge between your extension and VS Code

**Key Responsibilities**:
- Registers views in the right places
- Handles VS Code's lifecycle (activate/deactivate)
- Manages subscriptions and cleanup
- Coordinates with VS Code's command system

**Summary**:
- Sets up the environment (logging, services, etc.)
- Registers all the features (UI, commands, etc.)
- Handles the lifecycle (startup, shutdown, configuration changes)
- Coordinates everything (makes sure all parts work together)

### 2. Extension Manifest (`package.json`)

**Purpose**: The "ID card" and "instruction manual" for your VS Code extension. It tells VS Code everything it needs to know about your extension and how to use it.

#### Extension Identity & Metadata
```json
{
    "name": "visbal-ext",
    "displayName": "Visbal Extension",
    "version": "0.1.0",
    "publisher": "visbal"
}
```
- **Name**: How VS Code identifies your extension internally
- **Display Name**: What users see in the marketplace and UI
- **Version**: Tracks updates and compatibility
- **Publisher**: Who made it (important for marketplace)

#### What It Does (Description & Categories)
```json
"description": "A Visual Studio Code extension for Salesforce development...",
"categories": ["Other", "Testing", "Debuggers"],
"keywords": ["salesforce", "apex", "testing", "logs", "debug"]
```
- **Description**: Tells users what your extension does
- **Categories**: Helps users find it in the marketplace
- **Keywords**: Makes it searchable

#### Activation Triggers
```json
"activationEvents": [
    "onStartupFinished",
    "onView:testClassExplorerView",
    "workspaceContains:**/.sfdx/sfdx-config.json"
]
```
- **onStartupFinished**: Load after VS Code starts
- **onView:testClassExplorerView**: Load when someone opens the test explorer
- **workspaceContains:**/.sfdx/sfdx-config.json**: Only load in Salesforce projects

#### UI Definition (The Visual Stuff)
```json
"viewsContainers": {
    "panel": [
        {
            "id": "visbal-orgs-container",
            "title": "Orgs",
            "icon": "$(organization)"
        }
    ]
}
```
This defines where your UI appears:
- **Panel views**: The tabs at the top (Orgs, Apex Log, SOQL, Execute Apex)
- **Activity bar**: The left sidebar (Visbal Test)
- **Icons**: What users see in the interface

#### Commands (What Users Can Do)
```json
"commands": [
    {
        "command": "visbal-ext.showVisbalLog",
        "title": "Show Visbal Log",
        "category": "Visbal"
    }
]
```
This registers all the actions users can take:
- Commands that show panels
- Git history commands
- Test execution commands
- Context menu options

#### Menus (Where Commands Appear)
```json
"menus": {
    "editor/context": [
        {
            "command": "visbal-ext.showGitHistoryForSelection",
            "when": "editorHasSelection"
        }
    ]
}
```
This puts commands in the right places:
- **Context menus**: Right-click options
- **View titles**: Buttons in panel headers
- **Editor title**: Buttons in editor tabs

#### Configuration (User Settings)
```json
"configuration": {
    "properties": {
        "visbal.modules.testExplorer.enabled": {
            "type": "boolean",
            "default": true
        }
    }
}
```
This creates user settings:
- Module enable/disable options
- Logging preferences
- Test execution settings
- Default behaviors

#### Dependencies (What It Needs)
```json
"dependencies": {
    "@salesforce/core": "^6.5.2",
    "jsforce": "^1.11.1"
}
```
This lists what your extension needs to work:
- Salesforce libraries
- HTTP clients
- UI components

## MODULES

### 1. Extension Entry Point
- **`src/extension.ts`** — Main extension activation, view registration, and command handling
  - Manages module enablement based on configuration
  - Registers all webview providers and tree views
  - Handles command registration and context menu integration
  - Initializes services and manages extension lifecycle

### 2. Panel Views (Top Tab Bar)

#### Orgs Panel
- **`src/views/orgTab.ts`** — Main logic for Salesforce organizations management
- **`src/views/orgTabHtml.ts`** — HTML template for the webview
- **`src/views/orgTabUtils.ts`** — Utility functions for org operations

#### Apex Log Panel
- **`src/views/apexLogTab.ts`** — Main logic for Apex log analysis (2,270 lines)
- **`src/views/apexLogTabHTML.ts`** — HTML template for the webview (1,911 lines)
- **`src/views/logDetailView.ts`** — Log detail view implementation
- **`src/views/logDetailHTML.ts`** — Log detail HTML template
- **`src/views/logDetailExecution.ts`** — Log execution details
- **`src/views/logDetailRawHandler.ts`** — Raw log data handling

#### SOQL Panel
- **`src/views/soqlTab.ts`** — Main logic for SOQL query execution
- **`src/views/soqlTabHTML.ts`** — HTML template for the webview

#### Execute Apex Panel
- **`src/views/executeApexTab.ts`** — Main logic for Apex code execution
- **`src/views/executeApexTabHTML.ts`** — HTML template for the webview

### 3. Side Panel Views (Activity Bar)

#### Test Class Explorer
- **`src/views/testClassExplorerSidePanel.ts`** — Main test class explorer (4,274 lines)
  - Test class discovery and management
  - Test method selection and execution
  - Integration with test running and summary views

#### Test Running Tasks
- **`src/views/testRunningTaskSidePanel.ts`** — Tree view for test execution status
  - Real-time test execution monitoring
  - Test result tracking and display

#### Test Summary
- **`src/views/testSummarySidePanel.ts`** — Test results summary panel
  - Test execution results display
  - Performance metrics and statistics

### 4. Debug Views
- **`src/views/debugConsoleView.ts`** — Debug console implementation
- **`src/views/gitHistoryView.ts`** — Git history display (1,505 lines)

### 5. Core Services

#### API and Data Services
- **`src/services/salesforceApiService.ts`** — Salesforce REST API integration (643 lines)
- **`src/services/metadataService.ts`** — Salesforce metadata operations (894 lines)
- **`src/services/sfdxService.ts`** — SFDX CLI integration (1,461 lines)
- **`src/services/gitService.ts`** — Git operations and history (346 lines)

#### Caching and Storage
- **`src/services/cacheService.ts`** — General caching functionality (228 lines)
- **`src/services/orgListCacheService.ts`** — Organization list caching (111 lines)
- **`src/services/storageService.ts`** — Extension storage management (197 lines)

#### Utility Services
- **`src/services/statusBarService.ts`** — Status bar updates and management (90 lines)
- **`src/services/loggingService.ts`** — Extension logging functionality (117 lines)

### 6. Utility Components

#### Core Utilities
- **`src/utils/orgUtils.ts`** — Organization utilities (951 lines)
- **`src/utils/logParsingUtils.ts`** — Log parsing and analysis utilities
- **`src/utils/debugConfigUtils.ts`** — Debug configuration utilities
- **`src/utils/webviewUtils.ts`** — Webview utility functions
- **`src/utils/execUtils.ts`** — Execution utilities

#### UI Components
- **`src/components/DebugBox.ts`** — Debug information display component (437 lines)
- **`src/components/OrgTable.ts`** — Organization table component (228 lines)

### 7. Data Models and Types

#### Models
- **`src/models/testCaseList.ts`** — Test case list management (137 lines)
- **`src/models/logInterfaces.ts`** — Log interface definitions (102 lines)

#### Type Definitions
- **`src/types/salesforceLog.ts`** — Salesforce log type definitions
- **`src/types/salesforceTypes.ts`** — Salesforce type definitions
- **`src/types/testClass.ts`** — Test class type definitions

### 8. Additional Components

#### Search and Navigation
- **`src/findModal.ts`** — Find modal implementation (144 lines)
- **`src/searchLibrary.ts`** — Search functionality (77 lines)
- **`src/logSummary.ts`** — Log summary functionality (637 lines)

#### Apex Templates
- **`src/apex/`** — Directory containing Apex code templates
  - `BATCH_MANY_FILTER.apex`
  - `DELETE_ALL_RECORDS.apex`
  - `DELETE_MASTER_ACCOUNTS.apex`
  - `SETUP_DISPLAY_TEST_FIELDS.apex`

#### Media and Styling
- **`src/media/`** — Media assets and styling
  - `debugPresetUtils.js`
  - `orgList.js`
  - `styles.css`

## Configuration and Commands

### Module Configuration
The extension supports enabling/disabling individual modules:
- `visbal.modules.testExplorer.enabled` - Test Explorer module
- `visbal.modules.logAnalyzer.enabled` - Log Analyzer module
- `visbal.modules.soqlQuery.enabled` - SOQL Query module
- `visbal.modules.samplePanel.enabled` - Execute Apex module
- `visbal.modules.orgs.enabled` - Organizations module

### Key Commands
- `visbal-ext.showVisbalLog` - Show Apex Log panel
- `visbal-ext.showVisbalSoql` - Show SOQL panel
- `visbal-ext.showVisbalSample` - Show Execute Apex panel
- `visbal-ext.showDebugConsole` - Show Debug Console
- `visbal-ext.showTestResults` - Show Test Results
- `visbal-ext.showLogSummary` - Show Log Summary
- `visbal-ext.showGitHistoryForSelection` - Git history for selection
- `visbal-ext.showGitHistoryForFile` - Git history for file
- `visbal-ext.rerunSelectedTests` - Rerun selected tests
- `visbal-ext.rerunAllTests` - Rerun all tests

## View Containers and Views

### Panel Views (Top Tabs)
- `visbal-orgs-container` - Organizations management
- `visbal-log-container` - Apex log analysis
- `visbal-soql-container` - SOQL query execution
- `visbal-apex-container` - Apex code execution

### Activity Bar Views (Left Side)
- `visbal-test-container` - Test management
  - `testClassExplorerView` - Test class explorer (webview)
  - `testRunResults` - Running tasks (tree view)
  - `visbal-test-summary` - Test summary (webview)

### Debug Views
- `visbal-test-results` - Test results in debug mode (webview)

## Dependencies

### Core Dependencies
- `@salesforce/core` - Salesforce core functionality
- `@vscode/codicons` - VS Code icons
- `axios` - HTTP client
- `jsforce` - Salesforce JavaScript library
- `highlight.js` - Syntax highlighting

### Development Dependencies
- TypeScript, Jest, ESLint for development
- Webpack for bundling
- VS Code extension development tools