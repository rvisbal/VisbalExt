import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execAsync, MAX_BUFFER_SIZE } from '../utils/execUtils';
import { SalesforceOrg, OrgGroups } from '../types/salesforceTypes';
import { UserIdCacheService } from './userIdCacheService';
import { OrgListCacheService } from './orgListCacheService';
import { CacheService } from './cacheService';

/**
 * UserIdService - Handles user ID management operations for Salesforce organizations
 */
export class UserIdService {
    private static _userIdCacheService: UserIdCacheService | null = null;
    private static _orgListCacheService: OrgListCacheService;
    private static _cacheService: CacheService;
    private static _context: vscode.ExtensionContext;
    private static logDebug: (message: string, ...args: any[]) => void;
    private static logError: (message: string, error: any) => void;
    private static getCurrentOrgAlias: () => Promise<string>;
    private static getCachePath: () => string;
    private static getSalesforceProjectFolderPath: () => Promise<string | null>;
    private static getSelectedOrg: () => Promise<any | null>;

    /**
     * Initialize the UserIdService with dependencies
     */
    public static initialize(
        context: vscode.ExtensionContext,
        cacheService: CacheService,
        orgListCacheService: OrgListCacheService,
        logDebug: (message: string, ...args: any[]) => void,
        logError: (message: string, error: any) => void,
        getCurrentOrgAlias: () => Promise<string>,
        getCachePath: () => string,
        getSalesforceProjectFolderPath: () => Promise<string | null>,
        getSelectedOrg: () => Promise<any | null>
    ): void {
        this._context = context;
        this._cacheService = cacheService;
        this._orgListCacheService = orgListCacheService;
        this.logDebug = logDebug;
        this.logError = logError;
        this.getCurrentOrgAlias = getCurrentOrgAlias;
        this.getCachePath = getCachePath;
        this.getSalesforceProjectFolderPath = getSalesforceProjectFolderPath;
        this.getSelectedOrg = getSelectedOrg;
    }

