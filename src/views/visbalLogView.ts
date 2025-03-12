import * as vscode from 'vscode';
import { getLogListTemplate } from './htmlTemplate';
import { styles } from './styles';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
                
                // Open the file in the editor
                const fileUri = vscode.Uri.file(localFilePath);
                console.log(`[VisbalLogView] _openLog -- Opening local file in editor: ${fileUri.fsPath}`);
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document);
                
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
            const tempFile = path.join(os.tmpdir(), `sf_log_${logId}.log`);
            console.log(`[VisbalLogView] _openLog -- Creating temporary file: ${tempFile}`);
            fs.writeFileSync(tempFile, logContent);

            // Open the file in the editor
            const fileUri = vscode.Uri.file(tempFile);
            console.log(`[VisbalLogView] _openLog -- Opening file in editor: ${fileUri.fsPath}`);
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);

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
        if (!this._view) {
            console.log('[VisbalLogView] _downloadLog -- View is not available, cannot download log');
            return;
        }

        try {
            // Show loading state
            console.log('[VisbalLogView] _downloadLog -- Sending downloading status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloading' 
            });

            // Fetch the log content using CLI
            console.log(`[VisbalLogView] _downloadLog -- Fetching content for log: ${logId}`);
            const logContent = await this._fetchLogContent(logId);
            console.log(`[VisbalLogView] _downloadLog -- Received log content, length: ${logContent.length} characters`);

            // Create a file in the .sfdx/tools/debug/logs directory
            let targetDir: string;
            let targetFile: string;
            
            // Check if we have a workspace folder
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use the .sfdx/tools/debug/logs directory in the workspace
                targetDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.sfdx', 'tools', 'debug', 'logs');
                console.log(`[VisbalLogView] _downloadLog -- Using .sfdx directory: ${targetDir}`);
            } else {
                // Use the user's home directory
                targetDir = path.join(os.homedir(), '.sfdx', 'tools', 'debug', 'logs');
                console.log(`[VisbalLogView] _downloadLog -- Using home .sfdx directory: ${targetDir}`);
            }
            
            // Create the directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                console.log(`[VisbalLogView] _downloadLog -- Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a filename with timestamp
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const filename = `log_${logId}_${timestamp}.log`;
            targetFile = path.join(targetDir, filename);
            
            // Write the log content to the file
            console.log(`[VisbalLogView] _downloadLog -- Writing log to file: ${targetFile}`);
            fs.writeFileSync(targetFile, logContent);
            console.log('[VisbalLogView] _downloadLog -- Log file written successfully');

            // Mark as downloaded and store the file path
            this._downloadedLogs.add(logId);
            this._downloadedLogPaths.set(logId, targetFile);
            this._saveDownloadedLogs();
            console.log(`[VisbalLogView] _downloadLog -- Added log ${logId} to downloaded logs with path: ${targetFile}`);

            // Open the file in the editor
            const fileUri = vscode.Uri.file(targetFile);
            console.log(`[VisbalLogView] _downloadLog -- Opening file in editor: ${fileUri.fsPath}`);
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);

            // Show success message
            vscode.window.showInformationMessage(`Log downloaded and opened: ${targetFile}`);
            console.log('[VisbalLogView] _downloadLog -- Showed success message to user');
            
            // Update download status in the view
            console.log('[VisbalLogView] _downloadLog -- Sending downloaded status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'downloaded',
                filePath: targetFile
            });
        } catch (error: any) {
            console.error(`[VisbalLogView] _downloadLog -- Error downloading log ${logId}:`, error);
            
            // Show error message
            vscode.window.showErrorMessage(`Failed to download log: ${error.message}`);
            
            // Update download status in the view
            console.log('[VisbalLogView] _downloadLog -- Sending error status to webview');
            this._view.webview.postMessage({ 
                command: 'downloadStatus', 
                logId: logId, 
                status: 'error',
                error: error.message
            });
        }
    }

    /**
     * Fetches logs and updates the view
     */
    private async _fetchLogs(): Promise<void> {
        console.log('[VisbalLogView] _fetchLogs -- Starting to fetch logs');
        if (!this._view || this._isLoading) {
            console.log('[VisbalLogView] _fetchLogs -- View not available or already loading, skipping fetch');
            return;
        }

        // Set loading flag
        this._isLoading = true;
        console.log('[VisbalLogView] _fetchLogs -- Set loading flag to true');

        // Show loading state
        console.log('[VisbalLogView] _fetchLogs -- Sending loading state to webview');
        this._view.webview.postMessage({ command: 'loading', loading: true });

        try {
            // Fetch logs from Salesforce
            console.log('[VisbalLogView] _fetchLogs -- Calling _fetchSalesforceLogs');
            const logs = await this._fetchSalesforceLogs();
            console.log(`[VisbalLogView] _fetchLogs -- Received ${logs.length} logs from Salesforce`);
            
            // Update download status and check for local files
            console.log('[VisbalLogView] _fetchLogs -- Updating download status for logs');
            logs.forEach(log => {
                log.downloaded = this._downloadedLogs.has(log.id);
                
                // Check if we have a local file for this log
                const localFilePath = this._downloadedLogPaths.get(log.id);
                if (localFilePath && fs.existsSync(localFilePath)) {
                    log.localFilePath = localFilePath;
                    console.log(`[VisbalLogView] _fetchLogs -- Log ${log.id} has local file: ${localFilePath}`);
                }
                
                if (log.downloaded) {
                    console.log(`[VisbalLogView] _fetchLogs -- Log ${log.id} is marked as downloaded`);
                }
            });

            // Send logs to the webview
            console.log('[VisbalLogView] _fetchLogs -- Sending logs to webview');
            console.log(`[VisbalLogView] _fetchLogs -- Logs data structure: ${JSON.stringify(logs.slice(0, 2))}`); // Log sample of logs
            
            // Validate logs before sending
            if (!logs || !Array.isArray(logs)) {
                console.error('[VisbalLogView] _fetchLogs -- Invalid logs array:', logs);
                throw new Error('Invalid logs data structure');
            }
            
            // Ensure all logs have the required properties
            const validatedLogs = logs.filter(log => {
                if (!log || typeof log !== 'object' || !log.id) {
                    console.error('[VisbalLogView] _fetchLogs -- Invalid log entry:', log);
                    return false;
                }
                return true;
            });
            
            console.log(`[VisbalLogView] _fetchLogs -- Validated ${validatedLogs.length} of ${logs.length} logs`);
            
            // Check if we have any valid logs
            if (validatedLogs.length === 0) {
                console.error('[VisbalLogView] _fetchLogs -- No valid logs found after validation');
                throw new Error('No valid logs found after validation');
            }
            
            // Send the validated logs to the webview
            console.log('[VisbalLogView] _fetchLogs -- Posting message to webview with logs');
            await this._view?.webview.postMessage({ 
                command: 'updateLogs', 
                logs: validatedLogs 
            });
            console.log('[VisbalLogView] _fetchLogs -- Message posted to webview');
            
            // Send a test message to verify webview communication
            console.log('[VisbalLogView] _fetchLogs -- Sending test error message to webview');
            await this._view?.webview.postMessage({ 
                command: 'error', 
                error: `Test message: ${validatedLogs.length} logs sent to webview` 
            });
            console.log('[VisbalLogView] _fetchLogs -- Test message sent');
        } catch (error: any) {
            console.error('[VisbalLogView] _fetchLogs -- Error fetching logs:', error);
            
            // Format a more user-friendly error message
            let errorMessage = `Error fetching logs: ${error.message}`;
            console.log(`[VisbalLogView] _fetchLogs -- Error message: ${errorMessage}`);
            
            // Add helpful suggestions based on the error
            if (error.message.includes('SFDX CLI is not installed')) {
                console.log('[VisbalLogView] _fetchLogs -- Adding CLI installation suggestion');
                errorMessage += '\n\nPlease install the Salesforce CLI from https://developer.salesforce.com/tools/sfdxcli';
            } else if (error.message.includes('No default Salesforce org found')) {
                console.log('[VisbalLogView] _fetchLogs -- Adding default org suggestion');
                errorMessage += '\n\nPlease set a default org using one of these commands:\n- sf org login web\n- sfdx force:auth:web:login --setdefaultusername';
            } else if (error.message.includes('Command failed')) {
                // For general command failures, suggest updating the CLI
                console.log('[VisbalLogView] _fetchLogs -- Adding CLI update suggestion');
                errorMessage += '\n\nTry updating your Salesforce CLI with one of these commands:\n- npm update -g @salesforce/cli\n- sfdx update';
            }
            
            // Send error to webview
            console.log('[VisbalLogView] _fetchLogs -- Sending error to webview');
            this._view?.webview.postMessage({ 
                command: 'error', 
                error: errorMessage
            });
        } finally {
            // Clear loading flag
            this._isLoading = false;
            console.log('[VisbalLogView] _fetchLogs -- Set loading flag to false');
            
            // Hide loading state
            console.log('[VisbalLogView] _fetchLogs -- Sending loading:false to webview');
            this._view?.webview.postMessage({ command: 'loading', loading: false });
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
            // Try to fetch the log using the new command format first
            let log;
            console.log('[VisbalLogView] _fetchLogContent -- Trying to fetch log content with new CLI format');
            try {
                const command = `sf apex get log -i ${logId} --json`;
                console.log(`[VisbalLogView] _fetchLogContent -- Executing: ${command}`);
                const { stdout: logData } = await execAsync(command);
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
                    const { stdout: logData } = await execAsync(command);
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
                        const { stdout: directOutput } = await execAsync(`sf apex get log -i ${logId}`);
                        console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output');
                        if (directOutput && directOutput.trim().length > 0) {
                            return directOutput;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError) {
                        try {
                            console.log('[VisbalLogView] _fetchLogContent -- Trying direct CLI output with old format');
                            const { stdout: oldDirectOutput } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`);
                            console.log('[VisbalLogView] _fetchLogContent -- Successfully fetched log content with direct CLI output (old format)');
                            if (oldDirectOutput && oldDirectOutput.trim().length > 0) {
                                return oldDirectOutput;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError) {
                            console.error('[VisbalLogView] _fetchLogContent -- All attempts to fetch log content failed');
                            throw new Error('Failed to fetch log content. Please ensure your Salesforce CLI is properly configured.');
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
        const html = getLogListTemplate();
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
}