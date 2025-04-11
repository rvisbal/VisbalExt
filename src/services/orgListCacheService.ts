import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgGroups } from '../utils/orgUtils';
import { OrgUtils } from '../utils/orgUtils';

interface OrgListCache {
    orgs: OrgGroups;
    timestamp: number;
}

export class OrgListCacheService {
    private cachePath: string;
    private orgListCacheFile: string;

    constructor(context: vscode.ExtensionContext) {
        // Get the workspace folder path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Set up cache in .visbal folder within the project
        this.cachePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
        this.orgListCacheFile = path.join(this.cachePath, 'org-list.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.cachePath)) {
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Creating .visbal/cache directory');
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        // Initialize cache file if it doesn't exist
        if (!fs.existsSync(this.orgListCacheFile)) {
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Initializing org-list.json');
            this.writeCache(null);
        }
    }

    private readCache(): OrgListCache | null {
        try {
            if (fs.existsSync(this.orgListCacheFile)) {
                const data = fs.readFileSync(this.orgListCacheFile, 'utf8');
                return JSON.parse(data);
            }
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgListCacheService] Error reading cache:', error);
            return null;
        }
    }

    private writeCache(cache: OrgListCache | null): void {
        try {
            fs.writeFileSync(this.orgListCacheFile, JSON.stringify(cache, null, 2));
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Cache saved to:', this.orgListCacheFile);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgListCacheService] Error writing cache:', error);
            throw error;
        }
    }

    public async getCachedOrgList(): Promise<OrgListCache | null> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Getting cached org list');
            const cache = this.readCache();
            
            if (!cache) {
                return null;
            }

            // Check if cache is older than 1 hour
            const cacheAge = Date.now() - cache.timestamp;
            if (cacheAge > (3600000 * 24)) { // 1 hour in milliseconds
                OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Cache is too old, returning null');
                return null;
            }

            return cache;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgListCacheService] Error getting cached org list:', error);
            return null;
        }
    }

    public async saveOrgList(orgs: OrgGroups): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Saving org list to cache');
            const cache: OrgListCache = {
                orgs,
                timestamp: Date.now()
            };
            this.writeCache(cache);
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Org list saved to cache');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgListCacheService] Error saving org list:', error);
            throw error;
        }
    }

    public async clearCache(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Clearing org list cache');
            this.writeCache(null);
            OrgUtils.logDebug('[VisbalExt.OrgListCacheService] Org list cache cleared');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.OrgListCacheService] Error clearing cache:', error);
            throw error;
        }
    }
} 