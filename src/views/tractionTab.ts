import * as vscode from 'vscode';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { SalesforceOrg } from '../types/salesforceTypes';
import { ViewId } from '../types/salesforceTypes';
import { getTractionHtml } from './tractionTabHTML';
import * as path from 'path';

export class TractionTab implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-traction';
    private _view?: vscode.WebviewView;
    private _orgListCacheService: OrgListCacheService;
    private _isLoading: boolean = false;
    private _error: string = '';
    private _orgs: SalesforceOrg[] = [];
    private _selectedOrg: string = '';

    constructor(private readonly _context: vscode.ExtensionContext) {
        const cachePath = OrgUtils.getCachePath();
        this._orgListCacheService = new OrgListCacheService(cachePath);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = getTractionHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] resolveWebviewView -- Received message: ${message.command}`, message);
            
            switch (message.command) {
                case 'loadOrgList':
                    await this._loadOrgList();
                    break;
                case 'refreshOrgList':
                    await this._refreshOrgList();
                    break;
                case 'setSelectedOrg':
                    this._selectedOrg = message.alias;
                    await this._setSelectedOrg(message.alias);
                    this._updateStatus(`Selected org: ${message.alias}`, 'success');
                    break;
                case 'openOrg':
                    await this._openOrg(message.alias);
                    break;
                case 'deploy':
                    await this._deploy(message.alias);
                    break;
                case 'terminalAction':
                    await this._handleTerminalAction(message.action);
                    break;
            }
        });

        // Initial load
        this._loadOrgList();
    }

    private async _loadOrgList() {
        this._isLoading = true;
        this._error = '';
        
        try {
            const cache = await this._orgListCacheService.getCachedOrgList();
            const orgGroups = cache?.orgs;
            this._orgs = this._flattenOrgGroups(orgGroups);
            this._isLoading = false;
            
            // Get the view-specific selected org
            const viewSpecificOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            const selectedOrgAlias = viewSpecificOrg?.alias || this._selectedOrg;
            
            // Send the org groups in the same format as other tabs
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgGroups,
                fromCache: true,
                selectedOrg: selectedOrgAlias
            });
            
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _loadOrgList -- Loaded ${this._orgs.length} orgs, selected: ${selectedOrgAlias}`);
        } catch (error: any) {
            this._isLoading = false;
            this._error = error?.message || 'Failed to load orgs.';
            OrgUtils.logError(`[VisbalExt.TractionTab] _loadOrgList -- Error loading orgs`, error as Error);
            
            this._updateStatus(this._error, 'error');
        }
    }

    private async _refreshOrgList() {
        this._isLoading = true;
        this._error = '';
        this._updateStatus('Refreshing organization list...', 'info');
        
        try {
            await OrgUtils.refreshOrgListForView(
                this._orgListCacheService,
                this._context,
                this._view?.webview,
                '[VisbalExt.TractionTab]',
                'loading',
                'Refreshing organization list...'
            );
            
            // After refresh, reload from cache
            const cache = await this._orgListCacheService.getCachedOrgList();
            const orgGroups = cache?.orgs;
            this._orgs = this._flattenOrgGroups(orgGroups);
            
            // Get the view-specific selected org
            const viewSpecificOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            const selectedOrgAlias = viewSpecificOrg?.alias || this._selectedOrg;
            
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgGroups,
                fromCache: false,
                selectedOrg: selectedOrgAlias
            });
        } catch (error: any) {
            this._isLoading = false;
            this._error = error?.message || 'Failed to refresh orgs.';
            OrgUtils.logError(`[VisbalExt.TractionTab] _refreshOrgList -- Error refreshing orgs`, error as Error);
            
            this._updateStatus(this._error, 'error');
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _setSelectedOrg -- Setting selected org: ${username}`);
            await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, username);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.TractionTab] _setSelectedOrg -- Error setting selected org:', error);
            this._updateStatus(`Failed to set selected org: ${error.message}`, 'error');
        }
    }

    private async _openOrg(alias: string) {
        // If no alias provided, try to get from view selection or default
        if (!alias) {
            const selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            if (selectedOrg?.alias) {
                alias = selectedOrg.alias;
            } else {
                // Try default org as fallback
                const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
                if (defaultOrgAlias) {
                    alias = defaultOrgAlias;
                    await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, defaultOrgAlias);
                } else {
                    this._updateStatus('No org selected', 'error');
                    return;
                }
            }
        }

        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _openOrg -- Opening org: ${alias}`);
            await OrgUtils.openOrg(alias);
            this._updateStatus(`Successfully opened org: ${alias}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _openOrg -- Successfully opened org: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _openOrg -- Error opening org: ${alias}`, error as Error);
            this._updateStatus(`Failed to open org: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to open org: ${error.message}`);
        }
    }

    private async _deploy(alias: string) {
        // If no alias provided, try to get from view selection or default
        if (!alias) {
            const selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            if (selectedOrg?.alias) {
                alias = selectedOrg.alias;
            } else {
                // Try default org as fallback
                const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
                if (defaultOrgAlias) {
                    alias = defaultOrgAlias;
                    await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, defaultOrgAlias);
                } else {
                    this._updateStatus('No org selected', 'error');
                    return;
                }
            }
        }

        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _deploy -- Starting deployment to org: ${alias}`);
            this._updateStatus(`Deploying to org: ${alias}...`, 'info');
            
            // Execute SF CLI v2 deploy command
            const terminal = vscode.window.createTerminal({
                name: `Deploy to ${alias}`,
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
            
            terminal.show();
            terminal.sendText(`sf project deploy start --target-org ${alias} --ignore-conflicts`);
            
            this._updateStatus(`Deploy command sent to terminal for org: ${alias}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _deploy -- Deploy command sent to terminal for org: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _deploy -- Error deploying to org: ${alias}`, error as Error);
            this._updateStatus(`Failed to deploy to org: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to deploy to org: ${error.message}`);
        }
    }

    private async _handleTerminalAction(action: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleTerminalAction -- Handling terminal action: ${action}`);
            
            let terminalName = 'Terminal';
            let shellPath: string | undefined;
            
            switch (action) {
                case 'gulp':
                    terminalName = 'Gulp - Scratch Org';
                    const terminal = vscode.window.createTerminal({
                        name: terminalName,
                        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    });
                    terminal.show();
                    terminal.sendText('npm run gulp');
                    this._updateStatus('Creating scratch org with Gulp...', 'info');
                    break;
                    
                case 'terminal':
                    terminalName = 'Terminal';
                    break;
                    
                case 'powershell':
                    terminalName = 'PowerShell';
                    if (process.platform === 'win32') {
                        shellPath = 'powershell.exe';
                    }
                    break;
                    
                case 'cmd':
                    terminalName = 'Command Prompt';
                    if (process.platform === 'win32') {
                        shellPath = 'cmd.exe';
                    }
                    break;
                    
                case 'auraEnabled':
                    await this._handleAuraEnabledReport();
                    return; // Early return since this doesn't create a terminal
                    
                default:
                    terminalName = 'Terminal';
            }
            
            if (action !== 'gulp') {
                const terminal = vscode.window.createTerminal({
                    name: terminalName,
                    shellPath: shellPath,
                    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
                terminal.show();
            }
            
            this._updateStatus(`Opened ${terminalName}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleTerminalAction -- Opened ${terminalName}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleTerminalAction -- Error handling terminal action: ${action}`, error as Error);
            this._updateStatus(`Failed to open terminal: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to open terminal: ${error.message}`);
        }
    }

    private _updateStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
        this._view?.webview.postMessage({
            command: 'updateStatus',
            message: message,
            type: type
        });
    }

    private _flattenOrgGroups(orgGroups: any): SalesforceOrg[] {
        if (!orgGroups) {
            return [];
        }

        const orgs: SalesforceOrg[] = [];
        
        // Add non-scratch orgs
        if (orgGroups.nonScratchOrgs) {
            orgs.push(...orgGroups.nonScratchOrgs);
        }
        
        // Add scratch orgs
        if (orgGroups.scratchOrgs) {
            orgs.push(...orgGroups.scratchOrgs);
        }
        
        return orgs;
    }

    private async _handleAuraEnabledReport() {
        try {
            OrgUtils.logDebug('[VisbalExt.TractionTab] _handleAuraEnabledReport -- Triggering @AuraEnabled report command');
            this._updateStatus('Generating @AuraEnabled report...', 'info');
            
            // Execute the registered command which handles all the logic
            await vscode.commands.executeCommand('visbal-ext.reportAuraEnabled');
            
            this._updateStatus('@AuraEnabled report completed', 'success');
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleAuraEnabledReport -- Error triggering @AuraEnabled report`, error as Error);
            this._updateStatus(`Failed to generate @AuraEnabled report: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to generate @AuraEnabled report: ${error.message}`);
        }
    }

    public refresh(): void {
        OrgUtils.logDebug('[VisbalExt.TractionTab] refresh -- Refreshing traction tab');
        this._refreshOrgList();
    }
}
