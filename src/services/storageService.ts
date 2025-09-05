import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestClass } from '../types/testClass';
import { TestMethod } from './metadataService';
import { execAsync } from '../utils/execUtils';
import { SfdxService } from './sfdxService';
import { OrgUtils } from '../utils/orgUtils';
import { getExtensionVersion } from '../utils/extensionUtils';

export class StorageService {
    private storagePath: string;
    private testClassesFile: string;
    private currentOrgAlias: string | undefined;
    private _sfdxService: SfdxService;
    private writeDebounceTimer: NodeJS.Timeout | undefined;
    private pendingWrites: Map<string, TestClass[]> = new Map();
    private inMemoryCache: Map<string, TestClass[]> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this._sfdxService = new SfdxService();
        // Get the workspace folder path
        

        // Set up storage in .visbal folder within the project
        this.storagePath = OrgUtils.getCachePath();
        this.testClassesFile = path.join(this.storagePath, 'testClasses.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.storagePath)) {
            OrgUtils.logDebug('[VisbalExt.StorageService] constructor -- Creating .visbal/cache directory');
            fs.mkdirSync(this.storagePath, { recursive: true });
        }

        // Initialize storage file if it doesn't exist
        if (!fs.existsSync(this.testClassesFile)) {
            OrgUtils.logDebug('[VisbalExt.StorageService] constructor -- Initializing testClasses.json');
            this.saveTestClasses([]);
        }
    }

    public readCache<T>(): T & { versionId?: string } {
        try {
            OrgUtils.logDebug('[VisbalExt.StorageService] readCache -- testClassesFile:', this.testClassesFile);
            if (fs.existsSync(this.testClassesFile)) {
                const data = fs.readFileSync(this.testClassesFile, 'utf8');
                const cacheData = JSON.parse(data) as T & { versionId?: string };
                
                // Validate cache version
                const currentVersion = getExtensionVersion();
                if (!cacheData.versionId || cacheData.versionId !== currentVersion) {
                    OrgUtils.logDebug(`[VisbalExt.StorageService] readCache -- Cache version mismatch (cached: ${cacheData.versionId}, current: ${currentVersion}), returning empty cache`);
                    return {} as T & { versionId?: string };
                }
                
                OrgUtils.logDebug(`[VisbalExt.StorageService] readCache -- Cache version valid (${currentVersion}), returning cached data`);
                return cacheData;
            }
            return {} as T & { versionId?: string };
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] Error reading cache:', error);
            return {} as T & { versionId?: string };
        }
    }

    public writeCache<T>(cacheData: T): void {
        try {
            const cacheToWrite = { ...cacheData, versionId: getExtensionVersion() };
            fs.writeFileSync(this.testClassesFile, JSON.stringify(cacheToWrite, null, 2));
            OrgUtils.logDebug('[VisbalExt.StorageService] writeCache -- Cache saved to:', this.testClassesFile);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] writeCache -- Error writing cache:', error);
            throw error;
        }
    }

    public async getTestClasses(orgAlias?: string): Promise<TestClass[]> {
        try {
            const targetOrgAlias = orgAlias || await OrgUtils.getCurrentOrgAlias();
            
            // Check in-memory cache first
            if (this.inMemoryCache.has(targetOrgAlias)) {
                OrgUtils.logDebug(`[VisbalExt.StorageService] getTestClasses -- Using in-memory cache for org: ${targetOrgAlias}`);
                return this.inMemoryCache.get(targetOrgAlias) || [];
            }

            // Fall back to disk cache
            OrgUtils.logDebug('[VisbalExt.StorageService] getTestClasses -- Reading from disk cache');
            const cache = this.readCache<Record<string, { testClasses: TestClass[] }>>();
            const testClasses = cache[targetOrgAlias]?.testClasses || [];
            
            // Cache in memory for future reads
            this.inMemoryCache.set(targetOrgAlias, testClasses);
            
            OrgUtils.logDebug(`[VisbalExt.StorageService] getTestClasses -- Loaded ${testClasses.length} test classes for org: ${targetOrgAlias}`);
            return testClasses;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] getTestClasses -- Error reading test classes:', error);
            return [];
        }
    }

    public async saveTestClasses(testClasses: TestClass[], orgAlias?: string): Promise<void> {
        try {
            const targetOrgAlias = orgAlias || await OrgUtils.getCurrentOrgAlias();
            
            // Update in-memory cache immediately
            this.inMemoryCache.set(targetOrgAlias, testClasses);
            
            // Queue for debounced write
            this.pendingWrites.set(targetOrgAlias, testClasses);
            this.scheduleDebouncedWrite();
            
            OrgUtils.logDebug(`[VisbalExt.StorageService] saveTestClasses -- Test classes queued for save (org: ${targetOrgAlias})`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] saveTestClasses -- Error saving test classes:', error);
            throw error;
        }
    }

    private scheduleDebouncedWrite(): void {
        // Clear existing timer
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }

        // Schedule new write with 500ms debounce
        this.writeDebounceTimer = setTimeout(async () => {
            await this.flushPendingWrites();
        }, 500);
    }

    private async flushPendingWrites(): Promise<void> {
        if (this.pendingWrites.size === 0) {
            return;
        }

        try {
            const cache = this.readCache<Record<string, { testClasses: TestClass[] }>>();
            let hasChanges = false;

            // Apply all pending writes
            for (const [orgAlias, testClasses] of this.pendingWrites) {
                cache[orgAlias] = { testClasses };
                hasChanges = true;
                OrgUtils.logDebug(`[VisbalExt.StorageService] flushPendingWrites -- Flushing ${testClasses.length} test classes for org ${orgAlias}`);
            }

            if (hasChanges) {
                this.writeCache(cache);
                OrgUtils.logDebug(`[VisbalExt.StorageService] flushPendingWrites -- Batch saved ${this.pendingWrites.size} org(s) to disk`);
            }

            // Clear pending writes
            this.pendingWrites.clear();
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] flushPendingWrites -- Error flushing writes:', error);
        }
    }

    public async forceFlush(): Promise<void> {
        // Cancel any pending timer
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
            this.writeDebounceTimer = undefined;
        }
        
        // Force immediate flush
        await this.flushPendingWrites();
    }

    public dispose(): void {
        // Cleanup timers and force final flush
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }
        
        // Force synchronous final flush (best effort)
        if (this.pendingWrites.size > 0) {
            OrgUtils.logDebug('[VisbalExt.StorageService] dispose -- Force flushing pending writes');
            this.flushPendingWrites().catch(error => 
                OrgUtils.logError('[VisbalExt.StorageService] dispose -- Error in final flush:', error)
            );
        }
    }

    public async getTestMethodsForClass(className: string, orgAlias?: string): Promise<TestMethod[]> {
        const testClasses = await this.getTestClasses(orgAlias);
        const testClass = testClasses.find(tc => tc.name === className);
        return testClass?.methods?.map(methodName => ({
            name: methodName,
            isTestMethod: true
        })) || [];
    }

    public async saveTestMethodsForClass(className: string, methods: TestMethod[], orgAlias?: string): Promise<void> {
        const testClasses = await this.getTestClasses(orgAlias);
        const testClass = testClasses.find(tc => tc.name === className);
        
        if (testClass) {
            testClass.methods = methods.map(m => m.name);
        } else {
            testClasses.push({
                name: className,
                id: className,
                methods: methods.map(m => m.name),
                attributes: {
                    fileName: `${className}.cls`,
                    fullName: className
                }
            });
        }

        await this.saveTestClasses(testClasses, orgAlias);
    }

    public async clearTestMethodsForClass(className: string, orgAlias?: string): Promise<void> {
        try {
            const testClasses = await this.getTestClasses(orgAlias);
            const testClass = testClasses.find(tc => tc.name === className);
            
            if (testClass) {
                testClass.methods = [];
                await this.saveTestClasses(testClasses, orgAlias);
                OrgUtils.logDebug(`[VisbalExt.StorageService] clearTestMethodsForClass -- Test methods cleared for class ${className}`);
            }
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.StorageService] clearTestMethodsForClass -- Error clearing test methods for class ${className}:`, error);
            throw error;
        }
    }

    public async clearStorage(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.StorageService] clearStorage -- BEGIN');
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache<Record<string, { testClasses: TestClass[] }>>();
            // Clear specific org's data, but retain versionId
            delete cache[orgAlias];
            this.writeCache(cache);
            OrgUtils.logDebug(`[VisbalExt.StorageService] clearStorage -- Storage cleared for org ${orgAlias}`);
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] clearStorage -- Error clearing storage:', error);
            throw error;
        }
    }

    public async clearAllStorage(): Promise<void> {
        try {
            this.writeCache({}); // Clears all org-specific data but writeCache will re-add versionId
            OrgUtils.logDebug('[VisbalExt.StorageService] clearAllStorage -- All storage cleared');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.StorageService] clearAllStorage -- Error clearing all storage:', error);
            throw error;
        }
    }

    public async addTestMethod(className: string, methodName: string, orgAlias?: string): Promise<void> {
        const testClasses = await this.getTestClasses(orgAlias);
        const testClass = testClasses.find(tc => tc.name === className);
        
        if (testClass) {
            if (!testClass.methods) {
                testClass.methods = [];
            }
            if (methodName && !testClass.methods.includes(methodName)) {
                testClass.methods.push(methodName);
            }
        } else {
            testClasses.push({
                name: className,
                id: className,
                methods: methodName ? [methodName] : [],
                attributes: {
                    fileName: `${className}.cls`,
                    fullName: className
                }
            });
        }

        await this.saveTestClasses(testClasses, orgAlias);
    }
} 