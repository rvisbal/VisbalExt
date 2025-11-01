import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execAsync, MAX_BUFFER_SIZE } from './execUtils';
import { LogDetailView } from '../views/logDetailView';
import { statusBarService } from '../services/statusBarService';
import { CacheService } from '../services/cacheService';
import { SfdxService } from '../services/sfdxService';

import { ViewId, SalesforceOrg, OrgGroups, SelectedOrg, ViewOrgSelectionsCache, TraceFlag } from '../types/salesforceTypes';
import { UserIdService } from '../services/userIdService';
import { SymbolNavigationService } from '../services/symbolNavigationService';
import * as cp from 'child_process';
import { DEFAULT_LOG_TYPE } from '../constants/salesforceConstants';
import { ConfigUserIdService } from '../services/configUserIdService';
import { UserIdCacheService } from '../services/userIdCacheService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { getExtensionVersion } from './extensionUtils';
import { WorkspaceFolder } from 'vscode';


/**
 * OrgUtils - Organized Salesforce Organization Utility Class
 * 
 * This class has been organized into the following categories for future splitting:
 * 
 * 1. INITIALIZATION & CONFIGURATION - Core setup and workspace utilities
 *    Future class: ConfigurationManager
 * 
 * 2. ORGANIZATION MANAGEMENT - Org listing, selection, and basic operations
 *    Future class: OrganizationManager
 * 
 * 3. ORG ALIAS & DEFAULT MANAGEMENT - Alias resolution and default org handling
 *    Future class: OrgAliasService
 * 
 * 4. USER ID MANAGEMENT - User ID caching and retrieval
 *    Future class: UserIdService
 * 
 * 5. LOG MANAGEMENT - Log operations, downloading, and parsing
 *    Future class: LogManager
 * 
 * 6. DEBUG & TRACE MANAGEMENT - Debug flags and trace operations
 *    Future class: DebugTraceManager
 * 
 * 7. TEST MANAGEMENT - Test file operations and method selection
 *    Future class: TestManager
 * 
 * 8. FILE NAVIGATION & SYMBOL SEARCH - Code navigation and symbol resolution
 *    Future class: SymbolNavigationService
 * 
 * 9. SERVICE GETTERS - Lazy initialization of service dependencies
 *    Future pattern: Dependency Injection Container
 * 
 * 10. LOGGING & ERROR HANDLING - Debug logging and error management
 *     Future class: LoggingService
 * 
 * 11. UTILITY METHODS - General utility functions
 *     Future class: GeneralUtils
 * 
 * 12. WEBVIEW SUPPORT METHODS - Webview communication helpers
 *     Future class: WebviewManager
 */
export class OrgUtils {
    // ============================================================================
    // STATIC PROPERTIES & CONSTANTS
    // ============================================================================
    
    // Log Management Properties
    private static _downloadedLogs: Set<string> = new Set<string>();
    private static _downloadedLogPaths: Map<string, string> = new Map<string, string>();
    private static _logs: any[] = [];
    
    // Download Concurrency Control - prevents multiple simultaneous downloads of same log
    private static _ongoingDownloads: Map<string, Promise<void>> = new Map<string, Promise<void>>();
    
    // Core Services
    private static _context: vscode.ExtensionContext;
    private static _sfdxService: SfdxService;
    private static _cacheService: CacheService;
    private static _userIdCacheService: UserIdCacheService | null = null;
    private static _orgListCacheService: OrgListCacheService;
    private static _outputChannel: vscode.OutputChannel;
    
    // Cache Management
    private static _orgAliasCache: { alias: string; timestamp: number } | null = null;
    private static _currentUserIdCache: { userId: string; timestamp: number } | null = null;
    private static readonly CACHE_EXPIRATION = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    // Configuration
    public static DEBUG_MODE = false;
    

    // ============================================================================
    // INITIALIZATION & CONFIGURATION
    // ============================================================================

