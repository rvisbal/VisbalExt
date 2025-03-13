import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Provider for log file editor with filtering capabilities
 */
export class LogFileEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'visbal.logEditor';
    
    constructor(
        private readonly extensionUri: vscode.Uri,
    ) { }
    
    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
        
        // Hook up event handlers so that we can synchronize the webview with the text document.
        //
        // The text document acts as our model, so we have to sync the webview to it.
        // The webview never updates the document directly.
        
        // Hook up event handlers for document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updateWebview(webviewPanel.webview, document);
            }
        });
        
        // Make sure we clean up when our editor is closed.
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
        
        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'applyFilters':
                    this.applyFilters(webviewPanel.webview, document, e.filters);
                    return;
            }
        });
        
        // Initial update of the webview
        this.updateWebview(webviewPanel.webview, document);
    }
    
    /**
     * Get the HTML for the webview
     */
    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        const fileName = path.basename(document.uri.fsPath);
        
        // Local path to script and css for the webview
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'media', 'logFileEditor.js'));
        
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.extensionUri, 'media', 'logFileEditor.css'));
        
        // Use a nonce to whitelist which scripts can be run
        const nonce = this.getNonce();
        
        return /* html */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};">
                <title>Log File: ${fileName}</title>
                <link href="${styleUri}" rel="stylesheet" />
            </head>
            <body>
                <div class="filter-bar">
                    <div class="filter-bar-header">
                        <button id="toggle-filter-bar" class="toggle-button">
                            <span class="toggle-icon">▼</span> Filters
                        </button>
                    </div>
                    <div class="filter-bar-content">
                        <div class="filter-options">
                            <label><input type="checkbox" id="filter-user-debug" value="USER_DEBUG"> USER_DEBUG</label>
                            <label><input type="checkbox" id="filter-soql" value="SOQL_EXECUTE"> SOQL</label>
                            <label><input type="checkbox" id="filter-dml" value="DML"> DML</label>
                            <label><input type="checkbox" id="filter-code-unit" value="CODE_UNIT"> CODE_UNIT</label>
                            <label><input type="checkbox" id="filter-system" value="SYSTEM"> SYSTEM</label>
                            <label><input type="checkbox" id="filter-exception" value="EXCEPTION"> EXCEPTION</label>
                            <label><input type="checkbox" id="filter-error" value="ERROR"> ERROR</label>
                        </div>
                        <div class="filter-actions">
                            <button id="apply-filters">Apply Filters</button>
                            <button id="clear-filters">Clear Filters</button>
                        </div>
                    </div>
                </div>
                
                <div class="log-content">
                    <pre id="log-content-pre"></pre>
                </div>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
    
    /**
     * Update the webview content
     */
    private updateWebview(webview: vscode.Webview, document: vscode.TextDocument) {
        webview.postMessage({
            type: 'update',
            text: document.getText(),
        });
    }
    
    /**
     * Apply filters to the log content
     */
    private applyFilters(webview: vscode.Webview, document: vscode.TextDocument, filters: string[]) {
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        
        let filteredLines: string[];
        
        if (filters.length === 0) {
            // If no filters, show all lines
            filteredLines = lines;
        } else {
            // Filter lines based on the selected filters
            filteredLines = lines.filter(line => {
                for (const filter of filters) {
                    if (line.includes(filter)) {
                        return true;
                    }
                }
                return false;
            });
        }
        
        webview.postMessage({
            type: 'filtered',
            text: filteredLines.join('\n'),
            filters: filters
        });
    }
    
    /**
     * Generate a nonce string
     */
    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
} 