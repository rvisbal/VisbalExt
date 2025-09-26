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

    // Helper method to check if an org is a scratch org
    private isScratchOrg(org: Org): boolean {
        return org.type?.toLowerCase().includes('scratch') || false;
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
                            <select id="orgTypeFilter" class="org-selector" aria-label="Filter orgs by type">
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
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="orgsTableBody">
                            ${this.renderRows()}
                        </tbody>
                    </table>
                </div>

                <!-- Status Bar -->
                <div id="statusBar" class="status-bar" style="display:none">
                    <div class="status-content">
                        <span id="statusIcon" class="status-icon loading-icon"></span>
                        <span id="statusMessage">Processing...</span>
                    </div>
                </div>

                <!-- Org Details Modal -->
                <div id="orgDetailsModal" class="modal-overlay" style="display:none">
                    <div class="modal-content org-details-modal">
                        <div class="modal-header">
                            <div class="modal-header-left">
                                <h4 id="orgDetailsAlias"></h4>
                                <span id="orgDetailsType" class="org-type-badge"></span>
                            </div>
                            <button id="closeOrgDetailsBtn" class="close-button" title="Close" aria-label="Close">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="json-container">
                                <pre id="orgDetailsJson" class="json-content"></pre>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button id="copyJsonBtn" class="button-secondary">Copy JSON</button>
                            <button id="closeDetailsBtn" class="button-secondary">Close</button>
                        </div>
                    </div>
                </div>

                <!-- Confirmation Dialog -->
                <div id="confirmDialog" class="modal-overlay" style="display:none">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Confirm Delete Scratch Org</h3>
                        </div>
                        <div class="modal-body">
                            <p>Are you sure you want to delete this scratch org environment?</p>
                            <p><strong>Alias:</strong> <span id="deleteOrgAlias"></span></p>
                            <p><strong>Username:</strong> <span id="deleteOrgUsername"></span></p>
                            <p class="warning-text">⚠️ This will permanently delete the scratch org and cannot be undone.</p>
                        </div>
                        <div class="modal-footer">
                            <button id="confirmDeleteBtn" class="button-danger">Delete Scratch Org</button>
                            <button id="cancelDeleteBtn" class="button-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .action-button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: background-color 0.2s;
                    min-width: 28px;
                    height: 28px;
                    margin: 0 2px;
                }
                
                .view-button {
                    color: var(--vscode-textLink-foreground, #0e639c);
                    background-color: transparent;
                }
                
                .view-button:hover {
                    background-color: rgba(14, 99, 156, 0.1);
                }
                
                .delete-button {
                    color: var(--vscode-errorForeground, #f48771);
                    background-color: transparent;
                }
                
                .delete-button:hover {
                    background-color: rgba(244, 135, 113, 0.1);
                }
                
                .delete-button .icon,
                .view-button .icon {
                    width: 16px;
                    height: 16px;
                }
                
                .view-icon {
                    background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='%230e639c'%3E%3Cpath d='M7.99993 6.00316C9.47266 6.00316 10.6666 7.19708 10.6666 8.66981C10.6666 10.1426 9.47266 11.3365 7.99993 11.3365C6.52715 11.3365 5.33324 10.1426 5.33324 8.66981C5.33324 7.19708 6.52715 6.00316 7.99993 6.00316ZM7.99993 7.00315C7.07946 7.00315 6.33324 7.74935 6.33324 8.66981C6.33324 9.59028 7.07946 10.3365 7.99993 10.3365C8.9204 10.3365 9.6666 9.59028 9.6666 8.66981C9.6666 7.74935 8.9204 7.00315 7.99993 7.00315ZM7.99993 3.66675C11.0756 3.66675 13.7307 5.76675 14.4673 8.70968C14.5344 8.97755 14.3716 9.24908 14.1037 9.31615C13.8358 9.38315 13.5643 9.22041 13.4973 8.95248C12.8713 6.45205 10.6141 4.66675 7.99993 4.66675C5.38454 4.66675 3.12664 6.45359 2.50182 8.95555C2.43491 9.22341 2.16348 9.38635 1.89557 9.31948C1.62766 9.25255 1.46471 8.98115 1.53162 8.71321C2.26701 5.76856 4.9229 3.66675 7.99993 3.66675Z'/%3E%3C/svg%3E");
                }
                
                .trash-icon {
                    background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='%23f48771'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z'/%3E%3C/svg%3E");
                }
                
                .org-details-modal {
                    min-width: 600px;
                    max-width: 800px;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                
                .org-details-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .org-details-header h4 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--vscode-editor-foreground);
                }
                
                .org-type-badge {
                    background-color: var(--vscode-badge-background, #0e639c);
                    color: var(--vscode-badge-foreground, white);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 500;
                    text-transform: uppercase;
                    white-space: nowrap;
                }
                
                .json-container {
                    background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 16px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .json-content {
                    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
                    font-size: 13px;
                    line-height: 1.4;
                    color: var(--vscode-editor-foreground);
                    margin: 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                
                .close-button {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: var(--vscode-icon-foreground);
                    padding: 4px;
                    border-radius: 4px;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background-color 0.2s;
                }
                
                .close-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                
                .status-bar {
                    background-color: var(--vscode-statusBar-background, #007acc);
                    color: var(--vscode-statusBar-foreground, white);
                    padding: 8px 16px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    position: sticky;
                    bottom: 0;
                    z-index: 100;
                }
                
                .status-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .status-icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                }
                
                .status-bar.success {
                    background-color: var(--vscode-statusBar-noFolderBackground, #68217a);
                }
                
                .status-bar.error {
                    background-color: var(--vscode-statusBarItem-errorBackground, #a1260d);
                }
                
                .success-icon {
                    background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z'/%3E%3C/svg%3E");
                }
                
                .error-icon {
                    background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1ZM7 4.5V8.5H9V4.5H7ZM7 10.5V12.5H9V10.5H7Z'/%3E%3C/svg%3E");
                }
                
                .loading-icon {
                    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.917 7A6.002 6.002 0 0 0 2.083 7H1.071a7.002 7.002 0 0 1 13.858 0h-1.012z"/></svg>');
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                
                .modal-content {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    min-width: 400px;
                    max-width: 500px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                }
                
                .modal-header {
                    padding: 12px 16px 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                }
                
                .modal-header-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                }
                
                .modal-header h3,
                .modal-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--vscode-editor-foreground);
                }
                
                .modal-body {
                    padding: 12px 16px;
                }
                
                .modal-body p {
                    margin: 0 0 12px 0;
                    color: var(--vscode-editor-foreground);
                    font-size: 13px;
                    line-height: 1.4;
                }
                
                .modal-body p:last-child {
                    margin-bottom: 0;
                }
                
                .warning-text {
                    color: var(--vscode-errorForeground, #f48771) !important;
                    font-weight: 500;
                    margin-top: 16px !important;
                }
                
                .modal-footer {
                    padding: 8px 16px 12px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                
                .button-danger {
                    background-color: var(--vscode-button-background, #d73a49);
                    color: var(--vscode-button-foreground, white);
                    border: none;
                    padding: 6px 14px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: background-color 0.2s;
                }
                
                .button-danger:hover {
                    background-color: var(--vscode-button-hoverBackground, #b91d28);
                }
                
                .button-secondary {
                    background-color: var(--vscode-button-secondaryBackground, transparent);
                    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
                    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
                    padding: 6px 14px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: background-color 0.2s;
                }
                
                .button-secondary:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                let currentOrgs = ${JSON.stringify(this.orgs)};
                let pendingDeleteOrg = null;
                
                // Get previous webview state (includes scroll position)
                const previousState = vscode.getState() || {};

                // Function to save scroll position to webview state
                function saveScrollPosition() {
                    const tableContainer = document.querySelector('.orgs-table-container');
                    if (tableContainer) {
                        const currentState = vscode.getState() || {};
                        const scrollTop = tableContainer.scrollTop;
                        currentState.scrollPosition = scrollTop;
                        vscode.setState(currentState);
                    }
                }
                
                // Function to restore scroll position from webview state
                function restoreScrollPosition() {
                    const tableContainer = document.querySelector('.orgs-table-container');
                    if (tableContainer && previousState.scrollPosition !== undefined) {

                        
                        // Try a few times with short delays to handle async DOM updates
                        [0, 100, 300].forEach((delay) => {
                            setTimeout(() => {
                                if (tableContainer.scrollTop !== previousState.scrollPosition) {
                                    tableContainer.scrollTop = previousState.scrollPosition;
                                }
                            }, delay);
                        });
                    }
                }
                
                // Restore scroll position when DOM is ready
                document.addEventListener('DOMContentLoaded', () => {
                    requestAnimationFrame(() => {
                        restoreScrollPosition();
                    });
                });
                
                // Also try to restore immediately if DOM is already loaded
                if (document.readyState !== 'loading') {
                    requestAnimationFrame(() => {
                        restoreScrollPosition();
                    });
                }
                
                // Add focus listeners to restore scroll when window regains focus (after returning from browser)
                window.addEventListener('focus', () => {
                    setTimeout(() => {
                        restoreScrollPosition();
                    }, 100);
                });
                
                // Also listen for visibility change events
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        setTimeout(() => {
                            restoreScrollPosition();
                        }, 100);
                    }
                });

                // Add scroll event listener to save scroll position continuously
                document.addEventListener('DOMContentLoaded', () => {
                    const tableContainer = document.querySelector('.orgs-table-container');
                    if (tableContainer) {
                        // Throttle scroll events to avoid excessive state saves
                        let scrollTimeout = null;
                        tableContainer.addEventListener('scroll', () => {
                            if (scrollTimeout) {
                                clearTimeout(scrollTimeout);
                            }
                            scrollTimeout = setTimeout(() => {
                                saveScrollPosition();
                            }, 100); // Save after 100ms of no scrolling
                        });

                    }
                });

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
                        e.stopPropagation();
                        
                        // Save scroll position immediately before sending the message
                        saveScrollPosition();
                        
                        const alias = target.getAttribute('data-alias');
                        if (alias) {

                            vscode.postMessage({ command: 'openOrg', alias });
                        }
                    }
                });

                // Handle view button clicks
                document.addEventListener('click', (e) => {
                    const target = e.target.closest('.view-button');
                    if (target) {
                        e.preventDefault();
                        const orgDataJson = target.getAttribute('data-org-json');
                        if (orgDataJson) {
                            try {
                                const orgData = JSON.parse(orgDataJson);
                                showOrgDetails(orgData);
                            } catch (error) {
                                console.error('Error parsing org data:', error);
                            }
                        }
                    }
                });

                // Handle delete button clicks
                document.addEventListener('click', (e) => {
                    const target = e.target.closest('.delete-button');
                    if (target) {
                        e.preventDefault();
                        const alias = target.getAttribute('data-alias');
                        const username = target.getAttribute('data-username');
                        OrgUtils.logDebug('[VisbalExt.OrgTable] Delete button clicked - alias:', alias, 'username:', username);
                        showDeleteConfirmation(alias, username);
                    }
                });

                // Show org details modal
                function showOrgDetails(orgData) {
                    document.getElementById('orgDetailsAlias').textContent = orgData.alias || '(No alias)';
                    document.getElementById('orgDetailsType').textContent = orgData.type || 'Unknown';
                    document.getElementById('orgDetailsJson').textContent = JSON.stringify(orgData, null, 2);
                    document.getElementById('orgDetailsModal').style.display = 'flex';
                }

                // Hide org details modal
                function hideOrgDetails() {
                    document.getElementById('orgDetailsModal').style.display = 'none';
                }

                // Copy JSON to clipboard
                function copyJsonToClipboard() {
                    const jsonContent = document.getElementById('orgDetailsJson').textContent;
                    navigator.clipboard.writeText(jsonContent).then(() => {
                        // Show brief success message
                        const copyBtn = document.getElementById('copyJsonBtn');
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                        }, 1000);
                    }).catch(err => {
                        console.error('Failed to copy JSON:', err);
                    });
                }

                // Handle org details modal events
                document.getElementById('closeOrgDetailsBtn').addEventListener('click', hideOrgDetails);
                document.getElementById('closeDetailsBtn').addEventListener('click', hideOrgDetails);
                document.getElementById('copyJsonBtn').addEventListener('click', copyJsonToClipboard);

                // Show delete confirmation dialog
                function showDeleteConfirmation(alias, username) {
                    OrgUtils.logDebug('[VisbalExt.OrgTable] showDeleteConfirmation - alias:', alias, 'username:', username);
                    pendingDeleteOrg = { alias, username };
                    document.getElementById('deleteOrgAlias').textContent = alias || '(No alias)';
                    document.getElementById('deleteOrgUsername').textContent = username || '(No username)';
                    document.getElementById('confirmDialog').style.display = 'flex';
                }

                // Hide delete confirmation dialog
                function hideDeleteConfirmation() {
                    pendingDeleteOrg = null;
                    document.getElementById('confirmDialog').style.display = 'none';
                }

                // Show status message
                function showStatus(message, type = 'loading') {
                    const statusBar = document.getElementById('statusBar');
                    const statusIcon = document.getElementById('statusIcon');
                    const statusMessage = document.getElementById('statusMessage');
                    
                    // Reset classes
                    statusBar.className = 'status-bar';
                    statusIcon.className = 'status-icon';
                    
                    // Set appropriate classes based on type
                    if (type === 'success') {
                        statusBar.classList.add('success');
                        statusIcon.classList.add('success-icon');
                    } else if (type === 'error') {
                        statusBar.classList.add('error');
                        statusIcon.classList.add('error-icon');
                    } else {
                        statusIcon.classList.add('loading-icon');
                    }
                    
                    statusMessage.textContent = message;
                    statusBar.style.display = 'flex';
                    
                    // Auto-hide success/error messages after 3 seconds
                    if (type !== 'loading') {
                        setTimeout(() => {
                            statusBar.style.display = 'none';
                        }, 3000);
                    }
                }

                // Hide status message
                function hideStatus() {
                    document.getElementById('statusBar').style.display = 'none';
                }

                // Handle confirm delete button
                document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
                    if (pendingDeleteOrg) {
                        OrgUtils.logDebug('[VisbalExt.OrgTable] Confirm delete clicked - sending message to extension:', pendingDeleteOrg);
                        showStatus('Deleting scratch org...', 'loading');
                        const deleteMessage = { 
                            command: 'deleteOrg', 
                            alias: pendingDeleteOrg.alias,
                            username: pendingDeleteOrg.username
                        };
                        OrgUtils.logDebug('[VisbalExt.OrgTable] Sending message:', deleteMessage);
                        vscode.postMessage(deleteMessage);
                        hideDeleteConfirmation();
                    } else {
                        OrgUtils.logDebug('[VisbalExt.OrgTable] ERROR: No pending delete org found!');
                    }
                });

                // Handle cancel delete button
                document.getElementById('cancelDeleteBtn').addEventListener('click', hideDeleteConfirmation);

                // Handle escape key to close dialogs
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        if (document.getElementById('confirmDialog').style.display === 'flex') {
                            hideDeleteConfirmation();
                        } else if (document.getElementById('orgDetailsModal').style.display === 'flex') {
                            hideOrgDetails();
                        }
                    }
                });

                // Handle modal overlay clicks to close dialogs
                document.getElementById('confirmDialog').addEventListener('click', (e) => {
                    if (e.target.id === 'confirmDialog') {
                        hideDeleteConfirmation();
                    }
                });

                document.getElementById('orgDetailsModal').addEventListener('click', (e) => {
                    if (e.target.id === 'orgDetailsModal') {
                        hideOrgDetails();
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
                    OrgUtils.logDebug('[VisbalExt.OrgTable] Received message from extension:', message);
                    switch (message.command) {
                        case 'updateOrgsHtml':
                            OrgUtils.logDebug('[VisbalExt.OrgTable] Updating orgs HTML');
                            document.getElementById('orgsTableBody').innerHTML = message.html;
                            // Scroll position is automatically handled by the state-based system
                            break;
                        case 'updateOrgList':
                            OrgUtils.logDebug('[VisbalExt.OrgTable] Updating org list, count:', message.orgs?.length || 0);
                            const orgListChanged = JSON.stringify(currentOrgs) !== JSON.stringify(message.orgs);
                            OrgUtils.logDebug('[VisbalExt.OrgTable] Org list data changed:', orgListChanged);
                            currentOrgs = message.orgs;
                            // Only trigger HTML update if the org list actually changed
                            if (orgListChanged) {
                                OrgUtils.logDebug('[VisbalExt.OrgTable] Org data changed, updating HTML');
                                requestUpdate();
                            } else {
                                OrgUtils.logDebug('[VisbalExt.OrgTable] Org data unchanged, skipping HTML update to preserve scroll');
                            }
                            break;
                        case 'deleteStatus':
                            OrgUtils.logDebug('[VisbalExt.OrgTable] Delete status received - success:', message.success, 'message:', message.message);
                            if (message.success) {
                                showStatus(message.message || 'Scratch org deleted successfully!', 'success');
                            } else {
                                showStatus(message.message || 'Failed to delete scratch org', 'error');
                            }
                            break;
                        default:
                            OrgUtils.logDebug('[VisbalExt.OrgTable] Unknown message command:', message.command);
                    }
                });
            </script>
        `;
    }

    private renderRows(): string {
        if (!this.orgs || this.orgs.length === 0) {
            return `<tr><td colspan="13" class="no-logs-message">No orgs found. Click Refresh to load orgs.</td></tr>`;
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
                <td>
                    <button class="action-button view-button" 
                            data-org-json='${JSON.stringify(org).replace(/'/g, '&#39;')}'
                            title="View org details"
                            aria-label="View org details">
                        <span class="icon view-icon"></span>
                    </button>
                    ${this.isScratchOrg(org) ? `
                        <button class="action-button delete-button" 
                                data-alias="${org.alias || ''}" 
                                data-username="${org.username || ''}"
                                title="Delete scratch org"
                                aria-label="Delete scratch org">
                            <span class="icon trash-icon"></span>
                        </button>
                    ` : ''}
                </td>
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
            return `<tr><td colspan="13" class="no-logs-message">No orgs match the selected filter.</td></tr>`;
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
                <td>
                    <button class="action-button view-button" 
                            data-org-json='${JSON.stringify(org).replace(/'/g, '&#39;')}'
                            title="View org details"
                            aria-label="View org details">
                        <span class="icon view-icon"></span>
                    </button>
                    ${this.isScratchOrg(org) ? `
                        <button class="action-button delete-button" 
                                data-alias="${org.alias || ''}" 
                                data-username="${org.username || ''}"
                                title="Delete scratch org"
                                aria-label="Delete scratch org">
                            <span class="icon trash-icon"></span>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }
} 