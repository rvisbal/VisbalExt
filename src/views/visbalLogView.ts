import * as vscode from 'vscode';
import { getHtmlForWebview } from './htmlForWebView';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { statusBarService } from '../services/statusBarService';
import { readFile, unlink } from 'fs/promises';
import { MetadataService } from '../services/metadataService';
import { OrgUtils } from '../utils/orgUtils';
import { CacheService } from '../services/cacheService';
import { SalesforceLog } from '../types/salesforceLog';
import { SfdxService } from '../services/sfdxService';
import { OrgListCacheService } from '../services/orgListCacheService';

const execAsync = promisify(exec);

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

/**
 * VisbalLogView class for displaying logs in the panel area
 */
export class VisbalLogView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-log';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _downloadedLogs: Set<string> = new Set<string>();
    private _isLoading: boolean = false;
    private _hasIntitialized: boolean = false;
    private _downloadedLogPaths: Map<string, string> = new Map<string, string>();
    private _logs: SalesforceLog[] = [];
    private _lastFetchTime: number = 0;
    private _cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry
    private _metadataService: MetadataService;
    private _cacheService: CacheService;
    private _sfdxService: SfdxService;
    private _orgListCacheService: OrgListCacheService;
    private _isRefreshing: boolean = false;
    

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionUri = _context.extensionUri;
        this._metadataService = new MetadataService();
        this._cacheService = new CacheService(_context);
        this._sfdxService = new SfdxService();
        this._orgListCacheService = new OrgListCacheService(_context);
        
        // Initialize from cache
        this._initializeFromCache();
    }

    private async _initializeFromCache(): Promise<void> {
        try {
            // Load cached logs
            this._logs = await this._cacheService.getCachedLogs();
            this._lastFetchTime = await this._cacheService.getLastFetchTime();
            this._downloadedLogs = await this._cacheService.getDownloadedLogs();
            this._downloadedLogPaths = await this._cacheService.getDownloadedLogPaths();

            // Initialize OrgUtils with downloaded logs data
            OrgUtils.setDownloadedLogsData(this._downloadedLogs, this._downloadedLogPaths);

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Initialized from cache: ${this._logs.length} logs, ${this._downloadedLogs.size} downloaded`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error initializing from cache:', error);
        }
    }

    public init() {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] constructor -- init');
        if (!this._hasIntitialized) {
            this._hasIntitialized = true;
            this._checkDownloadedLogs();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] constructor -- _refreshOrgList');
            this._metadataService = new MetadataService();
            this._loadOrgList();
        }
    }

    /**
     * Resolves the webview view
     * @param webviewView The webview view to resolve
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Resolving webview view');
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set the HTML content
        webviewView.webview.html = this._getWebviewContent();
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Webview HTML content set');

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Received message:', message);

            if (message.command.startsWith('refreshOrgList')) {
                message.command = 'refreshOrgList';
            }
            
            switch (message.command) {
                case 'refreshOrgList':
                    await this._refreshOrgList();
                    break;
                case 'loadOrgList':
                    await this._loadOrgList();
                    break;
                case 'setDefaultOrg':
                    await this._setDefaultOrg(message.orgUsername);
                    break;
                case 'setSelectedOrg':
                        await this._setSelectedOrg(message.alias);
                        break;
                case 'fetchLogs':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Fetching logs from command');
                    await this._fetchLogs(true);
                    break;
                case 'fetchLogsSoql':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Fetching logs via SOQL from command');
                    await this._fetchLogsSoql();
                    break;
                case 'downloadLog':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] resolveWebviewView -- Downloading log: ${message.logId}`);
                    await this.downloadLog(message.logId);
                    break;
                case 'openLog':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] resolveWebviewView -- Opening log: ${message.logId}`);
                    await this.openLog(message.logId);
                    break;
                case 'toggleDownloaded':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] resolveWebviewView -- Toggling downloaded status for log: ${message.logId} to ${message.downloaded}`);
                    this._toggleDownloaded(message.logId, message.downloaded);
                    break;
                case 'turnOnDebugLog':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Turning on debug log');
                    await this._turnOnDebugLog();
                    break;
                case 'clearLocalLogs':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Clearing local log files');
                    await this._clearLocalLogs();
                    break;
                case 'openDefaultOrg':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Opening default org');
                    this.openDefaultOrg();
                    break;
               case 'openSelectedOrg':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- Opening selected org');
                    this.openSelectedOrg();
                    break;
                case 'deleteSelectedLogs':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] resolveWebviewView -- Deleting selected logs: ${message.logIds.length} logs `, message.logIds);
                    await this._deleteSelectedLogs(message.logIds);
                    break;
                case 'deleteServerLogs':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- deleteServerLogs');
                    this._deleteServerLogs();
                    break;
                case 'deleteViaSoql':
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- deleteViaSoqlApi');
                    this._deleteViaSoqlApi();
                    break;
                case 'applyDebugConfig':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView]  resolveWebviewView -- Applying debug configuration:`, message.config);
                    await this._applyDebugConfig(message.config, message.turnOnDebug);
                    break;
                case 'getCurrentDebugConfig':
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView]  resolveWebviewView -- Getting current debug configuration`);
                    await this._getCurrentDebugConfig();
                    break;
                case 'executeScript':
                    try {
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView]  Executing script from extension');
                        // Execute the script
                        eval(message.script);
                    } catch (error: any) {
                        OrgUtils.logError('Error executing script:', error);
                    }
                    break;
            }
        });

        // Wait for the webview to be ready before sending logs
        setTimeout(() => {
            if (webviewView.visible) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] resolveWebviewView -- View is visible, checking for cached logs');
                
                // Add the script to inject the "Delete via SOQL" button
                this._view?.webview.postMessage({
                    command: 'executeScript',
                    script: `
                        // Function to add the "Delete via SOQL" button
                        function addDeleteViaSoqlButton() {         
                            // Find the "Delete Server Logs" button
                            const deleteServerLogsButton = document.querySelector('button[data-command="deleteServerLogs"]');

                            if (deleteServerLogsButton && !document.querySelector('button[data-command="deleteServerLogsViaSoql"]')) {
                                // Create the new button
                                const deleteViaSoqlButton = document.createElement('button');
                                deleteViaSoqlButton.textContent = 'Delete via SOQL';
                                deleteViaSoqlButton.className = deleteServerLogsButton.className; // Use the same class as the original button
                                deleteViaSoqlButton.setAttribute('data-command', 'deleteServerLogsViaSoql');
                                
                                // Add the button next to the "Delete Server Logs" button
                                deleteServerLogsButton.parentNode.insertBefore(deleteViaSoqlButton, deleteServerLogsButton.nextSibling);

                                // Add event listener
                                deleteViaSoqlButton.addEventListener('click', function() {
                                    // Send message to extension
                                    vscode.postMessage({
                                        command: 'deleteServerLogsViaSoql'
                                    });
                                });
                                
                                OrgUtils.logDebug('Added "Delete via SOQL" button');
                            }
                        }
                        
                        // Try to add the button now
                        addDeleteViaSoqlButton();
                        
                        // Also try again after a short delay in case the UI is still loading
                        setTimeout(addDeleteViaSoqlButton, 1000);
                    `
                });
                
                // If we have cached logs, send them to the webview
                if (this._logs.length > 0) {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] resolveWebviewView -- Using cached logs (${this._logs.length} logs)`);
                    this._sendLogsToWebview(this._logs);
                }
                // Do not fetch logs automatically - let the user click Refresh
            }
        }, 500); // Add a small delay to ensure the webview is fully loaded
	}


    /**
     * Fetches logs and updates the view
     * @param forceRefresh Whether to force a refresh even if we have recent cached logs
     */
    private async _fetchLogs(forceRefresh: boolean = false): Promise<void> {
        try {
            // Check if we need to refresh based on cache expiry
            if (!forceRefresh && this._logs.length > 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogs -- Using cached logs, no refresh needed');
                this._sendLogsToWebview(this._logs);
                return;
            }

            // Set loading state
            this._isLoading = true;
            this._updateWebviewContent();
            
            statusBarService.showProgress('Fetching Salesforce logs...');
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogs -- Fetching logs from Salesforce');
            
            this._view?.webview.postMessage({ command: 'loading', isLoading: true });

            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Fetching logs with new CLI format...');
            try {

                const result = await this._sfdxService.listApexLogs();
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result && Array.isArray(jsonResult.result)) {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Found ${jsonResult.result.length} logs`);
                    
                    // Transform logs to the expected format
                    const transformedLogs = jsonResult.result.map((log: any) => {
                        // Log the raw log entry for debugging
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Raw log entry: ${JSON.stringify(log)}`);
                        
                        return {
                            id: log.Id || log.id,
                            logUser: {
                                name: log.LogUser?.Name || log.LogUserName || 'Unknown User'
                            },
                            application: log.Application || log.application || 'Unknown',
                            operation: log.Operation || log.operation || 'Unknown',
                            request: log.Request || log.request || '',
                            status: log.Status || log.status || 'Unknown',
                            logLength: log.LogLength || log.logLength || 0,
                            lastModifiedDate: log.LastModifiedDate || log.lastModifiedDate || '',
                            startTime: log.StartTime || log.startTime || log.LastModifiedDate || log.lastModifiedDate || '',
                            downloaded: false // Will be updated later
                        };
                    });
                    
                    // Store the transformed logs
                    this._logs = transformedLogs;
                    OrgUtils.initialize(this._logs, this._context);
                    
                    // Update the last fetch time
                    this._lastFetchTime = Date.now();
                    
                    // Save to cache
                    await this._cacheService.saveCachedLogs(this._logs);
                    
                    // Validate logs
                    const validatedLogs = transformedLogs.filter((log: any) => {
                        if (!log || typeof log !== 'object' || !log.id) {
                            OrgUtils.logError('[VisbalExt.VisbalLogView] Invalid log entry after transformation:', log);
                            return false;
                        }
                        return true;
                    });
                    
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Validated ${validatedLogs.length} of ${transformedLogs.length} logs`);
                    
                    // Send logs to webview with downloaded status
                    this._sendLogsToWebview(validatedLogs);
                    
                    // Show success message in status bar
                    statusBarService.showSuccess(`Fetched ${validatedLogs.length} logs`);
                } else {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] Invalid response format:', jsonResult);
                    throw new Error('Invalid response format');
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] Error fetching logs with new CLI format:', error);
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] Falling back to old CLI format...');
                
			}
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogs -- Error:', error);
            statusBarService.showError(`Error fetching logs: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to fetch logs: ${error.message}`);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'updateLogs',
                    logs: []
                });
            }
        } finally {
            // Reset loading state
            this._isLoading = false;
            this._updateWebviewContent();
        }
    }

    /**
     * Fetches logs from Salesforce using SOQL query and updates the view
     */
    private async _fetchLogsSoql(): Promise<void> {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Starting to fetch logs via SOQL');
        if (!this._view || this._isLoading) {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- View not available or already loading, skipping fetch');
            return;
        }

        // Set loading flag
        this._isLoading = true;
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Set loading flag to true');

        // Show loading state
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Sending loading state to webview');
        this._view.webview.postMessage({ command: 'loading', loading: true });

        try {
            // Fetch logs from Salesforce using SOQL
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Calling _fetchSalesforceLogsSoql');
            const logs = await this._fetchSalesforceLogsSoql();
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Received ${logs.length} logs from Salesforce via SOQL`);
            
            // Store the logs
            this._logs = logs;
            OrgUtils.initialize(this._logs, this._context);
            
            // Update the last fetch time
            this._lastFetchTime = Date.now();
            
            // Save to cache
            await this._cacheService.saveCachedLogs(this._logs);
            
            // Update download status
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Updating download status for logs');
            logs.forEach(log => {
                log.downloaded = this._downloadedLogs.has(log.id);
                
                // Check if we have a local file for this log
                const localFilePath = this._downloadedLogPaths.get(log.id);
                if (localFilePath && fs.existsSync(localFilePath)) {
                    log.localFilePath = localFilePath;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Log ${log.id} has local file: ${localFilePath}`);
                }
                
                if (log.downloaded) {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Log ${log.id} is marked as downloaded`);
                }
            });

            // Send logs to the webview
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Sending logs to webview');
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Logs data structure: ${JSON.stringify(logs.slice(0, 2))}`); // Log sample of logs
            
            // Validate logs before sending
            if (!logs || !Array.isArray(logs)) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Invalid logs array:', logs);
                throw new Error('Invalid logs data structure');
            }
            
            // Ensure all logs have the required properties
            const validatedLogs = logs.filter(log => {
                if (!log || typeof log !== 'object' || !log.id) {
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Invalid log entry:', log);
                    return false;
                }
                return true;
            });
            
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Validated ${validatedLogs.length} of ${logs.length} logs`);
            
            // Send the validated logs to the webview
            this._view?.webview.postMessage({ 
                command: 'updateLogs', 
                logs: validatedLogs 
            });
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Error fetching logs via SOQL:', error);
            
            // Format a more user-friendly error message
            let errorMessage = `Error fetching logs via SOQL: ${error.message}`;
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogsSoql -- Error message: ${errorMessage}`);
            
            // Add helpful suggestions based on the error
            if (error.message.includes('Salesforce CLI is not installed') || error.message.includes('SFDX CLI is not installed')) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Adding CLI installation suggestion');
                errorMessage = 'Error fetching logs via SOQL: Salesforce CLI is not installed.\n\n';
                errorMessage += 'To install the Salesforce CLI, use one of these methods:\n\n';
                errorMessage += '1. Install the new SF CLI:\n   npm install -g @salesforce/cli\n\n';
                errorMessage += '2. Install the legacy SFDX CLI:\n   npm install -g sfdx-cli\n\n';
                errorMessage += '3. Download the installer from:\n   https://developer.salesforce.com/tools/sfdxcli\n\n';
                errorMessage += 'After installation, authenticate with your org using:\n';
                errorMessage += '- sf org login web\n';
                errorMessage += '- sfdx force:auth:web:login --setdefaultusername';
            } else if (error.message.includes('No default Salesforce org found')) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Adding default org suggestion');
                errorMessage = 'Error fetching logs via SOQL: No default Salesforce org found.\n\n';
                errorMessage += 'Please authenticate and set a default org using one of these commands:\n\n';
                errorMessage += '- sf org login web\n';
                errorMessage += '- sfdx force:auth:web:login --setdefaultusername';
            } else if (error.message.includes('Command failed')) {
                // For general command failures, suggest updating the CLI
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Adding CLI update suggestion');
                errorMessage = 'Error fetching logs via SOQL: Command failed.\n\n';
                errorMessage += 'Try updating your Salesforce CLI with one of these commands:\n\n';
                errorMessage += '- npm update -g @salesforce/cli\n';
                errorMessage += '- sfdx update\n\n';
                errorMessage += 'If the issue persists, try authenticating again:\n';
                errorMessage += '- sf org login web\n';
                errorMessage += '- sfdx force:auth:web:login --setdefaultusername';
            }
            
            // Send error to webview
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Sending error to webview');
            this._view?.webview.postMessage({ 
                command: 'error', 
                error: errorMessage
            });
        } finally {
            // Clear loading flag
            this._isLoading = false;
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Set loading flag to false');
            
            // Hide loading state
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogsSoql -- Sending loading:false to webview');
            this._view?.webview.postMessage({ command: 'loading', loading: false });
        }
    }

    /**
     * Fetches logs from Salesforce using SOQL query via SFDX CLI
     * @returns Array of Salesforce logs
     */
    private async _fetchSalesforceLogsSoql(): Promise<SalesforceLog[]> {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Starting to fetch Salesforce logs via SOQL');
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!selectedOrg) {
                throw new Error('No org selected');
            }
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Connected to org: ${selectedOrg.alias}`);

            // Check if SF CLI is installed
            let sfInstalled = false;
            try {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Checking if SF CLI is installed');
                const { stdout: sfVersionOutput } = await execAsync('sf version');
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- SF CLI version: ${sfVersionOutput.trim()}`);
                sfInstalled = true;
            } catch (err: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- SF CLI not installed', err);
            }

            if (!sfInstalled) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- SF CLI is not installed');
                throw new Error('Please install the Salesforce CLI (npm install -g @salesforce/cli).');
            }

            // SOQL query to fetch debug logs
            const soqlQuery = `SELECT Id, LogUser.Name, Operation, Application, Status, LogLength, LastModifiedDate, Request, Location FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 50`;
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- SOQL query: ${soqlQuery}`);
            
            // Try to execute SOQL query using the new command format first
            const records =  await this._sfdxService.executeSoqlQuery(soqlQuery, false, false);
            
            

            // Format the logs
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Formatting logs from SOQL query');
            const formattedLogs: SalesforceLog[] = records.map((log: any) => ({
                id: log.Id,
                logUser: log.LogUser?.Name || 'Unknown User',
                application: log.Application || 'Unknown',
                operation: log.Operation || 'Unknown',
                request: log.Request || '',
                status: log.Status || 'Unknown',
                logLength: log.LogLength || 0,
                lastModifiedDate: log.LastModifiedDate || '',
                downloaded: false
            }));
            
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Returning ${formattedLogs.length} formatted logs from SOQL query`);
            return formattedLogs;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchSalesforceLogsSoql -- Error:', error);
            throw error;
        }
    }

    private _toggleDownloaded(logId: string, downloaded: boolean): void {
        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Toggling downloaded status for log ${logId} to ${downloaded}`);
        if (downloaded) {
            this._downloadedLogs.add(logId);
        } else {
            this._downloadedLogs.delete(logId);
        }
        
        // Update the UI to reflect the change
        this._updateWebviewContent();
    }

    private _updateWebviewContent(): void {
        if (this._view && this._view.webview && this._logs) {
            // Mark logs as downloaded if they are in the _downloadedLogs set
            const logsWithDownloadStatus = this._logs.map((log: any) => ({
                ...log,
                downloaded: this._downloadedLogs.has(log.id) || this._downloadedLogPaths.has(log.id)
            }));
            
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: logsWithDownloadStatus
            });
        }
    }

    // Update the _sendLogsToWebview method to check both _downloadedLogs and _downloadedLogPaths
    private _sendLogsToWebview(logs: any[]): void {
        if (this._view && this._view.webview) {
            // Mark logs as downloaded if they are in the _downloadedLogs set or _downloadedLogPaths map
            const logsWithDownloadStatus = logs.map((log: any) => ({
                ...log,
                downloaded: this._downloadedLogs.has(log.id) || this._downloadedLogPaths.has(log.id)
            }));
            
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Sending ${logsWithDownloadStatus.length} logs to webview`);
            
            // Log a sample of the logs being sent
            if (logsWithDownloadStatus.length > 0) {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Sample log: ${JSON.stringify(logsWithDownloadStatus[0])}`);
            }
            
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: logsWithDownloadStatus
            });
        }
    }

    // Add this method to execute commands
    private async _executeCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
                        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    OrgUtils.logError(`[VisbalExt.VisbalLogView] _executeCommand Error executing command: ${command}`, error);
                    reject(error);
                    return;
                }
                
                if (stderr && stderr.length > 0) {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _executeCommand Command produced stderr: ${command}`, stderr);
                }
                
                resolve(stdout);
            });
        });
    }

    /**
     * Turns on Apex Debug Log for Replay Debugger
     */
    private async _turnOnDebugLog(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -1 -- Turning on debug log');
            statusBarService.showProgress('Turning on debug log...');

            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Enabling Apex Debug Log...' });

            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -2 Turning on Apex Debug Log for Replay Debugger');

            // Get the current user ID
            let userId = '';
            try {
                // Try with new CLI format first
                try {
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -3 -- Getting user ID with new CLI format');
                    const userIdResult = await this._executeCommand('sf org display user --target-org ${selectedOrg?.alias} --json');
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -4 -- User ID result: ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -5 -- Current user ID: ${userId}`);
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -6 -- Error getting user ID with new CLI format:', error);
                    
                    // Try with old CLI format
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -7 -- Trying with old CLI format');
                    const userIdResult = await this._executeCommand('sfdx force:user:display --target-org ${selectedOrg?.alias} --json');
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -8 -- User ID result (old format): ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -9 -- Current user ID (old format): ${userId}`);
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -10 Error getting user ID:', error);
                throw new Error('Failed to get current user ID. Make sure you are authenticated with a Salesforce org.');
            }

            if (!userId) {
                throw new Error('Could not determine current user ID');
            }

            // Check if there's an existing trace flag
            let existingTraceFlag = null;
            let existingDebugLevelId = null;
            
            const traceResult = await OrgUtils.getExistingDebugTraceFlag(userId);
            existingTraceFlag = traceResult.existingTraceFlag;
            existingDebugLevelId = traceResult.existingDebugLevelId;

            // Use existing debug level if available, otherwise create a new one
            let debugLevelId = existingDebugLevelId;
            
            if (!debugLevelId) {
                // Create a debug level
                const debugLevelName = `ReplayDebugger${Date.now()}`;
                
                try {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -17 Creating debug level with name: ${debugLevelName}`);
                    
                    // Try with new CLI format first
                    try {
                        const debugvalues = `DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ApexCode=FINEST ApexProfiling=FINEST Callout=FINEST Database=FINEST System=FINEST Validation=FINEST Visualforce=FINEST Workflow=FINEST`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -18CREATE DEBUG LEVEL COMMAND: ${debugvalues}`);

                        debugLevelId = await this._sfdxService.createDebugLevel(debugvalues);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -19 Created debug level with ID: ${debugLevelId}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -20 Error creating debug level with new CLI format:', error);
                        
                        // Try with old CLI format
                        const debugLevelCmd = `sfdx force:data:record:create --sobjecttype DebugLevel --values "DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ApexCode=FINEST ApexProfiling=FINEST Callout=FINEST Database=FINEST System=FINEST Validation=FINEST Visualforce=FINEST Workflow=FINEST" --usetoolingapi --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -21 Creating debug level with command (old format): ${debugLevelCmd}`);
                        const debugLevelResult = await this._executeCommand(debugLevelCmd);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -22 Debug level creation RESULT (old format): ${debugLevelResult}`);
                        const debugLevelJson = JSON.parse(debugLevelResult);
                        debugLevelId = debugLevelJson.result.id;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -23 Created debug level with ID (old format): ${debugLevelId}`);
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -24 Error creating debug level:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    throw new Error(`Failed to create debug level: ${errorMessage}`);
                }
            }

            if (!debugLevelId) {
                throw new Error('Failed to create or find debug level');
            }

            // Delete existing trace flag if it exists
            if (existingTraceFlag) {
                try {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -25 Deleting existing trace flag: ${existingTraceFlag.Id}`);
                    
                    // Try with new CLI format first
                    try {
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        await this._executeCommand(`sf data delete record --type TraceFlag --record-id ${existingTraceFlag.Id} --use-tooling-api --target-org ${selectedOrg?.alias} --json`);
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -26 Successfully deleted existing trace flag');
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] Error deleting trace flag with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const deleteTraceFlagCommand = `sfdx force:data:record:delete --sobjecttype TraceFlag --sobjectid ${existingTraceFlag.Id} --usetoolingapi --json`;
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -27 DELETE TRACE COMMAND (old format): ${deleteTraceFlagCommand}`);
                            
                            const deleteTraceFlagResult = await this._executeCommand(deleteTraceFlagCommand);
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -28 Delete trace flag result (old format): ${deleteTraceFlagResult}`);
                        } catch (oldError: any) {
                            OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -29 Error deleting trace flag with old CLI format:', oldError);
                        }
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -30 Error deleting trace flag:', error);
                }
            }

            // Create a trace flag
            // Set expiration to 24 hours from now
            const now = new Date();
            const expirationDate = new Date();
            expirationDate.setHours(expirationDate.getHours() + 24);
            
            // Format dates for Salesforce API
            const formattedStartDate = now.toISOString();
            const formattedExpirationDate = expirationDate.toISOString();

            try {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -31 Creating trace flag for user: ${userId}, debug level: ${debugLevelId}`);
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -32 Start date: ${formattedStartDate}, expiration date: ${formattedExpirationDate}`);
                
                // Try with new CLI format first
                try {


					const debugvalues = `TracedEntityId=${userId} LogType=DEVELOPER_LOG DebugLevelId=${debugLevelId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}`;
                         OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -33 Creating debug level with command: ${debugvalues}`);

                        debugLevelId = await this._sfdxService.createTraceFlag(debugvalues);
						
						
                   
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -34 Created trace flag with ID: ${debugLevelId}`);
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -35 Error creating trace flag with new CLI format:', error);
                    
                    // Try with old CLI format
                    const traceFlagCmd = `sfdx force:data:record:create --sobjecttype TraceFlag --values "TracedEntityId=${userId} LogType=DEVELOPER_LOG DebugLevelId=${debugLevelId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --usetoolingapi --json`;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -36 Creating trace flag with command (old format): ${traceFlagCmd}`);
                    const traceFlagResult = await this._executeCommand(traceFlagCmd);
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -37 Trace flag creation result (old format): ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _turnOnDebugLog -38 Created trace flag with ID (old format): ${traceFlagJson.result.id}`);
                }
                
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _turnOnDebugLog -39 Successfully created trace flag');
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -40 Error creating trace flag:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new Error(`Failed to create trace flag: ${errorMessage}`);
            }

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'debugStatus', 
                success: true,
                message: 'Debug log enabled successfully for 24 hours'
            });

            // Show a notification
            vscode.window.showInformationMessage('Apex Debug Log enabled successfully for 24 hours');

            statusBarService.showSuccess('Debug log turned on');

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _turnOnDebugLog -41 -- Error:', error);
            statusBarService.showError(`Error turning on debug log: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to turn on debug log: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Clears all downloaded log files from the local directory
     */
    private async _clearLocalLogs(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _clearLocalLogs -- Clearing local logs');
            statusBarService.showProgress('Clearing local logs...');

            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Clearing local log files...' });

            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Clearing local log files');

            // Get the logs directory - prioritize workspace folder if available
            let logsDir: string;
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use workspace folder if available
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                logsDir = path.join(workspaceFolder, '.visbal', 'logs');
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Using workspace logs directory: ${logsDir}`);
            } else {
                // Fall back to home directory
                const visbalDir = path.join(os.homedir(), '.visbal');
                logsDir = path.join(visbalDir, 'logs');
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Using home logs directory: ${logsDir}`);
            }
            
            if (!fs.existsSync(logsDir)) {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Logs directory does not exist: ${logsDir}`);
                throw new Error(`Logs directory not found: ${logsDir}`);
            }

            // Read all files in the logs directory
            const files = await fs.promises.readdir(logsDir);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Found ${files.length} files in logs directory`);

            // Delete each file
            let deletedCount = 0;
            for (const file of files) {
                try {
                    const filePath = path.join(logsDir, file);
                    const stats = await fs.promises.stat(filePath);
                    
                    // Only delete files, not directories
                    if (stats.isFile()) {
                        await fs.promises.unlink(filePath);
                        deletedCount++;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted file: ${filePath}`);
                    } else {
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Skipping directory: ${filePath}`);
                    }
                } catch (error: any) {
                    OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting file ${file}:`, error);
                    // Continue with other files
                }
            }

            // Clear the downloaded logs tracking
            this._downloadedLogs.clear();
            this._downloadedLogPaths.clear();
            await this._cacheService.saveDownloadedLogs(this._downloadedLogs, this._downloadedLogPaths);

            // Update the UI
            this._updateWebviewContent();

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Successfully deleted ${deletedCount} log files`);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'clearLocalStatus', 
                success: true,
                message: `Successfully cleared ${deletedCount} log files`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully cleared ${deletedCount} log files`);

            statusBarService.showSuccess('Local logs cleared');

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _clearLocalLogs -- Error:', error);
            statusBarService.showError(`Error clearing local logs: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to clear local logs: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Deletes all logs from the Salesforce server
     */
    private async _deleteServerLogs(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogs -- Deleting server logs');
            statusBarService.showProgress('Deleting logs from Salesforce server...');

            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting server logs...' });

            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Deleting logs from server');

            // Get all log IDs
            const logIds = this._logs.map((log: any) => log.id).filter(Boolean);
            
            if (logIds.length === 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] No logs to delete');
                throw new Error('No logs to delete');
            }

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Found ${logIds.length} logs to delete`);

            // Delete logs in batches to avoid command line length limitations
            const batchSize = 10;
            let deletedCount = 0;
            
            for (let i = 0; i < logIds.length; i += batchSize) {
                const batch = logIds.slice(i, i + batchSize);
                try {
                    // Create a comma-separated list of IDs
                    const idList = batch.join(',');
                    
                    // Try with new CLI format first
                    try {
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        const deleteCmd = `sf data delete record --type ApexLog --record-ids ${idList} --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                        await this._executeCommand(deleteCmd);
                        
                        deletedCount += batch.length;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] Error deleting batch of logs with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            // For old CLI format, we need to delete one by one
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Trying to delete logs with old CLI format');
                            let batchDeletedCount = 0;
                            
                            for (const logId of batch) {
                                try {
                                    const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                    await this._executeCommand(oldDeleteCmd);
                                    batchDeletedCount++;
                                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted log ${logId} with old CLI format`);
                                } catch (singleError: any) {
                                    OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting log ${logId} with old CLI format:`, singleError);
                                    // Continue with other logs in the batch
                                }
                            }
                            
                            deletedCount += batchDeletedCount;
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                        } catch (oldFormatError: any) {
                            OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting batch of logs with old CLI format:`, oldFormatError);
                            // Continue with other batches
                        }
                    }
                } catch (error: any) {
                    OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting batch of logs:`, error);
                    // Continue with other batches
                }
            }

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Successfully deleted ${deletedCount} logs from server`);

            // Clear the cached logs
            this._logs = [];
            this._lastFetchTime = 0;
            await this._cacheService.saveCachedLogs([]);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteServerStatus', 
                success: true,
                message: `Successfully deleted ${deletedCount} logs from server`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} logs from server`);

            // Refresh the logs list
            await this._fetchLogs(true);

            statusBarService.showSuccess('Logs deleted from server');

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _deleteServerLogs -- Error:', error);
            statusBarService.showError(`Error deleting logs: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to delete server logs: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Deletes selected logs from the Salesforce server
     * @param logIds Array of log IDs to delete
     */
    private async _deleteSelectedLogs(logIds: string[]): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ 
                command: 'loading', 
                isLoading: true, 
                message: `Deleting ${logIds.length} selected logs...` 
            });

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteSelectedLogs -- Starting to delete ${logIds.length} selected logs`);

            if (!logIds || logIds.length === 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteSelectedLogs -- No logs to delete');
                this._view?.webview.postMessage({ 
                    command: 'deleteSelectedStatus', 
                    success: false,
                    error: 'No logs selected for deletion'
                });
                return;
            }

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Selected log IDs: ${logIds.join(', ')}`);

            // Delete logs in batches to avoid command line length limitations
            const batchSize = 10;
            let deletedCount = 0;
            
            for (let i = 0; i < logIds.length; i += batchSize) {
                const batch = logIds.slice(i, i + batchSize);
                try {
                    // Create a comma-separated list of IDs
                    const idList = batch.join(',');
                    
                    // Try with new CLI format first
                    try {
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        const deleteCmd = `sf data delete record --type ApexLog --record-ids ${idList} --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                        await this._executeCommand(deleteCmd);
                        
                        deletedCount += batch.length;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] Error deleting batch of logs with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            // For old CLI format, we need to delete one by one
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Trying to delete logs with old CLI format');
                            let batchDeletedCount = 0;
                            
                            for (const logId of batch) {
                                try {
                                    const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                    await this._executeCommand(oldDeleteCmd);
                                    batchDeletedCount++;
                                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted log ${logId} with old CLI format`);
                                } catch (singleError: any) {
                                    OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting log ${logId} with old CLI format:`, singleError);
                                    // Continue with other logs in the batch
                                }
                            }
                            
                            deletedCount += batchDeletedCount;
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                        } catch (oldFormatError: any) {
                            OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting batch of logs with old CLI format:`, oldFormatError);
                            // Continue with other batches
                        }
                    }
                } catch (error: any) {
                    OrgUtils.logError(`[VisbalExt.VisbalLogView] Error deleting batch of logs:`, error);
                    // Continue with other batches
                }
            }

            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Successfully deleted ${deletedCount} selected logs from server`);

            // Remove the deleted logs from the cached logs
            this._logs = this._logs.filter((log: any) => !logIds.includes(log.id));
            
            // Update the cache
            await this._cacheService.saveCachedLogs(this._logs);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteSelectedStatus', 
                success: true,
                message: `Successfully deleted ${deletedCount} selected logs from server`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} selected logs from server`);

            // Refresh the logs list
            await this._fetchLogs(true);

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error in _deleteSelectedLogs:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteSelectedStatus', 
                success: false,
                error: error.message || 'Unknown error'
            });
            
            vscode.window.showErrorMessage(`Failed to delete selected logs: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }


      /**
     * Applies debug configuration and optionally turns on debug log
     * @param config Debug configuration
     * @param turnOnDebug Whether to turn on debug log
     */
      private async _applyDebugConfig(config: any, turnOnDebug: boolean): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -1 -- Applying debug configuration:', config);
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -2 -- Selected org:', selectedOrg);
            // Set loading state
            this._isLoading = true;
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: true,
                message: turnOnDebug ? `Applying debug configuration on ${selectedOrg?.alias} and turning on debug...` : 'Applying debug configuration...'
            });
            

            
            // Determine preset name for the debug level name
            let presetName = 'Custom';
            // Check if config matches any of our presets
            const presets: Record<string, Record<string, string>> = {
                default: {
                    apexCode: 'FINE',
                    apexProfiling: 'INFO',
                    callout: 'INFO',
                    dataAccess: 'INFO',
                    database: 'INFO',
                    nba: 'INFO',
                    system: 'DEBUG',
                    validation: 'INFO',
                    visualforce: 'INFO',
                    wave: 'INFO',
                    workflow: 'INFO'
                },
                detailed: {
                    apexCode: 'FINE',
                    apexProfiling: 'FINE',
                    callout: 'FINER',
                    dataAccess: 'FINE',
                    database: 'FINE',
                    nba: 'FINE',
                    system: 'FINE',
                    validation: 'INFO',
                    visualforce: 'FINE',
                    wave: 'FINE',
                    workflow: 'FINE'
                },
                developer: {
                    apexCode: 'FINEST',
                    apexProfiling: 'FINEST',
                    callout: 'FINEST',
                    dataAccess: 'FINEST',
                    database: 'FINEST',
                    nba: 'FINEST',
                    system: 'FINEST',
                    validation: 'FINEST',
                    visualforce: 'FINEST',
                    wave: 'FINEST',
                    workflow: 'FINEST'
                },
                debugonly: {
                    apexCode: 'DEBUG',
                    apexProfiling: 'NONE',
                    callout: 'NONE',
                    dataAccess: 'NONE',
                    database: 'NONE',
                    nba: 'NONE',
                    system: 'DEBUG',
                    validation: 'NONE',
                    visualforce: 'NONE',
                    wave: 'NONE',
                    workflow: 'NONE'
                }
            };
            
            for (const [name, presetConfig] of Object.entries(presets)) {
                let isMatch = true;
                for (const key of Object.keys(presetConfig)) {
                    if (config[key] !== presetConfig[key]) {
                        isMatch = false;
                        break;
                    }
                }
                if (isMatch) {
                    presetName = name.charAt(0).toUpperCase() + name.slice(1);
                    break;
                }
            }
            
            // Generate a unique debug level name with timestamp
            const debugLevelName = `VisbalExt_${presetName}`;
            
            // Get the current user ID - needed for both applying config and turning on debug
            let userId = '';
            try {
                // Try with new CLI format first
                try {
                      //#region ALTERNATIVA                        
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -3 -- ALTERNATIVA Getting user ID with new CLI format');
                    userId = await OrgUtils.getCurrentUserId();
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -4 -- ALTERNATIVA Current user ID: ${userId}`);
                    //#endregion  ALTERNATIVA
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -5 -- Error getting user ID with new CLI format:', error);
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -6 -- Error getting user ID:', error);
                throw new Error('Failed to get current user ID. Make sure you are authenticated with a Salesforce org.');
            }

            if (!userId) {
                throw new Error('Could not determine current user ID');
            }

            // Check if there's an existing trace flag
            let existingTraceFlag = null;
            let existingDebugLevelId = null;
            
            try {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -7 -- Checking for existing trace flags');
                const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
                
                try {
                    const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --target-org ${selectedOrg?.alias} --json`);
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -8 -- Trace flag query result: ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        existingTraceFlag = traceFlagJson.result.records[0];
                        existingDebugLevelId = existingTraceFlag.DebugLevelId;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -9 -- Found existing trace flag: ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -10 -- Error checking trace flags with new CLI format:', error);
                    
                    try {
                        const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --target-org ${selectedOrg?.alias} --json`);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -11 -- Trace flag query result (old format): ${traceFlagResult}`);
                        const traceFlagJson = JSON.parse(traceFlagResult);
                        
                        if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                            existingTraceFlag = traceFlagJson.result.records[0];
                            existingDebugLevelId = existingTraceFlag.DebugLevelId;
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -12 -- Found existing trace flag (old format): ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                        }
                    } catch (oldError: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -13 -- Error checking trace flags with old CLI format:', oldError);
                    }
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -14 -- Error checking existing trace flag:', error);
            }

            // Create debug level values
            const debugLevelValues: Record<string, string> = {
                ApexCode: config.apexCode || 'FINE',
                ApexProfiling: config.apexProfiling || 'INFO',
                Callout: config.callout || 'INFO',
                Database: config.database || 'FINE',
                System: config.system || 'FINE',
                Validation: config.validation || 'INFO',
                Visualforce: config.visualforce || 'INFO',
                Workflow: config.workflow || 'INFO'
            };

            // Add NBA and Wave if they exist in the config
            if (config.nba) {
                debugLevelValues['NBA'] = config.nba;
            }
            if (config.wave) {
                debugLevelValues['Wave'] = config.wave;
            }
            if (config.dataAccess) {
                debugLevelValues['DataAccess'] = config.dataAccess;
            }

            // Create or update debug level
            let debugLevelId = existingDebugLevelId;

            if (existingDebugLevelId) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -15 -- Updating existing debug level');
                
                const debugLevelFields = Object.entries(debugLevelValues)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' ');
                
                try {
                    try {
                        const updateDebugLevelCommand = `sf data update record --sobject DebugLevel --record-id ${existingDebugLevelId} --values "${debugLevelFields}" --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -16 -- Updating debug level with command: ${updateDebugLevelCommand}`);
                        
                        const updateDebugLevelResult = await this._executeCommand(updateDebugLevelCommand);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -17 -- Update debug level result: ${updateDebugLevelResult}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -18 -- Error updating debug level with new CLI format:', error);
                        
                        try {
                            const updateDebugLevelCommand = `sfdx force:data:record:update --sobjecttype DebugLevel --sobjectid ${existingDebugLevelId} --values "${debugLevelFields}" --usetoolingapi --target-org ${selectedOrg?.alias} --json`;
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -19 -- Updating debug level with command (old format): ${updateDebugLevelCommand}`);
                            
                            const updateDebugLevelResult = await this._executeCommand(updateDebugLevelCommand);
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -20 -- Update debug level result (old format): ${updateDebugLevelResult}`);
                        } catch (oldError: any) {
                            OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -21 -- Error updating debug level with old CLI format:', oldError);
                            throw new Error('Failed to update debug level');
                        }
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -22 -- Error updating debug level:', error);
                    throw new Error('Failed to update debug level');
                }
            } else {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -23 -- Creating new debug level');
                
                const debugLevelFields = Object.entries(debugLevelValues)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' ');
                
                try {
                    try {
                          const debugvalues = `DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ${debugLevelFields}`;
                          OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -24 -- Creating debug level with command: ${debugvalues}`);
 
                         debugLevelId = await this._sfdxService.createDebugLevel(debugvalues);
         
                         
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -29 -- Error creating debug level with new CLI format:', error);
           
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -34 -- Error creating debug level:', error);
                    throw new Error('Failed to create debug level');
                }
            }

            if (existingTraceFlag) {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -35 -- Deleting existing trace flag: ${existingTraceFlag.Id}`);
                
                try {
                    try {
                        const deleteTraceFlagCommand = `sf data delete record --sobject TraceFlag --record-id ${existingTraceFlag.Id} --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -36 -- Deleting trace flag with command: ${deleteTraceFlagCommand}`);
                        
                        const deleteTraceFlagResult = await this._executeCommand(deleteTraceFlagCommand);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -37 -- Delete trace flag result: ${deleteTraceFlagResult}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -38 -- Error deleting trace flag with new CLI format:', error);
                        
                        
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -42 -- Error deleting trace flag:', error);
                }
            }

            if (turnOnDebug) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _applyDebugConfig -43 -- Creating trace flag');
                
                const now = new Date();
                const expirationDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const formattedStartDate = now.toISOString();
                const formattedExpirationDate = expirationDate.toISOString();
                
                try {
                    try {
                        const createTraceFlagCommand = `sf data create record --sobject TraceFlag --values "DebugLevelId=${debugLevelId} LogType=DEVELOPER_LOG TracedEntityId=${userId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -44 -- Creating trace flag with command: ${createTraceFlagCommand}`);
                        
                        const createTraceFlagResult = await this._executeCommand(createTraceFlagCommand);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -45 -- Create trace flag result: ${createTraceFlagResult}`);
                        
                        const createTraceFlagJson = JSON.parse(createTraceFlagResult);
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _applyDebugConfig -46 -- Created trace flag with ID: ${createTraceFlagJson.result.id}`);
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -47 -- Error creating trace flag with new CLI format:', error);
 
                    }
                } catch (error: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -52 -- Error creating trace flag:', error);
                    throw new Error('Failed to create trace flag');
                }
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _applyDebugConfig -53 -- Error in _applyDebugConfig:', error);
            
            this._view?.webview.postMessage({
                command: turnOnDebug ? 'debugStatus' : 'applyConfigStatus',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: false
            });
        }
    }

    /**
     * Gets the current debug configuration
     */
    private async _getCurrentDebugConfig(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] Getting current debug configuration');
            
            // Send a default configuration to the webview
            // This avoids making API calls when we don't have a valid connection
            if (this._view) {
                this._view.webview.postMessage({
                                command: 'currentDebugConfig',
                                config: {
                        'ApexCode': 'DEBUG',
                        'ApexProfiling': 'INFO',
                        'Callout': 'INFO',
                        'Database': 'INFO',
                        'System': 'DEBUG',
                        'Validation': 'INFO',
                        'Visualforce': 'INFO',
                        'Workflow': 'INFO',
                        'NBA': 'INFO',
                        'Wave': 'INFO'
                    }
                });
            }
            
            // Don't try to get the user ID or debug configuration from Salesforce
            return;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error in _getCurrentDebugConfig:', error);
            
            // Send a default configuration to the webview
            if (this._view) {
                this._view.webview.postMessage({
                command: 'currentDebugConfig',
                config: {
                        'ApexCode': 'DEBUG',
                        'ApexProfiling': 'INFO',
                        'Callout': 'INFO',
                        'Database': 'INFO',
                        'System': 'DEBUG',
                        'Validation': 'INFO',
                        'Visualforce': 'INFO',
                        'Workflow': 'INFO',
                        'NBA': 'INFO',
                        'Wave': 'INFO'
                    }
                });
            }
        }
    }

    /**
     * Delete all server logs using SOQL and Tooling API
     * This is an alternative implementation to compare performance with the standard deletion method
     */
    private async _deleteServerLogsViaSoql(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Starting to delete all server logs via SOQL');
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting all logs via SOQL...' });

            // Query all ApexLog IDs using SOQL
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Querying all ApexLog IDs');
            const query = 'SELECT Id FROM ApexLog';
            const records: any[] = await this._sfdxService.executeSoqlQuery(query, false, true);
          
            if (!records || !Array.isArray(records) || records.length === 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- No logs found to delete');
                vscode.window.showInformationMessage('No logs found to delete via SOQL');
                this._isLoading = false;
                return;
            }
            
            const logIds = records.map((record: any) => record.Id);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Found ${logIds.length} logs to delete`);
            
            if (logIds.length === 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- No logs found to delete');
                vscode.window.showInformationMessage('No logs found to delete via SOQL');
                this._isLoading = false;
                this._view?.webview.postMessage({ command: 'loading', isLoading: false });
                return;
            }
            
            // Delete logs using Tooling API
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Deleting ${logIds.length} logs`);
            
            // Create a comma-separated list of IDs in single quotes
            const idList = logIds.map((id: string) => `'${id}'`).join(',');
            const deleteCommand = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectids ${idList} --usetoolingapi --json`;
            
            const deleteResult = await this._executeCommand(deleteCommand);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Delete result:`, deleteResult);
            
            // Refresh logs after deletion
            await this._fetchLogs(true);
            
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Successfully deleted all logs via SOQL');
            vscode.window.showInformationMessage(`Successfully deleted ${logIds.length} logs via SOQL`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _deleteServerLogsViaSoql -- Error deleting logs via SOQL:', error);
            vscode.window.showErrorMessage(`Error deleting logs via SOQL: ${error.message || error}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Delete all logs using the SalesforceApiService
     */
    private async _deleteViaSoqlApi(): Promise<void> {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Starting to delete logs via SOQL API');
        
        if (this._isLoading) {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Already loading, ignoring request');
            return;
        }
        
        this._isLoading = true;
        this._view?.webview.postMessage({ command: 'loading', isLoading: true });
        
        try {
            // Import the SalesforceApiService
            const { SalesforceApiService } = require('../services/salesforceApiService');
            const salesforceApi = new SalesforceApiService();
            
            // Initialize the API service
            const initialized = await salesforceApi.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize Salesforce API service');
            }
            
            // Query for all log IDs
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Querying for log IDs');
            const query = "SELECT Id FROM ApexLog";
            const queryResult = await salesforceApi.query(query, true); // Use Tooling API
            
            if (!queryResult.records || !Array.isArray(queryResult.records) || queryResult.records.length === 0) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- No logs found to delete');
                vscode.window.showInformationMessage('No logs found to delete via SOQL API');
                return;
            }
            
            const logIds = queryResult.records.map((record: any) => record.Id);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Found ${logIds.length} logs to delete`);
            
            // Confirm deletion
            const confirmMessage = `Are you sure you want to delete ${logIds.length} logs? This action cannot be undone.`;
            const confirmed = await vscode.window.showWarningMessage(confirmMessage, { modal: true }, 'Yes', 'No') === 'Yes';
            
            if (!confirmed) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- User cancelled deletion');
                vscode.window.showInformationMessage('Log deletion cancelled');
                return;
            }
            
            // Delete each log using the API
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Deleting ${logIds.length} logs`);
            let successCount = 0;
            let errorCount = 0;
            
            for (const logId of logIds) {
                try {
                    await salesforceApi.deleteRecord('ApexLog', logId, true); // Use Tooling API
                    successCount++;
                } catch (error: any) {
                    OrgUtils.logError(`[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Error deleting log ${logId}:`, error);
                    errorCount++;
                }
            }
            
            // Show success message
            const message = `Successfully deleted ${successCount} logs via SOQL API${errorCount > 0 ? `, ${errorCount} errors` : ''}`;
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- ${message}`);
            vscode.window.showInformationMessage(message);
            
            // Refresh logs after deletion
            await this._fetchLogs(true);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _deleteViaSoqlApi -- Error deleting logs via SOQL API:', error);
            vscode.window.showErrorMessage(`Error deleting logs via SOQL API: ${error.message || error}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Fetches the content of a log
     * @param logId The ID of the log to fetch
     */
    private async _fetchLogContent(logId: string): Promise<string> {
        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Starting to fetch content for log: ${logId}`);
        try {
            // First, check if we can directly output to a file to avoid buffer issues
            let targetDir: string;
            
            // Check if we have a workspace folder
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use the .visbal/logs directory in the workspace
                targetDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visbal', 'logs');
            } else {
                // Use the user's home directory
                targetDir = path.join(os.homedir(), '.visbal', 'logs');
            }
            
            // Create the directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a temporary file path for direct output
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            // Format: id_operation_status_size_date.log with temp_ prefix
            const tempFilePath = path.join(targetDir, `temp_${sanitizedLogId}_${timestamp}.log`);
            
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Temp file path: ${tempFilePath}`);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Target directory: ${targetDir}`);
            
            // Try direct file output first (most reliable for large logs)
            try {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Trying direct file output to: ${tempFilePath}`);
                
                // Try with new CLI format first
                try {
                    const selectedOrg = await OrgUtils.getSelectedOrg();  
                    const command = `sf apex get log -i ${logId} > "${tempFilePath}" --target-org ${selectedOrg?.alias}`;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Executing direct output command: ${command}`);
                    await execAsync(command);
                    
                    // Check if the file was created and has content
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully wrote log to file: ${tempFilePath}`);
                        const logContent = fs.readFileSync(tempFilePath, 'utf8');
                        
                        // Clean up the temporary file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                        }
                        
                        return logContent;
                    }
                } catch (directOutputError) {
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Direct output with new CLI format failed, trying old format', directOutputError);
                    
                    // Try with old CLI format
                    try {
                        const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFilePath}"`;
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Executing direct output command with old format: ${command}`);
                        await execAsync(command);
                        
                        // Check if the file was created and has content
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully wrote log to file with old format: ${tempFilePath}`);
                            const logContent = fs.readFileSync(tempFilePath, 'utf8');
                            
                            // Clean up the temporary file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                            }
                            
                            return logContent;
                        }
                    } catch (oldDirectOutputError) {
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Direct output with old CLI format failed', oldDirectOutputError);
                    }
                }
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Direct file output approach failed, falling back to standard methods', error);
            }
            
            // If direct file output failed, try the standard methods with increased buffer size
            
            // Try to fetch the log using the new command format first
            let log;
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Trying to fetch log content with new CLI format');
            try {
                const selectedOrg = await OrgUtils.getSelectedOrg();
                const command = `sf apex get log -i ${logId} --json --target-org ${selectedOrg?.alias}`;
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Executing: ${command}`);
                const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully fetched log content with new CLI format');
                log = JSON.parse(logData);
                
                // Debug the response structure
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Response structure: ${JSON.stringify(Object.keys(log))}`);
                if (log.result) {
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Result structure: ${typeof log.result} ${Array.isArray(log.result) ? 'array' : 'not array'}`);
                    if (Array.isArray(log.result) && log.result.length > 0) {
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- First result item keys: ${JSON.stringify(Object.keys(log.result[0]))}`);
                    }
                }
                
                // Handle different response formats
                if (log.result) {
                    if (typeof log.result === 'string') {
                        // Direct log content as string
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content as string in result');
                        return log.result;
                    } else if (typeof log.result.log === 'string') {
                        // Log content in result.log
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in result.log');
                        return log.result.log;
                    } else if (Array.isArray(log.result) && log.result.length > 0) {
                        // Array result format
                        const firstResult = log.result[0];
                        
                        // Check for common properties that might contain the log
                        if (firstResult.log) {
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in result[0].log');
                            return firstResult.log;
                        } else if (firstResult.body) {
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in result[0].body');
                            return firstResult.body;
                        } else if (firstResult.content) {
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in result[0].content');
                            return firstResult.content;
                        } else if (firstResult.text) {
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in result[0].text');
                            return firstResult.text;
                        } else {
                            // If we can't find a specific property, try to stringify the first result
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- No specific log property found, using entire result object');
                            return JSON.stringify(firstResult, null, 2);
                        }
                    }
                }
                
                // If we couldn't find the log content in the expected places, try direct CLI output
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Could not find log content in JSON response, trying direct CLI output');
                throw new Error('Log content not found in expected format');
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Failed with new CLI format or parsing, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Executing: ${command}`);
                    const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                    OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully fetched log content with old CLI format');
                    log = JSON.parse(logData);
                    
                    // Debug the response structure
                    OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Old format response structure: ${JSON.stringify(Object.keys(log))}`);
                    
                    if (log.result && log.result.log) {
                        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _fetchLogContent -- Found log content in old format result.log`);
                        return log.result.log;
                    } else {
                        OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogContent -- Log not found in old format response:', log);
                        throw new Error('Log content not found in old format response');
                    }
                } catch (innerError: any) {
                    OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogContent -- Failed to fetch log content with both formats:', innerError);
                    
                    // Try one more approach - direct CLI output without JSON
                    try {
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Trying direct CLI output without JSON');
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        const { stdout: directOutput } = await execAsync(`sf apex get log -i ${logId} --target-org ${selectedOrg?.alias}`, { maxBuffer: MAX_BUFFER_SIZE });
                        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output');
                        if (directOutput && directOutput.trim().length > 0) {
                            return directOutput;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError: any) {
                        try {
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Trying direct CLI output with old format');
                            const { stdout: oldDirectOutput } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output (old format)');
                            if (oldDirectOutput && oldDirectOutput.trim().length > 0) {
                                return oldDirectOutput;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError: any) {
                            OrgUtils.logError('[VisbalExt.VisbalLogView] _fetchLogContent -- All attempts to fetch log content failed', oldDirectError );
                            throw new Error('Failed to fetch log content. The log may be too large to download. Please try using the Salesforce CLI directly.');
                        }
                    }
                }
            }
            
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.VisbalLogView] _fetchLogContent -- Error fetching log with ID ${logId}:`, error);
            throw error;
        }
    }

    /**
     * Checks for previously downloaded logs
     */
    private _checkDownloadedLogs(): void {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _checkDownloadedLogs -- Checking for previously downloaded logs');
        const downloadedLogs = this._context.globalState.get<string[]>('visbalDownloadedLogs', []);
        this._downloadedLogs = new Set<string>(downloadedLogs);
        
        // Load the paths of downloaded logs
        const downloadedLogPaths = this._context.globalState.get<Record<string, string>>('visbalDownloadedLogPaths', {});
        this._downloadedLogPaths = new Map<string, string>(Object.entries(downloadedLogPaths));
        
        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _checkDownloadedLogs -- Found ${this._downloadedLogs.size} previously downloaded logs`);
        OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _checkDownloadedLogs -- Found ${this._downloadedLogPaths.size} log file paths`);
        
        // Verify that the files still exist
        for (const [logId, filePath] of this._downloadedLogPaths.entries()) {
            if (!fs.existsSync(filePath)) {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _checkDownloadedLogs -- File not found for log ${logId}: ${filePath}`);
                this._downloadedLogPaths.delete(logId);
            } else {
                OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _checkDownloadedLogs -- Found file for log ${logId}: ${filePath}`);
            }
        }
        
        // Save the updated paths
        this._saveDownloadedLogs();
    }

    /**
     * Saves the list of downloaded logs to extension storage
     */
    private async _saveDownloadedLogs(): Promise<void> {
        try {
            await this._cacheService.saveDownloadedLogs(this._downloadedLogs, this._downloadedLogPaths);
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Saved ${this._downloadedLogs.size} downloaded logs to cache`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error saving downloaded logs:', error);
        }
    }

    /**
     * Gets the HTML for the webview
     */
    private _getWebviewContent(): string {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _getWebviewContent -- Getting HTML content for webview');
        
        // Get the base HTML template
        const baseHtml = getHtmlForWebview(this._extensionUri, this._view!.webview);
        
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] _getWebviewContent -- HTML content length:', baseHtml.length);
        return baseHtml;
    }

    /**
     * Refreshes the logs in the view
     */
    public refresh(): void {
        OrgUtils.logDebug('[VisbalExt.VisbalLogView] refresh -- Refreshing logs');
        statusBarService.showProgress('Refreshing logs...');
        this._fetchLogs(true).catch(error => {
            OrgUtils.logError('[VisbalExt.VisbalLogView] refresh -- Error:', error);
            statusBarService.showError(`Error refreshing logs: ${error.message}`);
        });
    }
    
    
    // Add a new method to open the default org
    public async openDefaultOrg(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] openDefaultOrg -- Opening default org');
            this._showLoading('Opening default org...');
            
            await OrgUtils.openDefaultOrg();
            
            this._showSuccess('Default org opened in browser');
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] openDefaultOrg -- Successfully opened default org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] openDefaultOrg -- Error opening default org:', error);
            this._showError(`Failed to open default org: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    }

    public async openSelectedOrg(): Promise<void> {
        try {
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] openSelectedOrg -- Opening default org');
            this._showLoading(`Opening ${selectedOrg?.alias} org...`);
            
            await OrgUtils.openSelectedOrg();
            
            this._showSuccess(`Selected org opened ${selectedOrg?.alias} in browser`);
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] openSelectedOrg -- Successfully opened default org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] openSelectedOrg -- Error opening default org:', error);
            this._showError(`Failed to open selected org: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    }
    

    private async _getLogContent(logId: string): Promise<string> {
        try {
			OrgUtils.logDebug('[VisbalExt.VisbalLogView] _getLogContent -- logId:',logId);
            const selectedOrg = await OrgUtils.getSelectedOrg();
            const tempFile = path.join(os.tmpdir(), `${logId}.log`);
            const command = `sf apex log get --log-id ${logId} > "${tempFile}" --target-org ${selectedOrg?.alias}`;
			OrgUtils.logDebug('[VisbalExt.VisbalLogView] _getLogContent -- command:',command);
            await this._executeCommand(command);
            const content = await readFile(tempFile, 'utf8');
            await unlink(tempFile);
            return content;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error getting log content:', error);
            throw error;
        }
    }

    private async _getLogContentJson(logId: string): Promise<any> {
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            const result = await this._executeCommand(`sf apex log get --log-id ${logId} --json --target-org ${selectedOrg?.alias}`);
            // ... rest of the method ...
        } catch (error: any) {
            // ... error handling ...
        }
    }

    private async _getLogContentDirect(logId: string): Promise<string> {
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            const { stdout } = await execAsync(`sf apex log get --log-id ${logId} --target-org ${selectedOrg?.alias}`, { maxBuffer: MAX_BUFFER_SIZE });
            return stdout;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error getting log content directly:', error);
            throw error;
        }
    }

    private async _fetchSalesforceLogs(): Promise<void> {
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            const result = await this._executeCommand(`sf apex log list --json --target-org ${selectedOrg?.alias}`);
            // ... rest of the method ...
        } catch (error: any) {
            // ... error handling ...
        }
    }

    private async _createDebugLevel(debugLevelName: string): Promise<string> {
        try {
			const debugvalues = `DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ApexCode=FINEST ApexProfiling=FINEST Callout=FINEST Database=FINEST System=FINEST Validation=FINEST Visualforce=FINEST Workflow=FINEST`;
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] Creating debug level with command: ${debugvalues}`);

            const debugLevelId = await this._sfdxService.createDebugLevel(debugvalues);
			
            return debugLevelId;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] Error creating debug level:', error);
            throw error;
        }
    }

    private _handleCliError(error: any): void {
        let errorMessage = 'An error occurred while executing the command.\n\n';

        if (error.message.includes('Salesforce CLI is not installed') || error.message.includes('SFDX CLI is not installed')) {
            errorMessage = 'Salesforce CLI is not installed. Please follow these steps:\n\n';
            errorMessage += '1. Install Node.js from:\n   https://nodejs.org\n\n';
            errorMessage += '2. Install the Salesforce CLI:\n   npm install -g @salesforce/cli\n\n';
            errorMessage += '3. Or download the installer from:\n   https://developer.salesforce.com/tools/salesforcecli\n\n';
            errorMessage += '4. After installation, authenticate with your org:\n';
            errorMessage += '- sf org login web\n\n';
            errorMessage += '5. Then try again.';
        } else if (error.message.includes('No authorization information found')) {
            errorMessage = 'Not authenticated with Salesforce. Please run:\n';
            errorMessage += '- sf org login web\n\n';
            errorMessage += 'Then try again.';
        } else if (error.message.includes('expired access/refresh token')) {
            errorMessage = 'Your Salesforce session has expired. Please re-authenticate:\n';
            errorMessage += '- sf org login web\n\n';
            errorMessage += 'Then try again.';
        } else if (error.message.includes('Update Available')) {
            errorMessage = 'Your Salesforce CLI needs to be updated. Please run:\n';
            errorMessage += '- sf update\n\n';
            errorMessage += 'Then authenticate with your org:\n';
            errorMessage += '- sf org login web\n\n';
            errorMessage += 'Then try again.';
        }

        this._showErrorMessage(errorMessage);
    }

    private _showErrorMessage(message: string): void {
        vscode.window.showErrorMessage(message);
    }


    private async _loadOrgList(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- Loading org list');
            
            // Try to get from cache first
            const cachedData = await this._orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- Using cached org list cachedData');
                orgs = cachedData.orgs;
            } else {
                OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- Fetching fresh org list');
                orgs = await OrgUtils.listOrgs();
                // Save to cache
                await this._orgListCacheService.saveOrgList(orgs);
            }

            // Get the selected org
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- Selected org:', selectedOrg);

            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- orgs:', orgs);
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- cachedData:', cachedData);
            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: selectedOrg?.alias
            });

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _loadOrgList -- Error loading org list:', error);
            this._showError(`Failed to load org list: ${error.message}`);
        }
    }

    

    /**
     * Refreshes the list of Salesforce orgs
     */
    private async _refreshOrgList(): Promise<void> {
        if (this._isRefreshing) {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }

        try {
            this._isRefreshing = true;
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _refreshOrgList -- Refreshing org list');
            
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: true,
                message: 'Refreshing organization list...'
            });

            const orgs = await OrgUtils.listOrgs();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _refreshOrgList -- orgs Save to the cache');
            // Save to cache
            await this._orgListCacheService.saveOrgList(orgs);
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _loadOrgList -- Selected org:', selectedOrg);

            // Send the categorized orgs to the webview
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: false,
                selectedOrg: selectedOrg?.alias
            });
            
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _refreshOrgList -- Successfully sent org list to webview');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _refreshOrgList -- Error refreshing org list:', error);
            this._showError(`Failed to refresh org list: ${error.message}`);
        } finally {
            this._isRefreshing = false;
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: false
            });
        }
    }

    /**
     * Sets the default Salesforce org
     * @param username The username of the org to set as default
     */
    private async _setDefaultOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _setDefaultOrg -- Setting default org: ${username}`);
            this._showLoading('Setting default org...');
            
            await OrgUtils.setDefaultOrg(username);
            
            // Refresh the org list to show the updated default
            await this._refreshOrgList();
            
            this._showSuccess('Default org updated successfully');
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] _setDefaultOrg -- Successfully set default org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _setDefaultOrg -- Error setting default org:', error);
            this._showError(`Failed to set default org: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.VisbalLogView] _setSelectedOrg -- Setting selected org: ${username}`);
            this._showLoading(`Setting selected org to ${username}...`);
            
            await OrgUtils.setSelectedOrg(username);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.VisbalLogView] _setSelectedOrg -- Error setting selected org:', error);
            this._showError(`Failed to set selected org: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    }
    

    private _showLoading(message: string): void {
        this._isLoading = true;
        this._view?.webview.postMessage({
            command: 'loading',
            isLoading: true,
            message: message
        });
    }

    private _hideLoading(): void {
        this._isLoading = false;
        this._view?.webview.postMessage({
            command: 'loading',
            isLoading: false
        });
    }

    private _showError(message: string): void {
        this._view?.webview.postMessage({
            command: 'error',
            error: message
        });
    }

    private _showSuccess(message: string): void {
        this._view?.webview.postMessage({
            command: 'info',
            message: message
        });
    }

    public async openLog(logId: string): Promise<void> {
        try {
            this._view?.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloading' 
            });
            const config = vscode.workspace.getConfiguration('visbal.apexLog');
            const defaultView = config.get<string>('defaultView', 'user_debug');
            await OrgUtils.openLog(logId, this._extensionUri, defaultView);

            this._view?.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloaded' 
            });
        } catch (error: any) {
            this._view?.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'error',
                error: error.message
            });
        }
    }

    public async downloadLog(logId: string): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] downloadLog -- logId:', logId);
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: true });

            // Update OrgUtils with current logs data
            OrgUtils.initialize(this._logs, this._context);
            await OrgUtils.downloadLog(logId);
            OrgUtils.logDebug('[VisbalExt.VisbalLogView] downloadLog _updateWebviewContent', logId);
            this._updateWebviewContent();
        } catch (error: any) {
            // Error handling is done by OrgUtils
            throw error;
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: false });
        }
    }
}