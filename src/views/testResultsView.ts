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

export class TestResultsView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-test-results';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

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

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    console.log('Test results view is ready');
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Results</title>
            <style>
                body {
                    padding: 10px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                }
                .test-results {
                    margin-bottom: 20px;
                }
                .test-class {
                    margin-bottom: 10px;
                    padding: 5px;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                .test-method {
                    margin-left: 20px;
                    padding: 3px;
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }
                .failure {
                    color: var(--vscode-testing-iconFailed);
                }
                .skipped {
                    color: var(--vscode-testing-iconSkipped);
                }
                .duration {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.9em;
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    margin-left: 20px;
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                }
            </style>
        </head>
        <body>
            <div class="test-results" id="testResults"></div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const testResults = document.getElementById('testResults');

                    // Let extension know the view is ready
                    vscode.postMessage({ type: 'ready' });

                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'updateResults':
                                updateTestResults(message.results);
                                break;
                            case 'clear':
                                testResults.innerHTML = '';
                                break;
                        }
                    });

                    function updateTestResults(results) {
                        const container = document.createElement('div');
                        container.className = 'test-class';
                        
                        const header = document.createElement('div');
                        header.textContent = results.className;
                        container.appendChild(header);

                        results.methods.forEach(method => {
                            const methodDiv = document.createElement('div');
                            methodDiv.className = 'test-method';
                            
                            const status = document.createElement('span');
                            status.className = method.outcome.toLowerCase();
                            status.textContent = method.outcome === 'Pass' ? '✓' : method.outcome === 'Fail' ? '✗' : '○';
                            methodDiv.appendChild(status);

                            const name = document.createElement('span');
                            name.textContent = method.methodName;
                            methodDiv.appendChild(name);

                            const duration = document.createElement('span');
                            duration.className = 'duration';
                            duration.textContent = ' (' + method.duration + 'ms)';
                            methodDiv.appendChild(duration);

                            if (method.message) {
                                const error = document.createElement('div');
                                error.className = 'error-message';
                                error.textContent = method.message;
                                methodDiv.appendChild(error);
                            }

                            container.appendChild(methodDiv);
                        });

                        testResults.appendChild(container);
                    }
                }())
            </script>
        </body>
        </html>`;
    }

    public updateResults(results: TestResult) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'updateResults', 
                results 
            });
        }
    }

    public clear() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
    }
} 