import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SalesforceLog } from '../types/salesforceLog';
import { execAsync } from '../utils/execUtils';
import { SfdxService } from './sfdxService';
import { OrgUtils } from '../utils/orgUtils';
import { OrgListCacheService } from './orgListCacheService';
import { getExtensionVersion } from '../utils/extensionUtils';

interface OrgLogData {
    logs: SalesforceLog[];
    lastFetchTime: number;
    downloadedLogs: string[];
    downloadedLogPaths: { [logId: string]: string };
    selectedOrg?: { alias: string; timestamp: string };
}

export type LogCache = Record<string, OrgLogData> & { versionId?: string };

export class CacheService {
    private cachePath: string;
    private logCacheFile: string;
    private currentOrgAlias: { alias: string; timestamp: number } | undefined;
    private readonly CACHE_EXPIRATION = 15 * 60 * 1000; // 15 minutes in milliseconds
    private _sfdxService: SfdxService; // No longer private as it's passed in constructor
    private _orgListCacheService: OrgListCacheService; // No longer private as it's passed in constructor

    constructor(cachePath: string, sfdxService: SfdxService, orgListCacheService: OrgListCacheService) {
        this.cachePath = cachePath;
        this.logCacheFile = path.join(this.cachePath, 'logs.json');
        this._sfdxService = sfdxService;
        this._orgListCacheService = orgListCacheService;
 
        if (!fs.existsSync(this.cachePath)) {
            OrgUtils.logDebug('[VisbalExt.CacheService] constructor -- Creating .visbal/cache directory');
            fs.mkdirSync(this.cachePath, { recursive: true });
        }
 
        if (!fs.existsSync(this.logCacheFile)) {
            OrgUtils.logDebug('[VisbalExt.CacheService] constructor -- Initializing logs.json');
            this.writeCache({});
        }
    }

    private readCache(): LogCache {
        try {
            if (fs.existsSync(this.logCacheFile)) {
                const data = fs.readFileSync(this.logCacheFile, 'utf8');
                return JSON.parse(data) as LogCache;
            }
            return {};
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error reading cache:', error);
            return {};
        }
    }

    private writeCache(cache: LogCache): void {
        try {
            cache.versionId = getExtensionVersion();
            fs.writeFileSync(this.logCacheFile, JSON.stringify(cache, null, 2));
            OrgUtils.logDebug('[VisbalExt.CacheService] Cache saved to:', this.logCacheFile);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error writing cache:', error);
            throw error;
        }
    }

