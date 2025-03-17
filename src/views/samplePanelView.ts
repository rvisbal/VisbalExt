import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';

export class SamplePanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-sample';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;

    constructor() {
        console.log('[VisbalExt.SamplePanelView] Initializing SamplePanelView');
        this._metadataService = new MetadataService();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log('[VisbalExt.SamplePanelView] resolveWebviewView -- Resolving webview view');
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        // Set the HTML content
        webviewView.webview.html = this._getWebviewContent();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log(`[VisbalExt.SamplePanelView] resolveWebviewView -- Received message: ${message.command}`);
            
            switch (message.command) {
                case 'executeApex':
                    await this.executeApex(message.code);
                    break;
            }
        });
    }

    private async executeApex(code: string) {
        if (!code.trim()) {
            this._view?.webview.postMessage({
                command: 'executionResult',
                success: false,
                message: 'Please enter some code to execute'
            });
            return;
        }

        try {
            console.log('[VisbalExt.SamplePanelView] Executing Apex code:', code);
            
            // Show loading state
            this._view?.webview.postMessage({
                command: 'executionStarted'
            });

            const result = await this._metadataService.executeAnonymousApex(code);
            console.log('[VisbalExt.SamplePanelView] Execution result:', result);

            this._view?.webview.postMessage({
                command: 'executionResult',
                success: result.success,
                logs: result.logs,
                compileProblem: result.compileProblem,
                exceptionMessage: result.exceptionMessage,
                exceptionStackTrace: result.exceptionStackTrace
            });
        } catch (error: any) {
            console.error('[VisbalExt.SamplePanelView] Error executing Apex:', error);
            this._view?.webview.postMessage({
                command: 'executionResult',
                success: false,
                message: `Error executing Apex: ${error.message}`
            });
        }
    }

    private _getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <title>Visbal Sample</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                }
                .container {
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    height: 100%;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    align-self: flex-start;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .textarea-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                }
                .textarea-label {
                    color: var(--vscode-foreground);
                    font-size: 12px;
                    font-weight: 600;
                }
                textarea {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    resize: vertical;
                    min-height: 100px;
                    border-radius: 2px;
                    flex: 1;
                }
                textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .char-count {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    align-self: flex-end;
                }
                .output-container {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    overflow: auto;
                    max-height: 200px;
                    white-space: pre-wrap;
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }
                .error {
                    color: var(--vscode-testing-iconFailed);
                }
                .loading {
                    color: var(--vscode-foreground);
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Visbal Sample Panel</h2>
                <div class="textarea-container">
                    <label class="textarea-label" for="sampleTextarea">Enter your Apex code:</label>
                    <textarea 
                        id="sampleTextarea" 
                        placeholder="Type something here..."
                        rows="6"
                        maxlength="1000"
                        aria-label="Sample text input area"
                    >System.debug('Hello World');</textarea>
                    <div class="char-count">0 / 1000 characters</div>
                </div>
                <button id="executeButton" onclick="executeApex()">Execute Apex</button>
                <div id="outputContainer" class="output-container">
                    Execute Apex code to see results here
                </div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const textarea = document.getElementById('sampleTextarea');
                    const charCount = document.querySelector('.char-count');
                    const executeButton = document.getElementById('executeButton');
                    const outputContainer = document.getElementById('outputContainer');
                    
                    // Update character count
                    function updateCharCount() {
                        const length = textarea.value.length;
                        charCount.textContent = \`\${length} / 1000 characters\`;
                    }
                    
                    // Initialize character count
                    updateCharCount();
                    
                    // Handle textarea input
                    textarea.addEventListener('input', (e) => {
                        updateCharCount();
                    });
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'executionStarted':
                                executeButton.disabled = true;
                                outputContainer.className = 'output-container';
                                outputContainer.innerHTML = '<div class="loading">Executing Apex code...</div>';
                                break;
                                
                            case 'executionResult':
                                executeButton.disabled = false;
                                let output = '';
                                
                                if (message.success) {
                                    output += '<div class="success">✓ Execution successful</div>\\n';
                                    if (message.logs) {
                                        output += '\\nLogs:\\n' + message.logs;
                                    }
                                } else {
                                    output += '<div class="error">✗ Execution failed</div>\\n';
                                    if (message.compileProblem) {
                                        output += '\\nCompile Error:\\n' + message.compileProblem;
                                    }
                                    if (message.exceptionMessage) {
                                        output += '\\nException:\\n' + message.exceptionMessage;
                                    }
                                    if (message.exceptionStackTrace) {
                                        output += '\\nStack Trace:\\n' + message.exceptionStackTrace;
                                    }
                                    if (message.message) {
                                        output += '\\nError:\\n' + message.message;
                                    }
                                }
                                
                                outputContainer.innerHTML = output;
                                break;
                        }
                    });
                    
                    // Execute Apex code
                    window.executeApex = function() {
                        const code = textarea.value;
                        vscode.postMessage({
                            command: 'executeApex',
                            code: code
                        });
                    };
                })();
            </script>
        </body>
        </html>`;
    }
} 