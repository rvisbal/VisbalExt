import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MetadataService } from '../services/metadataService';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { ViewId } from '../types/salesforceTypes';
import { SfdxService } from '../services/sfdxService';
import { getHtmlForWebview } from './executeApexTabHTML';

export class ExecuteApexTab implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-apex';
    private _view?: vscode.WebviewView;
    private _metadataService: MetadataService;
    private _sfdxService: SfdxService;
    private _orgListCacheService: OrgListCacheService;
    private _currentOrg?: string;
    private _isRefreshing: boolean = false;
    private _apexFiles: string[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {
        OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] Initializing ExecuteApexTab');
        this._sfdxService = new SfdxService();
        this._metadataService = new MetadataService(this._sfdxService);
        
        const cachePath = OrgUtils.getCachePath();
        this._orgListCacheService = new OrgListCacheService(cachePath);
        this._loadApexFiles();
    }

    private async _loadApexFiles() {
        try {
            const [templateFiles] = await Promise.all([
                vscode.workspace.findFiles('.visbal/templates/apex/*.apex')
            ]);
            if (templateFiles.length === 0) {
                OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] _loadApexFiles -- No template files found, copying template files');
            } else {
                this._apexFiles = templateFiles.map(file => file.fsPath);
            }
            this._apexFiles.sort((a, b) => {
                const fileNameA = a.split(/[\\/]/).pop()?.toLowerCase() || '';
                const fileNameB = b.split(/[\\/]/).pop()?.toLowerCase() || '';
                return fileNameA.localeCompare(fileNameB);
            });
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'updateApexFileList',
                    files: this._apexFiles.map(path => {
                        const fileName = path.split(/[\\/]/).pop() || '';
                        return { path, name: fileName };
                    })
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] Error loading apex files:', error);
        }
    }

    private async _copyTemplateFiles() {
        try {
            // ... existing code ...
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] Error copying template files:', error);
            throw error;
        }
    }

    private async _updateTemplates() {
        try {
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] _updateTemplates -- Updating template files');
            await this._copyTemplateFiles();
            await this._loadApexFiles();
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'templatesUpdated',
                    message: 'Templates updated successfully'
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] _updateTemplates -- Error updating templates:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error updating templates: ${error.message}`
                });
            }
        }
    }

    private async _loadApexFileContent(filePath: string) {
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            return content.toString();
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] _loadApexFileContent -- Error reading file:', error);
            throw error;
        }
    }

    private async _saveApexFileContent(filePath: string, content: string) {
        try {
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] Saving file:', filePath);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(filePath),
                Buffer.from(content, 'utf8')
            );
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'fileSaved',
                    message: 'File saved successfully'
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] _saveApexFileContent -- Error saving file:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error saving file: ${error.message}`
                });
            }
            throw error;
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] resolveWebviewView -- Resolving webview view');
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };
        webviewView.webview.html = getHtmlForWebview();
        this._loadOrgList();
        this._loadApexFiles();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            OrgUtils.logDebug(`[VisbalExt.ExecuteApexTab] resolveWebviewView -- Received message: ${message.command}`);
            switch (message.command) {
                case 'executeApex':
                    await this.executeApex(message.code);
                    break;
                case 'setSelectedOrg':
                    await this._setSelectedOrg(message.alias);
                    break;
                case 'loadOrgList':
                    await this._loadOrgList();
                    break;
                case 'refreshOrgList':
                    try {
                        await this._refreshOrgList();
                        this._view?.webview.postMessage({
                            command: 'refreshComplete'
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error refreshing org list: ${error.message}`
                        });
                    }
                    break;
                case 'loadApexFile':
                    try {
                        OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] loadApexFile -- Loading file:', message.filePath);
                        const content = await this._loadApexFileContent(message.filePath);
                        OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] loadApexFile -- Content:', content.length);
                        this._view?.webview.postMessage({
                            command: 'apexFileContent',
                            content: content
                        });
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error loading file: ${error.message}`
                        });
                    }
                    break;
                case 'updateTemplates':
                    await this._updateTemplates();
                    break;
                case 'saveApexFile':
                    try {
                        await this._saveApexFileContent(message.filePath, message.content);
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error saving file: ${error.message}`
                        });
                    }
                    break;
                case 'downloadExecutionResults':
                    try {
                        await this._downloadExecutionResults(message.data);
                    } catch (error: any) {
                        this._view?.webview.postMessage({
                            command: 'error',
                            message: `Error downloading results: ${error.message}`
                        });
                    }
                    break;
                case 'showError':
                    this._view?.webview.postMessage({
                        command: 'error',
                        message: message.message
                    });
                    break;
            }
        });
    }

    private async executeApex(code: string) {
        try {
            let selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.EXECUTE_APEX);
            
            // If no view-specific org is selected, try to use the default org
            if (!selectedOrg?.alias) {
                OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] executeApex -- No view-specific org, trying default org');
                const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
                if (defaultOrgAlias) {
                    selectedOrg = { alias: defaultOrgAlias, timestamp: new Date().toISOString() };
                    OrgUtils.logDebug(`[VisbalExt.ExecuteApexTab] executeApex -- Using default org: ${defaultOrgAlias}`);
                    
                    // Set this as the selected org for the view
                    await OrgUtils.setSelectedOrgForView(ViewId.EXECUTE_APEX, defaultOrgAlias);
                }
            }
            
            this._view?.webview.postMessage({
                command: 'startLoading',
                message: `Executing Apex on ${selectedOrg?.alias}...`
            });
            if (!selectedOrg?.alias) {
                this._view?.webview.postMessage({
                    command: 'error',
                    message: 'Please select a Salesforce org first'
                });
                return;
            }
            OrgUtils.logDebug(`[VisbalExt.ExecuteApexTab] executeApex -- Executing on ${selectedOrg?.alias} org code:`, code);
            const result = await this._sfdxService.executeAnonymousApex(code, selectedOrg?.alias);
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] executeApex -- Execution result:', result);
            if (result.success) {
                this._view?.webview.postMessage({
                    command: 'executionResult',
                    success: result.success,
                    logs: result.logs,
                    compileProblem: result.compileProblem,
                    exceptionMessage: result.exceptionMessage,
                    exceptionStackTrace: result.exceptionStackTrace
                });
                this._view?.webview.postMessage({
                    command: 'success',
                    message: 'Code executed successfully'
                });
            } else {
                let errorMessage = 'Error executing code:\n';
                if (result.compileProblem) {
                    errorMessage += `Compilation Error: ${result.compileProblem}\n`;
                }
                if (result.exceptionMessage) {
                    errorMessage += `Runtime Error: ${result.exceptionMessage}\n`;
                }
                if (result.exceptionStackTrace) {
                    errorMessage += `Stack Trace:\n${result.exceptionStackTrace}`;
                }
                this._view?.webview.postMessage({
                    command: 'error',
                    message: errorMessage.trim()
                });
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] executeAnonymousApex Error:', error);
            this._view?.webview.postMessage({
                command: 'error',
                message: `Error executing code: ${error.message}`
            });
        } finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    private async _loadOrgList(): Promise<void> {
        await OrgUtils.loadOrgListForView(
            this._orgListCacheService,
            this._context,
            this._view?.webview,
            '[VisbalExt.ExecuteApexTab]',
            ViewId.EXECUTE_APEX
        );
    }

    private async _refreshOrgList(): Promise<void> {
        if (this._isRefreshing) {
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] _refreshOrgList -- Refresh already in progress');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Organization list refresh already in progress...'
            });
            return;
        }
        try {
            this._isRefreshing = true;
            await OrgUtils.refreshOrgListForView(
                this._orgListCacheService,
                this._context,
                this._view?.webview,
                '[VisbalExt.ExecuteApexTab]',
                'startLoading',
                'Refreshing organization list...'
            );
        } finally {
            this._isRefreshing = false;
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.ExecuteApexTab] _setSelectedOrg -- Setting selected org: ${username}`);
            await OrgUtils.setSelectedOrgForView(ViewId.EXECUTE_APEX, username);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] _setSelectedOrg -- Error setting selected org:', error);
        }  finally {
            this._view?.webview.postMessage({
                command: 'stopLoading'
            });
        }
    }

    private async _downloadExecutionResults(executionData: any): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] _downloadExecutionResults -- Starting download');
            
            // Get the selected org for this view
            const selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.EXECUTE_APEX);
            
            // Determine target directory
            const logsDir = vscode.workspace.workspaceFolders?.[0]
                ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visbal', 'logs', 'apex-execution')
                : path.join(os.homedir(), '.visbal', 'logs', 'apex-execution');
            
            // Ensure directory exists
            await fs.promises.mkdir(logsDir, { recursive: true });
            
            // Create filename
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
            const status = executionData.success ? 'SUCCESS' : 'FAILED';
            const filename = `apex-execution_${status}_${timestamp}.log`;
            const targetFilePath = path.join(logsDir, filename);
            
            // Build log content
            let logContent = '';
            logContent += `=== APEX EXECUTION RESULTS ===\n`;
            logContent += `Timestamp: ${executionData.timestamp}\n`;
            logContent += `Status: ${status}\n`;
            logContent += `Org: ${selectedOrg?.alias || 'Unknown'}\n`;
            logContent += `\n=== APEX CODE ===\n`;
            logContent += executionData.apexCode || 'No code available';
            logContent += `\n\n=== EXECUTION RESULTS ===\n`;
            
            if (executionData.success) {
                logContent += `✅ Execution successful\n`;
                if (executionData.logs) {
                    logContent += `\nLogs:\n${executionData.logs}`;
                }
            } else {
                logContent += `❌ Execution failed\n`;
                if (executionData.compileProblem) {
                    logContent += `\nCompile Error:\n${executionData.compileProblem}`;
                }
                if (executionData.exceptionMessage) {
                    logContent += `\nException:\n${executionData.exceptionMessage}`;
                }
                if (executionData.exceptionStackTrace) {
                    logContent += `\nStack Trace:\n${executionData.exceptionStackTrace}`;
                }
                if (executionData.message) {
                    logContent += `\nError Message:\n${executionData.message}`;
                }
            }
            
            // Write log file
            await fs.promises.writeFile(targetFilePath, logContent);
            
            // Notify user
            this._view?.webview.postMessage({
                command: 'success',
                message: `Execution results saved to: ${filename}`
            });
            
            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
            
            OrgUtils.logDebug('[VisbalExt.ExecuteApexTab] _downloadExecutionResults -- Download completed');
            
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ExecuteApexTab] _downloadExecutionResults -- Error:', error);
            throw error;
        }
    }
} 