# Visbal Extension for VS Code

A comprehensive Visual Studio Code extension that enhances Salesforce development with advanced test execution, log analysis, code navigation, and development workflow capabilities.

## Features

### Test Class Explorer & Execution
- **Test Class Management**: View and manage Apex test classes in a dedicated sidebar
- **Flexible Test Execution**: Run individual test methods, entire test classes, or batch run multiple tests
- **Smart Test Detection**: Auto-detect and run tests from cursor position with `Ctrl+Shift+T`
- **Test Results & Logs**: View detailed test results with comprehensive logs
- **Test Method Caching**: Cache test methods for improved performance
- **Multi-select Operations**: Select and run multiple tests simultaneously
- **Test Result Export**: Export test results to files for reporting
- **Code Coverage**: Toggle code coverage collection for test runs
- **Failed Test Re-run**: Quickly re-run only failed tests
- **Test State Management**: Clear and manage test running states

### Advanced Log Analysis & Filtering
- **Log Management**: View, analyze, and download Salesforce debug logs
- **Advanced Log Filtering**: Create custom filters with multiple conditions
- **Built-in Filter Library**: Pre-built filters for common log analysis scenarios
- **Filter Manager**: Dedicated UI for creating, editing, and managing filters
- **Filtered Results Export**: Save filtered log results to new files
- **Log Organization**: Organize logs by test execution and context
- **Structured Log Display**: Parse and display log content in organized format
- **Log Directory Management**: Auto-save logs to `.sfdx/tools/debug/logs` directory

### Git History & Code Analysis
- **Line-level Git History**: View git history for selected code lines
- **File Git History**: Complete git history for entire files
- **Multiple View Modes**: Panel, webview, or IDE-integrated git history views
- **Diff Integration**: Click-to-diff functionality for comparing versions
- **Context Menu Integration**: Right-click access to git history from any file
- **Selection-based Analysis**: Analyze git history for specific code selections

### References & Symbol Navigation
- **Find All References**: Advanced reference finding with `Ctrl+Shift+R`
- **References Tree View**: Dedicated panel showing all symbol references
- **Smart Definition Navigation**: Navigate to symbol definitions from cursor position
- **Cross-file Navigation**: Navigate references across multiple files
- **Symbol Context**: Enhanced symbol information and navigation

### SOQL Query Panel
- **Query Execution**: Execute SOQL queries with real-time results
- **Structured Results**: View query results in organized, readable format
- **Query History**: Save and reuse previous queries
- **Result Export**: Export query results to various formats

### Apex Code Execution
- **Anonymous Apex**: Execute anonymous Apex code with immediate results
- **REST API Integration**: Direct integration with Salesforce REST API endpoints
- **Debug Log Integration**: View execution results with associated debug logs
- **HTTP Methods Support**: Support for GET, POST, PUT, PATCH, DELETE operations
- **JSON Data Handling**: Send and receive JSON data in API calls

### Interactive JSON Viewer
- **Tree View Navigation**: Interactive tree view for JSON files with collapsible nodes
- **Syntax Highlighting**: Color-coded JSON elements (strings, numbers, booleans, etc.)
- **Search Functionality**: Search through JSON content with highlighted results
- **JSON Operations**: Format, validate, and minify JSON content
- **Format Conversion**: Convert JSON to YAML format
- **Schema Generation**: Generate JSON schemas from existing JSON structures
- **File Export**: Export JSON to new files
- **Statistics Display**: Show object/array counts and structure information

### Salesforce Org Management
- **Multi-org Support**: Switch between multiple Salesforce orgs
- **Org Connection Status**: Visual indicators for org connection status
- **User Context**: Track and display current user information
- **Org-specific Caching**: Cache data per org for better performance

### Debug Console & Monitoring
- **Debug Session Tracking**: Monitor debug sessions with real-time updates
- **Custom Event Handling**: Capture and display debug events
- **Console Output**: Dedicated debug console with filtered output
- **Session State Management**: Track debug session start/stop events

### Traction Module
- **Traction Panel**: Dedicated panel for traction-related functionality
- **Workflow Integration**: Enhanced development workflow capabilities
- **Custom Commands**: Specialized commands for traction operations

## Requirements

- Visual Studio Code 1.87.0 or higher
- Salesforce CLI (sf) - latest version recommended
- Salesforce Extension Pack (recommended for full functionality)
- Active Salesforce org connection (for most features)
- Git (for git history and code analysis features)

## Installation

1. Install the extension from the VS Code marketplace
2. Ensure you have the Salesforce CLI installed
3. Connect to your Salesforce org using `sf org login`
4. Open a Salesforce project in VS Code

## Usage

### Test Class Explorer & Execution

1. **Basic Test Execution**:
   - Open the Test Explorer from the activity bar (beaker icon)
   - Click refresh to load test classes
   - Expand classes to view test methods
   - Click play buttons to run tests

