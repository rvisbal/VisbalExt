import * as vscode from 'vscode';
import { MetadataService } from '../services/metadataService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { SfdxService } from '../services/sfdxService';
import { getHtmlForWebview } from './soqlTabHTML';

export class SoqlTab implements vscode.WebviewViewProvider {
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

        webviewView.webview.html = getHtmlForWebview();

        // Load orgs when view is initialized
        this._loadOrgList();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'executeSoqlQuery':
                    this.executeSOQL(message.query, message.useToolingApi);
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
	
	private async executeSOQL(soql: string, useToolingApi: boolean) {
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

            OrgUtils.logDebug(`[VisbalExt.soqlPanel] executeSOQL Executing on ${selectedOrg?.alias} org SOQL:`, soql);
            const m = `SOQL started on : ${selectedOrg.alias}`
            // Show loading state
            this._view?.webview.postMessage({
                command: m
            });

            const result = await this._sfdxService.executeSoqlQuery(soql, useToolingApi, useToolingApi);
            OrgUtils.logDebug('[VisbalExt.soqlPanel] executeSOQL Execution result:', result);

            if (!result || result.length === 0) {
                this._view?.webview.postMessage({
                    command: 'noResults',
                    message: 'Query executed successfully but returned no records.'
                });
                return;
            }

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
            OrgUtils.logError('[VisbalExt.soqlPanel] executeSOQL Error executing SOQL:', error);
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
        await OrgUtils.loadOrgListForView(
            this._orgListCacheService,
            this._context,
            this._view?.webview,
            '[VisbalExt.soqlPanel]'
        );
    }

    

    /**
     * Refreshes the list of Salesforce orgs
     */
    private async _refreshOrgList(): Promise<void> {
        if (this._isRefreshing) {
            OrgUtils.logDebug('[VisbalExt.soqlPanel] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }

        try {
            this._isRefreshing = true;
            await OrgUtils.refreshOrgListForView(
                this._orgListCacheService,
                this._context,
                this._view?.webview,
                '[VisbalExt.soqlPanel]',
                'startLoading',
                'Refreshing organization list...'
            );
        } finally {
            this._isRefreshing = false;
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.soqlPanel] _setSelectedOrg -- Setting selected org: ${username}`);
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: `Setting selected organization...`
            });
            
            await OrgUtils.setSelectedOrg(username);
            
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.soqlPanel] _setSelectedOrg -- Error setting selected org:', error);
            this._view?.webview.postMessage({
                command: 'error',
                message: `Failed to set selected organization: ${error.message}`
            });
        }
    }
    //#endregion LISTBOX
} 