    /**
     * Initialize the OrgUtils class with necessary data
     * @param logs Array of log objects
     * @param context VSCode extension context
     * @param sfdxService An instance of SfdxService
     * @param orgListCacheService An instance of OrgListCacheService
     * @param outputChannel The output channel for logging (optional)
     */
    public static initialize(logs: any[], context: vscode.ExtensionContext, sfdxService: SfdxService, orgListCacheService: OrgListCacheService, outputChannel?: vscode.OutputChannel): void {
        this._logs = logs;
        this._context = context;
        // Initialize sfdxService
        this._sfdxService = sfdxService;
        // Initialize outputChannel (reuse existing or create new)
        if (outputChannel) {
            this._outputChannel = outputChannel;
        } else if (!this._outputChannel) {
            this._outputChannel = vscode.window.createOutputChannel('Visbal Extension');
        }
        // Initialize cacheService
        const cachePath = OrgUtils.getCachePath();
        OrgUtils._cacheService = new CacheService(cachePath, sfdxService, orgListCacheService);
        // Initialize userIdCacheService
        OrgUtils._userIdCacheService = new UserIdCacheService(cachePath);
        // Assign the injected orgListCacheService
        OrgUtils._orgListCacheService = orgListCacheService;
        
        // Initialize UserIdService with dependencies
        UserIdService.initialize(
            context,
            OrgUtils._cacheService,
            orgListCacheService,
            OrgUtils.logDebug,
            OrgUtils.logError,
            OrgUtils.getCurrentOrgAlias,
            OrgUtils.getCachePath,
            OrgUtils.getSalesforceProjectFolderPath,
            OrgUtils.getSelectedOrg
        );
        
        // Initialize SymbolNavigationService with dependencies
        SymbolNavigationService.initialize(
            OrgUtils.logDebug,
            OrgUtils.logError
        );
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

    public static getDownloadedLogsData(): { downloadedLogs: Set<string>, downloadedLogPaths: Map<string, string> } {
        return {
            downloadedLogs: this._downloadedLogs,
            downloadedLogPaths: this._downloadedLogPaths
        };
    }

    public static getWorkspaceFolder(): WorkspaceFolder {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        
        return workspaceFolder;
    }

    public static getCachePath(): string {
        const workspaceFolder = OrgUtils.getWorkspaceFolder();
        return path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
    }

    // ============================================================================
    // ORGANIZATION MANAGEMENT
    // ============================================================================

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
                    id: org.id, // Add id property here
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

            if (!OrgUtils._cacheService) {
                throw new Error('CacheService not initialized in OrgUtils');
            }
            const selectedOrg: SelectedOrg = { alias, timestamp: new Date().toISOString() };
            await OrgUtils._cacheService.saveCachedOrg(selectedOrg);
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrg -- Successfully set selected org ${alias}`);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgUtils] setSelectedOrg -- Error setting selected org:${alias} ', error as Error);
            throw new Error(`Failed to set selected org: ${error.message}`);
        }
    }

    public static async getSelectedOrg(): Promise<SelectedOrg | null> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Fetching selected org');
            
            // Priority 1: Check for any view-specific selection as the most recently selected org
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const viewOrgCacheFile = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache', 'view-org-selections.json');
                    
                    if (fs.existsSync(viewOrgCacheFile)) {
                        const cacheContent = fs.readFileSync(viewOrgCacheFile, 'utf8');
                        const viewOrgCache = JSON.parse(cacheContent) as ViewOrgSelectionsCache;
                        
                        let mostRecentOrg: SelectedOrg | null = null;
                        let mostRecentTime = 0;
                        
                        for (const viewId in viewOrgCache) {
                            if (viewId === 'versionId') { continue; }
                            const viewOrg = viewOrgCache[viewId as ViewId];
                            if (viewOrg) {
                                const timestamp = new Date(viewOrg.timestamp).getTime();
                                
                                if (timestamp > mostRecentTime) {
                                    mostRecentTime = timestamp;
                                    mostRecentOrg = viewOrg;
                                }
                            }
                        }
                        
                        if (mostRecentOrg) {
                            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Using most recent view-selected org as fallback:', mostRecentOrg);
                            return mostRecentOrg;
                        }
                    }
                }
            } catch (fallbackError) {
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Fallback lookup for view-specific orgs failed:', fallbackError);
            }

            // Priority 2: Check global org cache (if CacheService is initialized)
            if (OrgUtils._cacheService) {
                const cachedSelectedOrg = await OrgUtils._cacheService.getCachedOrg();
                if (cachedSelectedOrg) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Retrieved org from global cache:', cachedSelectedOrg);
                    return cachedSelectedOrg;
                }
            }

            // Priority 3: Fallback to CLI default org
            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Falling back to CLI default org');
            const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
            if (defaultOrgAlias) {
                const defaultOrg: SelectedOrg = { alias: defaultOrgAlias, timestamp: new Date().toISOString() };
                OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- Retrieved default org from CLI:', defaultOrg);
                return defaultOrg;
            }

            OrgUtils.logDebug('[VisbalExt.OrgUtils] getSelectedOrg -- No selected org found');
            return null;

        } catch (error: any) {
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

            const cachePath = OrgUtils.getCachePath();
            const viewOrgCacheFile = path.join(cachePath, 'view-org-selections.json');

            // Ensure cache directory exists
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }

            // Read existing cache or create new one
            let viewOrgCache: ViewOrgSelectionsCache = { versionId: getExtensionVersion() };
            if (fs.existsSync(viewOrgCacheFile)) {
                try {
                    const cacheContent = fs.readFileSync(viewOrgCacheFile, 'utf8');
                    viewOrgCache = JSON.parse(cacheContent) as ViewOrgSelectionsCache;
                } catch (parseError) {
                    OrgUtils.logDebug('[VisbalExt.OrgUtils] setSelectedOrgForView -- Error parsing existing cache, creating new one');
                }
            }

            // Update cache for this view
            viewOrgCache[viewId] = { alias, timestamp: new Date().toISOString() };
            viewOrgCache.versionId = getExtensionVersion();

            // Write back to file
            fs.writeFileSync(viewOrgCacheFile, JSON.stringify(viewOrgCache, null, 2));
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrgForView -- Cached org for ${viewId}: ${alias}`);

