import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class JsonViewerTab implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-json-viewer';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _currentJsonContent: any = null;
    private _currentFilePath: string = '';

    constructor(
        private readonly _context: vscode.ExtensionContext
    ) {
        this._extensionUri = _context.extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'refresh':
                        this.refresh();
                        break;
                    case 'format':
                        this._formatJson();
                        break;
                    case 'validate':
                        this._validateJson();
                        break;
                    case 'copy':
                        this._copyToClipboard(message.data);
                        break;
                    case 'expand-all':
                        this._expandAll();
                        break;
                    case 'collapse-all':
                        this._collapseAll();
                        break;
                    case 'export':
                        this._exportJson();
                        break;
                    case 'search':
                        this._searchJson(message.query);
                        break;
                }
            },
            undefined,
            this._context.subscriptions
        );

        // Load JSON from active editor if it's a JSON file
        this._loadActiveJsonFile();
    }

    public openJsonFile(filePath: string) {
        this._currentFilePath = filePath;
        this._loadJsonFromFile(filePath);
    }

    public openJsonContent(content: string, filePath?: string) {
        this._currentFilePath = filePath || 'Untitled';
        this._loadJsonFromContent(content);
    }

    public refresh() {
        if (this._currentFilePath && fs.existsSync(this._currentFilePath)) {
            this._loadJsonFromFile(this._currentFilePath);
        } else {
            this._loadActiveJsonFile();
        }
    }

    private _loadActiveJsonFile() {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && this._isJsonFile(activeEditor.document.fileName)) {
            this._currentFilePath = activeEditor.document.fileName;
            const content = activeEditor.document.getText();
            this._loadJsonFromContent(content);
        } else {
            this._showWelcomeMessage();
        }
    }

    private _loadJsonFromFile(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this._loadJsonFromContent(content);
        } catch (error) {
            this._showError(`Failed to load file: ${error}`);
        }
    }

    private _loadJsonFromContent(content: string) {
        try {
            this._currentJsonContent = JSON.parse(content);
            this._updateWebview();
        } catch (error) {
            this._showError(`Invalid JSON: ${error}`);
        }
    }

    private _isJsonFile(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json');
    }

    private _updateWebview() {
        if (this._view && this._currentJsonContent !== null) {
            this._view.webview.postMessage({
                type: 'updateJson',
                data: {
                    content: this._currentJsonContent,
                    filePath: this._currentFilePath,
                    formattedJson: JSON.stringify(this._currentJsonContent, null, 2)
                }
            });
        }
    }

    private _showWelcomeMessage() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showWelcome'
            });
        }
    }

    private _showError(message: string) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showError',
                message: message
            });
        }
        vscode.window.showErrorMessage(message);
    }

    private _formatJson() {
        if (this._currentJsonContent) {
            const formatted = JSON.stringify(this._currentJsonContent, null, 2);
            vscode.workspace.openTextDocument({
                content: formatted,
                language: 'json'
            }).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }

    private _validateJson() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor to validate');
            return;
        }

        try {
            const content = activeEditor.document.getText();
            JSON.parse(content);
            vscode.window.showInformationMessage('✅ Valid JSON');
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Invalid JSON: ${error}`);
        }
    }

    private _copyToClipboard(data: string) {
        vscode.env.clipboard.writeText(data).then(() => {
            vscode.window.showInformationMessage('Copied to clipboard');
        });
    }

    private _expandAll() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'expandAll'
            });
        }
    }

    private _collapseAll() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'collapseAll'
            });
        }
    }

    private _exportJson() {
        if (!this._currentJsonContent) {
            vscode.window.showWarningMessage('No JSON content to export');
            return;
        }

        vscode.window.showSaveDialog({
            filters: {
                'JSON files': ['json'],
                'All files': ['*']
            },
            defaultUri: vscode.Uri.file('export.json')
        }).then(uri => {
            if (uri) {
                const content = JSON.stringify(this._currentJsonContent, null, 2);
                fs.writeFileSync(uri.fsPath, content, 'utf8');
                vscode.window.showInformationMessage(`JSON exported to ${uri.fsPath}`);
            }
        });
    }

    private _searchJson(query: string) {
        if (this._view && this._currentJsonContent) {
            const results = this._findInJson(this._currentJsonContent, query.toLowerCase());
            this._view.webview.postMessage({
                type: 'searchResults',
                results: results,
                query: query
            });
        }
    }

    private _findInJson(obj: any, query: string, path: string = ''): Array<{path: string, value: any, type: string}> {
        const results: Array<{path: string, value: any, type: string}> = [];
        
        const traverse = (current: any, currentPath: string) => {
            if (typeof current === 'object' && current !== null) {
                if (Array.isArray(current)) {
                    current.forEach((item, index) => {
                        const itemPath = `${currentPath}[${index}]`;
                        if (JSON.stringify(item).toLowerCase().includes(query)) {
                            results.push({
                                path: itemPath,
                                value: item,
                                type: typeof item
                            });
                        }
                        traverse(item, itemPath);
                    });
                } else {
                    Object.keys(current).forEach(key => {
                        const keyPath = currentPath ? `${currentPath}.${key}` : key;
                        const value = current[key];
                        
                        // Check if key matches
                        if (key.toLowerCase().includes(query)) {
                            results.push({
                                path: keyPath,
                                value: value,
                                type: typeof value
                            });
                        }
                        
                        // Check if value matches
                        if (typeof value === 'string' && value.toLowerCase().includes(query)) {
                            results.push({
                                path: keyPath,
                                value: value,
                                type: 'string'
                            });
                        } else if (typeof value === 'number' && value.toString().includes(query)) {
                            results.push({
                                path: keyPath,
                                value: value,
                                type: 'number'
                            });
                        }
                        
                        traverse(value, keyPath);
                    });
                }
            }
        };
        
        traverse(obj, path);
        return results;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get path to resource on disk
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

        // Use a nonce to only allow specific scripts to be run
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
                <title>JSON Viewer</title>
                <style>
                    body {
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    
                    .toolbar {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 16px;
                        padding: 8px;
                        background-color: var(--vscode-editor-widget-background);
                        border-radius: 4px;
                        border: 1px solid var(--vscode-widget-border);
                        flex-wrap: wrap;
                    }
                    
                    .toolbar button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 11px;
                    }
                    
                    .toolbar button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    
                    .toolbar button:active {
                        background: var(--vscode-button-background);
                        transform: translateY(1px);
                    }
                    
                    .search-container {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 16px;
                    }
                    
                    .search-input {
                        flex: 1;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 6px 8px;
                        border-radius: 3px;
                        font-family: inherit;
                    }
                    
                    .search-input:focus {
                        border-color: var(--vscode-focusBorder);
                        outline: none;
                    }
                    
                    .file-info {
                        margin-bottom: 16px;
                        padding: 8px;
                        background-color: var(--vscode-editor-widget-background);
                        border-radius: 4px;
                        border: 1px solid var(--vscode-widget-border);
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .json-container {
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                        background-color: var(--vscode-editor-background);
                        overflow: auto;
                        max-height: 70vh;
                    }
                    
                    .json-tree {
                        padding: 16px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        line-height: 1.4;
                    }
                    
                    .json-key {
                        color: var(--vscode-symbolIcon-propertyForeground);
                        font-weight: bold;
                    }
                    
                    .json-string {
                        color: var(--vscode-debugTokenExpression-string);
                    }
                    
                    .json-number {
                        color: var(--vscode-debugTokenExpression-number);
                    }
                    
                    .json-boolean {
                        color: var(--vscode-debugTokenExpression-boolean);
                    }
                    
                    .json-null {
                        color: var(--vscode-debugTokenExpression-name);
                        font-style: italic;
                    }
                    
                    .json-object, .json-array {
                        margin-left: 20px;
                    }
                    
                    .json-toggle {
                        cursor: pointer;
                        user-select: none;
                        color: var(--vscode-icon-foreground);
                        margin-right: 4px;
                    }
                    
                    .json-toggle:hover {
                        color: var(--vscode-textLink-foreground);
                    }
                    
                    .json-collapsed .json-content {
                        display: none;
                    }
                    
                    .json-line {
                        margin: 2px 0;
                    }
                    
                    .search-highlight {
                        background-color: var(--vscode-editor-findMatchHighlightBackground);
                        border: 1px solid var(--vscode-editor-findMatchBorder);
                        border-radius: 2px;
                        padding: 0 2px;
                    }
                    
                    .search-results {
                        margin-top: 16px;
                        padding: 8px;
                        background-color: var(--vscode-editor-widget-background);
                        border-radius: 4px;
                        border: 1px solid var(--vscode-widget-border);
                        max-height: 200px;
                        overflow-y: auto;
                    }
                    
                    .search-result {
                        padding: 4px 8px;
                        margin: 2px 0;
                        background-color: var(--vscode-list-hoverBackground);
                        border-radius: 2px;
                        cursor: pointer;
                        font-family: var(--vscode-editor-font-family);
                        font-size: 12px;
                    }
                    
                    .search-result:hover {
                        background-color: var(--vscode-list-activeSelectionBackground);
                    }
                    
                    .result-path {
                        color: var(--vscode-symbolIcon-keywordForeground);
                        font-weight: bold;
                    }
                    
                    .result-value {
                        color: var(--vscode-editor-foreground);
                        margin-left: 8px;
                    }
                    
                    .welcome-message {
                        text-align: center;
                        padding: 40px 20px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .welcome-icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                        color: var(--vscode-symbolIcon-fileForeground);
                    }
                    
                    .error-message {
                        color: var(--vscode-errorForeground);
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        padding: 12px;
                        border-radius: 4px;
                        margin-bottom: 16px;
                    }
                    
                    .stats {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 8px;
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    <div class="welcome-message" id="welcome">
                        <div class="welcome-icon">📄</div>
                        <h3>JSON Viewer</h3>
                        <p>Open a JSON file or select a JSON file in the editor to view its content.</p>
                    </div>
                </div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    let currentJson = null;
                    let searchResults = [];

                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'updateJson':
                                showJsonContent(message.data);
                                break;
                            case 'showWelcome':
                                showWelcome();
                                break;
                            case 'showError':
                                showError(message.message);
                                break;
                            case 'expandAll':
                                expandAll();
                                break;
                            case 'collapseAll':
                                collapseAll();
                                break;
                            case 'searchResults':
                                showSearchResults(message.results, message.query);
                                break;
                        }
                    });

                    function showWelcome() {
                        document.getElementById('content').innerHTML = \`
                            <div class="welcome-message">
                                <div class="welcome-icon">📄</div>
                                <h3>JSON Viewer</h3>
                                <p>Open a JSON file or select a JSON file in the editor to view its content.</p>
                            </div>
                        \`;
                    }

                    function showError(message) {
                        document.getElementById('content').innerHTML = \`
                            <div class="error-message">
                                <strong>Error:</strong> \${message}
                            </div>
                            <div class="welcome-message">
                                <div class="welcome-icon">❌</div>
                                <h3>Unable to parse JSON</h3>
                                <p>Please check the JSON syntax and try again.</p>
                            </div>
                        \`;
                    }

                    function showJsonContent(data) {
                        currentJson = data.content;
                        const fileName = data.filePath.split(/[\\\\/]/).pop() || 'Unknown';
                        const stats = getJsonStats(currentJson);
                        
                        document.getElementById('content').innerHTML = \`
                            <div class="toolbar">
                                <button onclick="refresh()">
                                    <i class="codicon codicon-refresh"></i> Refresh
                                </button>
                                <button onclick="format()">
                                    <i class="codicon codicon-code"></i> Format
                                </button>
                                <button onclick="validate()">
                                    <i class="codicon codicon-check"></i> Validate
                                </button>
                                <button onclick="copyJson()">
                                    <i class="codicon codicon-copy"></i> Copy
                                </button>
                                <button onclick="expandAll()">
                                    <i class="codicon codicon-expand-all"></i> Expand All
                                </button>
                                <button onclick="collapseAll()">
                                    <i class="codicon codicon-collapse-all"></i> Collapse All
                                </button>
                                <button onclick="exportJson()">
                                    <i class="codicon codicon-export"></i> Export
                                </button>
                            </div>
                            
                            <div class="search-container">
                                <input type="text" class="search-input" placeholder="Search JSON..." 
                                       onkeyup="searchJson(this.value)" id="searchInput">
                                <button onclick="clearSearch()" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);">
                                    <i class="codicon codicon-clear-all"></i>
                                </button>
                            </div>
                            
                            <div class="file-info">
                                <strong>File:</strong> \${fileName}
                                <div class="stats">\${stats}</div>
                            </div>
                            
                            <div class="json-container">
                                <div class="json-tree" id="jsonTree">
                                    \${renderJson(currentJson)}
                                </div>
                            </div>
                            
                            <div id="searchResults" style="display: none;"></div>
                        \`;
                        
                        attachToggleEvents();
                    }

                    function getJsonStats(obj) {
                        let stats = { objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0 };
                        
                        function count(item) {
                            if (item === null) {
                                stats.nulls++;
                            } else if (typeof item === 'string') {
                                stats.strings++;
                            } else if (typeof item === 'number') {
                                stats.numbers++;
                            } else if (typeof item === 'boolean') {
                                stats.booleans++;
                            } else if (Array.isArray(item)) {
                                stats.arrays++;
                                item.forEach(count);
                            } else if (typeof item === 'object') {
                                stats.objects++;
                                Object.values(item).forEach(count);
                            }
                        }
                        
                        count(obj);
                        
                        return \`Objects: \${stats.objects}, Arrays: \${stats.arrays}, Strings: \${stats.strings}, Numbers: \${stats.numbers}, Booleans: \${stats.booleans}, Nulls: \${stats.nulls}\`;
                    }

                    function renderJson(obj, depth = 0) {
                        if (obj === null) {
                            return '<span class="json-null">null</span>';
                        }
                        
                        if (typeof obj === 'string') {
                            return \`<span class="json-string">"\${escapeHtml(obj)}"</span>\`;
                        }
                        
                        if (typeof obj === 'number') {
                            return \`<span class="json-number">\${obj}</span>\`;
                        }
                        
                        if (typeof obj === 'boolean') {
                            return \`<span class="json-boolean">\${obj}</span>\`;
                        }
                        
                        if (Array.isArray(obj)) {
                            if (obj.length === 0) {
                                return '<span class="json-array">[]</span>';
                            }
                            
                            const id = 'array_' + Math.random().toString(36).substr(2, 9);
                            let result = \`<div class="json-line">
                                <span class="json-toggle" onclick="toggleCollapse('\${id}')">▼</span>
                                <span class="json-array">[</span>
                                <div class="json-content" id="\${id}">
                            \`;
                            
                            obj.forEach((item, index) => {
                                result += \`<div class="json-object">\${renderJson(item, depth + 1)}\${index < obj.length - 1 ? ',' : ''}</div>\`;
                            });
                            
                            result += \`</div>]</div>\`;
                            return result;
                        }
                        
                        if (typeof obj === 'object') {
                            const keys = Object.keys(obj);
                            if (keys.length === 0) {
                                return '<span class="json-object">{}</span>';
                            }
                            
                            const id = 'object_' + Math.random().toString(36).substr(2, 9);
                            let result = \`<div class="json-line">
                                <span class="json-toggle" onclick="toggleCollapse('\${id}')">▼</span>
                                <span class="json-object">{</span>
                                <div class="json-content" id="\${id}">
                            \`;
                            
                            keys.forEach((key, index) => {
                                result += \`<div class="json-object">
                                    <span class="json-key">"\${escapeHtml(key)}"</span>: \${renderJson(obj[key], depth + 1)}\${index < keys.length - 1 ? ',' : ''}
                                </div>\`;
                            });
                            
                            result += \`</div>}</div>\`;
                            return result;
                        }
                        
                        return String(obj);
                    }

                    function escapeHtml(text) {
                        const map = {
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#039;'
                        };
                        return text.replace(/[&<>"']/g, m => map[m]);
                    }

                    function attachToggleEvents() {
                        // Events are attached via onclick in the HTML
                    }

                    function toggleCollapse(id) {
                        const element = document.getElementById(id);
                        const toggle = element.previousElementSibling;
                        
                        if (element.style.display === 'none') {
                            element.style.display = 'block';
                            toggle.textContent = '▼';
                        } else {
                            element.style.display = 'none';
                            toggle.textContent = '►';
                        }
                    }

                    function expandAll() {
                        document.querySelectorAll('.json-content').forEach(element => {
                            element.style.display = 'block';
                        });
                        document.querySelectorAll('.json-toggle').forEach(toggle => {
                            toggle.textContent = '▼';
                        });
                    }

                    function collapseAll() {
                        document.querySelectorAll('.json-content').forEach(element => {
                            element.style.display = 'none';
                        });
                        document.querySelectorAll('.json-toggle').forEach(toggle => {
                            toggle.textContent = '►';
                        });
                    }

                    function refresh() {
                        vscode.postMessage({ type: 'refresh' });
                    }

                    function format() {
                        vscode.postMessage({ type: 'format' });
                    }

                    function validate() {
                        vscode.postMessage({ type: 'validate' });
                    }

                    function copyJson() {
                        if (currentJson) {
                            vscode.postMessage({ 
                                type: 'copy', 
                                data: JSON.stringify(currentJson, null, 2) 
                            });
                        }
                    }

                    function exportJson() {
                        vscode.postMessage({ type: 'export' });
                    }

                    function searchJson(query) {
                        if (query.trim() === '') {
                            clearSearch();
                            return;
                        }
                        
                        vscode.postMessage({ 
                            type: 'search', 
                            query: query 
                        });
                    }

                    function clearSearch() {
                        document.getElementById('searchInput').value = '';
                        document.getElementById('searchResults').style.display = 'none';
                        
                        // Remove search highlights
                        document.querySelectorAll('.search-highlight').forEach(element => {
                            element.outerHTML = element.innerHTML;
                        });
                    }

                    function showSearchResults(results, query) {
                        const resultsContainer = document.getElementById('searchResults');
                        
                        if (results.length === 0) {
                            resultsContainer.innerHTML = \`
                                <div class="search-results">
                                    <strong>No results found for "\${query}"</strong>
                                </div>
                            \`;
                        } else {
                            let html = \`<div class="search-results">
                                <strong>Found \${results.length} result(s) for "\${query}":</strong>
                            \`;
                            
                            results.forEach((result, index) => {
                                const valuePreview = typeof result.value === 'string' 
                                    ? result.value.substring(0, 100) + (result.value.length > 100 ? '...' : '')
                                    : JSON.stringify(result.value);
                                    
                                html += \`
                                    <div class="search-result" onclick="highlightPath('\${result.path}')">
                                        <div class="result-path">\${result.path}</div>
                                        <div class="result-value">(\${result.type}) \${escapeHtml(valuePreview)}</div>
                                    </div>
                                \`;
                            });
                            
                            html += '</div>';
                            resultsContainer.innerHTML = html;
                        }
                        
                        resultsContainer.style.display = 'block';
                    }

                    function highlightPath(path) {
                        // This is a simplified version - in a real implementation,
                        // you'd want to scroll to and highlight the specific path in the JSON tree
                        console.log('Highlighting path:', path);
                    }
                </script>
            </body>
            </html>`;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
