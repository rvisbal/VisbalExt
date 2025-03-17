import * as vscode from 'vscode';

export class DebugConsoleView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-debug-console';
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
                    console.log('Debug console view is ready');
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
            <title>Debug Console</title>
            <style>
                body {
                    padding: 10px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                }
                .output {
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
                .error {
                    color: var(--vscode-errorForeground);
                }
                .warning {
                    color: var(--vscode-warningForeground);
                }
                .info {
                    color: var(--vscode-infoForeground);
                }
            </style>
        </head>
        <body>
            <div class="output" id="output"></div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const output = document.getElementById('output');

                    // Let extension know the view is ready
                    vscode.postMessage({ type: 'ready' });

                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'addOutput':
                                const div = document.createElement('div');
                                div.className = message.class || '';
                                div.textContent = message.text;
                                output.appendChild(div);
                                break;
                            case 'clear':
                                output.innerHTML = '';
                                break;
                        }
                    });
                }())
            </script>
        </body>
        </html>`;
    }

    public addOutput(text: string, className?: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'addOutput', 
                text, 
                class: className 
            });
        }
    }

    public clear() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
    }
} 