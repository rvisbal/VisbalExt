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
                    //OrgUtils.logDebug('[VisbalExt.OrgUtils] getSectionArray -- Skipping invalid org entry:', org);
                    continue;
                }
                
                const validStatus = (org.status && validStatuses.includes(org.status));
                const validconnectedStatus = (org.connectedStatus && validStatuses.includes(org.connectedStatus));
                // Skip orgs that can't be connected to
                if (!validStatus && !validconnectedStatus) {
                    //OrgUtils.logDebug(`[VisbalExt.OrgUtils] getSectionArray -- SKIP: ${org.alias} status:${org.status} connectedStatus:${org.connectedStatus}`);
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
            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- Fetching org list');
            const command = 'sf org list --json --all';
            const result = await execAsync(command);
            //OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- Raw result:', result.stdout);
            
            const parsedResult = JSON.parse(result.stdout);
            

            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- Parsed orgs:', parsedResult?.result?.length || 0);

            const groups: OrgGroups = {
                devHubs: this.getSectionArray(parsedResult.result.devHubs),
                sandboxes: this.getSectionArray(parsedResult.result.sandboxes),
                scratchOrgs: this.getSectionArray(parsedResult.result.scratchOrgs),
                nonScratchOrgs: this.getSectionArray(parsedResult.result.nonScratchOrgs),
                other: this.getSectionArray(parsedResult.result.other)
            };

            

            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- Successfully categorized orgs:', {
                devHubs: groups.devHubs.length,
                sandboxes: groups.sandboxes.length,
                scratchOrgs: groups.scratchOrgs.length,
                nonScratchOrgs: groups.nonScratchOrgs.length,
                other: groups.other.length
            });
            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- Returning groups:', groups);
            return groups;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] listOrgs -- Error fetching org list:', error as Error);
            throw new Error(`Failed to fetch org list: ${error.message}`);
        }
    }

    /**
     * Sets the default org
     * @param username The username of the org to set as default
     */
    public static async setDefaultOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setDefaultOrg -- Setting default org: ${username}`);
            await execAsync(`sf config set target-org=${username}`);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] setDefaultOrg -- Successfully set default org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] setDefaultOrg -- Error setting default org:', error as Error);
            throw new Error(`Failed to set default org: ${error.message}`);
        }
    }

    public static async setSelectedOrg(alias: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrg -- Setting selected org: ${alias}`);
            const cacheService = new CacheService(this._context);
            const selectedOrg: SelectedOrg = { alias, timestamp: new Date().toISOString() };
            await cacheService.saveCachedOrg(selectedOrg);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] setSelectedOrg -- Successfully set selected org');
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] setSelectedOrg -- Error setting selected org:', error as Error);
            throw new Error(`Failed to set selected org: ${error.message}`);
        }
    }

    public static async getSelectedOrg(): Promise<SelectedOrg | null> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Fetching selected org');
            const cacheService = new CacheService(this._context);
            const selectedOrg = await cacheService.getCachedOrg();
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Retrieved org:', selectedOrg);
            return selectedOrg;
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getSelectedOrg -- Error getting selected org:', error as Error);
            return null;
        }
    }

     //#region Organization Management
    public static async getCurrentOrgAlias(): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentOrgAlias -- this._orgAliasCache:', this._orgAliasCache);
            if (this._orgAliasCache) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentOrgAlias -- Date.now() - this._orgAliasCache.timestamp:', Date.now() - this._orgAliasCache.timestamp);
            }
            if (this._orgAliasCache && (Date.now() - this._orgAliasCache.timestamp) < this.CACHE_EXPIRATION) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentOrgAlias -- CACHED');
                return this._orgAliasCache.alias;
            }
            
            const alias = await this.sfdxService.getCurrentOrgAlias();
            this._orgAliasCache = {
                alias,
                timestamp: Date.now()
            };
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentOrgAlias -- SFDX & CACHED');
            return alias;
        } catch (error: any) {
            if (error instanceof Error) {
                OrgUtils.logError('[VisbalExt.OrgUtils] getCurrentOrgAlias Error:', error);
            } else {
                OrgUtils.logError('Unexpected error type:', error);
            }
            throw error;
        }
    }


    public static async getCurrentUserId(): Promise<string> {
        try {
            if (this._currentUserIdCache && (Date.now() - this._currentUserIdCache.timestamp) < this.CACHE_EXPIRATION) {
                return this._currentUserIdCache.userId;
            }
            
            //sf org display
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentUserId -- Getting current user ID');
            const userId = await this.sfdxService.getCurrentUserId();
            this._currentUserIdCache = {
                userId,
                timestamp: Date.now()
            };
            return userId;
        } catch (error: any) {
            if (error instanceof Error) {
                OrgUtils.logError('[VisbalExt.OrgUtils] getCurrentOrgAlias Error:', error);
            } else {
                OrgUtils.logError('Unexpected error type:', error);
            }
            throw error;
        }
    }

    /**
     * Opens the default org in a browser
     */
    public static async openDefaultOrg(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] openDefaultOrg -- Opening default org');
            await execAsync('sf org open');
            OrgUtils.logDebug('[VisbalExt.OrgUtils] openDefaultOrg -- Successfully opened default org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] openDefaultOrg -- Error opening default org:', error as Error);
            throw new Error(`Failed to open default org: ${error.message}`);
        }
    }

    public static async openSelectedOrg(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] openSelectedOrg -- Opening selected org');
            const selectedOrg = await this.getSelectedOrg();
            OrgUtils.logDebug('[VisbalExt.OrgUtils] openSelectedOrg -- Retrieved selectedOrg:', selectedOrg);
            await execAsync(`sf org open --target-org ${selectedOrg?.alias}`);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] openSelectedOrg -- Successfully opened selected org');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] openSelectedOrg -- Error opening selected org:', error as Error);
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

    public static parseResultJson(content: string): { isJson: boolean; hasError: boolean; content: null, rawContent: string } {
        const result = {
            isJson: false,
            hasError: false,
            content: null,
            rawContent: content,
            error: null as Error | null
        };
        try {
            result.rawContent = content;
            result.content = JSON.parse(content);
            result.isJson = true;
        } catch (error: any) {
           OrgUtils.logDebug(`[VisbalExt.OrgUtils] parseResultJson isJsonType -- error:`, error);
           OrgUtils.logDebug(`[VisbalExt.OrgUtils] parseResultJson isJsonType -- content:`, content);
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
    private static async _fetchLogContent(logId: string, useDefaultOrg: boolean = false): Promise<string> {
        try {
            const result = await this.sfdxService.getLogContent(logId, useDefaultOrg);
            return result;
        } catch (error: any) {
            if (error instanceof Error) {
                OrgUtils.logError('[VisbalExt.OrgUtils] _fetchLogContent Error:', error);
            } else {
                OrgUtils.logError('Unexpected error type:', error);
            }
            throw error;
        }
    }

    public static async getLogIdFromProgress(progress: any): Promise<string> {
        let result = '';
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress:`, progress);
            if (progress.runResult && progress.runResult.tests && progress.runResult.tests.length > 0) {
                let testId = progress.runResult.tests[0].Id;
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- testId:`, testId);
                const apiResult = await this._sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress  -- API_RESULT ${progress.className}.${progress.methodName} -- runResult:`, apiResult);
                if (apiResult.length > 0) {
                    result = apiResult[0].ApexLogId || '';
                }
            }
            else {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult:`, progress.runResult);
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult.tests:`, progress.runResult.tests);
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress.runResult.tests.length:`, progress.runResult.tests.length);
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
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogId -- testId:`, testId);
                const apiResult = await this._sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogId -- API_RESULT -- runResult:`, apiResult);
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
    public static async openLog(logId: string, extensionUri: vscode.Uri, tab: string, useDefaultOrg: boolean = false): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Opening log: ${logId} with tab: ${tab}`);
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
               
                const view = LogDetailView.createOrShow(extensionUri, localFilePath, logId);
                if (tab != '') {
                // Change to the requested tab after creation
                    view.changeTab(tab);
                }
                
                return;
            }

            // Fetch and save the log content
            const logContent = await this._fetchLogContent(logId, useDefaultOrg);
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const tempFile = path.join(os.tmpdir(), `sf_${sanitizedLogId}_${timestamp}.log`);
            
            await fs.promises.writeFile(tempFile, logContent);
            
                const view = LogDetailView.createOrShow(extensionUri, tempFile, logId);
                if (tab != '') {
                    // Change to the requested tab after creation
                    view.changeTab(tab);
                }

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
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- logsDir:', logsDir);

            // Ensure directory exists
            await fs.promises.mkdir(logsDir, { recursive: true });

            // Create filename
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const sanitizedOperation = operation.toLowerCase().replace(/[\/\\:*?"<>|]/g, '_');
            const sanitizedStatus = status.replace(/[\/\\:*?"<>|]/g, '_');
            const logFilename = `${sanitizedLogId}_${sanitizedOperation}_${sanitizedStatus}_${size}_${timestamp}.log`;
            const targetFilePath = path.join(logsDir, logFilename);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- targetFilePath:', targetFilePath);

            // Fetch and save log content
            const logContent = await this._fetchLogContent(logId);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- finish fetch:');
            await fs.promises.writeFile(targetFilePath, logContent);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- finish writing file:');

            // Update tracking
            this._downloadedLogs.add(logId);
            this._downloadedLogPaths.set(logId, targetFilePath);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogs:', this._downloadedLogs);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogPaths:', this._downloadedLogPaths);


            statusBarService.showSuccess('Log downloaded successfully');    
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- statusBarService.showSuccess');

            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- error:', error);
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
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -7 -- Checking for existing trace flags');
            const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
            
            try {
                const records =  await this.sfdxService.executeSoqlQuery(query, false, true);
                //const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --target-org ${selectedOrg?.alias} --json`);
                //OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -8 -- Trace flag query result: ${traceFlagResult}`);
                //const traceFlagJson = JSON.parse(traceFlagResult);
                
                if (records && records.length > 0) {
                    result.existingTraceFlag = records[0];
                    if (result.existingTraceFlag) {
                        result.existingDebugLevelId = result.existingTraceFlag.DebugLevelId;
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -9 -- Found existing trace flag: ${result.existingTraceFlag.Id}, debug level: ${result.existingDebugLevelId}`);
                    }
                }
            } catch (error: any) {
                if (error instanceof Error) {
                    OrgUtils.logError('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -10 -- Error checking trace flags with new CLI format:', error);
                } else {
                    OrgUtils.logError('Unexpected error type:', error);
                }
                
                try {
                    const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --target-org ${selectedOrg?.alias} --json`);
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -11 -- Trace flag query result (old format): ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        result.existingTraceFlag = traceFlagJson.result.records[0];
                        if (result.existingTraceFlag) {
                            result.existingDebugLevelId = result.existingTraceFlag.DebugLevelId;
                            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -12 -- Found existing trace flag (old format): ${result.existingTraceFlag.Id}, debug level: ${result.existingDebugLevelId}`);
                        }
                    }
                } catch (oldError: any) {
                    if (oldError instanceof Error) {
                        OrgUtils.logError('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -13 -- Error checking trace flags with old CLI format:', oldError);
                    } else {
                        OrgUtils.logError('Unexpected error type:', oldError);
                    }
                }
            }
        } catch (error: any) {
            if (error instanceof Error) {
                OrgUtils.logError('[VisbalExt.OrgUtils] getExistingDebugTraceFlag -14 -- Error checking existing trace flag:', error);
            } else {
                OrgUtils.logError('Unexpected error type:', error);
            }
        }
        return result;
    }

    public static async hasExistingDebugTraceFlag(): Promise<boolean> {
        const userId = await this.getCurrentUserId();
        OrgUtils.logDebug('[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- userId:', userId);
        const traceResult = await OrgUtils.getExistingDebugTraceFlag(userId);
        OrgUtils.logDebug('[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- traceResult:', traceResult);
        
        if (!traceResult.existingTraceFlag) {
            return false;
        }

        const now = new Date();
        const expirationDate = new Date(traceResult.existingTraceFlag.ExpirationDate);
        const isActive = expirationDate > now;
        
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- isActive: ${isActive}, expires: ${expirationDate}`);
        return isActive;
    }


    private static get sfdxService(): SfdxService {
        if (!this._sfdxService) {
            this._sfdxService = new SfdxService();
        }
        return this._sfdxService;
    }

    public static logError(message: string, error: any): void {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        const saveToFile = config.get<boolean>('saveToFile', true);
        const displayInConsole = config.get<boolean>('displayInConsole', true);
        
        if (saveToFile) {
            
            // Existing logic to save error to file
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found');
                }

                const errorDir = path.join(workspaceFolder.uri.fsPath, '.visbal', 'error');
                if (!fs.existsSync(errorDir)) {
                    fs.mkdirSync(errorDir, { recursive: true });
                }
                const prefix = message.split(']')[0].replace(/[^a-zA-Z0-9-_]/g, '').trim();
                const method = message.split(']')[1].replace(/[^a-zA-Z0-9-_]/g, '').trim();
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const errorFile = path.join(errorDir, `${prefix}.${method}.${timestamp}.log`);

                let fileContent = '';
                if (error instanceof Error) {
                    const errorMessage = error.message;
                    const errorStack = error.stack;
                    fileContent = `${message}\n${errorMessage}\n${errorStack}\n`;
                } else {
                    fileContent = `${message}\n${error}\n`;
                }

                fs.writeFileSync(errorFile, fileContent);

                this.logDebug(`ERROR:${fileContent}`);

                const deleteErrorLogsOlderThan = config.get<number>('deleteErrorLogsOlderThan', 1);
                const files = fs.readdirSync(errorDir);
                files.forEach(file => {
                    const fileDate = new Date(file.split('.')[2]);
                    if (fileDate < new Date(Date.now() - deleteErrorLogsOlderThan * 24 * 60 * 60 * 1000)) {
                        fs.unlinkSync(path.join(errorDir, file));
                    }
                });
            } catch (e) {
                console.error(`[VisbalExt.OrgUtils] logError -- Error logging error:`, e as Error);
            }
        }

        if (displayInConsole) {
            console.error(`${message}`, error);
        }
    }

    public static logDebug(message: string, o?: unknown, o2?: unknown): void {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        const saveToFile = config.get<boolean>('saveToFile', true);
        const displayInConsole = config.get<boolean>('displayInConsole', true);
        const debugMaxLength = config.get<number>('debugMaxLength', 250); // Default value, can be configured
        if (saveToFile) {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found');
                }

                const debugDir = path.join(workspaceFolder.uri.fsPath, '.visbal', 'debug');
                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(debugDir, { recursive: true });
                }
                const debugFile = path.join(debugDir, `debug.log`);
                const timestamp = new Date().toISOString();
                let logMessage = `[${timestamp}] ${message}\n`;
                if (o !== undefined) {
                    const jsonString = JSON.stringify(o);
                    logMessage += `[${timestamp}] ${jsonString.length > debugMaxLength ? jsonString.slice(0, debugMaxLength) + '...' : jsonString}\n`;
                }
                if (o2 !== undefined) {
                    const jsonString = JSON.stringify(o2);
                    logMessage += `[${timestamp}] ${jsonString.length > debugMaxLength ? jsonString.slice(0, debugMaxLength) + '...' : jsonString}\n`;
                }
                fs.appendFileSync(debugFile, logMessage);
            } catch (error: any) {
                console.error('[VisbalExt.OrgUtils] logDebug -- Error logging debug information:', error);
            }
        }

        if (displayInConsole) {
            if (o !== undefined) {
                console.log(`${message}`, o);
            }
            else {
                console.log(`${message}`);
            }
        }
    }
} 