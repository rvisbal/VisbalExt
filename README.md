# Visbal Extension for VS Code

A Visual Studio Code extension that enhances Salesforce development with improved test execution and log analysis capabilities.

## Features

### Test Class Explorer
- View and manage Apex test classes in a dedicated sidebar
- Run individual test methods or entire test classes
- View test results with detailed logs
- Cache test methods for improved performance
- Multi-select and batch run tests

### Log Analysis
- View and analyze Salesforce debug logs
- Download and open logs directly in VS Code
- Organize logs by test execution
- Parse and display log content in a structured format
- Save logs to `.sfdx/tools/debug/logs` directory

### SOQL Query Panel
- Execute SOQL queries
- View query results in a structured format
- Save and reuse queries

### Apex Execution
- Execute anonymous Apex code
- View execution results and debug logs
- REST API integration for Apex endpoints

### JSON Viewer
- Interactive tree view for JSON files with collapsible nodes
- Syntax highlighting for JSON elements (strings, numbers, booleans, etc.)
- Search functionality with highlighted results
- Format, validate, and minify JSON content
- Convert JSON to YAML format
- Generate JSON schemas from existing JSON
- Export JSON to new files
- Statistics display showing object/array counts

## Requirements

- Visual Studio Code 1.63.0 or higher
- Salesforce CLI (sf)
- Salesforce Extension Pack
- Active Salesforce org connection

## Installation

1. Install the extension from the VS Code marketplace
2. Ensure you have the Salesforce CLI installed
3. Connect to your Salesforce org using `sf org login`
4. Open a Salesforce project in VS Code

## Usage

### Test Class Explorer

1. Open the Test Explorer from the activity bar (beaker icon)
2. Click the refresh button to load test classes
3. Expand a class to view its test methods
4. Click the play button to run tests
5. View test results and logs in the panel below

### Log Analysis

1. Open the Visbal Log panel from the bottom panel
2. View downloaded logs
3. Click on a log to open it in the editor
4. Use the Log Summary view for structured analysis

### SOQL Queries

1. Open the SOQL panel from the bottom panel
2. Enter your SOQL query
3. Click execute to run the query
4. View results in a structured format

### Apex Execution

1. Open the Apex panel from the bottom panel
2. Enter your Apex code
3. Click execute to run the code
4. View execution results and logs

### JSON Viewer

1. Open a JSON file in VS Code
2. Right-click and select "Open in JSON Viewer" or use Command Palette → "Visbal: Show JSON Viewer"
3. Use the interactive tree view to explore JSON structure
4. Search through JSON content using the search box
5. Use toolbar buttons to:
   - Format or minify JSON
   - Validate JSON syntax
   - Convert to YAML
   - Generate JSON schema
   - Export to new files
6. Expand/collapse nodes to navigate large JSON structures

## Extension Settings

This extension contributes the following settings:

### Core Settings
* `visbal.logDirectory`: Directory to store downloaded logs (default: `.sfdx/tools/debug/logs`)
* `visbal.cacheTimeout`: Duration to cache test methods in minutes (default: 5)

### Module Settings
* `visbal.modules.testExplorer.enabled`: Enable/disable the Test Explorer module (default: true)
* `visbal.modules.logAnalyzer.enabled`: Enable/disable the Log Analyzer module (default: true)
* `visbal.modules.soqlQuery.enabled`: Enable/disable the SOQL Query module (default: true)
* `visbal.modules.samplePanel.enabled`: Enable/disable the Sample Panel module (default: true)
* `visbal.modules.orgs.enabled`: Enable/disable the Orgs module (default: true)
* `visbal.modules.traction.enabled`: Enable/disable the Traction module (default: true)
* `visbal.modules.jsonViewer.enabled`: Enable/disable the JSON Viewer module (default: true)

### JSON Viewer Settings
* `visbal.jsonViewer.autoOpen`: Automatically open JSON files in the JSON viewer when selected (default: true)
* `visbal.jsonViewer.collapseLevel`: Default collapse level for JSON objects (0 = fully expanded) (default: 2)
* `visbal.jsonViewer.showObjectStats`: Show statistics about JSON objects (object count, array count, etc.) (default: true)

### Log Filter Settings
* `visbal.logFilter.autoApplyBuiltInFilters`: Automatically apply built-in filters when opening log files (default: false)
* `visbal.logFilter.maxFilterExecutionTime`: Maximum execution time for filters in milliseconds (default: 5000)
* `visbal.logFilter.showFilterPanelByDefault`: Show the filter panel by default in log views (default: true)

## Known Issues

See [GitHub issues](https://github.com/yourusername/visbal-ext/issues) for known issues and feature requests.

## Release Notes

### 0.1.0

Initial release of Visbal Extension with:
- Test Class Explorer with multi-select and batch test execution
- Advanced Log Analysis with filtering capabilities
- SOQL Query Panel for database queries
- Apex Execution Panel for anonymous code execution
- JSON Viewer with interactive tree view and advanced operations
- Comprehensive configuration options for all modules
- Git History integration for code analysis
- Modular architecture with enable/disable options

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.