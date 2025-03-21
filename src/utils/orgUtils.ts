import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execAsync, MAX_BUFFER_SIZE } from './execUtils';
import { LogDetailView } from '../views/logDetailView';
import { statusBarService } from '../services/statusBarService';
import { CacheService } from '../services/cacheService';
import { SfdxService } from '../services/sfdxService';

export interface SalesforceOrg {
    username: string;
    alias?: string;
    instanceUrl: string;
    isDefault: boolean;
    type: 'devHub' | 'sandbox' | 'scratchOrg' | 'nonScratchOrg' | 'other';
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    expirationDate?: string;
}

export interface OrgGroups {
    devHubs: SalesforceOrg[];
    sandboxes: SalesforceOrg[];
    scratchOrgs: SalesforceOrg[];
    nonScratchOrgs: SalesforceOrg[];
    other: SalesforceOrg[];
}

export interface SelectedOrg {
    alias: string;
    timestamp: string;
}

export class OrgUtils {
    private static _downloadedLogs: Set<string> = new Set<string>();
    private static _downloadedLogPaths: Map<string, string> = new Map<string, string>();
    private static _logs: any[] = [];
    private static _context: vscode.ExtensionContext;
    private static _sfdxService: SfdxService;

    /**
     * Initialize the OrgUtils class with necessary data
     * @param logs Array of log objects
     * @param context VSCode extension context
     */
    public static initialize(logs: any[], context: vscode.ExtensionContext): void {
        this._logs = logs;
        this._context = context;
        this._sfdxService = new SfdxService();
    }

    /**
     * Set downloaded logs data
     * @param downloadedLogs Set of downloaded log IDs
     * @param downloadedLogPaths Map of log IDs to their file paths
     */
    public static setDownloadedLogsData(downloadedLogs: Set<string>, downloadedLogPaths: Map<string, string>): void {
        this._downloadedLogs = downloadedLogs;
        this._downloadedLogPaths = downloadedLogPaths;
    }


    public static getSectionArray(orgs: Set<object>): any[] {
        if (Array.isArray(orgs)) {
            const result = [];
            const validStatuses = ['Active', 'Connected', 'Connected (Scratch Org)'];
            for (const org of orgs) {
                if (!org || typeof org !== 'object') {
                    console.log('[VisbalExt.OrgUtils] listOrgs -- Skipping invalid org entry:', org);
                    continue;
                }
                
                const validStatus = (org.status && validStatuses.includes(org.status));
                const validconnectedStatus = (org.connectedStatus && validStatuses.includes(org.connectedStatus));
                // Skip orgs that can't be connected to
                if (!validStatus && !validconnectedStatus) {
                    console.log(`[VisbalExt.OrgUtils] listOrgs -- SKIP: ${org.alias} status:${org.status} connectedStatus:${org.connectedStatus}`);
                    continue;
                }

                const orgInfo: SalesforceOrg = {
                    username: org.username || 'Unknown',
                    alias: org.alias,
                    instanceUrl: org.instanceUrl || 'Unknown',
                    isDefault: org.isDefaultUsername || false,
                    type: org.isDevHub ? 'devHub' : org.isSandbox ? 'sandbox' : org.isScratch ? 'scratchOrg' : org.isNonScratch ? 'nonScratchOrg' : 'other',
                    clientId: org.clientId || 'Unknown',
                    clientSecret: org.clientSecret || 'Unknown',
                    redirectUri: org.redirectUri || 'Unknown',
                    expirationDate: org.expirationDate || 'Unknown',
                };
                result.push(orgInfo);
            }
            return result;
        }
        else {
            return [];
        }
    }

