import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { JsonViewerTab } from '../views/jsonViewerTab';

export class JsonViewerService {
    private static _instance: JsonViewerService;
    private _jsonViewerTab: JsonViewerTab | undefined;
    private _context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public static getInstance(context: vscode.ExtensionContext): JsonViewerService {
        if (!JsonViewerService._instance) {
            JsonViewerService._instance = new JsonViewerService(context);
        }
        return JsonViewerService._instance;
    }

    public initialize(jsonViewerTab: JsonViewerTab) {
        this._jsonViewerTab = jsonViewerTab;
        this._setupFileWatcher();
        this._setupActiveEditorListener();
    }

    public openJsonFile(filePath: string) {
        if (this._jsonViewerTab) {
            this._jsonViewerTab.openJsonFile(filePath);
            // Show the JSON viewer panel
            vscode.commands.executeCommand('workbench.view.extension.visbal-json-container');
        }
    }

    public openJsonContent(content: string, filePath?: string) {
        if (this._jsonViewerTab) {
            this._jsonViewerTab.openJsonContent(content, filePath);
            // Show the JSON viewer panel
            vscode.commands.executeCommand('workbench.view.extension.visbal-json-container');
        }
    }

    public async openJsonFromActiveEditor() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        if (!this._isJsonFile(activeEditor.document.fileName)) {
            vscode.window.showErrorMessage('Active file is not a JSON file');
            return;
        }

        const content = activeEditor.document.getText();
        this.openJsonContent(content, activeEditor.document.fileName);
    }

    public async validateCurrentJson(): Promise<boolean> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor to validate');
            return false;
        }

        try {
            const content = activeEditor.document.getText();
            JSON.parse(content);
            vscode.window.showInformationMessage('✅ Valid JSON');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Invalid JSON: ${error}`);
            return false;
        }
    }

    public async formatCurrentJson() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor to format');
            return;
        }

        try {
            const content = activeEditor.document.getText();
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            
            const fullRange = new vscode.Range(
                activeEditor.document.positionAt(0),
                activeEditor.document.positionAt(content.length)
            );
            
            await activeEditor.edit(editBuilder => {
                editBuilder.replace(fullRange, formatted);
            });
            
            vscode.window.showInformationMessage('JSON formatted successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to format JSON: ${error}`);
        }
    }

    public async minifyCurrentJson() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor to minify');
            return;
        }

        try {
            const content = activeEditor.document.getText();
            const parsed = JSON.parse(content);
            const minified = JSON.stringify(parsed);
            
            const fullRange = new vscode.Range(
                activeEditor.document.positionAt(0),
                activeEditor.document.positionAt(content.length)
            );
            
            await activeEditor.edit(editBuilder => {
                editBuilder.replace(fullRange, minified);
            });
            
            vscode.window.showInformationMessage('JSON minified successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to minify JSON: ${error}`);
        }
    }

    public async convertJsonToYaml() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        try {
            const content = activeEditor.document.getText();
            const parsed = JSON.parse(content);
            
            // Simple YAML conversion (basic implementation)
            const yaml = this._jsonToYaml(parsed);
            
            const document = await vscode.workspace.openTextDocument({
                content: yaml,
                language: 'yaml'
            });
            
            await vscode.window.showTextDocument(document);
            vscode.window.showInformationMessage('JSON converted to YAML');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to convert to YAML: ${error}`);
        }
    }

    public async createJsonSchema() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        try {
            const content = activeEditor.document.getText();
            const parsed = JSON.parse(content);
            
            const schema = this._generateJsonSchema(parsed);
            
            const document = await vscode.workspace.openTextDocument({
                content: JSON.stringify(schema, null, 2),
                language: 'json'
            });
            
            await vscode.window.showTextDocument(document);
            vscode.window.showInformationMessage('JSON Schema generated');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate schema: ${error}`);
        }
    }

    private _isJsonFile(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json');
    }

    private _setupFileWatcher() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.json');
        
        watcher.onDidChange(uri => {
            if (this._jsonViewerTab) {
                // Auto-refresh if the current file was changed
                this._jsonViewerTab.refresh();
            }
        });

        this._context.subscriptions.push(watcher);
    }

    private _setupActiveEditorListener() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && this._isJsonFile(editor.document.fileName)) {
                // Auto-load JSON when switching to a JSON file
                if (this._jsonViewerTab) {
                    const content = editor.document.getText();
                    this._jsonViewerTab.openJsonContent(content, editor.document.fileName);
                }
            }
        });
    }

    private _jsonToYaml(obj: any, indent: number = 0): string {
        const spaces = '  '.repeat(indent);
        
        if (obj === null) {
            return 'null';
        }
        
        if (typeof obj === 'string') {
            return `"${obj.replace(/"/g, '\\"')}"`;
        }
        
        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return String(obj);
        }
        
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return '[]';
            }
            return obj.map(item => `${spaces}- ${this._jsonToYaml(item, indent + 1)}`).join('\n');
        }
        
        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            if (keys.length === 0) {
                return '{}';
            }
            return keys.map(key => {
                const value = this._jsonToYaml(obj[key], indent + 1);
                return `${spaces}${key}: ${value}`;
            }).join('\n');
        }
        
        return String(obj);
    }

    private _generateJsonSchema(obj: any): any {
        if (obj === null) {
            return { type: 'null' };
        }
        
        if (typeof obj === 'string') {
            return { type: 'string' };
        }
        
        if (typeof obj === 'number') {
            return { type: 'number' };
        }
        
        if (typeof obj === 'boolean') {
            return { type: 'boolean' };
        }
        
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return { type: 'array', items: {} };
            }
            
            // Get schema for first item (simple approach)
            const itemSchema = this._generateJsonSchema(obj[0]);
            return {
                type: 'array',
                items: itemSchema
            };
        }
        
        if (typeof obj === 'object') {
            const properties: any = {};
            const required: string[] = [];
            
            Object.keys(obj).forEach(key => {
                properties[key] = this._generateJsonSchema(obj[key]);
                required.push(key);
            });
            
            return {
                type: 'object',
                properties: properties,
                required: required
            };
        }
        
        return {};
    }
}

