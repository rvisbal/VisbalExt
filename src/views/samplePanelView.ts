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
    private _apexFiles: string[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {
        OrgUtils.logDebug('[VisbalExt.SamplePanelView] Initializing SamplePanelView');
        this._metadataService = new MetadataService();
        this._orgListCacheService = new OrgListCacheService(_context);
        this._sfdxService = new SfdxService();
        this._loadApexFiles();
    }

    private async _loadApexFiles() {
        try {
            // Get files from both locations
            const [templateFiles] = await Promise.all([
                vscode.workspace.findFiles('.visbal/templates/apex/*.apex')
            ]);

            // If src/apex directory doesn't exist or is empty, copy template files
            if (templateFiles.length === 0) {
                OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadApexFiles -- No template files found, copying template files');
            } else {
                this._apexFiles = templateFiles.map(file => file.fsPath);
            }

            // Sort files alphabetically by filename
            this._apexFiles.sort((a, b) => {
                const fileNameA = a.split(/[\\/]/).pop()?.toLowerCase() || '';
                const fileNameB = b.split(/[\\/]/).pop()?.toLowerCase() || '';
                return fileNameA.localeCompare(fileNameB);
            });

            if (this._view) {
                this._view.webview.postMessage({
                    command: 'updateApexFileList',
                    files: this._apexFiles.map(path => {
                        const fileName = path.split(/[\\/]/).pop() || '';
                        return { path, name: fileName };
                    })
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] Error loading apex files:', error);
        }
    }

    private async _copyTemplateFiles() {
        try {
            /*
            // Ensure src/apex directory exists
            const srcApexUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'src', 'apex');
            await vscode.workspace.fs.createDirectory(srcApexUri);

            // Get template files
            const templateFiles = await vscode.workspace.findFiles('.visbal/templates/apex/*.apex');
            
            // Copy each template file to src/apex
            for (const templateFile of templateFiles) {
                const fileName = templateFile.path.split(/[\\/]/).pop()!;
                const targetUri = vscode.Uri.joinPath(srcApexUri, fileName);
                
                // Check if file already exists
                try {
                    await vscode.workspace.fs.stat(targetUri);
                    OrgUtils.logDebug(`[VisbalExt.SamplePanelView] File already exists: ${fileName}`);
                    continue;
                } catch {
                    // File doesn't exist, proceed with copy
                    const content = await vscode.workspace.fs.readFile(templateFile);
                    await vscode.workspace.fs.writeFile(targetUri, content);
                    OrgUtils.logDebug(`[VisbalExt.SamplePanelView] Copied template file: ${fileName}`);
                }
            }
            */
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] Error copying template files:', error);
            throw error;
        }
    }

    private async _updateTemplates() {
        try {
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] Updating template files');
            await this._copyTemplateFiles();
            await this._loadApexFiles();
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'templatesUpdated',
                    message: 'Templates updated successfully'
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] Error updating templates:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error updating templates: ${error.message}`
                });
            }
        }
    }

    private async _loadApexFileContent(filePath: string) {
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            //OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadApexFileContent -- Content:', content.toString());
            return content.toString();
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] Error reading file:', error);
            throw error;
        }
    }

    private async _saveApexFileContent(filePath: string, content: string) {
        try {
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] Saving file:', filePath);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(filePath),
                Buffer.from(content, 'utf8')
            );
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'fileSaved',
                    message: 'File saved successfully'
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] Error saving file:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error saving file: ${error.message}`
                });
            }
            throw error;
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        OrgUtils.logDebug('[VisbalExt.SamplePanelView] resolveWebviewView -- Resolving webview view');
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
         // Load apex files
         this._loadApexFiles();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            OrgUtils.logDebug(`[VisbalExt.SamplePanelView] resolveWebviewView -- Received message: ${message.command}`);
            
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
                case 'loadApexFile':
                    try {
                        OrgUtils.logDebug('[VisbalExt.SamplePanelView] loadApexFile -- Loading file:', message.filePath);
                        const content = await this._loadApexFileContent(message.filePath);
                        OrgUtils.logDebug('[VisbalExt.SamplePanelView] loadApexFile -- Content:', content.length);
                        this._view?.webview.postMessage({
                            command: 'apexFileContent',
                            content: content
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error loading file: ${error.message}`
                        });
                    }
                    break;
                case 'updateTemplates':
                    await this._updateTemplates();
                    break;
                case 'saveApexFile':
                    try {
                        await this._saveApexFileContent(message.filePath, message.content);
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error saving file: ${error.message}`
                        });
                    }
                    break;
            }
        });
    }

    private async executeApex(code: string) {
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: `Executing Apex on ${selectedOrg?.alias}...`
            });
            
            if (!selectedOrg?.alias) {
                this._view?.webview.postMessage({
                    command: 'error',
                    message: 'Please select a Salesforce org first'
                });
                return;
            }

            OrgUtils.logDebug(`[VisbalExt.SamplePanelView] executeAnonymousApex -- Executing on ${selectedOrg?.alias} org code:`, code);

            const result = await this._sfdxService.executeAnonymousApex(code);
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] Execution result:', result);

            if (result.success) {
                // First send the execution result to update the results content
                this._view?.webview.postMessage({
                    command: 'executionResult',
                    success: result.success,
                    logs: result.logs,
                    compileProblem: result.compileProblem,
                    exceptionMessage: result.exceptionMessage,
                    exceptionStackTrace: result.exceptionStackTrace
                });
                
                // Then send success message to trigger tab switch
                this._view?.webview.postMessage({
                    command: 'success',
                    message: 'Code executed successfully'
                });
            } else {
                let errorMessage = 'Error executing code:\n';
                if (result.compileProblem) {
                    errorMessage += `Compilation Error: ${result.compileProblem}\n`;
                }
                if (result.exceptionMessage) {
                    errorMessage += `Runtime Error: ${result.exceptionMessage}\n`;
                }
                if (result.exceptionStackTrace) {
                    errorMessage += `Stack Trace:\n${result.exceptionStackTrace}`;
                }
                
                this._view?.webview.postMessage({
                    command: 'error',
                    message: errorMessage.trim()
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] executeAnonymousApex Error:', error);
            this._view?.webview.postMessage({
                command: 'error',
                message: `Error executing code: ${error.message}`
            });
        } finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    //#region LISTBOX
    private async _loadOrgList(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- Loading org list');
            
            // Try to get from cache first
            const cachedData = await this._orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- Using cached org list:cachedData');
                orgs = cachedData.orgs;
            } else {
                OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- Fetching fresh org list');
                orgs = await OrgUtils.listOrgs();
                // Save to cache
                await this._orgListCacheService.saveOrgList(orgs);
            }

            // Get the selected org
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- Selected org:', selectedOrg);

            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- orgs:', orgs);
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- cachedData:', cachedData);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: selectedOrg?.alias
            });

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] _loadOrgList -- Error loading org list:', error);

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
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }

        try {
            this._isRefreshing = true;
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _refreshOrgList -- Refreshing org list');
            
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: 'Refreshing organization list...'
            });

            const orgs = await OrgUtils.listOrgs();
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _refreshOrgList -- orgs Save to the cache');
            // Save to cache
            await this._orgListCacheService.saveOrgList(orgs);
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _loadOrgList -- Selected org:', selectedOrg);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: false,
                selectedOrg: selectedOrg?.alias
            });
            
            OrgUtils.logDebug('[VisbalExt.SamplePanelView] _refreshOrgList -- Successfully sent org list to webview');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] _refreshOrgList -- Error refreshing org list:', error);
          
        } finally {
            this._isRefreshing = false;
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.SamplePanelView] _setSelectedOrg -- Setting selected org: ${username}`);
            //this._showLoading(`Setting selected org to ${username}...`);
            
            await OrgUtils.setSelectedOrg(username);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.SamplePanelView] _setSelectedOrg -- Error setting selected org:', error);
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
            <title>Visbal Apex</title>
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
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: var(--vscode-editor-font-size, 14px);
                    line-height: 1.4;
                    resize: none;
                    flex: 1;
                    min-height: 0;
                    border-radius: 2px;
                    overflow-y: auto;
                    white-space: pre;
                    tab-size: 4;
                    -webkit-text-fill-color: var(--vscode-input-foreground);
                    opacity: 1;
                    cursor: text;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }
                textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                textarea:read-write {
                    -webkit-user-modify: read-write !important;
                    -moz-user-modify: read-write !important;
                    -ms-user-modify: read-write !important;
                    user-modify: read-write !important;
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
                    margin-right: 1px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                button:last-child {
                    margin-right: 0;
                }
                .toolbar-right button {
                    margin-left: 1px;
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
            <style>
                .fileSelector-container {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin: 0 8px;
                }
                
                .fileSelector {
                    padding: 4px 8px;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-dropdown-border);
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    font-size: 12px;
                    min-width: 200px;
                    cursor: pointer;
                }
                
                .fileSelector:hover {
                    border-color: var(--vscode-focusBorder);
                }
                
                .fileSelector:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
            </style>
            <style>
                .error-container {
                    display: none;
                    padding: 10px;
                    margin: 10px 0;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                    border-radius: 3px;
                }
                .error-message {
                    font-family: var(--vscode-font-family);
                    font-size: 12px;
                    white-space: pre-wrap;
                    word-break: break-word;
                }
                .error-container.show {
                    display: block;
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
                                    <select id="fileSelector" class="fileSelector" title="Select Apex File">
                                        <option value="">Select an Apex file...</option>
                                    </select>
                                    <button id="saveButton" onclick="saveApexFile()" title="Save Changes" disabled>
                                        <svg width="16" height="16" viewBox="0 0 16 16">
                                            <path fill="currentColor" d="M13.353 1.146l1.5 1.5L15 3v11.5l-.5.5h-13l-.5-.5v-13l.5-.5H13l.353.146zM2 2v12h12V3.208L12.793 2H2zm2 3h8v1H4V5zm6 3H4v1h6V8zM4 11h4v1H4v-1z"/>
                                        </svg>
                                    </button>
                                    <button id="clearButton" onclick="clearEditor()" title="Clear Editor">
                                        <svg width="16" height="16" viewBox="0 0 16 16">
                                            <path fill="currentColor" d="M10 12.6l.7.7 1.6-1.6 1.6 1.6.8-.7L13 11l1.7-1.6-.8-.8-1.6 1.7-1.6-1.7-.7.8 1.6 1.6-1.6 1.6zM1 4h14V3H1v1zm0 3h14V6H1v1zm0 3h8V9H1v1zm0 3h8v-1H1v1z"/>
                                        </svg>
                                    </button>
                                    <button id="updateTemplatesButton" onclick="updateTemplates()" title="Update Template Files">
                                        <svg width="16" height="16" viewBox="0 0 16 16">
                                            <path fill="currentColor" d="M12.75 8a4.5 4.5 0 0 1-8.61 1.834l-1.391.565A6.001 6.001 0 0 0 14.25 8 6 6 0 0 0 3.5 4.334V2.5H2v4l.75.75h3.5v-1.5H4.352A4.5 4.5 0 0 1 12.75 8z"/>
                                        </svg>
                                    </button>
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
                                aria-label="Apex code editor"
                                spellcheck="false"
                                autocomplete="off"
                            ></textarea>
                            <div class="char-count">0 / 1000 characters</div>
                        </div>
                    </div>
					<div class="loading-container" id="loadingContainer">
						<div class="loading-spinner"></div>
						<span id="loadingMessage">Loading...</span>
					</div>
                </div>
                <div id="resultsContent" class="content">
                    <div id="outputContainer" class="output-container">
                        Execute Apex code to see results here
                    </div>
                </div>
                <div id="errorContainer" class="error-container">
                    <div id="errorMessage" class="error-message"></div>
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
                    const errorContainer = document.getElementById('errorContainer');
                    const errorMessage = document.getElementById('errorMessage');
					
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
                        charCount.textContent = \`\${length} characters\`;
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
                                    output += '<div class="success">? Execution successful</div>\\n';
                                    if (message.logs) {
                                        output += '\\nLogs:\\n' + message.logs;
                                    }
                                } else {
                                    output += '<div class="error">? Execution failed</div>\\n';
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
                                refreshButton.innerHTML = '↻ Refresh Org List';
                                refreshButton.disabled = false;
                                break;
                            case 'error':
								stopLoading();
                                statusBar.textContent = message.message;
                                console.error('[VisbalExt.htmlTemplate] Error:', message.message);
                                errorMessage.textContent = message.message;
                                errorContainer.classList.add('show');
                                break;
							case 'startLoading':
                                startLoading(message.message);
                                break;
                             case 'stopLoading':
                                stopLoading();
                                break;
                            case 'success':
                                statusBar.textContent = message.message;
                                // Ensure we switch to results tab
                                switchToResultsTab();
                                break;
                        }
                    });
					
					
					function startLoading(message) {
						loadingContainer.style.display = 'flex';
						document.getElementById('loadingMessage').textContent = message || 'Loading...';
                        statusBar.textContent = message || 'Loading...';
                        executeButton.disabled = true;
					}
					
					function stopLoading() {
						// Hide loading state
						loadingContainer.style.display = 'none';
                        statusBar.textContent = '';
						executeButton.disabled = false;
                        document.getElementById('loadingMessage').textContent = '';
					}
                    
                    // Execute Apex code
                    window.executeApex = function() {
						errorContainer.classList.remove('show');
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
                        refreshOption.textContent = '↻ Refresh Org List';
                        refreshOption.style.fontStyle = 'italic';
                        refreshOption.style.backgroundColor = 'var(--vscode-dropdown-background)';
                        orgDropdown.appendChild(refreshOption);
                
                        // Add a separator
                        const separator = document.createElement('option');
                        separator.disabled = true;
                        separator.textContent = '--------------';
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
					
                    // File selector functionality
                    const fileSelector = document.getElementById('fileSelector');

                    let currentFilePath = '';
                    const saveButton = document.getElementById('saveButton');
                    const clearButton = document.getElementById('clearButton');


                    // File selector change handler
                    fileSelector.addEventListener('change', () => {
                        const selectedFile = fileSelector.value;
                        currentFilePath = selectedFile;
                        saveButton.disabled = !selectedFile; 
                        if (selectedFile) {
                            startLoading('Loading file content...');
                            vscode.postMessage({
                                command: 'loadApexFile',
                                filePath: selectedFile
                            });
                        } else {
                            textarea.value = '';
                            updateCharCount();
                        }
                    });
                    
                    // Clear editor function
                    window.clearEditor = function() {
                        textarea.value = '';
                        fileSelector.value = '';
                        currentFilePath = '';
                        saveButton.disabled = true;
                        updateCharCount();
                        statusBar.textContent = 'Editor cleared';
                        setTimeout(() => {
                            statusBar.textContent = '';
                        }, 3000);
                    };

                    // Save file function
                    window.saveApexFile = function() {
                        if (!currentFilePath) {
                            vscode.postMessage({
                                command: 'error',
                                message: 'No file selected'
                            });
                            return;
                        }

                        const content = document.getElementById('apexTextarea').value;
                        startLoading('Saving file...');
                        document.getElementById('saveButton').disabled = true;
                        
                        vscode.postMessage({
                            command: 'saveApexFile',
                            filePath: currentFilePath,
                            content: content
                        });
                    };


                    // Handle textarea changes
                    textarea.addEventListener('input', function() {
                        saveButton.disabled = !currentFilePath;
                        updateCharCount();
                    });

                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'updateApexFileList':
                                updateFileListUI(message.files);
                                break;
                            case 'apexFileContent':
                                const textarea = document.getElementById('apexTextarea');
                                if (textarea) {
                                    textarea.value = message.content;
                                    textarea.focus();
                                    document.getElementById('saveButton').disabled = false;
                                    updateCharCount();
                                }
                                stopLoading();
                                break;
                            case 'fileSaved':
                                stopLoading();
                                document.getElementById('saveButton').disabled = false;
                                statusBar.textContent = message.message;
                                setTimeout(() => {
                                    statusBar.textContent = '';
                                }, 3000);
                                break;
                        }
                    });

                    // Update Templates
                    window.updateTemplates = function() {
                        startLoading('Updating templates...');
                        const updateButton = document.getElementById('updateTemplatesButton');
                        updateButton.disabled = true;
                        
                        vscode.postMessage({
                            command: 'updateTemplates'
                        });
                    };

                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'templatesUpdated':
                                stopLoading();
                                statusBar.textContent = message.message;
                                const updateButton = document.getElementById('updateTemplatesButton');
                                updateButton.disabled = false;
                                break;
                        }
                    });

                })();

                
               

                
                function updateFileListUI(files) {
                    fileSelector.innerHTML = '<option value="">Select an Apex file...</option>';
                    files.forEach(file => {
                        const option = document.createElement('option');
                        option.value = file.path;
                        option.textContent = file.name;
                        fileSelector.appendChild(option);
                    });
                }
            </script>
        </body>
        </html>`;
    }
} 