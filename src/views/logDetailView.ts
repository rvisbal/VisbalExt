import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';



import { statusBarService } from '../services/statusBarService';
import { OrgUtils } from '../utils/orgUtils';


/**
 * LogDetailView class for displaying detailed log information in a webview panel
 */
export class LogDetailView {
    public static currentPanel: LogDetailView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _logFilePath: string;
    private _logId: string;
    private _currentTab: string = 'overview';
    private _parsedData: any = {};

    private _activeFilters: string[] = [];
    private _filteredContent: string = '';

    /**
     * Creates or shows the log detail view
     * @param extensionUri The extension URI
     * @param logFilePath The path to the log file
     * @param logId The ID of the log
     */
    public static createOrShow(extensionUri: vscode.Uri, logFilePath: string, logId: string): LogDetailView {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] createOrShow -- Creating or showing log detail view for log: ${logId}`);
        statusBarService.showProgress(`Opening log detail view for: ${path.basename(logFilePath)}`);
        
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LogDetailView.currentPanel) {
            OrgUtils.logDebug('[VisbalExt.LogDetailView] createOrShow -- Reusing existing panel');
            LogDetailView.currentPanel._panel.reveal(column);
      
            return LogDetailView.currentPanel;
        }

        // Otherwise, create a new panel
        OrgUtils.logDebug('[VisbalExt.LogDetailView] createOrShow -- Creating new panel');
        const panel = vscode.window.createWebviewPanel(
            'logDetailView',
            'Log Detail View',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        LogDetailView.currentPanel = new LogDetailView(panel, extensionUri, logFilePath, logId);
        return LogDetailView.currentPanel;
    }

    /**
     * Constructor for LogDetailView
     * @param panel The webview panel
     * @param extensionUri The extension URI
     * @param logFilePath The path to the log file
     * @param logId The ID of the log
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logFilePath: string, logId: string) {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] constructor -- Initializing log detail view for log: ${logId}`);
        
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._logFilePath = logFilePath;
        this._logId = logId;



        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

       
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                OrgUtils.logDebug(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Received message: ${message.command}`, message);
                
                switch (message.command) {
                   
                    case 'backToList':
                        OrgUtils.logDebug('[VisbalExt.LogDetailView] onDidReceiveMessage -- Going back to log list');
                        this.dispose();
                        break;
                    case 'downloadCurrentLog':
                        OrgUtils.logDebug('[VisbalExt.LogDetailView] onDidReceiveMessage -- Downloading current log');
                        vscode.commands.executeCommand('visbal.downloadLog', this._logId);
                        break;
                    case 'openOriginalFile':
                        OrgUtils.logDebug('[VisbalExt.LogDetailView] onDidReceiveMessage -- Opening original file');
                        vscode.workspace.openTextDocument(this._logFilePath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                        break;
                    case 'search':
                        OrgUtils.logDebug(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Searching for: ${message.term}`);
                        this._searchLog(message.term);
                        break;
                    case 'applyFilter':
                        OrgUtils.logDebug(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Applying filter: ${message.filter}`);
                        this._applyFilter(message.filter);
                        break;
                    case 'searchRawLog':
                        OrgUtils.logDebug(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Searching raw log for: ${message.term}`);
                        this._searchRawLog(message.searchTerm, message.caseSensitive, message.wholeWord, message.useRegex);
                        break;
                   
                    case 'openFilterManager':
                        OrgUtils.logDebug('[VisbalExt.LogDetailView] onDidReceiveMessage -- Opening filter manager');
                        vscode.commands.executeCommand('visbal-ext.showLogFilterManager');
                        break;
                }
            },
            null,
            this._disposables
        );
    }

   
    /**
     * Searches the log content for a specific term
     * @param term The search term
     */
    private _searchLog(term: string): void {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] _searchLog -- Searching log for: ${term}`);
        statusBarService.showProgress(`Searching log for: ${term}`);
        
        // Implement search functionality
        // This would typically involve parsing the log file and finding matches
        
        // For now, just send a message back to the webview with mock results
        this._panel.webview.postMessage({
            command: 'searchResults',
            results: [
                { line: 10, content: `Line containing ${term}` },
                { line: 25, content: `Another line with ${term}` }
            ]
        });
        
        statusBarService.showSuccess(`Search completed for: ${term}`);
    }

    /**
     * Applies a filter to the log content
     * @param filter The filter to apply
     */
    private _applyFilter(filter: string): void {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] _applyFilter -- Applying filter: ${filter}`);
        
        // Implement filter functionality
        // This would typically involve filtering the log content based on the selected category
        
       
    }





    /**
     * Disposes of the panel
     */
    public dispose(): void {
        OrgUtils.logDebug('[VisbalExt.LogDetailView] dispose -- Disposing log detail view');
        
        LogDetailView.currentPanel = undefined;
        
        // Clean up our resources
        this._panel.dispose();
        
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    

    // Add a new method to handle the searchRawLog message
    private _searchRawLog(searchTerm: string, caseSensitive: boolean = false, wholeWord: boolean = false, useRegex: boolean = false): void {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] _searchRawLog -- Searching for "${searchTerm}" (caseSensitive: ${caseSensitive}, wholeWord: ${wholeWord}, useRegex: ${useRegex})`);
        statusBarService.showProgress(`Searching log for: ${searchTerm}`);
        
        try {
            // Get all log lines
            const logContent = this._parsedData.rawLog || '';
            const logLines = logContent.split('\n');
            
            // Create the search pattern
            let pattern: RegExp;
            try {
                if (useRegex) {
                    pattern = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');
                } else {
                    // Escape special regex characters
                    const escapedTerm = searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const flags = caseSensitive ? 'g' : 'gi';
                    
                    if (wholeWord) {
                        pattern = new RegExp(`\\b${escapedTerm}\\b`, flags);
                    } else {
                        pattern = new RegExp(escapedTerm, flags);
                    }
                }
            } catch (e: any) {
                OrgUtils.logError('[VisbalExt.LogDetailView] _searchRawLog -- Invalid regex pattern:', e);
                this._panel.webview.postMessage({
                    command: 'searchResults',
                    results: []
                });
                return;
            }
            
            // Search for matches
            const results: any[] = [];
            
            logLines.forEach((line: string, lineNumber: number) => {
                let match;
                pattern.lastIndex = 0; // Reset regex state
                
                while ((match = pattern.exec(line)) !== null) {
                    results.push({
                        lineNumber: lineNumber,
                        startIndex: match.index,
                        endIndex: match.index + match[0].length,
                        text: match[0]
                    });
                    
                    // Avoid infinite loops with zero-width matches
                    if (match.index === pattern.lastIndex) {
                        pattern.lastIndex++;
                    }
                }
            });
            
            OrgUtils.logDebug(`[VisbalExt.LogDetailView] _searchRawLog -- Found ${results.length} matches`);
            
            // Send the results back to the webview
            this._panel.webview.postMessage({
                command: 'searchResults',
                results: results
            });
            
            statusBarService.showSuccess(`Search completed for: ${searchTerm}`);
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.LogDetailView] _searchRawLog -- Error searching for "${searchTerm}":`, error);
            statusBarService.showError(`Error searching log: ${error.message}`);
        }
    }

   
    

    
    /**
     * Changes the current tab
     * @param tab The tab to change to
     */
    public changeTab(tab: string): void {
        OrgUtils.logDebug(`[VisbalExt.LogDetailView] changeTab -- Changing tab to ${tab}`);
        this._panel.webview.postMessage({ command: 'changeTab', tab });
    }
} 