2. **Quick Test Execution**:
   - Place cursor on test method or class name
   - Press `Ctrl+Shift+T` to auto-detect and run tests
   - Works from test files, log files, or any context

3. **Advanced Test Operations**:
   - Multi-select tests for batch execution
   - Use "Rerun Failed Tests" to quickly retry failures
   - Export test results using the export button
   - Toggle code coverage collection in settings

### Advanced Log Analysis

1. **Basic Log Viewing**:
   - Open the Apex Log panel from bottom panel
   - View downloaded logs and click to open
   - Use Log Summary for structured analysis

2. **Advanced Log Filtering**:
   - Open any `.log` file
   - Click the filter icon in editor toolbar
   - Create custom filters or use built-in ones
   - Apply filters and save results to new files
   - Use Filter Manager for advanced filter management

### Git History & Code Analysis

1. **Line-level History**:
   - Select code lines in any file
   - Right-click → "V: Show Git History for Selection"
   - Or use `Ctrl+Shift+R` for references

2. **File History**:
   - Right-click on any file → "V: Show Git History for File"
   - View complete file history with diff capabilities
   - Configure view mode in settings (panel/webview/IDE)

### References & Symbol Navigation

1. **Find References**:
   - Place cursor on any symbol
   - Press `Ctrl+Shift+R` or right-click → "V: Find All References"
   - View results in dedicated References panel

2. **Navigate to Definitions**:
   - Right-click → "V: Go to Selected Definition"
   - Navigate across files and contexts

### SOQL Query Panel

1. Open the SOQL panel from bottom panel
2. Enter SOQL queries with intellisense support
3. Execute queries and view formatted results
4. Export results to various formats
5. Save and reuse query history

### Apex Code Execution

1. **Anonymous Apex**:
   - Open Execute Apex panel from bottom panel
   - Enter Apex code and execute
   - View results with integrated debug logs

2. **REST API Integration**:
   - Use Command Palette → "Visbal: Execute Salesforce Apex REST Endpoint"
   - Select HTTP method and enter data
   - View JSON responses in formatted editor

### Interactive JSON Viewer

1. **Open JSON Files**:
   - Right-click JSON files → "Open in JSON Viewer"
   - Or use Command Palette → "Visbal: Show JSON Viewer"

2. **JSON Operations**:
   - Use toolbar for format, validate, minify operations
   - Convert to YAML with one click
   - Generate schemas from existing JSON
   - Search and navigate large JSON structures

### Org Management

1. Switch between orgs using the Orgs panel
2. Monitor connection status in status bar
3. View current user and org information
4. Per-org caching for improved performance

### Debug Console

1. Automatically activates during debug sessions
2. View real-time debug output and events
3. Clear console using dedicated commands
4. Monitor session state changes

## Extension Settings

This extension contributes the following settings:

### Module Settings
Enable or disable entire feature modules:

* `visbal.modules.testExplorer.enabled`: Enable/disable the Test Explorer module (default: true)
* `visbal.modules.logAnalyzer.enabled`: Enable/disable the Log Analyzer module (default: true)
* `visbal.modules.soqlQuery.enabled`: Enable/disable the SOQL Query module (default: true)
* `visbal.modules.samplePanel.enabled`: Enable/disable the Sample Panel module (default: true)
* `visbal.modules.orgs.enabled`: Enable/disable the Orgs module (default: true)
* `visbal.modules.traction.enabled`: Enable/disable the Traction module (default: true)
* `visbal.modules.jsonViewer.enabled`: Enable/disable the JSON Viewer module (default: true)

### Test Execution Settings
Configure test execution behavior:

* `visbal.apexTest.downloadTestLogOnExecution`: Automatically download test logs after execution (default: false)
* `visbal.apexTest.manualExecution`: Enable custom handling of test execution (default: false)
* `visbal.apexTest.enableCodeCoverage`: Enable code coverage collection for test runs (default: false)
* `visbal.selectedTests`: Internal storage for selected test methods and tracking failed tests

### Logging & Debug Settings
Configure extension logging and debug output:

* `visbal.logging.saveToFile`: Save logs and errors to files (default: false)
* `visbal.logging.displayInConsole`: Display logs and errors in console (default: false)
* `visbal.logging.deleteErrorLogsOlderThan`: Delete error logs older than N days (default: 1)
* `visbal.logging.deleteDebugLogsOlderThan`: Delete debug logs older than N days (default: 10)
* `visbal.logging.debugMaxLength`: Maximum debug message length (default: 250)
* `visbal.logging.debugFileMaxSize`: Maximum debug file size in bytes (default: 2097152)

### Git History Settings
Configure git integration behavior:

* `visbal.gitHistory.view`: Display mode for Git History - 'panel', 'webview', or 'IDE' (default: 'webview')

