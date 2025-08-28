import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgUtils } from '../utils/orgUtils';

export interface UserIdCacheEntry {
    userId: string;
    orgId: string;
}

export interface UserIdCache {
    [alias: string]: UserIdCacheEntry;
}

/**
 * Service to manage user ID cache in .visbal/cache/user-ids.json
 * Cache structure: { "alias": { "userId": "...", "orgId": "..." } }
 */
export class UserIdCacheService {
    private cachePath: string;
    private userIdCacheFile: string;

    constructor(context: vscode.ExtensionContext) {
        // Get the workspace folder path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Set up cache in .visbal folder within the project
        this.cachePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
        this.userIdCacheFile = path.join(this.cachePath, 'user-ids.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.cachePath)) {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] constructor -- Creating .visbal/cache directory');
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        // Initialize cache file if it doesn't exist
        if (!fs.existsSync(this.userIdCacheFile)) {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] constructor -- Initializing user-ids.json');
            this.writeCache({});
        }
    }

    private readCache(): UserIdCache {
        try {
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] readCache -- userIdCacheFile:', this.userIdCacheFile);
            if (fs.existsSync(this.userIdCacheFile)) {
                const data = fs.readFileSync(this.userIdCacheFile, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] readCache -- Error reading cache:', error);
            return {};
        }
    }

    private writeCache(cache: UserIdCache): void {
        try {
            fs.writeFileSync(this.userIdCacheFile, JSON.stringify(cache, null, 2));
            OrgUtils.logDebug('[VisbalExt.UserIdCacheService] writeCache -- Cache saved to:', this.userIdCacheFile);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.UserIdCacheService] writeCache -- Error writing cache:', error);
            throw error;
        }
    }

    /**
     * Get cached user ID entry for an alias
     */
    public getCachedUserIdEntry(alias: string): UserIdCacheEntry | null {
        try {
            const cache = this.readCache();
            return cache[alias] || null;
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
            if (cache[alias]) {
                delete cache[alias];
                this.writeCache(cache);
                OrgUtils.logDebug('[VisbalExt.UserIdCacheService] removeCachedUserIdEntry', `Removed cached user ID for alias: ${alias}`);
            }
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
            this.writeCache({});
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
}
