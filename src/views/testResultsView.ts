import * as vscode from 'vscode';

interface TestMethod {
    methodName: string;
    outcome: string;
    duration: number;
    message?: string;
}

interface TestResult {
    className: string;
    methods: TestMethod[];
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

    public updateSummary(summary: TestSummary) {
        console.log('[VisbalExt.TestResultsView] updateSummary -- summary:', summary);
        if (this._view) {
            this._view.webview.html = this._getWebviewContent(summary);
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

    private _getWebviewContent(summary: TestSummary): string {
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
        </body>
        </html>`;
    }
} 