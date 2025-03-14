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

    private async _runTest(testClass: string, testMethod?: string) {
        try {
            this._statusBarService.showMessage(`$(beaker~spin) Running test: ${testClass}${testMethod ? '.' + testMethod : ''}`);
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                throw new Error('Salesforce Extension Pack is required to run tests. Please install it from the VS Code marketplace.');
            }
            
            // Use MetadataService to run tests
            const result = await this._metadataService.runTests(testClass, testMethod);
            
            if (!result) {
                throw new Error('Failed to run test. Please ensure you have an authorized Salesforce org and try again.');
            }
            
            // Send the test results to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: result
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            console.error('Error running test:', error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
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
                }
                .test-classes-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                }
                .test-class-item {
                    padding: 5px 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .test-class-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .test-class-name {
                    font-weight: bold;
                    margin-left: 5px;
                }
                .test-methods-list {
                    list-style-type: none;
                    padding-left: 20px;
                    margin: 5px 0;
                }
                .test-method-item {
                    padding: 3px 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                }
                .test-method-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .test-method-name {
                    margin-left: 5px;
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
                <div style="margin-top: 10px; font-size: 0.9em; color: var(--vscode-descriptionForeground);">
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
                    const testClassesList = document.getElementById('testClassesList');
                    const noTestClasses = document.getElementById('noTestClasses');
                    
                    // Event listeners
                    refreshButton.addEventListener('click', () => {
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
                            noTestClasses.classList.remove('hidden');
                            return;
                        }
                        
                        noTestClasses.classList.add('hidden');
                        
                        testClasses.forEach(function(testClass) {
                            console.log('Rendering test class:', testClass);
                            const li = document.createElement('li');
                            li.className = 'test-class-item';
                            
                            const expandIcon = document.createElement('span');
                            expandIcon.className = 'icon';
                            expandIcon.textContent = '▶';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'test-class-name';
                            nameSpan.textContent = testClass.name || 'Unknown Class';
                            
                            const runButton = document.createElement('button');
                            runButton.className = 'button';
                            runButton.textContent = 'Run';
                            runButton.style.marginLeft = 'auto';
                            runButton.onclick = function(e) {
                                e.stopPropagation();
                                runTest(testClass.name);
                            };
                            
                            li.appendChild(expandIcon);
                            li.appendChild(nameSpan);
                            li.appendChild(runButton);
                            
                            // Create a container for test methods (initially hidden)
                            const methodsList = document.createElement('ul');
                            methodsList.className = 'test-methods-list hidden';
                            
                            // Extract test methods from the class body if available
                            let methodNames = ['testMethod1', 'testMethod2']; // Default placeholder
                            
                            if (testClass.body) {
                                try {
                                    // Simple regex to find test methods in the class body
                                    // This is a basic implementation and might not catch all test methods
                                    const methodMatches = testClass.body.match(/@isTest\s+static\s+void\s+(\w+)\s*\(|testMethod\s+void\s+(\w+)\s*\(/g);
                                    if (methodMatches) {
                                        methodNames = methodMatches.map(function(match) {
                                            // Extract the method name from the match
                                            const nameMatch = match.match(/(\w+)\s*\(/);
                                            return nameMatch ? nameMatch[1] : 'unknownMethod';
                                        });
                                    }
                                } catch (error) {
                                    console.error('Error parsing test methods:', error);
                                }
                            }
                            
                            methodNames.forEach(function(methodName) {
                                const methodLi = document.createElement('li');
                                methodLi.className = 'test-method-item';
                                
                                const methodIcon = document.createElement('span');
                                methodIcon.className = 'icon';
                                methodIcon.textContent = '⚫';
                                
                                const methodNameSpan = document.createElement('span');
                                methodNameSpan.className = 'test-method-name';
                                methodNameSpan.textContent = methodName;
                                
                                const runMethodButton = document.createElement('button');
                                runMethodButton.className = 'button';
                                runMethodButton.textContent = 'Run';
                                runMethodButton.style.marginLeft = 'auto';
                                runMethodButton.onclick = function(e) {
                                    e.stopPropagation();
                                    runTest(testClass.name, methodName);
                                };
                                
                                methodLi.appendChild(methodIcon);
                                methodLi.appendChild(methodNameSpan);
                                methodLi.appendChild(runMethodButton);
                                methodsList.appendChild(methodLi);
                            });
                            
                            // Toggle expand/collapse on click
                            li.onclick = function() {
                                if (methodsList.classList.contains('hidden')) {
                                    methodsList.classList.remove('hidden');
                                    expandIcon.textContent = '▼';
                                } else {
                                    methodsList.classList.add('hidden');
                                    expandIcon.textContent = '▶';
                                }
                            };
                            
                            testClassesList.appendChild(li);
                            testClassesList.appendChild(methodsList);
                        });
                    }
                    
                    function runTest(testClass, testMethod) {
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
                    window.addEventListener('message', event => {
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
