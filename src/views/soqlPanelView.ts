import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgGroups, SalesforceOrg } from '../utils/orgUtils';

export class SoqlPanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalSoql';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;
    private _orgListCacheService: OrgListCacheService;
    private _currentOrg?: string;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._metadataService = new MetadataService();
        this._orgListCacheService = new OrgListCacheService(_context);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this._getWebviewContent();

        // Load orgs when view is initialized
        this._loadOrgs();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'executeSoqlQuery':
                    try {
                        const results = await this._metadataService.executeSoqlQuery(message.query);
                        this._view?.webview.postMessage({
                            command: 'soqlResultsLoaded',
                            results: {
                                records: results
                            }
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error executing query: ${error.message}`
                        });
                    }
                    break;
                case 'selectOrg':
                    await this._selectOrg(message.orgId);
                    break;
            }
        });
    }

    private async _loadOrgs() {
        try {
            // Try to get orgs from cache first
            const cachedOrgList = await this._orgListCacheService.getCachedOrgList();
            if (cachedOrgList) {
                const allOrgs = [
                    ...(cachedOrgList.orgs.nonScratchOrgs || []),
                    ...(cachedOrgList.orgs.sandboxes || []),
                    ...(cachedOrgList.orgs.scratchOrgs || []),
                    ...(cachedOrgList.orgs.other || [])
                ];

                this._view?.webview.postMessage({
                    command: 'updateOrgs',
                    orgs: allOrgs
                });

                // If there's a default org, select it
                const defaultOrg = allOrgs.find(org => org.isDefault);
                if (defaultOrg) {
                    await this._selectOrg(defaultOrg.username);
                }
            }

            // Get fresh list of orgs from sfdx
            const orgsResult = await this._metadataService.listOrgs() as unknown as { result: { devHubs: SalesforceOrg[], sandboxes: SalesforceOrg[], scratchOrgs: SalesforceOrg[], nonScratchOrgs: SalesforceOrg[], other: SalesforceOrg[] } };
            const orgs: OrgGroups = {
                devHubs: orgsResult.result.devHubs || [],
                sandboxes: orgsResult.result.sandboxes || [],
                scratchOrgs: orgsResult.result.scratchOrgs || [],
                nonScratchOrgs: orgsResult.result.nonScratchOrgs || [],
                other: orgsResult.result.other || []
            };
            
            // Update cache with new orgs
            await this._orgListCacheService.saveOrgList(orgs);
            
            // Flatten the org groups for the webview
            const allOrgs = [
                ...(orgs.nonScratchOrgs || []),
                ...(orgs.sandboxes || []),
                ...(orgs.scratchOrgs || []),
                ...(orgs.other || [])
            ];

            // Send org list to webview
            this._view?.webview.postMessage({
                command: 'updateOrgs',
                orgs: allOrgs
            });

            // If there's a default org and we haven't selected one from cache, select it
            if (!this._currentOrg) {
                const defaultOrg = allOrgs.find(org => org.isDefault);
                if (defaultOrg) {
                    await this._selectOrg(defaultOrg.username);
                }
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error loading orgs: ${error.message}`);
        }
    }

    private async _selectOrg(username: string) {
        try {
            await this._metadataService.setDefaultOrg(username);
            this._currentOrg = username;
            vscode.window.showInformationMessage(`Successfully switched to org: ${username}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error selecting org: ${error.message}`);
        }
    }

    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                }
                .toolbar {
                    padding: 5px;
                    display: flex;
                    gap: 5px;
                    align-items: center;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    height: 28px;
                    width: 100%;
                    box-sizing: border-box;
                    justify-content: space-between;
                }
                .toolbar-left {
                    display: flex;
                    align-items: center;
                    min-width: 150px;
                }
                .toolbar-right {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    flex: 1;
                    justify-content: flex-end;
                }
                .dropdown {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .dropdown-button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-button-border);
                    padding: 2px 6px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 11px;
                    height: 24px;
                    min-width: 120px;
                    max-width: 200px;
                }
                .dropdown-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .dropdown-content {
                    display: none;
                    position: absolute;
                    background: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    min-width: 160px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    z-index: 1;
                }
                .dropdown-content.show {
                    display: block;
                }
                .dropdown-item {
                    padding: 4px 8px;
                    color: var(--vscode-dropdown-foreground);
                    cursor: pointer;
                    font-size: 11px;
                }
                .dropdown-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                #soqlInput {
                    flex: 1;
                    padding: 5px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    resize: vertical;
                    min-height: 100px;
                    height: auto;
                }
                #runSoqlButton {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    border-radius: 2px;
                    padding: 0;
                }
                #runSoqlButton:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                #soqlStatus {
                    padding: 2px 5px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }
                .query-section {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .results-container {
                     padding: 10px;
                    display: flex;
                    gap: 10px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-size: 12px;
                    font-family: var(--vscode-font-family);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                }
                thead {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    background: var(--vscode-editor-background);
                }
                th {
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    text-align: left;
                    padding: 4px 8px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    white-space: nowrap;
                }
                td {
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-foreground);
                    white-space: nowrap;
                }
                tr {
                    background-color: var(--vscode-list-inactiveSelectionBackground);
                }
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <div class="toolbar-left">
                    <div class="dropdown">
                        <button class="dropdown-button" id="orgSelector">
                            <span id="selectedOrg">Loading orgs...</span>
                            <span class="codicon">▼</span>
                        </button>
                        <div class="dropdown-content" id="orgDropdown">
                            <!-- Org items will be populated here -->
                        </div>
                    </div>
                </div>
                <div class="toolbar-right">
                    <button id="runSoqlButton" title="Run Query">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path fill="currentColor" d="M3.5 3v10l9-5-9-5z"/>
                        </svg>
                    </button>
                    <div id="soqlStatus"></div>
                </div>
            </div>
            <div class="query-section">
                <textarea id="soqlInput" placeholder="Enter SOQL query..." rows="4">SELECT FIELDS(ALL) FROM Account ORDER BY CreatedDate DESC Limit 200</textarea>
            </div>
            <div class="results-container">
                <table>
                    <thead id="soqlResultsHeader"></thead>
                    <tbody id="soqlResultsBody"></tbody>
                </table>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const soqlInput = document.getElementById('soqlInput');
                    const runSoqlButton = document.getElementById('runSoqlButton');
                    const soqlStatus = document.getElementById('soqlStatus');
                    const soqlResultsHeader = document.getElementById('soqlResultsHeader');
                    const soqlResultsBody = document.getElementById('soqlResultsBody');

                    // Dropdown functionality
                    const orgSelector = document.getElementById('orgSelector');
                    const orgDropdown = document.getElementById('orgDropdown');
                    const selectedOrg = document.getElementById('selectedOrg');

                    // Toggle dropdown
                    orgSelector.addEventListener('click', () => {
                        orgDropdown.classList.toggle('show');
                    });

                    // Close dropdown when clicking outside
                    window.addEventListener('click', (event) => {
                        if (!event.target.matches('.dropdown-button') && !event.target.matches('#selectedOrg')) {
                            orgDropdown.classList.remove('show');
                        }
                    });

                    runSoqlButton.addEventListener('click', () => {
                        const query = soqlInput.value.trim();
                        if (!query) {
                            soqlStatus.textContent = 'Please enter a query';
                            return;
                        }
                        soqlStatus.textContent = 'Running...';
                        vscode.postMessage({
                            command: 'executeSoqlQuery',
                            query: query
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'soqlResultsLoaded':
                                handleSoqlResults(message.results);
                                break;
                            case 'error':
                                soqlStatus.textContent = message.message;
                                soqlResultsHeader.innerHTML = '';
                                soqlResultsBody.innerHTML = '';
                                break;
                            case 'updateOrgs':
                                updateOrgList(message.orgs);
                                break;
                        }
                    });

                    function handleSoqlResults(results) {
                        if (!results || !results.records || results.records.length === 0) {
                            soqlStatus.textContent = 'No results';
                            soqlResultsHeader.innerHTML = '';
                            soqlResultsBody.innerHTML = '';
                            return;
                        }

                        const columns = Object.keys(results.records[0]).filter(col => col !== 'attributes');
                        soqlResultsHeader.innerHTML = '<tr>' + columns.map(col => 
                            '<th>' + col + '</th>'
                        ).join('') + '</tr>';

                        soqlResultsBody.innerHTML = results.records.map(record => 
                            '<tr>' + columns.map(col => 
                                '<td>' + (record[col] || '') + '</td>'
                            ).join('') + '</tr>'
                        ).join('');

                        soqlStatus.textContent = results.records.length + ' rows';
                    }

                    function updateOrgList(orgs) {
                        orgDropdown.innerHTML = '';
                        orgs.forEach(org => {
                            const item = document.createElement('div');
                            item.className = 'dropdown-item';
                            item.textContent = org.alias || org.username;
                            item.addEventListener('click', () => {
                                selectedOrg.textContent = org.alias || org.username;
                                orgDropdown.classList.remove('show');
                                vscode.postMessage({
                                    command: 'selectOrg',
                                    orgId: org.username
                                });
                            });
                            orgDropdown.appendChild(item);
                        });
                    }
                })();
            </script>
        </body>
        </html>`;
    }
} 