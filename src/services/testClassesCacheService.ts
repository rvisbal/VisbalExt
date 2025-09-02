import * as vscode from 'vscode';
import { StorageService } from './storageService';
import { TestClassesCache, TestClass, OrgTestClasses } from '../types/testClass';
import { getExtensionVersion } from '../utils/extensionUtils';
import { OrgUtils } from '../utils/orgUtils';

export class TestClassesCacheService {
    private storageService: StorageService;
    // The CACHE_KEY is no longer directly used for storageService as it uses orgAlias

    constructor(context: vscode.ExtensionContext) {
        this.storageService = new StorageService(context); // Instantiate directly
    }

    public async getCachedTestClasses(): Promise<TestClassesCache> {
        const currentVersion = getExtensionVersion();
        const cachedDataWithVersion = this.storageService.readCache<TestClassesCache & { versionId?: string }>();

        if (cachedDataWithVersion && cachedDataWithVersion.versionId === currentVersion) {
            // Destructure to remove versionId before returning
            const { versionId, ...restOfCache } = cachedDataWithVersion;
            return restOfCache;
        }

        // If cache is missing or obsolete, return an empty TestClassesCache
        return {};
    }

    public async setCachedTestClasses(testClassesCache: TestClassesCache): Promise<void> {
        // StorageService's writeCache handles versionId and writes the entire cache
        await this.storageService.writeCache(testClassesCache);
    }

    public async updateCachedTestClassesForOrg(orgAlias: string, testClasses: TestClass[]): Promise<void> {
        const cache = await this.getCachedTestClasses();
        cache[orgAlias] = { testClasses };
        await this.setCachedTestClasses(cache);
    }

    public async getTestClassesForOrg(orgAlias: string): Promise<TestClass[]> {
        const cache = await this.getCachedTestClasses();
        return cache[orgAlias]?.testClasses || [];
    }

    // Helper method to clear the cache, using StorageService's clearAllStorage
    public async clearCache(): Promise<void> {
        await this.storageService.clearAllStorage();
    }
}
