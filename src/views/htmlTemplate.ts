import { styles } from './styles';
import * as vscode from 'vscode';
import { formatLogContentForHtml } from '../utils/logParsingUtils';

/**
 * Returns the HTML template for the log list view
 */
export function getLogListTemplate(): string {
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
        
        <script>
            (function() {
                // Debug flag - set to true to show debug messages in the UI
                const DEBUG = true;
                
                // Elements
				        const openOrgButton = document.getElementById('openOrgButton');
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
                    debug('DOM content loaded - manual refresh required');
                    // Removed automatic log fetching to prevent unnecessary API calls
                    // vscode.postMessage({ command: 'fetchLogs' });
                    // showLoading();
                    
                    // Show message to user that they need to click refresh
                    noLogsMessage.textContent = 'Click Refresh to fetch logs. No automatic fetching to prevent API errors.';
                });
				
				// Event listeners
                openOrgButton.addEventListener('click', () => {
                    debug('Refresh button clicked');
                    vscode.postMessage({ command: 'openDefaultOrg' });
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
                
                // Add event listener for Delete via REST API button
                deleteViaSoqlButton.addEventListener('click', () => {
                    debug('Delete via REST API button clicked');
                    if (confirm('Are you sure you want to delete all logs using the Salesforce REST API? This action cannot be undone.')) {
                        vscode.postMessage({ command: 'deleteViaSoql' });
                        showLoading();
                    }
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
                            if (message.isLoading) {
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
        
        <script>
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
  const styleResetUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'reset.css')
  );
  const styleVSCodeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'vscode.css')
  );
  const styleMainUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'main.css')
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'main.js')
  );

  // Use a nonce to only allow a specific script to be run.
  const nonce = getNonce();

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleResetUri}" rel="stylesheet">
    <link href="${styleVSCodeUri}" rel="stylesheet">
    <link href="${styleMainUri}" rel="stylesheet">
    <title>Salesforce Debug Logs</title>
    <style>
      .container {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        background-color: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
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
      .button-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .text-button {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .text-button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      .text-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .danger-button {
        background-color: var(--vscode-errorForeground, #f48771);
      }
      .danger-button:hover {
        background-color: var(--vscode-errorForeground, #f48771);
        opacity: 0.8;
      }
      .warning-button {
        background-color: var(--vscode-editorWarning-foreground, #cca700);
      }
      .warning-button:hover {
        background-color: var(--vscode-editorWarning-foreground, #cca700);
        opacity: 0.8;
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
        cursor: pointer;
      }
      .logs-table th:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .logs-table td {
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .logs-table tbody tr {
        background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
      }
      .logs-table tbody tr:nth-child(even) {
        background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.2));
      }
      .logs-table tr:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .checkbox-cell {
        text-align: center;
      }
      .sort-icon::after {
        content: "↓";
        margin-left: 4px;
      }
      .sort-icon.asc::after {
        content: "↑";
      }
      .sorted-asc::after {
        content: " ▲";
        font-size: 0.8em;
      }
      .sorted-desc::after {
        content: " ▼";
        font-size: 0.8em;
      }
      .download-icon::before {
        content: "⬇️";
      }
      .open-icon::before {
        content: "📄";
      }
      .loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: var(--vscode-editor-background);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 10;
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
        margin: 10px;
        border-radius: 3px;
      }
      .success-container {
        background-color: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.1));
        border: 1px solid var(--vscode-editorInfo-border, #007acc);
        color: var(--vscode-editorInfo-foreground, #007acc);
        padding: 10px;
        margin: 10px;
        border-radius: 3px;
      }
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 100;
      }
      
      /* Debug Configuration Bar Styles */
      .debug-config-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        padding: 6px 10px;
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        border-bottom: 1px solid var(--vscode-panel-border);
        gap: 8px;
      }
      
      .debug-config-options {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex: 1;
      }
      
      .debug-option {
        display: flex;
        align-items: center;
        gap: 3px;
      }
      
      .debug-option label {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
      }
      
      .debug-select {
        font-size: 10px;
        padding: 1px 3px;
        background-color: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 2px;
        max-width: 70px;
      }
      
      .debug-actions {
        display: flex;
        align-items: center;
      }
      
      #apply-debug-config-button {
        white-space: nowrap;
        font-size: 14px;
        padding: 6px 10px;
        background-color: #4d4d4d; /* Nice contrast grey */
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
      }
      
      #apply-debug-config-button:hover {
        background-color: #666666; /* Slightly lighter on hover */
      }
      
      #apply-debug-config-button:active {
        background-color: #333333; /* Darker when clicked */
      }
      
      /* Responsive adjustments */
      @media (max-width: 1200px) {
        .debug-config-options {
          flex-wrap: wrap;
        }
      }
      
      .modal-content {
        background-color: var(--vscode-editor-background);
        padding: 20px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        width: 100%;
      }
      .modal-title {
        font-size: 18px;
        margin-bottom: 10px;
        color: var(--vscode-errorForeground, #f48771);
      }
      .modal-message {
        margin-bottom: 20px;
      }
      .modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      // Add a new CSS rule for the refresh button
      #refresh-button {
        white-space: nowrap;
        font-size: 14px;
        padding: 6px 10px;
        background-color: #4d4d4d; /* Nice contrast grey */
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
      }

      #refresh-button:hover {
        background-color: #666666; /* Slightly lighter on hover */
      }

      #refresh-button:active {
        background-color: #333333; /* Darker when clicked */
      }
      // Add a new CSS rule for the SOQL button
      #soql-button {
        white-space: nowrap;
        font-size: 14px;
        padding: 6px 10px;
        background-color: #4d4d4d; /* Nice contrast grey */
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
      }

      #soql-button:hover {
        background-color: #666666; /* Slightly lighter on hover */
      }

      #soql-button:active {
        background-color: #333333; /* Darker when clicked */
      }
    </style>
  </head>
  <body>
    <div class="container">
      <!-- Debug Log Configuration Bar - Moved above the filter section -->
      <div class="debug-config-bar">
        <div class="debug-config-options">
          <div class="debug-option">
            <label>Preset</label>
            <select id="debug-preset" class="debug-select">
              <option value="default">Default (Standard)</option>
              <option value="detailed">Detailed</option>
              <option value="developer">Developer</option>
              <option value="custom">Custom</option>
              <option value="debugonly">DebugOnly</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Apex Code</label>
            <select id="debug-apex-code" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG" selected>DEBUG</option>
              <option value="FINE">FINE</option>
              <option value="FINER">FINER</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Apex Profiling</label>
            <select id="debug-apex-profiling" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Callout</label>
            <select id="debug-callout" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="ERROR">ERROR</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINER">FINER</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Data Access</label>
            <select id="debug-data-access" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="WARN">WARN</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Database</label>
            <select id="debug-database" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="WARN">WARN</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>NBA</label>
            <select id="debug-nba" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="ERROR">ERROR</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
            </select>
          </div>
          <div class="debug-option">
            <label>System</label>
            <select id="debug-system" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG" selected>DEBUG</option>
              <option value="FINE">FINE</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Validation</label>
            <select id="debug-validation" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Visualforce</label>
            <select id="debug-visualforce" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINER">FINER</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Wave</label>
            <select id="debug-wave" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="ERROR">ERROR</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINER">FINER</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
          <div class="debug-option">
            <label>Workflow</label>
            <select id="debug-workflow" class="debug-select">
              <option value="NONE">NONE</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO" selected>INFO</option>
              <option value="FINE">FINE</option>
              <option value="FINER">FINER</option>
              <option value="FINEST">FINEST</option>
            </select>
          </div>
        </div>
        <div class="debug-actions">
          <button id="apply-debug-config-button" title="Apply Debug Configuration and Turn On Debug">
            <span>💾</span>
          </button>
        </div>
      </div>
      
      <div class="top-bar">
        <div class="filter-section">
          <button class="icon-button">🔍</button>
          <input type="text" class="filter-input" placeholder="Filter logs..." id="filter-input">
          <button class="clear-filter-button" id="clear-filter-button">✕</button>
        </div>
        <div class="actions-section">
          <div class="button-group">
            <button id="open-org-button" title="Open Org">
              <span>🌐</span> Open
            </button>
            <button id="refresh-button" title="Refresh Logs">
              <span>🔄</span> Refresh
            </button>
            <button id="soql-button" title="Refresh with SOQL">
              <span>🔄</span> SOQL
            </button>
          </div>
          <button class="text-button warning-button" id="clear-local-button" title="Clear Downloaded Log Files">
            <span>🗑️</span> Local
          </button>
          <button class="text-button danger-button" id="delete-selected-button" title="Delete Selected Logs" disabled>
            <span>🗑️</span> Selected
          </button>
          <button class="text-button danger-button" id="delete-server-button" title="Delete Logs from Server">
            <span>🗑️</span> Server Logs
          </button>
          <button class="text-button danger-button" id="delete-rest-api-button" title="Delete Logs using REST API">
            <span>🗑️</span> via REST API
          </button>
        </div>
      </div>
      
      <div id="error-container" class="error-container hidden">
        <div id="error-message" class="status-message status-error" style="display: none;"></div>
      </div>
      
      <div id="success-container" class="success-container hidden">
        <div id="success-message" class="status-message status-success" style="display: none;"></div>
      </div>
      
      <div id="loading-indicator" class="loading-container hidden">
        <div class="loading-spinner"></div>
        <div id="loading-text">Loading logs...</div>
      </div>
      
      <div id="confirm-modal" class="modal hidden">
        <div class="modal-content">
          <div class="modal-title" id="modal-title">Confirmation</div>
          <div class="modal-message" id="modal-message">Are you sure you want to proceed?</div>
          <div class="modal-buttons">
            <button class="text-button" id="modal-cancel">Cancel</button>
            <button class="text-button danger-button" id="modal-confirm">Confirm</button>
          </div>
        </div>
      </div>
      
      <div class="logs-container">
        <table class="logs-table">
          <thead>
            <tr>
              <th class="checkbox-cell">
                <input type="checkbox" id="select-all-checkbox" title="Select All Visible Logs">
              </th>
              <th data-sort="id">ID</th>
              <th class="checkbox-cell">Downloaded</th>
              <th data-sort="logUser.name">User</th>
              <th data-sort="application">Application</th>
              <th data-sort="operation">Operation</th>
              <th data-sort="lastModifiedDate">Time</th>
              <th data-sort="status">Status</th>
              <th data-sort="logLength">Size (bytes)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="logs-table-body">
            <!-- Logs will be inserted here -->
            <tr>
              <td colspan="10">No logs found. Click Refresh to fetch logs.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      
      // Elements
      const openOrgButton = document.getElementById('open-org-button');
      const refreshButton = document.getElementById('refresh-button');
      const soqlButton = document.getElementById('soql-button');
      const clearLocalButton = document.getElementById('clear-local-button');
      const deleteServerButton = document.getElementById('delete-server-button');
      const deleteRestApiButton = document.getElementById('delete-rest-api-button');
      const filterInput = document.getElementById('filter-input');
      const clearFilterButton = document.getElementById('clear-filter-button');
      const logsTableBody = document.getElementById('logs-table-body');
      const loadingIndicator = document.getElementById('loading-indicator');
      const loadingText = document.getElementById('loading-text');
      const errorContainer = document.getElementById('error-container');
      const errorMessage = document.getElementById('error-message');
      const successContainer = document.getElementById('success-container');
      const successMessage = document.getElementById('success-message');
      const confirmModal = document.getElementById('confirm-modal');
      const modalTitle = document.getElementById('modal-title');
      const modalMessage = document.getElementById('modal-message');
      const modalCancel = document.getElementById('modal-cancel');
      const modalConfirm = document.getElementById('modal-confirm');
      const debugPreset = document.getElementById('debug-preset');
      const applyDebugConfigButton = document.getElementById('apply-debug-config-button');
      
      // Debug configuration elements
      const debugSelects = {
        apexCode: document.getElementById('debug-apex-code'),
        apexProfiling: document.getElementById('debug-apex-profiling'),
        callout: document.getElementById('debug-callout'),
        dataAccess: document.getElementById('debug-data-access'),
        database: document.getElementById('debug-database'),
        nba: document.getElementById('debug-nba'),
        system: document.getElementById('debug-system'),
        validation: document.getElementById('debug-validation'),
        visualforce: document.getElementById('debug-visualforce'),
        wave: document.getElementById('debug-wave'),
        workflow: document.getElementById('debug-workflow')
      };
      
      // Debug presets
      const debugPresets = {
        default: {
          apexCode: 'DEBUG',
          apexProfiling: 'INFO',
          callout: 'INFO',
          dataAccess: 'INFO',
          database: 'INFO',
          nba: 'INFO',
          system: 'DEBUG',
          validation: 'INFO',
          visualforce: 'INFO',
          wave: 'INFO',
          workflow: 'INFO'
        },
        detailed: {
          apexCode: 'FINE',
          apexProfiling: 'FINE',
          callout: 'FINER',
          dataAccess: 'FINE',
          database: 'FINE',
          nba: 'FINE',
          system: 'FINE',
          validation: 'INFO',
          visualforce: 'FINE',
          wave: 'FINE',
          workflow: 'FINE'
        },
        developer: {
          apexCode: 'FINEST',
          apexProfiling: 'FINEST',
          callout: 'FINEST',
          dataAccess: 'FINEST',
          database: 'FINEST',
          nba: 'FINE',
          system: 'FINEST',
          validation: 'FINEST',
          visualforce: 'FINEST',
          wave: 'FINEST',
          workflow: 'FINEST'
        },
        debugonly: {
          apexCode: 'DEBUG',
          apexProfiling: 'INFO',
          callout: 'INFO',
          dataAccess: 'FINEST',
          database: 'INFO',
          nba: 'ERROR',
          system: 'INFO',
          validation: 'INFO',
          visualforce: 'INFO',
          wave: 'ERROR',
          workflow: 'ERROR'
        }
      };
      
      // Apply preset
      function applyPreset(preset) {
        if (preset === 'custom') {
          return; // Don't change anything for custom
        }
        
        const presetValues = debugPresets[preset];
        if (!presetValues) {
          return;
        }
        
        // Apply preset values to selects
        Object.keys(presetValues).forEach(key => {
          const select = debugSelects[key];
          if (select) {
            select.value = presetValues[key];
          }
        });
      }
      
      // Get current debug configuration
      function getDebugConfig() {
        const config = {};
        Object.keys(debugSelects).forEach(key => {
          config[key] = debugSelects[key].value;
        });
        return config;
      }
      
      // Initialize preset dropdown
      debugPreset.addEventListener('change', () => {
        const selectedPreset = debugPreset.value;
        console.log('Preset changed to:', selectedPreset);
        
        // Apply the preset values to the dropdowns
        applyPreset(selectedPreset);
        
        // Show a confirmation message
        showSuccess('Debug preset "' + selectedPreset + '" applied to configuration. Click Apply to save changes.');
        setTimeout(() => hideSuccess(), 5000);
      });
      
      // Apply debug configuration and turn on debug
      applyDebugConfigButton.addEventListener('click', () => {
        const config = getDebugConfig();
        console.log('Applying debug configuration and turning on debug:', config);
        
        vscode.postMessage({
          command: 'applyDebugConfig',
          config: config,
          turnOnDebug: true
        });
        
        showLoading('Applying debug configuration and enabling debug log...');
      });
      
      // Handle messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message:', message);
        
        switch (message.command) {
          case 'updateLogs':
            logs = message.logs || [];
            // Sort logs with current sort settings
            sortLogs(currentSort.column, currentSort.direction);
            // Hide loading state after logs are updated and rendered
            hideLoading();
            break;
          case 'loading':
            if (message.isLoading) {
              showLoading(message.message || 'Loading logs...');
            } else {
              hideLoading();
            }
            break;
          case 'error':
            showError(message.error);
            hideLoading();
            break;
          case 'downloading':
            handleDownloadStatus(message.logId, message.isDownloading);
            break;
          case 'downloadStatus':
            handleDownloadStatus(message.logId, message.status === 'downloading', message.status, message.filePath, message.error);
            break;
          case 'debugStatus':
            if (message.success) {
              showSuccess('Debug log enabled successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to enable debug log: ' + message.error);
            }
            hideLoading();
            break;
          case 'clearLocalStatus':
            if (message.success) {
              showSuccess('Local log files cleared successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to clear local log files: ' + message.error);
            }
            hideLoading();
            break;
          case 'deleteServerStatus':
            if (message.success) {
              showSuccess('Server logs deleted successfully!');
              setTimeout(() => hideSuccess(), 5000);
              // Refresh logs after deletion
              vscode.postMessage({ command: 'fetchLogs' });
            } else {
              showError('Error: Failed to delete server logs: ' + message.error);
            }
            hideLoading();
            break;
          case 'deleteSelectedStatus':
            if (message.success) {
              showSuccess('Selected logs deleted successfully!');
              setTimeout(() => hideSuccess(), 5000);
              // Refresh logs after deletion
              vscode.postMessage({ command: 'fetchLogs' });
            } else {
              showError('Error: Failed to delete selected logs: ' + message.error);
            }
            hideLoading();
            break;
          case 'applyConfigStatus':
            if (message.success) {
              showSuccess('Debug configuration applied successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to apply debug configuration: ' + message.error);
            }
            hideLoading();
            break;
          case 'currentDebugConfig':
            console.log('Received current debug config:', message.config);
            // Update the debug configuration UI with the received config
            if (message.config) {
              Object.keys(message.config).forEach(key => {
                if (debugSelects[key] && message.config[key]) {
                  debugSelects[key].value = message.config[key];
                }
              });
              
              // Try to determine if this matches a preset
              let matchedPreset = 'custom';
              for (const [presetName, presetConfig] of Object.entries(debugPresets)) {
                let isMatch = true;
                for (const key of Object.keys(presetConfig)) {
                  if (message.config[key] !== presetConfig[key]) {
                    isMatch = false;
                    break;
                  }
                }
                if (isMatch) {
                  matchedPreset = presetName;
                  break;
                }
              }
              debugPreset.value = matchedPreset;
            }
            break;
          case 'warning':
            showError('Warning: ' + message.message);
            setTimeout(() => hideError(), 5000);
            break;
          case 'info':
            showSuccess(message.message);
            setTimeout(() => hideSuccess(), 5000);
            break;
        }
      });
      
      // Request current debug configuration on load - REMOVED to prevent unnecessary API calls
      // document.addEventListener('DOMContentLoaded', () => {
      //   vscode.postMessage({ command: 'getCurrentDebugConfig' });
      // });
      
      // Sorting state
      let currentSort = {
        column: 'lastModifiedDate',
        direction: 'desc'
      };
      
      // State
      let logs = [];
      let pendingAction = null;
      
      // Selection state
      let selectedLogIds = new Set();

      // Update delete selected button state
      function updateDeleteSelectedButton() {
        const deleteSelectedButton = document.getElementById('delete-selected-button');
        deleteSelectedButton.disabled = selectedLogIds.size === 0;
      }
      
      // Format file size
      function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      // Show loading state
      function showLoading(message = 'Loading logs...') {
        loadingText.textContent = message;
        loadingIndicator.classList.remove('hidden');
        refreshButton.disabled = true;
        soqlButton.disabled = true;
        clearLocalButton.disabled = true;
        deleteServerButton.disabled = true;
        deleteRestApiButton.disabled = true;
      }
      
      // Hide loading state
      function hideLoading() {
        loadingIndicator.classList.add('hidden');
        refreshButton.disabled = false;
        soqlButton.disabled = false;
        clearLocalButton.disabled = false;
        deleteServerButton.disabled = false;
        deleteRestApiButton.disabled = false;
      }
      
      // Show error message
      function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorContainer.classList.remove('hidden');
      }
      
      // Hide error message
      function hideError() {
        errorMessage.style.display = 'none';
        errorContainer.classList.add('hidden');
      }
      
      // Show success message
      function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        successContainer.classList.remove('hidden');
      }
      
      // Hide success message
      function hideSuccess() {
        successMessage.style.display = 'none';
        successContainer.classList.add('hidden');
      }
      
      // Show confirmation modal
      function showConfirmModal(title, message, confirmAction) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        pendingAction = confirmAction;
        confirmModal.classList.remove('hidden');
      }
      
      // Hide confirmation modal
      function hideConfirmModal() {
        confirmModal.classList.add('hidden');
        pendingAction = null;
      }
      
      // Sort logs
      function sortLogs(column, direction) {
        console.log('Sorting logs by ' + column + ' ' + direction);
        
        // Update current sort
        currentSort = {
          column: column,
          direction: direction
        };
        
        // Sort logs
        logs.sort((a, b) => {
          // Handle nested properties (e.g., logUser.name)
          let aValue = column.includes('.') ? 
            column.split('.').reduce((obj, key) => obj && obj[key], a) : 
            a[column];
          let bValue = column.includes('.') ? 
            column.split('.').reduce((obj, key) => obj && obj[key], b) : 
            b[column];
          
          // Handle undefined values
          if (aValue === undefined) aValue = '';
          if (bValue === undefined) bValue = '';
          
          // Handle dates
          if (column === 'lastModifiedDate') {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
          }
          
          // Handle numbers
          if (column === 'logLength') {
            aValue = Number(aValue) || 0;
            bValue = Number(bValue) || 0;
          }
          
          // Sort
          if (aValue < bValue) {
            return direction === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
            return direction === 'asc' ? 1 : -1;
          }
          return 0;
        });
        
        // Update UI
        renderLogs();
        
        // Update sort indicators
        document.querySelectorAll('th').forEach(th => {
          th.classList.remove('sorted-asc', 'sorted-desc');
          if (th.getAttribute('data-sort') === column) {
            th.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
          }
        });
      }
      
      // Handle messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message:', message);
        
        switch (message.command) {
          case 'updateLogs':
            logs = message.logs || [];
            // Sort logs with current sort settings
            sortLogs(currentSort.column, currentSort.direction);
            // Hide loading state after logs are updated and rendered
            hideLoading();
            break;
          case 'loading':
            if (message.isLoading) {
              showLoading(message.message || 'Loading logs...');
            } else {
              hideLoading();
            }
            break;
          case 'error':
            showError(message.error);
            hideLoading();
            break;
          case 'downloading':
            handleDownloadStatus(message.logId, message.isDownloading);
            break;
          case 'downloadStatus':
            handleDownloadStatus(message.logId, message.status === 'downloading', message.status, message.filePath, message.error);
            break;
          case 'debugStatus':
            if (message.success) {
              showSuccess('Debug log enabled successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to enable debug log: ' + message.error);
            }
            hideLoading();
            break;
          case 'clearLocalStatus':
            if (message.success) {
              showSuccess('Local log files cleared successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to clear local log files: ' + message.error);
            }
            hideLoading();
            break;
          case 'deleteServerStatus':
            if (message.success) {
              showSuccess('Server logs deleted successfully!');
              setTimeout(() => hideSuccess(), 5000);
              // Refresh logs after deletion
              vscode.postMessage({ command: 'fetchLogs' });
            } else {
              showError('Error: Failed to delete server logs: ' + message.error);
            }
            hideLoading();
            break;
          case 'deleteSelectedStatus':
            if (message.success) {
              showSuccess('Selected logs deleted successfully!');
              setTimeout(() => hideSuccess(), 5000);
              // Refresh logs after deletion
              vscode.postMessage({ command: 'fetchLogs' });
            } else {
              showError('Error: Failed to delete selected logs: ' + message.error);
            }
            hideLoading();
            break;
          case 'applyConfigStatus':
            if (message.success) {
              showSuccess('Debug configuration applied successfully!');
              setTimeout(() => hideSuccess(), 5000);
            } else {
              showError('Error: Failed to apply debug configuration: ' + message.error);
            }
            hideLoading();
            break;
          case 'currentDebugConfig':
            console.log('Received current debug config:', message.config);
            // Update the debug configuration UI with the received config
            if (message.config) {
              Object.keys(message.config).forEach(key => {
                if (debugSelects[key] && message.config[key]) {
                  debugSelects[key].value = message.config[key];
                }
              });
              
              // Try to determine if this matches a preset
              let matchedPreset = 'custom';
              for (const [presetName, presetConfig] of Object.entries(debugPresets)) {
                let isMatch = true;
                for (const key of Object.keys(presetConfig)) {
                  if (message.config[key] !== presetConfig[key]) {
                    isMatch = false;
                    break;
                  }
                }
                if (isMatch) {
                  matchedPreset = presetName;
                  break;
                }
              }
              debugPreset.value = matchedPreset;
            }
            break;
          case 'warning':
            showError('Warning: ' + message.message);
            setTimeout(() => hideError(), 5000);
            break;
          case 'info':
            showSuccess(message.message);
            setTimeout(() => hideSuccess(), 5000);
            break;
        }
      });
      
      // Filter functionality
      filterInput.addEventListener('input', function() {
        const filterValue = this.value.toLowerCase();
        const rows = document.querySelectorAll('#logs-table-body tr');
        
        rows.forEach(row => {
          // Skip the "No logs found" row
          if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
            return;
          }
          
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(filterValue) ? '' : 'none';
        });
        
        // Update select all checkbox state based on visible rows
        updateSelectAllCheckboxState();
      });
      
      // Clear filter
      clearFilterButton.addEventListener('click', () => {
        filterInput.value = '';
        filterInput.dispatchEvent(new Event('input'));
      });
      
      // Update select all checkbox state
      function updateSelectAllCheckboxState() {
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        const visibleRows = Array.from(document.querySelectorAll('#logs-table-body tr'))
          .filter(row => row.style.display !== 'none' && row.cells.length > 1);
        
        const checkboxes = visibleRows.map(row => 
          row.querySelector('.select-log-checkbox')
        ).filter(Boolean);
        
        if (checkboxes.length === 0) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.disabled = true;
        } else {
          selectAllCheckbox.disabled = false;
          selectAllCheckbox.checked = checkboxes.every(checkbox => checkbox.checked);
        }
      }
      
	  // Open Org button
      openOrgButton.addEventListener('click', () => {
        console.log('open org button clicked');
        hideError();
        vscode.postMessage({
          command: 'openDefaultOrg'
        });
        showLoading('Open default Org...');
      });
	  
      // Refresh button
      refreshButton.addEventListener('click', () => {
        console.log('Refresh button clicked');
        hideError();
        vscode.postMessage({
          command: 'fetchLogs'
        });
        showLoading('Refreshing logs...');
      });
      
      // SOQL button
      soqlButton.addEventListener('click', () => {
        console.log('SOQL button clicked');
        hideError();
        vscode.postMessage({
          command: 'fetchLogsSoql'
        });
        showLoading('Refreshing logs via SOQL...');
      });
      
      // Clear Local button
      clearLocalButton.addEventListener('click', () => {
        console.log('Clear Local button clicked');
        showConfirmModal(
          'Clear Local Log Files',
          'Are you sure you want to delete all downloaded log files from your local directory? This action cannot be undone.',
          () => {
            hideError();
            vscode.postMessage({
              command: 'clearLocalLogs'
            });
            showLoading('Clearing local log files...');
          }
        );
      });
      
      // Delete Server button
      deleteServerButton.addEventListener('click', () => {
        console.log('Delete Server button clicked');
        showConfirmModal(
          'Delete Server Logs',
          'Are you sure you want to delete all logs from the Salesforce server? This action cannot be undone.',
          () => {
            hideError();
            vscode.postMessage({
              command: 'deleteServerLogs'
            });
            showLoading('Deleting server logs...');
          }
        );
      });
      
      // Delete REST API button
      deleteRestApiButton.addEventListener('click', () => {
        console.log('Delete REST API button clicked');
        showConfirmModal(
          'Delete Logs using REST API',
          'Are you sure you want to delete all logs using the Salesforce REST API? This action cannot be undone.',
          () => {
            hideError();
            vscode.postMessage({
              command: 'deleteViaSoql'
            });
            showLoading('Deleting logs using REST API...');
          }
        );
      });
      
      // Modal cancel button
      modalCancel.addEventListener('click', () => {
        hideConfirmModal();
      });
      
      // Modal confirm button
      modalConfirm.addEventListener('click', () => {
        if (pendingAction) {
          pendingAction();
        }
        hideConfirmModal();
      });
      
      // Handle download status updates
      function handleDownloadStatus(logId, isLoading, status, filePath, errorMsg) {
        const downloadButton = document.querySelector('.download-icon[data-id="' + logId + '"]');
        const openButton = document.querySelector('.open-icon[data-id="' + logId + '"]');
        const checkbox = document.querySelector('.downloaded-checkbox[data-id="' + logId + '"]');
        
        if (!downloadButton) return;
        
        if (isLoading) {
          downloadButton.disabled = true;
          downloadButton.title = 'Downloading...';
        } else {
          downloadButton.disabled = false;
          
          if (status === 'downloaded') {
            downloadButton.title = 'Downloaded';
            if (checkbox) checkbox.checked = true;
            
            // Enable open button
            if (openButton) {
              openButton.disabled = false;
              openButton.title = 'Open';
            }
          } else if (status === 'error') {
            downloadButton.title = errorMsg || 'Download failed';
            showError(errorMsg || 'Download failed');
          }
        }
      }
      
      function renderLogs() {
        hideError();
        logsTableBody.innerHTML = '';
        
        // Reset selection state
        selectedLogIds.clear();
        updateDeleteSelectedButton();
        
        if (!logs || logs.length === 0) {
          const row = document.createElement('tr');
          row.innerHTML = '<td colspan="10">No logs found. Click Refresh to fetch logs.</td>';
          logsTableBody.appendChild(row);
          document.getElementById('select-all-checkbox').disabled = true;
          return;
        }
        
        document.getElementById('select-all-checkbox').disabled = false;
        document.getElementById('select-all-checkbox').checked = false;
        
        logs.forEach(log => {
          if (!log || !log.id) {
            console.error('Invalid log entry:', log);
            return;
          }
          
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
          
          const row = document.createElement('tr');
          
          // Use string concatenation instead of template literals
          row.innerHTML = 
            '<td class="checkbox-cell">' +
            '  <input type="checkbox" class="select-log-checkbox" data-id="' + log.id + '">' +
            '</td>' +
            '<td>' + log.id + '</td>' +
            '<td class="checkbox-cell">' + (log.downloaded ? '✓' : '') + '</td>' +
            '<td>' + (log.logUser?.name || 'Unknown') + '</td>' +
            '<td>' + (log.application || 'Unknown') + '</td>' +
            '<td>' + (log.operation || 'Unknown') + '</td>' +
            '<td>' + formattedDate + '</td>' +
            '<td>' + (log.status || 'Unknown') + '</td>' +
            '<td>' + formattedSize + '</td>' +
            '<td class="action-cell">' +
            '  <button class="icon-button download-icon" data-id="' + log.id + '" title="Download"></button>' +
            '  <button class="icon-button open-icon" data-id="' + log.id + '" title="Open" ' + (!log.downloaded ? 'disabled' : '') + '></button>' +
            '</td>';
          
          logsTableBody.appendChild(row);
        });
        
        // Add event listeners to buttons
        document.querySelectorAll('.download-icon').forEach(button => {
          button.addEventListener('click', () => {
            const logId = button.getAttribute('data-id');
            console.log('Download button clicked for log:', logId);
            
            vscode.postMessage({
              command: 'downloadLog',
              logId: logId
            });
            
            button.disabled = true;
            button.title = 'Downloading...';
          });
        });
        
        document.querySelectorAll('.open-icon').forEach(button => {
          button.addEventListener('click', () => {
            const logId = button.getAttribute('data-id');
            console.log('Open button clicked for log:', logId);
            
            vscode.postMessage({
              command: 'openLog',
              logId: logId
            });
            
            button.disabled = true;
            button.title = 'Opening...';
          });
        });
        
        // Add event listeners for view buttons
        document.querySelectorAll('.view-icon').forEach(button => {
          button.addEventListener('click', () => {
            const logId = button.getAttribute('data-id');
            console.log('View button clicked for log:', logId);
            
            vscode.postMessage({
              command: 'viewLog',
              logId: logId
            });
            
            button.disabled = true;
            button.title = 'Viewing...';
          });
        });
        
        // Remove the event listeners for downloaded checkboxes since they're now just text indicators
        
        // Add event listeners to select checkboxes
        document.querySelectorAll('.select-log-checkbox').forEach(checkbox => {
          checkbox.addEventListener('change', () => {
            const logId = checkbox.getAttribute('data-id');
            console.log('Select checkbox changed for log:', logId, 'to', checkbox.checked);
            
            // Update selected log IDs
            if (checkbox.checked) {
              selectedLogIds.add(logId);
            } else {
              selectedLogIds.delete(logId);
              
              // Uncheck select all if any checkbox is unchecked
              document.getElementById('select-all-checkbox').checked = false;
            }
            
            // Update delete selected button
            updateDeleteSelectedButton();
          });
        });
        
        // Update select all checkbox state
        updateSelectAllCheckboxState();
      }
      
      // Add event listeners to table headers for sorting
      document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const column = th.getAttribute('data-sort');
          if (!column) return;
          
          // Toggle direction if clicking the same column
          const direction = (currentSort.column === column && currentSort.direction === 'asc') ? 'desc' : 'asc';
          
          // Sort logs
          sortLogs(column, direction);
        });
      });
      
      // Select all checkbox
      const selectAllCheckbox = document.getElementById('select-all-checkbox');
      selectAllCheckbox.addEventListener('change', () => {
        console.log('Select all checkbox changed to', selectAllCheckbox.checked);
        
        // Get all visible checkboxes
        const visibleRows = Array.from(document.querySelectorAll('#logs-table-body tr'))
          .filter(row => row.style.display !== 'none' && row.cells.length > 1);
        
        const checkboxes = visibleRows.map(row => 
          row.querySelector('.select-log-checkbox')
        ).filter(Boolean);
        
        // Update all visible checkboxes
        checkboxes.forEach(checkbox => {
          checkbox.checked = selectAllCheckbox.checked;
          
          // Update selected log IDs
          const logId = checkbox.getAttribute('data-id');
          if (selectAllCheckbox.checked) {
            selectedLogIds.add(logId);
          } else {
            selectedLogIds.delete(logId);
          }
        });
        
        // Update delete selected button
        updateDeleteSelectedButton();
      });
      
      // Delete selected button
      const deleteSelectedButton = document.getElementById('delete-selected-button');
      deleteSelectedButton.addEventListener('click', () => {
        console.log('Delete selected button clicked');
        
        if (selectedLogIds.size === 0) {
          return;
        }
        
        showConfirmModal(
          'Delete Selected Logs',
          'Are you sure you want to delete ' + selectedLogIds.size + ' selected logs from the Salesforce server? This action cannot be undone.',
          () => {
            hideError();
            vscode.postMessage({
              command: 'deleteSelectedLogs',
              logIds: Array.from(selectedLogIds)
            });
            showLoading('Deleting selected logs...');
          }
        );
      });
      
      // Initialize by requesting logs
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM content loaded - manual refresh required');
        // Removed automatic log fetching to prevent unnecessary API calls
        // vscode.postMessage({ command: 'fetchLogs' });
        // showLoading();
        
        // Update the message to inform users they need to click refresh
        const noLogsRow = document.querySelector('#logs-table-body tr');
        if (noLogsRow && noLogsRow.cells.length === 1) {
          noLogsRow.cells[0].textContent = 'No logs loaded. Click Refresh to fetch logs. No automatic fetching to prevent API errors.';
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
