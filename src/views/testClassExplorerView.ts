import * as vscode from 'vscode';
import { StatusBarService } from '../services/statusBarService';
import { join } from 'path';
import { readFileSync } from 'fs';

export class TestClassExplorerView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testClassExplorerView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _statusBarService: StatusBarService;

    constructor(
        extensionUri: vscode.Uri,
        statusBarService: StatusBarService
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
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
                case 'runTest':
                    await this._runTest(data.testClass, data.testMethod);
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
                console.log('Salesforce Extension Pack is not installed. Using mock data.');
                // Use mock data instead of throwing an error
                const mockData = this._getMockTestClasses();
                console.log('Mock data:', mockData);
                
                if (this._view) {
                    // First send the notification
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: 'Salesforce Extension Pack is not installed. Using mock data for demonstration.'
                    });
                    
                    // Then send the test classes
                    setTimeout(() => {
                        if (this._view) {
                            console.log('Sending mock test classes to webview');
                            this._view.webview.postMessage({
                                command: 'testClassesLoaded',
                                testClasses: mockData
                            });
                        }
                    }, 500);
                }
                
                this._statusBarService.hide();
                return;
            }
            
            // Try different command formats
            let result: any = null;
            let error: any = null;
            
            try {
                // Try the new command format
                result = await vscode.commands.executeCommand('sf.apex.class.list') as any;
            } catch (err) {
                error = err;
                try {
                    // Try the old command format
                    result = await vscode.commands.executeCommand('sfdx.force.apex.class.list') as any;
                } catch (err2) {
                    error = err2;
                    // Try to use CLI directly as a fallback
                    try {
                        const cliOutput = await this._executeCliCommand('sf apex class list --json');
                        if (cliOutput) {
                            result = JSON.parse(cliOutput).result;
                        }
                    } catch (err3) {
                        try {
                            const cliOutput = await this._executeCliCommand('sfdx force:apex:class:list --json');
                            if (cliOutput) {
                                result = JSON.parse(cliOutput).result;
                            }
                        } catch (err4) {
                            error = err4;
                        }
                    }
                }
            }
            
            if (!result) {
                // If we couldn't get real data, use mock data for demonstration
                console.log('Using mock data for test classes');
                result = this._getMockTestClasses();
                console.log('Mock data:', result);
                
                // Show a message to the user
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: 'Using mock data. Salesforce CLI commands not available or no active Salesforce project found.'
                    });
                }
            }
            
            // Filter for test classes
            const testClasses = await this._filterTestClasses(result);
            console.log('Filtered test classes:', testClasses);
            
            // Send the test classes to the webview
            if (this._view) {
                console.log('Sending test classes to webview');
                this._view.webview.postMessage({
                    command: 'testClassesLoaded',
                    testClasses
                });
            }
            
            this._statusBarService.hide();
        } catch (error) {
            this._statusBarService.hide();
            console.error('Error fetching test classes:', error);
            
            // Use mock data as fallback
            const mockData = this._getMockTestClasses();
            console.log('Mock data (fallback):', mockData);
            
            if (this._view) {
                // Show error but still load mock data
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error instanceof Error ? error.message : String(error)}`
                });
                
                // Send the test classes after a short delay
                setTimeout(() => {
                    if (this._view) {
                        console.log('Sending mock test classes to webview (fallback)');
                        this._view.webview.postMessage({
                            command: 'testClassesLoaded',
                            testClasses: mockData
                        });
                    }
                }, 500);
                
                this._view.webview.postMessage({
                    command: 'showNotification',
                    message: 'Using mock data. Salesforce CLI commands not available or no active Salesforce project found.'
                });
            }
        }
    }
    
    private _getMockTestClasses(): any[] {
        // Return some mock test classes for demonstration
        return [
            {
                id: 'mockId1',
                name: 'AccountTest',
                status: 'Active',
                body: 'public class AccountTest { @isTest static void testMethod1() {} @isTest static void testMethod2() {} }'
            },
            {
                id: 'mockId2',
                name: 'ContactTest',
                status: 'Active',
                body: 'public class ContactTest { @isTest static void testContactCreation() {} }'
            },
            {
                id: 'mockId3',
                name: 'OpportunityTest',
                status: 'Active',
                body: 'public class OpportunityTest { @isTest static void testOpportunityStages() {} }'
            },
            {
                id: 'mockId4',
                name: 'LeadTest',
                status: 'Active',
                body: 'public class LeadTest { @isTest static void testLeadConversion() {} @isTest static void testLeadAssignment() {} }'
            },
            {
                id: 'mockId5',
                name: 'CaseTest',
                status: 'Active',
                body: 'public class CaseTest { @isTest static void testCaseCreation() {} }'
            }
        ];
    }
    
    private async _executeCliCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            exec(command, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (stderr) {
                    reject(new Error(stderr));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    private async _filterTestClasses(apexClasses: any[]): Promise<any[]> {
        if (!apexClasses || !Array.isArray(apexClasses)) {
            return [];
        }
        
        // In a real implementation, you would parse the class files to identify test classes
        // For now, we'll filter classes with "Test" in their name or that have @isTest in their body
        return apexClasses.filter(cls => {
            const name = cls.name || '';
            const body = cls.body || '';
            return name.includes('Test') || 
                   body.includes('@isTest') || 
                   body.includes('testMethod');
        });
    }

    private async _runTest(testClass: string, testMethod?: string) {
        try {
            this._statusBarService.showMessage(`$(beaker~spin) Running test: ${testClass}${testMethod ? '.' + testMethod : ''}`);
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                console.log('Salesforce Extension Pack is not installed. Using mock data for test results.');
                // Use mock data instead of throwing an error
                const mockResults = this._getMockTestResults(testClass, testMethod);
                
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testResultsLoaded',
                        results: mockResults
                    });
                    
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: 'Salesforce Extension Pack is not installed. Using mock data for demonstration.'
                    });
                }
                
                this._statusBarService.hide();
                return;
            }
            
            // Try different command formats
            let result: any = null;
            let error: any = null;
            
            try {
                // Build the command to run the test
                let command = 'sf.apex.test.run';
                let args = testMethod 
                    ? { tests: [`${testClass}.${testMethod}`] }
                    : { classNames: [testClass] };
                
                // Execute the test with new command format
                result = await vscode.commands.executeCommand(command, args);
            } catch (err) {
                error = err;
                try {
                    // Try the old command format
                    let command = 'sfdx.force.apex.test.run';
                    let args = testMethod 
                        ? { tests: [`${testClass}.${testMethod}`] }
                        : { classNames: [testClass] };
                    
                    // Execute the test with old command format
                    result = await vscode.commands.executeCommand(command, args);
                } catch (err2) {
                    error = err2;
                    // Try to use CLI directly as a fallback
                    try {
                        const cliCommand = testMethod
                            ? `sf apex test run -t ${testClass}.${testMethod} --json`
                            : `sf apex test run -n ${testClass} --json`;
                        const cliOutput = await this._executeCliCommand(cliCommand);
                        if (cliOutput) {
                            result = JSON.parse(cliOutput).result;
                        }
                    } catch (err3) {
                        try {
                            const cliCommand = testMethod
                                ? `sfdx force:apex:test:run -t ${testClass}.${testMethod} --json`
                                : `sfdx force:apex:test:run -n ${testClass} --json`;
                            const cliOutput = await this._executeCliCommand(cliCommand);
                            if (cliOutput) {
                                result = JSON.parse(cliOutput).result;
                            }
                        } catch (err4) {
                            error = err4;
                        }
                    }
                }
            }
            
            if (!result) {
                // If we couldn't run the test, use mock data for demonstration
                console.log('Using mock data for test results');
                result = this._getMockTestResults(testClass, testMethod);
                
                // Show a message to the user
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: 'Using mock data. Salesforce CLI commands not available or no active Salesforce project found.'
                    });
                }
            }
            
            // Send the test results to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: result
                });
            }
            
            this._statusBarService.hide();
        } catch (error) {
            this._statusBarService.hide();
            console.error('Error running test:', error);
            
            // Use mock data as fallback
            const mockResults = this._getMockTestResults(testClass, testMethod);
            
            if (this._view) {
                // Show error but still load mock data
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error instanceof Error ? error.message : String(error)}`
                });
                
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: mockResults
                });
                
                this._view.webview.postMessage({
                    command: 'showNotification',
                    message: 'Using mock data. Salesforce CLI commands not available or no active Salesforce project found.'
                });
            }
        }
    }
    
    private _getMockTestResults(testClass: string, testMethod?: string): any {
        // Return mock test results for demonstration
        const now = new Date().toISOString();
        const testMethodName = testMethod || 'testMethod1';
        
        return {
            summary: {
                outcome: 'Passed',
                testsRan: 1,
                passing: 1,
                failing: 0,
                skipped: 0,
                passRate: '100%',
                failRate: '0%',
                testStartTime: now,
                testExecutionTime: 1.05,
                testTotalTime: 1.05,
                commandTime: 2.0,
                hostname: 'MockHost',
                orgId: '00D000000000000',
                username: 'mock@example.com',
                testRunId: 'mockRunId',
                userId: '005000000000000'
            },
            tests: [
                {
                    id: 'mockTestId',
                    queueItemId: 'mockQueueItemId',
                    stackTrace: null,
                    message: null,
                    asyncApexJobId: 'mockAsyncJobId',
                    methodName: testMethodName,
                    outcome: 'Pass',
                    apexLogId: 'mockLogId',
                    apexClass: {
                        id: 'mockClassId',
                        name: testClass,
                        namespacePrefix: null
                    },
                    runTime: 1,
                    testTimestamp: now,
                    fullName: `${testClass}.${testMethodName}`
                }
            ]
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
                    padding: 10px;
                    margin: 0;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                }
                h1 {
                    font-size: 1.2em;
                    margin-bottom: 10px;
                    color: var(--vscode-editor-foreground);
                }
                .actions {
                    margin-bottom: 10px;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    margin: 2px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .loading {
                    display: flex;
                    align-items: center;
                    margin: 10px 0;
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
                    margin: 10px 0;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .notification-container {
                    margin: 10px 0;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    color: var(--vscode-inputValidation-infoForeground);
                }
                .test-classes-container {
                    flex: 1;
                    overflow: auto;
                    margin-top: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 5px;
                    min-height: 200px;
                }
                .test-class-item {
                    padding: 8px;
                    margin-bottom: 5px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                }
                .test-class-header {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                }
                .test-class-name {
                    font-weight: bold;
                    margin-left: 5px;
                    flex-grow: 1;
                }
                .test-methods {
                    margin-top: 5px;
                    margin-left: 20px;
                    padding-top: 5px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: none;
                }
                .test-method {
                    padding: 3px 0;
                    display: flex;
                    align-items: center;
                }
                .test-method-name {
                    flex-grow: 1;
                }
                .icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                    text-align: center;
                }
                .no-data {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    margin: 10px 0;
                }
                .footer-note {
                    margin-top: 10px;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Salesforce Test Classes</h1>
                <div class="actions">
                    <button id="refreshButton" class="button">Refresh Test Classes</button>
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
                <div id="testClassesContainer" class="test-classes-container">
                    <div id="noTestClasses" class="no-data">
                        No test classes found. Click Refresh to fetch test classes.
                    </div>
                    <div id="testClassesList"></div>
                </div>
                <div class="footer-note">
                    Note: This view uses mock data when Salesforce Extension Pack is not installed.
                </div>
            </div>
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    const refreshButton = document.getElementById('refreshButton');
                    const loading = document.getElementById('loading');
                    const errorContainer = document.getElementById('errorContainer');
                    const errorMessage = document.getElementById('errorMessage');
                    const notificationContainer = document.getElementById('notificationContainer');
                    const notificationMessage = document.getElementById('notificationMessage');
                    const testClassesContainer = document.getElementById('testClassesContainer');
                    const testClassesList = document.getElementById('testClassesList');
                    const noTestClasses = document.getElementById('noTestClasses');
                    
                    // Event listeners
                    refreshButton.addEventListener('click', function() {
                        console.log('Refresh button clicked');
                        fetchTestClasses();
                    });
                    
                    // Functions
                    function fetchTestClasses() {
                        console.log('Fetching test classes...');
                        showLoading();
                        hideError();
                        hideNotification();
                        vscode.postMessage({ command: 'fetchTestClasses' });
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
                    
                    function renderTestClasses(testClasses) {
                        console.log('Rendering test classes:', testClasses);
                        testClassesList.innerHTML = '';
                        
                        if (!testClasses || testClasses.length === 0) {
                            console.log('No test classes to render');
                            noTestClasses.style.display = 'block';
                            return;
                        }
                        
                        noTestClasses.style.display = 'none';
                        
                        testClasses.forEach(function(testClass) {
                            console.log('Rendering test class:', testClass.name);
                            
                            // Create test class container
                            const classDiv = document.createElement('div');
                            classDiv.className = 'test-class-item';
                            
                            // Create header with class name and run button
                            const headerDiv = document.createElement('div');
                            headerDiv.className = 'test-class-header';
                            
                            const expandIcon = document.createElement('span');
                            expandIcon.className = 'icon';
                            expandIcon.textContent = '▶';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'test-class-name';
                            nameSpan.textContent = testClass.name || 'Unknown Class';
                            
                            const runButton = document.createElement('button');
                            runButton.className = 'button';
                            runButton.textContent = 'Run';
                            runButton.onclick = function(e) {
                                e.stopPropagation();
                                runTest(testClass.name);
                            };
                            
                            headerDiv.appendChild(expandIcon);
                            headerDiv.appendChild(nameSpan);
                            headerDiv.appendChild(runButton);
                            
                            // Create methods container
                            const methodsDiv = document.createElement('div');
                            methodsDiv.className = 'test-methods';
                            
                            // Extract test methods from the class body if available
                            let methodNames = ['testMethod1', 'testMethod2']; // Default placeholder
                            
                            if (testClass.body) {
                                try {
                                    // Simple regex to find test methods in the class body
                                    const methodMatches = testClass.body.match(/@isTest\\s+static\\s+void\\s+(\\w+)\\s*\\(|testMethod\\s+void\\s+(\\w+)\\s*\\(/g);
                                    if (methodMatches) {
                                        methodNames = methodMatches.map(function(match) {
                                            // Extract the method name from the match
                                            const nameMatch = match.match(/(\\w+)\\s*\\(/);
                                            return nameMatch ? nameMatch[1] : 'unknownMethod';
                                        });
                                    }
                                } catch (error) {
                                    console.error('Error parsing test methods:', error);
                                }
                            }
                            
                            // Add methods to the container
                            methodNames.forEach(function(methodName) {
                                const methodDiv = document.createElement('div');
                                methodDiv.className = 'test-method';
                                
                                const methodIcon = document.createElement('span');
                                methodIcon.className = 'icon';
                                methodIcon.textContent = '⚫';
                                
                                const methodNameSpan = document.createElement('span');
                                methodNameSpan.className = 'test-method-name';
                                methodNameSpan.textContent = methodName;
                                
                                const runMethodButton = document.createElement('button');
                                runMethodButton.className = 'button';
                                runMethodButton.textContent = 'Run';
                                runMethodButton.onclick = function(e) {
                                    e.stopPropagation();
                                    runTest(testClass.name, methodName);
                                };
                                
                                methodDiv.appendChild(methodIcon);
                                methodDiv.appendChild(methodNameSpan);
                                methodDiv.appendChild(runMethodButton);
                                methodsDiv.appendChild(methodDiv);
                            });
                            
                            // Toggle expand/collapse on header click
                            headerDiv.onclick = function() {
                                if (methodsDiv.style.display === 'block') {
                                    methodsDiv.style.display = 'none';
                                    expandIcon.textContent = '▶';
                                } else {
                                    methodsDiv.style.display = 'block';
                                    expandIcon.textContent = '▼';
                                }
                            };
                            
                            // Add everything to the class container
                            classDiv.appendChild(headerDiv);
                            classDiv.appendChild(methodsDiv);
                            
                            // Add to the list
                            testClassesList.appendChild(classDiv);
                        });
                    }
                    
                    function runTest(testClass, testMethod) {
                        console.log('Running test:', testClass, testMethod || '');
                        showLoading();
                        hideError();
                        hideNotification();
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
                        
                        // Add test details
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
                    window.addEventListener('message', function(event) {
                        const message = event.data;
                        console.log('Received message from extension:', message);
                        
                        switch (message.command) {
                            case 'testClassesLoaded':
                                hideLoading();
                                console.log('Test classes loaded:', message.testClasses);
                                renderTestClasses(message.testClasses);
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
                    
                    // Initial fetch
                    console.log('Initial fetch from webview');
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
}
