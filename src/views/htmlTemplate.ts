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
                                        
                                        // If we have a file path, add it to the log and show the Open button
                                        if (message.filePath) {
                                            log.localFilePath = message.filePath;
                                            
                                            // Check if we already have an Open button
                                            let openButton = document.querySelector('.open-button[data-log-id="' + message.logId + '"]');
                                            
                                            // If not, create one
                                            if (!openButton) {
                                                openButton = document.createElement('button');
                                                openButton.className = 'button open-button';
                                                openButton.setAttribute('data-log-id', message.logId);
                                                openButton.style.marginLeft = '5px';
                                                openButton.textContent = 'Open';
                                                
                                                // Add event listener to the new button
                                                openButton.addEventListener('click', () => {
                                                    const logId = openButton.getAttribute('data-log-id');
                                                    debug('Open button clicked for log: ' + logId);
                                                    
                                                    vscode.postMessage({ 
                                                        command: 'openLog', 
                                                        logId: logId 
                                                    });
                                                    
                                                    // Update button to show loading state
                                                    openButton.disabled = true;
                                                    openButton.textContent = 'Opening...';
                                                });
                                                
                                                // Add the button after the download button
                                                button.parentNode.appendChild(openButton);
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
                            const openButton = document.querySelector('.open-button[data-log-id="' + message.logId + '"]');
                            if (openButton && openButton.textContent === 'Opening...') {
                                openButton.disabled = false;
                                openButton.textContent = 'Open';
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
        { id: 'raw', label: 'Raw Log' }
    ],
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
                <table>
                    <thead>
                        <tr>
                            <th>Line</th>
                            <th>Time (ms)</th>
                            <th>Code</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedData.executionPath ? parsedData.executionPath.map((line: any) => `
                        <tr>
                            <td>${line.lineNumber}</td>
                            <td>${line.time}</td>
                            <td>${line.code}</td>
                        </tr>
                        `).join('') : `
                        <tr>
                            <td colspan="3">No execution path data available</td>
                        </tr>
                        `}
                    </tbody>
                </table>
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
            
            <div id="raw" class="tab-content ${currentTab === 'raw' ? 'active' : ''}">
                <h2>Raw Log</h2>
                <pre class="raw-log">${parsedData.rawLog ? parsedData.rawLog.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Raw log content not available.'}</pre>
            </div>
        </div>
        
        <script>
            (function() {
                console.log('[VisbalLogView:WebView] Log detail view initialized');
                
                // VSCode API
                const vscode = acquireVsCodeApi();
                
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
                    }
                });
                
                console.log('[VisbalLogView:WebView] Log detail view script loaded');
            })();
        </script>
    </body>
    </html>`;
} 