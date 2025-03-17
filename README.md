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

## Extension Settings

This extension contributes the following settings:

* `visbal.logDirectory`: Directory to store downloaded logs (default: `.sfdx/tools/debug/logs`)
* `visbal.cacheTimeout`: Duration to cache test methods in minutes (default: 5)

## Known Issues

See [GitHub issues](https://github.com/yourusername/visbal-ext/issues) for known issues and feature requests.

## Release Notes

### 0.1.0

Initial release of Visbal Extension with:
- Test Class Explorer
- Log Analysis
- SOQL Query Panel
- Apex Execution Panel

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.