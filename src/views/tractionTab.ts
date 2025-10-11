import * as vscode from 'vscode';
import { OrgListCacheService } from '../services/orgListCacheService';
import { OrgUtils } from '../utils/orgUtils';
import { SalesforceOrg } from '../types/salesforceTypes';
import { ViewId } from '../types/salesforceTypes';
import { getTractionHtml } from './tractionTabHTML';
import { SecurityAnalysisService, SecurityReport } from '../services/securityAnalysisService';
import { UnusedCodeService, UnusedCodeReport } from '../services/unusedCodeService';
import { CodeReviewService, CodeReviewReport } from '../services/codeReviewService';
import { NonReferenceReportService, NonReferenceReport } from '../services/nonReferenceReportService';
import * as path from 'path';
import * as fs from 'fs';

export class TractionTab implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbal-traction';
    private _view?: vscode.WebviewView;
    private _orgListCacheService: OrgListCacheService;
    private _isLoading: boolean = false;
    private _error: string = '';
    private _orgs: SalesforceOrg[] = [];
    private _selectedOrg: string = '';
    private _securityAnalysisService: SecurityAnalysisService;
    private _unusedCodeService: UnusedCodeService;
    private _codeReviewService: CodeReviewService;
    private _nonReferenceReportService: NonReferenceReportService;
    private _isNonReferenceReportRunning: boolean = false;

    constructor(private readonly _context: vscode.ExtensionContext) {
        const cachePath = OrgUtils.getCachePath();
        this._orgListCacheService = new OrgListCacheService(cachePath);
        this._securityAnalysisService = SecurityAnalysisService.getInstance();
        this._unusedCodeService = UnusedCodeService.getInstance();
        this._codeReviewService = CodeReviewService.getInstance();
        this._nonReferenceReportService = NonReferenceReportService.getInstance();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        OrgUtils.logDebug('[VisbalExt.TractionTab] resolveWebviewView -- BEGIN: Resolving webview view');
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = getTractionHtml();
        OrgUtils.logDebug('[VisbalExt.TractionTab] resolveWebviewView -- Webview HTML set, now loading org list');

        webviewView.webview.onDidReceiveMessage(async (message) => {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] resolveWebviewView -- Received message: ${message.command}`, message);
            
            switch (message.command) {
                case 'loadOrgList':
                    await this._loadOrgList();
                    break;
                case 'refreshOrgList':
                    await this._refreshOrgList();
                    break;
                case 'setSelectedOrg':
                    this._selectedOrg = message.alias;
                    await this._setSelectedOrg(message.alias);
                    this._updateStatus(`Selected org: ${message.alias}`, 'success');
                    break;
                case 'openOrg':
                    await this._openOrg(message.alias);
                    break;
                case 'deploy':
                    await this._deploy(message.alias);
                    break;
                case 'terminalAction':
                    await this._handleTerminalAction(message.action);
                    break;
                case 'runSecurityScan':
                    await this._handleSecurityScan(message.scanType);
                    break;
                case 'navigateToIssue':
                    await this._navigateToSecurityIssue(message.filePath, message.line, message.column);
                    break;
                case 'exportSecurityReport':
                    await this._handleSecurityReportExport(message.format, message.data);
                    break;
                case 'runUnusedCodeAnalysis':
                    await this._handleUnusedCodeAnalysis(message.analysisType);
                    break;
                case 'runCodeReview':
                    await this._handleCodeReview(message.scanType);
                    break;
                case 'stopNonReferenceReport':
                    await this._handleStopNonReferenceReport();
                    break;
            }
        });

        // Initial load
        OrgUtils.logDebug('[VisbalExt.TractionTab] resolveWebviewView -- Starting initial org list load');
        this._loadOrgList();
        OrgUtils.logDebug('[VisbalExt.TractionTab] resolveWebviewView -- COMPLETE: Webview resolved, org list loading initiated');
    }

    private async _loadOrgList() {
        OrgUtils.logDebug('[VisbalExt.TractionTab] _loadOrgList -- BEGIN: Starting org list load');
        this._isLoading = true;
        this._error = '';
        
        try {
            OrgUtils.logDebug('[VisbalExt.TractionTab] _loadOrgList -- Calling loadOrgListForView utility');
            // Use the standardized utility for loading org list
            await OrgUtils.loadOrgListForView(
                this._orgListCacheService,
                this._context,
                this._view?.webview,
                '[VisbalExt.TractionTab]',
                ViewId.TRACTION
            );
            
            OrgUtils.logDebug('[VisbalExt.TractionTab] _loadOrgList -- loadOrgListForView completed, getting cache for local processing');
            // Get the updated cache after load for local processing
            const cache = await this._orgListCacheService.getCachedOrgList();
            this._orgs = this._flattenOrgGroups(cache?.orgs);
            this._isLoading = false;
            
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _loadOrgList -- COMPLETE: Loaded ${this._orgs.length} orgs using standard utility`);
        } catch (error: any) {
            this._isLoading = false;
            this._error = error?.message || 'Failed to load orgs.';
            OrgUtils.logError(`[VisbalExt.TractionTab] _loadOrgList -- ERROR: Error loading orgs`, error as Error);
            
            this._updateStatus(this._error, 'error');
        }
    }

    private async _refreshOrgList() {
        this._isLoading = true;
        this._error = '';
        this._updateStatus('Refreshing organization list...', 'info');
        
        try {
            await OrgUtils.refreshOrgListForView(
                this._orgListCacheService,
                this._context,
                this._view?.webview,
                '[VisbalExt.TractionTab]',
                'loading',
                'Refreshing organization list...'
            );
            
            // After refresh, reload from cache
            const cache = await this._orgListCacheService.getCachedOrgList();
            const orgGroups = cache?.orgs;
            this._orgs = this._flattenOrgGroups(orgGroups);
            
            // Get the view-specific selected org
            const viewSpecificOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            const selectedOrgAlias = viewSpecificOrg?.alias || this._selectedOrg;
            
            this._view?.webview.postMessage({
                command: 'updateOrgList',
                orgs: orgGroups,
                fromCache: false,
                selectedOrg: selectedOrgAlias
            });
        } catch (error: any) {
            this._isLoading = false;
            this._error = error?.message || 'Failed to refresh orgs.';
            OrgUtils.logError(`[VisbalExt.TractionTab] _refreshOrgList -- Error refreshing orgs`, error as Error);
            
            this._updateStatus(this._error, 'error');
        }
    }

    private async _setSelectedOrg(username: string): Promise<void> {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _setSelectedOrg -- Setting selected org: ${username}`);
            await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, username);
        }
        catch (error: any) {
            OrgUtils.logError('[VisbalExt.TractionTab] _setSelectedOrg -- Error setting selected org:', error);
            this._updateStatus(`Failed to set selected org: ${error.message}`, 'error');
        }
    }

    private async _openOrg(alias: string) {
        // If no alias provided, try to get from view selection or default
        if (!alias) {
            const selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            if (selectedOrg?.alias) {
                alias = selectedOrg.alias;
            } else {
                // Try default org as fallback
                const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
                if (defaultOrgAlias) {
                    alias = defaultOrgAlias;
                    await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, defaultOrgAlias);
                } else {
                    this._updateStatus('No org selected', 'error');
                    return;
                }
            }
        }

        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _openOrg -- Opening org: ${alias}`);
            await OrgUtils.openOrg(alias);
            this._updateStatus(`Successfully opened org: ${alias}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _openOrg -- Successfully opened org: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _openOrg -- Error opening org: ${alias}`, error as Error);
            this._updateStatus(`Failed to open org: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to open org: ${error.message}`);
        }
    }

    private async _deploy(alias: string) {
        // If no alias provided, try to get from view selection or default
        if (!alias) {
            const selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.TRACTION);
            if (selectedOrg?.alias) {
                alias = selectedOrg.alias;
            } else {
                // Try default org as fallback
                const defaultOrgAlias = await OrgUtils.getCurrentOrgAlias();
                if (defaultOrgAlias) {
                    alias = defaultOrgAlias;
                    await OrgUtils.setSelectedOrgForView(ViewId.TRACTION, defaultOrgAlias);
                } else {
                    this._updateStatus('No org selected', 'error');
                    return;
                }
            }
        }

        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _deploy -- Starting deployment to org: ${alias}`);
            this._updateStatus(`Deploying to org: ${alias}...`, 'info');
            
            // Execute SF CLI v2 deploy command
            const terminal = vscode.window.createTerminal({
                name: `Deploy to ${alias}`,
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
            
            terminal.show();
            terminal.sendText(`sf project deploy start --target-org ${alias} --ignore-conflicts`);
            
            this._updateStatus(`Deploy command sent to terminal for org: ${alias}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _deploy -- Deploy command sent to terminal for org: ${alias}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _deploy -- Error deploying to org: ${alias}`, error as Error);
            this._updateStatus(`Failed to deploy to org: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to deploy to org: ${error.message}`);
        }
    }

    private async _handleTerminalAction(action: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleTerminalAction -- Handling terminal action: ${action}`);
            
            let terminalName = 'Terminal';
            let shellPath: string | undefined;
            
            switch (action) {
                case 'gulp':
                    terminalName = 'Gulp - Scratch Org';
                    const terminal = vscode.window.createTerminal({
                        name: terminalName,
                        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    });
                    terminal.show();
                    terminal.sendText('npm run gulp');
                    this._updateStatus('Creating scratch org with Gulp...', 'info');
                    break;
                    
                case 'terminal':
                    terminalName = 'Terminal';
                    break;
                    
                case 'powershell':
                    terminalName = 'PowerShell';
                    if (process.platform === 'win32') {
                        shellPath = 'powershell.exe';
                    }
                    break;
                    
                case 'cmd':
                    terminalName = 'Command Prompt';
                    if (process.platform === 'win32') {
                        shellPath = 'cmd.exe';
                    }
                    break;
                    
                case 'auraEnabled':
                    await this._handleAuraEnabledReport();
                    return; // Early return since this doesn't create a terminal
                    
                case 'nonReferenceMethods':
                    await this._handleNonReferenceReport();
                    return; // Early return since this doesn't create a terminal
                    
                case 'testNonReferenceMethods':
                    await this._handleTestNonReferenceReport();
                    return; // Early return since this doesn't create a terminal
                    
                default:
                    terminalName = 'Terminal';
            }
            
            if (action !== 'gulp') {
                const terminal = vscode.window.createTerminal({
                    name: terminalName,
                    shellPath: shellPath,
                    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
                terminal.show();
            }
            
            this._updateStatus(`Opened ${terminalName}`, 'success');
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleTerminalAction -- Opened ${terminalName}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleTerminalAction -- Error handling terminal action: ${action}`, error as Error);
            this._updateStatus(`Failed to open terminal: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to open terminal: ${error.message}`);
        }
    }

    private _updateStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
        this._view?.webview.postMessage({
            command: 'updateStatus',
            message: message,
            type: type
        });
    }

    private _showProgress(title: string, description: string) {
        this._view?.webview.postMessage({
            command: 'showProgress',
            title: title,
            description: description
        });
    }

    private _updateProgress(title: string, description: string, percentage?: number) {
        this._view?.webview.postMessage({
            command: 'updateProgress',
            title: title,
            description: description,
            percentage: percentage
        });
    }

    private _hideProgress() {
        this._view?.webview.postMessage({
            command: 'hideProgress'
        });
    }

    private _flattenOrgGroups(orgGroups: any): SalesforceOrg[] {
        if (!orgGroups) {
            return [];
        }

        const orgs: SalesforceOrg[] = [];
        
        // Add non-scratch orgs
        if (orgGroups.nonScratchOrgs) {
            orgs.push(...orgGroups.nonScratchOrgs);
        }
        
        // Add scratch orgs
        if (orgGroups.scratchOrgs) {
            orgs.push(...orgGroups.scratchOrgs);
        }
        
        return orgs;
    }

    private async _handleAuraEnabledReport() {
        try {
            OrgUtils.logDebug('[VisbalExt.TractionTab] _handleAuraEnabledReport -- Starting @AuraEnabled report generation');
            
            // Show initial progress
            this._showProgress(
                'Starting Fresh @AuraEnabled Scan',
                'Running fresh scan for @AuraEnabled methods and Lightning Web Component references (cache cleared)...'
            );
            this._updateStatus('Starting fresh @AuraEnabled report generation (cache cleared)...', 'info');
            
            // Execute the registered command which handles all the logic
            // The command itself will send progress updates
            // Pass 'traction' as source to force fresh scan and cache update
            await vscode.commands.executeCommand('visbal-ext.reportAuraEnabled', 'traction');
            
            // Only hide progress and show completion when the command actually finishes
            this._hideProgress();
            this._updateStatus('@AuraEnabled report completed - check References panel', 'success');
            
        } catch (error: any) {
            this._hideProgress();
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleAuraEnabledReport -- Error generating @AuraEnabled report`, error as Error);
            this._updateStatus(`Failed to generate @AuraEnabled report: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to generate @AuraEnabled report: ${error.message}`);
        }
    }

    private async _handleSecurityScan(scanType: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleSecurityScan -- Starting security scan: ${scanType}`);
            
            this._showProgress(
                'Security Analysis in Progress',
                'Scanning files for security vulnerabilities and compliance issues...'
            );
            this._updateStatus('Starting security analysis...', 'info');
            
            let report: SecurityReport;
            
            if (scanType === 'workspace') {
                report = await this._securityAnalysisService.analyzeWorkspace();
            } else if (scanType === 'current') {
                const issues = await this._securityAnalysisService.analyzeCurrentFile();
                const activeEditor = vscode.window.activeTextEditor;
                report = {
                    totalIssues: issues.length,
                    highSeverityCount: issues.filter(i => i.severity === 'HIGH').length,
                    mediumSeverityCount: issues.filter(i => i.severity === 'MEDIUM').length,
                    lowSeverityCount: issues.filter(i => i.severity === 'LOW').length,
                    issues,
                    scannedFiles: activeEditor ? [activeEditor.document.uri.fsPath] : [],
                    scanTime: new Date()
                };
            } else {
                throw new Error(`Unknown scan type: ${scanType}`);
            }
            
            this._hideProgress();
            
            // Display the security report in the webview
            this.displaySecurityReport(report);
            
            const summaryMessage = `Security scan completed: ${report.totalIssues} issues found (${report.highSeverityCount} high, ${report.mediumSeverityCount} medium, ${report.lowSeverityCount} low)`;
            this._updateStatus(summaryMessage, report.highSeverityCount > 0 ? 'error' : 'success');
            
        } catch (error: any) {
            this._hideProgress();
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleSecurityScan -- Error during security scan: ${scanType}`, error as Error);
            this._updateStatus(`Failed to run security scan: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to run security scan: ${error.message}`);
        }
    }

    private async _handleCodeReview(scanType: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleCodeReview -- Starting code review: ${scanType}`);
            
            this._showProgress(
                'Code Review in Progress',
                'Analyzing code for quality, maintainability, and best practices...'
            );
            this._updateStatus('Starting code review...', 'info');
            
            let report: CodeReviewReport;
            
            if (scanType === 'workspace') {
                report = await this._codeReviewService.analyzeWorkspace();
            } else if (scanType === 'current') {
                const issues = await this._codeReviewService.analyzeCurrentFile();
                const activeEditor = vscode.window.activeTextEditor;
                report = {
                    totalIssues: issues.length,
                    criticalSeverityCount: issues.filter(i => i.severity === 'Critical').length,
                    highSeverityCount: issues.filter(i => i.severity === 'High').length,
                    mediumSeverityCount: issues.filter(i => i.severity === 'Medium').length,
                    lowSeverityCount: issues.filter(i => i.severity === 'Low').length,
                    issues,
                    scannedFiles: activeEditor ? [activeEditor.document.uri.fsPath] : [],
                    scanTime: new Date()
                };
            } else {
                throw new Error(`Unknown scan type: ${scanType}`);
            }
            
            this._hideProgress();
            
            // Display the code review report in the webview
            this.displayCodeReviewReport(report);
            
            const summaryMessage = `Code review completed: ${report.totalIssues} issues found (${report.criticalSeverityCount} critical, ${report.highSeverityCount} high, ${report.mediumSeverityCount} medium, ${report.lowSeverityCount} low)`;
            this._updateStatus(summaryMessage, report.criticalSeverityCount > 0 || report.highSeverityCount > 0 ? 'error' : 'success');
            
        } catch (error: any) {
            this._hideProgress();
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleCodeReview -- Error during code review: ${scanType}`, error as Error);
            this._updateStatus(`Failed to run code review: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to run code review: ${error.message}`);
        }
    }

    public displayCodeReviewReport(report: CodeReviewReport) {
        this._view?.webview.postMessage({
            command: 'displayCodeReviewReport',
            report: report
        });
    }

    public displaySecurityReport(report: SecurityReport) {
        this._view?.webview.postMessage({
            command: 'displaySecurityReport',
            report: report
        });
    }

    private async _navigateToSecurityIssue(filePath: string, line: number, column: number) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _navigateToSecurityIssue -- Navigating to ${filePath}:${line}:${column}`);
            
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            // Navigate to the specific line and column
            const position = new vscode.Position(line - 1, column - 1); // VS Code uses 0-based indexing
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            
            this._updateStatus(`Navigated to ${path.basename(filePath)}:${line}:${column}`, 'success');
            
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _navigateToSecurityIssue -- Error navigating to issue`, error as Error);
            this._updateStatus(`Failed to navigate to issue: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to navigate to issue: ${error.message}`);
        }
    }
    
    private async _handleSecurityReportExport(format: string, data: any) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleSecurityReportExport -- Exporting security report as ${format}`);
            
            // Get workspace folder for saving the file
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            
            let content: string;
            let extension: string;
            let fileName: string;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            switch (format) {
                case 'csv':
                    content = this._generateCSVReport(data);
                    extension = 'csv';
                    fileName = `security-report-${timestamp}.csv`;
                    break;
                    
                case 'json':
                    content = this._generateJSONReport(data);
                    extension = 'json';
                    fileName = `security-report-${timestamp}.json`;
                    break;
                    
                case 'html':
                    content = this._generateHTMLReport(data);
                    extension = 'html';
                    fileName = `security-report-${timestamp}.html`;
                    break;
                    
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
            
            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(workspaceFolder.uri, fileName),
                filters: {
                    [`${format.toUpperCase()} Files`]: [extension],
                    'All Files': ['*']
                }
            });
            
            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
                
                this._updateStatus(`Security report exported to ${path.basename(saveUri.fsPath)}`, 'success');
                vscode.window.showInformationMessage(
                    `Security report exported successfully!`, 
                    'Open File'
                ).then(selection => {
                    if (selection === 'Open File') {
                        vscode.commands.executeCommand('vscode.open', saveUri);
                    }
                });
            }
            
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleSecurityReportExport -- Error exporting report`, error as Error);
            this._updateStatus(`Failed to export report: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to export security report: ${error.message}`);
        }
    }

    private async _handleUnusedCodeAnalysis(analysisType: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.TractionTab] _handleUnusedCodeAnalysis -- Starting unused code analysis: ${analysisType}`);
            
            this._showProgress(
                'Unused Code Analysis in Progress',
                'Scanning codebase for unused methods, properties, and classes...'
            );
            this._updateStatus('Starting unused code analysis...', 'info');
            
            // Initialize service if needed
            UnusedCodeService.initialize();
            
            // Set up progress callback
            this._unusedCodeService.setProgressCallback((message: string, percentage?: number) => {
                this._updateProgress('Analyzing Code', message, percentage);
            });
            
            let report: UnusedCodeReport;
            
            if (analysisType === 'workspace') {
                report = await this._unusedCodeService.analyzeWorkspace({
                    includePrivateMembers: true,
                    includeTestMethods: false,
                    includeAuraEnabledMethods: false,
                    includeWebServiceMethods: false
                });
            } else if (analysisType === 'current') {
                const symbols = await this._unusedCodeService.analyzeCurrentFile();
                const activeEditor = vscode.window.activeTextEditor;
                report = {
                    totalSymbols: 0, // Will be calculated by service
                    unusedCount: symbols.length,
                    unusedMethods: symbols.filter(s => s.type === 'method').length,
                    unusedProperties: symbols.filter(s => s.type === 'property').length,
                    unusedClasses: symbols.filter(s => s.type === 'class').length,
                    unusedVariables: symbols.filter(s => s.type === 'variable').length,
                    symbols,
                    scannedFiles: activeEditor ? [activeEditor.document.uri.fsPath] : [],
                    scanTime: new Date(),
                    excludedFiles: [],
                    excludedSymbols: 0
                };
            } else {
                throw new Error(`Unknown analysis type: ${analysisType}`);
            }
            
            this._hideProgress();
            
            // Display the unused code report in the webview and references panel
            await this.displayUnusedCodeReport(report);
            
            const excludedInfo = report.excludedFiles.length > 0 ? ` (${report.excludedFiles.length} test files excluded)` : '';
            const summaryMessage = `Unused code analysis completed: Found ${report.unusedCount} unused symbols in ${report.scannedFiles.length} files${excludedInfo} (${report.unusedMethods} methods, ${report.unusedProperties} properties, ${report.unusedClasses} classes, ${report.unusedVariables} variables)`;
            this._updateStatus(summaryMessage, report.unusedCount > 0 ? 'info' : 'success');
            
        } catch (error: any) {
            this._hideProgress();
            OrgUtils.logError(`[VisbalExt.TractionTab] _handleUnusedCodeAnalysis -- Error during unused code analysis: ${analysisType}`, error as Error);
            this._updateStatus(`Failed to run unused code analysis: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to run unused code analysis: ${error.message}`);
        }
    }

    public async displayUnusedCodeReport(report: UnusedCodeReport) {
        // Display in webview
        this._view?.webview.postMessage({
            command: 'displayUnusedCodeReport',
            report: report
        });
        
        // Also display in References panel using the existing command
        try {
            await vscode.commands.executeCommand('visbal-ext.displayUnusedCodeInReferences', report);
        } catch (error) {
            OrgUtils.logError('[VisbalExt.TractionTab] displayUnusedCodeReport -- Error displaying in references panel:', error);
        }
    }

    /**
     * Handle non-reference report generation
     */
    private async _handleNonReferenceReport() {
        try {
            // Check if already running
            if (this._isNonReferenceReportRunning) {
                this._updateStatus('Non-reference report is already running. Use Stop button to cancel.', 'info');
                return;
            }

            // Check for existing cache and ask user if they want to resume
            let resumeFromCache = false;
            try {
                resumeFromCache = await this._nonReferenceReportService.checkForExistingCache();
            } catch (error) {
                OrgUtils.logDebug('[VisbalExt.TractionTab] _handleNonReferenceReport -- Error checking cache, starting fresh:', error);
            }

            OrgUtils.logDebug('[VisbalExt.TractionTab] _handleNonReferenceReport -- Starting non-reference report generation', {
                resumeFromCache
            });
            
            this._isNonReferenceReportRunning = true;
            
            const progressTitle = resumeFromCache ? 'Resuming Non-Reference Report' : 'Non-Reference Methods Report';
            const progressDesc = resumeFromCache ? 
                'Resuming from previous scan...' : 
                'Scanning methods and checking for references (report-only)...';
            
            this._showProgress(progressTitle, progressDesc);
            this._updateStatus('Generating non-reference methods report...', 'info');
            
            // Set up progress callback
            this._nonReferenceReportService.setProgressCallback((message: string, percentage?: number) => {
                this._updateProgress('Non-Reference Report', message, percentage);
            });
            
            // Generate the report
            const report = await this._nonReferenceReportService.generateNonReferenceReport(resumeFromCache);
            
            this._hideProgress();
            this._isNonReferenceReportRunning = false;
            
            // Display the report in the webview
            await this.displayNonReferenceReport(report);
            
            // Create status message based on report type
            let summaryMessage: string;
            if (report.isPartial) {
                summaryMessage = `PARTIAL REPORT: Found ${report.methodsWithNoReferences} methods with no references so far (${report.filesProcessed}/${report.totalFilesFound} files processed, ${report.totalMethodsScanned} methods scanned)`;
                this._updateStatus(summaryMessage, 'info');
                
                // Show detailed info about what was found
                if (report.methodsWithNoReferences > 0) {
                    const methodList = report.nonReferencedMethods.slice(0, 5).map(m => 
                        `${m.className}.${m.methodName}`
                    ).join(', ');
                    const moreCount = report.methodsWithNoReferences > 5 ? ` and ${report.methodsWithNoReferences - 5} more` : '';
                    OrgUtils.logDebug(`[TractionTab] Partial report found methods: ${methodList}${moreCount}`);
                }
            } else {
                summaryMessage = `Non-reference report completed: Found ${report.methodsWithNoReferences} methods with no references out of ${report.totalMethodsScanned} total methods (${report.filesProcessed} files processed)`;
                this._updateStatus(summaryMessage, report.methodsWithNoReferences > 0 ? 'info' : 'success');
            }
            
            // Show option to open the report file
            if (report.reportFilePath) {
                const reportType = report.isPartial ? 'Partial report' : 'Report';
                let message: string;
                
                if (report.isPartial) {
                    const methodsInfo = report.methodsWithNoReferences > 0 ? 
                        ` Found ${report.methodsWithNoReferences} methods with no references.` : 
                        ' No non-referenced methods found so far.';
                    message = `${reportType} saved to ${path.basename(report.reportFilePath)}. ${methodsInfo} You can resume later to complete the scan.`;
                } else {
                    message = `${reportType} saved to ${path.basename(report.reportFilePath)}`;
                }
                
                const buttons = report.isPartial ? ['Open Report', 'Show Summary'] : ['Open Report'];
                
                vscode.window.showInformationMessage(message, ...buttons).then(selection => {
                    if (selection === 'Open Report') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(report.reportFilePath!));
                    } else if (selection === 'Show Summary' && report.isPartial) {
                        this.showPartialReportSummary(report);
                    }
                });
            }
            
        } catch (error: any) {
            this._hideProgress();
            this._isNonReferenceReportRunning = false;
            
            if (error.message.includes('cancelled')) {
                // Check if we got a partial report back from the service
                try {
                    // The service should have returned a partial report - this will be caught by the success path above
                    OrgUtils.logDebug('[VisbalExt.TractionTab] _handleNonReferenceReport -- Report generation cancelled, but partial report may have been generated');
                    this._updateStatus('Non-reference report cancelled - partial report may have been saved', 'info');
                } catch {
                    this._updateStatus('Non-reference report cancelled by user', 'info');
                }
            } else {
                OrgUtils.logError('[VisbalExt.TractionTab] _handleNonReferenceReport -- Error generating non-reference report:', error);
                this._updateStatus(`Failed to generate non-reference report: ${error.message}`, 'error');
                vscode.window.showErrorMessage(`Failed to generate non-reference report: ${error.message}`);
            }
        }
    }

    /**
     * Handle test non-reference report generation (for specific files only)
     */
    private async _handleTestNonReferenceReport() {
        try {
            // Ask user which files to test
            const testPattern = await vscode.window.showInputBox({
                prompt: 'Enter filename pattern to test (e.g., RollerUpper.cls)',
                placeHolder: 'RollerUpper.cls',
                value: 'RollerUpper.cls'
            });

            if (!testPattern) {
                return; // User cancelled
            }

            OrgUtils.logDebug('[VisbalExt.TractionTab] _handleTestNonReferenceReport -- Starting test mode for pattern:', testPattern);
            
            this._updateStatus(`Starting test mode for: ${testPattern}`, 'info');
            
            // Generate the test report
            const report = await this._nonReferenceReportService.generateTestReport([testPattern]);
            
            // Show results
            const methodsInfo = report.methodsWithNoReferences > 0 ?
                ` Found ${report.methodsWithNoReferences} non-referenced methods.` :
                ' No non-referenced methods found.';
            
            const message = `Test report saved to ${path.basename(report.reportFilePath!)}.${methodsInfo}`;
            const buttons = ['Open Report', 'Show in Explorer'];
            
            vscode.window.showInformationMessage(message, ...buttons).then(selection => {
                if (selection === 'Open Report' && report.reportFilePath) {
                    vscode.workspace.openTextDocument(report.reportFilePath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                } else if (selection === 'Show in Explorer' && report.reportFilePath) {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(report.reportFilePath));
                }
            });
            
            this._updateStatus(`Test report complete: ${report.methodsWithNoReferences} non-referenced methods found`, 'success');
            
            // Clean up mock file if it was created
            await this.cleanupMockFiles();
            
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.TractionTab] _handleTestNonReferenceReport -- Error generating test report:', error);
            this._updateStatus(`Failed to generate test report: ${error.message}`, 'error');
            vscode.window.showErrorMessage(`Failed to generate test report: ${error.message}`);
            
            // Clean up mock files even on error
            await this.cleanupMockFiles();
        }
    }

    /**
     * Clean up any mock files created during testing
     */
    private async cleanupMockFiles() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const mockFilePath = path.join(workspaceFolders[0].uri.fsPath, 'test-RollerUpper.cls');
                try {
                    await fs.promises.unlink(mockFilePath);
                    OrgUtils.logDebug('[VisbalExt.TractionTab] Cleaned up mock file:', mockFilePath);
                } catch {
                    // File may not exist, ignore
                }
            }
        } catch (error) {
            OrgUtils.logDebug('[VisbalExt.TractionTab] Error cleaning up mock files:', error);
        }
    }

    /**
     * Handle stopping the non-reference report
     */
    private async _handleStopNonReferenceReport() {
        try {
            if (!this._isNonReferenceReportRunning) {
                this._updateStatus('No non-reference report is currently running', 'info');
                return;
            }

            OrgUtils.logDebug('[VisbalExt.TractionTab] _handleStopNonReferenceReport -- Stopping non-reference report');
            
            this._nonReferenceReportService.stopReport();
            this._updateStatus('Stopping non-reference report...', 'info');
            
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.TractionTab] _handleStopNonReferenceReport -- Error stopping report:', error);
            this._updateStatus(`Failed to stop report: ${error.message}`, 'error');
        }
    }

    /**
     * Display the non-reference report in the webview
     */
    public async displayNonReferenceReport(report: NonReferenceReport) {
        // Display in webview
        this._view?.webview.postMessage({
            command: 'displayNonReferenceReport',
            report: report
        });
        
        // Also display in References panel if there are non-referenced methods
        if (report.methodsWithNoReferences > 0) {
            try {
                await vscode.commands.executeCommand('visbal-ext.displayNonReferenceReportInReferences', report);
            } catch (error) {
                OrgUtils.logError('[VisbalExt.TractionTab] displayNonReferenceReport -- Error displaying in references panel:', error);
            }
        }
    }

    /**
     * Show a summary of the partial report findings
     */
    private showPartialReportSummary(report: NonReferenceReport) {
        if (report.methodsWithNoReferences === 0) {
            vscode.window.showInformationMessage(
                `Partial scan results: No non-referenced methods found in ${report.filesProcessed} files processed so far.`
            );
            return;
        }

        // Create a summary of the methods found
        const maxToShow = 10;
        let summaryText = `Found ${report.methodsWithNoReferences} methods with no references so far:\n\n`;
        
        const methodsToShow = report.nonReferencedMethods.slice(0, maxToShow);
        methodsToShow.forEach((method, index) => {
            summaryText += `${index + 1}. ${method.className}.${method.methodName}\n`;
            summaryText += `   File: ${method.fileName} (Line ${method.lineNumber})\n`;
            summaryText += `   Visibility: ${method.visibility}${method.annotations.length > 0 ? ', Annotations: @' + method.annotations.join(', @') : ''}\n\n`;
        });

        if (report.methodsWithNoReferences > maxToShow) {
            summaryText += `... and ${report.methodsWithNoReferences - maxToShow} more methods.\n\n`;
        }

        summaryText += `Scan progress: ${report.filesProcessed}/${report.totalFilesFound} files processed (${Math.round((report.filesProcessed / report.totalFilesFound) * 100)}%)\n`;
        summaryText += `Total methods scanned: ${report.totalMethodsScanned}\n\n`;
        summaryText += `You can resume the scan later to check the remaining files.`;

        // Show in a new document for easy viewing
        vscode.workspace.openTextDocument({
            content: summaryText,
            language: 'plaintext'
        }).then(document => {
            vscode.window.showTextDocument(document, { preview: true });
        });
    }

    public refresh(): void {
        OrgUtils.logDebug('[VisbalExt.TractionTab] refresh -- Refreshing traction tab');
        this._refreshOrgList();
    }

    public updateProgress(title: string, description: string, percentage?: number): void {
        this._updateProgress(title, description, percentage);
    }

    public showProgress(title: string, description: string): void {
        this._showProgress(title, description);
    }

    public hideProgress(): void {
        this._hideProgress();
    }
    
    private _generateCSVReport(data: any): string {
        const { issues, totalIssues, highSeverityCount, mediumSeverityCount, lowSeverityCount, scanTime, exportTimestamp } = data;
        
        // CSV Header
        const headers = [
            'Category', 'Severity', 'Title', 'Description', 'File', 'Line', 'Column', 
            'Code Snippet', 'Recommendation', 'Rule Source'
        ];
        
        let csv = headers.join(',') + '\n';
        
        // Add summary row
        csv += `"Summary","INFO","Security Report Summary","Total Issues: ${totalIssues}, High: ${highSeverityCount}, Medium: ${mediumSeverityCount}, Low: ${lowSeverityCount}","","","","Scanned on: ${new Date(scanTime).toLocaleString()}","Export Date: ${new Date(exportTimestamp).toLocaleString()}",""\n`;
        
        // Add issues
        issues.forEach((issue: any) => {
            const row = [
                this._escapeCSVField(issue.category),
                this._escapeCSVField(issue.severity),
                this._escapeCSVField(issue.title),
                this._escapeCSVField(issue.description),
                this._escapeCSVField(path.basename(issue.file)),
                issue.line.toString(),
                issue.column.toString(),
                this._escapeCSVField(issue.code.replace(/\n/g, ' | ')),
                this._escapeCSVField(issue.recommendation),
                this._escapeCSVField(issue.ruleSource)
            ];
            csv += row.join(',') + '\n';
        });
        
        return csv;
    }
    
    private _generateJSONReport(data: any): string {
        const reportData = {
            ...data,
            metadata: {
                generatedBy: 'Visbal Extension Security Analysis',
                extensionVersion: vscode.extensions.getExtension('visbal-ext')?.packageJSON.version || 'unknown',
                vscodeVersion: vscode.version
            }
        };
        
        return JSON.stringify(reportData, null, 2);
    }
    
    private _generateHTMLReport(data: any): string {
        const { issues, totalIssues, highSeverityCount, mediumSeverityCount, lowSeverityCount, scanTime, exportTimestamp } = data;
        
        const severityColors = {
            'HIGH': '#d73027',
            'MEDIUM': '#fc8d59',
            'LOW': '#fee08b'
        };
        
        const categoryIcons = {
            'CRUD_FLS': '🔒',
            'DML_LOOPS': '🔄',
            'SOQL_INJECTION': '💉',
            'SHARING': '🤝',
            'UI_SECURITY': '🖥️',
            'GENERAL': '⚠️'
        };
        
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Analysis Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px; }
        .title { color: #333; font-size: 28px; margin: 0; display: flex; align-items: center; gap: 10px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .summary-card { padding: 20px; border-radius: 6px; text-align: center; }
        .summary-card.high { background: #ffebee; border-left: 4px solid #d73027; }
        .summary-card.medium { background: #fff3e0; border-left: 4px solid #fc8d59; }
        .summary-card.low { background: #fffbf0; border-left: 4px solid #fee08b; }
        .summary-card.total { background: #f3f4f6; border-left: 4px solid #6b7280; }
        .summary-number { font-size: 32px; font-weight: bold; margin: 0; }
        .summary-label { font-size: 14px; color: #666; margin: 5px 0 0 0; }
        .metadata { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #666; }
        .issues-section { margin-top: 30px; }
        .issue { border: 1px solid #e0e0e0; border-radius: 6px; margin: 10px 0; overflow: hidden; }
        .issue-header { padding: 15px; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center; }
        .issue-title { font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .severity-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: 600; }
        .issue-content { padding: 15px; }
        .issue-description { color: #555; margin: 5px 0; }
        .issue-location { color: #666; font-size: 14px; margin: 5px 0; }
        .issue-code { background: #f1f3f4; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px; white-space: pre-wrap; margin: 10px 0; }
        .issue-recommendation { background: #e8f5e8; padding: 10px; border-radius: 4px; border-left: 4px solid #4caf50; margin: 10px 0; }
        .filter-section { margin: 20px 0; display: flex; gap: 10px; flex-wrap: wrap; }
        .filter-btn { padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 20px; cursor: pointer; }
        .filter-btn.active { background: #007acc; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">🛡️ Security Analysis Report</h1>
            <div class="metadata">
                <strong>Scan Date:</strong> ${new Date(scanTime).toLocaleString()} | 
                <strong>Export Date:</strong> ${new Date(exportTimestamp).toLocaleString()} | 
                <strong>Total Files Scanned:</strong> ${data.scannedFiles?.length || 'N/A'}
            </div>
        </div>
        
        <div class="summary">
            <div class="summary-card high">
                <div class="summary-number" style="color: #d73027;">${highSeverityCount}</div>
                <div class="summary-label">High Severity</div>
            </div>
            <div class="summary-card medium">
                <div class="summary-number" style="color: #fc8d59;">${mediumSeverityCount}</div>
                <div class="summary-label">Medium Severity</div>
            </div>
            <div class="summary-card low">
                <div class="summary-number" style="color: #fee08b;">${lowSeverityCount}</div>
                <div class="summary-label">Low Severity</div>
            </div>
            <div class="summary-card total">
                <div class="summary-number">${totalIssues}</div>
                <div class="summary-label">Total Issues</div>
            </div>
        </div>
        
        <div class="issues-section">
            <h2>Issues Found (${totalIssues})</h2>`;
            
        issues.forEach((issue: any, index: number) => {
            const severityColor = severityColors[issue.severity as keyof typeof severityColors] || '#666';
            const categoryIcon = categoryIcons[issue.category as keyof typeof categoryIcons] || '❓';
            
            html += `
            <div class="issue">
                <div class="issue-header">
                    <div class="issue-title">
                        <span>${categoryIcon}</span>
                        ${issue.title}
                    </div>
                    <div class="severity-badge" style="background-color: ${severityColor};">
                        ${issue.severity}
                    </div>
                </div>
                <div class="issue-content">
                    <div class="issue-description">${issue.description}</div>
                    <div class="issue-location">📁 ${path.basename(issue.file)} • Line ${issue.line}:${issue.column}</div>
                    <div class="issue-code">${this._escapeHtml(issue.code)}</div>
                    <div class="issue-recommendation">
                        <strong>💡 Recommendation:</strong> ${issue.recommendation}
                    </div>
                </div>
            </div>`;
        });
        
        html += `
        </div>
        
        <div style="margin-top: 40px; text-align: center; color: #666; font-size: 14px;">
            Generated by Visbal Extension Security Analysis | ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
        
        return html;
    }
    
    private _escapeCSVField(field: string): string {
        if (typeof field !== 'string') {
            field = String(field);
        }
        // Escape double quotes and wrap in quotes if contains comma, newline, or quote
        if (field.includes(',') || field.includes('\n') || field.includes('"')) {
            return '"' + field.replace(/"/g, '""') + '"';
        }
        return field;
    }
    
    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }
}
