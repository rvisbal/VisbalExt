import { styles } from './styles';

export function getOrgTabHtml(orgs: any[] = [], isLoading = false, error = ''): string {
  // Helper to render org rows with filtering
  function renderOrgRows(orgs: any[], selectedType: string = 'ALL'): string {
    if (!orgs || orgs.length === 0) {
      return `<tr><td colspan="12" class="no-logs-message">No orgs found. Click Refresh to load orgs.</td></tr>`;
    }

    const filteredOrgs = selectedType === 'ALL' ? orgs : orgs.filter(org => {
      switch (selectedType) {
        case 'DEV_HUB':
          return org.isDevHub;
        case 'NON_SCRATCH':
          return !org.type?.toLowerCase().includes('scratch') && !org.isDevHub;
        case 'SCRATCH':
          return org.type?.toLowerCase().includes('scratch');
        case 'OTHER':
          return !org.isDevHub && !org.type;
        default:
          return true;
      }
    });

    if (filteredOrgs.length === 0) {
      return `<tr><td colspan="12" class="no-logs-message">No orgs match the selected filter.</td></tr>`;
    }

    return filteredOrgs.map((org: any) => `
      <tr>
        <td><a href="#" class="org-alias" data-alias="${org.alias || ''}" title="Click to open org">${org.alias || ''}</a></td>
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
    <style>
      .filter-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .filter-select {
        padding: 4px 8px;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 2px;
        font-size: 13px;
      }
      .filter-select:focus {
        outline: 1px solid var(--vscode-focusBorder);
      }
      .org-alias {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
        cursor: pointer;
      }
      .org-alias:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Salesforce Orgs</h1>
        <div class="actions">
          <div class="filter-container">
            <select id="orgTypeFilter" class="filter-select" aria-label="Filter orgs by type">
              <option value="ALL">All Orgs</option>
              <option value="DEV_HUB">Dev Hubs</option>
              <option value="NON_SCRATCH">Non Scratch Orgs</option>
              <option value="SCRATCH">Scratch Orgs</option>
              <option value="OTHER">Others</option>
            </select>
          </div>
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
          <tbody id="orgsTableBody">
            ${isLoading ? `<tr><td colspan="12" class="loading-container"><span class="loading-spinner"></span> Loading orgs...</td></tr>` : error ? `<tr><td colspan="12" class="error-message">${error}</td></tr>` : renderOrgRows(orgs)}
          </tbody>
        </table>
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      let currentOrgs = ${JSON.stringify(orgs)};

      // Add click handler for org aliases
      document.addEventListener('click', (e) => {
        console.log('Click event target:', e.target);
        const target = e.target;
        if (target && target.classList && target.classList.contains('org-alias')) {
          console.log('Found org-alias element');
          e.preventDefault();
          const alias = target.getAttribute('data-alias');
          console.log('Org alias:', alias);
          if (alias) {
            console.log('Sending openOrg message for alias:', alias);
            vscode.postMessage({ command: 'openOrg', alias: alias });
          }
        }
      });

      function updateTable(filterType = 'ALL') {
        const tbody = document.getElementById('orgsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = ${renderOrgRows.toString()}(currentOrgs, filterType);
      }

      document.getElementById('refreshOrgsBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'refreshOrgList' });
      });

      document.getElementById('orgTypeFilter').addEventListener('change', (e) => {
        updateTable(e.target.value);
      });

      window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'updateOrgList') {
          currentOrgs = message.orgs;
          const filterType = document.getElementById('orgTypeFilter').value;
          updateTable(filterType);
        }
      });
    </script>
  </body>
  </html>`;
} 