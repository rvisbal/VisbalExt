import * as vscode from 'vscode';
import { StatusBarService } from '../services/statusBarService';
import { MetadataService } from '../services/metadataService';
import { join } from 'path';
import { readFileSync } from 'fs';

export class TestClassExplorerView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testClassExplorerView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _statusBarService: StatusBarService;
    private _metadataService: MetadataService;

    constructor(
        extensionUri: vscode.Uri,
        statusBarService: StatusBarService
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
        this._metadataService = new MetadataService();
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
            console.log('Received message from webview:', data);
            switch (data.command) {
                case 'fetchTestClasses':
                    await this._fetchTestClasses();
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
            console.log('Initial fetch of test classes');
            if (this._view && this._view.visible) {
                this._fetchTestClasses();
            }
        }, 1000);
    }

    private async _fetchTestClasses() {
        try {
            this._statusBarService.showMessage('$(sync~spin) Fetching test classes...');
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                throw new Error('Salesforce Extension Pack is required to fetch test classes. Please install it from the VS Code marketplace.');
            }
            
            // Use MetadataService to get test classes
            const testClasses = await this._metadataService.getTestClasses();
            
            if (!testClasses || testClasses.length === 0) {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: 'No test classes found in the default org.'
                    });
                }
            }
            
            // Send the test classes to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testClassesLoaded',
                    testClasses
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            console.error('Error fetching test classes:', error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }

    private async _fetchTestMethods(className: string) {
        try {
            this._statusBarService.showMessage(`$(sync~spin) Fetching test methods for ${className}...`);
            
            // Use MetadataService to get test methods for the class
            const testMethods = await this._metadataService.getTestMethodsForClass(className);
            
            if (!testMethods || testMethods.length === 0) {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `No test methods found in ${className}.`
                    });
                }
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
            console.error(`Error fetching test methods for ${className}:`, error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }

    private async _runTest(testClass: string, testMethod?: string) {
        try {
            console.log('[TestClassExplorerView] Starting test execution:', { testClass, testMethod });
            this._statusBarService.showMessage(`$(beaker~spin) Running test: ${testClass}${testMethod ? '.' + testMethod : ''}`);
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                throw new Error('Salesforce Extension Pack is required to run tests. Please install it from the VS Code marketplace.');
            }
            
            // Use MetadataService to run tests
            console.log('[TestClassExplorerView] Calling MetadataService.runTests');
            const result = await this._metadataService.runTests(testClass, testMethod);
            console.log('[TestClassExplorerView] Test execution result:', result);
            
            if (!result) {
                throw new Error('Failed to run test. Please ensure you have an authorized Salesforce org and try again.');
            }

            // Get test logs if available
            if (result.tests && result.tests.length > 0) {
                console.log('[TestClassExplorerView] Processing test results for logs:', result.tests);
                for (const test of result.tests) {
                    console.log('[TestClassExplorerView] Processing test result:', {
                        testName: test.fullName,
                        outcome: test.outcome,
                        logId: test.apexLogId
                    });
                    
                    if (test.apexLogId) {
                        console.log('[TestClassExplorerView] Found log ID for test:', test.apexLogId);
                        try {
                            console.log('[TestClassExplorerView] Attempting to fetch log content for:', test.fullName);
                            const logContent = await this._metadataService.getTestLog(test.apexLogId);
                            console.log('[TestClassExplorerView] Log content retrieved:', !!logContent);
                            
                            if (logContent) {
                                // Create a temporary file with the log content
                                const tmpPath = join(vscode.workspace.rootPath || '', '.sf', 'logs', `${test.fullName}-${new Date().getTime()}.log`);
                                console.log('[TestClassExplorerView] Creating log file at:', tmpPath);
                                
                                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
                                const editor = await vscode.window.showTextDocument(document);
                                await editor.edit(editBuilder => {
                                    editBuilder.insert(new vscode.Position(0, 0), logContent);
                                });
                                console.log('[TestClassExplorerView] Log file created and opened');
                            }
                        } catch (error) {
                            console.error('[TestClassExplorerView] Error fetching test log:', {
                                testName: test.fullName,
                                logId: test.apexLogId,
                                error: error
                            });
                            vscode.window.showWarningMessage(`Could not fetch log for test ${test.fullName}: ${(error as Error).message}`);
                        }
                    } else {
                        console.log('[TestClassExplorerView] No log ID found for test:', test.fullName);
                    }
                }
            } else {
                console.log('[TestClassExplorerView] No test results found to process logs');
            }
            
            // Send the test results to the webview
            if (this._view) {
                console.log('[TestClassExplorerView] Sending test results to webview');
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: result
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            console.error('[TestClassExplorerView] Error in test execution:', error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
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
                    console.log(`[TestClassExplorerView] Running test class: ${className}`);
                    const result = await this._metadataService.runTests(className);
                    if (result) {
                        results.push(result);
                    }
                } catch (error: any) {
                    console.error(`[TestClassExplorerView] Error running test class ${className}:`, error);
                }
            }
            
            // Run method tests
            for (const { className, methodName } of tests.methods) {
                try {
                    console.log(`[TestClassExplorerView] Running test method: ${className}.${methodName}`);
                    const result = await this._metadataService.runTests(className, methodName);
                    if (result) {
                        results.push(result);
                    }
                } catch (error: any) {
                    console.error(`[TestClassExplorerView] Error running test method ${className}.${methodName}:`, error);
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
            console.error('Error running selected tests:', error);
            
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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Test Class Explorer</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 5px;
                    margin: 0;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    width: 100%;
                    overflow: hidden;
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
                .test-classes-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 5px;
                    min-height: 100px;
                    margin-bottom: 5px;
                }
                .subdivision-panel {
                    position: relative;
                    border-top: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                    min-height: 200px;
                    height: 300px;
                    resize: vertical;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .subdivision-header {
                    padding: 6px 8px;
                    background-color: var(--vscode-sideBarSectionHeader-background);
                    cursor: ns-resize;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    height: 28px;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                .subdivision-content {
                    flex: 1;
                    overflow-y: auto;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    padding: 4px 0;
                }
                .subdivision-content.expanded {
                    display: block;
                }
                .task-item {
                    padding: 6px 8px;
                    display: flex;
                    align-items: center;
                    font-size: 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .task-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .task-status {
                    margin-right: 8px;
                }
                .task-time {
                    color: var(--vscode-descriptionForeground);
                    margin-right: 8px;
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
                    margin-left: 20px;
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
                    padding-right: 8px;
                }
                .icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                    text-align: center;
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
                .test-progress {
                    margin: 5px 0;
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    display: none;
                }
                .test-progress.visible {
                    display: block;
                }
                .test-progress-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .test-progress-title {
                    font-weight: bold;
                    font-size: 12px;
                }
                .test-progress-status {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .test-progress-bar {
                    height: 4px;
                    background-color: var(--vscode-progressBar-background);
                    margin: 8px 0;
                    position: relative;
                    overflow: hidden;
                }
                .test-progress-bar-fill {
                    height: 100%;
                    background-color: var(--vscode-progressBar-foreground);
                    transition: width 0.3s ease;
                    position: absolute;
                    left: 0;
                    top: 0;
                }
                .test-progress-details {
                    font-size: 12px;
                    margin-top: 8px;
                }
                .test-progress-item {
                    display: flex;
                    align-items: center;
                    margin: 4px 0;
                    font-size: 11px;
                }
                .test-progress-item-status {
                    margin-right: 8px;
                }
                .test-progress-item.running {
                    color: var(--vscode-progressBar-foreground);
                }
                .test-progress-item.passed {
                    color: var(--vscode-testing-iconPassed);
                }
                .test-progress-item.failed {
                    color: var(--vscode-testing-iconFailed);
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
                <div id="testProgress" class="test-progress">
                    <div class="test-progress-header">
                        <div class="test-progress-title">Running Tests</div>
                        <div class="test-progress-status">0 of 0 completed</div>
                    </div>
                    <div class="test-progress-bar">
                        <div class="test-progress-bar-fill" style="width: 0%"></div>
                    </div>
                    <div class="test-progress-details"></div>
                </div>
                <div id="notificationContainer" class="notification-container hidden">
                    <div class="notification-message" id="notificationMessage"></div>
                </div>
                <div id="errorContainer" class="error-container hidden">
                    <div class="error-message" id="errorMessage"></div>
                </div>
                <div id="testClassesContainer" class="test-classes-container">
                    <div id="noTestClasses" class="no-data">
                        No test classes found. Click the refresh button to fetch test classes.
                    </div>
                    <div id="testClassesList"></div>
                </div>
                <div id="subdivisionPanel" class="subdivision-panel">
                    <div id="subdivisionHeader" class="subdivision-header">
                        <span class="subdivision-chevron">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10.072 8.024L5.715 3.667l.618-.62L11.5 8.215v.57L6.333 13.95l-.618-.619 4.357-4.357z" fill="currentColor"/>
                            </svg>
                        </span>
                        <span class="subdivision-title">RUNNING TASKS</span>
                    </div>
                    <div id="subdivisionContent" class="subdivision-content">
                        <div id="tasksList"></div>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    const refreshButton = document.getElementById('refreshButton');
                    const runSelectedButton = document.getElementById('runSelectedButton');
                    const selectionCount = document.getElementById('selectionCount');
                    const testProgress = document.getElementById('testProgress');
                    const progressDetails = testProgress.querySelector('.test-progress-details');
                    const progressStatus = testProgress.querySelector('.test-progress-status');
                    const progressBar = testProgress.querySelector('.test-progress-bar-fill');
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
                        fetchTestClasses();
                    });
                    
                    runSelectedButton.addEventListener('click', () => {
                        runSelectedTests();
                    });
                    
                    // Functions
                    function showLoading(message = 'Loading...') {
                        testProgress.classList.add('visible');
                        progressDetails.innerHTML = '';
                        const loadingItem = document.createElement('div');
                        loadingItem.className = 'test-progress-item running';
                        loadingItem.innerHTML = 
                            '<span class="test-progress-item-status">' +
                            '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16">' +
                            '<path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/>' +
                            '</svg>' +
                            '</span>' +
                            '<span>' + message + '</span>';
                        progressDetails.appendChild(loadingItem);
                        progressStatus.textContent = 'Loading...';
                        progressBar.style.width = '0%';
                    }
                    
                    function hideLoading() {
                        setTimeout(() => {
                            testProgress.classList.remove('visible');
                        }, 1000);
                    }
                    
                    function fetchTestClasses() {
                        console.log('Fetching test classes...');
                        showLoading('Fetching test classes...');
                        hideError();
                        hideNotification();
                        vscode.postMessage({ command: 'fetchTestClasses' });
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
                        console.log('Rendering test classes:', testClasses);
                        testClassesList.innerHTML = '';
                        
                        // Reset selection state
                        selectedTests.classes = {};
                        selectedTests.methods = {};
                        selectedTests.count = 0;
                        updateSelectionCount();
                        
                        if (!testClasses || testClasses.length === 0) {
                            console.log('No test classes to render');
                            noTestClasses.classList.remove('hidden');
                            return;
                        }
                        
                        noTestClasses.classList.add('hidden');
                        
                        testClasses.forEach(function(testClass) {
                            console.log('Rendering test class:', testClass);
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
                            
                            const expandIcon = document.createElement('span');
                            expandIcon.className = 'icon';
                            expandIcon.textContent = '▶';
                            
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
                                    expandIcon.textContent = '▼';
                                    
                                    // Load test methods if not already loaded
                                    if (methodsList.dataset.loaded === 'false') {
                                        loadTestMethods(testClass.name, methodsList);
                                    }
                                } else {
                                    methodsList.classList.add('hidden');
                                    expandIcon.textContent = '▶';
                                }
                            };
                            
                            testClassesList.appendChild(li);
                            testClassesList.appendChild(methodsList);
                        });
                    }
                    
                    function loadTestMethods(className, methodsListElement) {
                        console.log('Loading test methods for ' + className + '...');
                        methodsListElement.innerHTML = '';
                        
                        // Add loading indicator to the methods list
                        const loadingItem = document.createElement('div');
                        loadingItem.className = 'test-progress-item running';
                        loadingItem.style.marginLeft = '20px';
                        loadingItem.innerHTML = 
                            '<span class="test-progress-item-status">' +
                            '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16">' +
                            '<path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/>' +
                            '</svg>' +
                            '</span>' +
                            '<span>Loading test methods...</span>';
                        methodsListElement.appendChild(loadingItem);
                        
                        // Request test methods from the extension
                        vscode.postMessage({ 
                            command: 'fetchTestMethods',
                            className: className
                        });
                    }
                    
                    function renderTestMethods(className, testMethods) {
                        console.log('Rendering test methods for ' + className + ':', testMethods);
                        
                        // Find the methods list element for this class
                        const classItem = document.querySelector('.test-class-item[data-class-name="' + className + '"]');
                        if (!classItem) {
                            console.error('Could not find class item for ' + className);
                            return;
                        }
                        
                        const methodsList = classItem.nextElementSibling;
                        if (!methodsList || !methodsList.classList.contains('test-methods-list')) {
                            console.error('Could not find methods list for ' + className);
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
                        showLoading();
                        hideError();
                        hideNotification();
                        
                        const testName = testMethod ? testClass + '.' + testMethod : testClass;
                        addTaskEntry('Running test: ' + testName, '$(beaker~spin)');
                        
                        // Initialize progress tracking
                        const testProgress = document.getElementById('testProgress');
                        const progressDetails = testProgress.querySelector('.test-progress-details');
                        const progressStatus = testProgress.querySelector('.test-progress-status');
                        const progressBar = testProgress.querySelector('.test-progress-bar-fill');
                        
                        testProgress.classList.add('visible');
                        progressDetails.innerHTML = '';
                        
                        const testItem = document.createElement('div');
                        testItem.className = 'test-progress-item running';
                        testItem.innerHTML = 
                            '<span class="test-progress-item-status">' +
                            '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16">' +
                            '<path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/>' +
                            '</svg>' +
                            '</span>' +
                            '<span>' + testName + '</span>';
                        progressDetails.appendChild(testItem);
                        progressStatus.textContent = 'Running...';
                        progressBar.style.width = '0%';

                        // Update UI to show loading state
                        const selector = testMethod ? 
                            '.test-method-item[data-class="' + testClass + '"][data-method="' + testMethod + '"]' :
                            '.test-class-item[data-class-name="' + testClass + '"]';
                        
                        const testListItem = document.querySelector(selector);
                        if (testListItem) {
                            const runButton = testListItem.querySelector('.run');
                            const statusIcon = testListItem.querySelector('.test-status');
                            
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

                        // Update progress UI
                        const testProgress = document.getElementById('testProgress');
                        const progressDetails = testProgress.querySelector('.test-progress-details');
                        const progressStatus = testProgress.querySelector('.test-progress-status');
                        const progressBar = testProgress.querySelector('.test-progress-bar-fill');
                        
                        const summary = results.summary;
                        const total = summary.testsRan;
                        const completed = summary.passing + summary.failing;
                        const percentage = (completed / total) * 100;
                        
                        progressBar.style.width = percentage + '%';
                        progressStatus.textContent = completed + ' of ' + total + ' completed';
                        
                        // Add summary to task list
                        const summaryMessage = 'Tests completed - Passed: ' + summary.passing + 
                                            ', Failed: ' + summary.failing + 
                                            ', Skipped: ' + summary.skipped +
                                            ', Time: ' + summary.testTotalTime + 's';
                        const status = summary.outcome === 'Passed' ? '$(check)' : '$(x)';
                        addTaskEntry(summaryMessage, status);
                        
                        // Update progress details
                        if (results.tests) {
                            progressDetails.innerHTML = '';
                            results.tests.forEach(test => {
                                const testItem = document.createElement('div');
                                testItem.className = 'test-progress-item ' + (test.outcome === 'Pass' ? 'passed' : 'failed');
                                
                                const icon = test.outcome === 'Pass' ? 
                                    '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.4 3.686L5.707 12.379 1.6 8.272l.707-.707 3.4 3.4 8-8 .693.721z"/></svg>' :
                                    '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.657 3.757L9.414 8l4.243 4.242-.707.707L8.707 8.707l-4.243 4.243-.707-.707L8 8 3.757 3.757l.707-.707L8.707 7.293l4.243-4.243z"/></svg>';
                                
                                testItem.innerHTML = 
                                    '<span class="test-progress-item-status">' + icon + '</span>' +
                                    '<span>' + test.fullName + '</span>' +
                                    '<span style="margin-left: auto">' + test.runTime + 's</span>';
                                progressDetails.appendChild(testItem);
                                
                                // Add individual test result to task list
                                const testStatus = test.outcome === 'Pass' ? '$(check)' : '$(x)';
                                const testMessage = test.fullName + ' - ' + test.outcome + 
                                                 (test.message ? ' - ' + test.message : '') +
                                                 ' (' + test.runTime + 's)';
                                addTaskEntry(testMessage, testStatus);
                            });
                        }

                        // Hide progress after a delay
                        setTimeout(() => {
                            testProgress.classList.remove('visible');
                        }, 5000);
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        console.log('Received message from extension:', message);
                        
                        switch (message.command) {
                            case 'testClassesLoaded':
                                hideLoading();
                                console.log('Test classes loaded:', message.testClasses);
                                renderTestClasses(message.testClasses);
                                break;
                            case 'testMethodsLoaded':
                                console.log('Test methods loaded:', message.testMethods);
                                renderTestMethods(message.className, message.testMethods);
                                break;
                            case 'testResultsLoaded':
                                hideLoading();
                                console.log('Test results loaded:', message.results);
                                handleTestResults(message.results);
                                break;
                            case 'error':
                                hideLoading();
                                console.error('Error:', message.message);
                                showError(message.message);
                                break;
                            case 'showNotification':
                                console.log('Notification:', message.message);
                                showNotification(message.message);
                                break;
                        }
                    });
                    
                    // Initialize subdivision panel
                    const subdivisionHeader = document.getElementById('subdivisionHeader');
                    const subdivisionChevron = subdivisionHeader.querySelector('.subdivision-chevron');
                    const subdivisionContent = document.getElementById('subdivisionContent');
                    const tasksList = document.getElementById('tasksList');

                    subdivisionHeader.addEventListener('click', () => {
                        subdivisionChevron.classList.toggle('collapsed');
                        subdivisionContent.classList.toggle('expanded');
                    });

                    function addTaskEntry(message, status = '') {
                        const taskItem = document.createElement('div');
                        taskItem.className = 'task-item';
                        
                        const time = new Date().toLocaleTimeString();
                        taskItem.innerHTML = 
                            '<span class="task-time">' + time + '</span>' +
                            '<span class="task-status">' + status + '</span>' +
                            '<span class="task-message">' + message + '</span>';
                        
                        tasksList.appendChild(taskItem);
                        subdivisionContent.scrollTop = subdivisionContent.scrollHeight;
                        
                        // Ensure the subdivision is expanded when new tasks are added
                        if (!subdivisionContent.classList.contains('expanded')) {
                            subdivisionChevron.classList.remove('collapsed');
                            subdivisionContent.classList.add('expanded');
                        }
                    }
                    
                    // Initial fetch
                    fetchTestClasses();
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
            console.log('[TestClassExplorerView] Viewing test log:', { logId, testName });
            const logContent = await this._metadataService.getTestLog(logId);
            console.log('[TestClassExplorerView] Log content retrieved:', !!logContent);
            
            if (logContent) {
                // Create a temporary file with the log content
                const tmpPath = join(vscode.workspace.rootPath || '', '.sf', 'logs', `${testName}-${new Date().getTime()}.log`);
                console.log('[TestClassExplorerView] Creating log file at:', tmpPath);
                
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), logContent);
                });
                console.log('[TestClassExplorerView] Log file created and opened');
            }
        } catch (error) {
            console.error('[TestClassExplorerView] Error viewing test log:', {
                testName,
                logId,
                error: error
            });
            vscode.window.showWarningMessage(`Could not view log for test ${testName}: ${(error as Error).message}`);
        }
    }
}
