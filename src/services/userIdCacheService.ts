import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgUtils } from '../utils/orgUtils';
import { getExtensionVersion } from '../utils/extensionUtils';

export interface UserIdCacheEntry {
    userId: string;
    orgId: string;
}

export interface BaseCache {
    versionId?: string;
}

export interface AliasIndexedUserIdCache {
    [alias: string]: UserIdCacheEntry | undefined; // Allow dynamic keys for aliases
}

export type UserIdCache = BaseCache & AliasIndexedUserIdCache;

/**
 * Service to manage user ID cache in .visbal/cache/user-ids.json
 * Cache structure: { "alias": { "userId": "...", "orgId": "..." } }
 */
export class UserIdCacheService {
    private cachePath: string;
    private userIdCacheFile: string;

    constructor(cachePath: string) {
        // Get the workspace folder path
        this.cachePath = cachePath;
        this.userIdCacheFile = path.join(this.cachePath, 'user-ids.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.cachePath)) {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] constructor -- Creating .visbal/cache directory');
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        const currentVersion = getExtensionVersion();
        // Read the cache to check its version, if it exists
        const existingCacheFileContent = this.readCacheFileContent();

        if (!fs.existsSync(this.userIdCacheFile) || existingCacheFileContent.versionId !== currentVersion) {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] constructor -- Initializing or recreating user-ids.json due to missing/obsolete versionId');
            // Initialize with an empty cache and current version
            this.writeCache({}); // writeCache will add the versionId
            this.refreshAndSaveUserIds();
        } else {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] constructor -- user-ids.json cache is up to date.');
        }
    }

    // Internal helper to read the raw file content including versionId
    private readCacheFileContent(): { versionId?: string; [key: string]: UserIdCacheEntry | string | undefined } {
        try {
            if (fs.existsSync(this.userIdCacheFile)) {
                const data = fs.readFileSync(this.userIdCacheFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] readCacheFileContent -- Error reading cache file content:', error);
        }
        return {}; // Return an empty object if file not found or error
    }

    private readCache(): UserIdCache {
        try {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] readCache -- userIdCacheFile:', this.userIdCacheFile);
            const fileContent = this.readCacheFileContent();
            const currentVersion = getExtensionVersion();

            if (!fileContent.versionId || fileContent.versionId !== currentVersion) {
                OrgUtils.logDebug('[VisbalExt.UserIdCacheService] readCache -- user-ids.json is obsolete or missing versionId, returning empty cache');
                return {}; // Return an empty UserIdCache
            }

            // Destructure to separate versionId from alias-indexed properties
            const { versionId, ...restOfCache } = fileContent;
            return restOfCache as UserIdCache;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] readCache -- Error reading cache, treating as obsolete:', error);
            return {};
        }
    }

    private writeCache(cache: UserIdCache): void {
        try {
            const currentVersion = getExtensionVersion();
            // Create an object to write to the file, including versionId
            const cacheToWrite = {
                versionId: currentVersion,
                ...cache
            };
            fs.writeFileSync(this.userIdCacheFile, JSON.stringify(cacheToWrite, null, 2));
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] writeCache -- Cache saved to:', this.userIdCacheFile);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] writeCache -- Error writing cache:', error);
            throw error;
        }
    }

    public async get(): Promise<UserIdCache> {
        return this.readCache();
    }

    public async set(cache: UserIdCache): Promise<void> {
        this.writeCache(cache);
    }

    public async exists(alias?: string): Promise<boolean> {
        if (!alias) {
            return fs.existsSync(this.userIdCacheFile);
        }
        const cache = this.readCache();
        return !!cache[alias];
    }

    /**
     * Get cached user ID entry for an alias
     */
    public getCachedUserIdEntry(alias: string): UserIdCacheEntry | null {
        try {
            const cache = this.readCache();
            const entry = cache[alias];
            if (entry) {
                return entry;
            }
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] Error getting cached user ID entry:', error);
            return null;
        }
    }

    /**
     * Cache user ID entry for an alias
     */
    public setCachedUserIdEntry(alias: string, userId: string, orgId: string): void {
        try {
            const cache = this.readCache();
            cache[alias] = {
                userId: userId,
                orgId: orgId
            };
            this.writeCache(cache);
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] setCachedUserIdEntry', `Cached user ID for alias: ${alias}, userId: ${userId}, orgId: ${orgId}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] setCachedUserIdEntry -- Error caching user ID entry:', error);
            throw error;
        }
    }

    /**
     * Remove cached user ID entry for an alias
     */
    public removeCachedUserIdEntry(alias: string): void {
        try {
            const cache = this.readCache();
            delete cache[alias];
            this.writeCache(cache);
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] removeCachedUserIdEntry', `Removed cached user ID for alias: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] Error removing cached user ID entry:', error);
            throw error;
        }
    }

    /**
     * Clear all cached user ID entries
     */
    public clearCache(): void {
        try {
            this.writeCache({}); // Clears all alias entries and sets new versionId
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] clearCache -- All cached user IDs cleared');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] clearCache -- Error clearing cache:', error);
            throw error;
        }
    }

    /**
     * Get all cached user ID entries
     */
    public getAllCachedEntries(): UserIdCache {
        return this.readCache();
    }

    public async refreshAndSaveUserIds(): Promise<void> {
        const currentVersion = getExtensionVersion();
        let updatedCache: UserIdCache = this.readCache(); // Read existing cache
        // versionId is handled by writeCache, no need to set here directly on updatedCache

        try {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- Refreshing user IDs for cache recreation');
            const currentOrgAlias = await OrgUtils.getCurrentOrgAlias();
            if (currentOrgAlias) {
                const userId = await OrgUtils.getUserIdForOrg(currentOrgAlias);
                const orgId = await OrgUtils.getOrgIdForAlias(currentOrgAlias);
                
                if (userId && orgId) {
                    updatedCache[currentOrgAlias] = { userId, orgId };
                    OrgUtils.logDebug('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- Successfully retrieved userId and orgId for alias:', currentOrgAlias);
                } else {
                    updatedCache[currentOrgAlias] = { userId: userId || '', orgId: orgId || '' };
                    OrgUtils.logDebug('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- Could not get userId or orgId for alias:', currentOrgAlias, 'initializing with empty values.');
                }
            } else {
                // If no current org alias, consider removing the SECURITY_REVIEW entry if it exists
                if (updatedCache.SECURITY_REVIEW) {
                    delete updatedCache.SECURITY_REVIEW;
                    OrgUtils.logDebug('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- No current org alias, removing old SECURITY_REVIEW entry.');
                }
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- Error refreshing and saving user IDs:', error);
        } finally {
            this.writeCache(updatedCache);
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] refreshAndSaveUserIds -- User IDs refresh process completed and cache saved.');
        }
    }
}
