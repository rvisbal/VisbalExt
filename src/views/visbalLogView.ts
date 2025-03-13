import * as vscode from 'vscode';
import { getLogListTemplate, getHtmlForWebview } from './htmlTemplate';
import { getFixedHtmlForWebview } from './fixedHtmlTemplate';
import { styles } from './styles';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LogDetailView } from './logDetailView';
import { getSimpleHtmlTemplate } from './simpleHtmlTemplate';

const execAsync = promisify(exec);

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

/**
 * Interface for Salesforce Debug Log
 */
interface SalesforceLog {
    id: string;
    logUser: {
        name: string;
    };
    application: string;
    operation: string;
    request: string;
    status: string;
    logLength: number;
    lastModifiedDate: string;
    downloaded: boolean;
    localFilePath?: string;
}

type CommandResult = {
    success: boolean;
    error?: string;
    data?: any;
};

/**
 * VisbalLogView class for displaying logs in the panel area
 */
export class VisbalLogView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'visbalLogView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _downloadedLogs: Set<string> = new Set<string>();
    private _isLoading: boolean = false;
    private _downloadedLogPaths: Map<string, string> = new Map<string, string>();
    private _logs: any[] = [];
    private _lastFetchTime: number = 0;
    private _cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry
    private _selectedLogs: any[] = [];
    private _cachedLogs: any[] = [];
    private _webview: vscode.Webview | undefined;
    private _statusBarItem: vscode.StatusBarItem;
    private _backgroundProcesses: Map<string, string> = new Map<string, string>();

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionUri = _context.extensionUri;
        console.log('[VisbalLogView] constructor -- Initializing VisbalLogView');
        this._checkDownloadedLogs();
        
        // Load cached logs if available
        const cachedLogs = this._context.globalState.get<any[]>('visbalCachedLogs', []);
        
        // Create status bar item
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this._statusBarItem.command = 'visbal-ext.refreshVisbalLog';
        this._statusBarItem.tooltip = 'Click to refresh logs';
        this._context.subscriptions.push(this._statusBarItem);
        this._updateStatusBar('Ready');
        this._statusBarItem.show();

        if (cachedLogs && cachedLogs.length > 0) {
            console.log(`[VisbalLogView] constructor -- Loaded ${cachedLogs.length} cached logs`);
            this._logs = cachedLogs;
            this._cachedLogs = cachedLogs;
            
            // Load last fetch time
            const lastFetchTime = this._context.globalState.get<number>('visbalLastFetchTime', 0);
            this._lastFetchTime = lastFetchTime;
            
            // Update status bar with cached logs count
            this._updateStatusBar(`${cachedLogs.length} logs (cached)`);
        }
    }

    /**
     * Resolves the webview view
     * @param webviewView The webview view to resolve
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        // Set the initial HTML content with a small delay to ensure the webview is ready
        setTimeout(() => {
            try {
                console.log('Setting webview HTML content');
                webviewView.webview.html = this._getWebviewContent(webviewView.webview);
            } catch (error) {
                console.error('Error setting webview HTML content:', error);
            }
        }, 100);

        // Set up message handling
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[VisbalLogView] resolveWebviewView -- Received message from webview:', message.command);
            
            switch (message.command) {
                case 'fetchLogs':
                    console.log('[VisbalLogView] resolveWebviewView -- Fetching logs via command');
                    this._fetchLogs(true).catch(error => {
                        console.error('[VisbalLogView] resolveWebviewView -- Error fetching logs:', error);
                    });
                    break;
                    
                case 'fetchLogsSoql':
                    console.log('[VisbalLogView] resolveWebviewView -- Fetching logs via SOQL from command');
                    this._fetchLogsSoql().then(() => {
                        this._sendLogsToWebview(this._logs);
                    }).catch(error => {
                        console.error('[VisbalLogView] resolveWebviewView -- Error fetching logs via SOQL:', error);
                    });
                    break;
                    
                case 'fetchLogsToolingApi':
                    console.log('[VisbalLogView] resolveWebviewView -- Fetching logs via Tooling API from command');
                    this._fetchLogsToolingApi().then(() => {
                        this._sendLogsToWebview(this._logs);
                    }).catch(error => {
                        console.error('[VisbalLogView] resolveWebviewView -- Error fetching logs via Tooling API:', error);
                    });
                    break;
                    
                case 'downloadLog':
                    console.log(`[VisbalLogView] resolveWebviewView -- Downloading log: ${message.logId}`);
                    await this._downloadLog(message.logId);
                    break;
                case 'openLog':
                    console.log(`[VisbalLogView] resolveWebviewView -- Opening log: ${message.logId}`);
                    await this._openLog(message.logId);
                    break;
                case 'toggleDownloaded':
                    console.log(`[VisbalLogView] resolveWebviewView -- Toggling downloaded status for log: ${message.logId} to ${message.downloaded}`);
                    this._toggleDownloaded(message.logId, message.downloaded);
                    break;
                case 'turnOnDebugLog':
                    console.log('[VisbalLogView] resolveWebviewView -- Turning on debug log');
                    await this._turnOnDebugLog();
                    break;
                case 'clearLocalLogs':
                    console.log('[VisbalLogView] resolveWebviewView -- Clearing local log files');
                    await this._clearLocalLogs();
                    break;
                case 'deleteServerLogs':
                    console.log('[VisbalLogView] resolveWebviewView -- Deleting server logs');
                    await this._deleteServerLogs();
                    break;
                case 'deleteServerLogsFast':
                    console.log('[VisbalLogView] resolveWebviewView -- Fast-deleting server logs');
                    await this._deleteServerLogsFast();
                    break;
                case 'deleteSelectedLogs':
                    console.log(`[VisbalLogView] resolveWebviewView -- Deleting selected logs: ${message.logIds.length} logs`);
                    await this._deleteSelectedLogs(message.logIds);
                    break;
                case 'applyDebugConfig':
                    console.log(`[VisbalLogView] resolveWebviewView -- Applying debug configuration:`, message.config);
                    await this._applyDebugConfig(message.config, message.turnOnDebug);
                    break;
                case 'getCurrentDebugConfig':
                    console.log(`[VisbalLogView] resolveWebviewView -- Getting current debug configuration`);
                    await this._getCurrentDebugConfig();
                    break;
                case 'selectLogs':
                    console.log(`[VisbalLogView] resolveWebviewView -- Selecting logs: ${message.logIds.length} logs`);
                    await this._selectLogs(message.logIds);
                    break;
                case 'deleteSelectedLogsFast':
                    console.log(`[VisbalLogView] resolveWebviewView -- Fast-deleting selected logs: ${message.logIds.length} logs`);
                    await this._deleteSelectedLogsFast(message.logIds);
                    break;
            }
        });

        // Wait for the webview to be ready before sending logs
        setTimeout(() => {
            if (webviewView.visible) {
                console.log('[VisbalLogView] resolveWebviewView -- View is visible, checking for cached logs');
                
                // If we have cached logs that aren't too old, send them to the webview
                const now = Date.now();
                const cacheAge = now - this._lastFetchTime;
                
                if (this._logs.length > 0 && cacheAge < this._cacheExpiryMs) {
                    console.log(`[VisbalLogView] resolveWebviewView -- Using cached logs (${this._logs.length} logs, ${Math.round(cacheAge / 1000)}s old)`);
                    this._sendLogsToWebview(this._logs);
                } else {
                    console.log('[VisbalLogView] resolveWebviewView -- No recent cached logs, fetching new logs');
                    this._fetchLogs();
                }
            }
        }, 1000); // Add a small delay to ensure the webview is fully loaded

        // Fetch logs when the view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('[VisbalLogView] resolveWebviewView -- View became visible, checking for cached logs');
                
                // If we have cached logs that aren't too old, send them to the webview
                const now = Date.now();
                const cacheAge = now - this._lastFetchTime;
                
                if (this._logs.length > 0 && cacheAge < this._cacheExpiryMs) {
                    console.log(`[VisbalLogView] resolveWebviewView -- Using cached logs (${this._logs.length} logs, ${Math.round(cacheAge / 1000)}s old)`);
                    this._sendLogsToWebview(this._logs);
                } else {
                    console.log('[VisbalLogView] resolveWebviewView -- No recent cached logs, fetching new logs');
                    this._fetchLogs();
                }
            }
        });
    }

    /**
     * Opens a log directly in the editor
     * @param logId The ID of the log to open
     */
    private async _openLog(logId: string): Promise<void> {
        console.log(`[VisbalLogView] _openLog -- Starting to open log: ${logId}`);
        if (!this._view) {
            console.log('[VisbalLogView] _openLog -- View is not available, cannot open log');
            return;
        }

        try {
            // Show loading state
            console.log('[VisbalLogView] _openLog -- Sending opening status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloading' 
            });

            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
                console.log(`[VisbalLogView] _openLog -- Found local file: ${localFilePath}`);
                
                // Open the log in the detail view
                console.log(`[VisbalLogView] _openLog -- Opening log in detail view: ${localFilePath}`);
                LogDetailView.createOrShow(this._extensionUri, localFilePath, logId);
                
                // Update status in the view
                console.log('[VisbalLogView] _openLog -- Sending success status to webview');
                this._view.webview.postMessage({ 
                    command: 'downloadStatus', 
                    logId: logId, 
                    status: 'downloaded',
                    filePath: localFilePath
                });
                
                return;
            }
            
            console.log(`[VisbalLogView] _openLog -- No local file found for log: ${logId}, fetching from org`);

            // Fetch the log content
            console.log(`[VisbalLogView] _openLog -- Fetching content for log: ${logId}`);
            const logContent = await this._fetchLogContent(logId);
            console.log(`[VisbalLogView] _openLog -- Received log content, length: ${logContent.length} characters`);

            // Create a temporary file
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const tempFile = path.join(os.tmpdir(), `sf_${sanitizedLogId}_${timestamp}.log`);
            console.log(`[VisbalLogView] _openLog -- Creating temporary file: ${tempFile}`);
            fs.writeFileSync(tempFile, logContent);

            // Open the log in the detail view
            console.log(`[VisbalLogView] _openLog -- Opening log in detail view: ${tempFile}`);
            LogDetailView.createOrShow(this._extensionUri, tempFile, logId);

            // Update download status in the view
            console.log('[VisbalLogView] _openLog -- Sending success status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloaded'
            });

            // Mark as downloaded
            this._downloadedLogs.add(logId);
            this._saveDownloadedLogs();
        } catch (error: any) {
            console.error(`[VisbalLogView] _openLog -- Error opening log ${logId}:`, error);
            
            // Show error message
            vscode.window.showErrorMessage(`Failed to open log: ${error.message}`);
            
            // Update status in the view
            console.log('[VisbalLogView] _openLog -- Sending error status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'error',
                error: error.message
            });
        }
    }

    /**
     * Downloads a log
     * @param logId The ID of the log to download
     */
    private async _downloadLog(logId: string): Promise<void> {
        console.log(`[VisbalLogView] _downloadLog -- Starting download for log: ${logId}`);
        
        const processId = `download-${logId}`;
        this._addBackgroundProcess(processId, 'Downloading');
        
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: true });

            // Create a timestamp for the filename
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            
            // Get log details to include in the filename
            const logDetails = this._logs.find((log: any) => log.id === logId);
            const operation = logDetails?.operation || 'unknown';
            const status = logDetails?.status || 'unknown';
            const size = logDetails?.logLength || 0;
            
            // Determine the target directory - ONLY the logs directory, no subdirectories
            let logsDir: string;
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use workspace folder if available
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                logsDir = path.join(workspaceFolder, '.sfdx', 'tools', 'debug', 'logs');
            } else {
                // Fall back to home directory
                logsDir = path.join(os.homedir(), '.sfdx', 'tools', 'debug', 'logs');
            }
            
            // Ensure the logs directory exists
            try {
                await fs.promises.mkdir(logsDir, { recursive: true });
                console.log(`[VisbalLogView] Created or verified logs directory: ${logsDir}`);
            } catch (dirError) {
                console.error(`[VisbalLogView] Error creating logs directory: ${dirError}`);
                // Continue anyway as the directory might already exist
            }
            
            // Create a descriptive filename including the log ID
            // Format: logId_operation_status_size_timestamp.log
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            
            // Sanitize operation and status to avoid path separator characters
            const sanitizedOperation = operation.toLowerCase().replace(/[\/\\:*?"<>|]/g, '_');
            const sanitizedStatus = status.replace(/[\/\\:*?"<>|]/g, '_');
            
            const logFilename = `${sanitizedLogId}_${sanitizedOperation}_${sanitizedStatus}_${size}_${timestamp}.log`;
            
            // Create the full file path - directly in the logs directory, no subdirectories
            const targetFilePath = path.join(logsDir, logFilename);
            
            console.log(`[VisbalLogView] Downloading log ${logId} to ${targetFilePath}`);
            console.log(`[VisbalLogView] Target directory: ${logsDir}`);
            console.log(`[VisbalLogView] Log filename: ${logFilename}`);
            
            // Create a temporary file for the download
            const tempFile = path.join(os.tmpdir(), `sf_log_${Date.now()}.log`);
            
            let downloadSuccess = false;
            let logContent: string | null = null;
            
            // Try to get log content using different methods
            
            // Method 1: Direct CLI output to temp file (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log(`[VisbalLogView] Trying direct CLI output to temp file: ${tempFile}`);
                    const command = `sf apex get log -i ${logId} > "${tempFile}"`;
                    console.log(`[VisbalLogView] Executing command: ${command}`);
                    await this._executeCommand(command);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
                        console.log(`[VisbalLogView] Successfully wrote log to temp file: ${tempFile}`);
                        downloadSuccess = true;
                    } else {
                        console.log(`[VisbalLogView] Temp file not created or empty: ${tempFile}`);
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with direct CLI output (new format):', error);
                }
            }
            
            // Method 2: JSON output (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[VisbalLogView] Trying JSON output (new CLI format)');
                    const result = await this._executeCommand(`sf apex get log -i ${logId} --json`);
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult && jsonResult.result && jsonResult.result.log) {
                        console.log('[VisbalLogView] Successfully got log content from JSON output (new CLI format)');
                        logContent = jsonResult.result.log;
                        downloadSuccess = true;
                    } else {
                        console.log('[VisbalLogView] No log content found in JSON response (new CLI format)');
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with JSON output (new CLI format):', error);
                }
            }
            
            // Method 3: Direct CLI output to temp file (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log(`[VisbalLogView] Trying direct CLI output to temp file (old format): ${tempFile}`);
                    const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFile}"`;
                    console.log(`[VisbalLogView] Executing command: ${command}`);
                    await this._executeCommand(command);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
                        console.log(`[VisbalLogView] Successfully wrote log to temp file (old format): ${tempFile}`);
                        downloadSuccess = true;
                    } else {
                        console.log(`[VisbalLogView] Temp file not created or empty (old format): ${tempFile}`);
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with direct CLI output (old format):', error);
                }
            }
            
            // Method 4: JSON output (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[VisbalLogView] Trying JSON output (old CLI format)');
                    const result = await this._executeCommand(`sfdx force:apex:log:get --logid ${logId} --json`);
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult && jsonResult.result && jsonResult.result.log) {
                        console.log('[VisbalLogView] Successfully got log content from JSON output (old CLI format)');
                        logContent = jsonResult.result.log;
                        downloadSuccess = true;
                    } else {
                        console.log('[VisbalLogView] No log content found in JSON response (old CLI format)');
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with JSON output (old CLI format):', error);
                }
            }
            
            // Method 5: Direct CLI output without JSON (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[VisbalLogView] Trying direct CLI output without JSON (new CLI format)');
                    const { stdout } = await execAsync(`sf apex get log -i ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                    
                    if (stdout && stdout.trim().length > 0) {
                        console.log('[VisbalLogView] Successfully got log content from direct CLI output (new CLI format)');
                        logContent = stdout;
                        downloadSuccess = true;
                    } else {
                        console.log('[VisbalLogView] No log content found in direct CLI output (new CLI format)');
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with direct CLI output without JSON (new CLI format):', error);
                }
            }
            
            // Method 6: Direct CLI output without JSON (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[VisbalLogView] Trying direct CLI output without JSON (old CLI format)');
                    const { stdout } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                    
                    if (stdout && stdout.trim().length > 0) {
                        console.log('[VisbalLogView] Successfully got log content from direct CLI output (old CLI format)');
                        logContent = stdout;
                        downloadSuccess = true;
                    } else {
                        console.log('[VisbalLogView] No log content found in direct CLI output (old CLI format)');
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error with direct CLI output without JSON (old CLI format):', error);
                }
            }
            
            if (!downloadSuccess) {
                throw new Error('Failed to download log with all methods');
            }
            
            // IMPORTANT: Double-check that the target directory exists before writing the file
            // This is to ensure we're not trying to create a file in a non-existent directory
            if (!fs.existsSync(logsDir)) {
                console.log(`[VisbalLogView] Creating logs directory: ${logsDir}`);
                await fs.promises.mkdir(logsDir, { recursive: true });
            }
            
            // Log the exact path we're trying to write to
            console.log(`[VisbalLogView] Final target file path: ${targetFilePath}`);
            
            // Write the log content to the target file
            if (logContent) {
                // If we got log content directly, write it to the target file
                console.log(`[VisbalLogView] Writing log content to file: ${targetFilePath}`);
                await fs.promises.writeFile(targetFilePath, logContent);
            } else if (fs.existsSync(tempFile)) {
                // If we have a temp file, copy it to the target file
                console.log(`[VisbalLogView] Copying from ${tempFile} to ${targetFilePath}`);
                await fs.promises.copyFile(tempFile, targetFilePath);
                
                // Delete the temp file
                try {
                    await fs.promises.unlink(tempFile);
                    console.log(`[VisbalLogView] Deleted temp file: ${tempFile}`);
                } catch (error) {
                    console.log(`[VisbalLogView] Warning: Could not delete temp file: ${tempFile}`);
                }
            } else {
                throw new Error('No log content or temp file available');
            }
            
            // Verify the file exists
            if (!fs.existsSync(targetFilePath)) {
                throw new Error(`File was not created at ${targetFilePath}`);
            }
            
            console.log(`[VisbalLogView] Successfully downloaded log to: ${targetFilePath}`);
            
            // Store the downloaded log path
            this._downloadedLogPaths.set(logId, targetFilePath);
            
            // Mark the log as downloaded
            this._downloadedLogs.add(logId);
            
            // Update the UI
            this._updateWebviewContent();
            
            vscode.window.showInformationMessage(`Log downloaded to ${targetFilePath}`);
            
            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
            
        } catch (error: any) {
            console.error(`[VisbalLogView] _downloadLog -- Error downloading log ${logId}:`, error);
            vscode.window.showErrorMessage(`Error downloading log: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: false });
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Fetches logs and updates the view
     * @param forceRefresh Whether to force a refresh even if we have recent cached logs
     */
    private async _fetchLogs(forceRefresh: boolean = false): Promise<void> {
        console.log('[VisbalLogView] _fetchLogs -- Starting log fetch');
        
        try {
            // Check if we need to refresh based on cache expiry
            const now = Date.now();
            if (!forceRefresh && (now - this._lastFetchTime) < this._cacheExpiryMs) {
                console.log('[VisbalLogView] _fetchLogs -- Using cached logs');
                this._sendLogsToWebview(this._logs);
                this._updateStatusBar(`${this._logs.length} logs (cached)`);
                return;
            }

            // Set loading state
            this._isLoading = true;
            this._updateStatusBar('Fetching logs...');
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: 'Fetching logs...'
            });

            // Try Tooling API method first (fastest)
            try {
                console.log('[VisbalLogView] _fetchLogs -- Attempting Tooling API fetch');
                await this._fetchLogsToolingApi();
                
                // Send logs to webview after Tooling API fetch completes
                this._sendLogsToWebview(this._logs);
                
                // Update status bar with log count
                this._updateStatusBar(`${this._logs.length} logs`);
                
                // Explicitly reset loading state after Tooling API fetch
                this._isLoading = false;
                this._view?.webview.postMessage({ 
                    command: 'setLoading', 
                    loading: false
                });
            } catch (toolingError: any) {
                console.warn('[VisbalLogView] _fetchLogs -- Tooling API fetch failed, falling back to SOQL method:', toolingError);
                
                // Update status bar
                this._updateStatusBar('Falling back to SOQL fetch...');
                
                // Try SOQL method as fallback
                try {
                    console.log('[VisbalLogView] _fetchLogs -- Attempting SOQL fetch');
                    await this._fetchLogsSoql();
                    
                    // Send logs to webview after SOQL fetch completes
                    this._sendLogsToWebview(this._logs);
                    
                    // Update status bar with log count
                    this._updateStatusBar(`${this._logs.length} logs`);
                    
                    // Explicitly reset loading state after SOQL fetch
                    this._isLoading = false;
                    this._view?.webview.postMessage({ 
                        command: 'setLoading', 
                        loading: false
                    });
                } catch (soqlError: any) {
                    console.warn('[VisbalLogView] _fetchLogs -- SOQL fetch failed, falling back to regular method:', soqlError);
                    
                    // Update status bar
                    this._updateStatusBar('Falling back to regular fetch...');
                    
                    // Fall back to regular method
                    const logs = await this._fetchSalesforceLogs();
                    this._logs = logs;
                    this._lastFetchTime = now;
                    
                    // Update cache in global state
                    this._context.globalState.update('visbalCachedLogs', logs);
                    this._context.globalState.update('visbalLastFetchTime', now);
                    
                    // Send logs to webview after regular fetch completes
                    this._sendLogsToWebview(this._logs);
                    
                    // Update status bar with log count
                    this._updateStatusBar(`${logs.length} logs`);
                }
            }
            
            // Check downloaded logs
            this._checkDownloadedLogs();
            
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchLogs -- Error:', error);
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: false,
                message: `Error fetching logs: ${error.message}`
            });
            vscode.window.showErrorMessage(`Error fetching logs: ${error.message}`);
            this._updateStatusBar(`Error: ${error.message}`);
        } finally {
            // Always reset loading state
            this._isLoading = false;
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: false
            });
        }
    }

    /**
     * Fetches logs from Salesforce using SOQL query and updates the view
     */
    private async _fetchLogsSoql(): Promise<void> {
        console.log('[VisbalLogView] _fetchLogsSoql -- Starting SOQL log fetch');
        
        try {
            // Update loading message to indicate SOQL query is in progress
            this._updateStatusBar('Executing SOQL query...');
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: 'Executing SOQL query...'
            });
            
            const logs = await this._fetchSalesforceLogsSoql();
            this._logs = logs;
            this._lastFetchTime = Date.now();
            
            // Update cache in global state
            this._context.globalState.update('visbalCachedLogs', logs);
            this._context.globalState.update('visbalLastFetchTime', this._lastFetchTime);
            
            console.log(`[VisbalLogView] _fetchLogsSoql -- Successfully fetched ${logs.length} logs`);
            
            // Update status bar with log count
            this._updateStatusBar(`Formatting ${logs.length} logs...`);
            
            // Update loading message to indicate formatting is in progress
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: 'Formatting logs...'
            });
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchLogsSoql -- Error:', error);
            
            // Update status bar with error
            this._updateStatusBar(`Error: ${error.message}`);
            
            // Ensure loading state is reset on error
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: false
            });
            
            throw error;
        }
    }

    /**
     * Fetches logs from Salesforce using SOQL query via SFDX CLI
     * @returns Array of Salesforce logs
     */
    private async _fetchSalesforceLogsSoql(): Promise<SalesforceLog[]> {
        console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Starting to fetch Salesforce logs via SOQL');
        try {
            // Check if SFDX CLI is installed
            try {
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Checking if SFDX CLI is installed');
                const { stdout: versionOutput } = await execAsync('sfdx --version');
                console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- SFDX CLI version: ${versionOutput.trim()}`);
            } catch (error) {
                console.error('[VisbalLogView] _fetchSalesforceLogsSoql -- SFDX CLI not installed:', error);
                throw new Error('SFDX CLI is not installed. Please install it to use this feature.');
            }
            
            // Try to get the default org using the new command format first
            let orgData;
            console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Trying to get default org with new CLI format');
            try {
                const { stdout: orgInfo } = await execAsync('sf org display --json');
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully got org info with new CLI format');
                orgData = JSON.parse(orgInfo);
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Parsed org data:', orgData.result?.username);
            } catch (error) {
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const { stdout: orgInfo } = await execAsync('sfdx force:org:display --json');
                    console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully got org info with old CLI format');
                    orgData = JSON.parse(orgInfo);
                    console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Parsed org data:', orgData.result?.username);
                } catch (innerError) {
                    console.error('[VisbalLogView] _fetchSalesforceLogsSoql -- Failed to get org info with both formats:', innerError);
                    throw new Error('Failed to get default org information. Please ensure you have a default org set.');
                }
            }
            
            if (!orgData.result || !orgData.result.username) {
                console.error('[VisbalLogView] _fetchSalesforceLogsSoql -- No username found in org data');
                throw new Error('No default Salesforce org found. Please set a default org using Salesforce CLI.');
            }
            
            console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Connected to org: ${orgData.result.username}`);
            
            // SOQL query to fetch debug logs using Tooling API
            const soqlQuery = "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200";
            console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- SOQL query: ${soqlQuery}`);
            
            // Try to execute SOQL query using the Tooling API first
            let queryResult;
            console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Trying to execute SOQL query with Tooling API');
            try {
                const command = `sf data query -q "${soqlQuery}" --use-tooling-api --json`;
                console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Executing: ${command}`);
                const { stdout: queryData } = await execAsync(command);
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully executed SOQL query with Tooling API');
                queryResult = JSON.parse(queryData);
            } catch (error) {
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Failed with Tooling API, trying old format', error);
                // If the Tooling API fails, try the old format
                try {
                    const command = `sfdx force:data:soql:query -q "${soqlQuery}" --usetoolingapi --json`;
                    console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Executing: ${command}`);
                    const { stdout: queryData } = await execAsync(command);
                    console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully executed SOQL query with old format');
                    queryResult = JSON.parse(queryData);
                } catch (innerError) {
                    console.error('[VisbalLogView] _fetchSalesforceLogsSoql -- Failed to execute SOQL query with both formats:', innerError);
                    throw new Error('Failed to execute SOQL query. Please ensure your Salesforce CLI is properly configured.');
                }
            }
            
            if (!queryResult.result || !queryResult.result.records || !Array.isArray(queryResult.result.records)) {
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- No logs found in query result:', queryResult);
                return [];
            }
            
            console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Found ${queryResult.result.records.length} debug logs via SOQL`);
            
            // Format the logs
            console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Formatting logs from SOQL query');
            const formattedLogs = queryResult.result.records.map((log: any) => ({
                id: log.Id,
                logUser: {
                    name: log.LogUser?.Name || 'Unknown User'
                },
                application: log.Application || 'Unknown',
                operation: log.Operation || 'Unknown',
                request: log.Request || '',
                status: log.Status || 'Unknown',
                logLength: log.LogLength || 0,
                lastModifiedDate: log.LastModifiedDate || '',
                downloaded: false // Will be updated later
            }));
            
            console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Returning ${formattedLogs.length} formatted logs from SOQL query`);
            return formattedLogs;
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchSalesforceLogsSoql -- Error in _fetchSalesforceLogsSoql:', error);
            throw error;
        }
    }

    private _toggleDownloaded(logId: string, downloaded: boolean): void {
        console.log(`[VisbalLogView] Toggling downloaded status for log ${logId} to ${downloaded}`);
        if (downloaded) {
            this._downloadedLogs.add(logId);
        } else {
            this._downloadedLogs.delete(logId);
        }
        
        // Update the UI to reflect the change
        this._updateWebviewContent();
    }

    private _updateWebviewContent(): void {
        if (this._view && this._view.webview && this._logs) {
            // Mark logs as downloaded if they are in the _downloadedLogs set
            const logsWithDownloadStatus = this._logs.map((log: any) => ({
                ...log,
                downloaded: this._downloadedLogs.has(log.id) || this._downloadedLogPaths.has(log.id)
            }));
            
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: logsWithDownloadStatus
            });
        }
    }

    // Update the _sendLogsToWebview method to check both _downloadedLogs and _downloadedLogPaths
    private _sendLogsToWebview(logs: any[]): void {
        if (this._view && this._view.webview) {
            // Mark logs as downloaded if they are in the _downloadedLogs set or _downloadedLogPaths map
            const logsWithDownloadStatus = logs.map((log: any) => ({
                ...log,
                downloaded: this._downloadedLogs.has(log.id) || this._downloadedLogPaths.has(log.id)
            }));
            
            console.log(`[VisbalLogView] Sending ${logsWithDownloadStatus.length} logs to webview`);
            
            // Log a sample of the logs being sent
            if (logsWithDownloadStatus.length > 0) {
                console.log(`[VisbalLogView] Sample log: ${JSON.stringify(logsWithDownloadStatus[0])}`);
            }
            
            // Send the logs to the webview
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: logsWithDownloadStatus
            });
            
            // Explicitly reset loading state after sending logs
            this._view.webview.postMessage({
                command: 'setLoading',
                loading: false
            });
            
            // Update status bar with log count
            this._updateStatusBar(`${logsWithDownloadStatus.length} logs`);
        }
    }

    // Add this method to execute commands
    private async _executeCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[VisbalLogView] Error executing command: ${command}`, error);
                    reject(error);
                    return;
                }
                
                if (stderr && stderr.length > 0) {
                    console.warn(`[VisbalLogView] Command produced stderr: ${command}`, stderr);
                }
                
                resolve(stdout);
            });
        });
    }

    /**
     * Turns on Apex Debug Log for Replay Debugger
     */
    private async _turnOnDebugLog(): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Enabling Apex Debug Log...' });

            console.log('[VisbalLogView] Turning on Apex Debug Log for Replay Debugger');

            // Get the current user ID
            let userId = '';
            try {
                // Try with new CLI format first
                try {
                    console.log('[VisbalLogView] Getting user ID with new CLI format');
                    const userIdResult = await this._executeCommand('sf org display user --json');
                    console.log(`[VisbalLogView] User ID result: ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID: ${userId}`);
                } catch (error) {
                    console.error('[VisbalLogView] Error getting user ID with new CLI format:', error);
                    
                    // Try with old CLI format
                    console.log('[VisbalLogView] Trying with old CLI format');
                    const userIdResult = await this._executeCommand('sfdx force:user:display --json');
                    console.log(`[VisbalLogView] User ID result (old format): ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID (old format): ${userId}`);
                }
            } catch (error) {
                console.error('[VisbalLogView] Error getting user ID:', error);
                throw new Error('Failed to get current user ID. Make sure you are authenticated with a Salesforce org.');
            }

            if (!userId) {
                throw new Error('Could not determine current user ID');
            }

            // Check if there's an existing trace flag
            let existingTraceFlag = null;
            let existingDebugLevelId = null;
            
            try {
                console.log('[VisbalLogView] Checking for existing trace flags');
                const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
                
                // Try with new CLI format first
                try {
                    const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --json`);
                    console.log(`[VisbalLogView] Trace flag query result: ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        existingTraceFlag = traceFlagJson.result.records[0];
                        existingDebugLevelId = existingTraceFlag.DebugLevelId;
                        console.log(`[VisbalLogView] Found existing trace flag: ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error checking trace flags with new CLI format:', error);
                    
                    // Try with old CLI format
                    try {
                        const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --json`);
                        console.log(`[VisbalLogView] Trace flag query result (old format): ${traceFlagResult}`);
                        const traceFlagJson = JSON.parse(traceFlagResult);
                        
                        if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                            existingTraceFlag = traceFlagJson.result.records[0];
                            existingDebugLevelId = existingTraceFlag.DebugLevelId;
                            console.log(`[VisbalLogView] Found existing trace flag (old format): ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                        }
                    } catch (oldError) {
                        console.error('[VisbalLogView] Error checking trace flags with old CLI format:', oldError);
                        // Continue anyway, we'll create a new trace flag
                    }
                }
            } catch (error) {
                console.error('[VisbalLogView] Error checking existing trace flag:', error);
                // Continue anyway, we'll create a new trace flag
            }

            // Use existing debug level if available, otherwise create a new one
            let debugLevelId = existingDebugLevelId;
            
            if (!debugLevelId) {
                // Create a debug level
                const debugLevelName = `ReplayDebugger${Date.now()}`;
                
                try {
                    console.log(`[VisbalLogView] Creating debug level with name: ${debugLevelName}`);
                    
                    // Try with new CLI format first
                    try {
                        const debugLevelCmd = `sf data create record --sobject DebugLevel --values "DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ApexCode=FINEST ApexProfiling=FINEST Callout=FINEST Database=FINEST System=FINEST Validation=FINEST Visualforce=FINEST Workflow=FINEST" --use-tooling-api --json`;
                        console.log(`[VisbalLogView] Creating debug level with command: ${debugLevelCmd}`);
                        const debugLevelResult = await this._executeCommand(debugLevelCmd);
                        console.log(`[VisbalLogView] Debug level creation result: ${debugLevelResult}`);
                        const debugLevelJson = JSON.parse(debugLevelResult);
                        debugLevelId = debugLevelJson.result.id;
                        console.log(`[VisbalLogView] Created debug level with ID: ${debugLevelId}`);
                    } catch (error: any) {
                        console.error('[VisbalLogView] Error creating debug level with new CLI format:', error);
                        
                        // Try with old CLI format
                        const debugLevelCmd = `sfdx force:data:record:create --sobjecttype DebugLevel --values "DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ApexCode=FINEST ApexProfiling=FINEST Callout=FINEST Database=FINEST System=FINEST Validation=FINEST Visualforce=FINEST Workflow=FINEST" --usetoolingapi --json`;
                        console.log(`[VisbalLogView] Creating debug level with command (old format): ${debugLevelCmd}`);
                        const debugLevelResult = await this._executeCommand(debugLevelCmd);
                        console.log(`[VisbalLogView] Debug level creation result (old format): ${debugLevelResult}`);
                        const debugLevelJson = JSON.parse(debugLevelResult);
                        debugLevelId = debugLevelJson.result.id;
                        console.log(`[VisbalLogView] Created debug level with ID (old format): ${debugLevelId}`);
                    }
                } catch (error: any) {
                    console.error('[VisbalLogView] Error creating debug level:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    throw new Error(`Failed to create debug level: ${errorMessage}`);
                }
            }

            if (!debugLevelId) {
                throw new Error('Failed to create or find debug level');
            }

            // Delete existing trace flag if it exists
            if (existingTraceFlag) {
                try {
                    console.log(`[VisbalLogView] Deleting existing trace flag: ${existingTraceFlag.Id}`);
                    
                    // Try with new CLI format first
                    try {
                        await this._executeCommand(`sf data delete record --sobject TraceFlag --record-id ${existingTraceFlag.Id} --use-tooling-api --json`);
                        console.log('[VisbalLogView] Successfully deleted existing trace flag');
                    } catch (error) {
                        console.error('[VisbalLogView] Error deleting trace flag with new CLI format:', error);
                        
                        // Try with old CLI format
                        await this._executeCommand(`sfdx force:data:record:delete --sobjecttype TraceFlag --sobjectid ${existingTraceFlag.Id} --usetoolingapi --json`);
                        console.log('[VisbalLogView] Successfully deleted existing trace flag (old format)');
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error deleting existing trace flag:', error);
                    // Continue anyway, we'll try to create a new trace flag
                }
            }

            // Create a trace flag
            // Set expiration to 24 hours from now
            const now = new Date();
            const expirationDate = new Date();
            expirationDate.setHours(expirationDate.getHours() + 24);
            
            // Format dates for Salesforce API
            const formattedStartDate = now.toISOString();
            const formattedExpirationDate = expirationDate.toISOString();

            try {
                console.log(`[VisbalLogView] Creating trace flag for user: ${userId}, debug level: ${debugLevelId}`);
                console.log(`[VisbalLogView] Start date: ${formattedStartDate}, expiration date: ${formattedExpirationDate}`);
                
                // Try with new CLI format first
                try {
                    const traceFlagCmd = `sf data create record --sobject TraceFlag --values "TracedEntityId=${userId} LogType=DEVELOPER_LOG DebugLevelId=${debugLevelId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --use-tooling-api --json`;
                    console.log(`[VisbalLogView] Creating trace flag with command: ${traceFlagCmd}`);
                    const traceFlagResult = await this._executeCommand(traceFlagCmd);
                    console.log(`[VisbalLogView] Trace flag creation result: ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    console.log(`[VisbalLogView] Created trace flag with ID: ${traceFlagJson.result.id}`);
                } catch (error: any) {
                    console.error('[VisbalLogView] Error creating trace flag with new CLI format:', error);
                    
                    // Try with old CLI format
                    const traceFlagCmd = `sfdx force:data:record:create --sobjecttype TraceFlag --values "TracedEntityId=${userId} LogType=DEVELOPER_LOG DebugLevelId=${debugLevelId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --usetoolingapi --json`;
                    console.log(`[VisbalLogView] Creating trace flag with command (old format): ${traceFlagCmd}`);
                    const traceFlagResult = await this._executeCommand(traceFlagCmd);
                    console.log(`[VisbalLogView] Trace flag creation result (old format): ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    console.log(`[VisbalLogView] Created trace flag with ID (old format): ${traceFlagJson.result.id}`);
                }
                
                console.log('[VisbalLogView] Successfully created trace flag');
            } catch (error: any) {
                console.error('[VisbalLogView] Error creating trace flag:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new Error(`Failed to create trace flag: ${errorMessage}`);
            }

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'debugStatus', 
                success: true,
                message: 'Debug log enabled successfully for 24 hours'
            });

            // Show a notification
            vscode.window.showInformationMessage('Apex Debug Log enabled successfully for 24 hours');

        } catch (error: any) {
            console.error('[VisbalLogView] Error in _turnOnDebugLog:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'debugStatus', 
                success: false,
                error: error.message || 'Unknown error'
            });
            
            vscode.window.showErrorMessage(`Failed to enable Apex Debug Log: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Clears all downloaded log files from the local directory
     */
    private async _clearLocalLogs(): Promise<void> {
        const processId = 'clear-local-logs';
        this._addBackgroundProcess(processId, 'Clearing logs');
        
        try {
            this._isLoading = true;
            this._updateStatusBar('Clearing local log files...');
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true, 
                message: 'Clearing local log files...' 
            });

            console.log('[VisbalLogView] Clearing local log files');

            // Get the logs directory - prioritize workspace folder if available
            let logsDir: string;
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use workspace folder if available
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                logsDir = path.join(workspaceFolder, '.sfdx', 'tools', 'debug', 'logs');
                console.log(`[VisbalLogView] Using workspace logs directory: ${logsDir}`);
            } else {
                // Fall back to home directory
                const sfdxDir = path.join(os.homedir(), '.sfdx');
                logsDir = path.join(sfdxDir, 'tools', 'debug', 'logs');
                console.log(`[VisbalLogView] Using home logs directory: ${logsDir}`);
            }
            
            if (!fs.existsSync(logsDir)) {
                console.log(`[VisbalLogView] Logs directory does not exist: ${logsDir}`);
                throw new Error(`Logs directory does not exist: ${logsDir}`);
            }
            
            // Get all files in the directory
            const files = await fs.promises.readdir(logsDir);
            console.log(`[VisbalLogView] Found ${files.length} files in logs directory`);
            
            // Delete each file
            let deletedCount = 0;
            for (const file of files) {
                try {
                    const filePath = path.join(logsDir, file);
                    const stats = await fs.promises.stat(filePath);
                    
                    // Only delete files, not directories
                    if (stats.isFile()) {
                        await fs.promises.unlink(filePath);
                        deletedCount++;
                        console.log(`[VisbalLogView] Deleted file: ${filePath}`);
                    } else {
                        console.log(`[VisbalLogView] Skipping directory: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`[VisbalLogView] Error deleting file ${file}:`, error);
                    // Continue with other files
                }
            }

            // Clear the downloaded logs tracking
            this._downloadedLogs.clear();
            this._downloadedLogPaths.clear();
            this._saveDownloadedLogs();

            // Update the UI
            this._updateWebviewContent();

            console.log(`[VisbalLogView] Successfully deleted ${deletedCount} log files`);
            this._updateStatusBar(`Cleared ${deletedCount} log files`);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'clearLocalStatus', 
                success: true,
                message: `Successfully cleared ${deletedCount} log files`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully cleared ${deletedCount} log files`);

        } catch (error: any) {
            console.error('[VisbalLogView] Error clearing local logs:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'clearLocalStatus', 
                success: false,
                error: error.message
            });
            
            // Show a notification
            vscode.window.showErrorMessage(`Error clearing local logs: ${error.message}`);
            this._updateStatusBar(`Error: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: false 
            });
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Deletes all logs from the Salesforce server
     */
    private async _deleteServerLogs(): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting server logs...' });

            console.log('[VisbalLogView] Deleting logs from server');

            // Get all log IDs
            const logIds = this._logs.map((log: any) => log.id).filter(Boolean);
            
            if (logIds.length === 0) {
                console.log('[VisbalLogView] No logs to delete');
                throw new Error('No logs to delete');
            }

            console.log(`[VisbalLogView] Found ${logIds.length} logs to delete`);

            // Delete logs in batches to avoid command line length limitations
            const batchSize = 10;
            let deletedCount = 0;
            
            for (let i = 0; i < logIds.length; i += batchSize) {
                const batch = logIds.slice(i, i + batchSize);
                try {
                    // Create a comma-separated list of IDs
                    const idList = batch.join(',');
                    
                    // Try with new CLI format first
                    try {
                        const deleteCmd = `sf data delete record --sobject ApexLog --record-ids ${idList} --json`;
                        console.log(`[VisbalLogView] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                        await this._executeCommand(deleteCmd);
                        
                        deletedCount += batch.length;
                        console.log(`[VisbalLogView] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                    } catch (error) {
                        console.error(`[VisbalLogView] Error deleting batch of logs with new CLI format:`, error);
                        
                        // Try with old CLI format
                        try {
                            // For old CLI format, we need to delete one by one
                            console.log('[VisbalLogView] Trying to delete logs with old CLI format');
                            let batchDeletedCount = 0;
                            
                            for (const logId of batch) {
                                try {
                                    const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                    console.log(`[VisbalLogView] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                    await this._executeCommand(oldDeleteCmd);
                                    batchDeletedCount++;
                                    console.log(`[VisbalLogView] Deleted log ${logId} with old CLI format`);
                                } catch (singleError) {
                                    console.error(`[VisbalLogView] Error deleting log ${logId} with old CLI format:`, singleError);
                                    // Continue with other logs in the batch
                                }
                            }
                            
                            deletedCount += batchDeletedCount;
                            console.log(`[VisbalLogView] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                        } catch (oldFormatError) {
                            console.error(`[VisbalLogView] Error deleting batch of logs with old CLI format:`, oldFormatError);
                            // Continue with other batches
                        }
                    }
                } catch (error) {
                    console.error(`[VisbalLogView] Error deleting batch of logs:`, error);
                    // Continue with other batches
                }
            }

            console.log(`[VisbalLogView] Successfully deleted ${deletedCount} logs from server`);

            // Clear the cached logs
            this._logs = [];
            this._lastFetchTime = 0;
            this._context.globalState.update('visbalCachedLogs', []);
            this._context.globalState.update('visbalLastFetchTime', 0);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteServerStatus', 
                success: true,
                message: `Successfully deleted ${deletedCount} logs from server`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} logs from server`);

            // Refresh the logs list
            await this._fetchLogs(true);

        } catch (error: any) {
            console.error('[VisbalLogView] Error in _deleteServerLogs:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteServerStatus', 
                success: false,
                error: error.message || 'Unknown error'
            });
            
            vscode.window.showErrorMessage(`Failed to delete server logs: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Deletes selected logs from the Salesforce server
     * @param logIds Array of log IDs to delete
     */
    private async _deleteSelectedLogs(logIds: string[]): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ 
                command: 'loading', 
                isLoading: true, 
                message: `Deleting ${logIds.length} selected logs...` 
            });

            console.log(`[VisbalLogView] _deleteSelectedLogs -- Starting to delete ${logIds.length} selected logs`);

            if (!logIds || logIds.length === 0) {
                console.log('[VisbalLogView] _deleteSelectedLogs -- No logs to delete');
                this._view?.webview.postMessage({ 
                    command: 'deleteSelectedStatus', 
                    success: false,
                    error: 'No logs selected for deletion'
                });
                return;
            }

            console.log(`[VisbalLogView] Selected log IDs: ${logIds.join(', ')}`);

            // Delete logs in batches to avoid command line length limitations
            const batchSize = 10;
            let deletedCount = 0;
            
            for (let i = 0; i < logIds.length; i += batchSize) {
                const batch = logIds.slice(i, i + batchSize);
                try {
                    // Create a comma-separated list of IDs
                    const idList = batch.join(',');
                    
                    // Try with new CLI format first
                    try {
                        const deleteCmd = `sf data delete record --sobject ApexLog --record-ids ${idList} --json`;
                        console.log(`[VisbalLogView] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                        await this._executeCommand(deleteCmd);
                        
                        deletedCount += batch.length;
                        console.log(`[VisbalLogView] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                    } catch (error) {
                        console.error(`[VisbalLogView] Error deleting batch of logs with new CLI format:`, error);
                        
                        // Try with old CLI format
                        try {
                            // For old CLI format, we need to delete one by one
                            console.log('[VisbalLogView] Trying to delete logs with old CLI format');
                            let batchDeletedCount = 0;
                            
                            for (const logId of batch) {
                                try {
                                    const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                    console.log(`[VisbalLogView] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                    await this._executeCommand(oldDeleteCmd);
                                    batchDeletedCount++;
                                    console.log(`[VisbalLogView] Deleted log ${logId} with old CLI format`);
                                } catch (singleError) {
                                    console.error(`[VisbalLogView] Error deleting log ${logId} with old CLI format:`, singleError);
                                    // Continue with other logs in the batch
                                }
                            }
                            
                            deletedCount += batchDeletedCount;
                            console.log(`[VisbalLogView] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                        } catch (oldFormatError) {
                            console.error(`[VisbalLogView] Error deleting batch of logs with old CLI format:`, oldFormatError);
                            // Continue with other batches
                        }
                    }
                } catch (error) {
                    console.error(`[VisbalLogView] Error deleting batch of logs:`, error);
                    // Continue with other batches
                }
            }

            console.log(`[VisbalLogView] Successfully deleted ${deletedCount} selected logs from server`);

            // Remove the deleted logs from the cached logs
            this._logs = this._logs.filter((log: any) => !logIds.includes(log.id));
            
            // Update the cache
            this._context.globalState.update('visbalCachedLogs', this._logs);

            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteSelectedStatus', 
                success: true,
                message: `Successfully deleted ${deletedCount} selected logs from server`
            });

            // Show a notification
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} selected logs from server`);

            // Refresh the logs list
            await this._fetchLogs(true);

        } catch (error: any) {
            console.error('[VisbalLogView] Error in _deleteSelectedLogs:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteSelectedStatus', 
                success: false,
                error: error.message || 'Unknown error'
            });
            
            vscode.window.showErrorMessage(`Failed to delete selected logs: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Applies debug configuration and optionally turns on debug log
     * @param config Debug configuration
     * @param turnOnDebug Whether to turn on debug log
     */
    private async _applyDebugConfig(config: any, turnOnDebug: boolean): Promise<void> {
        try {
            console.log('[VisbalLogView] Applying debug configuration:', config);
            
            // Set loading state
            this._isLoading = true;
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: true,
                message: turnOnDebug ? 'Applying debug configuration and turning on debug...' : 'Applying debug configuration...'
            });
            
            // Determine preset name for the debug level name
            let presetName = 'Custom';
            // Check if config matches any of our presets
            const presets: Record<string, Record<string, string>> = {
                default: {
                    apexCode: 'DEBUG',
                    apexProfiling: 'INFO',
                    callout: 'INFO',
                    dataAccess: 'INFO',
                    database: 'INFO',
                    nba: 'INFO',
                    system: 'DEBUG',
                    validation: 'INFO',
                    visualforce: 'INFO',
                    wave: 'INFO',
                    workflow: 'INFO'
                },
                detailed: {
                    apexCode: 'FINE',
                    apexProfiling: 'FINE',
                    callout: 'FINER',
                    dataAccess: 'FINE',
                    database: 'FINE',
                    nba: 'FINE',
                    system: 'FINE',
                    validation: 'INFO',
                    visualforce: 'FINE',
                    wave: 'FINE',
                    workflow: 'FINE'
                },
                developer: {
                    apexCode: 'FINEST',
                    apexProfiling: 'FINEST',
                    callout: 'FINEST',
                    dataAccess: 'FINEST',
                    database: 'FINEST',
                    nba: 'FINEST',
                    system: 'FINEST',
                    validation: 'FINEST',
                    visualforce: 'FINEST',
                    wave: 'FINEST',
                    workflow: 'FINEST'
                },
                debugonly: {
                    apexCode: 'DEBUG',
                    apexProfiling: 'NONE',
                    callout: 'NONE',
                    dataAccess: 'NONE',
                    database: 'NONE',
                    nba: 'NONE',
                    system: 'DEBUG',
                    validation: 'NONE',
                    visualforce: 'NONE',
                    wave: 'NONE',
                    workflow: 'NONE'
                }
            };
            
            for (const [name, presetConfig] of Object.entries(presets)) {
                let isMatch = true;
                for (const key of Object.keys(presetConfig)) {
                    if (config[key] !== presetConfig[key]) {
                        isMatch = false;
                        break;
                    }
                }
                if (isMatch) {
                    presetName = name.charAt(0).toUpperCase() + name.slice(1);
                    break;
                }
            }
            
            // Generate a unique debug level name with timestamp
            const debugLevelName = `VisbalExt_${presetName}`;
            
            // Get the current user ID - needed for both applying config and turning on debug
            let userId = '';
            try {
                // Try with new CLI format first
                try {
                    console.log('[VisbalLogView] Getting user ID with new CLI format');
                    const userIdResult = await this._executeCommand('sf org display user --json');
                    console.log(`[VisbalLogView] User ID result: ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID: ${userId}`);
                } catch (error) {
                    console.error('[VisbalLogView] Error getting user ID with new CLI format:', error);
                    
                    // Try with old CLI format
                    console.log('[VisbalLogView] Trying with old CLI format');
                    const userIdResult = await this._executeCommand('sfdx force:user:display --json');
                    console.log(`[VisbalLogView] User ID result (old format): ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID (old format): ${userId}`);
                }
            } catch (error) {
                console.error('[VisbalLogView] Error getting user ID:', error);
                throw new Error('Failed to get current user ID. Make sure you are authenticated with a Salesforce org.');
            }

            if (!userId) {
                throw new Error('Could not determine current user ID');
            }

            // Check if there's an existing trace flag
            let existingTraceFlag = null;
            let existingDebugLevelId = null;
            
            try {
                console.log('[VisbalLogView] Checking for existing trace flags');
                const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
                
                // Try with new CLI format first
                try {
                    const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --json`);
                    console.log(`[VisbalLogView] Trace flag query result: ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        existingTraceFlag = traceFlagJson.result.records[0];
                        existingDebugLevelId = existingTraceFlag.DebugLevelId;
                        console.log(`[VisbalLogView] Found existing trace flag: ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error checking trace flags with new CLI format:', error);
                    
                    // Try with old CLI format
                    try {
                        const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --json`);
                        console.log(`[VisbalLogView] Trace flag query result (old format): ${traceFlagResult}`);
                        const traceFlagJson = JSON.parse(traceFlagResult);
                        
                        if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                            existingTraceFlag = traceFlagJson.result.records[0];
                            existingDebugLevelId = existingTraceFlag.DebugLevelId;
                            console.log(`[VisbalLogView] Found existing trace flag (old format): ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                        }
                    } catch (oldError) {
                        console.error('[VisbalLogView] Error checking trace flags with old CLI format:', oldError);
                    }
                }
            } catch (error) {
                console.error('[VisbalLogView] Error checking existing trace flag:', error);
            }

            // Create debug level values
            const debugLevelValues: Record<string, string> = {
                ApexCode: config.apexCode || 'DEBUG',
                ApexProfiling: config.apexProfiling || 'INFO',
                Callout: config.callout || 'INFO',
                Database: config.database || 'INFO',
                System: config.system || 'DEBUG',
                Validation: config.validation || 'INFO',
                Visualforce: config.visualforce || 'INFO',
                Workflow: config.workflow || 'INFO'
            };

            // Add NBA and Wave if they exist in the config
            if (config.nba) {
                debugLevelValues['NBA'] = config.nba;
            }
            if (config.wave) {
                debugLevelValues['Wave'] = config.wave;
            }
            if (config.dataAccess) {
                debugLevelValues['DataAccess'] = config.dataAccess;
            }

            // Create or update debug level
            let debugLevelId = existingDebugLevelId;
            
            if (existingDebugLevelId) {
                // Update existing debug level
                console.log('[VisbalLogView] Updating existing debug level');
                
                // Construct debug level fields
                const debugLevelFields = Object.entries(debugLevelValues)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' ');
                
                try {
                    // Try with new CLI format first
                    try {
                        const updateDebugLevelCommand = `sf data update record --sobject DebugLevel --record-id ${existingDebugLevelId} --values "${debugLevelFields}" --use-tooling-api --json`;
                        console.log(`[VisbalLogView] Updating debug level with command: ${updateDebugLevelCommand}`);
                        
                        const updateDebugLevelResult = await this._executeCommand(updateDebugLevelCommand);
                        console.log(`[VisbalLogView] Update debug level result: ${updateDebugLevelResult}`);
                    } catch (error) {
                        console.error('[VisbalLogView] Error updating debug level with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const updateDebugLevelCommand = `sfdx force:data:record:update --sobjecttype DebugLevel --sobjectid ${existingDebugLevelId} --values "${debugLevelFields}" --usetoolingapi --json`;
                            console.log(`[VisbalLogView] Updating debug level with command (old format): ${updateDebugLevelCommand}`);
                            
                            const updateDebugLevelResult = await this._executeCommand(updateDebugLevelCommand);
                            console.log(`[VisbalLogView] Update debug level result (old format): ${updateDebugLevelResult}`);
                        } catch (oldError) {
                            console.error('[VisbalLogView] Error updating debug level with old CLI format:', oldError);
                            throw new Error('Failed to update debug level');
                        }
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error updating debug level:', error);
                    throw new Error('Failed to update debug level');
                }
            } else {
                // Create new debug level
                console.log('[VisbalLogView] Creating new debug level');
                
                // Construct debug level fields
                const debugLevelFields = Object.entries(debugLevelValues)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' ');
                
                try {
                    // Try with new CLI format first
                    try {
                        const createDebugLevelCommand = `sf data create record --sobject DebugLevel --values "DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ${debugLevelFields}" --use-tooling-api --json`;
                        console.log(`[VisbalLogView] Creating debug level with command: ${createDebugLevelCommand}`);
                        
                        const createDebugLevelResult = await this._executeCommand(createDebugLevelCommand);
                        console.log(`[VisbalLogView] Create debug level result: ${createDebugLevelResult}`);
                        
                        const createDebugLevelJson = JSON.parse(createDebugLevelResult);
                        debugLevelId = createDebugLevelJson.result.id;
                        console.log(`[VisbalLogView] Created debug level with ID: ${debugLevelId}`);
                    } catch (error) {
                        console.error('[VisbalLogView] Error creating debug level with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const createDebugLevelCommand = `sfdx force:data:record:create --sobjecttype DebugLevel --values "DeveloperName=${debugLevelName} MasterLabel=${debugLevelName} ${debugLevelFields}" --usetoolingapi --json`;
                            console.log(`[VisbalLogView] Creating debug level with command (old format): ${createDebugLevelCommand}`);
                            
                            const createDebugLevelResult = await this._executeCommand(createDebugLevelCommand);
                            console.log(`[VisbalLogView] Create debug level result (old format): ${createDebugLevelResult}`);
                            
                            const createDebugLevelJson = JSON.parse(createDebugLevelResult);
                            debugLevelId = createDebugLevelJson.result.id;
                            console.log(`[VisbalLogView] Created debug level with ID (old format): ${debugLevelId}`);
                        } catch (oldError) {
                            console.error('[VisbalLogView] Error creating debug level with old CLI format:', oldError);
                            throw new Error('Failed to create debug level');
                        }
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error creating debug level:', error);
                    throw new Error('Failed to create debug level');
                }
            }

            // Delete existing trace flag if it exists
            if (existingTraceFlag) {
                console.log(`[VisbalLogView] Deleting existing trace flag: ${existingTraceFlag.Id}`);
                
                try {
                    // Try with new CLI format first
                    try {
                        const deleteTraceFlagCommand = `sf data delete record --sobject TraceFlag --record-id ${existingTraceFlag.Id} --use-tooling-api --json`;
                        console.log(`[VisbalLogView] Deleting trace flag with command: ${deleteTraceFlagCommand}`);
                        
                        const deleteTraceFlagResult = await this._executeCommand(deleteTraceFlagCommand);
                        console.log(`[VisbalLogView] Delete trace flag result: ${deleteTraceFlagResult}`);
                    } catch (error) {
                        console.error('[VisbalLogView] Error deleting trace flag with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const deleteTraceFlagCommand = `sfdx force:data:record:delete --sobjecttype TraceFlag --sobjectid ${existingTraceFlag.Id} --usetoolingapi --json`;
                            console.log(`[VisbalLogView] Deleting trace flag with command (old format): ${deleteTraceFlagCommand}`);
                            
                            const deleteTraceFlagResult = await this._executeCommand(deleteTraceFlagCommand);
                            console.log(`[VisbalLogView] Delete trace flag result (old format): ${deleteTraceFlagResult}`);
                        } catch (oldError) {
                            console.error('[VisbalLogView] Error deleting trace flag with old CLI format:', oldError);
                        }
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error deleting trace flag:', error);
                }
            }

            if (turnOnDebug) {
                // Create trace flag
                console.log('[VisbalLogView] Creating trace flag');
                
                // Set expiration date to 24 hours from now
                const now = new Date();
                const expirationDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const formattedStartDate = now.toISOString();
                const formattedExpirationDate = expirationDate.toISOString();
                
                try {
                    // Try with new CLI format first
                    try {
                        const createTraceFlagCommand = `sf data create record --sobject TraceFlag --values "DebugLevelId=${debugLevelId} LogType=DEVELOPER_LOG TracedEntityId=${userId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --use-tooling-api --json`;
                        console.log(`[VisbalLogView] Creating trace flag with command: ${createTraceFlagCommand}`);
                        
                        const createTraceFlagResult = await this._executeCommand(createTraceFlagCommand);
                        console.log(`[VisbalLogView] Create trace flag result: ${createTraceFlagResult}`);
                        
                        const createTraceFlagJson = JSON.parse(createTraceFlagResult);
                        console.log(`[VisbalLogView] Created trace flag with ID: ${createTraceFlagJson.result.id}`);
                    } catch (error) {
                        console.error('[VisbalLogView] Error creating trace flag with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const createTraceFlagCommand = `sfdx force:data:record:create --sobjecttype TraceFlag --values "DebugLevelId=${debugLevelId} LogType=DEVELOPER_LOG TracedEntityId=${userId} StartDate=${formattedStartDate} ExpirationDate=${formattedExpirationDate}" --usetoolingapi --json`;
                            console.log(`[VisbalLogView] Creating trace flag with command (old format): ${createTraceFlagCommand}`);
                            
                            const createTraceFlagResult = await this._executeCommand(createTraceFlagCommand);
                            console.log(`[VisbalLogView] Create trace flag result (old format): ${createTraceFlagResult}`);
                            
                            const createTraceFlagJson = JSON.parse(createTraceFlagResult);
                            console.log(`[VisbalLogView] Created trace flag with ID (old format): ${createTraceFlagJson.result.id}`);
                        } catch (oldError) {
                            console.error('[VisbalLogView] Error creating trace flag with old CLI format:', oldError);
                            throw new Error('Failed to create trace flag');
                        }
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error creating trace flag:', error);
                    throw new Error('Failed to create trace flag');
                }
                
                // Send success message
                this._view?.webview.postMessage({
                    command: 'debugStatus',
                    success: true
                });
            } else {
                // Just send success message for applying config without turning on debug
                this._view?.webview.postMessage({
                    command: 'applyConfigStatus',
                    success: true
                });
            }
        } catch (error: unknown) {
            console.error('[VisbalLogView] Error in _applyDebugConfig:', error);
            
            // Send error message
            this._view?.webview.postMessage({
                command: turnOnDebug ? 'debugStatus' : 'applyConfigStatus',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            // Reset loading state
            this._isLoading = false;
            this._view?.webview.postMessage({
                command: 'loading',
                isLoading: false
            });
        }
    }

    /**
     * Gets the current debug configuration
     */
    private async _getCurrentDebugConfig(): Promise<void> {
        try {
            console.log('[VisbalLogView] Getting current debug configuration');
            
            // Get the current user ID
            let userId = '';
            try {
                // Try with new CLI format first
                try {
                    console.log('[VisbalLogView] Getting user ID with new CLI format');
                    const userIdResult = await this._executeCommand('sf org display user --json');
                    console.log(`[VisbalLogView] User ID result: ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID: ${userId}`);
                } catch (error) {
                    console.error('[VisbalLogView] Error getting user ID with new CLI format:', error);
                    
                    // Try with old CLI format
                    console.log('[VisbalLogView] Trying with old CLI format');
                    const userIdResult = await this._executeCommand('sfdx force:user:display --json');
                    console.log(`[VisbalLogView] User ID result (old format): ${userIdResult}`);
                    const userIdJson = JSON.parse(userIdResult);
                    userId = userIdJson.result.id;
                    console.log(`[VisbalLogView] Current user ID (old format): ${userId}`);
                }
            } catch (error) {
                console.error('[VisbalLogView] Error getting user ID:', error);
                throw new Error('Failed to get current user ID. Make sure you are authenticated with a Salesforce org.');
            }

            if (!userId) {
                throw new Error('Could not determine current user ID');
            }

            // Check if there's an existing trace flag
            let existingTraceFlag = null;
            let existingDebugLevelId = null;
            
            try {
                console.log('[VisbalLogView] Checking for existing trace flags');
                const query = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE LogType='DEVELOPER_LOG' AND TracedEntityId='${userId}'`;
                
                // Try with new CLI format first
                try {
                    const traceFlagResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --json`);
                    console.log(`[VisbalLogView] Trace flag query result: ${traceFlagResult}`);
                    const traceFlagJson = JSON.parse(traceFlagResult);
                    
                    if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                        existingTraceFlag = traceFlagJson.result.records[0];
                        existingDebugLevelId = existingTraceFlag.DebugLevelId;
                        console.log(`[VisbalLogView] Found existing trace flag: ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error checking trace flags with new CLI format:', error);
                    
                    // Try with old CLI format
                    try {
                        const traceFlagResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --json`);
                        console.log(`[VisbalLogView] Trace flag query result (old format): ${traceFlagResult}`);
                        const traceFlagJson = JSON.parse(traceFlagResult);
                        
                        if (traceFlagJson.result && traceFlagJson.result.records && traceFlagJson.result.records.length > 0) {
                            existingTraceFlag = traceFlagJson.result.records[0];
                            existingDebugLevelId = existingTraceFlag.DebugLevelId;
                            console.log(`[VisbalLogView] Found existing trace flag (old format): ${existingTraceFlag.Id}, debug level: ${existingDebugLevelId}`);
                        }
                    } catch (oldError) {
                        console.error('[VisbalLogView] Error checking trace flags with old CLI format:', oldError);
                    }
                }
            } catch (error) {
                console.error('[VisbalLogView] Error checking existing trace flag:', error);
            }

            // If we have a debug level ID, get its details
            if (existingDebugLevelId) {
                try {
                    console.log(`[VisbalLogView] Getting debug level details for: ${existingDebugLevelId}`);
                    const query = `SELECT Id, DeveloperName, MasterLabel, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow, Wave, NBA FROM DebugLevel WHERE Id='${existingDebugLevelId}'`;
                    
                    // Try with new CLI format first
                    try {
                        const debugLevelResult = await this._executeCommand(`sf data query --query "${query}" --use-tooling-api --json`);
                        console.log(`[VisbalLogView] Debug level query result: ${debugLevelResult}`);
                        const debugLevelJson = JSON.parse(debugLevelResult);
                        
                        if (debugLevelJson.result && debugLevelJson.result.records && debugLevelJson.result.records.length > 0) {
                            const debugLevel = debugLevelJson.result.records[0];
                            console.log(`[VisbalLogView] Found debug level: ${debugLevel.DeveloperName}`);
                            
                            // Send the debug level configuration to the webview
                            this._view?.webview.postMessage({
                                command: 'currentDebugConfig',
                                config: {
                                    apexCode: debugLevel.ApexCode,
                                    apexProfiling: debugLevel.ApexProfiling,
                                    callout: debugLevel.Callout,
                                    database: debugLevel.Database,
                                    system: debugLevel.System,
                                    validation: debugLevel.Validation,
                                    visualforce: debugLevel.Visualforce,
                                    workflow: debugLevel.Workflow,
                                    wave: debugLevel.Wave,
                                    nba: debugLevel.NBA
                                }
                            });
                            return;
                        }
                    } catch (error) {
                        console.error('[VisbalLogView] Error getting debug level details with new CLI format:', error);
                        
                        // Try with old CLI format
                        try {
                            const debugLevelResult = await this._executeCommand(`sfdx force:data:soql:query --query "${query}" --usetoolingapi --json`);
                            console.log(`[VisbalLogView] Debug level query result (old format): ${debugLevelResult}`);
                            const debugLevelJson = JSON.parse(debugLevelResult);
                            
                            if (debugLevelJson.result && debugLevelJson.result.records && debugLevelJson.result.records.length > 0) {
                                const debugLevel = debugLevelJson.result.records[0];
                                console.log(`[VisbalLogView] Found debug level (old format): ${debugLevel.DeveloperName}`);
                                
                                // Send the debug level configuration to the webview
                                this._view?.webview.postMessage({
                                    command: 'currentDebugConfig',
                                    config: {
                                        apexCode: debugLevel.ApexCode,
                                        apexProfiling: debugLevel.ApexProfiling,
                                        callout: debugLevel.Callout,
                                        database: debugLevel.Database,
                                        system: debugLevel.System,
                                        validation: debugLevel.Validation,
                                        visualforce: debugLevel.Visualforce,
                                        workflow: debugLevel.Workflow,
                                        wave: debugLevel.Wave,
                                        nba: debugLevel.NBA
                                    }
                                });
                                return;
                            }
                        } catch (oldError) {
                            console.error('[VisbalLogView] Error getting debug level details with old CLI format:', oldError);
                        }
                    }
                } catch (error) {
                    console.error('[VisbalLogView] Error getting debug level details:', error);
                }
            }

            // If we get here, we couldn't find a debug level or there was an error
            // Send the default configuration
            console.log('[VisbalLogView] Using default debug configuration');
            this._view?.webview.postMessage({
                command: 'info',
                message: 'Info: Using default debug configuration.'
            });
            this._view?.webview.postMessage({
                command: 'currentDebugConfig',
                config: {
                    apexCode: 'DEBUG',
                    apexProfiling: 'INFO',
                    callout: 'INFO',
                    dataAccess: 'INFO',
                    database: 'INFO',
                    nba: 'INFO',
                    system: 'DEBUG',
                    validation: 'INFO',
                    visualforce: 'INFO',
                    wave: 'INFO',
                    workflow: 'INFO'
                }
            });
        } catch (error) {
            console.error('[VisbalLogView] Error in _getCurrentDebugConfig:', error);
            
            // Send default configuration in case of error
            this._view?.webview.postMessage({
                command: 'currentDebugConfig',
                config: {
                    apexCode: 'DEBUG',
                    apexProfiling: 'INFO',
                    callout: 'INFO',
                    dataAccess: 'INFO',
                    database: 'INFO',
                    nba: 'INFO',
                    system: 'DEBUG',
                    validation: 'INFO',
                    visualforce: 'INFO',
                    wave: 'INFO',
                    workflow: 'INFO'
                }
            });
        }
    }

    /**
     * Deletes all logs from the Salesforce server using Tooling API (faster method)
     */
    private async _deleteServerLogsFast(): Promise<void> {
        const processId = 'delete-server-logs';
        this._addBackgroundProcess(processId, 'Deleting logs');
        
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting server logs (fast mode)...' });

            console.log('[VisbalLogView] Fast-deleting logs from server using Tooling API');

            // First, get all log IDs using SOQL query
            try {
                // Try with new CLI format first
                const queryCmd = `sf data query --query "SELECT Id FROM ApexLog" --use-tooling-api --json`;
                console.log(`[VisbalLogView] Querying logs with command: ${queryCmd}`);
                
                const queryResult = await this._executeCommand(queryCmd);
                const jsonResult = JSON.parse(queryResult);
                
                if (jsonResult.result && jsonResult.result.records) {
                    const logIds = jsonResult.result.records.map((record: any) => record.Id);
                    
                    if (logIds.length === 0) {
                        console.log('[VisbalLogView] No logs found to delete');
                        throw new Error('No logs found to delete');
                    }

                    console.log(`[VisbalLogView] Found ${logIds.length} logs to delete`);

                    // Delete logs in batches to avoid command line length limitations
                    const BATCH_SIZE = 10; // Process 10 logs at a time
                    let successCount = 0;
                    let failureCount = 0;

                    // Process logs in batches
                    for (let i = 0; i < logIds.length; i += BATCH_SIZE) {
                        const batchIds = logIds.slice(i, i + BATCH_SIZE);
                        const idList = batchIds.join(',');
                        
                        try {
                            // Delete logs using Tooling API
                            const deleteCmd = `sf data delete record --sobject ApexLog --record-ids ${idList} --use-tooling-api --json`;
                            console.log(`[VisbalLogView] Deleting batch ${i/BATCH_SIZE + 1} of logs with command: ${deleteCmd}`);
                            
                            await this._executeCommand(deleteCmd);
                            successCount += batchIds.length;
                        } catch (batchError: any) {
                            console.error(`[VisbalLogView] Error deleting batch of logs with new CLI format:`, batchError);
                            
                            // Try with old CLI format as fallback
                            try {
                                const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectids ${idList} --usetoolingapi --json`;
                                console.log(`[VisbalLogView] Trying old CLI format for batch ${i/BATCH_SIZE + 1}`);
                                await this._executeCommand(oldDeleteCmd);
                                successCount += batchIds.length;
                            } catch (oldBatchError: any) {
                                console.error(`[VisbalLogView] Error deleting batch of logs with old CLI format:`, oldBatchError);
                                failureCount += batchIds.length;
                            }
                        }
                        
                        // Update progress message
                        this._view?.webview.postMessage({ 
                            command: 'loading', 
                            isLoading: true,
                            message: `Deleted ${successCount} of ${logIds.length} logs...`
                        });
                    }

                    console.log(`[VisbalLogView] Successfully deleted ${successCount} logs, failed to delete ${failureCount} logs`);

                    // Clear the cached logs
                    this._logs = [];
                    this._lastFetchTime = 0;
                    this._context.globalState.update('visbalCachedLogs', []);
                    this._context.globalState.update('visbalLastFetchTime', 0);

                    // Notify the webview
                    this._view?.webview.postMessage({ 
                        command: 'deleteServerStatus', 
                        success: true,
                        message: failureCount > 0 ? 
                            `Deleted ${successCount} logs, failed to delete ${failureCount} logs` : 
                            `Successfully deleted ${successCount} logs from server`
                    });

                    // Show a notification
                    if (failureCount > 0) {
                        vscode.window.showWarningMessage(`Deleted ${successCount} logs, failed to delete ${failureCount} logs`);
                    } else {
                        vscode.window.showInformationMessage(`Successfully deleted ${successCount} logs from server`);
                    }

                    // Refresh the logs list
                    await this._fetchLogs(true);
                }
            } catch (error: any) {
                console.error('[VisbalLogView] Error in fast delete operation:', error);
                throw error;
            }
        } catch (error: any) {
            console.error('[VisbalLogView] Error in _deleteServerLogsFast:', error);
            
            // Notify the webview
            this._view?.webview.postMessage({ 
                command: 'deleteServerStatus', 
                success: false,
                error: error.message
            });
            
            // Show a notification
            vscode.window.showErrorMessage(`Error deleting logs from server: ${error.message}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Fast-deletes selected logs using the Tooling API
     */
    private async _deleteSelectedLogsFast(logIds: string[]): Promise<void> {
        console.log('[VisbalLogView] _deleteSelectedLogsFast -- Starting fast deletion of selected logs');
        
        const processId = 'delete-selected-logs';
        this._addBackgroundProcess(processId, 'Deleting selected');
        
        try {
            // Get selected log IDs
            const selectedLogIds = this._selectedLogs.map(log => log.id);
            if (selectedLogIds.length === 0) {
                console.log('[VisbalLogView] _deleteSelectedLogsFast -- No logs selected');
                return;
            }

            // Set loading state
            this._webview?.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: `Deleting ${selectedLogIds.length} selected logs...`
            });
            this._updateStatusBar(`Deleting ${selectedLogIds.length} logs...`);

            // Delete logs in batches to avoid command line length limitations
            const BATCH_SIZE = 10; // Process 10 logs at a time
            let successCount = 0;
            let failureCount = 0;

            // Process logs in batches
            for (let i = 0; i < selectedLogIds.length; i += BATCH_SIZE) {
                const batchIds = selectedLogIds.slice(i, i + BATCH_SIZE);
                const idList = batchIds.join(',');
                
                try {
                    // Delete logs using Tooling API
                    const deleteCommand = `sf data delete record --sobject ApexLog --record-ids ${idList} --use-tooling-api --json`;
                    
                    console.log(`[VisbalLogView] _deleteSelectedLogsFast -- Executing delete command for batch ${i/BATCH_SIZE + 1}`);
                    const result = await this._executeCommand(deleteCommand);
                    const deleteResult = JSON.parse(result) as CommandResult;
                    
                    if (!deleteResult.success) {
                        console.error(`[VisbalLogView] Error deleting batch of logs:`, deleteResult.error);
                        failureCount += batchIds.length;
                    } else {
                        successCount += batchIds.length;
                    }
                } catch (batchError: any) {
                    console.error(`[VisbalLogView] Error deleting batch of logs with new CLI format:`, batchError);
                    
                    // Try with old CLI format as fallback
                    try {
                        const oldDeleteCommand = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectids ${idList} --usetoolingapi --json`;
                        console.log(`[VisbalLogView] _deleteSelectedLogsFast -- Trying old CLI format for batch ${i/BATCH_SIZE + 1}`);
                        const oldResult = await this._executeCommand(oldDeleteCommand);
                        const oldDeleteResult = JSON.parse(oldResult) as CommandResult;
                        
                        if (!oldDeleteResult.success) {
                            console.error(`[VisbalLogView] Error deleting batch of logs with old CLI format:`, oldDeleteResult.error);
                            failureCount += batchIds.length;
                        } else {
                            successCount += batchIds.length;
                        }
                    } catch (oldBatchError: any) {
                        console.error(`[VisbalLogView] Error deleting batch of logs with old CLI format:`, oldBatchError);
                        failureCount += batchIds.length;
                    }
                }
                
                // Update progress message
                this._webview?.postMessage({ 
                    command: 'setLoading', 
                    loading: true,
                    message: `Deleted ${successCount} of ${selectedLogIds.length} logs...`
                });
                this._updateStatusBar(`Deleted ${successCount} of ${selectedLogIds.length} logs...`);
            }

            // Update cached logs
            this._cachedLogs = this._cachedLogs.filter(log => !selectedLogIds.includes(log.id));
            
            // Clear selection
            this._selectedLogs = [];
            
            // Notify webview
            this._webview?.postMessage({ 
                command: 'setLoading', 
                loading: false,
                message: `Successfully deleted ${successCount} logs, failed to delete ${failureCount} logs`
            });
            
            // Show success notification
            if (failureCount > 0) {
                vscode.window.showWarningMessage(`Deleted ${successCount} logs, failed to delete ${failureCount} logs`);
                this._updateStatusBar(`Deleted ${successCount} logs, failed: ${failureCount}`);
            } else {
                vscode.window.showInformationMessage(`Successfully deleted ${successCount} logs`);
                this._updateStatusBar(`Deleted ${successCount} logs`);
            }
            
            // Refresh the logs list
            await this._fetchLogs();
            
        } catch (error: any) {
            console.error('[VisbalLogView] _deleteSelectedLogsFast -- Error:', error);
            
            // Notify webview
            this._webview?.postMessage({ 
                command: 'setLoading', 
                loading: false,
                message: `Error deleting logs: ${error.message}`
            });
            
            // Show error notification
            vscode.window.showErrorMessage(`Error deleting logs: ${error.message}`);
            this._updateStatusBar(`Error: ${error.message}`);
        } finally {
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Selects logs by their IDs
     */
    private async _selectLogs(logIds: string[]): Promise<void> {
        console.log(`[VisbalLogView] _selectLogs -- Selecting ${logIds.length} logs`);
        this._selectedLogs = this._cachedLogs.filter(log => logIds.includes(log.id));
        
        // Notify webview of selection
        this._webview?.postMessage({
            command: 'updateSelection',
            selectedLogs: this._selectedLogs
        });
    }

    /**
     * Checks for downloaded logs in the local directory
     */
    private _checkDownloadedLogs(): void {
        console.log('[VisbalLogView] _checkDownloadedLogs -- Checking for downloaded logs');
        
        // Get the logs directory
        let logsDir: string;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            logsDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.sfdx', 'tools', 'debug', 'logs');
        } else {
            logsDir = path.join(os.homedir(), '.sfdx', 'tools', 'debug', 'logs');
        }

        // Check if directory exists
        if (!fs.existsSync(logsDir)) {
            console.log(`[VisbalLogView] _checkDownloadedLogs -- Logs directory does not exist: ${logsDir}`);
            return;
        }

        // Read all files in the directory
        const files = fs.readdirSync(logsDir);
        console.log(`[VisbalLogView] _checkDownloadedLogs -- Found ${files.length} files in logs directory`);

        // Process each file
        files.forEach(file => {
            if (file.endsWith('.log')) {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.isFile()) {
                    // Extract log ID from filename (assuming format: logId_operation_status_size_timestamp.log)
                    const logId = file.split('_')[0];
                    if (logId) {
                        this._downloadedLogs.add(logId);
                        this._downloadedLogPaths.set(logId, filePath);
                        console.log(`[VisbalLogView] _checkDownloadedLogs -- Found downloaded log: ${logId}`);
                    }
                }
            }
        });
    }

    /**
     * Gets the webview content
     */
    private _getWebviewContent(webview: vscode.Webview): string {
        // Use the fixed HTML template instead of the problematic one
        return getFixedHtmlForWebview(this._extensionUri, webview);
    }

    /**
     * Fetches the content of a specific log
     * @param logId The ID of the log to fetch
     */
    private async _fetchLogContent(logId: string): Promise<string> {
        console.log(`[VisbalLogView] _fetchLogContent -- Fetching content for log: ${logId}`);
        
        try {
            // Try with new CLI format first
            try {
                const result = await this._executeCommand(`sf apex get log -i ${logId} --json`);
                const jsonResult = JSON.parse(result);
                if (jsonResult && jsonResult.result && jsonResult.result.log) {
                    return jsonResult.result.log;
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching log with new CLI format:', error);
            }
            
            // Try with old CLI format
            try {
                const result = await this._executeCommand(`sfdx force:apex:log:get --logid ${logId} --json`);
                const jsonResult = JSON.parse(result);
                if (jsonResult && jsonResult.result && jsonResult.result.log) {
                    return jsonResult.result.log;
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching log with old CLI format:', error);
            }
            
            // Try direct output without JSON
            try {
                const { stdout } = await execAsync(`sf apex get log -i ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                if (stdout && stdout.trim().length > 0) {
                    return stdout;
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching log with direct output:', error);
            }
            
            throw new Error('Failed to fetch log content with all methods');
        } catch (error: any) {
            console.error(`[VisbalLogView] _fetchLogContent -- Error:`, error);
            throw error;
        }
    }

    /**
     * Saves the downloaded logs state
     */
    private _saveDownloadedLogs(): void {
        console.log('[VisbalLogView] _saveDownloadedLogs -- Saving downloaded logs state');
        this._context.globalState.update('visbalDownloadedLogs', Array.from(this._downloadedLogs));
        this._context.globalState.update('visbalDownloadedLogPaths', Array.from(this._downloadedLogPaths.entries()));
    }

    /**
     * Fetches logs from Salesforce using regular method
     */
    private async _fetchSalesforceLogs(): Promise<SalesforceLog[]> {
        console.log('[VisbalLogView] _fetchSalesforceLogs -- Starting to fetch Salesforce logs');
        
        try {
            // Try with new CLI format first
            try {
                const result = await this._executeCommand('sf apex list log --json');
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result && Array.isArray(jsonResult.result)) {
                    return jsonResult.result.map((log: any) => ({
                        id: log.Id,
                        logUser: {
                            name: log.LogUser?.Name || 'Unknown User'
                        },
                        application: log.Application || 'Unknown',
                        operation: log.Operation || 'Unknown',
                        request: log.Request || '',
                        status: log.Status || 'Unknown',
                        logLength: log.LogLength || 0,
                        lastModifiedDate: log.LastModifiedDate || '',
                        downloaded: false
                    }));
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching logs with new CLI format:', error);
            }
            
            // Try with old CLI format
            try {
                const result = await this._executeCommand('sfdx force:apex:log:list --json');
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result && Array.isArray(jsonResult.result)) {
                    return jsonResult.result.map((log: any) => ({
                        id: log.Id,
                        logUser: {
                            name: log.LogUser?.Name || 'Unknown User'
                        },
                        application: log.Application || 'Unknown',
                        operation: log.Operation || 'Unknown',
                        request: log.Request || '',
                        status: log.Status || 'Unknown',
                        logLength: log.LogLength || 0,
                        lastModifiedDate: log.LastModifiedDate || '',
                        downloaded: false
                    }));
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching logs with old CLI format:', error);
            }
            
            throw new Error('Failed to fetch logs with all methods');
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchSalesforceLogs -- Error:', error);
            throw error;
        }
    }

    /**
     * Public method to refresh the logs
     * Called from the extension.ts when the refresh command is triggered
     */
    public refresh(): void {
        console.log('[VisbalLogView] refresh -- Refreshing logs');
        this._fetchLogs(true).catch(error => {
            console.error('[VisbalLogView] refresh -- Error refreshing logs:', error);
            vscode.window.showErrorMessage(`Error refreshing logs: ${error.message}`);
        });
    }

    /**
     * Updates the status bar with the given message and optionally the log count
     * @param message The message to display
     * @param count Optional log count to display
     */
    private _updateStatusBar(message: string, count?: number): void {
        let statusText = 'Visbal: ';
        
        // Add background processes if any
        if (this._backgroundProcesses.size > 0) {
            const processes = Array.from(this._backgroundProcesses.values()).join(', ');
            statusText += `[${processes}] `;
        }
        
        // Add message and count if provided
        statusText += message;
        if (count !== undefined) {
            statusText += ` (${count} logs)`;
        }
        
        this._statusBarItem.text = statusText;
    }

    /**
     * Adds a background process to the status bar
     * @param id Unique identifier for the process
     * @param description Short description of the process
     */
    private _addBackgroundProcess(id: string, description: string): void {
        this._backgroundProcesses.set(id, description);
        this._updateStatusBar(this._isLoading ? 'Loading...' : `${this._logs.length} logs`);
    }

    /**
     * Removes a background process from the status bar
     * @param id Unique identifier for the process
     */
    private _removeBackgroundProcess(id: string): void {
        this._backgroundProcesses.delete(id);
        this._updateStatusBar(this._isLoading ? 'Loading...' : `${this._logs.length} logs`);
    }

    /**
     * Fetches logs from Salesforce using Tooling API directly for better performance
     * This method should be faster than the standard SOQL method
     */
    private async _fetchLogsToolingApi(): Promise<void> {
        console.log('[VisbalLogView] _fetchLogsToolingApi -- Starting fast log fetch using Tooling API');
        
        try {
            // Update loading message to indicate Tooling API query is in progress
            this._updateStatusBar('Fetching logs via Tooling API...');
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: 'Fetching logs via Tooling API...'
            });
            
            const logs = await this._fetchSalesforceLogsToolingApi();
            this._logs = logs;
            this._lastFetchTime = Date.now();
            
            // Update cache in global state
            this._context.globalState.update('visbalCachedLogs', logs);
            this._context.globalState.update('visbalLastFetchTime', this._lastFetchTime);
            
            console.log(`[VisbalLogView] _fetchLogsToolingApi -- Successfully fetched ${logs.length} logs`);
            
            // Update status bar with log count
            this._updateStatusBar(`Formatting ${logs.length} logs...`);
            
            // Update loading message to indicate formatting is in progress
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: true,
                message: 'Formatting logs...'
            });
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchLogsToolingApi -- Error:', error);
            
            // Update status bar with error
            this._updateStatusBar(`Error: ${error.message}`);
            
            // Ensure loading state is reset on error
            this._view?.webview.postMessage({ 
                command: 'setLoading', 
                loading: false
            });
            
            throw error;
        }
    }

    /**
     * Fetches logs from Salesforce using Tooling API directly
     * @returns Array of Salesforce logs
     */
    private async _fetchSalesforceLogsToolingApi(): Promise<SalesforceLog[]> {
        console.log('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Starting to fetch logs via Tooling API');
        
        try {
            // Execute the query using the Tooling API
            const queryCmd = `sf data query -q "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200" --use-tooling-api --json`;
            console.log(`[VisbalLogView] _fetchSalesforceLogsToolingApi -- Executing query: ${queryCmd}`);
            
            const result = await this._executeCommand(queryCmd);
            const jsonResult = JSON.parse(result);
            
            if (!jsonResult.result || !jsonResult.result.records) {
                console.error('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Invalid query result:', jsonResult);
                throw new Error('Invalid query result from Tooling API');
            }
            
            const records = jsonResult.result.records;
            console.log(`[VisbalLogView] _fetchSalesforceLogsToolingApi -- Found ${records.length} logs`);
            
            // Map the records to our SalesforceLog interface
            const logs: SalesforceLog[] = records.map((record: any) => ({
                id: record.Id,
                logUser: {
                    name: record.LogUser?.Name || 'Unknown User'
                },
                application: record.Application || 'Unknown',
                operation: record.Operation || 'Unknown',
                request: record.Request || '',
                status: record.Status || 'Unknown',
                logLength: record.LogLength || 0,
                lastModifiedDate: record.LastModifiedDate || '',
                downloaded: false
            }));
            
            console.log(`[VisbalLogView] _fetchSalesforceLogsToolingApi -- Successfully mapped ${logs.length} logs`);
            return logs;
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Error:', error);
            
            // Try with old CLI format as fallback
            try {
                console.log('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Trying with old CLI format');
                const oldQueryCmd = `sfdx force:data:soql:query -q "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200" -t --json`;
                
                const oldResult = await this._executeCommand(oldQueryCmd);
                const oldJsonResult = JSON.parse(oldResult);
                
                if (!oldJsonResult.result || !oldJsonResult.result.records) {
                    console.error('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Invalid query result with old CLI format:', oldJsonResult);
                    throw new Error('Invalid query result from Tooling API with old CLI format');
                }
                
                const oldRecords = oldJsonResult.result.records;
                console.log(`[VisbalLogView] _fetchSalesforceLogsToolingApi -- Found ${oldRecords.length} logs with old CLI format`);
                
                // Map the records to our SalesforceLog interface
                const logs: SalesforceLog[] = oldRecords.map((record: any) => ({
                    id: record.Id,
                    logUser: {
                        name: record.LogUser?.Name || 'Unknown User'
                    },
                    application: record.Application || 'Unknown',
                    operation: record.Operation || 'Unknown',
                    request: record.Request || '',
                    status: record.Status || 'Unknown',
                    logLength: record.LogLength || 0,
                    lastModifiedDate: record.LastModifiedDate || '',
                    downloaded: false
                }));
                
                console.log(`[VisbalLogView] _fetchSalesforceLogsToolingApi -- Successfully mapped ${logs.length} logs with old CLI format`);
                return logs;
            } catch (oldError: any) {
                console.error('[VisbalLogView] _fetchSalesforceLogsToolingApi -- Error with old CLI format:', oldError);
                throw error; // Throw the original error
            }
        }
    }
}