    /**
     * Fetches and categorizes all Salesforce orgs
     * @returns Promise<OrgGroups> Object containing categorized orgs
     */
    public static async listOrgs(): Promise<OrgGroups> {
        try {
            console.log('[VisbalExt.OrgUtils] listOrgs -- Fetching org list');
            const command = 'sf org list --json --all';
            const result = await execAsync(command);
            //console.log('[VisbalExt.OrgUtils] listOrgs -- Raw result:', result.stdout);
            
            const parsedResult = JSON.parse(result.stdout);
            

            console.log('[VisbalExt.OrgUtils] listOrgs -- Parsed orgs:', parsedResult);

            const groups: OrgGroups = {
                devHubs: this.getSectionArray(parsedResult.result.devHubs),
                sandboxes: this.getSectionArray(parsedResult.result.sandboxes),
                scratchOrgs: this.getSectionArray(parsedResult.result.scratchOrgs),
                nonScratchOrgs: this.getSectionArray(parsedResult.result.nonScratchOrgs),
                other: this.getSectionArray(parsedResult.result.other)
            };

            

            console.log('[VisbalExt.OrgUtils] listOrgs -- Successfully categorized orgs:', {
                devHubs: groups.devHubs.length,
                sandboxes: groups.sandboxes.length,
                scratchOrgs: groups.scratchOrgs.length,
                nonScratchOrgs: groups.nonScratchOrgs.length,
                other: groups.other.length
            });
            console.log('[VisbalExt.OrgUtils] listOrgs -- Returning groups:', groups);
            return groups;
        } catch (error: any) {
            console.error('[VisbalExt.OrgUtils] listOrgs -- Error fetching org list:', error);
            throw new Error(`Failed to fetch org list: ${error.message}`);
        }
    }

    /**
     * Sets the default org
     * @param username The username of the org to set as default
     */
    public static async setDefaultOrg(username: string): Promise<void> {
        try {
            console.log(`[VisbalExt.OrgUtils] setDefaultOrg -- Setting default org: ${username}`);
            await execAsync(`sf config set target-org=${username}`);
            console.log('[VisbalExt.OrgUtils] setDefaultOrg -- Successfully set default org');
        } catch (error: any) {
            console.error('[VisbalExt.OrgUtils] setDefaultOrg -- Error setting default org:', error);
            throw new Error(`Failed to set default org: ${error.message}`);
        }
    }

    public static async setSelectedOrg(alias: string): Promise<void> {
        try {
            console.log(`[VisbalExt.OrgUtils] setSelectedOrg -- Setting selected org: ${alias}`);
            const cacheService = new CacheService(this._context);
            const selectedOrg: SelectedOrg = { alias, timestamp: new Date().toISOString() };
            await cacheService.saveCachedOrg(selectedOrg);
            console.log('[VisbalExt.OrgUtils] setSelectedOrg -- Successfully set selected org');
        }
        catch (error: any) {
            console.error('[VisbalExt.OrgUtils] setSelectedOrg -- Error setting selected org:', error);
            throw new Error(`Failed to set selected org: ${error.message}`);
        }
    }

    public static async getSelectedOrg(): Promise<SelectedOrg | null> {
        try {
            console.log('[VisbalExt.OrgUtils] getSelectedOrg -- Fetching selected org');
            const cacheService = new CacheService(this._context);
            const selectedOrg = await cacheService.getCachedOrg();
            console.log('[VisbalExt.OrgUtils] getSelectedOrg -- Retrieved org:', selectedOrg);
            return selectedOrg;
        }
        catch (error: any) {
            console.error('[VisbalExt.OrgUtils] getSelectedOrg -- Error getting selected org:', error);
            return null;
        }
    }

    /**
     * Opens the default org in a browser
     */
    public static async openDefaultOrg(): Promise<void> {
        try {
            console.log('[VisbalExt.OrgUtils] openDefaultOrg -- Opening default org');
            await execAsync('sf org open');
            console.log('[VisbalExt.OrgUtils] openDefaultOrg -- Successfully opened default org');
        } catch (error: any) {
            console.error('[VisbalExt.OrgUtils] openDefaultOrg -- Error opening default org:', error);
            throw new Error(`Failed to open default org: ${error.message}`);
        }
    }