    /**
     * Gets the user ID from the user-ids.json cache file
     * @returns Promise<string | null> The user ID if found in cache, null otherwise
     */
    private static async getUserIdFromOrgCache(): Promise<string | null> {
        try {
            // Get the current org alias first
            const currentOrgAlias = await this.getCurrentOrgAlias();
            if (!currentOrgAlias) {
                this.logDebug('[VisbalExt.UserIdService] getUserIdFromOrgCache -- No current org alias');
                return null;
            }

            // Check if we have a workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.logDebug('[VisbalExt.UserIdService] getUserIdFromOrgCache -- No workspace folder');
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
                        this.logDebug(`[VisbalExt.UserIdService] getUserIdFromOrgCache -- Found cached user ID for ${currentOrgAlias}: ${cachedUserId}`);
                        return cachedUserId;
                    }
                } catch (parseError) {
                    this.logDebug('[VisbalExt.UserIdService] getUserIdFromOrgCache -- Error parsing user ID cache:', parseError);
                }
            }

            // If no cached user ID found
            this.logDebug(`[VisbalExt.UserIdService] getUserIdFromOrgCache -- No cached user ID for: ${currentOrgAlias}`);
            return null;

        } catch (error: any) {
            this.logError('[VisbalExt.UserIdService] getUserIdFromOrgCache -- Error:', error);
            return null;
        }
    }

    /**
     * Caches the user ID in the user-ids.json file for the specified org
     * @param orgAlias The org alias
     * @param userId The user ID to cache
     */
    private static async cacheUserId(orgAlias: string, userId: string, orgId: string): Promise<void> {
        this.logDebug(`[VisbalExt.UserIdService] cacheUserId -- Caching userId: ${userId}, orgId: ${orgId} for alias: ${orgAlias}`);
        // Ensure userIdCacheService is initialized
        if (!this._userIdCacheService) {
            const cachePath = this.getCachePath();
            this._userIdCacheService = new UserIdCacheService(cachePath);
        }
        await this._userIdCacheService.setCachedUserIdEntry(orgAlias, userId, orgId);
        this.logDebug(`[VisbalExt.UserIdService] cacheUserId -- Successfully cached userId for ${orgAlias}`);
    }

    /**
     * Gets user ID for a specific org alias
     * @param orgAlias The org alias to get user ID for
     * @returns Promise<string> The user ID for the specified org
     */
    public static async getUserIdForOrg(orgAlias: string): Promise<string> {
        try {
            this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Getting user ID for org: ${orgAlias}`);
            
            // First try to get from cache
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const userIdCacheFile = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache', 'user-ids.json');
                    
                    if (fs.existsSync(userIdCacheFile)) {
                        const cacheContent = fs.readFileSync(userIdCacheFile, 'utf8');
                        const userIdCache = JSON.parse(cacheContent);
                        
                        if (userIdCache[orgAlias]) {
                            const cachedUserId = userIdCache[orgAlias];
                            this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Found cached user ID for ${orgAlias}: ${cachedUserId}`);
                            return cachedUserId;
                        }
                    }
                }
            } catch (cacheError) {
                this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Cache read failed for ${orgAlias}:`, cacheError);
            }

            // If not in cache, fetch from SF CLI
            let userId: string = '';
            let orgId: string = '';
            try {
                this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Fetching user ID from CLI for org: ${orgAlias}`);
                const { stdout: userResult } = await execAsync(`sf org display user --target-org ${orgAlias} --json`);
                const userJson = JSON.parse(userResult);
                userId = userJson.result.id;
                orgId = userJson.result.orgId;
                this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Got user ID from CLI for ${orgAlias}: ${userId}`);
            } catch (error: any) {
                this.logError(`[VisbalExt.UserIdService] getUserIdForOrg -- Error getting user ID with new CLI format for ${orgAlias}:`, error);
                
                // Try with old CLI format
                try {
                    const { stdout: userResult } = await execAsync(`sfdx force:user:display --target-org ${orgAlias} --json`);
                    const userJson = JSON.parse(userResult);
                    userId = userJson.result.id;
                    orgId = userJson.result.orgId;
                    this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Got user ID from old CLI format for ${orgAlias}: ${userId}`);
                } catch (oldError: any) {
                    this.logError(`[VisbalExt.UserIdService] getUserIdForOrg -- Error getting user ID with old CLI format for ${orgAlias}:`, oldError);
                    throw new Error(`Failed to get user ID for org ${orgAlias}. Make sure you are authenticated.`);
                }
            }

            if (userId) {
                // Cache the user ID for future use
                try {
                    await this.cacheUserId(orgAlias, userId, orgId);
                    this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Successfully cached user ID for ${orgAlias}: ${userId}`);
                } catch (cacheError) {
                    this.logDebug(`[VisbalExt.UserIdService] getUserIdForOrg -- Warning: Could not cache user ID for ${orgAlias}:`, cacheError);
                }
            }

            return userId;
        } catch (error: any) {
            this.logError(`[VisbalExt.UserIdService] getUserIdForOrg -- Error getting user ID for ${orgAlias}:`, error);
            throw error;
        }
    }

    /**
     * Gets the org ID for a specific org alias from the cache.
     * @param alias The org alias to get the org ID for.
     * @returns Promise<string | null> The org ID if found, null otherwise.
     */
    public static async getOrgIdForAlias(alias: string): Promise<string | null> {
        return this._cacheService.getOrgIdForAlias(alias);
    }

    public static async getCurrentUserId(alias?: string): Promise<string | null> {
        this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- BEGIN with alias: ${alias}`);

        if (!this._context) {
            throw new Error('UserIdService not initialized with a context');
        }

        if (!this._userIdCacheService) {
            // Use the workspace folder from the active Salesforce project, not the extension's workspace
            const projectPath = await this.getSalesforceProjectFolderPath();
            if (projectPath) {
                const cachePath = path.join(projectPath, '.visbal', 'cache');
                this._userIdCacheService = new UserIdCacheService(cachePath);
                this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Set userIdCacheService: ${this._userIdCacheService}`);
            } else {
                this.logDebug('[VisbalExt.UserIdService] getCurrentUserId -- No Salesforce project folder found. userIdCacheService will remain null.');
                this._userIdCacheService = null; // Explicitly set to null if projectPath is not found
            }
        }

        const targetAlias = alias || await this.getCurrentOrgAlias();
        if (!targetAlias) {
            throw new Error('No default Salesforce org found and no alias provided.');
        }

        // Try to read from cache first
        if (this._userIdCacheService) { // Check if _userIdCacheService is not null
            if (await this._userIdCacheService.exists(targetAlias)) {
                try {
                    const cachedEntry = await this._userIdCacheService.getCachedUserIdEntry(targetAlias);
                    if (cachedEntry) {
                        this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Found in cache for ${targetAlias}: userId=${cachedEntry.userId}, orgId=${cachedEntry.orgId}`);

                        // Validate cache against current org info
                        const currentOrgInfo = await this.getOrgInfo(targetAlias, cachedEntry.orgId);
                        if (currentOrgInfo && cachedEntry.orgId === currentOrgInfo.orgId) { // Add null check for cachedEntry
                            this.logDebug('[VisbalExt.UserIdService] getCurrentUserId -- Cache is valid, returning cached userId');
                            return cachedEntry.userId;
                        } else {
                            this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Cached orgId (${cachedEntry.orgId})) does not match current orgId (${currentOrgInfo?.orgId})) for alias ${targetAlias}. Refreshing cache.`);
                            await this._userIdCacheService.removeCachedUserIdEntry(targetAlias); // Invalidate cache
                        }
                    }
                } catch (error: any) {
                    this.logError('[VisbalExt.UserIdService] getCurrentUserId -- Error reading or parsing userId cache, re-fetching:', error);
                    // Invalidate cache on error
                    if (targetAlias) {
                        await this._userIdCacheService.removeCachedUserIdEntry(targetAlias);
                    }
                }
            }
        }

        // If not in cache or cache is invalid, fetch from Salesforce
        try {
            this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Fetching user ID for alias: ${targetAlias}`);

            // Use the new SF CLI command 'sf org display user'
            const command = `sf org display user --target-org ${targetAlias} --json`;
            const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
            const result = JSON.parse(stdout);

            if (result.status === 0 && result.result && result.result.id && result.result.orgId) {
                this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Fetched userId=${result.result.id}, orgId=${result.result.orgId} for alias=${targetAlias}`);

                // Update cache
                if (this._userIdCacheService) { // Add null check
                    await this._userIdCacheService.setCachedUserIdEntry(targetAlias, result.result.id, result.result.orgId);
                }

                return result.result.id;
            } else {
                this.logError('[VisbalExt.UserIdService] getCurrentUserId -- Unexpected CLI output:', result);
                throw new Error('Failed to get user ID: Unexpected CLI output.');
            }
        } catch (error: any) {
            this.logError('[VisbalExt.UserIdService] getCurrentUserId -- Error fetching user ID with sf org display user:', error);
            // Attempt to fall back to sfdx force:user:display
            try {
                this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Falling back to sfdx force:user:display for alias: ${targetAlias}`);
                const command = `sfdx force:user:display --target-org ${targetAlias} --json`;
                const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                const result = JSON.parse(stdout);

                if (result.status === 0 && result.result && result.result.id && result.result.orgId) {
                    this.logDebug(`[VisbalExt.UserIdService] getCurrentUserId -- Fetched userId=${result.result.id}, orgId=${result.result.orgId} (sfdx fallback) for alias=${targetAlias}`);

                    // Update cache
                    if (this._userIdCacheService) { // Add null check
                        await this._userIdCacheService.setCachedUserIdEntry(targetAlias, result.result.id, result.result.orgId);
                    }

                    return result.result.id;
                } else {
                    this.logError('[VisbalExt.UserIdService] getCurrentUserId -- Unexpected CLI output (sfdx fallback):', result);
                    throw new Error('Failed to get user ID with sfdx fallback: Unexpected CLI output.');
                }
            } catch (sfdxError: any) {
                this.logError('[VisbalExt.UserIdService] getCurrentUserId -- Error fetching user ID with sfdx fallback:', sfdxError);
                throw new Error(`Failed to get current user ID for alias "${targetAlias}". Make sure you are authenticated with this org. Details: ${sfdxError.message}`);
            }
        }
    }

    /**
     * Retrieves the Salesforce org information for a given alias.
     * @param alias The alias of the Salesforce org.
     * @returns A SalesforceOrg object containing the org details.
     */
    public static async getOrgInfo(alias: string, expectedOrgId?: string): Promise<SalesforceOrg | null> {
        this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- BEGIN with alias: ${alias}${expectedOrgId ? `, expectedOrgId: ${expectedOrgId}` : ''}`);
        try {
            // First, try to get from cache
            const cachedOrgList = await this._orgListCacheService.getCachedOrgList();
            if (cachedOrgList && cachedOrgList.orgs) {
                const allOrgs = [
                    ...cachedOrgList.orgs.devHubs,
                    ...cachedOrgList.orgs.sandboxes,
                    ...cachedOrgList.orgs.scratchOrgs,
                    ...cachedOrgList.orgs.nonScratchOrgs,
                    ...cachedOrgList.orgs.other
                ];
                const orgInfo = allOrgs.find(org => (org.alias === alias || org.username === alias) && (!expectedOrgId || org.orgId === expectedOrgId));
                if (orgInfo) {
                    this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Found in cache for ${alias}:`, orgInfo);
                    // If expectedOrgId is provided and doesn't match, consider cache invalid
                    if (expectedOrgId && orgInfo.orgId !== expectedOrgId) {
                        this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Cached orgId ${orgInfo.orgId} does not match expected orgId ${expectedOrgId}, syncing...`);
                    } else {
                        return orgInfo;
                    }
                }
                this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Not found in cache for ${alias}.` + (expectedOrgId ? ` or orgId mismatch with ${expectedOrgId}` : ''));
            }

            // If not in cache or cache is old or userId mismatch, call CLI
            const command = `sf org display --target-org ${alias} --json`;
            const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
            const result = JSON.parse(stdout);

            this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Raw CLI output for ${alias}:`, stdout); // Added log
            this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Parsed CLI result for ${alias}:`, result); // Added log

            if (result.status === 0 && result.result) {
                // Ensure orgId is populated from id if orgId is missing in CLI output
                if (result.result.id && !result.result.orgId) {
                    result.result.orgId = result.result.id;
                }
                const fetchedOrgInfo = result.result as SalesforceOrg;
                this.logDebug(`[VisbalExt.UserIdService] getOrgInfo -- Fetched org info for ${alias}:`, fetchedOrgInfo);

                // Update the org list cache after fetching from CLI
                if (this._orgListCacheService) {
                    const currentOrgList = await this._orgListCacheService.getCachedOrgList();
                    if (currentOrgList) {
                        let updated = false;
                        (['devHubs', 'sandboxes', 'scratchOrgs', 'nonScratchOrgs', 'other'] as Array<keyof OrgGroups>).forEach(group => {
                            const orgIndex = currentOrgList.orgs[group].findIndex((org: SalesforceOrg) => org.alias === fetchedOrgInfo.alias || org.username === fetchedOrgInfo.username);
                            if (orgIndex !== -1) {
                                currentOrgList.orgs[group][orgIndex] = fetchedOrgInfo;
                                updated = true;
                            }
                        });
                        if (!updated) {
                            // If the org wasn't found in any existing group, add it to 'other' or a suitable default
                            // For simplicity, adding to scratchOrgs if it has type 'scratchOrg', otherwise 'other'
                            if (fetchedOrgInfo.type === 'scratchOrg') {
                                currentOrgList.orgs.scratchOrgs.push(fetchedOrgInfo);
                            } else {
                                currentOrgList.orgs.other.push(fetchedOrgInfo);
                            }
                        }
                        await this._orgListCacheService.saveOrgList(currentOrgList.orgs);
                    } else {
                        // If no cache exists, create a new one with this org
                        const newOrgGroups: OrgGroups = {
                            devHubs: [], sandboxes: [], scratchOrgs: [], nonScratchOrgs: [], other: []
                        };
                        if (fetchedOrgInfo.type === 'scratchOrg') {
                            newOrgGroups.scratchOrgs.push(fetchedOrgInfo);
                        } else {
                            newOrgGroups.other.push(fetchedOrgInfo);
                        }
                        await this._orgListCacheService.saveOrgList(newOrgGroups);
                    }
                }
                return fetchedOrgInfo;
            } else {
                this.logError('[VisbalExt.UserIdService] getOrgInfo -- Unexpected CLI output:', result);
                return null;
            }
        } catch (error: any) {
            this.logError(`[VisbalExt.UserIdService] getOrgInfo -- Error fetching org info for alias ${alias}:`, error);
            return null;
        }
    }

    /**
     * Opens the default org in a browser
     */
    public static async openDefaultOrg(): Promise<void> {
        try {
            this.logDebug('[VisbalExt.UserIdService] openDefaultOrg -- Opening default org');
            await execAsync('sf org open');
            this.logDebug('[VisbalExt.UserIdService] openDefaultOrg -- Successfully opened default org');
        } catch (error: any) {
            this.logError('[VisbalExt.UserIdService] openDefaultOrg -- Error opening default org:', error as Error);
            throw new Error(`Failed to open default org: ${error.message}`);
        }
    }

    public static async openSelectedOrg(): Promise<void> {
        try {
            this.logDebug('[VisbalExt.UserIdService] openSelectedOrg -- Opening selected org');
            const selectedOrg = await this.getSelectedOrg();
            this.logDebug('[VisbalExt.UserIdService] openSelectedOrg -- Retrieved selectedOrg:', selectedOrg);
            await execAsync(`sf org open --target-org ${selectedOrg?.alias}`);
            this.logDebug('[VisbalExt.UserIdService] openSelectedOrg -- Successfully opened selected org');
        } catch (error: any) {
            this.logError('[VisbalExt.UserIdService] openSelectedOrg -- Error opening selected org:', error as Error);
            throw new Error(`Failed to open selected org: ${error.message}`);
        }
    }

    public static async openOrg(alias: string): Promise<void> {
        try {
            this.logDebug(`[VisbalExt.UserIdService] openOrg -- alias: ${alias}`);
            await execAsync(`sf org open --target-org ${alias}`);
            this.logDebug(`[VisbalExt.UserIdService] openOrg -- Successfully opened alias: ${alias}`);
        } catch (error: any) {
            this.logError('[VisbalExt.UserIdService] openOrg -- Error opening selected org:', error as Error);
            throw new Error(`Failed to open  alias: ${alias}: ${error.message}`);
        }
    }
}
