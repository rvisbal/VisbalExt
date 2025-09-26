import * as vscode from 'vscode';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { OrgGroups, SalesforceOrg, ViewId } from '../types/salesforceTypes';
import { getOrgTabHtml } from './orgTabHtml';
import { OrgTable } from '../components/OrgTable';
import { statusBarService } from '../services/statusBarService';
import * as path from 'path';

export class OrgTabView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'visbal-orgs';
  private _view?: vscode.WebviewView;
  private _orgListCacheService: OrgListCacheService;
  private _isLoading: boolean = false;
  private _error: string = '';
  private _orgs: SalesforceOrg[] = [];

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
    this._render();
    webviewView.webview.onDidReceiveMessage(async (message) => {
      OrgUtils.logDebug('[VisbalExt.OrgTab] resolveWebviewView -- Received message:', message);
      switch (message.command) {
        case 'refreshOrgList':
          await this._refreshOrgList();
          break;
        case 'openOrg':
          try {
            statusBarService.showProgress(`Opening org: ${message.alias}...`);
            await OrgUtils.openOrg(message.alias);
            statusBarService.showSuccess(`Successfully opened org: ${message.alias}`);
          } catch (error: any) {
            console.error('[VisbalExt.OrgTab] resolveWebviewView -- Error opening org:', error);
            statusBarService.showError(`Failed to open org: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to open org: ${error.message}`);
          }
          break;
        case 'deleteOrg':
          OrgUtils.logDebug('[VisbalExt.OrgTab] resolveWebviewView -- Delete org message received:', { alias: message.alias, username: message.username });
          OrgUtils.logDebug(`[VisbalExt.OrgTab] resolveWebviewView -- Delete org message received: alias=${message.alias}, username=${message.username}`);
          await this._handleOrgDeletion(webviewView.webview, message.alias, message.username);
          break;
        case 'getFilteredOrgs':
          const orgTable = new OrgTable(webviewView.webview, this._orgs);
          const html = orgTable.getFilteredHtml(message.filterType, message.searchTerm);
          webviewView.webview.postMessage({
            command: 'updateOrgsHtml',
            html
          });
          break;
      }
    });
    
    // Initial load
    this._loadOrgList();
  }

  private async _loadOrgList() {
    this._isLoading = true;
    this._error = '';
    this._render();
    
    try {
      await OrgUtils.loadOrgListForView(
        this._orgListCacheService,
        this._context,
        undefined, // No webview for orgTab
        '[VisbalExt.OrgTabView]',
        ViewId.ORG_TAB
      );
      
      // Get the updated cache after load
      const cache = await this._orgListCacheService.getCachedOrgList();
      this._orgs = this._flattenOrgGroups(cache?.orgs);
      this._isLoading = false;
      this._render();
    } catch (error: any) {
      this._isLoading = false;
      this._error = error?.message || 'Failed to load orgs.';
      this._render();
    }
  }

  private async _refreshOrgList() {
    this._isLoading = true;
    this._error = '';
    this._render();
    try {
      await OrgUtils.refreshOrgListForView(
        this._orgListCacheService,
        this._context,
        this._view?.webview,
        '[VisbalExt.OrgTabView]',
        'loading',
        'Refreshing organization list...'
      );
      // After refresh, reload from cache
      await this._loadOrgList();
      statusBarService.showSuccess('Organization list refreshed successfully');
    } catch (error: any) {
      this._isLoading = false;
      this._error = error?.message || 'Failed to refresh orgs.';
      statusBarService.showError(`Failed to refresh orgs: ${error?.message || 'Unknown error'}`);
      this._render();
    }
  }

  // Flatten OrgGroups to a single array for the grid
  private _flattenOrgGroups(orgGroups?: OrgGroups): SalesforceOrg[] {
    if (!orgGroups) return [];
    
    // Combine all orgs and deduplicate by username and orgId
    const allOrgs = [
      ...orgGroups.devHubs,
      ...orgGroups.sandboxes,
      ...orgGroups.scratchOrgs,
      ...orgGroups.nonScratchOrgs,
      ...orgGroups.other
    ];

    // Deduplicate using a Map with composite key (username + orgId)
    const deduplicatedMap = new Map<string, SalesforceOrg>();
    
    for (const org of allOrgs) {
      if (!org) continue;
      
      // Create a unique key using username and orgId (fallback to instanceUrl if orgId missing)
      const uniqueKey = `${org.username || 'unknown'}_${org.orgId || org.instanceUrl || 'nokey'}`;
      
      // Only add if not already present, prioritizing more specific org types
      if (!deduplicatedMap.has(uniqueKey)) {
        deduplicatedMap.set(uniqueKey, org);
      } else {
        // If duplicate found, keep the one with more specific type (devHub > sandbox > scratchOrg > other)
        const existing = deduplicatedMap.get(uniqueKey)!;
        const typeHierarchy = { 'devHub': 4, 'sandbox': 3, 'scratchOrg': 2, 'nonScratchOrg': 1, 'other': 0 };
        const existingPriority = typeHierarchy[existing.type] || 0;
        const newPriority = typeHierarchy[org.type] || 0;
        
        if (newPriority > existingPriority) {
          deduplicatedMap.set(uniqueKey, org);
        }
      }
    }

    const result = Array.from(deduplicatedMap.values());
    OrgUtils.logDebug(`[VisbalExt.OrgTab] _flattenOrgGroups -- Original count: ${allOrgs.length}, Deduplicated count: ${result.length}`);
    
    return result;
  }

  // Handle org deletion
  private async _handleOrgDeletion(webview: vscode.Webview, alias: string, username: string) {
    try {
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Starting deletion process for alias: ${alias}, username: ${username}`);
      
      // Validate inputs
      if (!alias && !username) {
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- ERROR: Both alias and username are empty`);
        statusBarService.showError('No org identifier provided for deletion');
        this._sendDeleteStatus(webview, false, 'No org identifier provided for deletion');
        return;
      }

      // Determine which identifier to use
      const orgIdentifier = alias || username;
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Using identifier: ${orgIdentifier}`);

      // Note: We rely on the UI to only show delete buttons for scratch orgs
      // The button should only be visible for scratch orgs based on the client-side filtering

      // Show progress in status bar
      statusBarService.showProgress(`Deleting scratch org: ${orgIdentifier}...`);

      // Execute the deletion command - try different command formats
      const deleteCommand = `sf org delete scratch --target-org "${orgIdentifier}" --no-prompt`;
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Executing command: ${deleteCommand}`);
      
      // Import the exec function for command execution
      const { exec } = require('child_process');
      
      exec(deleteCommand, { timeout: 120000 }, (error: any, stdout: string, stderr: string) => {
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Command completed`);
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- stdout: ${stdout}`);
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- stderr: ${stderr}`);
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- error: ${error}`);

        if (error) {
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- DELETION FAILED: ${error.message}`);
          
          // Check for specific error patterns
          if (error.message.includes('ENOENT') || error.message.includes('sf: command not found')) {
            const errorMsg = 'Salesforce CLI (sf) not found. Please install Salesforce CLI.';
            statusBarService.showError(errorMsg);
            this._sendDeleteStatus(webview, false, errorMsg);
          } else if (error.message.includes('timeout')) {
            const errorMsg = 'Deletion timed out. The org might still be deleting in the background.';
            statusBarService.showError(errorMsg);
            this._sendDeleteStatus(webview, false, errorMsg);
          } else if (error.message.includes('No org found')) {
            const errorMsg = `Org "${orgIdentifier}" not found or already deleted.`;
            statusBarService.showError(errorMsg);
            this._sendDeleteStatus(webview, false, errorMsg);
          } else {
            const errorMsg = `Failed to delete scratch org: ${error.message}`;
            statusBarService.showError(errorMsg);
            this._sendDeleteStatus(webview, false, errorMsg);
          }
          return;
        }

        // Enhanced result checking
        const combinedOutput = (stdout + stderr).toLowerCase();
        const hasError = stderr.includes('Error') || stderr.includes('error') || combinedOutput.includes('failed');
        const hasSuccess = stdout.includes('Successfully deleted') || 
                          stdout.includes('deleted scratch org') ||
                          combinedOutput.includes('deleted') ||
                          (stdout.trim() === '' && !hasError && stderr.includes('Warning')); // Empty stdout with only warnings often means success

        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- hasError: ${hasError}, hasSuccess: ${hasSuccess}`);
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- combinedOutput: ${combinedOutput}`);

        if (hasError) {
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- DELETION FAILED DUE TO ERROR`);
          const errorMsg = `Failed to delete scratch org: ${stderr}`;
          statusBarService.showError(errorMsg);
          this._sendDeleteStatus(webview, false, errorMsg);
        } else if (hasSuccess || (stdout.trim() === '' && stderr.includes('Warning') && !hasError)) {
          // Success case: either explicit success message or empty output with only warnings
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- DELETION SUCCESSFUL`);
          const successMsg = `Scratch org "${orgIdentifier}" deleted successfully!`;
          statusBarService.showSuccess(successMsg);
          this._sendDeleteStatus(webview, true, successMsg);
          
          // Trigger org list refresh
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Triggering org list refresh`);
          this._refreshOrgList();
        } else {
          // Fallback: try alternative command format
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Trying alternative command format`);
          const altCommand = `sf force:org:delete --targetusername "${orgIdentifier}" --noprompt`;
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Executing alternative command: ${altCommand}`);
          
          exec(altCommand, { timeout: 120000 }, (altError: any, altStdout: string, altStderr: string) => {
            OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Alternative command completed`);
            OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Alt stdout: ${altStdout}`);
            OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Alt stderr: ${altStderr}`);
            
            if (altError) {
              const errorMsg = `Both deletion methods failed. Last error: ${altError.message}`;
              statusBarService.showError(errorMsg);
              this._sendDeleteStatus(webview, false, errorMsg);
            } else if (altStdout.includes('Successfully deleted') || altStdout.includes('deleted')) {
              const successMsg = `Scratch org "${orgIdentifier}" deleted successfully!`;
              statusBarService.showSuccess(successMsg);
              this._sendDeleteStatus(webview, true, successMsg);
              this._refreshOrgList();
            } else {
              const errorMsg = `Deletion result unclear. Original output: ${stdout || stderr}. Alt output: ${altStdout || altStderr}`;
              statusBarService.showError(errorMsg);
              this._sendDeleteStatus(webview, false, errorMsg);
            }
          });
        }
      });

    } catch (error: any) {
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- EXCEPTION: ${error.message}`);
      const errorMsg = `Unexpected error during deletion: ${error.message}`;
      statusBarService.showError(errorMsg);
      this._sendDeleteStatus(webview, false, errorMsg);
    }
  }

  // Send status update to webview
  private _sendDeleteStatus(webview: vscode.Webview, success: boolean, message?: string) {
    OrgUtils.logDebug(`[VisbalExt.OrgTab] _sendDeleteStatus -- success: ${success}, message: ${message}`);
    webview.postMessage({
      command: 'deleteStatus',
      success,
      message
    });
  }

  // Render the webview HTML
  private _render() {
    if (this._view) {
      this._view.webview.html = getOrgTabHtml(this._view.webview, this._orgs, this._isLoading, this._error);
    }
  }
} 