import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgUtils } from '../utils/orgUtils';

export interface TestMethod {
    className: string;
    methodName: string;
}

export interface TestCaseListItem {
    id: string;
    name: string;
    methods: TestMethod[];
    createdAt: string;
    updatedAt: string;
}

export class TestCaseListManager {
    private static readonly CACHE_FOLDER = '.visbal/cache';
    private static readonly TEST_CASES_FILE = 'test-cases.json';
    private _testCaseLists: TestCaseListItem[] = [];
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this.ensureCacheDirectory();
        this.loadTestCases();
    }

    private get cacheFilePath(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        return path.join(workspaceFolder.uri.fsPath, TestCaseListManager.CACHE_FOLDER, TestCaseListManager.TEST_CASES_FILE);
    }

    private ensureCacheDirectory(): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const cacheDir = path.join(workspaceFolder.uri.fsPath, TestCaseListManager.CACHE_FOLDER);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
    }

    private loadTestCases(): void {
        try {
            if (fs.existsSync(this.cacheFilePath)) {
                const data = fs.readFileSync(this.cacheFilePath, 'utf8');
                this._testCaseLists = JSON.parse(data);
            }
        } catch (error) {
            OrgUtils.logError('[VisbalExt.TestCaseListManager] loadTestCases -- Error loading test cases:', error);
            this._testCaseLists = [];
        }
    }

    private saveTestCases(): void {
        try {
            fs.writeFileSync(this.cacheFilePath, JSON.stringify(this._testCaseLists, null, 2));
        } catch (error) {
            OrgUtils.logError('[VisbalExt.TestCaseListManager] saveTestCases -- Error saving test cases:', error);
        }
    }

    public getTestCaseLists(): TestCaseListItem[] {
        return this._testCaseLists;
    }

    public getTestCaseList(id: string): TestCaseListItem | undefined {
        return this._testCaseLists.find(list => list.id === id);
    }

    public createTestCaseList(name: string, methods: TestMethod[]): TestCaseListItem {
        const newList: TestCaseListItem = {
            id: this.generateId(),
            name,
            methods,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this._testCaseLists.push(newList);
        this.saveTestCases();
        return newList;
    }

    public updateTestCaseList(id: string, name: string, methods: TestMethod[]): TestCaseListItem | undefined {
        const index = this._testCaseLists.findIndex(list => list.id === id);
        if (index === -1) {
            return undefined;
        }

        const updatedList: TestCaseListItem = {
            ...this._testCaseLists[index],
            name,
            methods,
            updatedAt: new Date().toISOString()
        };

        this._testCaseLists[index] = updatedList;
        this.saveTestCases();
        return updatedList;
    }

    public deleteTestCaseList(id: string): boolean {
        const initialLength = this._testCaseLists.length;
        this._testCaseLists = this._testCaseLists.filter(list => list.id !== id);
        
        if (this._testCaseLists.length !== initialLength) {
            this.saveTestCases();
            return true;
        }
        return false;
    }

    public applyTestCaseList(id: string): void {
        const testCaseList = this.getTestCaseList(id);
        if (!testCaseList) {
            return;
        }

        // Apply each test method selection
        testCaseList.methods.forEach(method => {
            OrgUtils.selectTestMethod(method.className, method.methodName);
        });
    }

    private generateId(): string {
        return 'tcl_' + Math.random().toString(36).substr(2, 9);
    }
} 