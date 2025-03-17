import * as vscode from 'vscode';
import { StatusBarService } from '../services/statusBarService';
import { MetadataService } from '../services/metadataService';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';

// Add TestClass interface at the top of the file
interface TestClass {
    name: string;
    id: string;
    methods: string[];
    symbolTable?: any;
    attributes: {
        fileName: string;
        fullName: string;
    };
}

export class TestClassExplorerView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testClassExplorerView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _statusBarService: StatusBarService;
    private _metadataService: MetadataService;
    private _cachedTestClasses?: TestClass[]; // Update type
    private _cachedTestMethods: Map<string, string[]> = new Map(); // Cache for test methods
    private _testController: vscode.TestController;
    private _testItems: Map<string, vscode.TestItem>;

    constructor(
        extensionUri: vscode.Uri,
        statusBarService: StatusBarService
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
        this._metadataService = new MetadataService();
        this._testController = vscode.tests.createTestController('testClassExplorerView', 'Test Class Explorer');
        this._testItems = new Map();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('[VisbalExt.TestClassExplorerView] Received message from webview:', data);
            switch (data.command) {
                case 'fetchTestClasses':
                    await this._fetchTestClasses(data.forceRefresh);
                    break;
                case 'fetchTestMethods':
                    await this._fetchTestMethods(data.className);
                    break;
                case 'runTest':
                    await this._runTest(data.testClass, data.testMethod);
                    break;
                case 'runSelectedTests':
                    await this._runSelectedTests(data.tests);
                    break;
                case 'viewTestLog':
                    await this._viewTestLog(data.logId, data.testName);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(data.message);
                    break;
            }
        });

        // Initial fetch of test classes when view becomes visible
        setTimeout(() => {
            console.log('[VisbalExt.TestClassExplorerView] Initial fetch of test classes');
            if (this._view && this._view.visible) {
                // Use cached data if available
                if (this._cachedTestClasses) {
                    console.log('[VisbalExt.TestClassExplorerView] Using cached test classes');
                    this._view.webview.postMessage({
                        command: 'testClassesLoaded',
                        testClasses: this._cachedTestClasses
                    });
                } else {
                    this._fetchTestClasses(false);
                }
            }
        }, 1000);
    }

    private async _fetchTestClasses(forceRefresh: boolean = false) {
        console.log('[VisbalExt.TestClassExplorerView] [FETCH] Starting test class fetch. Force refresh:', forceRefresh);
        
        try {
            // Check cache first
            if (this._cachedTestClasses && !forceRefresh) {
                console.log('[VisbalExt.TestClassExplorerView] [FETCH] Using cached test classes:', this._cachedTestClasses.length, 'classes');
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testClassesLoaded',
                        testClasses: this._cachedTestClasses
                    });
                }
                return;
            }

            this._statusBarService.showMessage('$(sync~spin) Fetching test classes...');
            console.log('[VisbalExt.TestClassExplorerView] [FETCH] Fetching test classes from MetadataService');
            
            const testClasses = await this._metadataService.getTestClasses();
            console.log('[VisbalExt.TestClassExplorerView] [FETCH] Received test classes:', testClasses?.length || 0, 'classes');

            // Transform ApexClass to TestClass with type checking
            this._cachedTestClasses = testClasses?.filter(apexClass => apexClass && apexClass.name).map(apexClass => ({
                name: apexClass.name,
                id: apexClass.name, // Use name as id since it's unique
                methods: [], // Will be populated later
                symbolTable: {},
                attributes: {
                    fileName: `${apexClass.name}.cls`,
                    fullName: apexClass.name
                }
            })) || [];
            console.log('[VisbalExt.TestClassExplorerView] [FETCH] Test classes cached');

            // Add test classes to VSCode Test Explorer
            if (this._cachedTestClasses) {
                console.log('[VisbalExt.TestClassExplorerView] [FETCH] Adding test classes to Test Explorer');
                for (const testClass of this._cachedTestClasses) {
                    await this._addTestToExplorer(testClass);
                }
                console.log('[VisbalExt.TestClassExplorerView] [FETCH] Finished adding test classes to Test Explorer');
            }

            if (this._view) {
                console.log('[VisbalExt.TestClassExplorerView] [FETCH] Sending test classes to webview');
                this._view.webview.postMessage({
                    command: 'testClassesLoaded',
                    testClasses: this._cachedTestClasses || []
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] [FETCH] Error fetching test classes:', error);
            this._statusBarService.hide();
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }

            vscode.window.showErrorMessage(`Error fetching test classes: ${error.message}`);
        }
    }

    private async _addTestToExplorer(testClass: TestClass) {
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Adding test class:', testClass.name);
        
        // Create test item for the class
        const classItem = this._testController.createTestItem(
            testClass.id,
            testClass.name,
            vscode.Uri.file(testClass.attributes.fileName)
        );
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Created class test item:', classItem.label);

        // Add test methods
        if (testClass.methods && testClass.methods.length > 0) {
            console.log(`[VisbalExt.TestClassExplorerView] Adding ${testClass.methods.length} methods for class ${testClass.name}`);
            
            for (const method of testClass.methods) {
                const methodItem = this._testController.createTestItem(
                    `${testClass.id}.${method}`,
                    method,
                    vscode.Uri.file(testClass.attributes.fileName)
                );
                console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Created method test item:', methodItem.label);
                
                classItem.children.add(methodItem);
            }
        } else {
            console.log(`[VisbalExt.TestClassExplorerView] No methods found for class ${testClass.name}`);
        }

        // Add to test controller
        this._testController.items.add(classItem);
        this._testItems.set(testClass.name, classItem);
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Test items updated in controller');
    }

    private async _fetchTestMethods(className: string) {
        try {
            this._statusBarService.showMessage(`$(sync~spin) Fetching test methods for ${className}...`);
            
            // Check cache first
            if (this._cachedTestMethods.has(className)) {
                console.log(`[VisbalExt.TestClassExplorerView] Using cached test methods for ${className}`);
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testMethodsLoaded',
                        className,
                        testMethods: this._cachedTestMethods.get(className)
                    });
                }
                return;
            }
            
            // Use MetadataService to get test methods for the class
            const testMethods = await this._metadataService.getTestMethodsForClass(className);
            
            if (!testMethods || testMethods.length === 0) {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `No test methods found in ${className}.`
                    });
                }
            } else {
                // Cache the test methods
                this._cachedTestMethods.set(className, testMethods.map(m => m.name));
            }
            
            // Send the test methods to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testMethodsLoaded',
                    className,
                    testMethods
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            console.error(`[VisbalExt.TestClassExplorerView] Error fetching test methods for ${className}:`, error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }

    private async _runTest(testClass: string, testMethod?: string) {
        console.log(`[VisbalExt.TestClassExplorerView] [EXECUTION] Starting test run for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
        
        try {
            this._statusBarService.showMessage('$(sync~spin) Running test...');
            
            // Execute the test
            console.log('[VisbalExt.TestClassExplorerView] Calling MetadataService.runTests');
            const result = await this._metadataService.runTests(testClass, testMethod);
            console.log('[VisbalExt.TestClassExplorerView] Test execution completed. Result:', result);

            // Get test run details using the testRunId
            if (result && result.testRunId) {
                console.log('[VisbalExt.TestClassExplorerView] Fetching test run details for:', result.testRunId);
                const testRunResult = await this._metadataService.getTestRunResult(result.testRunId);
                console.log('[VisbalExt.TestClassExplorerView] Test run details:', testRunResult);

                // Send the test results to the webview
                if (this._view) {
                    console.log('[VisbalExt.TestClassExplorerView] Sending test results to webview');
                    this._view.webview.postMessage({
                        command: 'testResultsLoaded',
                        results: testRunResult
                    });
                }

                if (testRunResult && testRunResult.tests && testRunResult.tests.length > 0) {
                    const testResult = testRunResult.tests[0]; // Get the first test result
                    console.log('[VisbalExt.TestClassExplorerView] testResult:', testResult);

                    // Update test status in UI
                    const success = testResult.Outcome === 'Pass';
                    const runTime = testResult.RunTime || 0;
                    const message = testResult.Message || '';
                    const stackTrace = testResult.StackTrace || '';
					
					
					console.log('[VisbalExt.TestClassExplorerView] DOWNLOAD THE LOG');
					
					try {
						
						 const logId = await this._metadataService.getTestLogId(result.testRunId);
						 if (logId) {
							const logResult = await this._metadataService.getLogContent(logId);
						 } else {
							console.warn('[VisbalExt.TestClassExplorerView] No log IDs found for test run');
						 }
					}catch (logError) {
						console.error('[VisbalExt.TestClassExplorerView] Error getLogContent:', logError);
						vscode.window.showWarningMessage(`Could not fetch test log: ${(logError as Error).message}`);
					}

                    if (success) {
                        console.log('[VisbalExt.TestClassExplorerView] Test passed');
                        const successMessage = testMethod 
                            ? `Method ${testMethod} passed in ${runTime}ms`
                            : `All tests in ${testClass} passed in ${runTime}ms`;
                        console.log(`[VisbalExt.TestClassExplorerView] [EXECUTION] ${successMessage}`);
                        vscode.window.showInformationMessage(successMessage);

                        // Wait a moment for the test to fully complete and logs to be available
                        await new Promise(resolve => setTimeout(resolve, 2000));
						
						


                        // Now fetch the log
                        try {
                            console.log('[VisbalExt.TestClassExplorerView] Fetching test run log for:', result.testRunId);
                            const logResult = await this._metadataService.getTestRunLog(result.testRunId);
                            
                            if (logResult && logResult.logPath) {
                                console.log('[VisbalExt.TestClassExplorerView] Log file created at:', logResult.logPath);
                                vscode.window.showInformationMessage(`Test log saved to: ${logResult.logPath}`);
                            }
                        } catch (logError) {
                            console.error('[VisbalExt.TestClassExplorerView] Error fetching test log:', logError);
                            vscode.window.showWarningMessage(`Could not fetch test log: ${(logError as Error).message}`);
                        }
                    } else {
                        console.error('[VisbalExt.TestClassExplorerView] [EXECUTION] Test failed:', message);
                        vscode.window.showErrorMessage(`Test failed: ${message}`);
                    }
                } else {
                    throw new Error('No test results found in the response');
                }
            } else {
                throw new Error('No test run ID received from test execution');
            }

            console.log('[VisbalExt.TestClassExplorerView] Test run ended');
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] [EXECUTION] Error during test execution:', error);
            this._statusBarService.showError(`Error running test: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to run test: ${error.message}`);
            
            // Send error to webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error running test: ${error.message}`
                });
            }
        } finally {
            this._statusBarService.hide();
            console.log('[VisbalExt.TestClassExplorerView] Status bar cleared');
        }
    }
    
    private async _runSelectedTests(tests: { classes: string[], methods: { className: string, methodName: string }[] }) {
        try {
            const totalCount = tests.classes.length + tests.methods.length;
            this._statusBarService.showMessage(`$(beaker~spin) Running ${totalCount} selected tests...`);
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                throw new Error('Salesforce Extension Pack is required to run tests. Please install it from the VS Code marketplace.');
            }
            
            const results = [];
            
            // Run class tests
            for (const className of tests.classes) {
                try {
                    console.log(`[VisbalExt.TestClassExplorerView] Running test class: ${className}`);
                    const result = await this._metadataService.runTests(className);
                    if (result) {
                        results.push(result);
                    }
                } catch (error: any) {
                    console.error(`[VisbalExt.TestClassExplorerView] Error running test class ${className}:`, error);
                }
            }
            
            // Run method tests
            for (const { className, methodName } of tests.methods) {
                try {
                    console.log(`[VisbalExt.VisbalExt.TestClassExplorerView] Running test method: ${className}.${methodName}`);
                    const result = await this._metadataService.runTests(className, methodName);
                    if (result) {
                        results.push(result);
                    }
                } catch (error: any) {
                    console.error(`[VisbalExt.TestClassExplorerView] Error running test method ${className}.${methodName}:`, error);
                }
            }
            
            // Combine results
            const combinedResult = this._combineTestResults(results);
            
            // Send the combined results to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: combinedResult
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            console.error('[VisbalExt.TestClassExplorerView] Error running selected tests:', error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }
    
    private _combineTestResults(results: any[]): any {
        if (!results || results.length === 0) {
            return {
                summary: {
                    outcome: 'Failed',
                    testsRan: 0,
                    passing: 0,
                    failing: 0,
                    skipped: 0,
                    testTotalTime: 0
                },
                tests: []
            };
        }
        
        // If only one result, return it directly
        if (results.length === 1) {
            return results[0];
        }
        
        // Combine multiple results
        const combinedTests = [];
        let totalTests = 0;
        let totalPassing = 0;
        let totalFailing = 0;
        let totalSkipped = 0;
        let totalTime = 0;
        
        for (const result of results) {
            if (result.tests) {
                combinedTests.push(...result.tests);
            }
            
            if (result.summary) {
                totalTests += result.summary.testsRan || 0;
                totalPassing += result.summary.passing || 0;
                totalFailing += result.summary.failing || 0;
                totalSkipped += result.summary.skipped || 0;
                totalTime += result.summary.testTotalTime || 0;
            }
        }
        
        return {
            summary: {
                outcome: totalFailing > 0 ? 'Failed' : 'Passed',
                testsRan: totalTests,
                passing: totalPassing,
                failing: totalFailing,
                skipped: totalSkipped,
                testTotalTime: totalTime
            },
            tests: combinedTests
        };
    }
    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Use a nonce to only allow specific scripts to be run
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <title>Test Class Explorer</title>
            <link href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'))}" rel="stylesheet" />
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 5px;
                    margin: 0;
                    height: 100vh;
                    overflow: hidden;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                }
                .split-container {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-height: 0;
                    position: relative;
                }
                .test-classes-container {
                    flex: 1;
                    overflow: auto;
                    margin-top: 5px;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 5px;
                    min-height: 100px;
                }
                .bottom-container {
                    height: 400px;
                    min-height: 100px;
                    overflow: auto;
                    margin-top: 5px;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 5px;
                    resize: vertical;
                }
                .resizer {
                    height: 5px;
                    background: var(--vscode-panel-border);
                    cursor: ns-resize;
                    margin: 5px 0;
                }
                .actions {
                    margin-bottom: 5px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    margin: 2px;
                    font-size: 12px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .icon-button {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    padding: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--vscode-editor-foreground);
                    border-radius: 3px;
                }
                .icon-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                .icon-button.refresh {
                    color: var(--vscode-symbolIcon-colorForeground);
                }
                .icon-button.run {
                    color: #3fb950; /* GitHub green color for play button */
                    margin-left: auto;
                }
                .loading {
                    display: flex;
                    align-items: center;
                    margin: 5px 0;
                }
                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--vscode-editor-foreground);
                    border-radius: 50%;
                    border-top-color: transparent;
                    animation: spin 1s linear infinite;
                    margin-right: 8px;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .hidden {
                    display: none !important;
                }
                .error-container {
                    margin: 5px 0;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .notification-container {
                    margin: 5px 0;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    color: var(--vscode-inputValidation-infoForeground);
                }
                .test-classes-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                }
                .test-class-item {
                    padding: 3px 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .test-class-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .test-class-name {
                    margin-left: 5px;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    padding-right: 8px;
                }
                .test-methods-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                }
                .test-method-item {
                    padding: 2px 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    margin-left: 12px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .test-method-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .test-method-name {
                    margin-left: 2px;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    padding-right: 4px;
                }
                .icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                    text-align: center;
                    flex-shrink: 0;
                }
                .test-status {
                    margin-right: 2px;
                    color: var(--vscode-testing-iconPassed);
                }
                .test-status.failed {
                    color: var(--vscode-testing-iconFailed);
                }
                .test-status.running {
                    animation: spin 1s linear infinite;
                }
                .no-data {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    margin: 10px 0;
                    display: none;
                }
                .footer-note {
                    margin-top: 5px;
                    font-size: 0.8em;
                    color: var(--vscode-descriptionForeground);
                }
                .checkbox {
                    margin: 0 3px;
                    cursor: pointer;
                }
                .checkbox-container {
                    display: flex;
                    align-items: center;
                    margin-right: 0;
                }
                .selection-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                #runSelectedButton {
                    display: none;
                }
                #runSelectedButton:not([disabled]) {
                    cursor: pointer;
                    opacity: 1;
                }
                #runSelectedButton[disabled] {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .selection-count {
                    margin-right: 8px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .codicon {
                    font-size: 14px;
                    line-height: 14px;
                    width: 14px;
                    height: 14px;
                    display: inline-block;
                    text-align: center;
                    vertical-align: middle;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="actions">
                    <div class="selection-actions">
                        <span id="selectionCount" class="selection-count">0 selected</span>
                        <button id="runSelectedButton" class="button" disabled>Run Selected</button>
                    </div>
                    <button id="refreshButton" class="icon-button refresh" title="Refresh Test Classes">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z"/>
                        </svg>
                    </button>
                </div>
                <div id="loading" class="loading hidden">
                    <div class="spinner"></div>
                    <span>Loading test classes...</span>
                </div>
                <div id="notificationContainer" class="notification-container hidden">
                    <div class="notification-message" id="notificationMessage"></div>
                </div>
                <div id="errorContainer" class="error-container hidden">
                    <div class="error-message" id="errorMessage"></div>
                </div>
                <div class="split-container">
                    <div id="testClassesContainer" class="test-classes-container">
                        <div id="noTestClasses" class="no-data">
                            No test classes found. Click the refresh button to fetch test classes.
                        </div>
                        <div id="testClassesList"></div>
                    </div>
                    <div class="resizer" id="resizer"></div>
                    <div class="bottom-container" id="bottomContainer">
                        <h3>Test Results</h3>
                        <div id="testResults">No test results available</div>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    const refreshButton = document.getElementById('refreshButton');
                    const runSelectedButton = document.getElementById('runSelectedButton');
                    const selectionCount = document.getElementById('selectionCount');
                    const loading = document.getElementById('loading');
                    const errorContainer = document.getElementById('errorContainer');
                    const errorMessage = document.getElementById('errorMessage');
                    const notificationContainer = document.getElementById('notificationContainer');
                    const notificationMessage = document.getElementById('notificationMessage');
                    const testClassesList = document.getElementById('testClassesList');
                    const noTestClasses = document.getElementById('noTestClasses');
                    
                    // Track selected tests
                    const selectedTests = {
                        classes: {},
                        methods: {},
                        count: 0
                    };
                    
                    // Event listeners
                    refreshButton.addEventListener('click', () => {
                        fetchTestClasses(true);
                    });
                    
                    runSelectedButton.addEventListener('click', () => {
                        runSelectedTests();
                    });
                    
                    // Functions
                    function fetchTestClasses(forceRefresh = false) {
                        console.log('[VisbalExt.TestClassExplorerView] Fetching test classes...');
                        showLoading();
                        hideError();
                        hideNotification();
                        vscode.postMessage({ 
                            command: 'fetchTestClasses',
                            forceRefresh: forceRefresh 
                        });
                    }
                    
                    function showLoading() {
                        loading.classList.remove('hidden');
                    }
                    
                    function hideLoading() {
                        loading.classList.add('hidden');
                    }
                    
                    function showError(message) {
                        errorMessage.textContent = message;
                        errorContainer.classList.remove('hidden');
                    }
                    
                    function hideError() {
                        errorContainer.classList.add('hidden');
                    }
                    
                    function showNotification(message) {
                        notificationMessage.textContent = message;
                        notificationContainer.classList.remove('hidden');
                    }
                    
                    function hideNotification() {
                        notificationContainer.classList.add('hidden');
                    }
                    
                    function updateSelectionCount() {
                        const count = selectedTests.count;
                        selectionCount.textContent = count + ' selected';
                        runSelectedButton.style.display = count > 0 ? 'inline-block' : 'none';
                        runSelectedButton.disabled = count === 0;
                    }
                    
                    function toggleClassSelection(className, checkbox) {
                        const isChecked = checkbox.checked;
                        
                        // Update the class selection state
                        if (isChecked) {
                            if (!selectedTests.classes[className]) {
                                selectedTests.classes[className] = true;
                                selectedTests.count++;
                            }
                        } else {
                            if (selectedTests.classes[className]) {
                                delete selectedTests.classes[className];
                                selectedTests.count--;
                            }
                            
                            // Also uncheck all methods of this class
                            const methodCheckboxes = document.querySelectorAll('.method-checkbox[data-class="' + className + '"]');
                            methodCheckboxes.forEach(methodCheckbox => {
                                if (methodCheckbox.checked) {
                                    methodCheckbox.checked = false;
                                    const methodName = methodCheckbox.dataset.method;
                                    const key = className + '.' + methodName;
                                    if (selectedTests.methods[key]) {
                                        delete selectedTests.methods[key];
                                        selectedTests.count--;
                                    }
                                }
                            });
                        }
                        
                        updateSelectionCount();
                    }
                    
                    function toggleMethodSelection(className, methodName, checkbox) {
                        const isChecked = checkbox.checked;
                        const key = className + '.' + methodName;
                        
                        // Update the method selection state
                        if (isChecked) {
                            if (!selectedTests.methods[key]) {
                                selectedTests.methods[key] = true;
                                selectedTests.count++;
                            }
                        } else {
                            if (selectedTests.methods[key]) {
                                delete selectedTests.methods[key];
                                selectedTests.count--;
                            }
                            
                            // Also uncheck the class if it was checked
                            const classCheckbox = document.querySelector('.class-checkbox[data-class="' + className + '"]');
                            if (classCheckbox && classCheckbox.checked) {
                                classCheckbox.checked = false;
                                if (selectedTests.classes[className]) {
                                    delete selectedTests.classes[className];
                                    selectedTests.count--;
                                }
                            }
                        }
                        
                        updateSelectionCount();
                    }
                    
                    function runSelectedTests() {
                        const testsToRun = {
                            classes: Object.keys(selectedTests.classes),
                            methods: Object.entries(selectedTests.methods).map(([key]) => {
                                const [className, methodName] = key.split('.');
                                return { className, methodName };
                            })
                        };
                        
                        if (testsToRun.classes.length === 0 && testsToRun.methods.length === 0) {
                            showNotification('No tests selected to run.');
                            return;
                        }
                        
                        showLoading();
                        hideError();
                        hideNotification();
                        
                        vscode.postMessage({
                            command: 'runSelectedTests',
                            tests: testsToRun
                        });
                    }
                    
                    function renderTestClasses(testClasses) {
                        console.log('[VisbalExt.TestClassExplorerView] Rendering test classes:', testClasses);
                        testClassesList.innerHTML = '';
                        
                        // Reset selection state
                        selectedTests.classes = {};
                        selectedTests.methods = {};
                        selectedTests.count = 0;
                        updateSelectionCount();
                        
                        if (!testClasses || testClasses.length === 0) {
                            console.log('[VisbalExt.TestClassExplorerView] No test classes to render');
                            noTestClasses.classList.remove('hidden');
                            return;
                        }
                        
                        noTestClasses.classList.add('hidden');
                        
                        testClasses.forEach(function(testClass) {
                            console.log('[VisbalExt.TestClassExplorerView] Rendering test class:', testClass);
                            const li = document.createElement('li');
                            li.className = 'test-class-item';
                            li.dataset.className = testClass.name;
                            
                            // Add checkbox for class selection
                            const checkboxContainer = document.createElement('div');
                            checkboxContainer.className = 'checkbox-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'checkbox class-checkbox';
                            checkbox.dataset.class = testClass.name;
                            checkbox.addEventListener('change', function(e) {
                                e.stopPropagation();
                                toggleClassSelection(testClass.name, this);
                            });
                            
                            checkboxContainer.appendChild(checkbox);
                            
                            const expandIcon = document.createElement('i');
                            expandIcon.className = 'codicon codicon-chevron-right';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'test-class-name';
                            nameSpan.textContent = testClass.name || 'Unknown Class';
                            
                            // Create run button with play icon
                            const runButton = document.createElement('button');
                            runButton.className = 'icon-button run';
                            runButton.title = 'Run Test Class';
                            runButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/></svg>';
                            runButton.onclick = function(e) {
                                e.stopPropagation();
                                runTest(testClass.name);
                            };
                            
                            li.appendChild(checkboxContainer);
                            li.appendChild(expandIcon);
                            li.appendChild(nameSpan);
                            li.appendChild(runButton);
                            
                            // Create a container for test methods (initially hidden)
                            const methodsList = document.createElement('ul');
                            methodsList.className = 'test-methods-list hidden';
                            methodsList.dataset.loaded = 'false';
                            
                            // Toggle expand/collapse on click and load test methods if needed
                            li.onclick = function() {
                                if (methodsList.classList.contains('hidden')) {
                                    methodsList.classList.remove('hidden');
                                    expandIcon.className = 'codicon codicon-chevron-down';
                                    
                                    // Load test methods if not already loaded
                                    if (methodsList.dataset.loaded === 'false') {
                                        loadTestMethods(testClass.name, methodsList);
                                    }
                                } else {
                                    methodsList.classList.add('hidden');
                                    expandIcon.className = 'codicon codicon-chevron-right';
                                }
                            };
                            
                            testClassesList.appendChild(li);
                            testClassesList.appendChild(methodsList);
                        });
                    }
                    
                    function loadTestMethods(className, methodsListElement) {
                        console.log('[VisbalExt.TestClassExplorerView] Loading test methods for ' + className + '...');
                        
                        // Add loading indicator to the methods list
                        const loadingItem = document.createElement('li');
                        loadingItem.className = 'loading-item';
                        
                        const loadingSpinner = document.createElement('div');
                        loadingSpinner.className = 'spinner';
                        loadingSpinner.style.width = '12px';
                        loadingSpinner.style.height = '12px';
                        
                        const loadingText = document.createElement('span');
                        loadingText.textContent = ' Loading test methods...';
                        loadingText.style.marginLeft = '8px';
                        
                        loadingItem.appendChild(loadingSpinner);
                        loadingItem.appendChild(loadingText);
                        methodsListElement.appendChild(loadingItem);
                        
                        // Request test methods from the extension
                        vscode.postMessage({ 
                            command: 'fetchTestMethods',
                            className: className
                        });
                    }
                    
                    function renderTestMethods(className, testMethods) {
                        console.log('[VisbalExt.TestClassExplorerView] Rendering test methods for ' + className + ':', testMethods);
                        
                        // Find the methods list element for this class
                        const classItem = document.querySelector('.test-class-item[data-class-name="' + className + '"]');
                        if (!classItem) {
                            console.error('[VisbalExt.TestClassExplorerView]Could not find class item for ' + className);
                            return;
                        }
                        
                        const methodsList = classItem.nextElementSibling;
                        if (!methodsList || !methodsList.classList.contains('test-methods-list')) {
                            console.error('[VisbalExt.TestClassExplorerView] Could not find methods list for ' + className);
                            return;
                        }
                        
                        // Clear the methods list
                        methodsList.innerHTML = '';
                        
                        // Mark as loaded
                        methodsList.dataset.loaded = 'true';
                        
                        if (!testMethods || testMethods.length === 0) {
                            const noMethodsItem = document.createElement('li');
                            noMethodsItem.textContent = 'No test methods found in this class.';
                            noMethodsItem.style.fontStyle = 'italic';
                            noMethodsItem.style.padding = '5px';
                            methodsList.appendChild(noMethodsItem);
                            return;
                        }
                        
                        // Add each test method to the list
                        testMethods.forEach(function(method) {
                                const methodLi = document.createElement('li');
                                methodLi.className = 'test-method-item';
                            
                            // Add checkbox for method selection
                            const checkboxContainer = document.createElement('div');
                            checkboxContainer.className = 'checkbox-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'checkbox method-checkbox';
                            checkbox.dataset.class = className;
                            checkbox.dataset.method = method.name;
                            checkbox.addEventListener('change', function(e) {
                                e.stopPropagation();
                                toggleMethodSelection(className, method.name, this);
                            });
                            
                            checkboxContainer.appendChild(checkbox);
                                
                                const methodIcon = document.createElement('span');
                                methodIcon.className = 'icon test-status';
                                methodIcon.dataset.methodName = method.name;
                                methodIcon.dataset.className = className;
                                methodIcon.innerHTML = ''; // Remove the bullet point
                                
                                const methodNameSpan = document.createElement('span');
                                methodNameSpan.className = 'test-method-name';
                                methodNameSpan.textContent = method.name.trim();
                                
                            // Create run button with play icon
                                const runMethodButton = document.createElement('button');
                            runMethodButton.className = 'icon-button run';
                            runMethodButton.title = 'Run Test Method';
                            runMethodButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/></svg>';
                                runMethodButton.onclick = function(e) {
                                    e.stopPropagation();
                                runTest(className, method.name);
                                };
                                
                            methodLi.appendChild(checkboxContainer);
                                methodLi.appendChild(methodIcon);
                                methodLi.appendChild(methodNameSpan);
                                methodLi.appendChild(runMethodButton);
                                methodsList.appendChild(methodLi);
                            });
                    }
                    
                    function runTest(testClass, testMethod) {
                        console.log('[VisbalExt.TestClassExplorerView] -- runTest -- Running test:', testClass, testMethod);
                        showLoading();
                        hideError();
                        hideNotification();

                        // Update loading message to be more specific
                        loading.querySelector('span').textContent = 'Running ' + (testMethod ? 'method ' + testMethod : 'class ' + testClass) + '...';

                        // Update UI to show loading state
                        const selector = testMethod ? 
                            '.test-method-item[data-class="' + testClass + '"][data-method="' + testMethod + '"]' :
                            '.test-class-item[data-class-name="' + testClass + '"]';
                        
                        const testItem = document.querySelector(selector);
                        if (testItem) {
                            const runButton = testItem.querySelector('.run');
                            const statusIcon = testItem.querySelector('.test-status');
                            
                            if (runButton) {
                                runButton.style.display = 'none';
                            }
                            
                            if (statusIcon) {
                                statusIcon.innerHTML = '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/></svg>';
                            }
                        }

                        vscode.postMessage({ 
                            command: 'runTest',
                            testClass,
                            testMethod
                        });
                    }
                    
                    function handleTestResults(results) {
                        if (!results || !results.summary) {
                            showError('Invalid test results received');
                            return;
                        }

                        // Update test status icons and cache logs
                        if (results.tests) {
                            results.tests.forEach(test => {
                                const [className, methodName] = test.fullName.split('.');
                                const statusIcon = document.querySelector('.test-status[data-class-name="' + className + '"][data-method-name="' + methodName + '"]');
                                const runButton = statusIcon?.parentElement?.querySelector('.run');
                                
                                if (statusIcon) {
                                    statusIcon.innerHTML = test.outcome === 'Pass' ? 
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.4 3.686L5.707 12.379 1.6 8.272l.707-.707 3.4 3.4 8-8 .693.721z"/></svg>' :
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.657 3.757L9.414 8l4.243 4.242-.707.707L8.707 8.707l-4.243 4.243-.707-.707L8 8 3.757 3.757l.707-.707L8.707 7.293l4.243-4.243z"/></svg>';
                                    
                                    statusIcon.className = 'icon test-status ' + (test.outcome === 'Pass' ? 'passed' : 'failed');

                                    // Add log ID to the status icon for later reference
                                    if (test.apexLogId) {
                                        statusIcon.dataset.logId = test.apexLogId;
                                        statusIcon.style.cursor = 'pointer';
                                        statusIcon.title = 'Click to view test log';
                                        
                                        // Add click handler to view log
                                        statusIcon.onclick = (e) => {
                                            e.stopPropagation();
                                            vscode.postMessage({
                                                command: 'viewTestLog',
                                                logId: test.apexLogId,
                                                testName: test.fullName
                                            });
                                        };
                                    }
                                }
                                
                                if (runButton) {
                                    runButton.style.display = 'inline-flex';
                                }
                            });
                        }
                        
                        // Create a results container
                        const resultsContainer = document.createElement('div');
                        resultsContainer.className = 'test-results-container';
                        resultsContainer.style.margin = '10px 0';
                        resultsContainer.style.padding = '10px';
                        resultsContainer.style.backgroundColor = 'var(--vscode-editor-background)';
                        resultsContainer.style.border = '1px solid var(--vscode-panel-border)';
                        
                        // Add summary
                        const summary = results.summary;
                        const summaryDiv = document.createElement('div');
                        summaryDiv.style.marginBottom = '10px';
                        
                        const summaryTitle = document.createElement('h3');
                        summaryTitle.textContent = 'Test Results';
                        summaryTitle.style.margin = '0 0 5px 0';
                        summaryTitle.style.fontSize = '1.1em';
                        
                        const outcomeSpan = document.createElement('span');
                        outcomeSpan.textContent = 'Outcome: ' + summary.outcome;
                        outcomeSpan.style.display = 'block';
                        outcomeSpan.style.fontWeight = 'bold';
                        outcomeSpan.style.color = summary.outcome === 'Passed' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                        
                        const statsSpan = document.createElement('span');
                        statsSpan.textContent = 'Tests: ' + summary.testsRan + ', Passed: ' + summary.passing + 
                                               ', Failed: ' + summary.failing + ', Skipped: ' + summary.skipped;
                        statsSpan.style.display = 'block';
                        
                        const timeSpan = document.createElement('span');
                        timeSpan.textContent = 'Time: ' + summary.testTotalTime + 's';
                        timeSpan.style.display = 'block';
                        
                        summaryDiv.appendChild(summaryTitle);
                        summaryDiv.appendChild(outcomeSpan);
                        summaryDiv.appendChild(statsSpan);
                        summaryDiv.appendChild(timeSpan);
                        
                        // Add test details with log links
                        const detailsDiv = document.createElement('div');
                        
                        if (results.tests && results.tests.length > 0) {
                            const testsList = document.createElement('ul');
                            testsList.style.listStyleType = 'none';
                            testsList.style.padding = '0';
                            testsList.style.margin = '0';
                            
                            results.tests.forEach(function(test) {
                                const testItem = document.createElement('li');
                                testItem.style.padding = '5px 0';
                                testItem.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                
                                const testName = document.createElement('div');
                                testName.textContent = test.fullName;
                                testName.style.fontWeight = 'bold';
                                
                                const testOutcome = document.createElement('div');
                                testOutcome.textContent = 'Outcome: ' + test.outcome;
                                testOutcome.style.color = test.outcome === 'Pass' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                                
                                const testTime = document.createElement('div');
                                testTime.textContent = 'Runtime: ' + test.runTime + 's';
                                
                                testItem.appendChild(testName);
                                testItem.appendChild(testOutcome);
                                testItem.appendChild(testTime);
                                
                                // Add log link if available
                                if (test.apexLogId) {
                                    const logLink = document.createElement('a');
                                    logLink.href = '#';
                                    logLink.textContent = 'View Log';
                                    logLink.style.marginLeft = '10px';
                                    logLink.style.color = 'var(--vscode-textLink-foreground)';
                                    logLink.onclick = (e) => {
                                        e.preventDefault();
                                        vscode.postMessage({
                                            command: 'viewTestLog',
                                            logId: test.apexLogId,
                                            testName: test.fullName
                                        });
                                    };
                                    testTime.appendChild(logLink);
                                }
                                
                                // Add error message if any
                                if (test.message) {
                                    const errorMessage = document.createElement('div');
                                    errorMessage.textContent = 'Error: ' + test.message;
                                    errorMessage.style.color = 'var(--vscode-testing-iconFailed)';
                                    errorMessage.style.marginTop = '5px';
                                    testItem.appendChild(errorMessage);
                                }
                                
                                // Add stack trace if any
                                if (test.stackTrace) {
                                    const stackTrace = document.createElement('pre');
                                    stackTrace.textContent = test.stackTrace;
                                    stackTrace.style.fontSize = '0.9em';
                                    stackTrace.style.overflow = 'auto';
                                    stackTrace.style.backgroundColor = 'var(--vscode-editor-background)';
                                    stackTrace.style.padding = '5px';
                                    stackTrace.style.marginTop = '5px';
                                    testItem.appendChild(stackTrace);
                                }
                                
                                testsList.appendChild(testItem);
                            });
                            
                            detailsDiv.appendChild(testsList);
                        } else {
                            const noTests = document.createElement('div');
                            noTests.textContent = 'No test details available';
                            noTests.style.fontStyle = 'italic';
                            detailsDiv.appendChild(noTests);
                        }
                        
                        // Add close button
                        const closeButton = document.createElement('button');
                        closeButton.textContent = 'Close Results';
                        closeButton.className = 'button';
                        closeButton.style.marginTop = '10px';
                        closeButton.onclick = function() {
                            resultsContainer.remove();
                        };
                        
                        // Assemble the results container
                        resultsContainer.appendChild(summaryDiv);
                        resultsContainer.appendChild(detailsDiv);
                        resultsContainer.appendChild(closeButton);
                        
                        // Add to the DOM
                        const container = document.querySelector('.container');
                        container.insertBefore(resultsContainer, testClassesContainer);
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        console.log('[VisbalExt.TestClassExplorerView] Received message from extension:', message);
                        
                        switch (message.command) {
                            case 'testClassesLoaded':
                                hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test classes loaded:', message.testClasses);
                                renderTestClasses(message.testClasses);
                                break;
                            case 'testMethodsLoaded':
                                console.log('[VisbalExt.TestClassExplorerView] Test methods loaded:', message.testMethods);
                                renderTestMethods(message.className, message.testMethods);
                                break;
                            case 'testResultsLoaded':
                                hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test results loaded:', message.results);
                                handleTestResults(message.results);
                                break;
                            case 'error':
                                hideLoading();
                                console.error('[VisbalExt.TestClassExplorerView] Error:', message.message);
                                showError(message.message);
                                break;
                            case 'showNotification':
                                console.log('[VisbalExt.TestClassExplorerView] Notification:', message.message);
                                showNotification(message.message);
                                break;
                        }
                    });
                    
                    // Initial fetch without force refresh
                    fetchTestClasses(false);

                    // Add resizer functionality
                    const resizer = document.getElementById('resizer');
                    const bottomContainer = document.getElementById('bottomContainer');
                    let startY;
                    let startHeight;

                    resizer.addEventListener('mousedown', initResize, false);

                    function initResize(e) {
                        startY = e.clientY;
                        startHeight = parseInt(document.defaultView.getComputedStyle(bottomContainer).height, 10);
                        document.documentElement.addEventListener('mousemove', resize, false);
                        document.documentElement.addEventListener('mouseup', stopResize, false);
                    }

                    function resize(e) {
                        const newHeight = startHeight + (e.clientY - startY);
                        if (newHeight > 50) { // Minimum height
                            bottomContainer.style.height = newHeight + 'px';
                        }
                    }

                    function stopResize() {
                        document.documentElement.removeEventListener('mousemove', resize, false);
                        document.documentElement.removeEventListener('mouseup', stopResize, false);
                    }
                })();
            </script>
        </body>
        </html>`;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private async _viewTestLog(logId: string, testName: string) {
        try {
            console.log('[VisbalExt.TestClassExplorerView] Viewing test log:', { logId, testName });
            const logContent = await this._metadataService.getTestLog(logId);
            console.log('[VisbalExt.TestClassExplorerView] Log content retrieved:', !!logContent);
            
            if (logContent) {
                // Create a temporary file with the log content
                const tmpPath = join(vscode.workspace.rootPath || '', '.sf', 'logs', `${testName}-${new Date().getTime()}.log`);
                console.log('[VisbalExt.TestClassExplorerView] Creating log file at:', tmpPath);
                
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), logContent);
                });
                console.log('[VisbalExt.TestClassExplorerView] Log file created and opened');
            }
        } catch (error) {
            console.error('[VisbalExt.TestClassExplorerView] Error viewing test log:', {
                testName,
                logId,
                error: error
            });
            vscode.window.showWarningMessage(`[VisbalExt.TestClassExplorerView] Could not view log for test ${testName}: ${(error as Error).message}`);
        }
    }

    // Add method to clear cache if needed
    public clearCache() {
        console.log('[VisbalExt.TestClassExplorerView] Clearing test methods cache');
        this._cachedTestMethods.clear();
    }
}
