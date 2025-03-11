import * as vscode from 'vscode';
import { getHtmlTemplate } from './htmlTemplate';
import { styles } from './styles';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * VisbalLogView class for displaying logs in the panel area
 */
export class VisbalLogView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalLogView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _downloadedLogs: Set<string> = new Set<string>();

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionUri = _context.extensionUri;
        this._checkDownloadedLogs();
    }

    /**
     * Resolves the webview view
     * @param webviewView The webview view to resolve
     * @param context The context in which the view is being resolved
     * @param token A cancellation token that indicates the result is no longer needed
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set the initial HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'fetchLogs':
                        this._fetchLogs();
                        return;
                    case 'downloadLog':
                        this._downloadLog(message.logId);
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );

        // Initial fetch of logs
        this._fetchLogs();
    }

    /**
     * Refreshes the view with the latest logs
     */
    public refresh(): void {
        if (this._view) {
            this._checkDownloadedLogs();
            this._fetchLogs();
        }
    }

    /**
     * Checks which logs have already been downloaded
     */
    private _checkDownloadedLogs(): void {
        // Clear the set
        this._downloadedLogs.clear();
        
        // Get the logs directory
        const logsDir = this._getLogsDirectory();
        
        // If the directory doesn't exist, create it
        if (!fs.existsSync(logsDir)) {
            try {
                fs.mkdirSync(logsDir, { recursive: true });
            } catch (error) {
                console.error('Error creating logs directory:', error);
                return;
            }
        }
        
        // Read the directory
        try {
            const files = fs.readdirSync(logsDir);
            
            // Add each log ID to the set
            files.forEach(file => {
                // Extract the log ID from the filename (assuming format: logId.log)
                const logId = path.parse(file).name;
                if (logId) {
                    this._downloadedLogs.add(logId);
                }
            });
            
            console.log(`Found ${this._downloadedLogs.size} downloaded logs`);
        } catch (error) {
            console.error('Error reading logs directory:', error);
        }
    }

    /**
     * Gets the logs directory path
     */
    private _getLogsDirectory(): string {
        // Get the home directory
        const homeDir = os.homedir();
        
        // Construct the path to the logs directory
        return path.join(homeDir, '.sfdx', 'tools', 'debug', 'logs');
    }

    /**
     * Downloads a log
     * @param logId The ID of the log to download
     */
    private async _downloadLog(logId: string): Promise<void> {
        try {
            // Show progress notification
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Downloading log ${logId}`,
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0 });
                    
                    // Simulate fetching the log content (replace with actual API call)
                    const logContent = await this._fetchLogContent(logId);
                    
                    progress.report({ increment: 50, message: 'Saving log...' });
                    
                    // Save the log to the logs directory
                    const logsDir = this._getLogsDirectory();
                    const logPath = path.join(logsDir, `${logId}.log`);
                    
                    fs.writeFileSync(logPath, logContent);
                    
                    // Add the log ID to the downloaded logs set
                    this._downloadedLogs.add(logId);
                    
                    // Update the view
                    this._fetchLogs();
                    
                    progress.report({ increment: 100, message: 'Done' });
                    
                    vscode.window.showInformationMessage(`Log ${logId} downloaded successfully`);
                }
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error downloading log: ${error.message}`);
        }
    }

    /**
     * Fetches the content of a log
     * @param logId The ID of the log to fetch
     */
    private async _fetchLogContent(logId: string): Promise<string> {
        // Simulate fetching log content (replace with actual API call)
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`Log content for ${logId}\n\nThis is a simulated log content.\nIt would contain the actual log data in a real implementation.\n\nTimestamp: ${new Date().toISOString()}\nLog ID: ${logId}`);
            }, 1000);
        });
    }

    /**
     * Fetches logs and updates the view
     */
    private _fetchLogs(): void {
        if (!this._view) {
            return;
        }

        // Show loading state
        this._view.webview.postMessage({ command: 'loading', loading: true });

        // Simulate fetching logs (replace with actual log fetching logic)
        setTimeout(() => {
            const mockLogs = [
                {
                    id: '07L5g000000TgXXEA0',
                    logUser: {
                        name: 'Sample User'
                    },
                    application: 'API',
                    operation: 'API',
                    request: '/services/data/v55.0/sobjects/Account',
                    status: 'Success',
                    logLength: 15243,
                    lastModifiedDate: new Date().toISOString(),
                    downloaded: this._downloadedLogs.has('07L5g000000TgXXEA0')
                },
                {
                    id: '07L5g000000TgXYEA0',
                    logUser: {
                        name: 'Sample User'
                    },
                    application: 'Apex',
                    operation: 'Execution',
                    request: '/apex/MyPage',
                    status: 'Success',
                    logLength: 32156,
                    lastModifiedDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
                    downloaded: this._downloadedLogs.has('07L5g000000TgXYEA0')
                },
                {
                    id: '07L5g000000TgXZEA0',
                    logUser: {
                        name: 'Integration User'
                    },
                    application: 'Batch',
                    operation: 'Batch',
                    request: 'BatchJob',
                    status: 'Success',
                    logLength: 54321,
                    lastModifiedDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
                    downloaded: this._downloadedLogs.has('07L5g000000TgXZEA0')
                }
            ];

            // Send logs to the webview
            this._view?.webview.postMessage({ 
                command: 'updateLogs', 
                logs: mockLogs 
            });

            // Hide loading state
            this._view?.webview.postMessage({ command: 'loading', loading: false });
        }, 1000);
    }

    /**
     * Returns the HTML content for the webview
     * @param webview The webview to get HTML for
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Visbal Log</title>
            <style>
                ${styles}
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .title {
                    font-size: 18px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .title-icon {
                    font-family: 'codicon';
                }
                .search-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 8px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    margin-bottom: 16px;
                }
                .search-icon {
                    font-family: 'codicon';
                    color: var(--vscode-input-placeholderForeground);
                }
                .search-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: var(--vscode-input-foreground);
                    outline: none;
                    font-size: 14px;
                }
                .table-container {
                    flex: 1;
                    overflow: auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th {
                    position: sticky;
                    top: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    text-align: left;
                    padding: 8px 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                tr {
                    cursor: pointer;
                }
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                tr:nth-child(even) {
                    background-color: var(--vscode-editor-background);
                }
                td {
                    padding: 8px 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-foreground);
                }
                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    padding: 20px;
                }
                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(74, 156, 214, 0.3);
                    border-radius: 50%;
                    border-top-color: #4a9cd6;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .loading-text {
                    margin-top: 16px;
                    color: var(--vscode-descriptionForeground);
                }
                .error-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    padding: 20px;
                    color: var(--vscode-errorForeground);
                }
                .error-icon {
                    font-family: 'codicon';
                    font-size: 24px;
                    margin-bottom: 16px;
                }
                .refresh-button {
                    margin-top: 16px;
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .refresh-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .refresh-icon {
                    font-family: 'codicon';
                }
                .download-status {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .download-icon {
                    font-family: 'codicon';
                    font-size: 14px;
                }
                .downloaded {
                    color: var(--vscode-terminal-ansiGreen);
                }
                .not-downloaded {
                    color: var(--vscode-terminal-ansiYellow);
                }
                .truncate {
                    max-width: 150px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="title">
                        <span class="title-icon">$(notebook)</span>
                        <span>Visbal Log</span>
                    </div>
                    <button class="refresh-button" id="refresh-button">
                        <span class="refresh-icon">$(refresh)</span>
                        <span>Refresh</span>
                    </button>
                </div>
                
                <div class="search-container">
                    <span class="search-icon">$(search)</span>
                    <input type="text" class="search-input" placeholder="Search logs..." id="search-input">
                </div>
                
                <div class="table-container" id="table-container">
                    <div class="loading-container" id="loading-container">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Loading logs...</div>
                    </div>
                </div>
            </div>
            
            <script>
                (function() {
                    // Get VS Code API
                    const vscode = acquireVsCodeApi();
                    
                    // Elements
                    const tableContainer = document.getElementById('table-container');
                    const loadingContainer = document.getElementById('loading-container');
                    const refreshButton = document.getElementById('refresh-button');
                    const searchInput = document.getElementById('search-input');
                    
                    // State
                    let logs = [];
                    let filteredLogs = [];
                    
                    // Initialize
                    document.addEventListener('DOMContentLoaded', () => {
                        // Request logs from extension
                        vscode.postMessage({ command: 'fetchLogs' });
                    });
                    
                    // Handle refresh button click
                    refreshButton.addEventListener('click', () => {
                        showLoading();
                        vscode.postMessage({ command: 'fetchLogs' });
                    });
                    
                    // Handle search input
                    searchInput.addEventListener('input', () => {
                        filterLogs();
                    });
                    
                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'updateLogs':
                                logs = message.logs;
                                filteredLogs = [...logs];
                                renderLogs();
                                break;
                                
                            case 'loading':
                                if (message.loading) {
                                    showLoading();
                                }
                                break;
                                
                            case 'error':
                                showError(message.error);
                                break;
                        }
                    });
                    
                    // Show loading state
                    function showLoading() {
                        tableContainer.innerHTML = '';
                        tableContainer.appendChild(loadingContainer);
                    }
                    
                    // Show error state
                    function showError(errorMessage) {
                        tableContainer.innerHTML = '';
                        
                        const errorContainer = document.createElement('div');
                        errorContainer.className = 'error-container';
                        
                        const errorIcon = document.createElement('div');
                        errorIcon.className = 'error-icon';
                        errorIcon.innerHTML = '$(error)';
                        errorContainer.appendChild(errorIcon);
                        
                        const errorText = document.createElement('div');
                        errorText.textContent = errorMessage || 'An error occurred while fetching logs';
                        errorContainer.appendChild(errorText);
                        
                        const retryButton = document.createElement('button');
                        retryButton.className = 'refresh-button';
                        
                        const retryIcon = document.createElement('span');
                        retryIcon.className = 'refresh-icon';
                        retryIcon.innerHTML = '$(refresh)';
                        retryButton.appendChild(retryIcon);
                        
                        const retryText = document.createElement('span');
                        retryText.textContent = 'Try Again';
                        retryButton.appendChild(retryText);
                        
                        retryButton.addEventListener('click', () => {
                            showLoading();
                            vscode.postMessage({ command: 'fetchLogs' });
                        });
                        
                        errorContainer.appendChild(retryButton);
                        tableContainer.appendChild(errorContainer);
                    }
                    
                    // Filter logs based on search input
                    function filterLogs() {
                        const searchTerm = searchInput.value.toLowerCase();
                        
                        if (!searchTerm) {
                            filteredLogs = [...logs];
                        } else {
                            filteredLogs = logs.filter(log => 
                                log.id.toLowerCase().includes(searchTerm) ||
                                log.logUser.name.toLowerCase().includes(searchTerm) ||
                                log.application.toLowerCase().includes(searchTerm) ||
                                log.operation.toLowerCase().includes(searchTerm) ||
                                log.status.toLowerCase().includes(searchTerm)
                            );
                        }
                        
                        renderLogs();
                    }
                    
                    // Render logs table
                    function renderLogs() {
                        tableContainer.innerHTML = '';
                        
                        if (!filteredLogs || filteredLogs.length === 0) {
                            const noLogsContainer = document.createElement('div');
                            noLogsContainer.className = 'loading-container';
                            noLogsContainer.textContent = 'No logs found';
                            tableContainer.appendChild(noLogsContainer);
                            return;
                        }
                        
                        const table = document.createElement('table');
                        
                        // Create table header
                        const thead = document.createElement('thead');
                        const headerRow = document.createElement('tr');
                        
                        const headers = [
                            { id: 'id', label: 'ID' },
                            { id: 'user', label: 'User' },
                            { id: 'application', label: 'Application' },
                            { id: 'operation', label: 'Operation' },
                            { id: 'time', label: 'Time' },
                            { id: 'status', label: 'Status' },
                            { id: 'size', label: 'Size (bytes)' },
                            { id: 'downloaded', label: 'Downloaded' }
                        ];
                        
                        headers.forEach(header => {
                            const th = document.createElement('th');
                            th.textContent = header.label;
                            headerRow.appendChild(th);
                        });
                        
                        thead.appendChild(headerRow);
                        table.appendChild(thead);
                        
                        // Create table body
                        const tbody = document.createElement('tbody');
                        
                        filteredLogs.forEach(log => {
                            const row = document.createElement('tr');
                            
                            // ID column
                            const idCell = document.createElement('td');
                            idCell.className = 'truncate';
                            idCell.title = log.id;
                            idCell.textContent = log.id;
                            row.appendChild(idCell);
                            
                            // User column
                            const userCell = document.createElement('td');
                            userCell.textContent = log.logUser.name;
                            row.appendChild(userCell);
                            
                            // Application column
                            const appCell = document.createElement('td');
                            appCell.textContent = log.application;
                            row.appendChild(appCell);
                            
                            // Operation column
                            const opCell = document.createElement('td');
                            opCell.textContent = log.operation;
                            row.appendChild(opCell);
                            
                            // Time column
                            const timeCell = document.createElement('td');
                            const date = new Date(log.lastModifiedDate);
                            timeCell.textContent = date.toLocaleString();
                            row.appendChild(timeCell);
                            
                            // Status column
                            const statusCell = document.createElement('td');
                            statusCell.textContent = log.status;
                            row.appendChild(statusCell);
                            
                            // Size column
                            const sizeCell = document.createElement('td');
                            sizeCell.textContent = log.logLength;
                            row.appendChild(sizeCell);
                            
                            // Downloaded column
                            const downloadedCell = document.createElement('td');
                            downloadedCell.className = 'download-status';
                            
                            const downloadIcon = document.createElement('span');
                            downloadIcon.className = 'download-icon ' + (log.downloaded ? 'downloaded' : 'not-downloaded');
                            downloadIcon.innerHTML = log.downloaded ? '$(check)' : '$(cloud-download)';
                            downloadIcon.title = log.downloaded ? 'Downloaded' : 'Click to download';
                            downloadedCell.appendChild(downloadIcon);
                            
                            row.appendChild(downloadedCell);
                            
                            // Add click event to row
                            row.addEventListener('click', () => {
                                if (!log.downloaded) {
                                    vscode.postMessage({
                                        command: 'downloadLog',
                                        logId: log.id
                                    });
                                } else {
                                    vscode.postMessage({
                                        command: 'alert',
                                        text: \`Log \${log.id} is already downloaded\`
                                    });
                                }
                            });
                            
                            tbody.appendChild(row);
                        });
                        
                        table.appendChild(tbody);
                        tableContainer.appendChild(table);
                    }
                })();
            </script>
        </body>
        </html>
        `;
    }
} 