            // Also update the global selected org cache to ensure SfdxService uses the correct org
            // This ensures that when switching to a new org, the SfdxService methods will use the selected org
            try {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] setSelectedOrgForView -- Also updating global cache for org: ${alias}`);
                await OrgUtils._cacheService.saveCachedOrg({ alias, timestamp: new Date().toISOString() });
                
              
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
            OrgUtils.logError('[VisbalExt.OrgUtils] setCliDefaultOrg -- Error setting CLI default org:', error as Error);
            throw new Error(`Failed to set CLI default org: ${error.message}`);
        }
    }

    // ============================================================================
    // ORG ALIAS & DEFAULT MANAGEMENT
    // ============================================================================

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
                    alias = OrgUtils.getDefaultTargetOrgFromConfig(true); // preferProject = true
                    if (alias) {
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Got from project config: ${alias}`);
                    } else {
                        OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- No project config, trying global...`);
                        alias = OrgUtils.getDefaultTargetOrgFromConfig(false); // preferProject = false
                        if (alias) {
                            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Got from global config: ${alias}`);
                        }
                    }
                } catch (configError) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- Config read failed:`, configError);
                }

                // If not found, use the CLI as fallback via sfdxService
                if (!alias) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] getCurrentOrgAlias -- No config found, falling back to SFDX CLI...`);
                    alias = await OrgUtils.sfdxService.getCurrentOrgAlias();
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
    public static getDefaultTargetOrgFromConfig(preferProject: boolean = true): string | null {
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

    // ============================================================================
    // USER ID MANAGEMENT (Delegated to UserIdService)
    // ============================================================================

    /**
     * Gets user ID for a specific org alias
     * @param orgAlias The org alias to get user ID for
     * @returns Promise<string> The user ID for the specified org
     */
    public static async getUserIdForOrg(orgAlias: string): Promise<string> {
        return UserIdService.getUserIdForOrg(orgAlias);
    }

    /**
     * Gets the org ID for a specific org alias from the cache.
     * @param alias The org alias to get the org ID for.
     * @returns Promise<string | null> The org ID if found, null otherwise.
     */
    public static async getOrgIdForAlias(alias: string): Promise<string | null> {
        return UserIdService.getOrgIdForAlias(alias);
    }

    public static async getCurrentUserId(alias?: string): Promise<string | null> {
        return UserIdService.getCurrentUserId(alias);
    }

    /**
     * Retrieves the Salesforce org information for a given alias.
     * @param alias The alias of the Salesforce org.
     * @returns A SalesforceOrg object containing the org details.
     */
    public static async getOrgInfo(alias: string, expectedOrgId?: string): Promise<SalesforceOrg | null> {
        return UserIdService.getOrgInfo(alias, expectedOrgId);
    }

    /**
     * Opens the default org in a browser
     */
    public static async openDefaultOrg(): Promise<void> {
        return UserIdService.openDefaultOrg();
    }

    public static async openSelectedOrg(): Promise<void> {
        return UserIdService.openSelectedOrg();
    }

    public static async openOrg(alias: string): Promise<void> {
        return UserIdService.openOrg(alias);
    }
    
    // ============================================================================
    // LOG MANAGEMENT
    // ============================================================================

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
    private static async _fetchLogContent(logId: string, targetOrgAlias: string): Promise<string> {
        try {
            const result = await this.sfdxService.getLogContent(logId, targetOrgAlias);
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
            const currentOrgAlias = targetOrgAlias || await this.getCurrentOrgAlias();
            await this.openLog(logId, vscode.Uri.file(logId), currentOrgAlias);
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
    public static async openLog(logId: string, extensionUri: vscode.Uri, targetOrgAlias: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Starting to open log: ${logId}`);
            
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Opening cached log from: ${localFilePath}`);
                statusBarService.showProgress(`Opening cached log: ${logId}...`);
                
                //open log raw file in new tab
                const document = await vscode.workspace.openTextDocument(localFilePath);
                await vscode.window.showTextDocument(document);
            
                return;
            }

            // Check if there's already an ongoing download for this log
            const existingDownload = this._ongoingDownloads.get(logId);
            if (existingDownload) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Download already in progress for log: ${logId}, waiting for completion`);
                statusBarService.showProgress(`Waiting for ongoing download: ${logId}...`);
                
                // Wait for the existing download to complete
                await existingDownload;
                
                // After the existing download completes, try to open the cached file
                const cachedFilePath = this._downloadedLogPaths.get(logId);
                if (cachedFilePath && fs.existsSync(cachedFilePath)) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Opening log from completed download: ${cachedFilePath}`);
                    statusBarService.showProgress(`Opening downloaded log: ${logId}...`);
                    const document = await vscode.workspace.openTextDocument(cachedFilePath);
                    await vscode.window.showTextDocument(document);
                    return;
                } else {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Cached file not found after download completion, will retry download`);
                }
            }

            // Create a promise for this download and track it
            const downloadPromise = this._performLogDownload(logId, targetOrgAlias);
            this._ongoingDownloads.set(logId, downloadPromise);

            try {
                // Perform the actual download
                await downloadPromise;
                
                // Open the downloaded file
                const finalFilePath = this._downloadedLogPaths.get(logId);
                if (finalFilePath && fs.existsSync(finalFilePath)) {
                    statusBarService.showProgress(`Opening log editor: ${logId}...`);
                    const document = await vscode.workspace.openTextDocument(finalFilePath);
                    await vscode.window.showTextDocument(document);
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Successfully opened log: ${logId}`);
                } else {
                    throw new Error(`Downloaded log file not found for ${logId}`);
                }
            } finally {
                // Always clean up the tracking
                this._ongoingDownloads.delete(logId);
            }
        } catch (error: any) {
            // Clean up tracking on error
            this._ongoingDownloads.delete(logId);
            
            OrgUtils.logError(`[VisbalExt.OrgUtils] openLog -- Failed to open log ${logId}:`, error);
            statusBarService.showError(`Failed to open log: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to open log: ${error.message}`);
            throw error;
        }
    }

    /**
     * Performs the actual log download without concurrency control - used internally by openLog
     * @param logId The ID of the log to download
     * @param targetOrgAlias The target org alias
     */
    private static async _performLogDownload(logId: string, targetOrgAlias: string): Promise<void> {
        // Fetch and save the log content
        statusBarService.showProgress(`Downloading log content: ${logId}...`);
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Fetching log content for: ${logId} from org: ${targetOrgAlias}`);
        
        const logContent = await this._fetchLogContent(logId, targetOrgAlias);
        
        statusBarService.showProgress(`Preparing log file: ${logId}...`);
        
        // Determine target directory - use .visbal/logs like other methods
        const logsDir = vscode.workspace.workspaceFolders?.[0]
            ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visbal', 'logs')
            : path.join(os.homedir(), '.visbal', 'logs');
        
        // Ensure directory exists
        await fs.promises.mkdir(logsDir, { recursive: true });
        
        const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const tempFile = path.join(logsDir, `sf_${sanitizedLogId}_${timestamp}.log`);
        
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] openLog -- Writing log content to temp file: ${tempFile}`);
        await fs.promises.writeFile(tempFile, logContent);

        // Mark as downloaded
        this._downloadedLogs.add(logId);
        this._downloadedLogPaths.set(logId, tempFile);
    }

    /**
     * Downloads a log
     * @param logId The ID of the log to download
     */
    public static async downloadLog(logId: string, targetOrgAlias: string): Promise<void> {
        try {
            // Check if we already have a cached copy of this log
            const cachedFilePath = this._downloadedLogPaths.get(logId);
            if (cachedFilePath && fs.existsSync(cachedFilePath)) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] downloadLog -- Opening cached log from: ${cachedFilePath}`);
                statusBarService.showProgress(`Opening cached log: ${logId}...`);
                const document = await vscode.workspace.openTextDocument(cachedFilePath);
                await vscode.window.showTextDocument(document);
                statusBarService.showSuccess('Log opened from cache');
                return;
            }

            // Check if there's already an ongoing download for this log
            const existingDownload = this._ongoingDownloads.get(logId);
            if (existingDownload) {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] downloadLog -- Download already in progress for log: ${logId}, waiting for completion`);
                statusBarService.showProgress(`Waiting for ongoing download: ${logId}...`);
                
                // Wait for the existing download to complete
                await existingDownload;
                
                // After completion, try to open the cached file
                const completedFilePath = this._downloadedLogPaths.get(logId);
                if (completedFilePath && fs.existsSync(completedFilePath)) {
                    OrgUtils.logDebug(`[VisbalExt.OrgUtils] downloadLog -- Opening log from completed download: ${completedFilePath}`);
                    const document = await vscode.workspace.openTextDocument(completedFilePath);
                    await vscode.window.showTextDocument(document);
                    statusBarService.showSuccess('Log downloaded successfully');
                    return;
                }
            }

            // Create a promise for this download and track it
            const downloadPromise = this._performDetailedLogDownload(logId, targetOrgAlias);
            this._ongoingDownloads.set(logId, downloadPromise);

            try {
                statusBarService.showProgress(`Downloading log: ${logId}...`);
                
                // Perform the actual download
                await downloadPromise;
                
                // Open the downloaded file
                const finalFilePath = this._downloadedLogPaths.get(logId);
                if (finalFilePath && fs.existsSync(finalFilePath)) {
                    const document = await vscode.workspace.openTextDocument(finalFilePath);
                    await vscode.window.showTextDocument(document);
                    statusBarService.showSuccess('Log downloaded successfully');
                } else {
                    throw new Error(`Downloaded log file not found for ${logId}`);
                }
            } finally {
                // Always clean up the tracking
                this._ongoingDownloads.delete(logId);
            }
        } catch (error: any) {
            // Clean up tracking on error
            this._ongoingDownloads.delete(logId);
            
            OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- error:', error);
            statusBarService.showError(`Error downloading log: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to download log: ${error.message}`);
            throw error;
        }
    }

    /**
     * Performs the actual detailed log download with metadata-based filename - used internally by downloadLog
     * @param logId The ID of the log to download
     * @param targetOrgAlias The target org alias
     */
    private static async _performDetailedLogDownload(logId: string, targetOrgAlias: string): Promise<void> {
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
        const logContent = await this._fetchLogContent(logId, targetOrgAlias);
        OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- finish fetch:');
        await fs.promises.writeFile(targetFilePath, logContent);
        OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- finish writing file:');

        // Update tracking
        this._downloadedLogs.add(logId);
        this._downloadedLogPaths.set(logId, targetFilePath);
        OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogs:', this._downloadedLogs);
        OrgUtils.logDebug('[VisbalExt.OrgUtils] downloadLog -- _downloadedLogPaths:', this._downloadedLogPaths);
    }


    // ============================================================================
    // DEBUG & TRACE MANAGEMENT
    // ============================================================================

    public static async getExistingDebugTraceFlag(userId: string, currentOrgAlias?: string): Promise<{ existingTraceFlag: TraceFlag | null, existingDebugLevelId: string | null }> {
        let result = {
            existingTraceFlag: null as TraceFlag | null,
            existingDebugLevelId: null as string | null
        };
        
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -7 -- userId: ${userId} -- currentOrgAlias: ${currentOrgAlias} -- Checking for existing trace flags`);
            let query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='${DEFAULT_LOG_TYPE}'`;
            if (userId && userId != 'unknown') {
                query += ` AND TracedEntityId='${userId}'`;
            }
            try {
                OrgUtils.logDebug(`[VisbalExt.OrgUtils] getExistingDebugTraceFlag -- userId: ${userId} -- currentOrgAlias: ${currentOrgAlias} -- query: ${query}`);
                const records =  await this.sfdxService.executeSoqlQuery(query, false, true, currentOrgAlias);
                //const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --target-org $currentOrgAlias} --json`);
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
                    const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --target-org ${currentOrgAlias} --json`);
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

    public static async hasExistingDebugTraceFlag(currentOrgAlias: string): Promise<boolean> {
        const userId = await this.getCurrentUserId();
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- userId: ${userId} -- currentOrgAlias: ${currentOrgAlias}`);
        
        if (userId === null) {
            OrgUtils.logDebug('[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- userId is null, returning false.');
            return false;
        }

        const traceResult = await OrgUtils.getExistingDebugTraceFlag(userId, currentOrgAlias);
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- traceResult: ${traceResult}`);
        
        if (!traceResult.existingTraceFlag) {
            return false;
        }

        const now = new Date();
        const expirationDate = new Date(traceResult.existingTraceFlag.ExpirationDate);
        const isActive = expirationDate > now;
        
        OrgUtils.logDebug(`[VisbalExt.OrgUtils] hasExistingDebugTraceFlag -- isActive: ${isActive}, expires: ${expirationDate}`);
        return isActive;
    }


    // ============================================================================
    // SERVICE GETTERS
    // ============================================================================

    private static get sfdxService(): SfdxService {
        if (!this._sfdxService) {
            throw new Error('SfdxService not initialized in OrgUtils');
        }
        return this._sfdxService;
    }

    private static get cacheService(): CacheService {
        if (!this._cacheService) {
            throw new Error('CacheService not initialized in OrgUtils');
        }
        return this._cacheService;
    }

    private static get userIdCacheService(): UserIdCacheService {
        if (!this._userIdCacheService) {
            if (!this._context) {
                throw new Error('OrgUtils not initialized with a context');
            }
            const cachePath = OrgUtils.getCachePath();
            this._userIdCacheService = new UserIdCacheService(cachePath);
        }
        return this._userIdCacheService;
    }

    // ============================================================================
    // LOGGING & ERROR HANDLING
    // ============================================================================

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

    public static logWarning(message: string, o?: unknown, o2?: unknown): void {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        const saveToFile = config.get<boolean>('saveToFile', true);
        const displayInConsole = config.get<boolean>('displayInConsole', true);
        const debugMaxLength = config.get<number>('debugMaxLength', 250);
    
        if (saveToFile) {
            try {
                const debugFile = OrgUtils.getDebugFile();
                const timestamp = new Date().toISOString();
                let logMessage = `WARN:[${timestamp}] ${message}\n`;
                if (o !== undefined) {
                    const jsonString = JSON.stringify(o);
                    logMessage += `WARN:[${timestamp}] ${jsonString.length > debugMaxLength ? jsonString.slice(0, debugMaxLength) + '...' : jsonString}\n`;
                }
                if (o2 !== undefined) {
                    const jsonString = JSON.stringify(o2);
                    logMessage += `WARN:[${timestamp}] ${jsonString.length > debugMaxLength ? jsonString.slice(0, debugMaxLength) + '...' : jsonString}\n`;
                }
                fs.appendFileSync(debugFile, logMessage);
            } catch (error: any) {
                console.error('[VisbalExt.OrgUtils] logWarning -- Error logging warning information:', error);
            }
        }
    
        if (displayInConsole) {
            if (o !== undefined) {
                console.warn(`${message}`, o);
            } else {
                console.warn(`${message}`);
            }
        }
    }
    
    // Track last cleanup time to prevent excessive cleanup calls
    private static lastCleanupTime: number = 0;
    private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

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
        
        // Only run cleanup every 5 minutes to prevent race conditions
        const now = Date.now();
        if (now - OrgUtils.lastCleanupTime < OrgUtils.CLEANUP_INTERVAL) {
            return;
        }
        OrgUtils.lastCleanupTime = now;

        // Clean up old debug files (now using the correct configuration with 10 days default)
        const deleteDebugLogsOlderThan = config.get<number>('deleteDebugLogsOlderThan', 10);
        
        try {
            if (fs.existsSync(debugDir)) {
                const files = fs.readdirSync(debugDir);
                const cutoffDate = new Date(Date.now() - deleteDebugLogsOlderThan * 24 * 60 * 60 * 1000);
                
                files.forEach(file => {
                    try {
                        const filePath = path.join(debugDir, file);
                        
                        // Check if file still exists before attempting to stat it
                        if (!fs.existsSync(filePath)) {
                            return; // File already deleted by another process, skip silently
                        }

                        const stats = fs.statSync(filePath);
                        
                        // Use file modification time instead of parsing filename
                        if (stats.mtime < cutoffDate) {
                            // Double-check file still exists before deleting
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                // Only log successful deletions, don't call logDebug to avoid recursion
                                OrgUtils.logDebug(`[VisbalExt.OrgUtils] archiveDebugLog -- Deleted old debug file: ${file} (older than ${deleteDebugLogsOlderThan} days)`);
                            }
                        }
                    } catch (fileError: any) {
                        // Ignore "file not found" errors as they're expected in concurrent cleanup scenarios
                        if (fileError.code !== 'ENOENT') {
                            console.error(`[VisbalExt.OrgUtils] archiveDebugLog -- Error processing file ${file}:`, fileError);
                        }
                    }
                });
            }
        } catch (error) {
            console.error(`[VisbalExt.OrgUtils] archiveDebugLog -- Error during cleanup:`, error);
        }
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

    /**
     * Manually cleans up old debug files in the .visbal/debug directory
     * This method can be called independently of archiveDebugLog()
     * @returns A message indicating the cleanup results
     */
    public static cleanupOldDebugFiles(): string {
        const config = vscode.workspace.getConfiguration('visbal.logging');
        const deleteDebugLogsOlderThan = config.get<number>('deleteDebugLogsOlderThan', 10);
        const debugDir = OrgUtils.getDebugDir();
        
        try {
            if (fs.existsSync(debugDir)) {
                const files = fs.readdirSync(debugDir);
                const cutoffDate = new Date(Date.now() - deleteDebugLogsOlderThan * 24 * 60 * 60 * 1000);
                let deletedCount = 0;
                let skippedCount = 0;
                
                files.forEach(file => {
                    try {
                        const filePath = path.join(debugDir, file);
                        
                        // Check if file still exists before attempting to stat it
                        if (!fs.existsSync(filePath)) {
                            skippedCount++;
                            return; // File already deleted by another process, skip silently
                        }

                        const stats = fs.statSync(filePath);
                        
                        if (stats.mtime < cutoffDate) {
                            // Double-check file still exists before deleting
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                deletedCount++;
                                OrgUtils.logDebug(`[VisbalExt.OrgUtils] cleanupOldDebugFiles -- Deleted old debug file: ${file} (older than ${deleteDebugLogsOlderThan} days)`);
                            } else {
                                skippedCount++;
                            }
                        }
                    } catch (fileError: any) {
                        // Ignore "file not found" errors as they're expected in concurrent cleanup scenarios
                        if (fileError.code === 'ENOENT') {
                            skippedCount++;
                        } else {
                            console.error(`[VisbalExt.OrgUtils] cleanupOldDebugFiles -- Error processing file ${file}:`, fileError);
                        }
                    }
                });
                
                const message = `Cleanup completed. Deleted ${deletedCount} files older than ${deleteDebugLogsOlderThan} days from .visbal/debug directory.`;
                return skippedCount > 0 ? `${message} (${skippedCount} files were already processed by other cleanup operations)` : message;
            } else {
                return 'Debug directory does not exist.';
            }
        } catch (error) {
            const errorMessage = `Error during debug files cleanup: ${error}`;
            console.error(`[VisbalExt.OrgUtils] cleanupOldDebugFiles --`, error);
            return errorMessage;
        }
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
            OrgUtils._outputChannel.appendLine(`${message}`);
        }
    }


    // ============================================================================
    // TEST MANAGEMENT
    // ============================================================================

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

    // ============================================================================
    // FILE NAVIGATION & SYMBOL SEARCH (Delegated to SymbolNavigationService)
    // ============================================================================

    /**
     * Navigates to the symbol definition based on the current cursor position
     */
    public static async navigateToSelectedDefinition(): Promise<void> {
        return SymbolNavigationService.navigateToSelectedDefinition();
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

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

    public static openAndDisplayOutputTab(output: string): void {
        OrgUtils._outputChannel.appendLine(output);
        // Only show output channel when explicitly requested, not by default
        OrgUtils._outputChannel.show(true);
    }

    // ============================================================================
    // WEBVIEW SUPPORT METHODS
    // ============================================================================

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
            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Loading org list ${webview}`);
            
            // Show progress in status bar and webview
            statusBarService.showProgress('Loading Salesforce organizations...');
            webview?.postMessage({
                command: 'startLoading',
                message: 'Loading organizations...'
            });
            
            // Try to get from cache first
            const cachedData = await orgListCacheService.getCachedOrgList();
            let orgs;

            if (cachedData) {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Using cached org list`);
                orgs = cachedData.orgs;
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Cached orgs assigned, starting status update`);
                statusBarService.showSuccess('Organization list loaded from cache');
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Status bar updated, sending updateStatus to webview`);
                webview?.postMessage({
                    command: 'updateStatus',
                    message: 'Loaded from cache',
                    type: 'success'
                });
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- updateStatus message sent, proceeding to org selection logic`);
            } else {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- No valid cache found, fetching fresh org list from Salesforce CLI`);
                statusBarService.showProgress('Fetching fresh organization list from Salesforce...');
                webview?.postMessage({
                    command: 'updateStatus',
                    message: 'No cache found. Fetching fresh data from Salesforce...',
                    type: 'info'
                });
                
                orgs = await OrgUtils.listOrgs();
                const totalOrgs = Object.values(orgs).flat().length;
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Successfully fetched ${totalOrgs} orgs, saving to cache`);
                
                if (totalOrgs === 0) {
                    OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- WARNING: No orgs found even after fresh fetch from CLI`);
                    statusBarService.showError('No Salesforce organizations found. Please ensure you have authenticated orgs.');
                    webview?.postMessage({
                        command: 'updateStatus',
                        message: 'No organizations found. Please authenticate with Salesforce CLI.',
                        type: 'error'
                    });
                } else {
                    // Save to cache
                    await orgListCacheService.saveOrgList(orgs);
                    statusBarService.showSuccess(`Organization list fetched and cached successfully (${totalOrgs} orgs)`);
                    webview?.postMessage({
                        command: 'updateStatus',
                        message: `Fresh data loaded and cached (${totalOrgs} orgs)`,
                        type: 'success'
                    });
                }
            }

            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Starting org selection logic, viewId: ${viewId}`);
            let alias = null;
            // Get the selected org (view-specific if viewId provided, otherwise global)
            let selectedOrg = null;
            if (viewId) {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Getting view-specific org for ${viewId}`);
                const viewSpecificOrg = await OrgUtils.getSelectedOrgForView(viewId);
                selectedOrg = viewSpecificOrg;
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- View-specific selected org for ${viewId}:`, selectedOrg);
                alias = selectedOrg?.alias;

                if (selectedOrg == null) {
                    OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- No view-specific org, getting default from config`);
                    //get the alis set as a default project
                    alias = await OrgUtils.getDefaultTargetOrgFromConfig();
                    OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Default config org: ${alias}`);
                }
            } else {
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Getting global selected org`);
                selectedOrg = await OrgUtils.getSelectedOrg();
                OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Global selected org:`, selectedOrg);
                alias = selectedOrg?.alias;
            }
            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Final alias selected: ${alias}`);

            // Send the categorized orgs to the webview
            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- Sending updateOrgList to webview with ${Object.values(orgs).flat().length} orgs, selectedOrg: ${alias}`);
            webview?.postMessage({
                command: 'updateOrgList',
                orgs: orgs,
                fromCache: !!cachedData,
                selectedOrg: alias
            });
            OrgUtils.logDebug(`${loggerPrefix} loadOrgListForView -- updateOrgList message sent to webview`);
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

    public static async getSalesforceProjectFolderPath(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        for (const folder of workspaceFolders) {
            const projectFilePath = path.join(folder.uri.fsPath, 'force-app');
            if (fs.existsSync(projectFilePath)) {
                return folder.uri.fsPath;
            }
        }

        return null;
    }


} 