import * as vscode from 'vscode';
import { OrgUtils } from '../utils/orgUtils';

interface TestMethod {
    methodName: string;
    outcome: string;
    duration: number;
    message?: string;
}

interface TestResult {
    // PascalCase versions (from Salesforce API)
    MethodName?: string;
    Outcome?: string;
    Message?: string;
    StackTrace?: string;
    Duration?: string;
    Id?: string;
    // camelCase versions (from internal usage)
    methodName?: string;
    outcome?: string;
    message?: string;
    // Other properties
    className?: string;
    methods?: TestMethod[];
    FullName?: string;
    TestRunId?: string;
    TestRunResultId?: string;
    ApexClass?: {
        Name: string;
    };
}

interface TestSummary {
    commandTime?: string;
    failing?: number;
    failRate?: string;
    hostname?: string;
    orgId?: string;
    outcome?: string;
    passing?: number;
    passRate?: string;
    skipped?: number;
    testExecutionTime?: string;
    testRunId?: string;
    testsRan?: number;
    testStartTime?: string;
    testTotalTime?: string;
    userId?: string;
    username?: string;
}

interface QueueItem {
    ApexClassId: string;
    ApexClass: string;
    ApexClassName: string;
    Status: string;
    ExtendedStatus: string;
    TestRunResultId: string;
}

interface ApexTestRunResult {
    Id: string;
    CreatedDate: string;
    AsyncApexJobId: string;
    UserId: string;
    JobName: string;
    IsAllTests: boolean;
    Source: string;
    StartTime: string;
    EndTime: string;
    TestTime: string;
    Status: string;
    ClassesEnqueued: number;
    ClassesCompleted: number;
    MethodsEnqueued: number;
    MethodsCompleted: number;
    MethodsFailed: number;
}

