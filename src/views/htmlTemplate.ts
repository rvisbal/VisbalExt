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
            ${styles}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Salesforce Debug Logs</h1>
                <div class="actions">
                    <button id="refreshButton" class="button">
                        <span class="icon refresh-icon"></span>
                        <span class="button-text">Refresh</span>
                    </button>
                    <button id="refreshSoqlButton" class="button">
                        <span class="icon refresh-icon"></span>
                        <span class="button-text">Refresh (SOQL)</span>
                    </button>
                </div>
            </div>
            
            <div id="loadingIndicator" class="loading-container hidden">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading logs...</div>
            </div>
            
            <div id="errorContainer" class="error-container hidden">
                <div class="error-icon">⚠️</div>
                <div id="errorMessage" class="error-message"></div>
            </div>
            
            <div id="logsContainer" class="logs-container">
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
                console.log('[VisbalLogView:WebView] init -- Initializing webview script');
                
                // Elements
                const refreshButton = document.getElementById('refreshButton');
                const refreshSoqlButton = document.getElementById('refreshSoqlButton');
                const logsTable = document.getElementById('logsTable');
                const logsTableBody = document.getElementById('logsTableBody');
                const noLogsMessage = document.getElementById('noLogsMessage');
                const loadingIndicator = document.getElementById('loadingIndicator');
                const errorContainer = document.getElementById('errorContainer');
                const errorMessage = document.getElementById('errorMessage');
                
                // VSCode API
                const vscode = acquireVsCodeApi();
                console.log('[VisbalLogView:WebView] init -- Acquired VSCode API');
                
                // State
                let logs = [];
                
                // Initialize
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('[VisbalLogView:WebView] DOMContentLoaded -- DOM content loaded, requesting logs');
                    // Request logs on load
                    vscode.postMessage({ command: 'fetchLogs' });
                });
                
                // Event listeners
                refreshButton.addEventListener('click', () => {
                    console.log('[VisbalLogView:WebView] refreshButton.click -- Refresh button clicked, requesting logs');
                    vscode.postMessage({ command: 'fetchLogs' });
                    // Show loading state on the refresh button
                    toggleRefreshButtonLoading(true);
                });
                
                // SOQL Refresh button event listener
                refreshSoqlButton.addEventListener('click', () => {
                    console.log('[VisbalLogView:WebView] refreshSoqlButton.click -- SOQL Refresh button clicked, requesting logs via SOQL');
                    vscode.postMessage({ command: 'fetchLogsSoql' });
                    // Show loading state on the SOQL refresh button
                    toggleSoqlRefreshButtonLoading(true);
                });
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    console.log('[VisbalLogView:WebView] message -- Received message from extension:', message.command, message);
                    
                    switch (message.command) {
                        case 'updateLogs':
                            console.log('[VisbalLogView:WebView] message.updateLogs -- Updating logs, received ' + message.logs.length + ' logs');
                            if (!message.logs || !Array.isArray(message.logs)) {
                                console.error('[VisbalLogView:WebView] message.updateLogs -- Invalid logs data received:', message.logs);
                                showError('Invalid logs data received from extension');
                                return;
                            }
                            logs = message.logs;
                            console.log('[VisbalLogView:WebView] message.updateLogs -- Logs array updated, calling renderLogs()');
                            renderLogs();
                            // Reset refresh button state
                            toggleRefreshButtonLoading(false);
                            toggleSoqlRefreshButtonLoading(false);
                            break;
                        case 'loading':
                            console.log('[VisbalLogView:WebView] message.loading -- Setting loading state: ' + message.loading);
                            toggleLoading(message.loading);
                            // Also update refresh button state
                            toggleRefreshButtonLoading(message.loading);
                            toggleSoqlRefreshButtonLoading(message.loading);
                            break;
                        case 'error':
                            console.error('[VisbalLogView:WebView] message.error -- Received error:', message.error);
                            showError(message.error);
                            // Reset refresh button state on error
                            toggleRefreshButtonLoading(false);
                            toggleSoqlRefreshButtonLoading(false);
                            break;
                        case 'downloadStatus':
                            console.log('[VisbalLogView:WebView] message.downloadStatus -- Download status update for log ' + message.logId + ': ' + message.status);
                            updateDownloadStatus(message.logId, message.status, message.error);
                            break;
                    }
                });
                
                // Render logs
                function renderLogs() {
                    console.log('[VisbalLogView:WebView] renderLogs -- Rendering logs');
                    console.log('[VisbalLogView:WebView] renderLogs -- Logs array length:', logs.length);
                    console.log('[VisbalLogView:WebView] renderLogs -- Logs array sample:', JSON.stringify(logs.slice(0, 2)));
                    
                    // Clear the table
                    logsTableBody.innerHTML = '';
                    
                    // Hide error if shown
                    errorContainer.classList.add('hidden');
                    
                    // Check if we have logs
                    if (logs.length === 0) {
                        console.log('[VisbalLogView:WebView] renderLogs -- No logs to display');
                        logsTable.classList.add('hidden');
                        noLogsMessage.classList.remove('hidden');
                        return;
                    }
                    
                    // Show the table and hide the no logs message
                    console.log('[VisbalLogView:WebView] renderLogs -- Showing table, hiding no logs message');
                    logsTable.classList.remove('hidden');
                    noLogsMessage.classList.add('hidden');
                    
                    // Sort logs by date (newest first)
                    logs.sort((a, b) => {
                        return new Date(b.lastModifiedDate) - new Date(a.lastModifiedDate);
                    });
                    
                    console.log('[VisbalLogView:WebView] renderLogs -- Adding ' + logs.length + ' logs to table');
                    // Add logs to the table
                    logs.forEach((log, index) => {
                        console.log('[VisbalLogView:WebView] renderLogs -- Processing log ' + index + ':', log.id);
                        const row = document.createElement('tr');
                        
                        // Format date
                        const date = new Date(log.lastModifiedDate);
                        const formattedDate = date.toLocaleString();
                        
                        // Format size
                        const formattedSize = formatFileSize(log.logLength);
                        
                        try {
                            // Create row with string concatenation instead of template literals
                            row.innerHTML = 
                                '<td>' + (log.logUser?.name || 'Unknown') + '</td>' +
                                '<td>' + (log.application || 'Unknown') + '</td>' +
                                '<td>' + (log.operation || 'Unknown') + '</td>' +
                                '<td>' + (log.status || 'Unknown') + '</td>' +
                                '<td>' + formattedSize + '</td>' +
                                '<td>' + formattedDate + '</td>' +
                                '<td>' +
                                    '<button class="button download-button" data-log-id="' + log.id + '" data-downloaded="' + log.downloaded + '">' +
                                        '<span class="icon ' + (log.downloaded ? 'check-icon' : 'download-icon') + '"></span>' +
                                        '<span class="button-text">' + (log.downloaded ? 'Downloaded' : 'Download') + '</span>' +
                                    '</button>' +
                                '</td>';
                            
                            logsTableBody.appendChild(row);
                            console.log('[VisbalLogView:WebView] renderLogs -- Added log ' + index + ' to table');
                        } catch (error) {
                            console.error('[VisbalLogView:WebView] renderLogs -- Error rendering log ' + index + ':', error);
                        }
                    });
                    
                    console.log('[VisbalLogView:WebView] renderLogs -- Adding event listeners to download buttons');
                    // Add event listeners to download buttons
                    document.querySelectorAll('.download-button').forEach(button => {
                        button.addEventListener('click', () => {
                            const logId = button.getAttribute('data-log-id');
                            const isDownloaded = button.getAttribute('data-downloaded') === 'true';
                            
                            if (!isDownloaded) {
                                console.log('[VisbalLogView:WebView] downloadButton.click -- Download button clicked for log: ' + logId);
                                vscode.postMessage({ 
                                    command: 'downloadLog', 
                                    logId: logId 
                                });
                                
                                // Update button to show downloading state
                                button.disabled = true;
                                button.querySelector('.icon').className = 'icon loading-icon';
                                button.querySelector('.button-text').textContent = 'Downloading...';
                            }
                        });
                    });
                    
                    console.log('[VisbalLogView:WebView] renderLogs -- Logs rendered successfully');
                }
                
                // Update download status for a log
                function updateDownloadStatus(logId, status, error) {
                    console.log('[VisbalLogView:WebView] updateDownloadStatus -- Updating download status for log ' + logId + ': ' + status);
                    const button = document.querySelector(\`.download-button[data-log-id="\${logId}"]\`);
                    if (!button) {
                        console.warn('[VisbalLogView:WebView] updateDownloadStatus -- Button not found for log ' + logId);
                        return;
                    }
                    
                    const icon = button.querySelector('.icon');
                    const text = button.querySelector('.button-text');
                    
                    switch (status) {
                        case 'downloading':
                            console.log('[VisbalLogView:WebView] updateDownloadStatus -- Setting downloading state for log ' + logId);
                            button.disabled = true;
                            icon.className = 'icon loading-icon';
                            text.textContent = 'Downloading...';
                            break;
                        case 'downloaded':
                            console.log('[VisbalLogView:WebView] updateDownloadStatus -- Setting downloaded state for log ' + logId);
                            button.disabled = false;
                            icon.className = 'icon check-icon';
                            text.textContent = 'Downloaded';
                            button.setAttribute('data-downloaded', 'true');
                            
                            // Update the log in the state
                            const log = logs.find(l => l.id === logId);
                            if (log) {
                                log.downloaded = true;
                                console.log('[VisbalLogView:WebView] updateDownloadStatus -- Updated log ' + logId + ' in state as downloaded');
                            }
                            break;
                        case 'error':
                            console.error('[VisbalLogView:WebView] updateDownloadStatus -- Download error for log ' + logId + ': ' + error);
                            button.disabled = false;
                            icon.className = 'icon error-icon';
                            text.textContent = 'Failed';
                            button.setAttribute('title', error || 'Download failed');
                            break;
                    }
                }
                
                // Toggle loading indicator
                function toggleLoading(isLoading) {
                    console.log('[VisbalLogView:WebView] toggleLoading -- Toggling loading indicator: ' + isLoading);
                    if (isLoading) {
                        loadingIndicator.classList.remove('hidden');
                    } else {
                        loadingIndicator.classList.add('hidden');
                    }
                }
                
                // Toggle refresh button loading state
                function toggleRefreshButtonLoading(isLoading) {
                    console.log('[VisbalLogView:WebView] toggleRefreshButtonLoading -- Toggling refresh button loading state: ' + isLoading);
                    const icon = refreshButton.querySelector('.icon');
                    const buttonText = document.createElement('span');
                    buttonText.textContent = 'Refresh';
                    
                    if (isLoading) {
                        refreshButton.disabled = true;
                        icon.className = 'icon loading-icon';
                        // Replace button text with just the icon when loading
                        refreshButton.innerHTML = '';
                        refreshButton.appendChild(icon);
                        buttonText.className = 'button-text';
                        buttonText.textContent = 'Refreshing...';
                        refreshButton.appendChild(buttonText);
                    } else {
                        refreshButton.disabled = false;
                        icon.className = 'icon refresh-icon';
                        // Restore original button content
                        refreshButton.innerHTML = '';
                        refreshButton.appendChild(icon);
                        buttonText.className = 'button-text';
                        buttonText.textContent = 'Refresh';
                        refreshButton.appendChild(buttonText);
                    }
                }
                
                // Toggle SOQL refresh button loading state
                function toggleSoqlRefreshButtonLoading(isLoading) {
                    console.log('[VisbalLogView:WebView] toggleSoqlRefreshButtonLoading -- Toggling SOQL refresh button loading state: ' + isLoading);
                    const icon = refreshSoqlButton.querySelector('.icon');
                    const buttonText = document.createElement('span');
                    buttonText.textContent = 'Refresh (SOQL)';
                    
                    if (isLoading) {
                        refreshSoqlButton.disabled = true;
                        icon.className = 'icon loading-icon';
                        // Replace button text with just the icon when loading
                        refreshSoqlButton.innerHTML = '';
                        refreshSoqlButton.appendChild(icon);
                        buttonText.className = 'button-text';
                        buttonText.textContent = 'Refreshing (SOQL)...';
                        refreshSoqlButton.appendChild(buttonText);
                    } else {
                        refreshSoqlButton.disabled = false;
                        icon.className = 'icon refresh-icon';
                        // Restore original button content
                        refreshSoqlButton.innerHTML = '';
                        refreshSoqlButton.appendChild(icon);
                        buttonText.className = 'button-text';
                        buttonText.textContent = 'Refresh (SOQL)';
                        refreshSoqlButton.appendChild(buttonText);
                    }
                }
                
                // Show error message
                function showError(message) {
                    console.error('[VisbalLogView:WebView] showError -- Showing error: ' + message);
                    errorMessage.innerHTML = message.replace(/\n/g, '<br>');
                    errorContainer.classList.remove('hidden');
                }
                
                // Format file size
                function formatFileSize(bytes) {
                    if (bytes === 0) return '0 Bytes';
                    
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                }
                
                console.log('[VisbalLogView:WebView] init -- Webview script initialization complete');
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