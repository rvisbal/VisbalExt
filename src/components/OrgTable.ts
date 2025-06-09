import { Webview } from 'vscode';

export interface Org {
    alias?: string;
    username?: string;
    type?: string;
    instanceUrl?: string;
    orgId?: string;
    connectedStatus?: string;
    isDefault?: boolean;
    isDevHub?: boolean;
    lastUsed?: string;
    instanceApiVersion?: string;
    namespacePrefix?: string;
}

export class OrgTable {
    private webview: Webview;
    private orgs: Org[];

    constructor(webview: Webview, orgs: Org[] = []) {
        this.webview = webview;
        this.orgs = orgs;
    }

    public render(): string {
        return `
            <div class="container">
                <div class="header">
                    <h1>Salesforce Orgs</h1>
                    <div class="actions">
                        <div class="search-container">
                            <button class="icon-button" id="searchIconBtn" tabindex="-1" aria-hidden="true">🔍</button>
                            <input id="orgSearchInput" class="filter-input" type="text" placeholder="Filter orgs..." aria-label="Filter orgs" />
                            <button id="clearSearchBtn" class="clear-filter-button" title="Clear search" aria-label="Clear search" style="display:none">×</button>
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
                        <button class="icon-button" id="refreshOrgsBtn" title="Refresh Orgs" aria-label="Refresh Orgs">
                            <span class="icon refresh-icon"></span>
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
                            ${this.renderRows()}
                        </tbody>
                    </table>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let currentOrgs = ${JSON.stringify(this.orgs)};

                // Handle search input
                const searchInput = document.getElementById('orgSearchInput');
                const clearSearchBtn = document.getElementById('clearSearchBtn');
                
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value;
                    clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
                    requestUpdate();
                });

                clearSearchBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    clearSearchBtn.style.display = 'none';
                    requestUpdate();
                });

                // Handle filter changes
                document.getElementById('orgTypeFilter').addEventListener('change', requestUpdate);

                // Handle refresh
                document.getElementById('refreshOrgsBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'refreshOrgList' });
                });

                // Handle org alias clicks
                document.addEventListener('click', (e) => {
                    const target = e.target;
                    if (target && target.classList && target.classList.contains('org-alias')) {
                        e.preventDefault();
                        const alias = target.getAttribute('data-alias');
                        if (alias) {
                            vscode.postMessage({ command: 'openOrg', alias });
                        }
                    }
                });

                // Request table update
                function requestUpdate() {
                    const filterType = document.getElementById('orgTypeFilter').value;
                    const searchTerm = searchInput.value;
                    vscode.postMessage({ 
                        command: 'getFilteredOrgs',
                        filterType,
                        searchTerm
                    });
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateOrgsHtml':
                            document.getElementById('orgsTableBody').innerHTML = message.html;
                            break;
                        case 'updateOrgList':
                            currentOrgs = message.orgs;
                            requestUpdate();
                            break;
                    }
                });
            </script>
        `;
    }

    private renderRows(): string {
        if (!this.orgs || this.orgs.length === 0) {
            return `<tr><td colspan="12" class="no-logs-message">No orgs found. Click Refresh to load orgs.</td></tr>`;
        }

        return this.orgs.map(org => `
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

    public filterOrgs(filterType: string = 'ALL', searchTerm: string = ''): Org[] {
        let filteredOrgs = this.orgs;

        // Apply type filter
        if (filterType !== 'ALL') {
            filteredOrgs = filteredOrgs.filter(org => {
                switch (filterType) {
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
        }

        // Apply search filter
        if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.trim().toLowerCase();
            filteredOrgs = filteredOrgs.filter(org =>
                (org.alias && org.alias.toLowerCase().includes(term)) ||
                (org.username && org.username.toLowerCase().includes(term)) ||
                (org.type && org.type.toLowerCase().includes(term)) ||
                (org.orgId && org.orgId.toLowerCase().includes(term))
            );
        }

        return filteredOrgs;
    }

    public updateOrgs(orgs: Org[]): void {
        this.orgs = orgs;
        this.webview.postMessage({
            command: 'updateOrgList',
            orgs
        });
    }

    public getFilteredHtml(filterType: string = 'ALL', searchTerm: string = ''): string {
        const filteredOrgs = this.filterOrgs(filterType, searchTerm);
        if (filteredOrgs.length === 0) {
            return `<tr><td colspan="12" class="no-logs-message">No orgs match the selected filter.</td></tr>`;
        }
        return filteredOrgs.map(org => `
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
} 