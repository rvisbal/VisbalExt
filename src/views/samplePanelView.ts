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
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 8px;
                    background: var(--vscode-editor-background);
                }
                .editor-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 4px 8px;
                }
                .tabs {
                    display: flex;
                    padding: 0;
                    background: var(--vscode-tab-inactiveBackground);
                    border-bottom: 1px solid var(--vscode-tab-border);
                }
                .tab {
                    padding: 4px 12px;
                    cursor: pointer;
                    border: none;
                    background: none;
                    color: var(--vscode-tab-inactiveForeground);
                    border-bottom: 2px solid transparent;
                    font-size: 12px;
                }
                .tab.active {
                    background: var(--vscode-tab-activeBackground);
                    color: var(--vscode-tab-activeForeground);
                    border-bottom: 2px solid var(--vscode-focusBorder);
                }
                .tab:hover:not(.active) {
                    background: var(--vscode-tab-hoverBackground);
                }
                .content {
                    flex: 1;
                    display: none;
                    height: calc(100vh - 30px);
                    overflow: hidden;
                }
                .content.active {
                    display: flex;
                    flex-direction: column;
                }
                .editor-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow: hidden;
                    padding: 8px;
                }
                .textarea-container {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                }
                .textarea-label {
                    color: var(--vscode-foreground);
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                textarea {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    resize: none;
                    flex: 1;
                    min-height: 0;
                    border-radius: 2px;
                    overflow-y: auto;
                }
                textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .char-count {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    background: var(--vscode-input-background);
                    padding: 2px 4px;
                    border-radius: 2px;
                    opacity: 0.8;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    height: 24px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .output-container {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    overflow-y: auto;
                    height: 100%;
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
                .codicon {
                    font-family: codicon;
                    font-size: 16px;
                    line-height: 16px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="tabs">
                    <button class="tab active" data-tab="editor">Editor</button>
                    <button class="tab" data-tab="results">Results</button>
                </div>
                <div id="editorContent" class="content active">
                    <div class="editor-container">
                        <div class="editor-header">
                            <label class="textarea-label" for="sampleTextarea">Enter your Apex code:</label>
                            <button id="executeButton" onclick="executeApex()" title="Execute Apex Code">
                                Execute Apex
                            </button>
                        </div>
                        <div class="textarea-container">
                            <textarea 
                                id="sampleTextarea" 
                                placeholder="Type something here..."
                                aria-label="Sample text input area"
                                maxlength="1000"
                            >System.debug('Hello World');</textarea>
                            <div class="char-count">0 / 1000 characters</div>
                        </div>
                    </div>
                </div>
                <div id="resultsContent" class="content">
                    <div id="outputContainer" class="output-container">
                        Execute Apex code to see results here
                    </div>
                </div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const textarea = document.getElementById('sampleTextarea');
                    const charCount = document.querySelector('.char-count');
                    const executeButton = document.getElementById('executeButton');
                    const outputContainer = document.getElementById('outputContainer');
                    const tabs = document.querySelectorAll('.tab');
                    const contents = document.querySelectorAll('.content');
                    
                    // Tab switching
                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            const tabId = tab.getAttribute('data-tab');
                            
                            // Update tab states
                            tabs.forEach(t => t.classList.remove('active'));
                            tab.classList.add('active');
                            
                            // Update content states
                            contents.forEach(content => {
                                if (content.id === tabId + 'Content') {
                                    content.classList.add('active');
                                } else {
                                    content.classList.remove('active');
                                }
                            });
                        });
                    });

                    // Switch to results tab when executing
                    function switchToResultsTab() {
                        tabs.forEach(tab => {
                            if (tab.getAttribute('data-tab') === 'results') {
                                tab.click();
                            }
                        });
                    }
                    
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
                                switchToResultsTab();
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