    public async getCachedLogs(): Promise<SalesforceLog[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] getCachedLogs -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
            const cache = this.readCache();
            return cache[orgAlias]?.logs || [];
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error reading cached logs:', error);
            return [];
        }
    }

    public async saveCachedLogs(logs: SalesforceLog[]): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] saveCachedLogs -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
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
            OrgUtils.logDebug(`[VisbalExt.CacheService] saveCachedLogs -- Logs cached for org ${orgAlias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] saveCachedLogs -- Error caching logs:', error);
            throw error;
        }
    }

    public async getCachedOrg(): Promise<{ alias: string; timestamp: string } | null> {
        try {
            const orgAlias = await this.getCurrentOrgAliasSafe();
            OrgUtils.logDebug('[VisbalExt.CacheService] getCachedOrg -- orgAlias:', orgAlias);
            const cache = this.readCache();
            return cache[orgAlias]?.selectedOrg || null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] getCachedOrg -- Error reading cached org:', error);
            return null;
        }
    }

    public async saveCachedOrg(selectedOrg: { alias: string; timestamp: string }): Promise<void> {
        try {
            const orgAlias = selectedOrg.alias; // Use the alias from the passed object
            OrgUtils.logDebug('[VisbalExt.CacheService] saveCachedOrg -- orgAlias (from selectedOrg):', orgAlias);
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
            OrgUtils.logDebug(`[VisbalExt.CacheService] saveCachedOrg -- Selected org cached: ${selectedOrg.alias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] saveCachedOrg -- Error caching selected org:', error);
            throw error;
        }
    }

    public async getLastFetchTime(): Promise<number> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] getLastFetchTime -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
            const cache = this.readCache();
            return cache[orgAlias]?.lastFetchTime || 0;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error reading last fetch time:', error);
            return 0;
        }
    }

    public async getDownloadedLogs(): Promise<Set<string>> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] getDownloadedLogs -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
            const cache = this.readCache();
            return new Set(cache[orgAlias]?.downloadedLogs || []);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error reading downloaded logs:', error);
            return new Set();
        }
    }

    public async getDownloadedLogPaths(): Promise<Map<string, string>> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] getDownloadedLogPaths -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
            const cache = this.readCache();
            return new Map(Object.entries(cache[orgAlias]?.downloadedLogPaths || {}));
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] Error reading downloaded log paths:', error);
            return new Map();
        }
    }

    public async saveDownloadedLogs(downloadedLogs: Set<string>, downloadedLogPaths: Map<string, string>): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] saveDownloadedLogs -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
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
            OrgUtils.logDebug(`[VisbalExt.CacheService] saveDownloadedLogs -- Downloaded logs saved for org ${orgAlias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] saveDownloadedLogs -- Error saving downloaded logs:', error);
            throw error;
        }
    }

    public async clearCache(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] clearCache -- BEGIN');
            const orgAlias = await this.getCurrentOrgAliasSafe();
            const cache = this.readCache();
            delete cache[orgAlias];
            this.writeCache(cache);
            OrgUtils.logDebug(`[VisbalExt.CacheService] clearCache -- Cache cleared for org ${orgAlias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] clearCache -- Error clearing cache:', error);
            throw error;
        }
    }

    public async clearAllCache(): Promise<void> {
        try {
            this.writeCache({});
            OrgUtils.logDebug('[VisbalExt.CacheService] clearAllCache -- All cache cleared');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] clearAllCache -- Error clearing all cache:', error);
            throw error;
        }
    }

    /**
     * Validates if the cached org ID matches the current org ID from org-list.json
     * This method can be used globally across services to validate cached org data
     */
    public async validateCachedOrgId(alias: string, cachedOrgId: string): Promise<boolean> {
        try {
            if (!this._orgListCacheService) {
                return false;
            }

            const cachedOrgList = await this._orgListCacheService.getCachedOrgList();
            if (!cachedOrgList || !cachedOrgList.orgs) {
                OrgUtils.logDebug('[VisbalExt.CacheService] validateCachedOrgId', 'No cached org list available');
                return false;
            }

            // Search through all org categories
            const allOrgs = [
                ...(cachedOrgList.orgs.devHubs || []),
                ...(cachedOrgList.orgs.nonScratchOrgs || []),
                ...(cachedOrgList.orgs.sandboxes || []),
                ...(cachedOrgList.orgs.scratchOrgs || []),
                ...(cachedOrgList.orgs.other || [])
            ];

            const currentOrg = allOrgs.find(org => org.alias === alias);
            if (!currentOrg) {
                OrgUtils.logDebug('[VisbalExt.CacheService] validateCachedOrgId', `Org with alias ${alias} not found in cached list`);
                return false;
            }

            const currentOrgId = currentOrg.orgId;
            if (!currentOrgId) {
                OrgUtils.logDebug('[VisbalExt.CacheService] validateCachedOrgId', `No orgId found for alias ${alias}`);
                return false;
            }

            const isValid = currentOrgId === cachedOrgId;
            OrgUtils.logDebug('[VisbalExt.CacheService] validateCachedOrgId', `Validation result for ${alias}: cached=${cachedOrgId}, current=${currentOrgId}, valid=${isValid}`);
            return isValid;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] validateCachedOrgId -- Error validating org ID:', error);
            return false;
        }
    }

    public async getOrgIdForAlias(alias: string): Promise<string | null> {
        try {
            if (!this._orgListCacheService) {
                return null;
            }

            const cachedOrgList = await this._orgListCacheService.getCachedOrgList();
            if (!cachedOrgList || !cachedOrgList.orgs) {
                OrgUtils.logDebug('[VisbalExt.CacheService] getOrgIdForAlias', 'No cached org list available');
                return null;
            }

            const allOrgs = [
                ...(cachedOrgList.orgs.devHubs || []),
                ...(cachedOrgList.orgs.nonScratchOrgs || []),
                ...(cachedOrgList.orgs.sandboxes || []),
                ...(cachedOrgList.orgs.scratchOrgs || []),
                ...(cachedOrgList.orgs.other || [])
            ];

            const currentOrg = allOrgs.find(org => org.alias === alias);
            if (currentOrg && currentOrg.orgId) {
                OrgUtils.logDebug('[VisbalExt.CacheService] getOrgIdForAlias', `Found orgId for alias ${alias}: ${currentOrg.orgId}`);
                return currentOrg.orgId;
            }

            OrgUtils.logDebug('[VisbalExt.CacheService] getOrgIdForAlias', `OrgId not found for alias ${alias} in cached list`);
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] getOrgIdForAlias -- Error getting org ID:', error);
            return null;
        }
    }

    private async getCurrentOrgAliasSafe(): Promise<string> {
        if (this.currentOrgAlias && (Date.now() - this.currentOrgAlias.timestamp) < this.CACHE_EXPIRATION) {
            OrgUtils.logDebug(`[VisbalExt.CacheService] getCurrentOrgAliasSafe -- Using cached alias: ${this.currentOrgAlias.alias}`);
            return this.currentOrgAlias.alias;
        }
 
        try {
            OrgUtils.logDebug('[VisbalExt.CacheService] getCurrentOrgAliasSafe -- Fetching current org alias via SFDX service');
            const alias = await this._sfdxService.getCurrentOrgAlias();
            this.currentOrgAlias = { alias, timestamp: Date.now() };
            return alias;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.CacheService] getCurrentOrgAliasSafe -- Error getting current org alias via SFDX, falling back to empty string:', error);
            return '';
        }
    }

} 