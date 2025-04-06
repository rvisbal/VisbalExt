import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SalesforceLog } from '../types/salesforceLog';
import { execAsync } from '../utils/execUtils';
import { SfdxService } from './sfdxService';
import { OrgUtils } from '../utils/orgUtils';

interface LogCache {
    [orgAlias: string]: {
        logs: SalesforceLog[];
        lastFetchTime: number;
        downloadedLogs: string[];
        downloadedLogPaths: { [logId: string]: string };
        selectedOrg?: { alias: string; timestamp: string };
    };
}

export class CacheService {
    private cachePath: string;
    private logCacheFile: string;
    private currentOrgAlias: string | undefined;
    private _sfdxService: SfdxService;

    constructor(context: vscode.ExtensionContext) {
        this._sfdxService = new SfdxService();
        // Get the workspace folder path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Set up cache in .visbal folder within the project
        this.cachePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
        this.logCacheFile = path.join(this.cachePath, 'logs.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.cachePath)) {
            console.log('[VisbalExt.CacheService] Creating .visbal/cache directory');
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        // Initialize cache file if it doesn't exist
        if (!fs.existsSync(this.logCacheFile)) {
            console.log('[VisbalExt.CacheService] Initializing logs.json');
            this.writeCache({});
        }
    }

    private readCache(): LogCache {
        try {
            if (fs.existsSync(this.logCacheFile)) {
                const data = fs.readFileSync(this.logCacheFile, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading cache:', error);
            return {};
        }
    }

    private writeCache(cache: LogCache): void {
        try {
            fs.writeFileSync(this.logCacheFile, JSON.stringify(cache, null, 2));
            console.log('[VisbalExt.CacheService] Cache saved to:', this.logCacheFile);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error writing cache:', error);
            throw error;
        }
    }

    public async getCachedLogs(): Promise<SalesforceLog[]> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            return cache[orgAlias]?.logs || [];
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading cached logs:', error);
            return [];
        }
    }

    public async saveCachedLogs(logs: SalesforceLog[]): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            
            if (!cache[orgAlias]) {
                cache[orgAlias] = {
                    logs: [],
                    lastFetchTime: 0,
                    downloadedLogs: [],
                    downloadedLogPaths: {}
                };
            }
            
            cache[orgAlias].logs = logs;
            cache[orgAlias].lastFetchTime = Date.now();

            this.writeCache(cache);
            console.log(`[VisbalExt.CacheService] Logs cached for org ${orgAlias}`);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error caching logs:', error);
            throw error;
        }
    }

    public async getCachedOrg(): Promise<{ alias: string; timestamp: string } | null> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            console.log('[VisbalExt.CacheService] getCachedOrg -- orgAlias:', orgAlias);
            const cache = this.readCache();
            return cache[orgAlias]?.selectedOrg || null;
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading cached org:', error);
            return null;
        }
    }

    public async saveCachedOrg(selectedOrg: { alias: string; timestamp: string }): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            console.log('[VisbalExt.CacheService] getCasaveCachedOrgchedOrg -- orgAlias:', orgAlias);
            const cache = this.readCache();
            
            if (!cache[orgAlias]) {
                cache[orgAlias] = {
                    logs: [],
                    lastFetchTime: 0,
                    downloadedLogs: [],
                    downloadedLogPaths: {}
                };
            }
            
            cache[orgAlias].selectedOrg = selectedOrg;
            cache[orgAlias].lastFetchTime = Date.now();

            this.writeCache(cache);
            console.log(`[VisbalExt.CacheService] Selected org cached: ${selectedOrg.alias}`);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error caching selected org:', error);
            throw error;
        }
    }

    public async getLastFetchTime(): Promise<number> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            return cache[orgAlias]?.lastFetchTime || 0;
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading last fetch time:', error);
            return 0;
        }
    }

    public async getDownloadedLogs(): Promise<Set<string>> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            return new Set(cache[orgAlias]?.downloadedLogs || []);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading downloaded logs:', error);
            return new Set();
        }
    }

    public async getDownloadedLogPaths(): Promise<Map<string, string>> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            return new Map(Object.entries(cache[orgAlias]?.downloadedLogPaths || {}));
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error reading downloaded log paths:', error);
            return new Map();
        }
    }

    public async saveDownloadedLogs(downloadedLogs: Set<string>, downloadedLogPaths: Map<string, string>): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            
            if (!cache[orgAlias]) {
                cache[orgAlias] = {
                    logs: [],
                    lastFetchTime: 0,
                    downloadedLogs: [],
                    downloadedLogPaths: {}
                };
            }
            
            cache[orgAlias].downloadedLogs = Array.from(downloadedLogs);
            cache[orgAlias].downloadedLogPaths = Object.fromEntries(downloadedLogPaths);

            this.writeCache(cache);
            console.log(`[VisbalExt.CacheService] Downloaded logs saved for org ${orgAlias}`);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error saving downloaded logs:', error);
            throw error;
        }
    }

    public async clearCache(): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            delete cache[orgAlias];
            this.writeCache(cache);
            console.log(`[VisbalExt.CacheService] Cache cleared for org ${orgAlias}`);
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error clearing cache:', error);
            throw error;
        }
    }

    public async clearAllCache(): Promise<void> {
        try {
            this.writeCache({});
            console.log('[VisbalExt.CacheService] All cache cleared');
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error clearing all cache:', error);
            throw error;
        }
    }
} 