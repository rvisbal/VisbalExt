import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FetchOperations } from './fetchOperations';

const execAsync = promisify(exec);

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

/**
 * Class containing all download operations for Salesforce logs
 */
export class DownloadOperations {
    private _isLoading: boolean = false;
    private _fetchOperations: FetchOperations;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _view?: vscode.WebviewView,
        private readonly _downloadedLogs: Set<string> = new Set<string>(),
        private readonly _downloadedLogPaths: Map<string, string> = new Map<string, string>()
    ) {
        this._fetchOperations = new FetchOperations(_context, _view, _downloadedLogs, _downloadedLogPaths);
    }

    /**
     * Downloads a log
     * @param logId The ID of the log to download
     */
    public async downloadLog(logId: string): Promise<void> {
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'downloading', logId, isDownloading: true });

            // Create a timestamp for the filename
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            
            // Get log details to include in the filename
            const logDetails = await this._getLogDetails(logId);
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
                console.log(`[DownloadOperations] Created or verified logs directory: ${logsDir}`);
            } catch (dirError) {
                console.error(`[DownloadOperations] Error creating logs directory: ${dirError}`);
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
            
            console.log(`[DownloadOperations] Downloading log ${logId} to ${targetFilePath}`);
            console.log(`[DownloadOperations] Target directory: ${logsDir}`);
            console.log(`[DownloadOperations] Log filename: ${logFilename}`);
            
            // Create a temporary file for the download
            const tempFile = path.join(os.tmpdir(), `sf_log_${Date.now()}.log`);
            
            let downloadSuccess = false;
            let logContent: string | null = null;
            
            // Try to get log content using different methods
            
            // Method 1: Direct CLI output to temp file (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log(`[DownloadOperations] Trying direct CLI output to temp file: ${tempFile}`);
                    const command = `sf apex get log -i ${logId} > "${tempFile}"`;
                    console.log(`[DownloadOperations] Executing command: ${command}`);
                    await this._executeCommand(command);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
                        console.log(`[DownloadOperations] Successfully wrote log to temp file: ${tempFile}`);
                        downloadSuccess = true;
                    } else {
                        console.log(`[DownloadOperations] Temp file not created or empty: ${tempFile}`);
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with direct CLI output (new format):', error);
                }
            }
            
            // Method 2: JSON output (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[DownloadOperations] Trying JSON output (new CLI format)');
                    const result = await this._executeCommand(`sf apex get log -i ${logId} --json`);
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult && jsonResult.result && jsonResult.result.log) {
                        console.log('[DownloadOperations] Successfully got log content from JSON output (new CLI format)');
                        logContent = jsonResult.result.log;
                        downloadSuccess = true;
                    } else {
                        console.log('[DownloadOperations] No log content found in JSON response (new CLI format)');
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with JSON output (new CLI format):', error);
                }
            }
            
            // Method 3: Direct CLI output to temp file (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log(`[DownloadOperations] Trying direct CLI output to temp file (old format): ${tempFile}`);
                    const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFile}"`;
                    console.log(`[DownloadOperations] Executing command: ${command}`);
                    await this._executeCommand(command);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
                        console.log(`[DownloadOperations] Successfully wrote log to temp file (old format): ${tempFile}`);
                        downloadSuccess = true;
                    } else {
                        console.log(`[DownloadOperations] Temp file not created or empty (old format): ${tempFile}`);
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with direct CLI output (old format):', error);
                }
            }
            
            // Method 4: JSON output (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[DownloadOperations] Trying JSON output (old CLI format)');
                    const result = await this._executeCommand(`sfdx force:apex:log:get --logid ${logId} --json`);
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult && jsonResult.result && jsonResult.result.log) {
                        console.log('[DownloadOperations] Successfully got log content from JSON output (old CLI format)');
                        logContent = jsonResult.result.log;
                        downloadSuccess = true;
                    } else {
                        console.log('[DownloadOperations] No log content found in JSON response (old CLI format)');
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with JSON output (old CLI format):', error);
                }
            }
            
            // Method 5: Direct CLI output without JSON (new CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[DownloadOperations] Trying direct CLI output without JSON (new CLI format)');
                    const { stdout } = await execAsync(`sf apex get log -i ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                    
                    if (stdout && stdout.trim().length > 0) {
                        console.log('[DownloadOperations] Successfully got log content from direct CLI output (new CLI format)');
                        logContent = stdout;
                        downloadSuccess = true;
                    } else {
                        console.log('[DownloadOperations] No log content found in direct CLI output (new CLI format)');
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with direct CLI output without JSON (new CLI format):', error);
                }
            }
            
            // Method 6: Direct CLI output without JSON (old CLI format)
            if (!downloadSuccess) {
                try {
                    console.log('[DownloadOperations] Trying direct CLI output without JSON (old CLI format)');
                    const { stdout } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                    
                    if (stdout && stdout.trim().length > 0) {
                        console.log('[DownloadOperations] Successfully got log content from direct CLI output (old CLI format)');
                        logContent = stdout;
                        downloadSuccess = true;
                    } else {
                        console.log('[DownloadOperations] No log content found in direct CLI output (old CLI format)');
                    }
                } catch (error) {
                    console.error('[DownloadOperations] Error with direct CLI output without JSON (old CLI format):', error);
                }
            }
            
            if (!downloadSuccess) {
                throw new Error('Failed to download log with all methods');
            }
            
            // IMPORTANT: Double-check that the target directory exists before writing the file
            // This is to ensure we're not trying to create a file in a non-existent directory
            if (!fs.existsSync(logsDir)) {
                console.log(`[DownloadOperations] Creating logs directory: ${logsDir}`);
                await fs.promises.mkdir(logsDir, { recursive: true });
            }
            
            // Log the exact path we're trying to write to
            console.log(`[DownloadOperations] Final target file path: ${targetFilePath}`);
            
            // Write the log content to the target file
            if (logContent) {
                // If we got log content directly, write it to the target file
                console.log(`[DownloadOperations] Writing log content to file: ${targetFilePath}`);
                await fs.promises.writeFile(targetFilePath, logContent);
            } else if (fs.existsSync(tempFile)) {
                // If we have a temp file, copy it to the target file
                console.log(`[DownloadOperations] Copying from ${tempFile} to ${targetFilePath}`);
                await fs.promises.copyFile(tempFile, targetFilePath);
                
                // Delete the temp file
                try {
                    await fs.promises.unlink(tempFile);
                    console.log(`[DownloadOperations] Deleted temp file: ${tempFile}`);
                } catch (error) {
                    console.log(`[DownloadOperations] Warning: Could not delete temp file: ${tempFile}`);
                }
            } else {
                throw new Error('No log content or temp file available');
            }
            
            // Verify the file exists
            if (!fs.existsSync(targetFilePath)) {
                throw new Error(`File was not created at ${targetFilePath}`);
            }
            
            console.log(`[DownloadOperations] Successfully downloaded log to: ${targetFilePath}`);
            
            // Store the downloaded log path
            this._downloadedLogPaths.set(logId, targetFilePath);
            
            // Mark the log as downloaded
            this._downloadedLogs.add(logId);
            
            // Save the downloaded logs
            this._saveDownloadedLogs();
            
            // Update the UI
            this._updateWebviewContent();
            
            vscode.window.showInformationMessage(`Log downloaded to ${targetFilePath}`);
            
            // Open the log file
            const document = await vscode.workspace.openTextDocument(targetFilePath);
            await vscode.window.showTextDocument(document);
            
        } catch (error: any) {
            console.error('[DownloadOperations] Error in downloadLog:', error);
            
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
     * Gets details for a specific log
     * @param logId The ID of the log to get details for
     * @returns The log details
     */
    private async _getLogDetails(logId: string): Promise<any> {
        try {
            // Try to get log details using the new command format first
            try {
                const command = `sf apex get log -i ${logId} --json`;
                console.log(`[DownloadOperations] _getLogDetails -- Executing: ${command}`);
                const result = await this._executeCommand(command);
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result) {
                    return {
                        operation: jsonResult.result.Operation || jsonResult.result.operation || 'unknown',
                        status: jsonResult.result.Status || jsonResult.result.status || 'unknown',
                        logLength: jsonResult.result.LogLength || jsonResult.result.logLength || 0
                    };
                }
            } catch (error) {
                console.log('[DownloadOperations] _getLogDetails -- Failed with new CLI format, trying old format', error);
            }
            
            // If the new command fails, try the old format
            try {
                const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                console.log(`[DownloadOperations] _getLogDetails -- Executing: ${command}`);
                const result = await this._executeCommand(command);
                const jsonResult = JSON.parse(result);
                
                if (jsonResult && jsonResult.result) {
                    return {
                        operation: jsonResult.result.Operation || jsonResult.result.operation || 'unknown',
                        status: jsonResult.result.Status || jsonResult.result.status || 'unknown',
                        logLength: jsonResult.result.LogLength || jsonResult.result.logLength || 0
                    };
                }
            } catch (error) {
                console.log('[DownloadOperations] _getLogDetails -- Failed with old CLI format', error);
            }
            
            // If both commands fail, return default values
            return {
                operation: 'unknown',
                status: 'unknown',
                logLength: 0
            };
        } catch (error) {
            console.error('[DownloadOperations] _getLogDetails -- Error getting log details:', error);
            return {
                operation: 'unknown',
                status: 'unknown',
                logLength: 0
            };
        }
    }

    /**
     * Executes a command and returns the output
     * @param command The command to execute
     * @returns The command output
     */
    private async _executeCommand(command: string): Promise<string> {
        return this._fetchOperations.executeCommand(command);
    }

    /**
     * Saves the list of downloaded logs to extension storage
     */
    private _saveDownloadedLogs(): void {
        console.log(`[DownloadOperations] _saveDownloadedLogs -- Saving ${this._downloadedLogs.size} downloaded logs to extension storage`);
        this._context.globalState.update('visbalDownloadedLogs', Array.from(this._downloadedLogs));
        
        // Save the paths of downloaded logs
        const downloadedLogPaths = Object.fromEntries(this._downloadedLogPaths.entries());
        this._context.globalState.update('visbalDownloadedLogPaths', downloadedLogPaths);
        console.log(`[DownloadOperations] _saveDownloadedLogs -- Saved ${this._downloadedLogPaths.size} log file paths`);
    }

    /**
     * Updates the webview content
     */
    private _updateWebviewContent(): void {
        if (!this._view) {
            return;
        }
        
        // Send a message to the webview to update the downloaded status
        this._view.webview.postMessage({
            command: 'updateDownloadedStatus',
            downloadedLogs: Array.from(this._downloadedLogs)
        });
    }
} 