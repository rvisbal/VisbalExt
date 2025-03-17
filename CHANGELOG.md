# Change Log

All notable changes to the "Visbal Extension" will be documented in this file.

## [0.1.0] - 2024-03-14

### Added
- Test Class Explorer
  - View and manage Apex test classes
  - Run individual test methods or entire classes
  - Cache test methods for improved performance
  - Multi-select and batch run tests
  - View test results with detailed logs

- Log Analysis
  - View and analyze Salesforce debug logs
  - Download and open logs directly in VS Code
  - Organize logs by test execution
  - Parse and display log content in structured format
  - Save logs to `.sfdx/tools/debug/logs` directory

- SOQL Query Panel
  - Execute SOQL queries
  - View query results in structured format
  - Save and reuse queries

- Apex Execution Panel
  - Execute anonymous Apex code
  - View execution results and debug logs
  - REST API integration for Apex endpoints

### Changed
- Updated to use new Salesforce CLI (sf) commands
- Improved log file handling and organization
- Enhanced test execution workflow

### Fixed
- Log download issues with large files
- Test method caching reliability
- UI spacing in test explorer 