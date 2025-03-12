import * as vscode from 'vscode';
import { getLogListTemplate, getHtmlForWebview } from './htmlTemplate';
import { styles } from './styles';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LogDetailView } from './logDetailView';

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

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionUri = _context.extensionUri;
        console.log('[VisbalLogView] constructor -- Initializing VisbalLogView');
        this._checkDownloadedLogs();
    }

    /**
     * Resolves the webview view
     * @param webviewView The webview view to resolve
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log('[VisbalLogView] resolveWebviewView -- Resolving webview view');
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set the HTML content
        webviewView.webview.html = this._getWebviewContent();
        console.log('[VisbalLogView] resolveWebviewView -- Webview HTML content set');

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log(`[VisbalLogView] resolveWebviewView -- Received message from webview: ${message.command}`, message);
            switch (message.command) {
                case 'fetchLogs':
                    console.log('[VisbalLogView] resolveWebviewView -- Fetching logs from command');
                    await this._fetchLogs();
                    break;
                case 'fetchLogsSoql':
                    console.log('[VisbalLogView] resolveWebviewView -- Fetching logs via SOQL from command');
                    await this._fetchLogsSoql();
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
            }
        });

        // Wait for the webview to be ready before fetching logs
        setTimeout(() => {
            if (webviewView.visible) {
                console.log('[VisbalLogView] resolveWebviewView -- View is visible, fetching logs after delay');
                this._fetchLogs();
            }
        }, 1000); // Add a small delay to ensure the webview is fully loaded

        // Fetch logs when the view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('[VisbalLogView] resolveWebviewView -- View became visible, fetching logs');
                this._fetchLogs();
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
            console.error('[VisbalLogView] Error in _downloadLog:', error);
            
            // Check for specific error types
            let errorMessage = `Failed to download log: ${error}`;
            
            // Check for buffer overflow or stack size exceeded errors
            if (error.message && (
                error.message.includes('Maximum call stack size exceeded') || 
                error.message.includes('maxBuffer exceeded') ||
                error.message.includes('buffer overflow')
            )) {
                errorMessage = 'The log file is too large to download through the extension. Please use the Salesforce CLI directly with the command:\n\n' +
                    `sf apex get log -i ${logId} > "your-filename.log"`;
            }
            
            vscode.window.showErrorMessage(errorMessage);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: false });
        }
    }

    /**
     * Fetches logs and updates the view
     */
    private async _fetchLogs(): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true });

            console.log('[VisbalLogView] Fetching logs with new CLI format...');
            try {
                const result = await this._executeCommand('sf apex list log --json');
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result && Array.isArray(jsonResult.result)) {
                    console.log(`[VisbalLogView] Found ${jsonResult.result.length} logs`);
                    
                    // Transform logs to the expected format
                    const transformedLogs = jsonResult.result.map((log: any) => {
                        // Log the raw log entry for debugging
                        console.log(`[VisbalLogView] Raw log entry: ${JSON.stringify(log)}`);
                        
                        return {
                            id: log.Id || log.id,
                            logUser: {
                                name: log.LogUser?.Name || log.LogUserName || 'Unknown User'
                            },
                            application: log.Application || log.application || 'Unknown',
                            operation: log.Operation || log.operation || 'Unknown',
                            request: log.Request || log.request || '',
                            status: log.Status || log.status || 'Unknown',
                            logLength: log.LogLength || log.logLength || 0,
                            lastModifiedDate: log.LastModifiedDate || log.lastModifiedDate || '',
                            startTime: log.StartTime || log.startTime || log.LastModifiedDate || log.lastModifiedDate || '',
                            downloaded: false // Will be updated later
                        };
                    });
                    
                    // Store the transformed logs
                    this._logs = transformedLogs;
                    
                    // Validate logs
                    const validatedLogs = transformedLogs.filter((log: any) => {
                        if (!log || typeof log !== 'object' || !log.id) {
                            console.error('[VisbalLogView] Invalid log entry after transformation:', log);
                            return false;
                        }
                        return true;
                    });
                    
                    console.log(`[VisbalLogView] Validated ${validatedLogs.length} of ${transformedLogs.length} logs`);
                    
                    // Send logs to webview with downloaded status
                    this._sendLogsToWebview(validatedLogs);
                } else {
                    console.error('[VisbalLogView] Invalid response format:', jsonResult);
                    throw new Error('Invalid response format');
                }
            } catch (error) {
                console.error('[VisbalLogView] Error fetching logs with new CLI format:', error);
                console.log('[VisbalLogView] Falling back to old CLI format...');
                
                try {
                    const result = await this._executeCommand('sfdx force:apex:log:list --json');
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult && jsonResult.result && Array.isArray(jsonResult.result)) {
                        console.log(`[VisbalLogView] Found ${jsonResult.result.length} logs with old CLI format`);
                        
                        // Transform logs to the expected format
                        const transformedLogs = jsonResult.result.map((log: any) => {
                            // Log the raw log entry for debugging
                            console.log(`[VisbalLogView] Raw log entry (old format): ${JSON.stringify(log)}`);
                            
                            return {
                                id: log.Id || log.id,
                                logUser: {
                                    name: log.LogUser?.Name || log.LogUserName || 'Unknown User'
                                },
                                application: log.Application || log.application || 'Unknown',
                                operation: log.Operation || log.operation || 'Unknown',
                                request: log.Request || log.request || '',
                                status: log.Status || log.status || 'Unknown',
                                logLength: log.LogLength || log.logLength || 0,
                                lastModifiedDate: log.LastModifiedDate || log.lastModifiedDate || '',
                                startTime: log.StartTime || log.startTime || log.LastModifiedDate || log.lastModifiedDate || '',
                                downloaded: false // Will be updated later
                            };
                        });
                        
                        // Store the transformed logs
                        this._logs = transformedLogs;
                        
                        // Validate logs
                        const validatedLogs = transformedLogs.filter((log: any) => {
                            if (!log || typeof log !== 'object' || !log.id) {
                                console.error('[VisbalLogView] Invalid log entry after transformation (old format):', log);
                                return false;
                            }
                            return true;
                        });
                        
                        console.log(`[VisbalLogView] Validated ${validatedLogs.length} of ${transformedLogs.length} logs`);
                        
                        // Send logs to webview with downloaded status
                        this._sendLogsToWebview(validatedLogs);
                    } else {
                        console.error('[VisbalLogView] Invalid response format from old CLI:', jsonResult);
                        throw new Error('Invalid response format from old CLI');
                    }
                } catch (oldCliError) {
                    console.error('[VisbalLogView] Error fetching logs with old CLI format:', oldCliError);
                    throw new Error('Failed to fetch logs with both CLI formats');
                }
            }
        } catch (error) {
            console.error('[VisbalLogView] Error in _fetchLogs:', error);
            vscode.window.showErrorMessage(`Failed to fetch logs: ${error}`);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'updateLogs',
                    logs: []
                });
            }
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
        }
    }

    /**
     * Fetches logs from Salesforce using SFDX CLI
     * @returns Array of Salesforce logs
     */
    private async _fetchSalesforceLogs(): Promise<SalesforceLog[]> {
        console.log('[VisbalLogView] _fetchSalesforceLogs -- Starting to fetch Salesforce logs');
        try {
            // Check if SFDX CLI is installed
            try {
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Checking if SFDX CLI is installed');
                const { stdout: versionOutput } = await execAsync('sfdx --version');
                console.log(`[VisbalLogView] _fetchSalesforceLogs -- SFDX CLI version: ${versionOutput.trim()}`);
            } catch (error) {
                console.error('[VisbalLogView] _fetchSalesforceLogs -- SFDX CLI not installed:', error);
                throw new Error('SFDX CLI is not installed. Please install it to use this feature.');
            }
            
            // Try to get the default org using the new command format first
            let orgData;
            console.log('[VisbalLogView] _fetchSalesforceLogs -- Trying to get default org with new CLI format');
            try {
                const { stdout: orgInfo } = await execAsync('sf org display --json');
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Successfully got org info with new CLI format');
                orgData = JSON.parse(orgInfo);
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Parsed org data:', orgData.result?.username);
            } catch (error) {
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const { stdout: orgInfo } = await execAsync('sfdx force:org:display --json');
                    console.log('[VisbalLogView] _fetchSalesforceLogs -- Successfully got org info with old CLI format');
                    orgData = JSON.parse(orgInfo);
                    console.log('[VisbalLogView] _fetchSalesforceLogs -- Parsed org data:', orgData.result?.username);
                } catch (innerError) {
                    console.error('[VisbalLogView] _fetchSalesforceLogs -- Failed to get org info with both formats:', innerError);
                    throw new Error('Failed to get default org information. Please ensure you have a default org set.');
                }
            }
            
            if (!orgData.result || !orgData.result.username) {
                console.error('[VisbalLogView] _fetchSalesforceLogs -- No username found in org data');
                throw new Error('No default Salesforce org found. Please set a default org using Salesforce CLI.');
            }
            
            console.log(`[VisbalLogView] _fetchSalesforceLogs -- Connected to org: ${orgData.result.username}`);
            
            // Try to fetch debug logs using the new command format first
            let logsResponse;
            console.log('[VisbalLogView] _fetchSalesforceLogs -- Trying to fetch logs with new CLI format');
            try {
                const { stdout: logsData } = await execAsync('sf apex list log --json');
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Successfully fetched logs with new CLI format');
                logsResponse = JSON.parse(logsData);
            } catch (error) {
                console.log('[VisbalLogView] _fetchSalesforceLogs -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    console.log('[VisbalLogView] _fetchSalesforceLogs -- Executing: sfdx force:apex:log:list --json --limit 200');
                    const { stdout: logsData } = await execAsync('sfdx force:apex:log:list --json --limit 200');
                    console.log('[VisbalLogView] _fetchSalesforceLogs -- Successfully fetched logs with old CLI format');
                    logsResponse = JSON.parse(logsData);
                } catch (innerError) {
                    console.error('[VisbalLogView] _fetchSalesforceLogs -- Failed to fetch logs with both formats:', innerError);
                    throw new Error('Failed to fetch logs. Please ensure your Salesforce CLI is properly configured.');
                }
            }
            
            if (!logsResponse.result || !Array.isArray(logsResponse.result)) {
                console.log('[VisbalLogView] _fetchSalesforceLogs -- No logs found in response:', logsResponse);
                return [];
            }
            
            console.log(`[VisbalLogView] _fetchSalesforceLogs -- Found ${logsResponse.result.length} debug logs`);
            
            // Format the logs
            console.log('[VisbalLogView] _fetchSalesforceLogs -- Formatting logs');
            const formattedLogs = logsResponse.result.map((log: any) => ({
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
            
            console.log(`[VisbalLogView] _fetchSalesforceLogs -- Returning ${formattedLogs.length} formatted logs`);
            return formattedLogs;
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchSalesforceLogs -- Error in _fetchSalesforceLogs:', error);
            throw error;
        }
    }

    /**
     * Fetches the content of a log
     * @param logId The ID of the log to fetch
     */
    private async _fetchLogContent(logId: string): Promise<string> {
        console.log(`[VisbalLogView] _fetchLogContent -- Starting to fetch content for log: ${logId}`);
        try {
            // First, check if we can directly output to a file to avoid buffer issues
            let targetDir: string;
            
            // Check if we have a workspace folder
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use the .sfdx/tools/debug/logs directory in the workspace
                targetDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.sfdx', 'tools', 'debug', 'logs');
            } else {
                // Use the user's home directory
                targetDir = path.join(os.homedir(), '.sfdx', 'tools', 'debug', 'logs');
            }
            
            // Create the directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                console.log(`[VisbalLogView] _fetchLogContent -- Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a temporary file path for direct output
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            // Format: id_operation_status_size_date.log with temp_ prefix
            const tempFilePath = path.join(targetDir, `temp_${sanitizedLogId}_${timestamp}.log`);
            
            console.log(`[VisbalLogView] _fetchLogContent -- Temp file path: ${tempFilePath}`);
            console.log(`[VisbalLogView] _fetchLogContent -- Target directory: ${targetDir}`);
            
            // Try direct file output first (most reliable for large logs)
            try {
                console.log(`[VisbalLogView] _fetchLogContent -- Trying direct file output to: ${tempFilePath}`);
                
                // Try with new CLI format first
                try {
                    const command = `sf apex get log -i ${logId} > "${tempFilePath}"`;
                    console.log(`[VisbalLogView] _fetchLogContent -- Executing direct output command: ${command}`);
                    await execAsync(command);
                    
                    // Check if the file was created and has content
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                        console.log(`[VisbalLogView] _fetchLogContent -- Successfully wrote log to file: ${tempFilePath}`);
                        const logContent = fs.readFileSync(tempFilePath, 'utf8');
                        
                        // Clean up the temporary file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            console.log(`[VisbalLogView] _fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                        }
                        
                        return logContent;
                    }
                } catch (directOutputError) {
                    console.log('[VisbalLogView] _fetchLogContent -- Direct output with new CLI format failed, trying old format', directOutputError);
                    
                    // Try with old CLI format
                    try {
                        const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFilePath}"`;
                        console.log(`[VisbalLogView] _fetchLogContent -- Executing direct output command with old format: ${command}`);
                        await execAsync(command);
                        
                        // Check if the file was created and has content
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                            console.log(`[VisbalLogView] _fetchLogContent -- Successfully wrote log to file with old format: ${tempFilePath}`);
                            const logContent = fs.readFileSync(tempFilePath, 'utf8');
                            
                            // Clean up the temporary file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                console.log(`[VisbalLogView] _fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                            }
                            
                            return logContent;
                        }
                    } catch (oldDirectOutputError) {
                        console.log('[VisbalLogView] _fetchLogContent -- Direct output with old CLI format failed', oldDirectOutputError);
                    }
                }
            } catch (error) {
                console.log('[VisbalLogView] _fetchLogContent -- Direct file output approach failed, falling back to standard methods', error);
            }
            
            // If direct file output failed, try the standard methods with increased buffer size
            
            // Try to fetch the log using the new command format first
            let log;
            console.log('[VisbalLogView] _fetchLogContent -- Trying to fetch log content with new CLI format');
            try {
                const command = `sf apex get log -i ${logId} --json`;
                console.log(`[VisbalLogView] _fetchLogContent -- Executing: ${command}`);
                const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with new CLI format');
                log = JSON.parse(logData);
                
                // Debug the response structure
                console.log(`[VisbalLogView] _fetchLogContent -- Response structure: ${JSON.stringify(Object.keys(log))}`);
                if (log.result) {
                    console.log(`[VisbalLogView] _fetchLogContent -- Result structure: ${typeof log.result} ${Array.isArray(log.result) ? 'array' : 'not array'}`);
                    if (Array.isArray(log.result) && log.result.length > 0) {
                        console.log(`[VisbalLogView] _fetchLogContent -- First result item keys: ${JSON.stringify(Object.keys(log.result[0]))}`);
                    }
                }
                
                // Handle different response formats
                if (log.result) {
                    if (typeof log.result === 'string') {
                        // Direct log content as string
                        console.log('[VisbalLogView] _fetchLogContent -- Found log content as string in result');
                        return log.result;
                    } else if (typeof log.result.log === 'string') {
                        // Log content in result.log
                        console.log('[VisbalLogView] _fetchLogContent -- Found log content in result.log');
                        return log.result.log;
                    } else if (Array.isArray(log.result) && log.result.length > 0) {
                        // Array result format
                        const firstResult = log.result[0];
                        
                        // Check for common properties that might contain the log
                        if (firstResult.log) {
                            console.log('[VisbalLogView] _fetchLogContent -- Found log content in result[0].log');
                            return firstResult.log;
                        } else if (firstResult.body) {
                            console.log('[VisbalLogView] _fetchLogContent -- Found log content in result[0].body');
                            return firstResult.body;
                        } else if (firstResult.content) {
                            console.log('[VisbalLogView] _fetchLogContent -- Found log content in result[0].content');
                            return firstResult.content;
                        } else if (firstResult.text) {
                            console.log('[VisbalLogView] _fetchLogContent -- Found log content in result[0].text');
                            return firstResult.text;
                        } else {
                            // If we can't find a specific property, try to stringify the first result
                            console.log('[VisbalLogView] _fetchLogContent -- No specific log property found, using entire result object');
                            return JSON.stringify(firstResult, null, 2);
                        }
                    }
                }
                
                // If we couldn't find the log content in the expected places, try direct CLI output
                console.log('[VisbalLogView] _fetchLogContent -- Could not find log content in JSON response, trying direct CLI output');
                throw new Error('Log content not found in expected format');
            } catch (error) {
                console.log('[VisbalLogView] _fetchLogContent -- Failed with new CLI format or parsing, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                    console.log(`[VisbalLogView] _fetchLogContent -- Executing: ${command}`);
                    const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                    console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with old CLI format');
                    log = JSON.parse(logData);
                    
                    // Debug the response structure
                    console.log(`[VisbalLogView] _fetchLogContent -- Old format response structure: ${JSON.stringify(Object.keys(log))}`);
                    
                    if (log.result && log.result.log) {
                        console.log(`[VisbalLogView] _fetchLogContent -- Found log content in old format result.log`);
                        return log.result.log;
                    } else {
                        console.error('[VisbalLogView] _fetchLogContent -- Log not found in old format response:', log);
                        throw new Error('Log content not found in old format response');
                    }
                } catch (innerError) {
                    console.error('[VisbalLogView] _fetchLogContent -- Failed to fetch log content with both formats:', innerError);
                    
                    // Try one more approach - direct CLI output without JSON
                    try {
                        console.log('[VisbalLogView] _fetchLogContent -- Trying direct CLI output without JSON');
                        const { stdout: directOutput } = await execAsync(`sf apex get log -i ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                        console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output');
                        if (directOutput && directOutput.trim().length > 0) {
                            return directOutput;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError) {
                        try {
                            console.log('[VisbalLogView] _fetchLogContent -- Trying direct CLI output with old format');
                            const { stdout: oldDirectOutput } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                            console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output (old format)');
                            if (oldDirectOutput && oldDirectOutput.trim().length > 0) {
                                return oldDirectOutput;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError) {
                            console.error('[VisbalLogView] _fetchLogContent -- All attempts to fetch log content failed');
                            throw new Error('Failed to fetch log content. The log may be too large to download. Please try using the Salesforce CLI directly.');
                        }
                    }
                }
            }
            
            // This should not be reached due to the throws above, but just in case
            console.error('[VisbalLogView] _fetchLogContent -- No log content found in any format');
            throw new Error('Log content not found in any format');
        } catch (error: any) {
            console.error(`[VisbalLogView] _fetchLogContent -- Error fetching log with ID ${logId}:`, error);
            throw error;
        }
    }

    /**
     * Checks for previously downloaded logs
     */
    private _checkDownloadedLogs(): void {
        console.log('[VisbalLogView] _checkDownloadedLogs -- Checking for previously downloaded logs');
        const downloadedLogs = this._context.globalState.get<string[]>('visbalDownloadedLogs', []);
        this._downloadedLogs = new Set<string>(downloadedLogs);
        
        // Load the paths of downloaded logs
        const downloadedLogPaths = this._context.globalState.get<Record<string, string>>('visbalDownloadedLogPaths', {});
        this._downloadedLogPaths = new Map<string, string>(Object.entries(downloadedLogPaths));
        
        console.log(`[VisbalLogView] _checkDownloadedLogs -- Found ${this._downloadedLogs.size} previously downloaded logs`);
        console.log(`[VisbalLogView] _checkDownloadedLogs -- Found ${this._downloadedLogPaths.size} log file paths`);
        
        // Verify that the files still exist
        for (const [logId, filePath] of this._downloadedLogPaths.entries()) {
            if (!fs.existsSync(filePath)) {
                console.log(`[VisbalLogView] _checkDownloadedLogs -- File not found for log ${logId}: ${filePath}`);
                this._downloadedLogPaths.delete(logId);
            } else {
                console.log(`[VisbalLogView] _checkDownloadedLogs -- Found file for log ${logId}: ${filePath}`);
            }
        }
        
        // Save the updated paths
        this._saveDownloadedLogs();
    }

    /**
     * Saves the list of downloaded logs to extension storage
     */
    private _saveDownloadedLogs(): void {
        console.log(`[VisbalLogView] _saveDownloadedLogs -- Saving ${this._downloadedLogs.size} downloaded logs to extension storage`);
        this._context.globalState.update('visbalDownloadedLogs', Array.from(this._downloadedLogs));
        
        // Save the paths of downloaded logs
        const downloadedLogPaths = Object.fromEntries(this._downloadedLogPaths.entries());
        this._context.globalState.update('visbalDownloadedLogPaths', downloadedLogPaths);
        console.log(`[VisbalLogView] _saveDownloadedLogs -- Saved ${this._downloadedLogPaths.size} log file paths`);
    }

    /**
     * Gets the HTML for the webview
     */
    private _getWebviewContent(): string {
        console.log('[VisbalLogView] _getWebviewContent -- Getting HTML content for webview');
        // Use the new HTML template with the webview parameter
        const html = getHtmlForWebview(this._extensionUri, this._view!.webview);
        console.log('[VisbalLogView] _getWebviewContent -- HTML content length:', html.length);
        return html;
    }

    /**
     * Refreshes the logs in the view
     */
    public refresh(): void {
        console.log('[VisbalLogView] refresh -- Method called');
        this._fetchLogs();
    }

    /**
     * Fetches logs using SOQL query and updates the view
     */
    private async _fetchLogsSoql(): Promise<void> {
        console.log('[VisbalLogView] _fetchLogsSoql -- Starting to fetch logs via SOQL');
        if (!this._view || this._isLoading) {
            console.log('[VisbalLogView] _fetchLogsSoql -- View not available or already loading, skipping fetch');
            return;
        }

        // Set loading flag
        this._isLoading = true;
        console.log('[VisbalLogView] _fetchLogsSoql -- Set loading flag to true');

        // Show loading state
        console.log('[VisbalLogView] _fetchLogsSoql -- Sending loading state to webview');
        this._view.webview.postMessage({ command: 'loading', loading: true });

        try {
            // Fetch logs from Salesforce using SOQL
            console.log('[VisbalLogView] _fetchLogsSoql -- Calling _fetchSalesforceLogsSoql');
            const logs = await this._fetchSalesforceLogsSoql();
            console.log(`[VisbalLogView] _fetchLogsSoql -- Received ${logs.length} logs from Salesforce via SOQL`);
            
            // Update download status
            console.log('[VisbalLogView] _fetchLogsSoql -- Updating download status for logs');
            logs.forEach(log => {
                log.downloaded = this._downloadedLogs.has(log.id);
                
                // Check if we have a local file for this log
                const localFilePath = this._downloadedLogPaths.get(log.id);
                if (localFilePath && fs.existsSync(localFilePath)) {
                    log.localFilePath = localFilePath;
                    console.log(`[VisbalLogView] _fetchLogsSoql -- Log ${log.id} has local file: ${localFilePath}`);
                }
                
                if (log.downloaded) {
                    console.log(`[VisbalLogView] _fetchLogsSoql -- Log ${log.id} is marked as downloaded`);
                }
            });

            // Send logs to the webview
            console.log('[VisbalLogView] _fetchLogsSoql -- Sending logs to webview');
            console.log(`[VisbalLogView] _fetchLogsSoql -- Logs data structure: ${JSON.stringify(logs.slice(0, 2))}`); // Log sample of logs
            
            // Validate logs before sending
            if (!logs || !Array.isArray(logs)) {
                console.error('[VisbalLogView] _fetchLogsSoql -- Invalid logs array:', logs);
                throw new Error('Invalid logs data structure');
            }
            
            // Ensure all logs have the required properties
            const validatedLogs = logs.filter(log => {
                if (!log || typeof log !== 'object' || !log.id) {
                    console.error('[VisbalLogView] _fetchLogsSoql -- Invalid log entry:', log);
                    return false;
                }
                return true;
            });
            
            console.log(`[VisbalLogView] _fetchLogsSoql -- Validated ${validatedLogs.length} of ${logs.length} logs`);
            
            // Send the validated logs to the webview
            this._view?.webview.postMessage({ 
                command: 'updateLogs', 
                logs: validatedLogs 
            });
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchLogsSoql -- Error fetching logs via SOQL:', error);
            
            // Format a more user-friendly error message
            let errorMessage = `Error fetching logs via SOQL: ${error.message}`;
            console.log(`[VisbalLogView] _fetchLogsSoql -- Error message: ${errorMessage}`);
            
            // Add helpful suggestions based on the error
            if (error.message.includes('SFDX CLI is not installed')) {
                console.log('[VisbalLogView] _fetchLogsSoql -- Adding CLI installation suggestion');
                errorMessage += '\n\nPlease install the Salesforce CLI from https://developer.salesforce.com/tools/sfdxcli';
            } else if (error.message.includes('No default Salesforce org found')) {
                console.log('[VisbalLogView] _fetchLogsSoql -- Adding default org suggestion');
                errorMessage += '\n\nPlease set a default org using one of these commands:\n- sf org login web\n- sfdx force:auth:web:login --setdefaultusername';
            } else if (error.message.includes('Command failed')) {
                // For general command failures, suggest updating the CLI
                console.log('[VisbalLogView] _fetchLogsSoql -- Adding CLI update suggestion');
                errorMessage += '\n\nTry updating your Salesforce CLI with one of these commands:\n- npm update -g @salesforce/cli\n- sfdx update';
            }
            
            // Send error to webview
            console.log('[VisbalLogView] _fetchLogsSoql -- Sending error to webview');
            this._view?.webview.postMessage({ 
                command: 'error', 
                error: errorMessage
            });
        } finally {
            // Clear loading flag
            this._isLoading = false;
            console.log('[VisbalLogView] _fetchLogsSoql -- Set loading flag to false');
            
            // Hide loading state
            console.log('[VisbalLogView] _fetchLogsSoql -- Sending loading:false to webview');
            this._view?.webview.postMessage({ command: 'loading', loading: false });
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
            
            // SOQL query to fetch debug logs
            const soqlQuery = "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200";
            console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- SOQL query: ${soqlQuery}`);
            
            // Try to execute SOQL query using the new command format first
            let queryResult;
            console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Trying to execute SOQL query with new CLI format');
            try {
                const command = `sf data query -q "${soqlQuery}" --json`;
                console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Executing: ${command}`);
                const { stdout: queryData } = await execAsync(command);
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully executed SOQL query with new CLI format');
                queryResult = JSON.parse(queryData);
            } catch (error) {
                console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:data:soql:query -q "${soqlQuery}" --json`;
                    console.log(`[VisbalLogView] _fetchSalesforceLogsSoql -- Executing: ${command}`);
                    const { stdout: queryData } = await execAsync(command);
                    console.log('[VisbalLogView] _fetchSalesforceLogsSoql -- Successfully executed SOQL query with old CLI format');
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
            
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: logsWithDownloadStatus
            });
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
}