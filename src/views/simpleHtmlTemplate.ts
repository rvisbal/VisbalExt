import * as vscode from 'vscode';

export function getSimpleHtmlTemplate(extensionUri: vscode.Uri): string {
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

    <script>
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
          
          row.innerHTML = \`
            <td title="\${log.id}">\${log.id.substring(0, 10)}...</td>
            <td>\${log.logUser?.name || 'Unknown'}</td>
            <td>\${log.application || 'Unknown'}</td>
            <td>\${log.operation || 'Unknown'}</td>
            <td>\${formattedDate}</td>
            <td>\${log.status || 'Unknown'}</td>
            <td>\${formatBytes(log.logLength || 0)}</td>
            <td>
              <button class="download-button" data-log-id="\${log.id}">
                \${log.downloaded ? 'Downloaded' : 'Download'}
              </button>
            </td>
          \`;
          
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
            const button = document.querySelector(\`.download-button[data-log-id="\${message.logId}"]\`);
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