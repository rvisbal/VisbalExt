import * as vscode from 'vscode';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils, OrgGroups, SalesforceOrg } from '../utils/orgUtils';
import { getOrgTabHtml } from './orgTabHtml';

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
      switch (message.command) {
        case 'refreshOrgList':
          await this._refreshOrgList();
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

  // Render the webview HTML
  private _render() {
    if (this._view) {
      this._view.webview.html = getOrgTabHtml(this._orgs, this._isLoading, this._error);
    }
  }
} 