### Output Settings
Configure extension output behavior:

* `visbal.output.showOnActivation`: Show extension output channel on activation (default: false)

### Log Filter Settings
Configure advanced log filtering:

* `visbal.logFilter.autoApplyBuiltInFilters`: Automatically apply built-in filters when opening log files (default: false)
* `visbal.logFilter.maxFilterExecutionTime`: Maximum execution time for filters in milliseconds (default: 5000)
* `visbal.logFilter.showFilterPanelByDefault`: Show filter panel by default in log views (default: true)

### JSON Viewer Settings
Configure JSON viewer behavior:

* `visbal.jsonViewer.autoOpen`: Automatically open JSON files in the JSON viewer when selected (default: true)
* `visbal.jsonViewer.collapseLevel`: Default collapse level for JSON objects (0 = fully expanded) (default: 2)
* `visbal.jsonViewer.showObjectStats`: Show statistics about JSON objects (object count, array count, etc.) (default: true)

## Keyboard Shortcuts

The extension provides several convenient keyboard shortcuts:

* `Ctrl+Shift+R`: Find all references for the symbol under cursor
* `Ctrl+Shift+T`: Smart test detection and execution from cursor position

## Command Palette Commands

Access these commands via `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac):

### Test & Debug Commands
* `Visbal: Select and Run Test` - Smart test execution from cursor
* `Visbal: Rerun Failed Tests` - Re-run only failed tests
* `Visbal: Rerun All Tests` - Re-run all previously executed tests
* `Visbal: Clear Running Test States` - Clear test execution states
* `Visbal: Export Test Results` - Export test results to file
* `Visbal: Toggle Code Coverage for Tests` - Enable/disable code coverage

### Log & Analysis Commands
* `Visbal: Show Log Filter Manager` - Open log filter management UI
* `Visbal: Create Log Filter` - Create new custom log filter
* `Visbal: Apply Log Filter to Current Log` - Apply filter to active log file
* `Visbal: Show Log Summary` - View structured log analysis

### Git & Navigation Commands
* `V: Show Git History for Selection` - View git history for selected lines
* `V: Show Git History for File` - View complete file git history
* `V: Find All References` - Find all symbol references
* `V: Go to Selected Definition` - Navigate to symbol definition

### JSON Commands
* `Visbal: Show JSON Viewer` - Open JSON viewer panel
* `Visbal: Validate JSON` - Validate JSON syntax
* `Visbal: Format JSON` - Format JSON with proper indentation
* `Visbal: Minify JSON` - Remove whitespace from JSON
* `Visbal: Convert JSON to YAML` - Convert JSON to YAML format
* `Visbal: Generate JSON Schema` - Generate schema from JSON structure

### API & Execution Commands
* `Visbal: Fetch Salesforce Logs via REST API` - Download logs using REST API
* `Visbal: Execute Salesforce Apex REST Endpoint` - Execute custom REST endpoints

### Panel Commands
* `Visbal: Show Visbal Log` - Open log analysis panel
* `Visbal: Show Visbal SOQL` - Open SOQL query panel
* `Visbal: Show Visbal Apex` - Open Apex execution panel
* `Visbal: Show Traction Tab` - Open traction panel
* `Visbal: Show References Panel` - Open references panel
* `Visbal: Show Debug Console` - Open debug console
* `Visbal: Show Visbal Extension Output` - Show extension output log

## Known Issues

See [GitHub issues](https://github.com/yourusername/visbal-ext/issues) for known issues and feature requests.

## Release Notes

### 1.2.6 (Current)

Comprehensive Salesforce development extension featuring:

**Core Testing Features:**
- Advanced Test Class Explorer with multi-select and batch execution
- Smart test detection with `Ctrl+Shift+T` hotkey
- Test results export and failed test re-run capabilities
- Code coverage toggle and comprehensive test state management

**Advanced Log Analysis:**
- Sophisticated log filtering system with custom filter creation
- Built-in filter library for common log analysis scenarios
- Filter Manager UI for advanced filter management
- Log result export and structured log viewing

**Git Integration & Code Navigation:**
- Line-level and file-level git history viewing
- Multiple viewing modes (panel, webview, IDE integration)
- Advanced reference finding with `Ctrl+Shift+R`
- Smart symbol navigation and definition lookup

**Development Tools:**
- Interactive JSON Viewer with tree navigation and format conversion
- SOQL Query Panel with structured results and query history
- Apex Execution Panel with REST API integration
- Debug Console with real-time session monitoring

**Salesforce Integration:**
- Multi-org support with connection status monitoring
- Salesforce REST API integration for logs and data
- User context tracking and org-specific caching
- Comprehensive Salesforce CLI integration

**Productivity Features:**
- Traction module for enhanced workflow management
- References panel for cross-file symbol tracking
- Extensive configuration options for all features
- Modular architecture with individual module controls

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.