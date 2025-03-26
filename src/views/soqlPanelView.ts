import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { SfdxService } from '../services/sfdxService';

export class SoqlPanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalSoql';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;
	private _sfdxService: SfdxService;
    private _orgListCacheService: OrgListCacheService;
    private _currentOrg?: string;
     private _isRefreshing: boolean = false;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._metadataService = new MetadataService();
        this._orgListCacheService = new OrgListCacheService(_context);
		 this._sfdxService = new SfdxService();
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
        this._loadOrgList();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'executeSoqlQuery':
                    this.executeSOQL(message.query);
                    break;
                case 'setSelectedOrg':
                    await this._setSelectedOrg(message.alias);
                    break;
                case 'loadOrgList':
                    await this._loadOrgList();
                    break;
                case 'refreshOrgList':
                    try {
                        await this._refreshOrgList();
                        this._view?.webview.postMessage({
                            command: 'refreshComplete'
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error refreshing org list: ${error.message}`
                        });
                    }
                    break;
            }
        });
    }
	
	private async executeSOQL(soql: string) {
        if (!soql.trim()) {
            this._view?.webview.postMessage({
                command: 'executionResult',
                success: false,
                message: 'Please enter some soql to execute'
            });
            return;
        }

        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
        	this._view?.webview.postMessage({
                command: 'startLoading',
                message: `Executing SOQL ${selectedOrg?.alias}...`
            });
            
           
            if (!selectedOrg?.alias) {
                this._view?.webview.postMessage({
                    command: 'error',
                    message: 'Please select a Salesforce org first'
                });
                return;
            }

            console.log(`[VisbalExt.soqlPanel] executeSOQL Executing on ${selectedOrg?.alias} org SOQL:`, soql);
            const m = `SOQL started on : ${selectedOrg.alias}`
            // Show loading state
            this._view?.webview.postMessage({
                command: m
            });

            const result = await this._sfdxService.executeSoqlQuery(soql);
            console.log('[VisbalExt.soqlPanel] executeSOQL Execution result:', result);

            this._view?.webview.postMessage({
                            command: 'soqlResultsLoaded',
                            results: {
                                records: result
                            }
                        });
                        
             this._view?.webview.postMessage({
                            command: 'stopLoading',
                        });
						
						
        } catch (error: any) {
            console.error('[VisbalExt.soqlPanel] executeSOQL Error executing SOQL:', error);
            this._view?.webview.postMessage({
                command: 'error',
                message: `Error executing query: ${error.message}`
            });
        }
        finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

	//#region LISTBOX
    private async _loadOrgList(): Promise<void> {
        try {
            console.log('[VisbalExt.soqlPanel] _loadOrgList -- Loading org list');
            
            // Try to get from cache first
            const cachedData = await this._orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                console.log('[VisbalExt.soqlPanel] _loadOrgList -- Using cached org list:', cachedData);
                orgs = cachedData.orgs;
            } else {
                console.log('[VisbalExt.soqlPanel] _loadOrgList -- Fetching fresh org list');
                orgs = await OrgUtils.listOrgs();
                // Save to cache
                await this._orgListCacheService.saveOrgList(orgs);
            }

            // Get the selected org
            const selectedOrg = await OrgUtils.getSelectedOrg();
            console.log('[VisbalExt.soqlPanel] _loadOrgList -- Selected org:', selectedOrg);

            console.log('[VisbalExt.soqlPanel] _loadOrgList -- orgs:', orgs);
            console.log('[VisbalExt.soqlPanel] _loadOrgList -- cachedData:', cachedData);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: selectedOrg?.alias
            });

        } catch (error: any) {
            console.error('[VisbalExt.soqlPanel] _loadOrgList -- Error loading org list:', error);

        }  finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    

    /**
     * Refreshes the list of Salesforce orgs
     */
    private async _refreshOrgList(): Promise<void> {
        if (this._isRefreshing) {
            console.log('[VisbalExt.soqlPanel] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }

        try {
            this._isRefreshing = true;
            console.log('[VisbalExt.soqlPanel] _refreshOrgList -- Refreshing org list');
            
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: 'Refreshing organization list...'
            });

            const orgs = await OrgUtils.listOrgs();
            console.log('[VisbalExt.soqlPanel] _refreshOrgList -- orgs Save to the cache');
            // Save to cache
            await this._orgListCacheService.saveOrgList(orgs);
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            console.log('[VisbalExt.soqlPanel] _loadOrgList -- Selected org:', selectedOrg);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: false,
                selectedOrg: selectedOrg?.alias
            });
            
            console.log('[VisbalExt.soqlPanel] _refreshOrgList -- Successfully sent org list to webview');
        } catch (error: any) {
            console.error('[VisbalExt.soqlPanel] _refreshOrgList -- Error refreshing org list:', error);
          
        } finally {
            this._isRefreshing = false;
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            console.log(`[VisbalExt.soqlPanel] _setSelectedOrg -- Setting selected org: ${username}`);
            //this._showLoading(`Setting selected org to ${username}...`);
            
            await OrgUtils.setSelectedOrg(username);
        }
        catch (error: any) {
            console.error('[VisbalExt.soqlPanel] _setSelectedOrg -- Error setting selected org:', error);
            //this._showError(`Failed to set selected org: ${error.message}`);
        } finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }
    //#endregion LISTBOX


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
                    overflow: hidden; /* Prevent double scrollbars */
                }
                
               
                .refresh-button {
                    padding: 6px 8px;
                    color: var(--vscode-button-foreground);
                    background: var(--vscode-button-prominentBackground);
                    border: none;
                    cursor: pointer;
                    width: 100%;
                    text-align: left;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    user-select: none;
                }
                .refresh-button:hover {
                    background: var(--vscode-button-prominentHoverBackground);
                }
                .refresh-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .query-section {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    padding: 0;
                    margin: 8px 0;
                    min-height: 80px; /* Fixed height for query section */
                }
                #soqlInput {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 8px;
                    font-size: var(--vscode-editor-font-size);
                    font-family: monospace;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: none;
                    resize: none;
                    height: 80px; /* Fixed height */
                    outline: none;
                }
                #soqlInput:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
				button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    height: 24px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                #soqlStatus {
                    padding: 2px 5px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }
                .results-container {
                     padding: 10px;
                    display: flex;
                    gap: 10px;
                    background: var(--vscode-editor-background);
                    font-size: 12px;
                    font-family: monospace;
                    position: relative;
                    flex: 1;
                    min-height: 0; /* Important for flex child scrolling */
                    overflow: hidden;
                }
                .table-container {
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    position: relative;
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
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                }
                td {
                    padding: 4px 8px;
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
            <style>
             .loading-container {
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .loading-spinner {
                    width: 18px;
                    height: 18px;
                    border: 2px solid var(--vscode-foreground);
                    border-radius: 50%;
                    border-top-color: transparent;
                    animation: spin 1s linear infinite;
                    margin-right: 8px;
                }
                @keyframes spin {
                    to {transform: rotate(360deg);}
                }
            </style>
            <style>
            .toolbar {
                    padding: 3px 3px;
                    display: flex;
                    align-items: center;
                    background: var(--vscode-editor-background);
                    height: 20px;
                    width: 100%;
                }
                .toolbar-left {
                    display: flex;
                    align-items: center;
                    min-width: 150px;
                    gap: 5px;
                }
                .toolbar-right {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    flex: 1;
                    justify-content: flex-end;
                }
            </style>
            <style>
                .query-history {
                    flex: 1;
                    max-width: 300px;
                }
                #queryHistorySelect {
                    width: 100%;
                    height: 24px;
                    background: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 2px 6px;
                    font-size: 12px;
                }
                #queryHistorySelect:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    outline-offset: -1px;
                }
                #queryHistorySelect option {
                    background: var(--vscode-dropdown-listBackground);
                    color: var(--vscode-dropdown-foreground);
                }
            </style>
            <style>
                // Add styles after the existing button styles
		        .org-selector-container {
		          display: flex;
		          align-items: center;
		          gap: 4px;
		        }
		        
		        .org-selector {
		          padding: 2px 6px;
		          border: 1px solid var(--vscode-dropdown-border);
		          background-color: var(--vscode-dropdown-background);
		          color: var(--vscode-dropdown-foreground);
		          font-size: 12px;
		          width: 180px;
		          height: 24px;
		          cursor: pointer;
		        }
		        
		        .org-selector:hover {
		          border-color: var(--vscode-focusBorder);
		        }
		        
		        .org-selector:focus {
		          outline: none;
		          border-color: var(--vscode-focusBorder);
		        }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <div class="toolbar-left">
                    <div class="query-history">
                        <select id="queryHistorySelect" title="Query History">
                            <option value="">Query History</option>
                        </select>
                    </div>
                    <div id="soqlStatus"></div>
                </div>
                <div class="toolbar-right">
                    <select id="org-selector" class="org-selector" title="Select Salesforce Org">
                        <option value="">Loading orgs...</option>
                    </select>
                    <button id="runSoqlButton" title="Run Query">
                        Execute Query
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path fill="currentColor" d="M3.5 3v10l9-5-9-5z"/>
                        </svg>
                    </button>
                    <button id="copyAsCsvButton" title="Copy as CSV" style="margin-left: 4px;" disabled>
                        Copy CSV
                    </button>
                </div>
            </div>
            <div class="query-section">
                <textarea id="soqlInput" placeholder="Enter SOQL query..." rows="4">SELECT FIELDS(ALL) FROM Account ORDER BY CreatedDate DESC Limit 200</textarea>
            </div>
            <div class="loading-container" id="loadingContainer">
                <div class="loading-spinner"></div>
                <span>Executing query...</span>
            </div>
            <div class="results-container">
                <div class="table-container">
                    <table>
                        <thead id="soqlResultsHeader"></thead>
                        <tbody id="soqlResultsBody"></tbody>
                    </table>
                </div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const soqlInput = document.getElementById('soqlInput');
                    const runSoqlButton = document.getElementById('runSoqlButton');
                    const copyAsCsvButton = document.getElementById('copyAsCsvButton');
                    const soqlStatus = document.getElementById('soqlStatus');
                    const soqlResultsHeader = document.getElementById('soqlResultsHeader');
                    const soqlResultsBody = document.getElementById('soqlResultsBody');
                    const loadingContainer = document.getElementById('loadingContainer');
                    const queryHistorySelect = document.getElementById('queryHistorySelect');
					
					//#region QUERY_HISTORY
                    // Initialize query history from state
                    let queryHistory = [];
                    const state = vscode.getState() || {};
                    if (state.queryHistory) {
                        queryHistory = state.queryHistory;
                        updateQueryHistoryUI();
                    }

                    // Handle query history selection
                    queryHistorySelect.addEventListener('change', () => {
                        const selectedQuery = queryHistorySelect.value;
                        if (selectedQuery) {
                            soqlInput.value = selectedQuery;
                        }
                    });

                    function addToQueryHistory(query) {
                        // Remove the query if it already exists
                        queryHistory = queryHistory.filter(q => q !== query);
                        // Add the new query to the beginning
                        queryHistory.unshift(query);
                        // Keep only the last 20 queries
                        if (queryHistory.length > 20) {
                            queryHistory.pop();
                        }
                        // Save to VS Code state
                        vscode.setState({ ...state, queryHistory });
                        // Update the UI
                        updateQueryHistoryUI();
                    }

                    function updateQueryHistoryUI() {
                        queryHistorySelect.innerHTML = '<option value="">Query History</option>';
                        queryHistory.forEach(query => {
                            const option = document.createElement('option');
                            option.value = query;
                            // Truncate the query for display if it's too long
                            option.textContent = query.length > 50 ? query.substring(0, 47) + '...' : query;
                            option.title = query; // Show full query on hover
                            queryHistorySelect.appendChild(option);
                        });
                    }
                    //#endregion QUERY_HISTORY

                    //#region LISTBOX
                    // Dropdown functionality
                    const orgDropdown = document.getElementById('org-selector');

                    // Toggle dropdown
                    orgDropdown.addEventListener('click', () => {
                        orgDropdown.classList.toggle('show');
                    });

                    
                    // Handle org selection
                    orgDropdown.addEventListener('change', () => {
                        const selectedOrg = orgDropdown.value;
                        if (selectedOrg === '__refresh__') {
                            startLoading('Refreshing org list...');
                            // Reset selection to previously selected value
                            orgDropdown.value = orgDropdown.getAttribute('data-last-selection') || '';
                            // Request org list refresh
                            vscode.postMessage({ command: 'refreshOrgList' });
                            return;
                        }
                        
                        if (selectedOrg) {
                            startLoading('Setting selected org...');
                            console.log('[VisbalExt.htmlTemplate] handleOrgSelection -- Org selected -- Details:', selectedOrg);
                            // Store the selection
                            orgDropdown.setAttribute('data-last-selection', selectedOrg);
                            vscode.postMessage({
                                command: 'setSelectedOrg',
                                alias: selectedOrg
                            });
                        }
                    });
                    //#endregion LISTBOX
        

                    runSoqlButton.addEventListener('click', () => {
                        const query = soqlInput.value.trim();
                        if (!query) {
                            soqlStatus.textContent = 'Please enter a query';
                            return;
                        }
                        // Add to query history
                        addToQueryHistory(query);
                        soqlStatus.textContent = 'Running...';
                        vscode.postMessage({
                            command: 'executeSoqlQuery',
                            query: query
                        });
                    });

                    copyAsCsvButton.addEventListener('click', () => {
                        const headers = Array.from(soqlResultsHeader.querySelectorAll('th')).map(th => th.textContent);
                        const rows = Array.from(soqlResultsBody.querySelectorAll('tr')).map(row => 
                            Array.from(row.querySelectorAll('td')).map(td => td.textContent)
                        );
                        
                        const csvContent = [
                            headers.join(','),
                            ...rows.map(row => row.join(','))
                        ].join('\\n');
                        
                        navigator.clipboard.writeText(csvContent).then(() => {
                            const originalText = soqlStatus.textContent;
                            soqlStatus.textContent = 'Results copied to clipboard as CSV';
                            setTimeout(() => {
                                soqlStatus.textContent = originalText;
                            }, 2000);
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'soqlResultsLoaded':
                                stopLoading();
                                handleSoqlResults(message.results);
                                break;
                            case 'error':
                                stopLoading();
                                soqlStatus.textContent = message.message;
                                soqlResultsHeader.innerHTML = '';
                                soqlResultsBody.innerHTML = '';
                                copyAsCsvButton.disabled = true;
                                break;
                            case 'updateOrgList':
                                updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);

                                break;
                            case 'refreshComplete':
                                refreshButton.innerHTML = '↻ Refresh Org List (Cached)';
                                refreshButton.disabled = false;
                                break;
                             case 'startLoading':
                                startLoading(message.message);
                                break;
                             case 'stopLoading':
                                stopLoading();
                                break;
                        }
                    });


                    function startLoading(m) {
						 loadingContainer.style.display = 'flex';
                        soqlResultsHeader.innerHTML = '';
                        soqlResultsBody.innerHTML = '';
                        soqlStatus.textContent = m;
                        runSoqlButton.disabled = true;
					}

                    function stopLoading() {
						// Hide loading state
						loadingContainer.style.display = 'none';
						runSoqlButton.disabled = false;
                         soqlStatus.textContent = '';
					}

                    function handleSoqlResults(results) {
                        if (!results || !results.records || results.records.length === 0) {
                            soqlStatus.textContent = 'No results';
                            soqlResultsHeader.innerHTML = '';
                            soqlResultsBody.innerHTML = '';
                            copyAsCsvButton.disabled = true;
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
                        copyAsCsvButton.disabled = false;
                    }

                    //#region CACHE
                            
                    // Cache handling functions
                    const CACHE_KEY = 'visbal-org-cache';
                    
                    async function saveOrgCache(orgs) {
                        try {
                            vscode.postMessage({
                            command: 'saveOrgCache',
                            data: {
                                orgs,
                                timestamp: new Date().getTime()
                            }
                            });
                        } catch (error) {
                            console.error('[VisbalExt.htmlTemplate] Failed to save org cache:', error);
                        }
                    }
            
                    async function loadOrgCache() {
                        try {
                            vscode.postMessage({
                            command: 'loadOrgCache'
                            });
                        } catch (error) {
                            console.error('[VisbalExt.htmlTemplate] Failed to load org cache:', error);
                            return null;
                        }
                    }
                    //#endregion CACHE
                    
                     //#region LISTBOX

                    function updateOrgListUI(orgs, fromCache = false, selectedOrg = null) {
                       // _updateOrgListUI(orgDropdown, orgs, fromCache , selectedOrg);
                        console.log('[VisbalExt.soqPanel] updateOrgListUI Updating org list UI with data:', orgs);
                        console.log('[VisbalExt.soqPanel] updateOrgListUI Selected org:', selectedOrg);
                        
                        // Clear existing options
                        orgDropdown.innerHTML = '';
                        // Add refresh option at the top
                        const refreshOption = document.createElement('option');
                        refreshOption.value = '__refresh__';
                        refreshOption.textContent = fromCache ? '↻ Refresh Org List (Cached)' : '↻ Refresh Org List';
                        refreshOption.style.fontStyle = 'italic';
                        refreshOption.style.backgroundColor = 'var(--vscode-dropdown-background)';
                        orgDropdown.appendChild(refreshOption);
                
                        // Add a separator
                        const separator = document.createElement('option');
                        separator.disabled = true;
                        separator.textContent = '──────────────';
                        orgDropdown.appendChild(separator);
                
                        // Helper function to add section if it has items
                        const addSection = (items, sectionName) => {
                            if (items && items.length > 0) {
                            const optgroup = document.createElement('optgroup');
                            optgroup.label = sectionName;
                            
                            items.forEach(org => {
                                const option = document.createElement('option');
                                option.value = org.alias;
                                option.textContent = org.alias || org.username;
                                if (org.isDefault) {
                                option.textContent += ' (Default)';
                                }
                                // Select the option if it matches the selected org
                                option.selected = selectedOrg && org.alias === selectedOrg;
                                optgroup.appendChild(option);
                            });
                            
                            orgDropdown.appendChild(optgroup);
                            return true;
                            }
                            return false;
                        };
                
                        let hasAnyOrgs = false;
                        hasAnyOrgs = addSection(orgs.devHubs, 'Dev Hubs') || hasAnyOrgs;
                        hasAnyOrgs = addSection(orgs.nonScratchOrgs, 'Non-Scratch Orgs') || hasAnyOrgs;
                        hasAnyOrgs = addSection(orgs.sandboxes, 'Sandboxes') || hasAnyOrgs;
                        hasAnyOrgs = addSection(orgs.scratchOrgs, 'Scratch Orgs') || hasAnyOrgs;
                        hasAnyOrgs = addSection(orgs.other, 'Other') || hasAnyOrgs;
                
                        if (!hasAnyOrgs) {
                            const option = document.createElement('option');
                            option.value = '';
                            option.textContent = 'No orgs found';
                            orgDropdown.appendChild(option);
                        }
                
                        // If this was a fresh fetch (not from cache), update the cache
                        if (!fromCache) {
                            saveOrgCache(orgs);
                        }
                
                        // Store the selection
                        if (selectedOrg) {
                            orgDropdown.setAttribute('data-last-selection', selectedOrg);
                        }

                    }
                



	                // Handle org selection
	                orgDropdown.addEventListener('change', () => {
	                    const selectedOrg = orgDropdown.value;
	                    if (selectedOrg === '__refresh__') {
	                        // Reset selection to previously selected value
	                        orgDropdown.value = orgDropdown.getAttribute('data-last-selection') || '';
	                        // Request org list refresh
	                        vscode.postMessage({ command: 'refreshOrgList' });
	                        return;
	                    }
	                    
	                    if (selectedOrg) {
	                        console.log('[VisbalExt.htmlTemplate] handleOrgSelection -- Org selected -- Details:', selectedOrg);
	                        // Store the selection
	                        orgDropdown.setAttribute('data-last-selection', selectedOrg);
	                        vscode.postMessage({
                                command: 'setSelectedOrg',
                                alias: selectedOrg
	                        });
	                    }
	                });
	                //#endregion LISTBOX
	                
                })();
            </script>
        </body>
        </html>`;
    }
} 