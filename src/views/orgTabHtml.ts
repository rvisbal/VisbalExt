import { styles } from './styles';
import { WebviewUtils } from '../utils/webviewUtils';

export function getOrgTabHtml(orgs: any[] = [], isLoading = false, error = ''): string {
  // Helper to render org rows with filtering and search
  function renderOrgRows(orgs: any[], selectedType: string = 'ALL', searchTerm: string = ''): string {
    if (!orgs || orgs.length === 0) {
      return `<tr><td colspan="12" class="no-logs-message">No orgs found. Click Refresh to load orgs.</td></tr>`;
    }

    let filteredOrgs = selectedType === 'ALL' ? orgs : orgs.filter(org => {
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

    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      filteredOrgs = filteredOrgs.filter(org =>
        (org.alias && org.alias.toLowerCase().includes(term)) ||
        (org.username && org.username.toLowerCase().includes(term)) ||
        (org.type && org.type.toLowerCase().includes(term)) ||
        (org.orgId && org.orgId.toLowerCase().includes(term))
      );
    }

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

  const html = `<!DOCTYPE html>
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
      .search-container {
        display: flex;
        align-items: center;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 2px 8px;
        margin-right: 12px;
        height: 28px;
      }
      .search-icon {
        width: 16px;
        height: 16px;
        margin-right: 4px;
        color: var(--vscode-icon-foreground);
      }
      .search-input {
        border: none;
        outline: none;
        background: transparent;
        color: var(--vscode-input-foreground);
        font-size: 13px;
        flex: 1;
      }
      .clear-btn {
        background: none;
        border: none;
        color: var(--vscode-icon-foreground);
        cursor: pointer;
        font-size: 16px;
        margin-left: 4px;
        padding: 0;
      }
      .clear-btn:focus {
        outline: 1px solid var(--vscode-focusBorder);
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
          <div class="search-container">
            <span class="search-icon">🔍</span>
            <input id="orgSearchInput" class="search-input" type="text" placeholder="Filter orgs..." aria-label="Filter orgs" />
            <button id="clearSearchBtn" class="clear-btn" title="Clear search" aria-label="Clear search" style="display:none">×</button>
          </div>
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
      
      function debugLog(message) {
        visbalDebugLog(message);
      }
      
      document.addEventListener('click', (e) => {
        console.log('Click event target:', e.target);
        const target = e.target;
        //debugLog('addEventListener.click.target: ' + target);
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

      function updateTable(filterType, searchTerm) {
        debugLog('updateTable');
        debugLog('updateTable.searchTerm: ' + searchTerm);
        debugLog('updateTable.filterType: ' + filterType);
        
        const tbody = document.getElementById('orgsTableBody');
        if (!tbody) return;
        tbody.innerHTML = ${renderOrgRows.toString()}(currentOrgs, filterType);
      }

      const orgTypeFilter = document.getElementById('orgTypeFilter');
      const orgSearchInput = document.getElementById('orgSearchInput');
      const clearSearchBtn = document.getElementById('clearSearchBtn');
      document.getElementById('refreshOrgsBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'refreshOrgList' });
      });

      document.getElementById('orgTypeFilter').addEventListener('change', (e) => {
        updateTable(e.target.value, '');
      });

      window.addEventListener('message', event => {
        const message = event.data;
        debugLog('window.addEventListener.message: ' + message);
        if (message.command === 'updateOrgList') {
          currentOrgs = message.orgs;
          const filterType = document.getElementById('orgTypeFilter').value;
          updateTable(filterType, orgSearchInput.value);
        }
      });
    </script>
  </body>
  </html>`;

  return WebviewUtils.injectDebugBox(html);
} 