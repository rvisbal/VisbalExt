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

interface LogResult {
    log: string;
}

interface TraceFlag {
    Id: string;
    LogType: string;
    StartDate: string;
    ExpirationDate: string;
    DebugLevelId: string;
}

export class OrgUtils {
    private static _downloadedLogs: Set<string> = new Set<string>();
    private static _downloadedLogPaths: Map<string, string> = new Map<string, string>();
    private static _logs: any[] = [];
    private static _context: vscode.ExtensionContext;
    private static _sfdxService: SfdxService;
    private static _orgAliasCache: { alias: string; timestamp: number } | null = null;
    private static _currentUserIdCache: { userId: string; timestamp: number } | null = null;
    private static readonly CACHE_EXPIRATION = 15 * 60 * 1000; // 15 minutes in milliseconds

    

    /**
     * Initialize the OrgUtils class with necessary data
     * @param logs Array of log objects
     * @param context VSCode extension context
     */
    public static initialize(logs: any[], context: vscode.ExtensionContext): void {
        this._logs = logs;
        this._context = context;
        // Initialize sfdxService if needed
        this.sfdxService;
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
                    //console.log('[VisbalExt.OrgUtils] getSectionArray -- Skipping invalid org entry:', org);
                    continue;
                }
                
                const validStatus = (org.status && validStatuses.includes(org.status));
                const validconnectedStatus = (org.connectedStatus && validStatuses.includes(org.connectedStatus));
                // Skip orgs that can't be connected to
                if (!validStatus && !validconnectedStatus) {
                    //console.log(`[VisbalExt.OrgUtils] getSectionArray -- SKIP: ${org.alias} status:${org.status} connectedStatus:${org.connectedStatus}`);
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

     //#region Organization Management
    public static async getCurrentOrgAlias(): Promise<string> {
        try {
            console.log('[VisbalExt.OrgUtils] getCurrentOrgAlias -- this._orgAliasCache:', this._orgAliasCache);
            if (this._orgAliasCache) {
                console.log('[VisbalExt.OrgUtils] getCurrentOrgAlias -- Date.now() - this._orgAliasCache.timestamp:', Date.now() - this._orgAliasCache.timestamp);
            }
            if (this._orgAliasCache && (Date.now() - this._orgAliasCache.timestamp) < this.CACHE_EXPIRATION) {
                console.log('[VisbalExt.OrgUtils] getCurrentOrgAlias -- CACHED');
                return this._orgAliasCache.alias;
            }
            
            const alias = await this.sfdxService.getCurrentOrgAlias();
            this._orgAliasCache = {
                alias,
                timestamp: Date.now()
            };
            console.log('[VisbalExt.OrgUtils] getCurrentOrgAlias -- SFDX & CACHED');
            return alias;
        } catch (error) {
            console.error('[VisbalExt.OrgUtils] getCurrentOrgAlias Error:', error);
            throw error;
        }
    }


    public static async getCurrentUserId(): Promise<string> {
        try {
            if (this._currentUserIdCache && (Date.now() - this._currentUserIdCache.timestamp) < this.CACHE_EXPIRATION) {
                return this._currentUserIdCache.userId;
            }
            
            //sf org display
            console.log('[VisbalExt.OrgUtils] getCurrentUserId -- Getting current user ID');
            const userId = await this.sfdxService.getCurrentUserId();
            this._currentUserIdCache = {
                userId,
                timestamp: Date.now()
            };
            return userId;
        } catch (error) {
            console.error('[VisbalExt.OrgUtils] getCurrentOrgAlias Error:', error);
            throw error;
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

    public static parseResultJson(content: string): { isJson: boolean; hasError: boolean; content: LogResult[] | null, rawContent: string } {
        const result = {
            isJson: false,
            hasError: false,
            content: null as LogResult[] | null,
            rawContent: content,
            error: null as Error | null
        };
        try {
            result.rawContent = content;
            result.content = JSON.parse(content);
            result.isJson = true;
        } catch (error: any) {
           console.log(`[VisbalExt.OrgUtils] parseResultJson isJsonType -- error:`, error);
           console.log(`[VisbalExt.OrgUtils] parseResultJson isJsonType -- content:`, content);
           result.hasError = true;
           result.error = error as Error;
        } finally {
            return result;
        }
    }

    /**
     * Fetch log content from Salesforce
     * @param logId ID of the log to fetch
     * @returns Promise<string> Log content
     */
    private static async _fetchLogContent(logId: string): Promise<string> {
        try {
            const result = await this.sfdxService.getLogContent(logId);
            return result;
        } catch (error) {
            console.error('[VisbalExt.OrgUtils] _fetchLogContent Error:', error);
            throw error;
        }
    }

    public static async getLogIdFromProgress(progress: any): Promise<string> {
        let result = '';
        try {
            console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress:`, progress);
            if (progress.runResult && progress.runResult.tests && progress.runResult.tests.length > 0) {
                let testId = progress.runResult.tests[0].Id;
                console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress -- testId:`, testId);
                const apiResult = await this._sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
                console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress  -- API_RESULT ${progress.className}.${progress.methodName} -- runResult:`, apiResult);
                if (apiResult.length > 0) {
                    result = apiResult[0].ApexLogId || '';
                }
            }
            else {
                console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult:`, progress.runResult);
                console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult.tests:`, progress.runResult.tests);
                console.log(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult.tests.length:`, progress.runResult.tests.length);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to get log id for ${progress.className}.${progress.methodName}: ${error.message}`);
            throw error;
        }
        return result;
    }

    public static async getLogId(testId: string): Promise<string> {
        let result = '';
        try {
            if (testId) {
                console.log(`[VisbalExt.OrgUtils] getLogId -- testId:`, testId);
                const apiResult = await this._sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
                console.log(`[VisbalExt.OrgUtils] getLogId -- API_RESULT -- runResult:`, apiResult);
                if (apiResult.length > 0) {
                    result = apiResult[0].ApexLogId || '';
                }
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to get log id for : ${error.message}`);
            throw error;
        }
        return result;
    }



    /**
     * Opens a log in the editor
     * @param logId The ID of the log to open
     * @param extensionUri The extension's URI for creating the detail view
     * @param tab The tab to open initially (e.g., 'overview', 'timeline', 'execution', etc.)
     */
    public static async openLog(logId: string, extensionUri: vscode.Uri, tab: string): Promise<void> {
        try {
            console.log(`[VisbalExt.OrgUtils] openLog -- Opening log: ${logId} with tab: ${tab}`);
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
                const view = LogDetailView.createOrShow(extensionUri, localFilePath, logId);
                // Change to the requested tab after creation
                view.changeTab(tab);
                return;
            }

            // Fetch and save the log content
            const logContent = await this._fetchLogContent(logId);
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const tempFile = path.join(os.tmpdir(), `sf_${sanitizedLogId}_${timestamp}.log`);
            
            await fs.promises.writeFile(tempFile, logContent);
            const view = LogDetailView.createOrShow(extensionUri, tempFile, logId);
            // Change to the requested tab after creation
            view.changeTab(tab);

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
            console.log('[VisbalExt.OrgUtils] downloadLog -- logsDir:', logsDir);

            // Ensure directory exists
            await fs.promises.mkdir(logsDir, { recursive: true });

            // Create filename
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const sanitizedOperation = operation.toLowerCase().replace(/[\/\\:*?"<>|]/g, '_');
            const sanitizedStatus = status.replace(/[\/\\:*?"<>|]/g, '_');
            const logFilename = `${sanitizedLogId}_${sanitizedOperation}_${sanitizedStatus}_${size}_${timestamp}.log`;
            const targetFilePath = path.join(logsDir, logFilename);
            console.log('[VisbalExt.OrgUtils] downloadLog -- targetFilePath:', targetFilePath);

            // Fetch and save log content
            const logContent = await this._fetchLogContent(logId);
            console.log('[VisbalExt.OrgUtils] downloadLog -- finish fetch:');
            await fs.promises.writeFile(targetFilePath, logContent);
            console.log('[VisbalExt.OrgUtils] downloadLog -- finish writing file:');

            // Update tracking
            this._downloadedLogs.add(logId);
            this._downloadedLogPaths.set(logId, targetFilePath);
            console.log('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogs:', this._downloadedLogs);
            console.log('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogPaths:', this._downloadedLogPaths);


            statusBarService.showSuccess('Log downloaded successfully');    
            console.log('[VisbalExt.OrgUtils] downloadLog -- statusBarService.showSuccess');

            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            console.log('[VisbalExt.OrgUtils] downloadLog -- error:', error);
            statusBarService.showError(`Error downloading log: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to download log: ${error.message}`);
            throw error;
        }
    }


    public static async getExistingDebugTraceFlag(userId: string): Promise<{ existingTraceFlag: TraceFlag | null, existingDebugLevelId: string | null }> {
        let result = {
            existingTraceFlag: null as TraceFlag | null,
            existingDebugLevelId: null as string | null
        };
        
        const selectedOrg = await OrgUtils.getSelectedOrg();
        try {
            console.log('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -7 -- Checking for existing trace flags');
            const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
            
            try {
                const records =  await this.sfdxService.executeSoqlQuery(query, false, true);
                //const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --target-org ${selectedOrg?.alias} --json`);
                //console.log(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -8 -- Trace flag query result: ${traceFlagResult}`);
                //const traceFlagJson = JSON.parse(traceFlagResult);
                
                if (records && records.length > 0) {
                    result.existingTraceFlag = records[0];
                    if (result.existingTraceFlag) {
                        result.existingDebugLevelId = result.existingTraceFlag.DebugLevelId;
                        console.log(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -9 -- Found existing trace flag: ${result.existingTraceFlag.Id}, debug level: ${result.existingDebugLevelId}`);
                    }
                }
            } catch (error) {
                console.error('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -10 -- Error checking trace flags with new CLI format:', error);
                
                try {
                    const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --target-org ${selectedOrg?.alias} --json`);
                    console.log(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -11 -- Trace flag query result (old format): ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        result.existingTraceFlag = traceFlagJson.result.records[0];
                        if (result.existingTraceFlag) {
                            result.existingDebugLevelId = result.existingTraceFlag.DebugLevelId;
                            console.log(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -12 -- Found existing trace flag (old format): ${result.existingTraceFlag.Id}, debug level: ${result.existingDebugLevelId}`);
                        }
                    }
                } catch (oldError) {
                    console.error('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -13 -- Error checking trace flags with old CLI format:', oldError);
                }
            }
        } catch (error) {
            console.error('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -14 -- Error checking existing trace flag:', error);
        }
        return result;
    }

    public static async hasExistingDebugTraceFlag(): Promise<boolean> {
        const userId = await this.getCurrentUserId();
        console.log('[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- userId:', userId);
        const traceResult = await OrgUtils.getExistingDebugTraceFlag(userId);
        console.log('[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- traceResult:', traceResult);
        
        if (!traceResult.existingTraceFlag) {
            return false;
        }

        const now = new Date();
        const expirationDate = new Date(traceResult.existingTraceFlag.ExpirationDate);
        const isActive = expirationDate > now;
        
        console.log(`[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- isActive: ${isActive}, expires: ${expirationDate}`);
        return isActive;
    }


    private static get sfdxService(): SfdxService {
        if (!this._sfdxService) {
            this._sfdxService = new SfdxService();
        }
        return this._sfdxService;
    }
} 