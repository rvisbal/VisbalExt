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
 * Class containing all delete operations for Salesforce logs
 */
export class DeleteOperations {
    private _isLoading: boolean = false;
    private _fetchOperations: FetchOperations;
    private _backgroundProcesses: Map<string, string> = new Map<string, string>();

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _view?: vscode.WebviewView,
        private readonly _downloadedLogs: Set<string> = new Set<string>(),
        private readonly _downloadedLogPaths: Map<string, string> = new Map<string, string>()
    ) {
        this._fetchOperations = new FetchOperations(_context, _view, _downloadedLogs, _downloadedLogPaths);
    }

    /**
     * Deletes a log by ID
     * @param logId The ID of the log to delete
     */
    public async deleteLog(logId: string): Promise<void> {
        try {
            // Show confirmation dialog
            const result = await vscode.window.showWarningMessage(
                `Are you sure you want to delete log ${logId}?`,
                { modal: true },
                'Yes',
                'No'
            );
            
            if (result !== 'Yes') {
                console.log(`[DeleteOperations] deleteLog -- User cancelled deletion of log ${logId}`);
                return;
            }
            
            console.log(`[DeleteOperations] deleteLog -- Deleting log ${logId}`);
            
            // Check if we have a local copy of the log
            const localFilePath = this._downloadedLogPaths.get(logId);
            if (localFilePath && fs.existsSync(localFilePath)) {
                try {
                    // Delete the local file
                    console.log(`[DeleteOperations] deleteLog -- Deleting local file: ${localFilePath}`);
                    fs.unlinkSync(localFilePath);
                    
                    // Remove from downloaded logs
                    this._downloadedLogs.delete(logId);
                    this._downloadedLogPaths.delete(logId);
                    
                    // Save the updated lists
                    this._saveDownloadedLogs();
                    
                    console.log(`[DeleteOperations] deleteLog -- Successfully deleted local file for log ${logId}`);
                } catch (error) {
                    console.error(`[DeleteOperations] deleteLog -- Error deleting local file for log ${logId}:`, error);
                    vscode.window.showErrorMessage(`Failed to delete local file: ${error}`);
                }
            }
            
            // Delete the log from the server
            try {
                console.log(`[DeleteOperations] deleteLog -- Deleting log ${logId} from server`);
                
                // Try with new CLI format first
                try {
                    const command = `sf apex delete log -i ${logId} --json`;
                    console.log(`[DeleteOperations] deleteLog -- Executing: ${command}`);
                    const result = await this._executeCommand(command);
                    console.log(`[DeleteOperations] deleteLog -- Result: ${result}`);
                    
                    // Check if the deletion was successful
                    const jsonResult = JSON.parse(result);
                    if (jsonResult.status === 0) {
                        console.log(`[DeleteOperations] deleteLog -- Successfully deleted log ${logId} from server with new CLI format`);
                    } else {
                        throw new Error(`Failed to delete log: ${jsonResult.message}`);
                    }
                } catch (error) {
                    console.log('[DeleteOperations] deleteLog -- Failed with new CLI format, trying old format', error);
                    
                    // If the new command fails, try the old format
                    const command = `sfdx force:apex:log:delete -i ${logId} --json`;
                    console.log(`[DeleteOperations] deleteLog -- Executing: ${command}`);
                    const result = await this._executeCommand(command);
                    console.log(`[DeleteOperations] deleteLog -- Result: ${result}`);
                    
                    // Check if the deletion was successful
                    const jsonResult = JSON.parse(result);
                    if (jsonResult.status === 0) {
                        console.log(`[DeleteOperations] deleteLog -- Successfully deleted log ${logId} from server with old CLI format`);
                    } else {
                        throw new Error(`Failed to delete log: ${jsonResult.message}`);
                    }
                }
                
                vscode.window.showInformationMessage(`Successfully deleted log ${logId}`);
                
                // Update the UI
                this._updateWebviewContent();
            } catch (error) {
                console.error(`[DeleteOperations] deleteLog -- Error deleting log ${logId} from server:`, error);
                vscode.window.showErrorMessage(`Failed to delete log from server: ${error}`);
            }
        } catch (error) {
            console.error(`[DeleteOperations] deleteLog -- Error in deleteLog for log ${logId}:`, error);
            vscode.window.showErrorMessage(`Failed to delete log: ${error}`);
        }
    }

    /**
     * Deletes all logs
     */
    public async deleteAllLogs(): Promise<void> {
        try {
            // Show confirmation dialog
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to delete ALL logs? This will delete logs from both your local machine and the Salesforce server.',
                { modal: true },
                'Yes',
                'No'
            );
            
            if (result !== 'Yes') {
                console.log('[DeleteOperations] deleteAllLogs -- User cancelled deletion of all logs');
                return;
            }
            
            console.log('[DeleteOperations] deleteAllLogs -- Deleting all logs');
            
            // Delete local logs
            await this._clearLocalLogs();
            
            // Delete server logs
            await this._deleteServerLogs();
            
            vscode.window.showInformationMessage('Successfully deleted all logs');
            
            // Update the UI
            this._updateWebviewContent();
        } catch (error) {
            console.error('[DeleteOperations] deleteAllLogs -- Error in deleteAllLogs:', error);
            vscode.window.showErrorMessage(`Failed to delete all logs: ${error}`);
        }
    }

    /**
     * Clears all local log files
     */
    private async _clearLocalLogs(): Promise<void> {
        const processId = 'clear-local-logs';
        this._addBackgroundProcess(processId, 'Clearing local logs');
        
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Clearing local logs...' });
            
            // Show confirmation dialog
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all local log files?',
                { modal: true },
                'Yes',
                'No'
            );
            
            if (result !== 'Yes') {
                console.log('[DeleteOperations] _clearLocalLogs -- User cancelled clearing local logs');
                return;
            }
            
            console.log('[DeleteOperations] _clearLocalLogs -- Clearing local logs');
            
            // Get all downloaded log paths
            const logPaths = Array.from(this._downloadedLogPaths.values());
            console.log(`[DeleteOperations] _clearLocalLogs -- Found ${logPaths.length} local log files to delete`);
            
            // Delete each log file
            let deletedCount = 0;
            for (const logPath of logPaths) {
                try {
                    if (fs.existsSync(logPath)) {
                        console.log(`[DeleteOperations] _clearLocalLogs -- Deleting file: ${logPath}`);
                        fs.unlinkSync(logPath);
                        deletedCount++;
                    } else {
                        console.log(`[DeleteOperations] _clearLocalLogs -- File not found: ${logPath}`);
                    }
                } catch (error) {
                    console.error(`[DeleteOperations] _clearLocalLogs -- Error deleting file ${logPath}:`, error);
                }
            }
            
            // Clear the downloaded logs sets
            this._downloadedLogs.clear();
            this._downloadedLogPaths.clear();
            
            // Save the updated lists
            this._saveDownloadedLogs();
            
            console.log(`[DeleteOperations] _clearLocalLogs -- Successfully deleted ${deletedCount} local log files`);
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} local log files`);
            
            // Update the UI
            this._updateWebviewContent();
        } catch (error) {
            console.error('[DeleteOperations] _clearLocalLogs -- Error clearing local logs:', error);
            vscode.window.showErrorMessage(`Failed to clear local logs: ${error}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Deletes all logs from the Salesforce server
     */
    private async _deleteServerLogs(): Promise<void> {
        const processId = 'delete-server-logs';
        this._addBackgroundProcess(processId, 'Deleting logs');
        
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting server logs...' });
            
            // Show confirmation dialog
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all logs from the Salesforce server?',
                { modal: true },
                'Yes',
                'No'
            );
            
            if (result !== 'Yes') {
                console.log('[DeleteOperations] _deleteServerLogs -- User cancelled deleting server logs');
                return;
            }
            
            console.log('[DeleteOperations] _deleteServerLogs -- Deleting all logs from server');
            
            // Try with new CLI format first
            try {
                const command = `sf apex delete log --all --json`;
                console.log(`[DeleteOperations] _deleteServerLogs -- Executing: ${command}`);
                const result = await this._executeCommand(command);
                console.log(`[DeleteOperations] _deleteServerLogs -- Result: ${result}`);
                
                // Check if the deletion was successful
                const jsonResult = JSON.parse(result);
                if (jsonResult.status === 0) {
                    console.log('[DeleteOperations] _deleteServerLogs -- Successfully deleted all logs from server with new CLI format');
                    vscode.window.showInformationMessage('Successfully deleted all logs from server');
                } else {
                    throw new Error(`Failed to delete logs: ${jsonResult.message}`);
                }
            } catch (error) {
                console.log('[DeleteOperations] _deleteServerLogs -- Failed with new CLI format, trying old format', error);
                
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:delete --all --json`;
                    console.log(`[DeleteOperations] _deleteServerLogs -- Executing: ${command}`);
                    const result = await this._executeCommand(command);
                    console.log(`[DeleteOperations] _deleteServerLogs -- Result: ${result}`);
                    
                    // Check if the deletion was successful
                    const jsonResult = JSON.parse(result);
                    if (jsonResult.status === 0) {
                        console.log('[DeleteOperations] _deleteServerLogs -- Successfully deleted all logs from server with old CLI format');
                        vscode.window.showInformationMessage('Successfully deleted all logs from server');
                    } else {
                        throw new Error(`Failed to delete logs: ${jsonResult.message}`);
                    }
                } catch (innerError) {
                    console.error('[DeleteOperations] _deleteServerLogs -- Failed to delete logs with both formats:', innerError);
                    
                    // Try the faster method using Tooling API
                    try {
                        console.log('[DeleteOperations] _deleteServerLogs -- Trying faster method with Tooling API');
                        await this._deleteServerLogsFast();
                    } catch (toolingError) {
                        console.error('[DeleteOperations] _deleteServerLogs -- Failed with Tooling API method:', toolingError);
                        throw new Error('Failed to delete logs with all methods. Please try again later or use the Salesforce CLI directly.');
                    }
                }
            }
            
            // Update the UI
            this._updateWebviewContent();
        } catch (error) {
            console.error('[DeleteOperations] _deleteServerLogs -- Error deleting server logs:', error);
            vscode.window.showErrorMessage(`Failed to delete server logs: ${error}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
            this._removeBackgroundProcess(processId);
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
            
            console.log('[DeleteOperations] _deleteServerLogsFast -- Deleting all logs from server using Tooling API');
            
            // Construct the SOQL query to get all log IDs
            const soqlQuery = "SELECT Id FROM ApexLog";
            
            // Try with new CLI format first
            try {
                const command = `sf data query --query "${soqlQuery}" --use-tooling-api --json`;
                console.log(`[DeleteOperations] _deleteServerLogsFast -- Executing: ${command}`);
                const result = await this._executeCommand(command);
                
                // Parse the result
                const jsonResult = JSON.parse(result);
                
                if (jsonResult.result && jsonResult.result.records && Array.isArray(jsonResult.result.records)) {
                    const logIds = jsonResult.result.records.map((record: any) => record.Id);
                    console.log(`[DeleteOperations] _deleteServerLogsFast -- Found ${logIds.length} logs to delete`);
                    
                    if (logIds.length === 0) {
                        console.log('[DeleteOperations] _deleteServerLogsFast -- No logs to delete');
                        vscode.window.showInformationMessage('No logs found to delete');
                        return;
                    }
                    
                    // Delete the logs in batches
                    const batchSize = 200;
                    let deletedCount = 0;
                    
                    for (let i = 0; i < logIds.length; i += batchSize) {
                        const batch = logIds.slice(i, i + batchSize);
                        console.log(`[DeleteOperations] _deleteServerLogsFast -- Deleting batch ${i / batchSize + 1} of ${Math.ceil(logIds.length / batchSize)} (${batch.length} logs)`);
                        
                        // Construct the delete command
                        const deleteCommand = `sf data delete record --sobject ApexLog --record-id "${batch.join(',')}" --use-tooling-api --json`;
                        console.log(`[DeleteOperations] _deleteServerLogsFast -- Executing: ${deleteCommand}`);
                        
                        try {
                            const deleteResult = await this._executeCommand(deleteCommand);
                            console.log(`[DeleteOperations] _deleteServerLogsFast -- Delete result: ${deleteResult}`);
                            
                            // Parse the result
                            const deleteJsonResult = JSON.parse(deleteResult);
                            
                            if (deleteJsonResult.status === 0) {
                                deletedCount += batch.length;
                                console.log(`[DeleteOperations] _deleteServerLogsFast -- Successfully deleted batch ${i / batchSize + 1} (${batch.length} logs)`);
                            } else {
                                console.error(`[DeleteOperations] _deleteServerLogsFast -- Error deleting batch ${i / batchSize + 1}:`, deleteJsonResult.message);
                            }
                        } catch (batchError) {
                            console.error(`[DeleteOperations] _deleteServerLogsFast -- Error deleting batch ${i / batchSize + 1}:`, batchError);
                        }
                    }
                    
                    console.log(`[DeleteOperations] _deleteServerLogsFast -- Successfully deleted ${deletedCount} of ${logIds.length} logs`);
                    vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} logs from server`);
                } else {
                    console.log('[DeleteOperations] _deleteServerLogsFast -- No logs found in query result');
                    vscode.window.showInformationMessage('No logs found to delete');
                }
            } catch (error) {
                console.log('[DeleteOperations] _deleteServerLogsFast -- Failed with new CLI format, trying old format', error);
                
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:data:soql:query --query "${soqlQuery}" --usetoolingapi --json`;
                    console.log(`[DeleteOperations] _deleteServerLogsFast -- Executing: ${command}`);
                    const result = await this._executeCommand(command);
                    
                    // Parse the result
                    const jsonResult = JSON.parse(result);
                    
                    if (jsonResult.result && jsonResult.result.records && Array.isArray(jsonResult.result.records)) {
                        const logIds = jsonResult.result.records.map((record: any) => record.Id);
                        console.log(`[DeleteOperations] _deleteServerLogsFast -- Found ${logIds.length} logs to delete`);
                        
                        if (logIds.length === 0) {
                            console.log('[DeleteOperations] _deleteServerLogsFast -- No logs to delete');
                            vscode.window.showInformationMessage('No logs found to delete');
                            return;
                        }
                        
                        // Delete the logs in batches
                        const batchSize = 200;
                        let deletedCount = 0;
                        
                        for (let i = 0; i < logIds.length; i += batchSize) {
                            const batch = logIds.slice(i, i + batchSize);
                            console.log(`[DeleteOperations] _deleteServerLogsFast -- Deleting batch ${i / batchSize + 1} of ${Math.ceil(logIds.length / batchSize)} (${batch.length} logs)`);
                            
                            // Construct the delete command
                            const deleteCommand = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid "${batch.join(',')}" --usetoolingapi --json`;
                            console.log(`[DeleteOperations] _deleteServerLogsFast -- Executing: ${deleteCommand}`);
                            
                            try {
                                const deleteResult = await this._executeCommand(deleteCommand);
                                console.log(`[DeleteOperations] _deleteServerLogsFast -- Delete result: ${deleteResult}`);
                                
                                // Parse the result
                                const deleteJsonResult = JSON.parse(deleteResult);
                                
                                if (deleteJsonResult.status === 0) {
                                    deletedCount += batch.length;
                                    console.log(`[DeleteOperations] _deleteServerLogsFast -- Successfully deleted batch ${i / batchSize + 1} (${batch.length} logs)`);
                                } else {
                                    console.error(`[DeleteOperations] _deleteServerLogsFast -- Error deleting batch ${i / batchSize + 1}:`, deleteJsonResult.message);
                                }
                            } catch (batchError) {
                                console.error(`[DeleteOperations] _deleteServerLogsFast -- Error deleting batch ${i / batchSize + 1}:`, batchError);
                            }
                        }
                        
                        console.log(`[DeleteOperations] _deleteServerLogsFast -- Successfully deleted ${deletedCount} of ${logIds.length} logs`);
                        vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} logs from server`);
                    } else {
                        console.log('[DeleteOperations] _deleteServerLogsFast -- No logs found in query result');
                        vscode.window.showInformationMessage('No logs found to delete');
                    }
                } catch (innerError) {
                    console.error('[DeleteOperations] _deleteServerLogsFast -- Failed with old CLI format:', innerError);
                    throw innerError;
                }
            }
        } catch (error) {
            console.error('[DeleteOperations] _deleteServerLogsFast -- Error deleting server logs with Tooling API:', error);
            throw error;
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
            this._removeBackgroundProcess(processId);
        }
    }

    /**
     * Deletes selected logs
     * @param logIds The IDs of the logs to delete
     */
    public async deleteSelectedLogs(logIds: string[]): Promise<void> {
        const processId = 'delete-selected-logs';
        this._addBackgroundProcess(processId, 'Deleting selected logs');
        
        try {
            this._isLoading = true;
            this._view?.webview.postMessage({ command: 'loading', isLoading: true, message: 'Deleting selected logs...' });
            
            // Show confirmation dialog
            const result = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${logIds.length} selected logs?`,
                { modal: true },
                'Yes',
                'No'
            );
            
            if (result !== 'Yes') {
                console.log('[DeleteOperations] deleteSelectedLogs -- User cancelled deleting selected logs');
                return;
            }
            
            console.log(`[DeleteOperations] deleteSelectedLogs -- Deleting ${logIds.length} selected logs`);
            
            // Delete each log
            let deletedCount = 0;
            for (const logId of logIds) {
                try {
                    // Check if we have a local copy of the log
                    const localFilePath = this._downloadedLogPaths.get(logId);
                    if (localFilePath && fs.existsSync(localFilePath)) {
                        try {
                            // Delete the local file
                            console.log(`[DeleteOperations] deleteSelectedLogs -- Deleting local file: ${localFilePath}`);
                            fs.unlinkSync(localFilePath);
                            
                            // Remove from downloaded logs
                            this._downloadedLogs.delete(logId);
                            this._downloadedLogPaths.delete(logId);
                            
                            console.log(`[DeleteOperations] deleteSelectedLogs -- Successfully deleted local file for log ${logId}`);
                        } catch (error) {
                            console.error(`[DeleteOperations] deleteSelectedLogs -- Error deleting local file for log ${logId}:`, error);
                        }
                    }
                    
                    // Delete the log from the server
                    try {
                        console.log(`[DeleteOperations] deleteSelectedLogs -- Deleting log ${logId} from server`);
                        
                        // Try with new CLI format first
                        try {
                            const command = `sf apex delete log -i ${logId} --json`;
                            console.log(`[DeleteOperations] deleteSelectedLogs -- Executing: ${command}`);
                            const result = await this._executeCommand(command);
                            
                            // Check if the deletion was successful
                            const jsonResult = JSON.parse(result);
                            if (jsonResult.status === 0) {
                                console.log(`[DeleteOperations] deleteSelectedLogs -- Successfully deleted log ${logId} from server with new CLI format`);
                                deletedCount++;
                            } else {
                                throw new Error(`Failed to delete log: ${jsonResult.message}`);
                            }
                        } catch (error) {
                            console.log('[DeleteOperations] deleteSelectedLogs -- Failed with new CLI format, trying old format', error);
                            
                            // If the new command fails, try the old format
                            const command = `sfdx force:apex:log:delete -i ${logId} --json`;
                            console.log(`[DeleteOperations] deleteSelectedLogs -- Executing: ${command}`);
                            const result = await this._executeCommand(command);
                            
                            // Check if the deletion was successful
                            const jsonResult = JSON.parse(result);
                            if (jsonResult.status === 0) {
                                console.log(`[DeleteOperations] deleteSelectedLogs -- Successfully deleted log ${logId} from server with old CLI format`);
                                deletedCount++;
                            } else {
                                throw new Error(`Failed to delete log: ${jsonResult.message}`);
                            }
                        }
                    } catch (error) {
                        console.error(`[DeleteOperations] deleteSelectedLogs -- Error deleting log ${logId} from server:`, error);
                    }
                } catch (error) {
                    console.error(`[DeleteOperations] deleteSelectedLogs -- Error deleting log ${logId}:`, error);
                }
            }
            
            // Save the updated lists
            this._saveDownloadedLogs();
            
            console.log(`[DeleteOperations] deleteSelectedLogs -- Successfully deleted ${deletedCount} of ${logIds.length} logs`);
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} of ${logIds.length} logs`);
            
            // Update the UI
            this._updateWebviewContent();
        } catch (error) {
            console.error('[DeleteOperations] deleteSelectedLogs -- Error deleting selected logs:', error);
            vscode.window.showErrorMessage(`Failed to delete selected logs: ${error}`);
        } finally {
            this._isLoading = false;
            this._view?.webview.postMessage({ command: 'loading', isLoading: false });
            this._removeBackgroundProcess(processId);
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
        console.log(`[DeleteOperations] _saveDownloadedLogs -- Saving ${this._downloadedLogs.size} downloaded logs to extension storage`);
        this._context.globalState.update('visbalDownloadedLogs', Array.from(this._downloadedLogs));
        
        // Save the paths of downloaded logs
        const downloadedLogPaths = Object.fromEntries(this._downloadedLogPaths.entries());
        this._context.globalState.update('visbalDownloadedLogPaths', downloadedLogPaths);
        console.log(`[DeleteOperations] _saveDownloadedLogs -- Saved ${this._downloadedLogPaths.size} log file paths`);
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

    /**
     * Adds a background process
     * @param id The ID of the process
     * @param description The description of the process
     */
    private _addBackgroundProcess(id: string, description: string): void {
        this._backgroundProcesses.set(id, description);
        this._updateBackgroundProcesses();
    }

    /**
     * Removes a background process
     * @param id The ID of the process
     */
    private _removeBackgroundProcess(id: string): void {
        this._backgroundProcesses.delete(id);
        this._updateBackgroundProcesses();
    }

    /**
     * Updates the background processes in the webview
     */
    private _updateBackgroundProcesses(): void {
        if (!this._view) {
            return;
        }
        
        // Convert the map to an array of objects
        const processes = Array.from(this._backgroundProcesses.entries()).map(([id, description]) => ({
            id,
            description
        }));
        
        // Send a message to the webview to update the background processes
        this._view.webview.postMessage({
            command: 'updateBackgroundProcesses',
            processes
        });
    }
} 