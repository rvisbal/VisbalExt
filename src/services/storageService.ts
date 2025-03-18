import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestClass } from '../types/testClass';
import { TestMethod } from './metadataService';

export class StorageService {
    private storagePath: string;
    private testClassesFile: string;

    constructor(context: vscode.ExtensionContext) {
        // Get the workspace folder path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // Set up storage in .sf folder within the project
        this.storagePath = path.join(workspaceFolder.uri.fsPath, '.sf');
        this.testClassesFile = path.join(this.storagePath, 'testClasses.json');

        // Ensure .sf directory exists
        if (!fs.existsSync(this.storagePath)) {
            console.log('[VisbalExt.StorageService] Creating .sf directory');
            fs.mkdirSync(this.storagePath, { recursive: true });
        }

        // Initialize storage file if it doesn't exist
        if (!fs.existsSync(this.testClassesFile)) {
            console.log('[VisbalExt.StorageService] Initializing testClasses.json');
            this.saveTestClasses([]);
        }
    }

    public getTestClasses(): TestClass[] {
        try {
            const data = fs.readFileSync(this.testClassesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error reading test classes:', error);
            return [];
        }
    }

    public saveTestClasses(testClasses: TestClass[]): void {
        try {
            fs.writeFileSync(this.testClassesFile, JSON.stringify(testClasses, null, 2));
            console.log('[VisbalExt.StorageService] Test classes saved to:', this.testClassesFile);
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error saving test classes:', error);
            throw error;
        }
    }

    public getTestMethodsForClass(className: string): TestMethod[] {
        const testClasses = this.getTestClasses();
        const testClass = testClasses.find(tc => tc.name === className);
        return testClass?.methods?.map(methodName => ({
            name: methodName,
            isTestMethod: true
        })) || [];
    }

    public saveTestMethodsForClass(className: string, methods: TestMethod[]): void {
        const testClasses = this.getTestClasses();
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

        this.saveTestClasses(testClasses);
    }

    public clearStorage(): void {
        try {
            this.saveTestClasses([]);
            console.log('[VisbalExt.StorageService] Storage cleared');
        } catch (error) {
            console.error('[VisbalExt.StorageService] Error clearing storage:', error);
            throw error;
        }
    }
} 