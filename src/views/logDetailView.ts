import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getHtmlTemplate } from './htmlTemplate';

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

    /**
     * Creates or shows the log detail view
     * @param extensionUri The extension URI
     * @param logFilePath The path to the log file
     * @param logId The ID of the log
     */
    public static createOrShow(extensionUri: vscode.Uri, logFilePath: string, logId: string): LogDetailView {
        console.log(`[LogDetailView] createOrShow -- Creating or showing log detail view for log: ${logId}`);
        
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LogDetailView.currentPanel) {
            console.log('[LogDetailView] createOrShow -- Reusing existing panel');
            LogDetailView.currentPanel._panel.reveal(column);
            LogDetailView.currentPanel.updateLogFile(logFilePath, logId);
            return LogDetailView.currentPanel;
        }

        // Otherwise, create a new panel
        console.log('[LogDetailView] createOrShow -- Creating new panel');
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
        console.log(`[LogDetailView] constructor -- Initializing log detail view for log: ${logId}`);
        
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._logFilePath = logFilePath;
        this._logId = logId;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    console.log('[LogDetailView] onDidChangeViewState -- Panel became visible, updating content');
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                console.log(`[LogDetailView] onDidReceiveMessage -- Received message: ${message.command}`, message);
                
                switch (message.command) {
                    case 'changeTab':
                        console.log(`[LogDetailView] onDidReceiveMessage -- Changing tab to: ${message.tab}`);
                        this._currentTab = message.tab;
                        this._update();
                        break;
                    case 'backToList':
                        console.log('[LogDetailView] onDidReceiveMessage -- Going back to log list');
                        this.dispose();
                        break;
                    case 'downloadCurrentLog':
                        console.log('[LogDetailView] onDidReceiveMessage -- Downloading current log');
                        vscode.commands.executeCommand('visbal.downloadLog', this._logId);
                        break;
                    case 'search':
                        console.log(`[LogDetailView] onDidReceiveMessage -- Searching for: ${message.term}`);
                        this._searchLog(message.term);
                        break;
                    case 'applyFilter':
                        console.log(`[LogDetailView] onDidReceiveMessage -- Applying filter: ${message.filter}`);
                        this._applyFilter(message.filter);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Updates the log file being displayed
     * @param logFilePath The path to the log file
     * @param logId The ID of the log
     */
    public updateLogFile(logFilePath: string, logId: string): void {
        console.log(`[LogDetailView] updateLogFile -- Updating log file to: ${logFilePath}`);
        
        this._logFilePath = logFilePath;
        this._logId = logId;
        this._update();
    }

    /**
     * Searches the log content for a specific term
     * @param term The search term
     */
    private _searchLog(term: string): void {
        console.log(`[LogDetailView] _searchLog -- Searching for: ${term}`);
        
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
    }

    /**
     * Applies a filter to the log content
     * @param filter The filter to apply
     */
    private _applyFilter(filter: string): void {
        console.log(`[LogDetailView] _applyFilter -- Applying filter: ${filter}`);
        
        // Implement filter functionality
        // This would typically involve filtering the log content based on the selected category
        
        // For now, just update the UI
        this._update();
    }

    /**
     * Parses the log file content
     */
    private _parseLogFile(): any {
        console.log(`[LogDetailView] _parseLogFile -- Parsing log file: ${this._logFilePath}`);
        
        try {
            if (!fs.existsSync(this._logFilePath)) {
                console.error(`[LogDetailView] _parseLogFile -- Log file not found: ${this._logFilePath}`);
                return { error: 'Log file not found' };
            }

            const logContent = fs.readFileSync(this._logFilePath, 'utf8');
            console.log(`[LogDetailView] _parseLogFile -- Read log file, size: ${logContent.length} bytes`);
            
            // Basic parsing for now - in a real implementation, this would be more sophisticated
            const lines = logContent.split('\n');
            
            // Extract some basic information
            const executionLines = lines.filter(line => line.includes('EXECUTION_'));
            const soqlLines = lines.filter(line => line.includes('SOQL_'));
            const dmlLines = lines.filter(line => line.includes('DML_'));
            const heapLines = lines.filter(line => line.includes('HEAP_'));
            const limitLines = lines.filter(line => line.includes('LIMIT_'));
            
            // Create a parsed data object
            const parsedData = {
                rawLog: logContent,
                summary: {
                    totalLines: lines.length,
                    executionCount: executionLines.length,
                    soqlCount: soqlLines.length,
                    dmlCount: dmlLines.length,
                    heapCount: heapLines.length,
                    limitCount: limitLines.length
                },
                categories: [
                    { name: 'EXECUTION', count: executionLines.length },
                    { name: 'SOQL', count: soqlLines.length },
                    { name: 'DML', count: dmlLines.length },
                    { name: 'HEAP', count: heapLines.length },
                    { name: 'LIMIT', count: limitLines.length }
                ],
                timeline: this._extractTimeline(lines)
            };
            
            console.log('[LogDetailView] _parseLogFile -- Parsed log data:', parsedData.summary);
            
            return parsedData;
        } catch (error: any) {
            console.error('[LogDetailView] _parseLogFile -- Error parsing log file:', error);
            return { error: `Error parsing log file: ${error.message}` };
        }
    }

    /**
     * Extracts timeline information from log lines
     * @param lines The log lines
     */
    private _extractTimeline(lines: string[]): any[] {
        console.log('[LogDetailView] _extractTimeline -- Extracting timeline from log lines');
        
        const timeline: any[] = [];
        let currentTime = 0;
        
        lines.forEach((line, index) => {
            // Simple time extraction - in a real implementation, this would be more sophisticated
            if (line.includes('|')) {
                const parts = line.split('|');
                if (parts.length >= 2) {
                    const timeMatch = parts[0].match(/(\d+):(\d+):(\d+)\.(\d+)/);
                    if (timeMatch) {
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseInt(timeMatch[3]);
                        const milliseconds = parseInt(timeMatch[4]);
                        
                        currentTime = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
                    }
                    
                    // Extract event type and content
                    let eventType = 'INFO';
                    let content = parts[1].trim();
                    
                    if (content.includes('EXECUTION_')) eventType = 'EXECUTION';
                    else if (content.includes('SOQL_')) eventType = 'SOQL';
                    else if (content.includes('DML_')) eventType = 'DML';
                    else if (content.includes('HEAP_')) eventType = 'HEAP';
                    else if (content.includes('LIMIT_')) eventType = 'LIMIT';
                    else if (content.includes('ERROR')) eventType = 'ERROR';
                    else if (content.includes('WARNING')) eventType = 'WARNING';
                    
                    timeline.push({
                        time: currentTime,
                        formattedTime: this._formatTime(currentTime),
                        lineNumber: index + 1,
                        eventType,
                        content
                    });
                }
            }
        });
        
        console.log(`[LogDetailView] _extractTimeline -- Extracted ${timeline.length} timeline events`);
        
        return timeline;
    }

    /**
     * Formats a time value in milliseconds
     * @param timeMs The time in milliseconds
     */
    private _formatTime(timeMs: number): string {
        const hours = Math.floor(timeMs / 3600000);
        const minutes = Math.floor((timeMs % 3600000) / 60000);
        const seconds = Math.floor((timeMs % 60000) / 1000);
        const milliseconds = timeMs % 1000;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    /**
     * Updates the webview content
     */
    private _update(): void {
        console.log('[LogDetailView] _update -- Updating webview content');
        
        const webview = this._panel.webview;
        
        // Parse the log file
        this._parsedData = this._parseLogFile();
        
        // Get file information
        const fileName = path.basename(this._logFilePath);
        let fileSize = 'Unknown';
        
        try {
            const stats = fs.statSync(this._logFilePath);
            fileSize = this._formatFileSize(stats.size);
        } catch (error: any) {
            console.error('[LogDetailView] _update -- Error getting file stats:', error);
        }
        
        // Update the title
        this._panel.title = `Log: ${fileName}`;
        
        // Update the webview content
        webview.html = getHtmlTemplate(
            this._parsedData,
            fileName,
            fileSize,
            this._currentTab
        );
        
        console.log('[LogDetailView] _update -- Webview content updated');
    }

    /**
     * Formats a file size in bytes to a human-readable string
     * @param bytes The file size in bytes
     */
    private _formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Disposes of the panel
     */
    public dispose(): void {
        console.log('[LogDetailView] dispose -- Disposing log detail view');
        
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
} 