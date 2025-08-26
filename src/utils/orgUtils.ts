import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execAsync, MAX_BUFFER_SIZE } from './execUtils';
import { LogDetailView } from '../views/logDetailView';
import { statusBarService } from '../services/statusBarService';
import { CacheService } from '../services/cacheService';
import { SfdxService } from '../services/sfdxService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { ViewId } from '../types/salesforceTypes';
import * as cp from 'child_process';

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
    orgId?: string;
    connectedStatus?: string;
    accessToken?: string;
    instanceApiVersion?: string;
    instanceApiVersionLastRetrieved?: string;
    isDefaultDevHubUsername?: boolean;
    isDefaultUsername?: boolean;
    isDevHub?: boolean;
    lastUsed?: string;
    namespacePrefix?: string;
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

interface SelectedTestsConfig {
    methods: { [key: string]: boolean };
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
    public static DEBUG_MODE = false;

    

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
            const seenOrgs = new Set<string>(); // Track unique orgs by username+orgId
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

                // Create unique identifier to prevent duplicates within this section
                const uniqueId = `${org.username || 'unknown'}_${org.orgId || org.instanceUrl || 'nokey'}`;
                if (seenOrgs.has(uniqueId)) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getSectionArray -- Skipping duplicate org: ${org.alias || org.username}`);
                    continue;
                }
                seenOrgs.add(uniqueId);

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
                    orgId: org.orgId,
                    connectedStatus: org.connectedStatus,
                    accessToken: org.accessToken,
                    instanceApiVersion: org.instanceApiVersion,
                    instanceApiVersionLastRetrieved: org.instanceApiVersionLastRetrieved,
                    isDefaultDevHubUsername: org.isDefaultDevHubUsername,
                    isDefaultUsername: org.isDefaultUsername,
                    isDevHub: org.isDevHub,
                    lastUsed: org.lastUsed,
                    namespacePrefix: org.namespacePrefix,
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
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] listOrgs -- command${command} Raw result:`, result);
            
            const parsedResult = JSON.parse(result.stdout);
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] listOrgs -- command${command} parsedResult:`, parsedResult);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- parsedResult?.result?.length:', parsedResult?.result?.length || 0);
            OrgUtils.logDebug('[VisbalExt.OrgUtils] listOrgs -- parsedResult?.result:', parsedResult?.result);
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
            
            // First try to get from cache service
            const cacheService = new CacheService(this._context);
            const selectedOrg = await cacheService.getCachedOrg();
            
            if (selectedOrg) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Retrieved org from cache:', selectedOrg);
                return selectedOrg;
            }
            
            // Fallback: Try to find any view-specific selection as the most recently selected org
            // This helps when switching to a new org that doesn't have global cache yet
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const viewOrgCacheFile = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache', 'view-org-selections.json');
                    
                    if (fs.existsSync(viewOrgCacheFile)) {
                        const cacheContent = fs.readFileSync(viewOrgCacheFile, 'utf8');
                        const viewOrgCache = JSON.parse(cacheContent);
                        
                        // Find the most recently selected org across all views
                        let mostRecentOrg: SelectedOrg | null = null;
                        let mostRecentTime = 0;
                        
                        for (const viewId in viewOrgCache) {
                            const viewOrg = viewOrgCache[viewId];
                            const timestamp = new Date(viewOrg.timestamp).getTime();
                            
                            if (timestamp > mostRecentTime) {
                                mostRecentTime = timestamp;
                                mostRecentOrg = viewOrg;
                            }
                        }
                        
                        if (mostRecentOrg) {
                            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Using most recent view-selected org as fallback:', mostRecentOrg);
                            return mostRecentOrg;
                        }
                    }
                }
            } catch (fallbackError) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Fallback lookup failed:', fallbackError);
            }
            
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- No selected org found');
            return null;
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getSelectedOrg -- Error getting selected org:', error as Error);
            return null;
        }
    }

    /**
     * Set selected org for a specific view
     */
    public static async setSelectedOrgForView(viewId: ViewId, alias: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrgForView -- Setting selected org for ${viewId}: ${alias}`);
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const cachePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
            const viewOrgCacheFile = path.join(cachePath, 'view-org-selections.json');

            // Ensure cache directory exists
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }

            // Read existing cache or create new one
            let viewOrgCache: { [viewId: string]: SelectedOrg } = {};
            if (fs.existsSync(viewOrgCacheFile)) {
                try {
                    const cacheContent = fs.readFileSync(viewOrgCacheFile, 'utf8');
                    viewOrgCache = JSON.parse(cacheContent);
                } catch (parseError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] setSelectedOrgForView -- Error parsing existing cache, creating new one');
                }
            }

            // Update cache for this view
            viewOrgCache[viewId] = { alias, timestamp: new Date().toISOString() };

            // Write back to file
            fs.writeFileSync(viewOrgCacheFile, JSON.stringify(viewOrgCache, null, 2));
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrgForView -- Cached org for ${viewId}: ${alias}`);

            // Also update the global selected org cache to ensure SfdxService uses the correct org
            // This ensures that when switching to a new org, the SfdxService methods will use the selected org
            try {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrgForView -- Also updating global cache for org: ${alias}`);
                await OrgUtils.setSelectedOrg(alias);
                
              
            } catch (globalUpdateError) {
                // Log but don't fail the operation if global update fails
                OrgUtils.logError('[VisbalExt.OrgUtils] setSelectedOrgForView -- Failed to update global cache or CLI default:', globalUpdateError);
            }

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] setSelectedOrgForView -- Error:', error);
            throw new Error(`Failed to set selected org for view: ${error.message}`);
        }
    }

    /**
     * Get selected org for a specific view
     */
    public static async getSelectedOrgForView(viewId: ViewId): Promise<SelectedOrg | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return null;
            }

            const viewOrgCacheFile = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache', 'view-org-selections.json');
            
            if (fs.existsSync(viewOrgCacheFile)) {
                try {
                    const cacheContent = fs.readFileSync(viewOrgCacheFile, 'utf8');
                    const viewOrgCache = JSON.parse(cacheContent);
                    
                    if (viewOrgCache[viewId]) {
                        const selectedOrg = viewOrgCache[viewId];
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getSelectedOrgForView -- Found cached org for ${viewId}: ${selectedOrg.alias}`);
                        return selectedOrg;
                    }
                } catch (parseError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrgForView -- Error parsing view org cache:', parseError);
                }
            }

            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getSelectedOrgForView -- No cached org for view: ${viewId}`);
            return null;

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getSelectedOrgForView -- Error:', error);
            return null;
        }
    }

    /**
     * Set the IDE Project default Alias ( CLI default target org)
     */
    public static async setCliDefaultOrg(alias: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setCliDefaultOrg -- Setting CLI default org to: ${alias}`);
            
            // Use the SF CLI to set the default target org
            const command = `sf config set target-org ${alias}`;
            await execAsync(command);
            
            // Clear the cached org alias since we just changed it
            this._orgAliasCache = null;
            
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setCliDefaultOrg -- Successfully set CLI default org to: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] setCliDefaultOrg -- Error setting CLI default org:', error);
            throw new Error(`Failed to set CLI default org: ${error.message}`);
        }
    }

     //#region Organization Management
    public static async getCurrentOrgAlias(): Promise<string> {
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- BEGIN`);
        try {
            if (this._orgAliasCache && (Date.now() - this._orgAliasCache.timestamp) < this.CACHE_EXPIRATION) {
                const cacheAgeMs = Date.now() - this._orgAliasCache.timestamp;
                const cacheAgeMinutes = Math.round(cacheAgeMs / 60000 * 10) / 10; // Round to 1 decimal
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Using cached alias (age: ${cacheAgeMinutes}min / ${cacheAgeMs}ms) --`, this._orgAliasCache);
                return this._orgAliasCache.alias;
            }
            else {
                let alias = null;
                
                // Try to get the default org from project config first, then global config
                try {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Trying project config first...`);
                    alias = this.getDefaultTargetOrgFromConfig(true); // preferProject = true
                    if (alias) {
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Got from project config: ${alias}`);
                    } else {
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- No project config, trying global...`);
                        alias = this.getDefaultTargetOrgFromConfig(false); // preferProject = false
                        if (alias) {
                            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Got from global config: ${alias}`);
                        }
                    }
                } catch (configError) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Config read failed:`, configError);
                }

                // If not found, use the CLI as fallback
                if (!alias) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- No config found, falling back to CLI...`);
                    alias = await this.sfdxService.getCurrentOrgAlias();
                }
                this._orgAliasCache = {
                    alias,
                    timestamp: Date.now()
                };
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- SFDX & CACHED --:`, this._orgAliasCache);
                return alias;
            }
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
     * Get the default target org from the sfdx & sf config files
     * @param preferProject If true, checks project config first, then global
     * @returns The target org alias/username or null
     */
    private static getDefaultTargetOrgFromConfig(preferProject: boolean = true): string | null {
        try {
            if (preferProject) {
                // First check VS Code workspace directory
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const projectConfigDirs = ['.sf', '.sfdx'];
                    for (const dir of projectConfigDirs) {
                        const projectConfigDir = path.join(workspaceFolder.uri.fsPath, dir);
                        if (fs.existsSync(projectConfigDir)) {
                            const configFile = path.join(projectConfigDir, dir === '.sf' ? 'config.json' : 'sfdx-config.json');
                            if (fs.existsSync(configFile)) {
                                const configContent = fs.readFileSync(configFile, 'utf8');
                                const config = JSON.parse(configContent);
                                
                                // Check for new format (target-org) or legacy format (defaultusername)
                                const targetOrg = config?.['target-org'] || config?.targetOrg || 
                                                 config?.defaultusername || config?.['defaultusername'];
                                if (targetOrg) {
                                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getDefaultTargetOrgFromConfig -- Found in ${configFile}: ${targetOrg}`);
                                    return targetOrg;
                                }
                            }
                        }
                    }
                }
            }
            
            // Fall back to global config
            const homeDir = os.homedir();
            const globalConfigDirs = [
                { dir: path.join(homeDir, '.sf'), file: 'config.json' },
                { dir: path.join(homeDir, '.sfdx'), file: 'sfdx-config.json' }
            ];
            
            for (const { dir, file } of globalConfigDirs) {
                if (fs.existsSync(dir)) {
                    const configFile = path.join(dir, file);
                    if (fs.existsSync(configFile)) {
                        const configContent = fs.readFileSync(configFile, 'utf8');
                        const config = JSON.parse(configContent);
                        
                        // Check for new format (target-org) or legacy format (defaultusername)
                        const targetOrg = config?.['target-org'] || config?.targetOrg || 
                                         config?.defaultusername || config?.['defaultusername'];
                        if (targetOrg) {
                            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getDefaultTargetOrgFromConfig -- Found in ${configFile}: ${targetOrg}`);
                            return targetOrg;
                        }
                    }
                }
            }
            
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getDefaultTargetOrgFromConfig -- Error:', error);
            return null;
        }
    }

    /**
     * Gets the default org information directly from configuration files (no CLI)
     * @returns Object with org alias and configuration status
     */
    public static getDefaultOrgFromConfig(): {alias: string | null, hasConfig: boolean, configPath?: string} {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getDefaultOrgFromConfig -- Reading from filesystem');
            
            // Try project config first
            let defaultOrg = this.getDefaultTargetOrgFromConfig(true);
            let configPath = '.sf/config.json (project)';
            
            if (!defaultOrg) {
                // Fall back to global config
                defaultOrg = this.getDefaultTargetOrgFromConfig(false);
                configPath = `${require('os').homedir()}/.sf/config.json (global)`;
            }
            
            if (!defaultOrg) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getDefaultOrgFromConfig -- No default org configured');
                return { alias: null, hasConfig: false };
            }
            
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getDefaultOrgFromConfig -- Default org: ${defaultOrg} from ${configPath}`);
            
            return { 
                alias: defaultOrg, 
                hasConfig: true,
                configPath: configPath
            };
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getDefaultOrgFromConfig Error:', error);
            return { alias: null, hasConfig: false };
        }
    }

    /**
     * Gets the user ID from a dedicated user ID cache file
     * @returns Promise<string | null> The user ID if found in cache, null otherwise
     */
    private static async getUserIdFromOrgCache(): Promise<string | null> {
        try {
            // Get the current org alias first
            const currentOrgAlias = await this.getCurrentOrgAlias();
            if (!currentOrgAlias) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getUserIdFromOrgCache -- No current org alias');
                return null;
            }

            // Check if we have a workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getUserIdFromOrgCache -- No workspace folder');
                return null;
            }

            // Path to user ID cache file
            const userIdCacheFile = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache', 'user-ids.json');
            
            // Try to read existing user ID cache
            if (fs.existsSync(userIdCacheFile)) {
                try {
                    const cacheContent = fs.readFileSync(userIdCacheFile, 'utf8');
                    const userIdCache = JSON.parse(cacheContent);
                    
                    if (userIdCache[currentOrgAlias]) {
                        const cachedUserId = userIdCache[currentOrgAlias];
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getUserIdFromOrgCache -- Found cached user ID for ${currentOrgAlias}: ${cachedUserId}`);
                        return cachedUserId;
                    }
                } catch (parseError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] getUserIdFromOrgCache -- Error parsing user ID cache:', parseError);
                }
            }

            // If no cached user ID found
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getUserIdFromOrgCache -- No cached user ID for: ${currentOrgAlias}`);
            return null;

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] getUserIdFromOrgCache -- Error:', error);
            return null;
        }
    }

    /**
     * Caches the user ID for the current org
     * @param orgAlias The org alias
     * @param userId The user ID to cache
     */
    private static async cacheUserId(orgAlias: string, userId: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return;
            }

            const cachePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
            const userIdCacheFile = path.join(cachePath, 'user-ids.json');

            // Ensure cache directory exists
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }

            // Read existing cache or create new one
            let userIdCache: { [key: string]: string } = {};
            if (fs.existsSync(userIdCacheFile)) {
                try {
                    const cacheContent = fs.readFileSync(userIdCacheFile, 'utf8');
                    userIdCache = JSON.parse(cacheContent);
                } catch (parseError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] cacheUserId -- Error parsing existing cache, creating new one');
                }
            }

            // Update cache
            userIdCache[orgAlias] = userId;

            // Write back to file
            fs.writeFileSync(userIdCacheFile, JSON.stringify(userIdCache, null, 2));
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] cacheUserId -- Cached user ID for ${orgAlias}: ${userId}`);

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] cacheUserId -- Error:', error);
        }
    }

    public static async getCurrentUserId(): Promise<string> {
        try {
            //here lets see how can we skip this
            if (this._currentUserIdCache && (Date.now() - this._currentUserIdCache.timestamp) < this.CACHE_EXPIRATION) {
                return this._currentUserIdCache.userId;
            }
            let userId = '';
            
            // Try to get the user id from the current org .visbal\cache\org-list.json 
            try {
                const cachedUserId = await this.getUserIdFromOrgCache();
                if (cachedUserId) {
                    userId = cachedUserId;
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentUserId -- Got from org cache: ${userId}`);
                }
            } catch (cacheError) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentUserId -- Org cache read failed:`, cacheError);
            }

            // If not found in cache, call SFDX
            if (!userId) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentUserId -- No cache found, falling back to SFDX call...`);
                //sf org display
                userId = await this.sfdxService.getCurrentUserId();
                
                // Cache the user ID for future use
                try {
                    const currentOrgAlias = await this.getCurrentOrgAlias();
                    if (currentOrgAlias && userId) {
                        await this.cacheUserId(currentOrgAlias, userId);
                    }
                } catch (cacheError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] getCurrentUserId -- Error caching user ID:', cacheError);
                }
            }
            
            this._currentUserIdCache = {
                userId,
                timestamp: Date.now()
            };
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentUserId -- CACHED USER ID --:`, this._currentUserIdCache);
            return userId;
        } catch (error: any) {
            if (error instanceof Error) {
                OrgUtils.logError('[VisbalExt.OrgUtils] getCurrentUserId Error:', error);
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


    public static async openOrg(alias: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] openOrg -- alias: ${alias}`);
            await execAsync(`sf org open --target-org ${alias}`);
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] openOrg -- Successfully opened alias: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] openOrg -- Error opening selected org:', error as Error);
            throw new Error(`Failed to open  alias: ${alias}: ${error.message}`);
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

    public static async getLogIdFromProgress(progress: any, targetOrgAlias?: string): Promise<string> {
        let result = '';
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- progress:`, progress, `targetOrgAlias: ${targetOrgAlias}`);
            if (progress.runResult && progress.runResult.tests && progress.runResult.tests.length > 0) {
                let testId = progress.runResult.tests[0].Id;
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogIdFromProgress -- testId:`, testId);
                // Always use current/selected org as we need to ensure we're querying the right org
                const apiResult = await this.sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
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


    public static async openTheLogFromTestId(testId: string, targetOrgAlias?: string) {
        const logId = await this.getLogId(testId, targetOrgAlias);
        if (logId) {
            await this.openLog(logId, vscode.Uri.file(logId));
        }

    }


    public static async getLogId(testId: string, targetOrgAlias?: string): Promise<string> {
        let result = '';
        try {
            if (testId) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getLogId -- testId: ${testId}, targetOrgAlias: ${targetOrgAlias}`);
                // Always use current/selected org as we need to ensure we're querying the right org
                const apiResult = await this.sfdxService.executeSoqlQuery(`SELECT Id, ApexClass.Name, MethodName, Message, StackTrace, Outcome, ApexLogId FROM ApexTestResult WHERE Id = '${testId}'`);
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
    public static async openLog(logId: string, extensionUri: vscode.Uri, useDefaultOrg: boolean = false): Promise<void> {
        try {
       

           
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
            
                //open log raw file in new tab
                const document = await vscode.workspace.openTextDocument(localFilePath);
                await vscode.window.showTextDocument(document);
            
                return;
            }

            // Fetch and save the log content
            const logContent = await this._fetchLogContent(logId, useDefaultOrg);
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const tempFile = path.join(os.tmpdir(), `sf_${sanitizedLogId}_${timestamp}.log`);
            
            await fs.promises.writeFile(tempFile, logContent);
        
            //open log raw file in new tab
            const document = await vscode.workspace.openTextDocument(tempFile);
            await vscode.window.showTextDocument(document);
        

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

    public static archiveDebugLog(): void {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        //configure debug file max size
        const debugFileMaxSize = config.get<number>('debugFileMaxSize', 1024 * 1024 * 2); // 2MB default
        const debugDir = OrgUtils.getDebugDir();
        //if file is greater than max size, rotate it, 
        const debugFile = OrgUtils.getDebugFile();
        if (fs.existsSync(debugFile)) {
            const fileSize = fs.statSync(debugFile).size;
            if (fileSize > debugFileMaxSize) {
                fs.renameSync(debugFile, path.join(debugDir, `debug.${Date.now()}.log`));
            }
        }
        //and delete files older than deleteErrorLogsOlderThan
        const deleteDebugLogsOlderThan = config.get<number>('deleteDebugLogsOlderThan', 1);
        
        const files = fs.readdirSync(debugDir);
        files.forEach(file => {
            const fileDate = new Date(file.split('.')[2]);
            if (fileDate < new Date(Date.now() - deleteDebugLogsOlderThan * 24 * 60 * 60 * 1000)) {
                fs.unlinkSync(path.join(debugDir, file));
            }
        });
    }


    public static getDebugDir(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        return path.join(workspaceFolder.uri.fsPath, '.visbal', 'debug');
    }


    public static getDebugFile(): string {
        const debugDir = OrgUtils.getDebugDir();
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }
        return path.join(debugDir, `debug.log`);
    }

    public static logDebug(message: string, o?: unknown, o2?: unknown): void {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        const saveToFile = config.get<boolean>('saveToFile', true);
        const displayInConsole = config.get<boolean>('displayInConsole', true);
        const debugMaxLength = config.get<number>('debugMaxLength', 250); // Default value, can be configured

        OrgUtils.archiveDebugLog();

        if (saveToFile) {
            try {
                

                const debugFile = OrgUtils.getDebugFile();

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


    public static async openTestFile(className: string, methodName: string): Promise<void> {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        // Construct the file path
        const filePath = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders[0].uri,
            'force-app',
            'main',
            'default',
            'classes',
            `${className}.cls`
        );
        
        // Open the document
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        // Search for the method in the file
        const text = document.getText();
        const methodRegex = new RegExp(`\\s*(public|private|protected|global)?\\s*(static)?\\s*\\bvoid\\b\\s*${methodName}\\s*\\(`);
        const match = methodRegex.exec(text);
        
        if (match) {
            // Find the position of the method
            const position = document.positionAt(match.index);
            
            // Reveal the method in the editor
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            
            // Set the cursor at the method
            editor.selection = new vscode.Selection(position, position);
        }
    }


    public static async selectTestMethod(className: string, methodName: string): Promise<void> {
        vscode.commands.executeCommand('visbal-ext.selectTestMethod', className, methodName, true);
        const key = className + '.' + methodName;
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] selectTestMethod -- Updated configuration for ${key}`);
    }

    /**
     * Symbol types that can be navigated to
     */
    private static readonly SymbolType = {
        METHOD: 'method',
        PROPERTY: 'property',
        CLASS: 'class',
        VARIABLE: 'variable',
        CSS_CLASS: 'css-class',
        CSS_ID: 'css-id',
        FUNCTION: 'function'
    } as const;

    /**
     * File type mappings - what file types to search for each source file type
     */
    private static readonly FILE_TYPE_MAPPINGS = {
        'cls': ['cls'],
        'html': ['js', 'css', 'html'],
        'htm': ['js', 'css', 'html'],
        'js': ['js', 'css'],
        'css': ['css'],
        'scss': ['scss', 'css'],
        'less': ['less', 'css'],
        'ts': ['ts', 'js'],
        'jsx': ['jsx', 'js'],
        'tsx': ['tsx', 'ts', 'js']
    };

    /**
     * Extracts the symbol and its type from the current cursor position
     */
    private static extractSymbolFromCursor(document: vscode.TextDocument, position: vscode.Position): {symbol: string, type: string, isThisReference: boolean, className?: string} | null {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return null;
        }
        
        const word = document.getText(wordRange);
        const line = document.lineAt(position.line).text;
        const fileExtension = document.fileName.split('.').pop()?.toLowerCase();
        
        // Check if this is a "this." reference
        const wordStart = wordRange.start.character;
        const beforeWord = line.substring(0, wordStart);
        const isThisReference = /\bthis\.\s*$/.test(beforeWord);
        
        // Check if this is a class-prefixed method call (e.g., ClassName.methodName)
        let className: string | undefined;
        const classPrefixMatch = beforeWord.match(/\b([A-Z][a-zA-Z0-9_]*)\.\s*$/);
        if (classPrefixMatch) {
            className = classPrefixMatch[1];
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] Detected class-prefixed call: ${className}.${word}`);
        }
        
        // Determine symbol type based on context and file type
        const symbolInfo = this.determineSymbolType(word, line, wordRange, fileExtension || '');
        
        if (symbolInfo) {
            return { ...symbolInfo, isThisReference, className };
        }
        
        return null;
    }

    /**
     * Determines the type of symbol based on context
     */
    private static determineSymbolType(word: string, line: string, wordRange: vscode.Range, fileExtension: string): {symbol: string, type: string} | null {
        const wordEnd = wordRange.end.character;
        const afterWord = line.substring(wordEnd).trim();
        
        switch (fileExtension) {
            case 'cls':
                // Apex/Salesforce class file
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.METHOD };
                }
                if (line.includes('class ') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                return { symbol: word, type: this.SymbolType.PROPERTY };
                
            case 'html':
            case 'htm':
                // HTML file - check for class, id, or function references
                if (line.includes(`class=`) && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_CLASS };
                }
                if (line.includes(`id=`) && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_ID };
                }
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            case 'js':
            case 'ts':
            case 'jsx':
            case 'tsx':
                // JavaScript/TypeScript file
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                if (line.includes('class ') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            case 'css':
            case 'scss':
            case 'less':
                // CSS file
                if (line.trim().startsWith('.') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_CLASS };
                }
                if (line.trim().startsWith('#') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_ID };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            default:
                // Generic fallback
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
        }
    }

    /**
     * Gets file extensions to search based on source file extension
     */
    private static getTargetFileExtensions(sourceExtension: string): string[] {
        return this.FILE_TYPE_MAPPINGS[sourceExtension as keyof typeof this.FILE_TYPE_MAPPINGS] || [sourceExtension];
    }

    /**
     * Creates search patterns for different symbol types
     */
    private static createSearchPatterns(symbol: string, symbolType: string): RegExp[] {
        const patterns: RegExp[] = [];
        
        switch (symbolType) {
            case this.SymbolType.METHOD:
                // Apex method definition - prioritize proper method signatures
                // Pattern 1: Method with access modifier and return type
                patterns.push(new RegExp(
                    `^\\s*(public|private|protected|global)\\s+(static\\s+)?(override\\s+)?[\\w<>\\[\\]_]+\\s+${symbol}\\s*\\(`,
                    'im'
                ));
                // Pattern 2: Method with just access modifier (for void methods)
                patterns.push(new RegExp(
                    `^\\s*(public|private|protected|global)\\s+(static\\s+)?(override\\s+)?${symbol}\\s*\\(`,
                    'im'
                ));
                // Pattern 3: Fallback - any method-like pattern
                patterns.push(new RegExp(
                    `\\s*[\\w<>\\[\\]_]+\\s+${symbol}\\s*\\(`,
                    'i'
                ));
                break;
                
            case this.SymbolType.FUNCTION:
                // JavaScript/TypeScript function definitions - prioritize actual definitions
                // Pattern 1: Function declaration
                patterns.push(new RegExp(`^\\s*function\\s+${symbol}\\s*\\(`, 'im'));
                // Pattern 2: Method definition in class/object
                patterns.push(new RegExp(`^\\s*${symbol}\\s*\\([^)]*\\)\\s*{`, 'im'));
                // Pattern 3: Arrow function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*\\([^)]*\\)\\s*=>`, 'im'));
                // Pattern 4: Function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*function`, 'im'));
                // Pattern 5: Object method
                patterns.push(new RegExp(`${symbol}\\s*:\\s*function\\s*\\(`, 'i'));
                // Pattern 6: Fallback - any assignment
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*function`, 'i'));
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*\\(.*\\)\\s*=>`, 'i'));
                break;
                
            case this.SymbolType.CLASS:
                // Class definitions - prioritize actual class declarations
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|global\\s+)?(abstract\\s+)?class\\s+${symbol}\\b`, 'im'));
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|export\\s+)?(abstract\\s+)?interface\\s+${symbol}\\b`, 'im'));
                patterns.push(new RegExp(`class\\s+${symbol}\\b`, 'i'));
                patterns.push(new RegExp(`interface\\s+${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.CSS_CLASS:
                // CSS class definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^\\.${symbol}\\b[^{]*{`, 'im'));
                patterns.push(new RegExp(`\\.${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.CSS_ID:
                // CSS ID definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^#${symbol}\\b[^{]*{`, 'im'));
                patterns.push(new RegExp(`#${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.PROPERTY:
            case this.SymbolType.VARIABLE:
                // Property/variable definitions - prioritize actual declarations
                // Pattern 1: Apex property/field with access modifier
                patterns.push(new RegExp(`^\\s*(public|private|protected|global)\\s+(static\\s+)?[\\w<>\\[\\]]+\\s+${symbol}\\b`, 'im'));
                // Pattern 2: JavaScript/TypeScript variable declarations
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\b`, 'im'));
                // Pattern 3: Property assignment
                patterns.push(new RegExp(`^\\s*${symbol}\\s*[:=]`, 'im'));
                // Pattern 4: Fallback patterns
                patterns.push(new RegExp(`\\b${symbol}\\s*[:=]`, 'i'));
                break;
        }
        
        return patterns;
    }

    /**
     * Searches for a symbol definition in the current file first
     */
    private static searchInCurrentFile(document: vscode.TextDocument, symbol: string, symbolType: string): {filePath: vscode.Uri, position: vscode.Position} | null {
        const text = document.getText();
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        for (const searchPattern of searchPatterns) {
            searchPattern.lastIndex = 0;
            const match = searchPattern.exec(text);
            if (match) {
                const position = document.positionAt(match.index);
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] Found ${symbol} in current file using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                return { filePath: document.uri, position };
            }
        }
        
        return null;
    }

    /**
     * Searches for a symbol definition in a specific class file
     */
    private static async searchInSpecificClass(className: string, symbol: string, symbolType: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        
        try {
            // Try to find the specific class file
            const classPattern = new vscode.RelativePattern(workspaceFolder, `**/${className}.cls`);
            const classFiles = await vscode.workspace.findFiles(classPattern);
            
            if (classFiles.length === 0) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] Class file ${className}.cls not found`);
                return null;
            }

            // Search in the first matching class file
            const classFile = classFiles[0];
            try {
                const document = await vscode.workspace.openTextDocument(classFile);
                const text = document.getText();
                const searchPatterns = this.createSearchPatterns(symbol, symbolType);
                
                for (const searchPattern of searchPatterns) {
                    searchPattern.lastIndex = 0;
                    const match = searchPattern.exec(text);
                    if (match) {
                        const position = document.positionAt(match.index);
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] Found ${symbol} in ${className}.cls using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                        return { filePath: classFile, position };
                    }
                }
                
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] Symbol ${symbol} not found in ${className}.cls`);
            } catch (error) {
                OrgUtils.logError(`[VisbalExt.OrgUtils] Could not read class file: ${classFile.fsPath}`, error as Error);
            }
        } catch (error) {
            OrgUtils.logError(`[VisbalExt.OrgUtils] Error searching in specific class ${className}:`, error as Error);
        }
        
        return null;
    }

    /**
     * Searches for a symbol definition across appropriate file types in the workspace
     */
    private static async findSymbolDefinition(symbol: string, symbolType: string, sourceFileExtension: string, currentDocument?: vscode.TextDocument, isThisReference: boolean = false, className?: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        
        // For class-prefixed calls (e.g., ClassName.methodName), search the specific class first
        if (className && sourceFileExtension === 'cls') {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] Searching for '${className}.${symbol}' in ${className}.cls first`);
            const classResult = await this.searchInSpecificClass(className, symbol, symbolType);
            if (classResult) {
                return classResult;
            }
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] '${className}.${symbol}' not found in ${className}.cls, expanding search`);
        }
        
        // For "this." references, search current file first
        if (isThisReference && currentDocument) {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] Searching for 'this.${symbol}' in current file first`);
            const currentFileResult = this.searchInCurrentFile(currentDocument, symbol, symbolType);
            if (currentFileResult) {
                return currentFileResult;
            }
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] 'this.${symbol}' not found in current file, expanding search`);
        }

        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const targetExtensions = this.getTargetFileExtensions(sourceFileExtension);
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        if (searchPatterns.length === 0) {
            return null;
        }
        
        try {
            // Search each target file type
            for (const extension of targetExtensions) {
                const pattern = new vscode.RelativePattern(workspaceFolder, `**/*.${extension}`);
                const files = await vscode.workspace.findFiles(pattern);
                
                for (const file of files) {
                    // Skip current file if we already searched it for "this." references
                    if (isThisReference && currentDocument && file.fsPath === currentDocument.uri.fsPath) {
                        continue;
                    }
                    
                    // Skip the specific class file if we already searched it for class-prefixed calls
                    if (className && file.fsPath.includes(`${className}.cls`)) {
                        continue;
                    }
                    
                    try {
                        const document = await vscode.workspace.openTextDocument(file);
                        const text = document.getText();
                        
                        // Try each search pattern in priority order
                        for (const searchPattern of searchPatterns) {
                            // Reset regex lastIndex to ensure proper matching
                            searchPattern.lastIndex = 0;
                            const match = searchPattern.exec(text);
                            if (match) {
                                const position = document.positionAt(match.index);
                                OrgUtils.logDebug(`[VisbalExt.OrgUtils] Found ${symbol} using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                                return { filePath: file, position };
                            }
                        }
                    } catch (error) {
                        // Skip files that can't be opened
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] Could not read file: ${file.fsPath}`, error);
                        continue;
                    }
                }
            }
        } catch (error) {
            OrgUtils.logError('[VisbalExt.OrgUtils] Error searching for symbol definition:', error as Error);
        }
        
        return null;
    }

    /**
     * Navigates to the symbol definition based on the current cursor position
     */
    public static async navigateToSelectedDefinition(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        const sourceFileExtension = editor.document.fileName.split('.').pop()?.toLowerCase() || '';

        // Extract symbol and type from cursor position
        const symbolInfo = this.extractSymbolFromCursor(editor.document, editor.selection.active);
        if (!symbolInfo) {
            throw new Error('No symbol found at cursor position. Please place cursor on a method, property, class, or other symbol.');
        }

        const { symbol, type, isThisReference, className } = symbolInfo;
        const searchContext = className ? `${className}.${symbol}` : isThisReference ? `this.${symbol}` : symbol;
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] Searching for ${type} definition: ${searchContext}`);
        
        // Search for symbol definition
        const symbolLocation = await this.findSymbolDefinition(symbol, type, sourceFileExtension, editor.document, isThisReference, className);
        if (!symbolLocation) {
            let searchScope = 'workspace files';
            if (className) {
                searchScope = `${className}.cls and workspace files`;
            } else if (isThisReference) {
                searchScope = 'current file and workspace';
            }
            throw new Error(`${type} definition for '${searchContext}' not found in ${searchScope}`);
        }

        try {
            // Open the document containing the symbol
            const document = await vscode.workspace.openTextDocument(symbolLocation.filePath);
            const newEditor = await vscode.window.showTextDocument(document);
            
            // Navigate to the symbol position
            newEditor.revealRange(
                new vscode.Range(symbolLocation.position, symbolLocation.position), 
                vscode.TextEditorRevealType.InCenter
            );
            
            // Set the cursor at the symbol
            newEditor.selection = new vscode.Selection(symbolLocation.position, symbolLocation.position);
            
            const fileName = symbolLocation.filePath.fsPath.split(/[/\\]/).pop();
            const location = symbolLocation.filePath.fsPath === editor.document.uri.fsPath ? 'same file' : fileName;
            
            // Show more specific success message for class-prefixed calls
            let successMessage: string;
            if (className) {
                successMessage = `Navigated to ${type} '${symbol}' in ${fileName}`;
            } else {
                successMessage = `Navigated to ${type} '${searchContext}' in ${location}`;
            }
            
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] Successfully navigated to ${type} '${searchContext}' in ${location}`);
            vscode.window.showInformationMessage(successMessage);
            
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.OrgUtils] Error opening symbol definition file:`, error);
            throw new Error(`Could not open file containing ${type} '${searchContext}': ${error.message}`);
        }
    }

    public static openAndDisplayOutputTab(output: string): void {
        const outputChannel = vscode.window.createOutputChannel('Visbal Extension');
        outputChannel.appendLine(output);
        // Only show output channel when explicitly requested, not by default
        outputChannel.show(true);
    }

    /**
     * Shared method to load org list and post to a webview
     */
    public static async loadOrgListForView(
        orgListCacheService: any,
        context: vscode.ExtensionContext,
        webview: vscode.Webview | undefined,
        loggerPrefix: string = '[VisbalExt.OrgUtils]',
        viewId?: ViewId
    ): Promise<void> {
        try {
            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Loading org list`);
            
            // Show progress in status bar
            statusBarService.showProgress('Loading Salesforce organizations...');
            
            // Try to get from cache first
            const cachedData = await orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Using cached org list`);
                orgs = cachedData.orgs;
                statusBarService.showSuccess('Organization list loaded from cache');
            } else {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Fetching fresh org list`);
                orgs = await OrgUtils.listOrgs();
                // Save to cache
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Saving org list to cache`, orgs);
                await orgListCacheService.saveOrgList(orgs);
                statusBarService.showSuccess('Organization list loaded successfully');
            }

            let alias = null;
            // Get the selected org (view-specific if viewId provided, otherwise global)
            let selectedOrg = null;
            if (viewId) {
                const viewSpecificOrg = await OrgUtils.getSelectedOrgForView(viewId);
                selectedOrg = viewSpecificOrg;
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- View-specific selected org for ${viewId}:`, selectedOrg);
                alias = selectedOrg?.alias;

                if (selectedOrg == null) {
                    //get the alis set as a default project
                    alias = await OrgUtils.getDefaultTargetOrgFromConfig();
                }
            } else {
                selectedOrg = await OrgUtils.getSelectedOrg();
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Global selected org:`, selectedOrg);
                alias = selectedOrg?.alias;
            }

            // Send the categorized orgs to the webview
            webview?.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: alias
            });
        } catch (error: any) {
            OrgUtils.logError(`${loggerPrefix} loadOrgListForView -- Error loading org list:`, error);
            statusBarService.showError(`Error loading organization list: ${error.message}`);
            webview?.postMessage({
                command: 'error',
                message: `Failed to load org list: ${error.message}`
            });
        } finally {
            webview?.postMessage({
                command: 'stopLoading'
            });
        }
    }

    /**
     * Shared method to refresh org list and post to a webview
     */
    public static async refreshOrgListForView(
        orgListCacheService: any,
        context: vscode.ExtensionContext,
        webview: vscode.Webview | undefined,
        loggerPrefix: string = '[VisbalExt.OrgUtils]',
        loadingType: string = 'startLoading',
        loadingMessage: string = 'Refreshing organization list...'
    ): Promise<void> {
        try {
            OrgUtils.logDebug(`${loggerPrefix} refreshOrgListForView -- Refreshing org list`);
            
            // Show progress in status bar
            statusBarService.showProgress(loadingMessage);
            
            webview?.postMessage({
                command: loadingType,
                isLoading: true,
                message: loadingMessage
            });

            const orgs = await OrgUtils.listOrgs();
            OrgUtils.logDebug(`${loggerPrefix} refreshOrgListForView -- orgs Save to the cache`, orgs);
            // Save to cache
            await orgListCacheService.saveOrgList(orgs);

            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug(`${loggerPrefix} refreshOrgListForView -- Selected org:`, selectedOrg);

            // Send the categorized orgs to the webview
            webview?.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: false,
                selectedOrg: selectedOrg?.alias
            });

            statusBarService.showSuccess('Organization list refreshed successfully');
            OrgUtils.logDebug(`${loggerPrefix} refreshOrgListForView -- Successfully sent org list to webview`);
        } catch (error: any) {
            OrgUtils.logError(`${loggerPrefix} refreshOrgListForView -- Error refreshing org list:`, error);
            statusBarService.showError(`Error refreshing organization list: ${error.message}`);
            webview?.postMessage({
                command: 'error',
                message: `Failed to refresh org list: ${error.message}`
            });
        } finally {
            webview?.postMessage({
                command: loadingType === 'loading' ? 'loading' : 'stopLoading',
                isLoading: false
            });
        }
    }

    /**
     * Returns the Bitbucket (or Git) base URL for the current workspace
     */
    public static getBitbucketBaseUrl(workspacePath: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            cp.exec('git remote get-url origin', { cwd: workspacePath }, (err, stdout) => {
                if (err) return resolve(undefined);
                let url = stdout.trim();
                // Convert SSH to HTTPS
                if (url.startsWith('git@')) {
                    url = url.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
                } else if (url.startsWith('https://')) {
                    url = url.replace(/\.git$/, '');
                    url = url.replace(/^https?:\/\/[^@]+@/, 'https://');
                }
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getBitbucketBaseUrl -- Bitbucket URL:`, url);   
                resolve(url);
            });
        });
    }

} 