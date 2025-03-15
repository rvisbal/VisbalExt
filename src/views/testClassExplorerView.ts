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
        statusBarService: StatusBarService,
        metadataService: MetadataService
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
        this._metadataService = metadataService;
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
                case 'executeSoqlQuery':
                    await this._executeSoqlQuery(data.query);
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
            <html>
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
                    .header {
                        margin-bottom: 5px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .header-buttons {
                        display: flex;
                        align-items: center;
                        gap: 8px;
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
                    .subdivision-tabs {
                        display: flex;
                        background-color: var(--vscode-sideBarSectionHeader-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .subdivision-tab {
                        padding: 6px 10px;
                        cursor: pointer;
                        user-select: none;
                        font-size: 11px;
                        text-transform: uppercase;
                        border: none;
                        background: none;
                        color: var(--vscode-foreground);
                    }
                    .subdivision-tab.active {
                        background-color: var(--vscode-sideBar-background);
                        border-bottom: 2px solid var(--vscode-focusBorder);
                        font-weight: bold;
                    }
                    .subdivision-tab:hover:not(.active) {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .subdivision-content {
                        flex: 1;
                        overflow-y: auto;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        display: none;
                    }
                    .subdivision-content.active {
                        display: flex;
                        flex-direction: column;
                    }
                    .soql-container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        padding: 8px;
                    }
                    .soql-input-container {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .soql-input {
                        flex: 1;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 4px 8px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                    .soql-results {
                        flex: 1;
                        overflow: auto;
                        border: 1px solid var(--vscode-panel-border);
                    }
                    .soql-results-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    .soql-results-table th {
                        background-color: var(--vscode-editor-background);
                        position: sticky;
                        top: 0;
                        z-index: 1;
                        text-align: left;
                        padding: 4px 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .soql-results-table td {
                        padding: 4px 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        white-space: nowrap;
                    }
                    .soql-results-table tr:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .soql-status {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        padding: 4px 0;
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
                    <div class="header">
                        <div class="header-buttons">
                            <button id="refreshButton" class="icon-button" title="Refresh Test Classes">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c0 1.654-1.346 3-3 3-.795 0-1.545-.311-2.107-.868-.563-.567-.873-1.317-.873-2.111 0-1.431 1.007-2.632 2.351-2.929v2.926s2.528-2.087 2.984-2.461h.012l3.061-2.582-4.919-4.1h-1.137v2.404c-3.429.318-6.121 3.211-6.121 6.721 0 1.809.707 3.508 1.986 4.782 1.277 1.282 2.976 1.988 4.784 1.988 3.722 0 6.75-3.028 6.75-6.75 0-.469-.049-.929-.141-1.375z"/>
                                </svg>
                            </button>
                            <button id="runSelectedButton" class="icon-button" title="Run Selected Tests" style="display: none;">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/>
                                </svg>
                            </button>
                            <span id="selectionCount"></span>
                        </div>
                    </div>
                    <div id="errorContainer" class="error-container hidden">
                        <div id="errorMessage"></div>
                    </div>
                    <div id="notificationContainer" class="notification-container hidden">
                        <div id="notificationMessage"></div>
                    </div>
                    <div id="testProgress" class="test-progress">
                        <div class="test-progress-header">
                            <div class="test-progress-status"></div>
                            <div class="test-progress-bar">
                                <div class="test-progress-bar-fill"></div>
                            </div>
                        </div>
                        <div class="test-progress-details"></div>
                    </div>
                    <div id="noTestClasses" class="no-test-classes">
                        No test classes found. Click refresh to load test classes.
                    </div>
                    <ul id="testClassesList" class="test-classes-list"></ul>
                </div>
                <script nonce="${nonce}">
                    (function() {
                        const vscode = acquireVsCodeApi();
                        const refreshButton = document.getElementById('refreshButton');
                        const runSelectedButton = document.getElementById('runSelectedButton');
                        const selectionCount = document.getElementById('selectionCount');
                        const testProgress = document.getElementById('testProgress');
                        const progressDetails = testProgress.querySelector('.test-progress-details');
                        const progressStatus = document.querySelector('.test-progress-status');
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

    private async _executeSoqlQuery(query: string) {
        try {
            if (this._view) {
                const results = await this._metadataService.executeSoqlQuery(query);
                this._view.webview.postMessage({
                    command: 'soqlResultsLoaded',
                    results: {
                        records: results
                    }
                });
            }
        } catch (error: any) {
            console.error('Error executing SOQL query:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error executing query: ${error.message}`
                });
            }
        }
    }

    private async _handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'executeSoqlQuery':
                try {
                    const results = await this._metadataService.executeSoqlQuery(message.query);
                    if (this._view) {
                        this._view.webview.postMessage({
                            command: 'soqlResultsLoaded',
                            results: {
                                records: results
                            }
                        });
                    }
                } catch (error: any) {
                    console.error('Error executing SOQL query:', error);
                    if (this._view) {
                        this._view.webview.postMessage({
                            command: 'error',
                            message: `Error executing query: ${error.message}`
                        });
                    }
                }
                break;
        }
    }
}
