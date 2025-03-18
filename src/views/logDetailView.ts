import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getHtmlTemplate } from './htmlTemplate';
import { extractDebugLines, extractCategoryLines, formatLogContentForHtml } from '../utils/logParsingUtils';
import { LogTab, LogCategory, LogSummary, LogTimelineEvent, ParsedLogData } from '../models/logInterfaces';
import { ExecutionTabHandler } from './executionTabHandler';
import { RawLogTabHandler } from './rawLogTabHandler';
import { statusBarService } from '../services/statusBarService';

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
    private _executionTabHandler: ExecutionTabHandler;
    private _rawLogTabHandler: RawLogTabHandler;

    /**
     * Creates or shows the log detail view
     * @param extensionUri The extension URI
     * @param logFilePath The path to the log file
     * @param logId The ID of the log
     */
    public static createOrShow(extensionUri: vscode.Uri, logFilePath: string, logId: string): LogDetailView {
        console.log(`[VisbalExt.LogDetailView] createOrShow -- Creating or showing log detail view for log: ${logId}`);
        statusBarService.showProgress(`Opening log detail view for: ${path.basename(logFilePath)}`);
        
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LogDetailView.currentPanel) {
            console.log('[VisbalExt.LogDetailView] createOrShow -- Reusing existing panel');
            LogDetailView.currentPanel._panel.reveal(column);
            LogDetailView.currentPanel.updateLogFile(logFilePath, logId);
            return LogDetailView.currentPanel;
        }

        // Otherwise, create a new panel
        console.log('[VisbalExt.LogDetailView] createOrShow -- Creating new panel');
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
        console.log(`[VisbalExt.LogDetailView] constructor -- Initializing log detail view for log: ${logId}`);
        
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._logFilePath = logFilePath;
        this._logId = logId;
        this._executionTabHandler = new ExecutionTabHandler(panel.webview);
        this._rawLogTabHandler = new RawLogTabHandler(panel.webview);

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    console.log('[VisbalExt.LogDetailView] onDidChangeViewState -- Panel became visible, updating content');
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Received message: ${message.command}`, message);
                
                switch (message.command) {
                    case 'changeTab':
                        console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Changing tab to: ${message.tab}`);
                        this._currentTab = message.tab;
                        this._update();
                        
                        // If changing to execution tab, update execution tab content
                        if (message.tab === 'execution') {
                            setTimeout(() => {
                                this._executionTabHandler.updateExecutionTab();
                            }, 100); // Small delay to ensure the webview is ready
                        }
                        
                        // If changing to raw log tab, update raw log tab content
                        if (message.tab === 'raw') {
                            setTimeout(() => {
                                this._rawLogTabHandler.updateRawLogTab();
                            }, 100); // Small delay to ensure the webview is ready
                        }
                        break;
                    case 'backToList':
                        console.log('[VisbalExt.LogDetailView] onDidReceiveMessage -- Going back to log list');
                        this.dispose();
                        break;
                    case 'downloadCurrentLog':
                        console.log('[VisbalExt.LogDetailView] onDidReceiveMessage -- Downloading current log');
                        vscode.commands.executeCommand('visbal.downloadLog', this._logId);
                        break;
                    case 'search':
                        console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Searching for: ${message.term}`);
                        this._searchLog(message.term);
                        break;
                    case 'applyFilter':
                        console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Applying filter: ${message.filter}`);
                        this._applyFilter(message.filter);
                        break;
                    case 'searchRawLog':
                        console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Searching raw log for: ${message.term}`);
                        this._searchRawLog(message.searchTerm, message.caseSensitive, message.wholeWord, message.useRegex);
                        break;
                    case 'getLogChunk':
                        console.log(`[VisbalExt.LogDetailView] onDidReceiveMessage -- Getting log chunk: ${message.chunkIndex}`);
                        this._getLogChunk(message.chunkIndex, message.chunkSize);
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
        console.log(`[VisbalExt.LogDetailView] updateLogFile -- Updating log file: ${logFilePath}`);
        statusBarService.showProgress(`Loading log file: ${path.basename(logFilePath)}`);
        
        this._logFilePath = logFilePath;
        this._logId = logId;
        this._update();
        
        statusBarService.showSuccess(`Log file loaded: ${path.basename(logFilePath)}`);
    }

    /**
     * Searches the log content for a specific term
     * @param term The search term
     */
    private _searchLog(term: string): void {
        console.log(`[VisbalExt.LogDetailView] _searchLog -- Searching log for: ${term}`);
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
        console.log(`[VisbalExt.LogDetailView] _applyFilter -- Applying filter: ${filter}`);
        
        // Implement filter functionality
        // This would typically involve filtering the log content based on the selected category
        
        // For now, just update the UI
        this._update();
    }

    /**
     * Parses the log file content
     */
    private _parseLogFile(): ParsedLogData {
        try {
            console.log(`[VisbalExt.LogDetailView] _parseLogFile -- Parsing log file: ${this._logFilePath}`);
            statusBarService.showProgress(`Parsing log file: ${path.basename(this._logFilePath)}`);
            
            if (!fs.existsSync(this._logFilePath)) {
                console.error(`[VisbalExt.LogDetailView] _parseLogFile -- Log file not found: ${this._logFilePath}`);
                return { error: 'Log file not found' } as ParsedLogData;
            }

            const logContent = fs.readFileSync(this._logFilePath, 'utf8');
            console.log(`[VisbalExt.LogDetailView] _parseLogFile -- Read log file, size: ${logContent.length} bytes`);
            
            const lines = logContent.split('\n');
            
            // Extract lines by category using utility functions
            const executionLines = extractCategoryLines(lines, 'EXECUTION_');
            const soqlLines = extractCategoryLines(lines, 'SOQL_');
            const dmlLines = extractCategoryLines(lines, 'DML_');
            const heapLines = extractCategoryLines(lines, 'HEAP_');
            const limitLines = extractCategoryLines(lines, 'LIMIT_');
            const userDebugLines = extractDebugLines(lines);
            
            // Parse database operations
            const soqlQueries = this._parseSoqlQueries(soqlLines);
            const dmlOperations = this._parseDmlOperations(dmlLines);
            
            // Parse limits
            const limits = this._parseLimits(limitLines);
            
            // Extract execution path data
            const executionPath = ExecutionTabHandler.extractExecutionPath(executionLines);
            
            // Create a summary
            const summary = {
                totalLines: lines.length,
                executionCount: executionLines.length,
                soqlCount: soqlLines.length,
                dmlCount: dmlLines.length,
                heapCount: heapLines.length,
                limitCount: limitLines.length,
                userDebugCount: userDebugLines.length
            };
            
            // Create categories for overview
            const categories = [
                { name: 'EXECUTION', count: executionLines.length, description: 'Execution events' },
                { name: 'SOQL', count: soqlLines.length, description: 'SOQL queries' },
                { name: 'DML', count: dmlLines.length, description: 'DML operations' },
                { name: 'HEAP', count: heapLines.length, description: 'Heap usage' },
                { name: 'LIMIT', count: limitLines.length, description: 'Governor limits' },
                { name: 'USER_DEBUG', count: userDebugLines.length, description: 'Debug logs' }
            ];
            
            // Create timeline events
            const timeline = this._extractTimeline(lines);
            
            // Create the parsed data object
            const parsedData: ParsedLogData = {
                rawLog: logContent,
                userDebugLog: userDebugLines.join('\n'),
                summary,
                categories,
                timeline,
                soqlQueries,
                dmlOperations,
                limits,
                executionPath
            };
            
            // Store execution path data and update handlers
            this._executionTabHandler.setExecutionData(executionPath);
            this._rawLogTabHandler.setLogContent(logContent);
            
            console.log('[VisbalExt.LogDetailView] _parseLogFile -- Parsed log data:', parsedData.summary);
            statusBarService.showSuccess(`Log file parsed: ${path.basename(this._logFilePath)}`);
            return parsedData;
        } catch (error: any) {
            console.error('[VisbalExt.LogDetailView] _parseLogFile -- Error parsing log file:', error);
            statusBarService.showError(`Error parsing log file: ${error.message}`);
            vscode.window.showErrorMessage(`Error parsing log file: ${error.message}`);
            return { 
                error: `Error parsing log file: ${error.message}`,
                rawLog: '',
                userDebugLog: '',
                summary: this._createEmptySummary(),
                categories: [],
                timeline: [],
                soqlQueries: [],
                dmlOperations: [],
                limits: [],
                executionPath: []
            };
        }
    }

    private _parseSoqlQueries(soqlLines: string[]): any[] {
        return soqlLines.map(line => {
            const match = line.match(/SOQL_EXECUTE_(\w+).*?(\d+)\s+ms.*?(\d+)\s+rows/i);
            if (match) {
                return {
                    query: line,
                    time: parseInt(match[2], 10),
                    rows: parseInt(match[3], 10)
                };
            }
            return null;
        }).filter(Boolean);
    }

    private _parseDmlOperations(dmlLines: string[]): any[] {
        return dmlLines.map(line => {
            const match = line.match(/DML_(\w+).*?(\w+)__?c?.*?(\d+)\s+ms.*?(\d+)\s+rows/i);
            if (match) {
                return {
                    operation: match[1],
                    object: match[2],
                    time: parseInt(match[3], 10),
                    rows: parseInt(match[4], 10)
                };
            }
            return null;
        }).filter(Boolean);
    }

    private _parseLimits(limitLines: string[]): any[] {
        const limitMap = new Map<string, { used: number, available: number }>();
        
        limitLines.forEach(line => {
            const match = line.match(/LIMIT_USAGE_FOR_NS.*?(\w+)\s+(\d+)\s+of\s+(\d+)/i);
            if (match) {
                const [, name, used, available] = match;
                limitMap.set(name, {
                    used: parseInt(used, 10),
                    available: parseInt(available, 10)
                });
            }
        });
        
        return Array.from(limitMap.entries()).map(([name, values]) => ({
            name,
            used: values.used,
            available: values.available
        }));
    }

    /**
     * Creates an empty summary object
     * @returns Empty summary object
     */
    private _createEmptySummary(): LogSummary {
        return {
            totalLines: 0,
            executionCount: 0,
            soqlCount: 0,
            dmlCount: 0,
            heapCount: 0,
            limitCount: 0,
            userDebugCount: 0
        };
    }

    /**
     * Extracts timeline information from log lines
     * @param lines The log lines
     */
    private _extractTimeline(lines: string[]): LogTimelineEvent[] {
        console.log('[VisbalExt.LogDetailView] _extractTimeline -- Extracting timeline from log lines');
        
        const timeline: LogTimelineEvent[] = [];
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
        
        console.log(`[VisbalExt.LogDetailView] _extractTimeline -- Extracted ${timeline.length} timeline events`);
        
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
        try {
            console.log('[VisbalExt.LogDetailView] _update -- Updating webview content');
            statusBarService.showProgress('Updating log view...');
            
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
                console.error('[VisbalExt.LogDetailView] _update -- Error getting file stats:', error);
            }
            
            // Update the title
            this._panel.title = `Log: ${fileName}`;
            
            // Define tabs including the new USER_DEBUG tab
            const tabs: LogTab[] = [
                { id: 'overview', label: 'Overview' },
                { id: 'timeline', label: 'Timeline' },
                { id: 'execution', label: 'Execution' },
                { id: 'database', label: 'Database' },
                { id: 'limits', label: 'Limits' },
                { id: 'user_debug', label: 'Debug' },
                { id: 'raw', label: 'Raw Log' }
            ];
            
            // Get custom content for tabs
            const executionTabContent = ExecutionTabHandler.getPlaceholderHtml();
            const rawLogTabContent = RawLogTabHandler.getPlaceholderHtml();
            
            // Get JavaScript for custom tabs
            const executionTabJs = ExecutionTabHandler.getJavaScript();
            const rawLogTabJs = RawLogTabHandler.getJavaScript();
            
            // Combine JavaScript
            const customJavaScript = executionTabJs + '\n' + rawLogTabJs;
            
            // Update the webview content with execution tab HTML and JavaScript
            webview.html = getHtmlTemplate(
                this._parsedData,
                fileName,
                fileSize,
                this._currentTab,
                tabs,
                executionTabContent,
                customJavaScript,
                rawLogTabContent
            );
            
            // If the current tab is execution, update execution tab content
            if (this._currentTab === 'execution') {
                setTimeout(() => {
                    this._executionTabHandler.updateExecutionTab();
                }, 100); // Small delay to ensure the webview is ready
            }
            
            // If the current tab is raw log, update raw log tab content
            if (this._currentTab === 'raw') {
                setTimeout(() => {
                    this._rawLogTabHandler.updateRawLogTab();
                }, 100); // Small delay to ensure the webview is ready
            }
            
            statusBarService.showSuccess('Log view updated');
        } catch (error: any) {
            console.error('[VisbalExt.LogDetailView] _update -- Error updating webview content:', error);
            statusBarService.showError(`Error updating log view: ${error.message}`);
            vscode.window.showErrorMessage(`Error updating log view: ${error.message}`);
        }
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
        console.log('[VisbalExt.LogDetailView] dispose -- Disposing log detail view');
        
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

    // Add a new method to handle the getLogChunk message
    private _getLogChunk(chunkIndex: number, chunkSize: number): void {
        console.log(`[VisbalExt.LogDetailView] _getLogChunk -- Getting chunk ${chunkIndex} with size ${chunkSize}`);
        
        try {
            // Calculate start and end indices
            const startIndex = chunkIndex * chunkSize;
            const endIndex = startIndex + chunkSize;
            
            // Get the chunk from the raw log tab handler
            const chunk = this._rawLogTabHandler.getLogChunk(startIndex, endIndex);
            
            // Send the chunk back to the webview
            this._panel.webview.postMessage({
                command: 'logChunk',
                chunkIndex: chunkIndex,
                chunk: chunk
            });
        } catch (error: any) {
            console.error(`[VisbalExt.LogDetailView] _getLogChunk -- Error getting chunk ${chunkIndex}:`, error);
        }
    }

    // Add a new method to handle the searchRawLog message
    private _searchRawLog(searchTerm: string, caseSensitive: boolean = false, wholeWord: boolean = false, useRegex: boolean = false): void {
        console.log(`[VisbalExt.LogDetailView] _searchRawLog -- Searching for "${searchTerm}" (caseSensitive: ${caseSensitive}, wholeWord: ${wholeWord}, useRegex: ${useRegex})`);
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
            } catch (e) {
                console.error('[VisbalExt.LogDetailView] _searchRawLog -- Invalid regex pattern:', e);
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
            
            console.log(`[VisbalExt.LogDetailView] _searchRawLog -- Found ${results.length} matches`);
            
            // Send the results back to the webview
            this._panel.webview.postMessage({
                command: 'searchResults',
                results: results
            });
            
            statusBarService.showSuccess(`Search completed for: ${searchTerm}`);
        } catch (error: any) {
            console.error(`[VisbalExt.LogDetailView] _searchRawLog -- Error searching for "${searchTerm}":`, error);
            statusBarService.showError(`Error searching log: ${error.message}`);
        }
    }
} 