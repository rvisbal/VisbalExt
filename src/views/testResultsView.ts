import * as vscode from 'vscode';

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

export class TestResultsView implements vscode.WebviewViewProvider {
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

        // Set initial content
        webviewView.webview.html = this._getInitialContent();
    }

    public updateSummary(summary: TestSummary, tests: TestResult[]) {
        console.log('[VisbalExt.TestResultsView] updateSummary -- summary:', summary);
        if (this._view) {
            this._view.webview.html = this._getWebviewContent(summary, tests);
            this._view.show?.(true); // Reveal the view
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

    private _getWebviewContent(summary: TestSummary, tests: TestResult[]): string {
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
                .stack-trace {
                    margin-top: 10px;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                    font-family: var(--vscode-editor-font-family);
                    white-space: pre-wrap;
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-panel-border);
                }
                .error-message {
                    color: var(--vscode-testing-message-error-foreground);
                    margin-bottom: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">Test Run Summary</div>
            <div class="summary-container">
                <div class="summary-item">
                    <span class="label">Outcome:</span>
                    <span class="value ${summary.outcome === 'Passed' ? 'success' : 'failure'}">${summary.outcome || 'N/A'}</span>
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
                    <span class="label">Hostname:</span>
                    <span class="value">${summary.hostname || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Org ID:</span>
                    <span class="value">${summary.orgId || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">User ID:</span>
                    <span class="value">${summary.userId || 'N/A'}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Username:</span>
                    <span class="value">${summary.username || 'N/A'}</span>
                </div>
            </div>
            <div class="test-results-container">
                ${tests.map(test => {
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

                    return `
                    <div class="test-result">
                        <span class="label">Class:</span>
                        <span class="value">${test.FullName}</span>
                        ${formattedMessage ? `
                            <span class="label">Error Message:</span>
                            <div class="error-message">${formattedMessage}</div>
                        ` : ''}
                        ${formattedStackTrace ? `
                            <span class="label">Stack Trace:</span>
                            <div class="stack-trace">${formattedStackTrace}</div>
                        ` : ''}
                    </div>
                `}).join('')}
            </div>
        </body>
        </html>`;
    }
} 