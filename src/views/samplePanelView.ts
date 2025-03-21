import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { SfdxService } from '../services/sfdxService';

export class SamplePanelView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-sample';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;
    private _sfdxService: SfdxService;
	private _orgListCacheService: OrgListCacheService;
    private _currentOrg?: string;
     private _isRefreshing: boolean = false;

    constructor(private readonly _context: vscode.ExtensionContext) {
        console.log('[VisbalExt.SamplePanelView] Initializing SamplePanelView');
        this._metadataService = new MetadataService();
        this._orgListCacheService = new OrgListCacheService(_context);
        this._sfdxService = new SfdxService();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log('[VisbalExt.SamplePanelView] resolveWebviewView -- Resolving webview view');
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        // Set the HTML content
        webviewView.webview.html = this._getWebviewContent();

         // Load orgs when view is initialized
         this._loadOrgList();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log(`[VisbalExt.SamplePanelView] resolveWebviewView -- Received message: ${message.command}`);
            
            switch (message.command) {
                case 'executeApex':
                    await this.executeApex(message.code);
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

    private async executeApex(code: string) {
        if (!code.trim()) {
            this._view?.webview.postMessage({
                command: 'executionResult',
                success: false,
                message: 'Please enter some code to execute'
            });
            return;
        }

        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
			this._view?.webview.postMessage({
                command: 'startLoading',
                message: `Executing Apex on ${selectedOrg?.alias} ...`
            });
			
			
            if (!selectedOrg?.alias) {
                this._view?.webview.postMessage({
                    command: 'error',
                    success: false,
                    message: 'Please select a Salesforce org first'
                });
                return;
            }

            console.log(`[VisbalExt.SamplePanelView] Executing on ${selectedOrg?.alias} org Apex code:`, code);
            const m = `Apex started on : ${selectedOrg?.alias}`
            // Show loading state
            this._view?.webview.postMessage({
                command: 'executionResult',
                success: false,
                message: m
            });

            const result = await this._sfdxService.executeAnonymousApex(code);
            console.log('[VisbalExt.SamplePanelView] Execution result:', result);

            this._view?.webview.postMessage({
                command: 'executionResult',
                success: result.success,
                logs: result.logs,
                compileProblem: result.compileProblem,
                exceptionMessage: result.exceptionMessage,
                exceptionStackTrace: result.exceptionStackTrace
            });
			
			
        } catch (error: any) {
            console.error('[VisbalExt.SamplePanelView] Error executing Apex:', error);
            this._view?.webview.postMessage({
                command: 'error',
                success: false,
                message: `Error executing Apex: ${error.message}`
            });
        }
		finally {
            this._view?.webview.postMessage({
                command: 'stopLoading',
                isLoading: false
            });
        }
    }

    //#region LISTBOX
    private async _loadOrgList(): Promise<void> {
        try {
            console.log('[VisbalExt.SamplePanelView] _loadOrgList -- Loading org list');
            
            // Try to get from cache first
            const cachedData = await this._orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                console.log('[VisbalExt.SamplePanelView] _loadOrgList -- Using cached org list:', cachedData);
                orgs = cachedData.orgs;
            } else {
                console.log('[VisbalExt.SamplePanelView] _loadOrgList -- Fetching fresh org list');
                orgs = await OrgUtils.listOrgs();
                // Save to cache
                await this._orgListCacheService.saveOrgList(orgs);
            }

            // Get the selected org
            const selectedOrg = await OrgUtils.getSelectedOrg();
            console.log('[VisbalExt.SamplePanelView] _loadOrgList -- Selected org:', selectedOrg);

            console.log('[VisbalExt.SamplePanelView] _loadOrgList -- orgs:', orgs);
            console.log('[VisbalExt.SamplePanelView] _loadOrgList -- cachedData:', cachedData);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: selectedOrg?.alias
            });

        } catch (error: any) {
            console.error('[VisbalExt.SamplePanelView] _loadOrgList -- Error loading org list:', error);

        }
		finally {
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
            console.log('[VisbalExt.SamplePanelView] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }

        try {
            this._isRefreshing = true;
            console.log('[VisbalExt.SamplePanelView] _refreshOrgList -- Refreshing org list');
            
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: 'Refreshing organization list...'
            });

            const orgs = await OrgUtils.listOrgs();
            console.log('[VisbalExt.SamplePanelView] _refreshOrgList -- orgs Save to the cache');
            // Save to cache
            await this._orgListCacheService.saveOrgList(orgs);
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            console.log('[VisbalExt.SamplePanelView] _loadOrgList -- Selected org:', selectedOrg);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: false,
                selectedOrg: selectedOrg?.alias
            });
            
            console.log('[VisbalExt.SamplePanelView] _refreshOrgList -- Successfully sent org list to webview');
        } catch (error: any) {
            console.error('[VisbalExt.SamplePanelView] _refreshOrgList -- Error refreshing org list:', error);
          
        } finally {
            this._isRefreshing = false;
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            console.log(`[VisbalExt.SamplePanelView] _setSelectedOrg -- Setting selected org: ${username}`);
            //this._showLoading(`Setting selected org to ${username}...`);
            
            await OrgUtils.setSelectedOrg(username);
        }
        catch (error: any) {
            console.error('[VisbalExt.SamplePanelView] _setSelectedOrg -- Error setting selected org:', error);
            //this._showError(`Failed to set selected org: ${error.message}`);
        }  finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }
    //#endregion LISTBOX
    
	
	private _getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <title>Visbal Sample</title>
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
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 8px;
                    background: var(--vscode-editor-background);
                }
                .editor-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 4px 8px;
                }
                .tabs {
                    display: flex;
                    padding: 0;
                    background: var(--vscode-tab-inactiveBackground);
                    border-bottom: 1px solid var(--vscode-tab-border);
                }
                .tab {
                    padding: 4px 12px;
                    cursor: pointer;
                    border: none;
                    background: none;
                    color: var(--vscode-tab-inactiveForeground);
                    border-bottom: 2px solid transparent;
                    font-size: 12px;
                }
                .tab.active {
                    background: var(--vscode-tab-activeBackground);
                    color: var(--vscode-tab-activeForeground);
                    border-bottom: 2px solid var(--vscode-focusBorder);
                }
                .tab:hover:not(.active) {
                    background: var(--vscode-tab-hoverBackground);
                }
                .content {
                    flex: 1;
                    display: none;
                    height: calc(100vh - 30px);
                    overflow: hidden;
                }
                .content.active {
                    display: flex;
                    flex-direction: column;
                }
                .editor-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow: hidden;
                    padding: 8px;
                }
                .textarea-container {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                }
                .textarea-label {
                    color: var(--vscode-foreground);
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                textarea {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: monospace;
                    font-size: var(--vscode-editor-font-size);
                    resize: none;
                    flex: 1;
                    min-height: 0;
                    border-radius: 2px;
                    overflow-y: auto;
                }
                textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .char-count {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    background: var(--vscode-input-background);
                    padding: 2px 4px;
                    border-radius: 2px;
                    opacity: 0.8;
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

                #statusBar {
                    padding: 2px 5px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }

                .output-container {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    overflow-y: auto;
                    height: 100%;
                    white-space: pre-wrap;
                }
                .success {
                    color: var(--vscode-testing-iconPassed);
                }
                .error {
                    color: var(--vscode-testing-iconFailed);
                }
                .loading {
                    color: var(--vscode-foreground);
                    font-style: italic;
                }
                .codicon {
                    font-family: codicon;
                    font-size: 16px;
                    line-height: 16px;
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
                    }
                    .toolbar-right {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        margin-left: auto;
                    }
            </>
			<style>
                // Add styles after the existing button styles
		        .org-selector-container {
		          display: flex;
		          align-items: center;
		          gap: 4px;
		          margin: 0 8px;
		        }
		        
		        .org-selector {
		          padding: 4px 8px;
		          border-radius: 4px;
		          border: 1px solid var(--vscode-dropdown-border);
		          background-color: var(--vscode-dropdown-background);
		          color: var(--vscode-dropdown-foreground);
		          font-size: 12px;
		          min-width: 200px;
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
            <div class="container">
                <div class="tabs">
                    <button class="tab active" data-tab="editor">Editor</button>
                    <button class="tab" data-tab="results">Results</button>
                </div>
                <div id="editorContent" class="content active">
                    <div class="editor-container">
                        <div class="editor-header">
                            <div class="toolbar">
                                <div class="toolbar-left">
                                    <div id="statusBar"></div>
                                </div>
                                <div class="toolbar-right">
                                    <select id="org-selector" class="org-selector" title="Select Salesforce Org">
                                        <option value="">Loading orgs...</option>
                                        </select>
                                    <button id="executeButton" onclick="executeApex()" title="Execute Apex Code">
                                        Execute Code
                                        <svg width="16" height="16" viewBox="0 0 16 16">
                                            <path fill="currentColor" d="M3.5 3v10l9-5-9-5z"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                  
                            
				
                        <div class="textarea-container">
                            <textarea 
                                id="apexTextarea" 
                                placeholder="Type something here..."
                                aria-label="Sample text input area"
                                maxlength="1000"
                            >System.debug('Hello World');</textarea>
                            <div class="char-count">0 / 1000 characters</div>
                        </div>
                    </div>
					<div class="loading-container" id="loadingContainer">
						<div class="loading-spinner"></div>
						<span>Executing apex...</span>
					</div>
                </div>
                <div id="resultsContent" class="content">
                    <div id="outputContainer" class="output-container">
                        Execute Apex code to see results here
                    </div>
                </div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                     const statusBar = document.getElementById('statusBar');
                    const textarea = document.getElementById('apexTextarea');
                    const charCount = document.querySelector('.char-count');
                    const executeButton = document.getElementById('executeButton');
                    const outputContainer = document.getElementById('outputContainer');
                    const tabs = document.querySelectorAll('.tab');
                    const contents = document.querySelectorAll('.content');
					const loadingContainer = document.getElementById('loadingContainer');
					
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
                    
                    // Tab switching
                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            const tabId = tab.getAttribute('data-tab');
                            
                            // Update tab states
                            tabs.forEach(t => t.classList.remove('active'));
                            tab.classList.add('active');
                            
                            // Update content states
                            contents.forEach(content => {
                                if (content.id === tabId + 'Content') {
                                    content.classList.add('active');
                                } else {
                                    content.classList.remove('active');
                                }
                            });
                        });
                    });

                    // Switch to results tab when executing
                    function switchToResultsTab() {
                        tabs.forEach(tab => {
                            if (tab.getAttribute('data-tab') === 'results') {
                                tab.click();
                            }
                        });
                    }
                    
                    // Update character count
                    function updateCharCount() {
                        const length = textarea.value.length;
                        charCount.textContent = \`\${length} / 1000 characters\`;
                    }
                    
                    // Initialize character count
                    updateCharCount();
                    
                    // Handle textarea input
                    textarea.addEventListener('input', (e) => {
                        updateCharCount();
                    });
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'executionStarted':
                                executeButton.disabled = true;
                                outputContainer.className = 'output-container';
                                outputContainer.innerHTML = '<div class="loading">Executing Apex code...</div>';
                                switchToResultsTab();
                                   
                                break;
                                
                            case 'executionResult':
								stopLoading();
                                executeButton.disabled = false;
                                let output = '';
                                
                                if (message.success) {
                                    output += '<div class="success">✓ Execution successful</div>\\n';
                                    if (message.logs) {
                                        output += '\\nLogs:\\n' + message.logs;
                                    }
                                } else {
                                    output += '<div class="error">✗ Execution failed</div>\\n';
                                    if (message.compileProblem) {
                                        output += '\\nCompile Error:\\n' + message.compileProblem;
                                    }
                                    if (message.exceptionMessage) {
                                        output += '\\nException:\\n' + message.exceptionMessage;
                                    }
                                    if (message.exceptionStackTrace) {
                                        output += '\\nStack Trace:\\n' + message.exceptionStackTrace;
                                    }
                                    if (message.message) {
                                        output += '\\nError:\\n' + message.message;
                                    }
                                }
                                statusBar.textContent = message.message;
                                outputContainer.innerHTML = output;
                                break;
							case 'updateOrgList':
                                updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);

                                break;
                            case 'refreshComplete':
							    stopLoading();
                                refreshButton.innerHTML = '↻ Refresh Org List (Cached)';
                                refreshButton.disabled = false;
                                break;
                            case 'error':
								stopLoading();
                                statusBar.textContent = message.message;
                                console.error('[VisbalExt.htmlTemplate] Error:', message.message);
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
               
                        statusBar.textContent = m;
                        executeButton.disabled = true;
					}
					
					function stopLoading() {
						// Hide loading state
						loadingContainer.style.display = 'none';
                        statusBar.textContent = '';
						executeButton.disabled = false;
					}
                    
                    // Execute Apex code
                    window.executeApex = function() {
						// Show loading state
                        startLoading('Executing apex...');
               
						
                        executeButton.disabled = true;
                        
						
                        const code = textarea.value;
                        vscode.postMessage({
                            command: 'executeApex',
                            code: code
                        });
                    };
					
					
					
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
					
					
					
                })();
            </script>
        </body>
        </html>`;
    }
} 