    public static async openSelectedOrg(): Promise<void> {
        try {
            console.log('[VisbalExt.OrgUtils] openSelectedOrg -- Opening selected org');
            const selectedOrg = await this.getSelectedOrg();
            console.log('[VisbalExt.OrgUtils] openSelectedOrg -- Retrieved selectedOrg:', selectedOrg);
            await execAsync(`sf org open --target-org ${selectedOrg?.alias}`);
            console.log('[VisbalExt.OrgUtils] openSelectedOrg -- Successfully opened selected org');
        } catch (error: any) {
            console.error('[VisbalExt.OrgUtils] openSelectedOrg -- Error opening selected org:', error);
            throw new Error(`Failed to open selected org: ${error.message}`);
        }
    }
    
    /**
     * Execute a CLI command
     * @param command Command to execute
     * @returns Promise<string> Command output
     */
    private static async _executeCommand(command: string): Promise<string> {
        try {
            const { stdout } = await execAsync(command);
            return stdout;
        } catch (error: any) {
            throw new Error(`Command execution failed: ${error.message}`);
        }
    }

    /**
     * Fetch log content from Salesforce
     * @param logId ID of the log to fetch
     * @returns Promise<string> Log content
     */
    private static async _fetchLogContent(logId: string): Promise<string> {
        let logContent: string | null = null;
        let error: Error | null = null;

        // Try new CLI format first
        try {
            const result = await this._sfdxService.getLogContent(logId);
            console.log('[VisbalExt.OrgUtils] _fetchLogContent -- Result:', result);
            const jsonResult = JSON.parse(result);
            if (jsonResult?.result?.log) {
                return jsonResult.result.log;
            }
        } catch (e) {
            error = e as Error;
        }

        throw new Error('Failed to fetch log content');
    }

    /**
     * Opens a log in the editor
     * @param logId The ID of the log to open
     * @param extensionUri The extension's URI for creating the detail view
     */
    public static async openLog(logId: string, extensionUri: vscode.Uri): Promise<void> {
        try {
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
                LogDetailView.createOrShow(extensionUri, localFilePath, logId);
                return;
            }

            // Fetch and save the log content
            const logContent = await this._fetchLogContent(logId);
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const tempFile = path.join(os.tmpdir(), `sf_${sanitizedLogId}_${timestamp}.log`);
            
            await fs.promises.writeFile(tempFile, logContent);
            LogDetailView.createOrShow(extensionUri, tempFile, logId);

            // Mark as downloaded
            this._downloadedLogs.add(logId);
            this._downloadedLogPaths.set(logId, tempFile);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to open log: ${error.message}`);
            throw error;
        }
    }

    /**
     * Downloads a log
     * @param logId The ID of the log to download
     */
    public static async downloadLog(logId: string): Promise<void> {
        try {
            statusBarService.showProgress(`Downloading log: ${logId}...`);

            // Get log details
            const logDetails = this._logs.find((log: any) => log.id === logId);
            const operation = logDetails?.operation || 'unknown';
            const status = logDetails?.status || 'unknown';
            const size = logDetails?.logLength || 0;

            // Determine target directory
            const logsDir = vscode.workspace.workspaceFolders?.[0]
                ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visbal', 'logs')
                : path.join(os.homedir(), '.visbal', 'logs');

            // Ensure directory exists
            await fs.promises.mkdir(logsDir, { recursive: true });

            // Create filename
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const sanitizedOperation = operation.toLowerCase().replace(/[\/\\:*?"<>|]/g, '_');
            const sanitizedStatus = status.replace(/[\/\\:*?"<>|]/g, '_');
            const logFilename = `${sanitizedLogId}_${sanitizedOperation}_${sanitizedStatus}_${size}_${timestamp}.log`;
            const targetFilePath = path.join(logsDir, logFilename);

            // Fetch and save log content
            const logContent = await this._fetchLogContent(logId);
            await fs.promises.writeFile(targetFilePath, logContent);

            // Update tracking
            this._downloadedLogs.add(logId);
            this._downloadedLogPaths.set(logId, targetFilePath);

            statusBarService.showSuccess('Log downloaded successfully');

            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            statusBarService.showError(`Error downloading log: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to download log: ${error.message}`);
            throw error;
        }
    }
} 