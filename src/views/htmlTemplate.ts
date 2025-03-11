import { styles } from './styles';

/**
 * Returns the HTML template for the log list view
 */
export function getLogListTemplate(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Salesforce Debug Logs</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                margin: 0;
                padding: 0;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                padding: 15px;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            h1 {
                margin: 0;
                font-size: 1.5em;
            }
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                cursor: pointer;
                margin-right: 8px;
            }
            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .logs-table {
                width: 100%;
                border-collapse: collapse;
            }
            .logs-table th, .logs-table td {
                text-align: left;
                padding: 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .logs-table th {
                background-color: var(--vscode-editor-background);
                position: sticky;
                top: 0;
            }
            .no-logs-message {
                padding: 20px;
                text-align: center;
                color: var(--vscode-disabledForeground);
            }
            .hidden {
                display: none !important;
            }
            .error-container {
                background-color: var(--vscode-inputValidation-errorBackground);
                border: 1px solid var(--vscode-inputValidation-errorBorder);
                color: var(--vscode-inputValidation-errorForeground);
                padding: 10px;
                margin-bottom: 15px;
                border-radius: 3px;
            }
            .error-message {
                margin-left: 10px;
            }
            .loading-container {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .loading-spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                border-radius: 50%;
                border-top: 4px solid var(--vscode-progressBar-background);
                width: 20px;
                height: 20px;
                animation: spin 1s linear infinite;
                margin-right: 10px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Salesforce Debug Logs</h1>
                <div class="actions">
                    <button id="refreshButton" class="button">Refresh</button>
                    <button id="refreshSoqlButton" class="button">Refresh (SOQL)</button>
                </div>
            </div>
            
            <div id="loadingIndicator" class="loading-container hidden">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading logs...</div>
            </div>
            
            <div id="errorContainer" class="error-container hidden">
                <div id="errorMessage" class="error-message"></div>
            </div>
            
            <div id="logsContainer">
                <div id="noLogsMessage" class="no-logs-message">
                    No logs found. Click Refresh to fetch logs.
                </div>
                <table id="logsTable" class="logs-table hidden">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Application</th>
                            <th>Operation</th>
                            <th>Status</th>
                            <th>Size</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="logsTableBody">
                        <!-- Logs will be inserted here -->
                    </tbody>
                </table>
            </div>
        </div>
        
        <script>
            (function() {
                // Debug flag - set to true to show debug messages in the UI
                const DEBUG = true;
                
                // Elements
                const refreshButton = document.getElementById('refreshButton');
                const refreshSoqlButton = document.getElementById('refreshSoqlButton');
                const logsTable = document.getElementById('logsTable');
                const logsTableBody = document.getElementById('logsTableBody');
                const noLogsMessage = document.getElementById('noLogsMessage');
                const loadingIndicator = document.getElementById('loadingIndicator');
                const errorContainer = document.getElementById('errorContainer');
                const errorMessage = document.getElementById('errorMessage');
                
                // Debug function
                function debug(message) {
                    console.log(message);
                    if (DEBUG) {
                        showMessage(message);
                    }
                }
                
                // Show message in UI
                function showMessage(message) {
                    errorMessage.textContent = message;
                    errorContainer.classList.remove('hidden');
                }
                
                // Hide message
                function hideMessage() {
                    errorContainer.classList.add('hidden');
                }
                
                // Format file size
                function formatFileSize(bytes) {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                }
                
                // VSCode API
                const vscode = acquireVsCodeApi();
                debug('Webview initialized, acquired VSCode API');
                
                // State
                let logs = [];
                
                // Show loading state
                function showLoading() {
                    loadingIndicator.classList.remove('hidden');
                    refreshButton.disabled = true;
                    refreshSoqlButton.disabled = true;
                }
                
                // Hide loading state
                function hideLoading() {
                    loadingIndicator.classList.add('hidden');
                    refreshButton.disabled = false;
                    refreshSoqlButton.disabled = false;
                }
                
                // Render logs
                function renderLogs() {
                    debug('Rendering ' + logs.length + ' logs');
                    
                    // Clear the table
                    logsTableBody.innerHTML = '';
                    
                    // Check if we have logs
                    if (!logs || logs.length === 0) {
                        debug('No logs to display');
                        logsTable.classList.add('hidden');
                        noLogsMessage.classList.remove('hidden');
                        return;
                    }
                    
                    // Show the table and hide the no logs message
                    logsTable.classList.remove('hidden');
                    noLogsMessage.classList.add('hidden');
                    
                    // Add logs to the table
                    let rowsAdded = 0;
                    
                    logs.forEach((log, index) => {
                        if (!log || !log.id) {
                            console.error('Invalid log entry at index ' + index, log);
                            return;
                        }
                        
                        const row = document.createElement('tr');
                        
                        // Format date
                        const date = new Date(log.lastModifiedDate || new Date());
                        const formattedDate = date.toLocaleString();
                        
                        // Format size
                        const formattedSize = formatFileSize(log.logLength || 0);
                        
                        // Create row
                        row.innerHTML = 
                            '<td>' + (log.logUser?.name || 'Unknown') + '</td>' +
                            '<td>' + (log.application || 'Unknown') + '</td>' +
                            '<td>' + (log.operation || 'Unknown') + '</td>' +
                            '<td>' + (log.status || 'Unknown') + '</td>' +
                            '<td>' + formattedSize + '</td>' +
                            '<td>' + formattedDate + '</td>' +
                            '<td>' +
                                '<button class="button download-button" data-log-id="' + log.id + '">' +
                                    (log.downloaded ? 'Downloaded' : 'Download') +
                                '</button>' +
                            '</td>';
                        
                        logsTableBody.appendChild(row);
                        rowsAdded++;
                    });
                    
                    debug('Added ' + rowsAdded + ' rows to table');
                    
                    // Add event listeners to download buttons
                    document.querySelectorAll('.download-button').forEach(button => {
                        button.addEventListener('click', () => {
                            const logId = button.getAttribute('data-log-id');
                            debug('Download button clicked for log: ' + logId);
                            
                            vscode.postMessage({ 
                                command: 'downloadLog', 
                                logId: logId 
                            });
                            
                            // Update button to show downloading state
                            button.disabled = true;
                            button.textContent = 'Downloading...';
                        });
                    });
                }
                
                // Initialize
                document.addEventListener('DOMContentLoaded', () => {
                    debug('DOM content loaded, requesting logs');
                    vscode.postMessage({ command: 'fetchLogs' });
                    showLoading();
                });
                
                // Event listeners
                refreshButton.addEventListener('click', () => {
                    debug('Refresh button clicked');
                    vscode.postMessage({ command: 'fetchLogs' });
                    showLoading();
                });
                
                refreshSoqlButton.addEventListener('click', () => {
                    debug('SOQL Refresh button clicked');
                    vscode.postMessage({ command: 'fetchLogsSoql' });
                    showLoading();
                });
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    debug('Received message: ' + message.command);
                    
                    switch (message.command) {
                        case 'updateLogs':
                            if (!message.logs || !Array.isArray(message.logs)) {
                                showMessage('Invalid logs data received');
                                hideLoading();
                                return;
                            }
                            
                            debug('Received ' + message.logs.length + ' logs');
                            
                            // Update logs
                            logs = message.logs;
                            
                            // Render logs
                            renderLogs();
                            
                            // Hide loading state
                            hideLoading();
                            break;
                            
                        case 'loading':
                            if (message.loading) {
                                showLoading();
                            } else {
                                hideLoading();
                            }
                            break;
                            
                        case 'error':
                            showMessage(message.error);
                            hideLoading();
                            break;
                            
                        case 'downloadStatus':
                            const button = document.querySelector('.download-button[data-log-id="' + message.logId + '"]');
                            if (!button) return;
                            
                            switch (message.status) {
                                case 'downloading':
                                    button.disabled = true;
                                    button.textContent = 'Downloading...';
                                    break;
                                case 'downloaded':
                                    button.disabled = false;
                                    button.textContent = 'Downloaded';
                                    // Update the log in the state
                                    const log = logs.find(l => l.id === message.logId);
                                    if (log) {
                                        log.downloaded = true;
                                    }
                                    break;
                                case 'error':
                                    button.disabled = false;
                                    button.textContent = 'Failed';
                                    button.title = message.error || 'Download failed';
                                    break;
                            }
                            break;
                    }
                });
                
                // Initial debug message
                debug('Webview script loaded and ready');
            })();
        </script>
    </body>
    </html>`;
}

/**
 * Returns the HTML template for the log detail view
 */
export function getHtmlTemplate(
    parsedData: any, 
    logFileName: string, 
    fileSize: string,
    currentTab: string,
    tabs: any[],
    categories: any[]
): string {
    // Original implementation for log detail view
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Log Summary: ${logFileName}</title>
        <style>
            ${styles}
        </style>
    </head>
    <body>
        <h1>Log Detail View</h1>
        <p>This is a placeholder for the log detail view.</p>
    </body>
    </html>`;
} 