import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';

export class ApexPanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalApex';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;

    constructor(metadataService: MetadataService) {
        console.log('[VisbalExt.ApexPanelView] Initializing ApexPanelView');
        this._metadataService = metadataService;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('[VisbalExt.ApexPanelView] Resolving webview view');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this._getWebviewContent();
        console.log('[VisbalExt.ApexPanelView] Webview content set');

        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[VisbalExt.ApexPanelView] Received message:', message);
            switch (message.command) {
                case 'executeApex':
                    try {
                        console.log('[VisbalExt.ApexPanelView] Executing Apex code:', message.code);
                        const results = await this._metadataService.executeAnonymousApex(message.code);
                        console.log('[VisbalExt.ApexPanelView] Execution results:', results);
                        this._view?.webview.postMessage({
                            command: 'apexResultsLoaded',
                            results: results
                        });
                    } catch (error: any) {
                        console.error('[VisbalExt.ApexPanelView] Error executing Apex:', error);
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error executing Apex: ${error.message}`
                        });
                    }
                    break;
            }
        });
    }

    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                .code-container {
                    padding: 10px;
                    display: flex;
                    gap: 10px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .code-section {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    align-items: center;
                }
                #apexInput {
                    flex: 1;
                    padding: 5px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    resize: vertical;
                    min-height: 100px;
                    height: auto;
                }
                #runApexButton {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: background-color 0.2s, transform 0.1s;
                }
                #runApexButton:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                #runApexButton:active {
                    transform: scale(0.95);
                }
                #runApexButton.executing {
                    opacity: 0.7;
                    cursor: wait;
                }
                #apexStatus {
                    padding: 5px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    min-width: 40px;
                    font-size: 0.9em;
                }
                .results-container {
                    flex: 1;
                    overflow: auto;
                    padding: 0;
                    background: var(--vscode-editor-background);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                }
                thead {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    background: var(--vscode-editor-background);
                }
                th {
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    text-align: left;
                    padding: 4px 8px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    white-space: nowrap;
                }
                td {
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-foreground);
                    white-space: nowrap;
                }
                tr {
                    background-color: var(--vscode-list-inactiveSelectionBackground);
                }
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .output-section {
                    padding: 10px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-editor-background);
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                }
                .error {
                    color: var(--vscode-errorForeground);
                }
                .success {
                    color: var(--vscode-terminal-ansiGreen);
                }
            </style>
        </head>
        <body>
            <div class="code-container">
                <textarea id="apexInput" placeholder="Enter Apex code..." rows="4">System.debug('Hello World');</textarea>
                <div class="code-section">
                    <button id="runApexButton" title="Execute Apex" type="button">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path fill="currentColor" d="M3.5 3v10l9-5-9-5z"/>
                        </svg>
                    </button>
                    <div id="apexStatus"></div>
                </div>
            </div>
            <div class="results-container">
                <div id="apexOutput" class="output-section"></div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const apexInput = document.getElementById('apexInput');
                    const runApexButton = document.getElementById('runApexButton');
                    const apexStatus = document.getElementById('apexStatus');
                    const apexOutput = document.getElementById('apexOutput');

                    console.log('[VisbalExt.ApexPanel] Initializing webview script');

                    if (runApexButton) {
                        console.log('[VisbalExt.ApexPanel] Adding click handler to run button');
                        runApexButton.onclick = () => {
                            try {
                                console.log('[VisbalExt.ApexPanel] ====== Run Button Click Debug ======');
                                console.log('[VisbalExt.ApexPanel] Run button clicked - Starting execution flow');
                                const code = apexInput.value.trim();
                                console.log('[VisbalExt.ApexPanel] Code to execute:', code);
                                console.log('[VisbalExt.ApexPanel] Button state:', {
                                    disabled: runApexButton.disabled,
                                    classList: Array.from(runApexButton.classList)
                                });

                                if (!code) {
                                    console.log('[VisbalExt.ApexPanel] No code entered - Stopping execution');
                                    apexStatus.textContent = 'Please enter Apex code';
                                    return;
                                }

                                console.log('[VisbalExt.ApexPanel] Preparing to send executeApex message');
                                apexStatus.textContent = 'Executing...';
                                apexOutput.innerHTML = '';
                                runApexButton.classList.add('executing');
                                runApexButton.disabled = true;

                                console.log('[VisbalExt.ApexPanel] Sending executeApex message to extension');
                                vscode.postMessage({
                                    command: 'executeApex',
                                    code: code
                                });
                                console.log('[VisbalExt.ApexPanel] Message sent to extension');
                                console.log('[VisbalExt.ApexPanel] ====== End Run Button Click Debug ======');
                            } catch (error) {
                                console.error('[VisbalExt.ApexPanel] Error in button click handler:', error);
                                apexStatus.textContent = 'Error: ' + error.message;
                            }
                        };
                    } else {
                        console.error('[VisbalExt.ApexPanel] Run button not found in DOM');
                    }

                    window.addEventListener('message', event => {
                        try {
                            console.log('[VisbalExt.ApexPanel] ====== Message Received Debug ======');
                            console.log('[VisbalExt.ApexPanel] Raw message data:', event.data);
                            const message = event.data;

                            // Re-enable button after execution
                            console.log('[VisbalExt.ApexPanel] Resetting button state');
                            runApexButton.classList.remove('executing');
                            runApexButton.disabled = false;
                            console.log('[VisbalExt.ApexPanel] Button state after reset:', {
                                disabled: runApexButton.disabled,
                                classList: Array.from(runApexButton.classList)
                            });
                            
                            switch (message.command) {
                                case 'apexResultsLoaded':
                                    console.log('[VisbalExt.ApexPanel] Processing Apex results');
                                    console.log('[VisbalExt.ApexPanel] Results data:', message.results);
                                    handleApexResults(message.results);
                                    break;
                                case 'error':
                                    console.error('[VisbalExt.ApexPanel] Error received from extension');
                                    console.error('[VisbalExt.ApexPanel] Error details:', message.message);
                                    apexStatus.textContent = message.message;
                                    apexOutput.innerHTML = '<div class="error">' + message.message + '</div>';
                                    break;
                                default:
                                    console.log('[VisbalExt.ApexPanel] Unknown command received:', message.command);
                            }
                            console.log('[VisbalExt.ApexPanel] ====== End Message Received Debug ======');
                        } catch (error) {
                            console.error('[VisbalExt.ApexPanel] Error handling message:', error);
                            apexStatus.textContent = 'Error handling response: ' + error.message;
                        }
                    });

                    function handleApexResults(results) {
                        try {
                            console.log('[VisbalExt.ApexPanel] ====== Results Processing Debug ======');
                            console.log('[VisbalExt.ApexPanel] Processing results:', results);
                            
                            if (!results) {
                                console.log('[VisbalExt.ApexPanel] No results received');
                                apexStatus.textContent = 'No results';
                                apexOutput.innerHTML = '';
                                return;
                            }

                            let output = '';
                            if (results.success) {
                                console.log('[VisbalExt.ApexPanel] Execution successful');
                                console.log('[VisbalExt.ApexPanel] Logs:', results.logs);
                                apexStatus.textContent = 'Executed successfully';
                                if (results.logs) {
                                    output += '<div class="success">' + results.logs + '</div>';
                                }
                            } else {
                                console.log('[VisbalExt.ApexPanel] Execution failed');
                                console.log('[VisbalExt.ApexPanel] Error details:', {
                                    compileProblem: results.compileProblem,
                                    exceptionMessage: results.exceptionMessage,
                                    stackTrace: results.exceptionStackTrace
                                });
                                apexStatus.textContent = 'Execution failed';
                                if (results.compileProblem) {
                                    output += '<div class="error">Compile Error: ' + results.compileProblem + '</div>';
                                }
                                if (results.exceptionMessage) {
                                    output += '<div class="error">Exception: ' + results.exceptionMessage + '</div>';
                                }
                                if (results.exceptionStackTrace) {
                                    output += '<div class="error">Stack Trace:\n' + results.exceptionStackTrace + '</div>';
                                }
                            }
                            console.log('[VisbalExt.ApexPanel] Final output to display:', output);
                            apexOutput.innerHTML = output;
                            console.log('[VisbalExt.ApexPanel] ====== End Results Processing Debug ======');
                        } catch (error) {
                            console.error('[VisbalExt.ApexPanel] Error processing results:', error);
                            apexStatus.textContent = 'Error processing results: ' + error.message;
                        }
                    }
                })();
            </script>
        </body>
        </html>`;
    }
} 