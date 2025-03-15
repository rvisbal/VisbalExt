import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';

export class SoqlPanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalSoql';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;

    constructor(metadataService: MetadataService) {
        this._metadataService = metadataService;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this._getWebviewContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'executeSoqlQuery':
                    try {
                        const results = await this._metadataService.executeSoqlQuery(message.query);
                        this._view?.webview.postMessage({
                            command: 'soqlResultsLoaded',
                            results: {
                                records: results
                            }
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error executing query: ${error.message}`
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
                }
                .query-container {
                    padding: 10px;
                    display: flex;
                    gap: 10px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                #soqlInput {
                    flex: 1;
                    padding: 5px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                #runSoqlButton {
                    padding: 5px 10px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                #runSoqlButton:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .results-container {
                    flex: 1;
                    overflow: auto;
                    padding: 10px;
                }
                #soqlStatus {
                    padding: 5px 10px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                th, td {
                    padding: 8px;
                    text-align: left;
                    border: 1px solid var(--vscode-panel-border);
                }
                th {
                    background: var(--vscode-editor-background);
                    font-weight: bold;
                }
                tr:nth-child(even) {
                    background: var(--vscode-list-activeSelectionBackground);
                }
            </style>
        </head>
        <body>
            <div class="query-container">
                <input type="text" id="soqlInput" placeholder="Enter SOQL query...">
                <button id="runSoqlButton">Run Query</button>
            </div>
            <div id="soqlStatus"></div>
            <div class="results-container">
                <table>
                    <thead id="soqlResultsHeader"></thead>
                    <tbody id="soqlResultsBody"></tbody>
                </table>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const soqlInput = document.getElementById('soqlInput');
                    const runSoqlButton = document.getElementById('runSoqlButton');
                    const soqlStatus = document.getElementById('soqlStatus');
                    const soqlResultsHeader = document.getElementById('soqlResultsHeader');
                    const soqlResultsBody = document.getElementById('soqlResultsBody');

                    runSoqlButton.addEventListener('click', () => {
                        const query = soqlInput.value.trim();
                        if (!query) {
                            soqlStatus.textContent = 'Please enter a SOQL query';
                            return;
                        }
                        soqlStatus.textContent = 'Running query...';
                        vscode.postMessage({
                            command: 'executeSoqlQuery',
                            query: query
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'soqlResultsLoaded':
                                handleSoqlResults(message.results);
                                break;
                            case 'error':
                                soqlStatus.textContent = message.message;
                                soqlResultsHeader.innerHTML = '';
                                soqlResultsBody.innerHTML = '';
                                break;
                        }
                    });

                    function handleSoqlResults(results) {
                        if (!results || !results.records || results.records.length === 0) {
                            soqlStatus.textContent = 'No results found';
                            soqlResultsHeader.innerHTML = '';
                            soqlResultsBody.innerHTML = '';
                            return;
                        }

                        const columns = Object.keys(results.records[0]);
                        soqlResultsHeader.innerHTML = '<tr>' + columns.map(col => 
                            '<th>' + col + '</th>'
                        ).join('') + '</tr>';

                        soqlResultsBody.innerHTML = results.records.map(record => 
                            '<tr>' + columns.map(col => 
                                '<td>' + (record[col] || '') + '</td>'
                            ).join('') + '</tr>'
                        ).join('');

                        soqlStatus.textContent = results.records.length + ' rows returned';
                    }
                })();
            </script>
        </body>
        </html>`;
    }
} 