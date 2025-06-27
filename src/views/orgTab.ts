import * as vscode from 'vscode';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils, OrgGroups, SalesforceOrg } from '../utils/orgUtils';
import { getOrgTabHtml } from './orgTabHtml';
import { OrgTable } from '../components/OrgTable';

export class OrgTabView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'visbal-orgs';
  private _view?: vscode.WebviewView;
  private _orgListCacheService: OrgListCacheService;
  private _isLoading: boolean = false;
  private _error: string = '';
  private _orgs: SalesforceOrg[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._orgListCacheService = new OrgListCacheService(_context);
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
      console.log('[VisbalExt.OrgTab] resolveWebviewView -- Received message:', message);
      switch (message.command) {
        case 'refreshOrgList':
          await this._refreshOrgList();
          break;
        case 'openOrg':
          try {
            console.log('[VisbalExt.OrgTab] resolveWebviewView -- Opening org:', message.alias);
            await OrgUtils.openOrg(message.alias);
            console.log('[VisbalExt.OrgTab] resolveWebviewView -- Successfully opened org:', message.alias);
          } catch (error: any) {
            console.error('[VisbalExt.OrgTab] resolveWebviewView -- Error opening org:', error);
            vscode.window.showErrorMessage(`Failed to open org: ${error.message}`);
          }
          break;
        case 'deleteOrg':
          console.log('[VisbalExt.OrgTab] resolveWebviewView -- Delete org message received:', { alias: message.alias, username: message.username });
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
    } catch (error: any) {
      this._isLoading = false;
      this._error = error?.message || 'Failed to refresh orgs.';
      this._render();
    }
  }

  // Flatten OrgGroups to a single array for the grid
  private _flattenOrgGroups(orgGroups?: OrgGroups): SalesforceOrg[] {
    if (!orgGroups) return [];
    return [
      ...orgGroups.devHubs,
      ...orgGroups.sandboxes,
      ...orgGroups.scratchOrgs,
      ...orgGroups.nonScratchOrgs,
      ...orgGroups.other
    ];
  }

  // Handle org deletion
  private async _handleOrgDeletion(webview: vscode.Webview, alias: string, username: string) {
    try {
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Starting deletion process for alias: ${alias}, username: ${username}`);
      
      // Validate inputs
      if (!alias && !username) {
        OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- ERROR: Both alias and username are empty`);
        this._sendDeleteStatus(webview, false, 'No org identifier provided for deletion');
        return;
      }

      // Determine which identifier to use
      const orgIdentifier = alias || username;
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- Using identifier: ${orgIdentifier}`);

      // Note: We rely on the UI to only show delete buttons for scratch orgs
      // The button should only be visible for scratch orgs based on the client-side filtering

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
            this._sendDeleteStatus(webview, false, 'Salesforce CLI (sf) not found. Please install Salesforce CLI.');
          } else if (error.message.includes('timeout')) {
            this._sendDeleteStatus(webview, false, 'Deletion timed out. The org might still be deleting in the background.');
          } else if (error.message.includes('No org found')) {
            this._sendDeleteStatus(webview, false, `Org "${orgIdentifier}" not found or already deleted.`);
          } else {
            this._sendDeleteStatus(webview, false, `Failed to delete scratch org: ${error.message}`);
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
          this._sendDeleteStatus(webview, false, `Failed to delete scratch org: ${stderr}`);
        } else if (hasSuccess || (stdout.trim() === '' && stderr.includes('Warning') && !hasError)) {
          // Success case: either explicit success message or empty output with only warnings
          OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- DELETION SUCCESSFUL`);
          this._sendDeleteStatus(webview, true, `Scratch org "${orgIdentifier}" deleted successfully!`);
          
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
              this._sendDeleteStatus(webview, false, `Both deletion methods failed. Last error: ${altError.message}`);
            } else if (altStdout.includes('Successfully deleted') || altStdout.includes('deleted')) {
              this._sendDeleteStatus(webview, true, `Scratch org "${orgIdentifier}" deleted successfully!`);
              this._refreshOrgList();
            } else {
              this._sendDeleteStatus(webview, false, `Deletion result unclear. Original output: ${stdout || stderr}. Alt output: ${altStdout || altStderr}`);
            }
          });
        }
      });

    } catch (error: any) {
      OrgUtils.logDebug(`[VisbalExt.OrgTab] _handleOrgDeletion -- EXCEPTION: ${error.message}`);
      this._sendDeleteStatus(webview, false, `Unexpected error during deletion: ${error.message}`);
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