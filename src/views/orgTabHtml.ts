import { styles } from './styles';

export function getOrgTabHtml(orgs: any[] = [], isLoading = false, error = ''): string {
  // Helper to render org rows
  function renderOrgRows(orgs: any[]): string {
    if (!orgs || orgs.length === 0) {
      return `<tr><td colspan="12" class="no-logs-message">No orgs found. Click Refresh to load orgs.</td></tr>`;
    }
    return orgs.map((org: any) => `
      <tr>
        <td>${org.alias || ''}</td>
        <td>${org.username || ''}</td>
        <td>${org.type || ''}</td>
        <td>${org.instanceUrl || ''}</td>
        <td>${org.orgId || ''}</td>
        <td>${org.connectedStatus || ''}</td>
        <td>${org.isDefault ? 'Yes' : ''}</td>
        <td>${org.isDevHub ? 'Yes' : ''}</td>
        <td>${org.lastUsed || ''}</td>
        <td>${org.instanceApiVersion || ''}</td>
        <td>${org.namespacePrefix || ''}</td>
      </tr>
    `).join('');
  }

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salesforce Orgs</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Salesforce Orgs</h1>
        <div class="actions">
          <button class="button" id="refreshOrgsBtn" title="Refresh Orgs" aria-label="Refresh Orgs">
            <span class="icon refresh-icon"></span> Refresh
          </button>
        </div>
      </div>
      <div class="logs-container">
        <table class="logs-table">
          <thead>
            <tr>
              <th>Alias</th>
              <th>Username</th>
              <th>Type</th>
              <th>Instance URL</th>
              <th>Org ID</th>
              <th>Status</th>
              <th>Default</th>
              <th>Dev Hub</th>
              <th>Last Used</th>
              <th>API Version</th>
              <th>Namespace</th>
            </tr>
          </thead>
          <tbody>
            ${isLoading ? `<tr><td colspan="12" class="loading-container"><span class="loading-spinner"></span> Loading orgs...</td></tr>` : error ? `<tr><td colspan="12" class="error-message">${error}</td></tr>` : renderOrgRows(orgs)}
          </tbody>
        </table>
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('refreshOrgsBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'refreshOrgList' });
      });
      window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'updateOrgList') {
          // Reload the webview with new orgs (handled by extension)
          location.reload();
        }
      });
    </script>
  </body>
  </html>`;
} 