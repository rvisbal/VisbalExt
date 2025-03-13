import { styles } from './styles';
import * as vscode from 'vscode';
import { formatLogContentForHtml } from '../utils/logParsingUtils';

/**
 * Returns the HTML template for the log list view
 */
export function getLogListTemplate(): string {
    // Generate a nonce for script security
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Salesforce Debug Logs - debug</title>
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
            .status-message {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                padding: 8px 16px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                text-align: center;
            }

            .status-error {
                background-color: #e51400; /* Red for errors */
            }

            .status-success {
                background-color: #107c10; /* Green for success */
            }

            .status-info {
                background-color: #cccccc; /* Light grey for info */
                color: #333333; /* Darker text for better contrast on light background */
            }

            .status-warning {
                background-color: #f9ce1d; /* Yellow for warnings */
                color: #333333; /* Darker text for better contrast on light background */
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Salesforce Debug Logs  - debug</h1>
                <div class="actions">
                    <button id="refreshButton" class="button">Refresh</button>
                    <button id="refreshSoqlButton" class="button">Refresh (SOQL)</button>
                    <button id="refreshToolingButton" class="button">Refresh (Fast)</button>
                    <button id="deleteServerButton" class="button">Delete All Logs</button>
                    <button id="deleteServerFastButton" class="button">Delete All (Fast)</button>
                </div>
            </div>
            
            <div id="loadingIndicator" class="loading-container hidden">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading logs...</div>
            </div>
            
            <div id="errorContainer" class="error-container hidden">
                <div id="errorMessage" class="error-message status-message status-error" style="display: none;"></div>
            </div>
            
            <div id="logsContainer">
                <div id="noLogsMessage" class="no-logs-message">
                    No logs found. Click Refresh to fetch logs.
                </div>
                <table id="logsTable" class="logs-table hidden">
                    <thead>
                        <tr>
                            <th>ID</th>
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
        
        <script nonce="${nonce}">
            (function() {
                // Debug flag - set to true to show debug messages in the UI
                const DEBUG = true;
                
                // Elements
                const refreshButton = document.getElementById('refreshButton');
                const refreshSoqlButton = document.getElementById('refreshSoqlButton');
                const refreshToolingButton = document.getElementById('refreshToolingButton');
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
                function formatBytes(bytes) {
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
                function showLoading(message = 'Loading logs...') {
                    loadingIndicator.classList.remove('hidden');
                    // Update the loading text
                    document.querySelector('.loading-text').textContent = message;
                    refreshButton.disabled = true;
                    refreshSoqlButton.disabled = true;
                    refreshToolingButton.disabled = true;
                }
                
                // Hide loading state
                function hideLoading() {
                    loadingIndicator.classList.add('hidden');
                    refreshButton.disabled = false;
                    refreshSoqlButton.disabled = false;
                    refreshToolingButton.disabled = false;
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
                        
                        // Format date if available
                        let formattedDate = 'Unknown';
                        if (log.lastModifiedDate) {
                            const date = new Date(log.lastModifiedDate);
                            // Format as YYYY/MM/DD, HH:MM:SS
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            const seconds = String(date.getSeconds()).padStart(2, '0');
                            formattedDate = year + '/' + month + '/' + day + ', ' + hours + ':' + minutes + ':' + seconds;
                        } else if (log.startTime) {
                            // Try to parse and format startTime if it's a valid date
                            try {
                                const date = new Date(log.startTime);
                                if (!isNaN(date.getTime())) {
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    const hours = String(date.getHours()).padStart(2, '0');
                                    const minutes = String(date.getMinutes()).padStart(2, '0');
                                    const seconds = String(date.getSeconds()).padStart(2, '0');
                                    formattedDate = year + '/' + month + '/' + day + ', ' + hours + ':' + minutes + ':' + seconds;
                                } else {
                                    formattedDate = log.startTime;
                                }
                            } catch (e) {
                                formattedDate = log.startTime;
                            }
                        }
                        
                        // Format size
                        const formattedSize = formatBytes(log.logLength || 0);
                        
                        // Create row
                        row.innerHTML = 
                            '<td><span title="' + log.id + '">' + log.id.substring(0, 15) + '...</span></td>' +
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
                                (log.localFilePath ? '<button class="button open-button" data-log-id="' + log.id + '" style="margin-left: 5px;">Open</button>' : '') +
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

                    // Add event listeners to open buttons
                    document.querySelectorAll('.open-button').forEach(button => {
                        button.addEventListener('click', () => {
                            const logId = button.getAttribute('data-log-id');
                            debug('Open button clicked for log: ' + logId);
                            
                            vscode.postMessage({ 
                                command: 'openLog', 
                                logId: logId 
                            });
                            
                            // Update button to show loading state
                            button.disabled = true;
                            button.textContent = 'Opening...';
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
                
                refreshToolingButton.addEventListener('click', () => {
                    debug('Fast Refresh button clicked');
                    vscode.postMessage({ command: 'fetchLogsToolingApi' });
                    showLoading();
                });
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    console.log('[VisbalLogView:WebView] Received message:', message.command, message);
                    
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
                        case 'setLoading': // Add support for the 'setLoading' command
                            if (message.loading) {
                                showLoading(message.message || 'Loading logs...');
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
                                        
                                        // If we have a file path, add it to the log and show the Open button
                                        if (message.filePath) {
                                            log.localFilePath = message.filePath;
                                            
                                            // Check if we already have an Open button
                                            const openButton = document.querySelector('.open-icon[data-id="' + message.logId + '"]');
                                            
                                            // If not, create one
                                            if (!openButton) {
                                                const newButton = document.createElement('button');
                                                newButton.className = 'button open-button';
                                                newButton.setAttribute('data-log-id', message.logId);
                                                newButton.style.marginLeft = '5px';
                                                newButton.textContent = 'Open';
                                                
                                                // Add event listener to the new button
                                                newButton.addEventListener('click', () => {
                                                    const logId = newButton.getAttribute('data-log-id');
                                                    debug('Open button clicked for log: ' + logId);
                                                    
                                                    vscode.postMessage({ 
                                                        command: 'openLog', 
                                                        logId: logId 
                                                    });
                                                    
                                                    // Update button to show loading state
                                                    newButton.disabled = true;
                                                    newButton.textContent = 'Opening...';
                                                });
                                                
                                                // Add the button after the download button
                                                button.parentNode.appendChild(newButton);
                                            } else {
                                                // Reset the button if it exists
                                                openButton.disabled = false;
                                                openButton.textContent = 'Open';
                                            }
                                        }
                                    }
                                    break;
                                case 'error':
                                    button.disabled = false;
                                    button.textContent = 'Failed';
                                    button.title = message.error || 'Download failed';
                                    break;
                            }
                            
                            // Reset any open button that might be in "Opening..." state
                            const resetButton = document.querySelector('.open-icon[data-id="' + message.logId + '"]');
                            if (resetButton && resetButton.textContent === 'Opening...') {
                                resetButton.disabled = false;
                                resetButton.textContent = 'Open';
                            }
                            
                            break;
                            
                        case 'getLogDetails':
                            console.log('[VisbalLogView:WebView] Getting log details for:', message.logId);
                            const logId = message.logId;
                            const logDetails = logs.find(log => log.id === logId);
                            console.log('[VisbalLogView:WebView] Found log details:', logDetails);
                            
                            // Send the details back to the extension
                            vscode.postMessage({
                                command: 'logDetails',
                                logId: logId,
                                details: logDetails || {}
                            });
                            break;
                        case 'warning':
                            showError('Warning: ' + message.message);
                            setTimeout(() => hideError(), 5000);
                            break;
                        case 'info':
                            showError('Info: ' + message.message);
                            setTimeout(() => hideError(), 4000);
                            break;
                    }
                });
                
                // Initial debug message
                debug('Webview script loaded and ready');

                // Add event listener for the fast delete button
                document.getElementById('deleteServerFastButton').addEventListener('click', () => {
                    if (confirm('Are you sure you want to delete all logs from the server? This action cannot be undone.')) {
                        vscode.postMessage({
                            command: 'deleteServerLogsFast'
                        });
                    }
                });
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
    currentTab: string = 'overview',
    tabs: any[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'execution', label: 'Execution' },
        { id: 'database', label: 'Database' },
        { id: 'limits', label: 'Limits' },
        { id: 'user_debug', label: 'Debug' },
        { id: 'raw', label: 'Raw Log' }
    ],
    executionTabHtml: string = '',
    customJavaScript: string = '',
    rawLogTabHtml: string = '',
    categories: any[] = []
): string {
    console.log('[VisbalLogView:WebView] Generating HTML template for log detail view');
    console.log('[VisbalLogView:WebView] Log filename:', logFileName);
    console.log('[VisbalLogView:WebView] Current tab:', currentTab);
    
    // Generate a nonce for script security
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Log Detail: ${logFileName}</title>
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
            .log-info {
                margin-bottom: 20px;
                padding: 10px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 4px;
            }
            .log-info p {
                margin: 5px 0;
            }
            .tabs {
                display: flex;
                border-bottom: 1px solid var(--vscode-panel-border);
                margin-bottom: 20px;
            }
            .tab {
                padding: 8px 16px;
                cursor: pointer;
                border: none;
                background: none;
                color: var(--vscode-foreground);
                font-size: 14px;
                position: relative;
            }
            .tab.active {
                color: var(--vscode-button-foreground);
                background-color: var(--vscode-button-background);
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
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
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            th, td {
                text-align: left;
                padding: 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            th {
                background-color: var(--vscode-editor-background);
                position: sticky;
                top: 0;
            }
            .timeline-item {
                display: flex;
                margin-bottom: 10px;
                padding: 8px;
                border-left: 3px solid var(--vscode-button-background);
                background-color: var(--vscode-editor-inactiveSelectionBackground);
            }
            .timeline-time {
                min-width: 100px;
                font-weight: bold;
            }
            .timeline-content {
                flex-grow: 1;
            }
            .raw-log {
                white-space: pre-wrap;
                font-family: monospace;
                padding: 10px;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                overflow: auto;
                max-height: 500px;
            }
            .limit-bar {
                height: 20px;
                background-color: var(--vscode-progressBar-background);
                margin-bottom: 5px;
                position: relative;
            }
            .limit-label {
                position: absolute;
                right: 5px;
                color: var(--vscode-editor-foreground);
                font-size: 12px;
            }
            .search-container {
                margin-bottom: 15px;
            }
            .search-input {
                padding: 6px;
                width: 300px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
            }
            .filter-container {
                margin-bottom: 15px;
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }
            .filter-tag {
                padding: 4px 8px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }
            .filter-tag.active {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            .filter-section {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .filter-input {
                width: 200px;
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
            }
            .icon-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--vscode-button-foreground);
                background-color: #4d4d4d; /* Grey background for all icon buttons */
                border-radius: 4px;
                width: 28px;
                height: 28px;
                margin: 0 2px;
                transition: background-color 0.2s;
            }
            .icon-button:hover {
                background-color: #666666; /* Slightly lighter on hover */
            }
            .icon-button:active {
                background-color: #333333; /* Darker when clicked */
            }
            .icon-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background-color: #4d4d4d;
            }
            .download-icon {
                color: white;
            }
            .open-icon {
                color: white;
            }
            .view-icon {
                color: white;
            }
            .action-cell {
                display: flex;
                gap: 4px;
                justify-content: center;
            }
            .clear-filter-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--vscode-descriptionForeground);
                opacity: 0.7;
                border-radius: 4px;
                width: 28px;
                height: 28px;
            }
            .clear-filter-button:hover {
                opacity: 1;
                background-color: var(--vscode-list-hoverBackground);
            }
            .clear-filter-button:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }
            .actions-section {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            /* Debug tab specific styles */
            .user-debug-info {
                margin-bottom: 15px;
                padding: 10px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 4px;
            }
            
            .user-debug-info p {
                margin: 5px 0;
                font-size: 13px;
            }
            
            .user-debug-content {
                border-left: 3px solid #4a9cd6;
            }
            
            /* Raw log styles */
            .raw-log {
                white-space: pre-wrap;
                font-family: monospace;
                padding: 10px;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                overflow: auto;
                max-height: 500px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Log Detail View</h1>
                <div>
                    <button id="backButton" class="button">Back to List</button>
                    <button id="downloadButton" class="button">Download</button>
                </div>
            </div>
            
            <div class="log-info">
                <p><strong>File:</strong> ${logFileName}</p>
                <p><strong>Size:</strong> ${fileSize}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <div class="tabs">
                ${tabs.map(tab => `<button class="tab ${tab.id === currentTab ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            
            <div id="overview" class="tab-content ${currentTab === 'overview' ? 'active' : ''}">
                <h2>Log Overview</h2>
                <div class="search-container">
                    <input type="text" class="search-input" placeholder="Search log content...">
                    <button class="button">Search</button>
                </div>
                
                <div class="filter-container">
                    <span class="filter-tag active">All</span>
                    <span class="filter-tag">Errors</span>
                    <span class="filter-tag">Warnings</span>
                    <span class="filter-tag">Debug</span>
                    <span class="filter-tag">Info</span>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Count</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedData.categories ? parsedData.categories.map((cat: any) => `
                        <tr>
                            <td>${cat.name}</td>
                            <td>${cat.count}</td>
                            <td>${cat.description || ''}</td>
                        </tr>
                        `).join('') : `
                        <tr>
                            <td colspan="3">No categories found</td>
                        </tr>
                        `}
                    </tbody>
                </table>
            </div>
            
            <div id="timeline" class="tab-content ${currentTab === 'timeline' ? 'active' : ''}">
                <h2>Timeline</h2>
                <div class="timeline-container">
                    ${parsedData.timeline ? parsedData.timeline.slice(0, 100).map((event: any) => `
                    <div class="timeline-item">
                        <div class="timeline-time">${event.formattedTime}</div>
                        <div class="timeline-content">${event.content}</div>
                    </div>
                    `).join('') : `
                    <div class="timeline-item">
                        <div class="timeline-content">No timeline events found</div>
                    </div>
                    `}
                </div>
            </div>
            
            <div id="execution" class="tab-content ${currentTab === 'execution' ? 'active' : ''}">
                <h2>Execution Path</h2>
                ${executionTabHtml}
            </div>
            
            <div id="database" class="tab-content ${currentTab === 'database' ? 'active' : ''}">
                <h2>Database Operations</h2>
                <h3>SOQL Queries</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Query</th>
                            <th>Rows</th>
                            <th>Time (ms)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedData.soqlQueries ? parsedData.soqlQueries.map((query: any) => `
                        <tr>
                            <td>${query.query}</td>
                            <td>${query.rows}</td>
                            <td>${query.time}</td>
                        </tr>
                        `).join('') : `
                        <tr>
                            <td colspan="3">No SOQL queries found</td>
                        </tr>
                        `}
                    </tbody>
                </table>
                
                <h3>DML Operations</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Operation</th>
                            <th>Object</th>
                            <th>Rows</th>
                            <th>Time (ms)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedData.dmlOperations ? parsedData.dmlOperations.map((op: any) => `
                        <tr>
                            <td>${op.operation}</td>
                            <td>${op.object}</td>
                            <td>${op.rows}</td>
                            <td>${op.time}</td>
                        </tr>
                        `).join('') : `
                        <tr>
                            <td colspan="4">No DML operations found</td>
                        </tr>
                        `}
                    </tbody>
                </table>
            </div>
            
            <div id="limits" class="tab-content ${currentTab === 'limits' ? 'active' : ''}">
                <h2>Governor Limits</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Limit</th>
                            <th>Used</th>
                            <th>Available</th>
                            <th>Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedData.limits ? parsedData.limits.map((limit: any) => {
                            const percentage = Math.round((limit.used / limit.available) * 100);
                            return `
                            <tr>
                                <td>${limit.name}</td>
                                <td>${limit.used}</td>
                                <td>${limit.available}</td>
                                <td>
                                    <div class="limit-bar" style="width: ${percentage}%;">
                                        <span class="limit-label">${percentage}%</span>
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('') : `
                        <tr>
                            <td colspan="4">No limit information available</td>
                        </tr>
                        `}
                    </tbody>
                </table>
            </div>
            
            <div id="user_debug" class="tab-content ${currentTab === 'user_debug' ? 'active' : ''}">
                <h2>Debug Lines</h2>
                <div class="user-debug-info">
                    <p>Showing debug-related lines from the log file, including USER_DEBUG, FATAL_ERROR, DML_BEGIN, and SOQL_EXECUTE_BEGIN.</p>
                    <p>Total debug lines: ${parsedData.summary ? parsedData.summary.userDebugCount : 0}</p>
                </div>
                <pre class="user-debug-content raw-log">${formatLogContentForHtml(parsedData.userDebugLog) || 'No debug lines found in the log.'}</pre>
            </div>
            
            <div id="raw" class="tab-content ${currentTab === 'raw' ? 'active' : ''}">
                <h2>Raw Log</h2>
                ${rawLogTabHtml}
            </div>
        </div>
        
        <script nonce="${nonce}">
            (function() {
                console.log('[VisbalLogView:WebView] Log detail view initialized');
                
                // VSCode API
                const vscode = acquireVsCodeApi();
                
                ${customJavaScript}
                
                // Tab switching
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        console.log('[VisbalLogView:WebView] Tab clicked:', tab.dataset.tab);
                        
                        // Hide all tab contents
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        
                        // Remove active class from all tabs
                        document.querySelectorAll('.tab').forEach(t => {
                            t.classList.remove('active');
                        });
                        
                        // Show the selected tab content
                        const tabId = tab.dataset.tab;
                        document.getElementById(tabId).classList.add('active');
                        
                        // Add active class to the clicked tab
                        tab.classList.add('active');
                        
                        // Save the current tab in state
                        vscode.postMessage({
                            command: 'changeTab',
                            tab: tabId
                        });
                    });
                });
                
                // Back button
                document.getElementById('backButton').addEventListener('click', () => {
                    console.log('[VisbalLogView:WebView] Back button clicked');
                    vscode.postMessage({
                        command: 'backToList'
                    });
                });
                
                // Download button
                document.getElementById('downloadButton').addEventListener('click', () => {
                    console.log('[VisbalLogView:WebView] Download button clicked');
                    vscode.postMessage({
                        command: 'downloadCurrentLog'
                    });
                });
                
                // Filter tags
                document.querySelectorAll('.filter-tag').forEach(tag => {
                    tag.addEventListener('click', () => {
                        console.log('[VisbalLogView:WebView] Filter tag clicked:', tag.textContent);
                        
                        // Toggle active class
                        document.querySelectorAll('.filter-tag').forEach(t => {
                            t.classList.remove('active');
                        });
                        tag.classList.add('active');
                        
                        // Apply filter
                        vscode.postMessage({
                            command: 'applyFilter',
                            filter: tag.textContent
                        });
                    });
                });
                
                // Search functionality
                const searchInput = document.querySelector('.search-input');
                const searchButton = searchInput.nextElementSibling;
                
                searchButton.addEventListener('click', () => {
                    const searchTerm = searchInput.value.trim();
                    console.log('[VisbalLogView:WebView] Search button clicked, term:', searchTerm);
                    
                    if (searchTerm) {
                        vscode.postMessage({
                            command: 'search',
                            term: searchTerm
                        });
                    }
                });
                
                // Handle Enter key in search input
                searchInput.addEventListener('keyup', (event) => {
                    if (event.key === 'Enter') {
                        searchButton.click();
                    }
                });
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    console.log('[VisbalLogView:WebView] Received message:', message.command);
                    
                    switch (message.command) {
                        case 'updateLogData':
                            console.log('[VisbalLogView:WebView] Updating log data');
                            // Handle log data update
                            break;
                            
                        case 'searchResults':
                            console.log('[VisbalLogView:WebView] Received search results');
                            // Handle search results
                            break;
                            
                        case 'updateExecutionTab':
                            console.log('[VisbalLogView:WebView] Updating execution tab');
                            updateExecutionTab(message.executionData);
                            break;
                    }
                });
                
                console.log('[VisbalLogView:WebView] Log detail view script loaded');
            })();
        </script>
    </body>
    </html>`;
}

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getHtmlForWebview(extensionUri: vscode.Uri, webview: vscode.Webview): string {
  // Use a nonce to only allow a specific script to be run.
  const nonce = getNonce();

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
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 16px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .button-group {
        display: flex;
        gap: 8px;
      }
      button {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 6px 12px;
        cursor: pointer;
        border-radius: 4px;
      }
      button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      .logs-container {
        flex: 1;
        overflow: auto;
      }
      .logs-table {
        width: 100%;
        border-collapse: collapse;
      }
      .logs-table th {
        position: sticky;
        top: 0;
        background-color: var(--vscode-editor-background);
        z-index: 1;
        text-align: left;
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .logs-table td {
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
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
      .hidden {
        display: none !important;
      }
      .error-container {
        background-color: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        color: var(--vscode-inputValidation-errorForeground);
        padding: 10px;
        margin-bottom: 16px;
        border-radius: 3px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Salesforce Debug Logs</h1>
        <div class="button-group">
          <button id="refresh-button">Refresh</button>
          <button id="refreshSoqlButton">Refresh (SOQL)</button>
          <button id="refreshToolingButton">Refresh (Fast)</button>
          <button id="delete-server-button">Delete All Logs</button>
        </div>
      </div>
      
      <div id="error-container" class="error-container hidden">
        <div id="error-message"></div>
      </div>
      
      <div id="loading-indicator" class="loading-container hidden">
        <div class="loading-spinner"></div>
        <div id="loading-text">Loading logs...</div>
      </div>
      
      <div class="logs-container">
        <table class="logs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Application</th>
              <th>Operation</th>
              <th>Time</th>
              <th>Status</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="logs-table-body">
            <tr>
              <td colspan="8">No logs found. Click Refresh to fetch logs.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      
      // Elements
      const refreshButton = document.getElementById('refresh-button');
      const refreshSoqlButton = document.getElementById('refreshSoqlButton');
      const refreshToolingButton = document.getElementById('refreshToolingButton');
      const deleteServerButton = document.getElementById('delete-server-button');
      const logsTableBody = document.getElementById('logs-table-body');
      const loadingIndicator = document.getElementById('loading-indicator');
      const loadingText = document.getElementById('loading-text');
      const errorContainer = document.getElementById('error-container');
      const errorMessage = document.getElementById('error-message');
      
      // State
      let logs = [];
      
      // Show loading state
      function showLoading(message = 'Loading logs...') {
        loadingIndicator.classList.remove('hidden');
        loadingText.textContent = message;
        refreshButton.disabled = true;
        refreshSoqlButton.disabled = true;
        refreshToolingButton.disabled = true;
        deleteServerButton.disabled = true;
      }
      
      // Hide loading state
      function hideLoading() {
        loadingIndicator.classList.add('hidden');
        refreshButton.disabled = false;
        refreshSoqlButton.disabled = false;
        refreshToolingButton.disabled = false;
        deleteServerButton.disabled = false;
      }
      
      // Show error message
      function showError(message) {
        errorContainer.classList.remove('hidden');
        errorMessage.textContent = message;
      }
      
      // Hide error message
      function hideError() {
        errorContainer.classList.add('hidden');
      }
      
      // Format file size
      function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      // Render logs
      function renderLogs() {
        if (!logs || logs.length === 0) {
          logsTableBody.innerHTML = '<tr><td colspan="8">No logs found. Click Refresh to fetch logs.</td></tr>';
          return;
        }
        
        logsTableBody.innerHTML = '';
        
        logs.forEach(log => {
          const row = document.createElement('tr');
          
          // Format date
          let formattedDate = 'Unknown';
          if (log.lastModifiedDate) {
            try {
              const date = new Date(log.lastModifiedDate);
              formattedDate = date.toLocaleString();
            } catch (e) {
              formattedDate = log.lastModifiedDate;
            }
          }
          
          row.innerHTML = '<td title="' + log.id + '">' + log.id.substring(0, 10) + '...</td>' +
            '<td>' + (log.logUser?.name || 'Unknown') + '</td>' +
            '<td>' + (log.application || 'Unknown') + '</td>' +
            '<td>' + (log.operation || 'Unknown') + '</td>' +
            '<td>' + formattedDate + '</td>' +
            '<td>' + (log.status || 'Unknown') + '</td>' +
            '<td>' + formatBytes(log.logLength || 0) + '</td>' +
            '<td>' +
              '<button class="download-button" data-log-id="' + log.id + '">' +
                (log.downloaded ? 'Downloaded' : 'Download') +
              '</button>' +
            '</td>';
          
          logsTableBody.appendChild(row);
        });
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-button').forEach(button => {
          button.addEventListener('click', () => {
            const logId = button.getAttribute('data-log-id');
            vscode.postMessage({ 
              command: 'downloadLog', 
              logId: logId 
            });
            button.disabled = true;
            button.textContent = 'Downloading...';
          });
        });
      }
      
      // Initialize
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM content loaded, requesting logs');
        vscode.postMessage({ command: 'fetchLogs' });
        showLoading();
      });
      
      // Event listeners
      refreshButton.addEventListener('click', () => {
        hideError();
        vscode.postMessage({ command: 'fetchLogs' });
        showLoading('Refreshing logs...');
      });
      
      refreshSoqlButton.addEventListener('click', () => {
        hideError();
        vscode.postMessage({ command: 'fetchLogsSoql' });
        showLoading('Refreshing logs via SOQL...');
      });
      
      refreshToolingButton.addEventListener('click', () => {
        hideError();
        vscode.postMessage({ command: 'fetchLogsToolingApi' });
        showLoading('Refreshing logs via Tooling API...');
      });
      
      deleteServerButton.addEventListener('click', () => {
        hideError();
        if (confirm('Are you sure you want to delete all logs from the server?')) {
          vscode.postMessage({ command: 'deleteServerLogs' });
          showLoading('Deleting logs...');
        }
      });
      
      // Handle messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message:', message.command);
        
        switch (message.command) {
          case 'updateLogs':
            logs = message.logs || [];
            renderLogs();
            hideLoading();
            break;
          case 'loading':
          case 'setLoading':
            if (message.loading) {
              showLoading(message.message || 'Loading logs...');
            } else {
              hideLoading();
            }
            break;
          case 'error':
            showError(message.error);
            hideLoading();
            break;
          case 'downloadStatus':
            const button = document.querySelector('.download-button[data-log-id="' + message.logId + '"]');
            if (button) {
              if (message.status === 'downloading') {
                button.disabled = true;
                button.textContent = 'Downloading...';
              } else if (message.status === 'downloaded') {
                button.disabled = false;
                button.textContent = 'Downloaded';
              } else if (message.status === 'error') {
                button.disabled = false;
                button.textContent = 'Failed';
                button.title = message.error || 'Download failed';
              }
            }
            break;
        }
      });
    </script>
  </body>
  </html>`;
}

// Function to render logs in the tabbed detail view
export function renderLogs(logs: any[]): string {
  // Implementation for the detailed log view tabs
  return '';
}

// Functions for rendering different tabs in the log detail view
export function renderCategories(categories: any[]): string {
  return '';
}

export function renderTimeline(timeline: any[]): string {
  return '';
}

export function renderExecutionPath(executionPath: any[]): string {
  return '';
}

export function renderSoqlQueries(soqlQueries: any[]): string {
  return '';
}

export function renderDmlOperations(dmlOperations: any[]): string {
  return '';
}

export function renderLimits(limits: any[]): string {
  return '';
} 