export class TestSummaryView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-test-summary';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'openTestFile':
                    try {
                        OrgUtils.logDebug(`[VisbalExt.TestSummaryView] openTestFile.openTestFile -- className: ${message.className} -- methodName: ${message.methodName}`);
                        await OrgUtils.openTestFile(message.className, message.methodName);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.TestSummaryView] Error opening test file:', error);
                        vscode.window.showErrorMessage(`Error opening test file: ${error.message}`);
                    }
                    break;
                case 'openLogFile':
                    try {
                        OrgUtils.logDebug('[VisbalExt.TestSummaryView] openLogFile.openTheLogFromTestId -- testId:', message.testId);
                        await OrgUtils.openTheLogFromTestId(message.testId);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.TestSummaryView] Error opening log file:', error);
                        vscode.window.showErrorMessage(`Error opening log file: ${error.message}`);
                    }
                    break;  
            }
        });

        // Set initial content
        webviewView.webview.html = this._getInitialContent();
    }

    public updateSummary(summary: TestSummary | TestSummary[], tests: TestResult[]) {
        OrgUtils.logDebug('[VisbalExt.TestSummaryView] updateSummary -- summary:', summary);
        OrgUtils.logDebug('[VisbalExt.TestSummaryView] updateSummary -- tests:', tests);
        const failedTests = tests.filter(test => test.Outcome?.toLowerCase() === 'fail' || test.outcome?.toLowerCase() === 'fail');
        OrgUtils.logDebug('[VisbalExt.TestSummaryView] updateSummary _getWebviewContent -- failedTests:', failedTests);

        // Update test selection for failing tests
        failedTests.forEach(test => {
            const className = test.ApexClass?.Name || test.FullName?.split('.')[0] || '';
            const methodName = test.MethodName || test.methodName;
            OrgUtils.logDebug(`[VisbalExt.TestSummaryView] updateSummary selectTestMethod -- className:${className} -- methodName:${methodName}`);
            if (className) {
                vscode.commands.executeCommand('visbal-ext.selectTestMethod', className, methodName, true);
            }
        });

        if (this._view) {
            // Check if we have multiple summaries
            if (Array.isArray(summary)) {
                this._view.webview.html = this._getWebviewContentForMultipleTests(summary, tests);
            } else {
                this._view.webview.html = this._getWebviewContent(summary, tests);
            }
            this._view.show?.(true); // Reveal the view
        }
    }


    public showProgress(progress: QueueItem[], jobResults: any[]) {
        // 
        if (this._view) {
            this._view.webview.html = this._getWebviewContentForProgress(progress, jobResults);
            this._view.show?.(true); // Reveal the view
        }
    }

    public clearView() {
        if (this._view) {
            this._view.webview.html = this._getInitialContent();
        }
    }

    private _getInitialContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 10px;
                    color: var(--vscode-foreground);
                }
                .message {
                    text-align: center;
                    margin-top: 20px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="message">No test results available</div>
        </body>
        </html>`;
    }

    private _getWebviewContentForMultipleTests(summaries: TestSummary[], tests: TestResult[]): string {
        // Calculate aggregate summary
        const aggregateSummary = {
            testsRan: summaries.reduce((total, s) => total + (s.testsRan || 0), 0),
            passing: summaries.reduce((total, s) => total + (s.passing || 0), 0),
            failing: summaries.reduce((total, s) => total + (s.failing || 0), 0),
            skipped: summaries.reduce((total, s) => total + (s.skipped || 0), 0),
            testTotalTime: summaries.reduce((total, s) => total + parseFloat(s.testTotalTime || '0'), 0).toFixed(2),
            outcome: summaries.some(s => s.outcome === 'Failed') ? 'Failed' : 'Passed',
        };

        // Calculate pass/fail rates
        const totalTests = aggregateSummary.testsRan;
        const passRate = totalTests > 0 ? ((aggregateSummary.passing / totalTests) * 100).toFixed(1) + '%' : '0%';
        const failRate = totalTests > 0 ? ((aggregateSummary.failing / totalTests) * 100).toFixed(1) + '%' : '0%';

        //test filter for failed tests
        const failedTests = tests.filter(test => test.Outcome?.toLowerCase() === 'fail' || test.outcome?.toLowerCase() === 'fail');
        OrgUtils.logDebug('[VisbalExt.TestSummaryView] _getWebviewContentForMultipleTests -- failedTests:', failedTests);
        
        // Update test selection for failing tests
        failedTests.forEach(test => {
            const className = test.ApexClass?.Name || test.FullName?.split('.')[0] || '';
            const methodName = test.MethodName || test.methodName;
            OrgUtils.logDebug(`[VisbalExt.TestSummaryView] _getWebviewContentForMultipleTests selectTestMethod -- className:${className} -- methodName:${methodName}`);
            if (className) {
                vscode.commands.executeCommand('visbal-ext.selectTestMethod', className, methodName, true);
            }
        });

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 10px;
                    color: var(--vscode-foreground);
                }
                .summary-container {
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .summary-header {
                    font-size: 1.2em;
                    margin-bottom: 15px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-panelTitle-activeForeground);
                }
                .summary-item {
                    margin: 5px 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .label {
                    color: var(--vscode-descriptionForeground);
                    margin-right: 10px;
                }
                .value {
                    color: var(--vscode-foreground);
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }
                .failure {
                    color: var(--vscode-testing-iconFailed);
                }
                .test-results-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 15px;
                    margin-top: 20px;
                }
                .test-result {
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }
                .test-result .header {
                    font-weight: bold;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .test-result .content {
                    margin-left: 10px;
                }
                .error-message {
                    color: var(--vscode-testing-message-error-foreground);
                    margin: 7px 0;
                    padding: 7px;
                    background-color: var(--vscode-testing-message-error-background);
                    border-radius: 4px;
                }
                .stack-trace {
                    margin: 7px 0;
                    padding: 7px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                    font-family: var(--vscode-editor-font-family);
                    white-space: pre-wrap;
                    max-height: 150px;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-panel-border);
                }
                .section-label {
                    color: var(--vscode-descriptionForeground);
                    font-weight: bold;
                    margin: 7px 0 8px 0;
                    padding-bottom: 5px;

                }
                .progress-bar {
                    height: 4px;
                    background-color: var(--vscode-progressBar-background);
                    margin: 10px 0;
                    border-radius: 2px;
                }
                .progress-bar .fill {
                    height: 100%;
                    background-color: var(--vscode-testing-iconPassed);
                    border-radius: 2px;
                    transition: width 0.3s ease;
                }
                .test-name {
                    cursor: pointer;
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                .test-name:hover {
                    text-decoration: underline;
                }
                .clickable {
                    cursor: pointer;
                }
                .clickable:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                
                function openTestFile(className, methodName) {
                    vscode.postMessage({
                        command: 'openTestFile',
                        className: className,
                        methodName: methodName
                    });
                }

                function openLogFile(testId) {
                    vscode.postMessage({
                        command: 'openLogFile',
                        testId: testId
                    });
                }
            </script>
        </head>
        <body>
            <div class="summary-container">
                <div class="summary-header">Aggregate Test Results</div>
                <div class="summary-item">
                    <span class="label">Overall Status:</span>
                    <span class="value ${aggregateSummary.outcome === 'Failed' ? 'failure' : 'success'}">${aggregateSummary.outcome}</span>
                </div>
                <div class="progress-bar">
                    <div class="fill" style="width: ${passRate};"></div>
                </div>
                <div class="summary-item">
                    <span class="label">Total Tests Run:</span>
                    <span class="value">${aggregateSummary.testsRan}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Passing:</span>
                    <span class="value success">${aggregateSummary.passing} (${passRate})</span>
                </div>
                <div class="summary-item">
                    <span class="label">Failing:</span>
                    <span class="value failure">${aggregateSummary.failing} (${failRate})</span>
                </div>
                <div class="summary-item">
                    <span class="label">Skipped:</span>
                    <span class="value">${aggregateSummary.skipped}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Total Time:</span>
                    <span class="value">${aggregateSummary.testTotalTime}s</span>
                </div>
            </div>

            <div class="test-results-grid">
                ${failedTests.map(test => {
                    const formattedMessage = test.Message?.trim().replace(/^System\.[^:]+:/, '').trim() || '';
                    const formattedStackTrace = test.StackTrace?.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .map(line => '    ' + line)
                        .join('\n') || '';

                    const className = test.ApexClass?.Name || test.FullName?.split('.')[0] || '';
                    const methodName = test.MethodName || test.methodName || '';

                    return `
                    <div class="test-result">
                        <div class="header failure clickable" onclick="openTestFile('${className}', '')">
                            <span class="test-name" onclick="openTestFile('${className}', '${methodName}')">${test.FullName || 'Unknown Test'}</span>
                        </div>
                        <div class="content clickable" onclick="openLogFile('${test.Id}')">
                            <div class="summary-item">
                                <span class="label">Status:</span>
                                <span class="value failure">${test.Outcome || 'Failed'}</span>
                            </div>
                            ${formattedMessage ? `
                                <div class="section-label">Error Message</div>
                                <div class="error-message">${formattedMessage}</div>
                            ` : ''}
                            ${formattedStackTrace ? `
                                <div class="section-label">Stack Trace</div>
                                <div class="stack-trace">${formattedStackTrace}</div>
                            ` : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        </body>
        </html>`;
    }

    private _getWebviewContent(summary: TestSummary, tests: TestResult[]): string {
        const failedTests = tests.filter(test => test.Outcome?.toLowerCase() === 'fail' || test.outcome?.toLowerCase() === 'fail');
        OrgUtils.logDebug('[VisbalExt.TestSummaryView] _getWebviewContent -- failedTests:', failedTests);
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 10px;
                    color: var(--vscode-foreground);
                }
                .summary-item {
                    margin: 5px 0;
                    display: flex;
                    justify-content: space-between;
                }
                .label {
                    color: var(--vscode-descriptionForeground);
                    margin-right: 10px;
                }
                .value {
                    color: var(--vscode-foreground);
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }
                .failure {
                    color: var(--vscode-testing-iconFailed);
                }
                .header {
                    font-size: 1.2em;
                    margin-bottom: 15px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .test-result {
                    margin: 15px 0;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .test-result:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .test-result .label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .test-result .value {
                    display: block;
                    margin-bottom: 10px;
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                }
                .error-message {
                    color: var(--vscode-testing-message-error-foreground);
                    margin: 7px 0;
                    padding: 5px;
                    background-color: var(--vscode-testing-message-error-background);
                    border-radius: 4px;
                }
                .stack-trace {
                    margin: 7px 0;
                    padding: 7px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                    font-family: var(--vscode-editor-font-family);
                    white-space: pre-wrap;
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-panel-border);
                }
                .section-label {
                    color: var(--vscode-descriptionForeground);
                    font-weight: bold;
                    margin: 7px 0 7px 0;
                    padding-bottom: 5px;
                }
                .test-name {
                    cursor: pointer;
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                .test-name:hover {
                    text-decoration: underline;
                }
                .clickable {
                    cursor: pointer;
                }
                .clickable:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                
                function openTestFile(className, methodName) {
                    vscode.postMessage({
                        command: 'openTestFile',
                        className: className,
                        methodName: methodName
                    });
                }

                function openLogFile(testId) {
                    vscode.postMessage({
                        command: 'openLogFile',
                        testId: testId
                    });
                }
            </script>
        </head>
        <body>
            <div class="summary-container">
                <div class="summary-item">
                    <span class="label">Outcome:</span>
                    <span class="value ${summary.outcome?.toLowerCase() === 'fail' ? 'failure' : 'success'}">${summary.outcome || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Tests Run:</span>
                    <span class="value">${summary.testsRan || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Passing:</span>
                    <span class="value success">${summary.passing || 0} (${summary.passRate || '0%'})</span>
                </div>
                <div class="summary-item">
                    <span class="label">Failing:</span>
                    <span class="value failure">${summary.failing || 0} (${summary.failRate || '0%'})</span>
                </div>
                <div class="summary-item">
                    <span class="label">Skipped:</span>
                    <span class="value">${summary.skipped || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Total Time:</span>
                    <span class="value">${summary.testTotalTime || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Start Time:</span>
                    <span class="value">${summary.testStartTime || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Execution Time:</span>
                    <span class="value">${summary.testExecutionTime || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Command Time:</span>
                    <span class="value">${summary.commandTime || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Test Run ID:</span>
                    <span class="value">${summary.testRunId || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">User ID:</span>
                    <span class="value">${summary.userId || 'N/A'}</span>
                </div>
                <div class="summary-item" title="${summary.hostname}">
                    <span class="label">Username:</span>
                    <span class="value">${summary.username || 'N/A'}</span>
                </div>
            </div>
            <div class="test-results-container">
                ${failedTests.map(test => {
                    // Format the error message and stack trace
                    let formattedMessage = '';
                    let formattedStackTrace = '';
                    if (test.Message || test.StackTrace) {
                        const parts = (test.Message + '\nStackTrace:' + test.StackTrace).split('StackTrace:');
                        if (parts.length === 2) {
                            formattedMessage = parts[0].trim().replace(/^System\.[^:]+:/, '').trim();
                            formattedStackTrace = parts[1]
                                .split('\n')
                                .map(line => line.trim())
                                .filter(line => line.length > 0)
                                .map(line => '    ' + line)
                                .join('\n');
                        } else {
                            formattedMessage = test.Message || '';
                            formattedStackTrace = test.StackTrace || '';
                        }
                    }
                    
                    const className = test.ApexClass?.Name || test.FullName?.split('.')[0] || '';
                    const methodName = test.MethodName || test.methodName || '';
                    
                    return `
                    <div class="test-result">
                        <div class="header failure clickable" onclick="openTestFile('${className}', '')">
                            <span class="test-name" onclick="openTestFile('${className}', '${methodName}')">${test.FullName}</span>
                        </div>
                        <div class="content clickable" onclick="openLogFile('${test.Id}')">
                            ${formattedMessage ? `
                                <div class="section-label">Error Message</div>
                                <div class="error-message">${formattedMessage}</div>
                            ` : ''}
                            ${formattedStackTrace ? `
                                <div class="section-label">Stack Trace</div>
                                <div class="stack-trace">${formattedStackTrace}</div>
                            ` : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        </body>
        </html>`;
    }

    private _getWebviewContentForProgress(progress: QueueItem[], jobResults?: ApexTestRunResult[]): string {
        const jobResult = jobResults && jobResults.length > 0 ? jobResults[0] : null;
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 10px;
                    color: var(--vscode-foreground);
                }   
                .progress-container {
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .progress-item {
                    margin: 5px 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .label {
                    color: var(--vscode-descriptionForeground);
                    margin-right: 10px;
                    flex: 1;
                }   
                .value {
                    color: var(--vscode-foreground);
                    min-width: 80px;
                    text-align: right;
                    margin-left: 10px;
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }   
                .failure {
                    color: var(--vscode-testing-iconFailed);
                }
                .running {
                    color: var(--vscode-testing-iconRunning);
                }
                .processing {
                    color: #e2c62c;
                }
                .queued {
                    color: var(--vscode-foreground);
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                
                function openTestFile(className, methodName) {
                    vscode.postMessage({
                        command: 'openTestFile',
                        className: className,
                        methodName: methodName
                    });
                }

            </script>
        </head>
        <body>
            <div class="progress-container">
                ${jobResult ? `
                    <div class="progress-item">
                        <span class="label">Status:</span>
                        <span class="value ${jobResult.Status === 'Completed' && jobResult.MethodsFailed > 0 ? 'failure' : jobResult.Status === 'Completed' ? 'success' : jobResult.Status === 'Processing' ? 'processing' : jobResult.Status === 'Running' ? 'running' : jobResult.Status === 'Queued' ? 'queued' : 'failure'}">${jobResult.Status}</span>
                    </div>
                    <div class="progress-item">
                        <span class="label">Methods:</span>
                        <span class="value">Completed: ${jobResult.MethodsCompleted} / Enqueued: ${jobResult.MethodsEnqueued} / Failed: ${jobResult.MethodsFailed}</span>
                    </div>
                ` : ''}
            </div>
            <div class="progress-container">
                ${progress
                    .sort((a, b) => a.ApexClassName.localeCompare(b.ApexClassName))
                    .map(p => {
                    return `
                        <div class="progress-item">     
                            <span class="label" onclick="openTestFile('${p.ApexClassName}', '')">${p.ApexClassName}</span>
                            <span class="value ${p.Status === 'Completed' && p.ExtendedStatus ? (() => {
                                const [passed, total] = p.ExtendedStatus.replace(/[()]/g, '').split('/').map(n => parseInt(n));
                                return passed < total ? 'failure' : 'success';
                            })() : p.Status === 'Processing' ? 'processing' : p.Status === 'Running' ? 'running' : p.Status === 'Queued' ? 'queued' : 'failure'}">${p.Status}</span>
                            ${p.ExtendedStatus ? `<span class="value">${p.ExtendedStatus}</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </body>
        </html>`;   
    }
} 