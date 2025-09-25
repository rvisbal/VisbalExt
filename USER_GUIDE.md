# Visbal Extension User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Test Management Workflows](#test-management-workflows)
3. [Log Analysis & Debugging](#log-analysis--debugging)
4. [Code Navigation & Analysis](#code-navigation--analysis)
5. [Development Tools](#development-tools)
6. [Configuration & Customization](#configuration--customization)
7. [Troubleshooting](#troubleshooting)
8. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### Initial Setup

1. **Install Prerequisites**
   - Ensure Salesforce CLI (`sf`) is installed and updated
   - Connect to your Salesforce org: `sf org login web`
   - Verify connection: `sf org display`

2. **First Launch**
   - Open VS Code in a Salesforce project directory
   - The extension will automatically activate
   - Look for the Visbal Test icon in the Activity Bar (left sidebar)

3. **Verify Installation**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "Visbal" - you should see various Visbal commands
   - Check status bar for org connection indicator

### Interface Overview

The extension adds several panels to VS Code:

- **Activity Bar**: Visbal Test (beaker icon)
- **Panel Area**: Orgs, Apex Log, SOQL, Execute Apex, Traction, JSON Viewer, References
- **Status Bar**: Shows current org and operation status

---

## Test Management Workflows

### Quick Test Execution

**Scenario**: You're working on a test method and want to run it immediately.

1. **Method 1: Cursor-based Execution**
   - Place your cursor anywhere in a test method
   - Press `Ctrl+Shift+T`
   - The extension auto-detects the test and runs it

2. **Method 2: Log File Context**
   - Open a debug log file
   - Click on a line containing `TestClassName.methodName`
   - Press `Ctrl+Shift+T`
   - Runs that specific test

### Comprehensive Test Management

**Scenario**: Managing multiple test classes in a large project.

1. **Open Test Explorer**
   - Click the beaker icon in Activity Bar
   - Or use Command Palette → "Visbal Test"

2. **Load Test Classes**
   - Click the refresh button in Test Classes panel
   - Wait for classes to load (cached for 5 minutes by default)

3. **Run Tests**
   - **Single Method**: Click play button next to method name
   - **Entire Class**: Click play button next to class name
   - **Multiple Tests**: Ctrl+click to select multiple, then click "Run Selected Tests"
   - **Batch Operations**: Select multiple classes and run all at once

4. **Monitor Results**
   - **Running Tasks Panel**: Shows currently executing tests
   - **Test Summary Panel**: Detailed results with logs
   - **Status Bar**: Real-time progress updates

### Handling Test Failures

**Scenario**: Some tests failed and you need to debug and re-run them.

1. **Analyze Failures**
   - Go to Test Summary panel
   - Click on failed tests to see error details
   - Click "View Test Log" to see debug logs

2. **Re-run Failed Tests**
   - Use Command Palette → "Visbal: Rerun Failed Tests"
   - Or click the restart icon in Running Tasks panel

3. **Export Results**
   - Click export button in Running Tasks panel
   - Choose location to save test results
   - Useful for reporting and sharing

### Code Coverage Analysis

**Scenario**: You need to check code coverage for your tests.

1. **Enable Code Coverage**
   - Command Palette → "Visbal: Toggle Code Coverage for Tests"
   - Or set `visbal.apexTest.enableCodeCoverage: true` in settings

2. **Run Tests with Coverage**
   - Execute tests normally - coverage will be collected automatically
   - View coverage information in test results

⚠️ **Note**: Code coverage collection can be memory-intensive for large codebases.

---

## Log Analysis & Debugging

### Basic Log Analysis

**Scenario**: Analyzing debug logs from test execution or user issues.

1. **Access Logs**
   - Open Apex Log panel from bottom panel area
   - Or use Command Palette → "Visbal: Show Visbal Log"

2. **Download Recent Logs**
   - Command Palette → "Visbal: Fetch Salesforce Logs via REST API"
   - Logs are automatically saved to `.sfdx/tools/debug/logs`

3. **Open and View Logs**
   - Click on any log in the panel to open it
   - Logs open in structured format with syntax highlighting

### Advanced Log Filtering

**Scenario**: Large log files where you need to find specific information quickly.

1. **Open Filter Manager**
   - Open any `.log` file
   - Click the filter icon in the editor toolbar
   - Or Command Palette → "Visbal: Show Log Filter Manager"

2. **Use Built-in Filters**
   - Apply pre-built filters for common scenarios:
     - USER_DEBUG messages only
     - Exception traces
     - Database operations
     - Validation rules

3. **Create Custom Filters**
   - Command Palette → "Visbal: Create Log Filter"
   - Define conditions (contains, regex, line ranges)
   - Save filter for reuse

4. **Apply and Save Results**
   - Select filter from toolbar dropdown
   - Click "Apply Filter and Save Results"
   - Filtered results open in new file
   - Original log remains unchanged

### Log Filter Examples

**Common Filtering Scenarios**:

1. **Find All Exceptions**
   - Condition: Content contains "Exception"
   - Use case: Debugging error scenarios

2. **Database Operations Only**
   - Condition: Content contains "SOQL" OR "DML"
   - Use case: Performance analysis

3. **Specific Class Activity**
   - Condition: Content contains "MyClassName"
   - Use case: Focused debugging

4. **Time Range Analysis**
   - Condition: Line range 100-500
   - Use case: Analyzing specific execution period

---

## Code Navigation & Analysis

### Git History Analysis

**Scenario**: Understanding how code has evolved over time.

1. **Line-Level History**
   - Select specific lines of code
   - Right-click → "V: Show Git History for Selection"
   - View how those specific lines changed over time

2. **File History**
   - Right-click on file tab → "V: Show Git History for File"
   - See complete file evolution
   - Click on commits to see diffs

3. **Configure View Mode**
   - Settings → `visbal.gitHistory.view`
   - Options: "panel", "webview", "IDE"
   - Choose based on your preference

### Finding References and Navigation

**Scenario**: Understanding code dependencies and usage patterns.

1. **Find All References**
   - Place cursor on any symbol (method, class, variable)
   - Press `Ctrl+Shift+R`
   - Or right-click → "V: Find All References"

2. **Navigate References**
   - Results appear in References panel
   - Click on any reference to jump to that location
   - Organized by file for easy navigation

3. **Smart Definition Navigation**
   - Right-click → "V: Go to Selected Definition"
   - Jumps to symbol definition across files
   - Works with Apex classes, methods, variables

### Code Analysis Workflow

**Scenario**: Investigating a complex bug across multiple files.

1. **Start with References**
   - Place cursor on problematic method
   - `Ctrl+Shift+R` to find all usages

2. **Analyze Git History**
   - Select method lines → Git History for Selection
   - Identify recent changes that might have introduced the bug

3. **Navigate Related Code**
   - Use "Go to Definition" to understand dependencies
   - Follow the code flow across files

---

## Development Tools

### SOQL Query Development

**Scenario**: Developing and testing database queries.

1. **Open SOQL Panel**
   - Bottom panel → SOQL tab
   - Or Command Palette → "Visbal: Show Visbal SOQL"

2. **Write and Execute Queries**
   - Enter SOQL query in the editor area
   - Click "Execute" button
   - Results appear in structured format below

3. **Query Management**
   - Save frequently used queries
   - Access query history
   - Export results to files

**Example Workflow**:
```sql
-- Test query
SELECT Id, Name, Email FROM Contact WHERE LastModifiedDate = TODAY

-- Analyze results, refine query
SELECT Id, Name, Email, Account.Name FROM Contact 
WHERE LastModifiedDate = TODAY AND Account.Type = 'Customer'

-- Export final results for reporting
```

### Apex Code Execution

**Scenario**: Testing code snippets or running maintenance scripts.

1. **Anonymous Apex Execution**
   - Open Execute Apex panel
   - Enter Apex code
   - Click "Execute"
   - View results and debug logs

2. **REST API Integration**
   - Command Palette → "Visbal: Execute Salesforce Apex REST Endpoint"
   - Choose HTTP method (GET, POST, PUT, etc.)
   - Enter endpoint and data
   - View JSON response

**Example Use Cases**:
- Testing utility methods
- Data cleanup scripts
- Quick calculations
- API endpoint testing

### JSON Data Management

**Scenario**: Working with configuration files, API responses, or metadata.

1. **Open JSON Viewer**
   - Right-click on `.json` file → "Open in JSON Viewer"
   - Or Command Palette → "Visbal: Show JSON Viewer"

2. **Navigation and Analysis**
   - Expand/collapse object nodes
   - Search through JSON content
   - View object statistics

3. **JSON Operations**
   - **Format**: Pretty-print JSON with proper indentation
   - **Validate**: Check JSON syntax
   - **Minify**: Remove whitespace for production
   - **Convert to YAML**: Transform format
   - **Generate Schema**: Create JSON schema from structure

---

## Configuration & Customization

### Module Management

**Scenario**: Customize which features are enabled based on your workflow.

1. **Access Settings**
   - File → Preferences → Settings
   - Search for "visbal"

2. **Enable/Disable Modules**
   - `visbal.modules.testExplorer.enabled`: Test functionality
   - `visbal.modules.logAnalyzer.enabled`: Log analysis
   - `visbal.modules.soqlQuery.enabled`: SOQL panel
   - `visbal.modules.jsonViewer.enabled`: JSON tools
   - And more...

3. **Reload Required**
   - Changes require window reload to take effect
   - Command Palette → "Developer: Reload Window"

### Test Execution Configuration

**Key Settings**:

- `visbal.apexTest.downloadTestLogOnExecution`: Auto-download logs
- `visbal.apexTest.enableCodeCoverage`: Collect coverage data
- `visbal.apexTest.manualExecution`: Custom test handling

### Logging Configuration

**For Debugging Extension Issues**:

- `visbal.logging.saveToFile`: Save extension logs
- `visbal.logging.displayInConsole`: Show debug output
- `visbal.output.showOnActivation`: Show output on startup

### Git Integration Settings

- `visbal.gitHistory.view`: Choose display mode
  - "webview": Rich web interface
  - "panel": Sidebar panel
  - "IDE": Integrated VS Code diff

---

## Troubleshooting

### Common Issues and Solutions

#### "No default org set or connection failed"

**Problem**: Extension can't connect to Salesforce org.

**Solutions**:
1. Verify CLI connection: `sf org display`
2. Re-authenticate: `sf org login web`
3. Check project is in correct directory
4. Restart VS Code

#### Test Explorer not loading classes

**Problem**: Test classes don't appear in explorer.

**Solutions**:
1. Click refresh button in Test Classes panel
2. Verify you're in a Salesforce project
3. Check that classes exist in `force-app/main/default/classes/`
4. Clear cache: restart VS Code

#### Log filtering performance issues

**Problem**: Filters run slowly on large log files.

**Solutions**:
1. Increase timeout: `visbal.logFilter.maxFilterExecutionTime`
2. Use more specific filter conditions
3. Split large logs into smaller files
4. Use line range filters instead of content filters

#### Git history not working

**Problem**: Git commands fail or show no results.

**Solutions**:
1. Ensure Git is installed and in PATH
2. Verify file is saved (not untitled)
3. Check file is in a Git repository
4. Try different view mode in settings

### Getting Help

1. **Extension Output**
   - Command Palette → "Visbal: Show Visbal Extension Output"
   - Shows detailed logging information

2. **Enable Debug Logging**
   - Set `visbal.logging.displayInConsole: true`
   - Restart VS Code
   - Check Developer Console (`Help → Toggle Developer Tools`)

3. **Reset Extension State**
   - Command Palette → "Developer: Reload Window"
   - Clears caches and resets state

---

## Tips & Best Practices

### Performance Optimization

1. **Test Caching**
   - Test methods are cached for 5 minutes
   - Use refresh button if you add new tests
   - Adjust cache timeout in settings if needed

2. **Log Management**
   - Enable automatic log cleanup
   - Set appropriate retention periods
   - Use filters to reduce log file sizes

3. **Module Management**
   - Disable unused modules to reduce memory usage
   - Particularly useful for large teams with different workflows

### Workflow Integration

1. **Keyboard Shortcuts**
   - Learn the two main shortcuts: `Ctrl+Shift+R` and `Ctrl+Shift+T`
   - Create custom keybindings for frequently used commands

2. **Panel Organization**
   - Arrange panels based on your workflow
   - Use "Pin" feature to keep important panels visible
   - Collapse unused panels to save space

3. **Multi-org Development**
   - Use Orgs panel to switch between environments
   - Each org maintains separate caches
   - Test in sandbox before production deployment

### Code Quality Practices

1. **Use Code Coverage**
   - Enable for critical deployments
   - Monitor coverage trends over time
   - Focus on testing business logic

2. **Log Analysis Workflow**
   - Create standard filters for your team
   - Share filter configurations
   - Document common debugging patterns

3. **Git Integration**
   - Use line-level history for code reviews
   - Analyze changes before major refactoring
   - Track bug introduction points

### Team Collaboration

1. **Shared Configuration**
   - Document team settings in project README
   - Use workspace settings for team consistency
   - Share custom log filters

2. **Test Management**
   - Export test results for reporting
   - Use batch execution for CI/CD integration
   - Maintain test organization standards

---

## Advanced Scenarios

### Scenario: Production Issue Investigation

1. **Get Debug Logs**
   - Use REST API to fetch recent logs
   - Apply "Exception" filter to find errors
   - Export filtered results for analysis

2. **Code Analysis**
   - Find references to problematic methods
   - Use Git history to identify recent changes
   - Navigate to related code for context

3. **Testing Fix**
   - Create focused test cases
   - Run with code coverage enabled
   - Verify fix resolves issue

### Scenario: Large-scale Refactoring

1. **Impact Analysis**
   - Use "Find All References" extensively
   - Export reference lists for planning
   - Use Git history to understand evolution

2. **Testing Strategy**
   - Identify affected test classes
   - Create comprehensive test suites
   - Use batch execution for regression testing

3. **Monitoring**
   - Enable detailed logging
   - Monitor test execution performance
   - Use filters to track specific operations

---

This guide covers the main workflows and use cases for the Visbal Extension. For additional help or feature requests, refer to the project's GitHub repository or documentation.
