import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestClass } from '../types/testClass';
import { TestMethod } from './metadataService';
import { execAsync } from '../utils/execUtils';
import { SfdxService } from './sfdxService';
import { OrgUtils } from '../utils/orgUtils';

interface OrgTestClasses {
    testClasses: TestClass[];
}

interface TestClassesCache {
    [orgAlias: string]: OrgTestClasses;
}

export class StorageService {
    private storagePath: string;
    private testClassesFile: string;
    private currentOrgAlias: string | undefined;
    private _sfdxService: SfdxService;

    constructor(context: vscode.ExtensionContext) {
        this._sfdxService = new SfdxService();
        // Get the workspace folder path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Set up storage in .visbal folder within the project
        this.storagePath = path.join(workspaceFolder.uri.fsPath, '.visbal', 'cache');
        this.testClassesFile = path.join(this.storagePath, 'testClasses.json');

        // Ensure .visbal/cache directory exists
        if (!fs.existsSync(this.storagePath)) {
            console.log('[VisbalExt.StorageService] Creating .visbal/cache directory');
            fs.mkdirSync(this.storagePath, { recursive: true });
        }

        // Initialize storage file if it doesn't exist
        if (!fs.existsSync(this.testClassesFile)) {
            console.log('[VisbalExt.StorageService] Initializing testClasses.json');
            this.saveTestClasses([]);
        }
    }


    private readCache(): TestClassesCache {
        try {
            console.log('[VisbalExt.StorageService] readCache testClassesFile:', this.testClassesFile);
            if (fs.existsSync(this.testClassesFile)) {
                const data = fs.readFileSync(this.testClassesFile, 'utf8');
                //console.log('[VisbalExt.StorageService] readCache data:', data);
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error reading cache:', error);
            return {};
        }
    }

    private writeCache(cache: TestClassesCache): void {
        try {
            fs.writeFileSync(this.testClassesFile, JSON.stringify(cache, null, 2));
            console.log('[VisbalExt.StorageService] Cache saved to:', this.testClassesFile);
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error writing cache:', error);
            throw error;
        }
    }

    public async getTestClasses(): Promise<TestClass[]> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            return cache[orgAlias]?.testClasses || [];
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error reading test classes:', error);
            return [];
        }
    }

    public async saveTestClasses(testClasses: TestClass[]): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            
            cache[orgAlias] = {
                testClasses: testClasses
            };

            this.writeCache(cache);
            console.log(`[VisbalExt.StorageService] Test classes saved for org ${orgAlias}`);
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error saving test classes:', error);
            throw error;
        }
    }

    public async getTestMethodsForClass(className: string): Promise<TestMethod[]> {
        const testClasses = await this.getTestClasses();
        const testClass = testClasses.find(tc => tc.name === className);
        return testClass?.methods?.map(methodName => ({
            name: methodName,
            isTestMethod: true
        })) || [];
    }

    public async saveTestMethodsForClass(className: string, methods: TestMethod[]): Promise<void> {
        const testClasses = await this.getTestClasses();
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

        await this.saveTestClasses(testClasses);
    }

    public async clearTestMethodsForClass(className: string): Promise<void> {
        try {
            const testClasses = await this.getTestClasses();
            const testClass = testClasses.find(tc => tc.name === className);
            
            if (testClass) {
                testClass.methods = [];
                await this.saveTestClasses(testClasses);
                console.log(`[VisbalExt.StorageService] Test methods cleared for class ${className}`);
            }
        } catch (error) {
            console.error(`[VisbalExt.StorageService] Error clearing test methods for class ${className}:`, error);
            throw error;
        }
    }

    public async clearStorage(): Promise<void> {
        try {
            const orgAlias = await OrgUtils.getCurrentOrgAlias();
            const cache = this.readCache();
            delete cache[orgAlias];
            this.writeCache(cache);
            console.log(`[VisbalExt.StorageService] Storage cleared for org ${orgAlias}`);
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error clearing storage:', error);
            throw error;
        }
    }

    public async clearAllStorage(): Promise<void> {
        try {
            this.writeCache({});
            console.log('[VisbalExt.StorageService] All storage cleared');
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error clearing all storage:', error);
            throw error;
        }
    }
} 