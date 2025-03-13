import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

/**
 * Interface for Salesforce Debug Log
 */
export interface SalesforceLog {
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
 * Class containing all fetch operations for Salesforce logs
 */
export class FetchOperations {
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _view?: vscode.WebviewView,
        private readonly _downloadedLogs: Set<string> = new Set<string>(),
        private readonly _downloadedLogPaths: Map<string, string> = new Map<string, string>()
    ) {}

    /**
     * Executes a command and returns the output
     * @param command The command to execute
     * @returns The command output
     */
    public async executeCommand(command: string): Promise<string> {
        console.log(`[FetchOperations] executeCommand -- Executing command: ${command}`);
        try {
            const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
            return stdout;
        } catch (error: any) {
            console.error(`[FetchOperations] executeCommand -- Error executing command: ${command}`, error);
            throw error;
        }
    }

    /**
     * Fetches Salesforce logs using SFDX CLI
     * @returns Array of Salesforce logs
     */
    public async fetchSalesforceLogs(): Promise<SalesforceLog[]> {
        console.log('[FetchOperations] fetchSalesforceLogs -- Starting to fetch Salesforce logs');
        try {
            // Check if SFDX CLI is installed
            try {
                console.log('[FetchOperations] fetchSalesforceLogs -- Checking if SFDX CLI is installed');
                const { stdout: versionOutput } = await execAsync('sfdx --version');
                console.log(`[FetchOperations] fetchSalesforceLogs -- SFDX CLI version: ${versionOutput.trim()}`);
            } catch (error) {
                console.error('[FetchOperations] fetchSalesforceLogs -- SFDX CLI not installed:', error);
                throw new Error('SFDX CLI is not installed. Please install it to use this feature.');
            }
            
            // Try to get the default org using the new command format first
            let orgData;
            console.log('[FetchOperations] fetchSalesforceLogs -- Trying to get default org with new CLI format');
            try {
                const { stdout: orgInfo } = await execAsync('sf org display --json');
                console.log('[FetchOperations] fetchSalesforceLogs -- Successfully got org info with new CLI format');
                orgData = JSON.parse(orgInfo);
                console.log('[FetchOperations] fetchSalesforceLogs -- Parsed org data:', orgData.result?.username);
            } catch (error) {
                console.log('[FetchOperations] fetchSalesforceLogs -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const { stdout: orgInfo } = await execAsync('sfdx force:org:display --json');
                    console.log('[FetchOperations] fetchSalesforceLogs -- Successfully got org info with old CLI format');
                    orgData = JSON.parse(orgInfo);
                    console.log('[FetchOperations] fetchSalesforceLogs -- Parsed org data:', orgData.result?.username);
                } catch (innerError) {
                    console.error('[FetchOperations] fetchSalesforceLogs -- Failed to get org info with both formats:', innerError);
                    throw new Error('Failed to get default org information. Please ensure you have a default org set.');
                }
            }
            
            if (!orgData.result || !orgData.result.username) {
                console.error('[FetchOperations] fetchSalesforceLogs -- No username found in org data');
                throw new Error('No default Salesforce org found. Please set a default org using Salesforce CLI.');
            }
            
            console.log(`[FetchOperations] fetchSalesforceLogs -- Connected to org: ${orgData.result.username}`);
            
            // Try to fetch debug logs using the new command format first
            let logsResponse;
            console.log('[FetchOperations] fetchSalesforceLogs -- Trying to fetch logs with new CLI format');
            try {
                const { stdout: logsData } = await execAsync('sf apex list log --json');
                console.log('[FetchOperations] fetchSalesforceLogs -- Successfully fetched logs with new CLI format');
                logsResponse = JSON.parse(logsData);
            } catch (error) {
                console.log('[FetchOperations] fetchSalesforceLogs -- Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    console.log('[FetchOperations] fetchSalesforceLogs -- Executing: sfdx force:apex:log:list --json --limit 200');
                    const { stdout: logsData } = await execAsync('sfdx force:apex:log:list --json --limit 200');
                    console.log('[FetchOperations] fetchSalesforceLogs -- Successfully fetched logs with old CLI format');
                    logsResponse = JSON.parse(logsData);
                } catch (innerError) {
                    console.error('[FetchOperations] fetchSalesforceLogs -- Failed to fetch logs with both formats:', innerError);
                    throw new Error('Failed to fetch logs. Please ensure your Salesforce CLI is properly configured.');
                }
            }
            
            if (!logsResponse.result || !Array.isArray(logsResponse.result)) {
                console.log('[FetchOperations] fetchSalesforceLogs -- No logs found in response:', logsResponse);
                return [];
            }
            
            console.log(`[FetchOperations] fetchSalesforceLogs -- Found ${logsResponse.result.length} debug logs`);
            
            // Format the logs
            console.log('[FetchOperations] fetchSalesforceLogs -- Formatting logs');
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
            
            console.log(`[FetchOperations] fetchSalesforceLogs -- Returning ${formattedLogs.length} formatted logs`);
            return formattedLogs;
        } catch (error: any) {
            console.error('[FetchOperations] fetchSalesforceLogs -- Error in fetchSalesforceLogs:', error);
            throw error;
        }
    }

    /**
     * Fetches the content of a log
     * @param logId The ID of the log to fetch
     * @returns The log content
     */
    public async fetchLogContent(logId: string): Promise<string> {
        console.log(`[FetchOperations] fetchLogContent -- Starting to fetch content for log: ${logId}`);
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
                console.log(`[FetchOperations] fetchLogContent -- Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a temporary file path for direct output
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            // Format: id_operation_status_size_date.log with temp_ prefix
            const tempFilePath = path.join(targetDir, `temp_${sanitizedLogId}_${timestamp}.log`);
            
            console.log(`[FetchOperations] fetchLogContent -- Temp file path: ${tempFilePath}`);
            console.log(`[FetchOperations] fetchLogContent -- Target directory: ${targetDir}`);
            
            // Try direct file output first (most reliable for large logs)
            try {
                console.log(`[FetchOperations] fetchLogContent -- Trying direct file output to: ${tempFilePath}`);
                
                // Try with new CLI format first
                try {
                    const command = `sf apex get log -i ${logId} > "${tempFilePath}"`;
                    console.log(`[FetchOperations] fetchLogContent -- Executing direct output command: ${command}`);
                    await execAsync(command);
                    
                    // Check if the file was created and has content
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                        console.log(`[FetchOperations] fetchLogContent -- Successfully wrote log to file: ${tempFilePath}`);
                        const logContent = fs.readFileSync(tempFilePath, 'utf8');
                        
                        // Clean up the temporary file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            console.log(`[FetchOperations] fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                        }
                        
                        return logContent;
                    }
                } catch (directOutputError) {
                    console.log('[FetchOperations] fetchLogContent -- Direct output with new CLI format failed, trying old format', directOutputError);
                    
                    // Try with old CLI format
                    try {
                        const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFilePath}"`;
                        console.log(`[FetchOperations] fetchLogContent -- Executing direct output command with old format: ${command}`);
                        await execAsync(command);
                        
                        // Check if the file was created and has content
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                            console.log(`[FetchOperations] fetchLogContent -- Successfully wrote log to file with old format: ${tempFilePath}`);
                            const logContent = fs.readFileSync(tempFilePath, 'utf8');
                            
                            // Clean up the temporary file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                console.log(`[FetchOperations] fetchLogContent -- Warning: Could not delete temp file: ${tempFilePath}`);
                            }
                            
                            return logContent;
                        }
                    } catch (oldDirectOutputError) {
                        console.log('[FetchOperations] fetchLogContent -- Direct output with old CLI format failed', oldDirectOutputError);
                    }
                }
            } catch (error) {
                console.log('[FetchOperations] fetchLogContent -- Direct file output approach failed, falling back to standard methods', error);
            }
            
            // If direct file output failed, try the standard methods with increased buffer size
            
            // Try to fetch the log using the new command format first
            let log;
            console.log('[FetchOperations] fetchLogContent -- Trying to fetch log content with new CLI format');
            try {
                const command = `sf apex get log -i ${logId} --json`;
                console.log(`[FetchOperations] fetchLogContent -- Executing: ${command}`);
                const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                console.log('[FetchOperations] fetchLogContent -- Successfully fetched log content with new CLI format');
                log = JSON.parse(logData);
                
                // Debug the response structure
                console.log(`[FetchOperations] fetchLogContent -- Response structure: ${JSON.stringify(Object.keys(log))}`);
                if (log.result) {
                    console.log(`[FetchOperations] fetchLogContent -- Result structure: ${typeof log.result} ${Array.isArray(log.result) ? 'array' : 'not array'}`);
                    if (Array.isArray(log.result) && log.result.length > 0) {
                        console.log(`[FetchOperations] fetchLogContent -- First result item keys: ${JSON.stringify(Object.keys(log.result[0]))}`);
                    }
                }
                
                // Handle different response formats
                if (log.result) {
                    if (typeof log.result === 'string') {
                        // Direct log content as string
                        console.log('[FetchOperations] fetchLogContent -- Found log content as string in result');
                        return log.result;
                    } else if (typeof log.result.log === 'string') {
                        // Log content in result.log
                        console.log('[FetchOperations] fetchLogContent -- Found log content in result.log');
                        return log.result.log;
                    } else if (Array.isArray(log.result) && log.result.length > 0) {
                        // Array result format
                        const firstResult = log.result[0];
                        
                        // Check for common properties that might contain the log
                        if (firstResult.log) {
                            console.log('[FetchOperations] fetchLogContent -- Found log content in result[0].log');
                            return firstResult.log;
                        } else if (firstResult.body) {
                            console.log('[FetchOperations] fetchLogContent -- Found log content in result[0].body');
                            return firstResult.body;
                        } else if (firstResult.content) {
                            console.log('[FetchOperations] fetchLogContent -- Found log content in result[0].content');
                            return firstResult.content;
                        } else if (firstResult.text) {
                            console.log('[FetchOperations] fetchLogContent -- Found log content in result[0].text');
                            return firstResult.text;
                        } else {
                            // If we can't find a specific property, try to stringify the first result
                            console.log('[FetchOperations] fetchLogContent -- No specific log property found, using entire result object');
                            return JSON.stringify(firstResult, null, 2);
                        }
                    }
                }
                
                // If we couldn't find the log content in the expected places, try direct CLI output
                console.log('[FetchOperations] fetchLogContent -- Could not find log content in JSON response, trying direct CLI output');
                throw new Error('Log content not found in expected format');
            } catch (error) {
                console.log('[FetchOperations] fetchLogContent -- Failed with new CLI format or parsing, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                    console.log(`[FetchOperations] fetchLogContent -- Executing: ${command}`);
                    const { stdout: logData } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE });
                    console.log('[FetchOperations] fetchLogContent -- Successfully fetched log content with old CLI format');
                    log = JSON.parse(logData);
                    
                    // Debug the response structure
                    console.log(`[FetchOperations] fetchLogContent -- Old format response structure: ${JSON.stringify(Object.keys(log))}`);
                    
                    if (log.result && log.result.log) {
                        console.log(`[FetchOperations] fetchLogContent -- Found log content in old format result.log`);
                        return log.result.log;
                    } else {
                        console.error('[FetchOperations] fetchLogContent -- Log not found in old format response:', log);
                        throw new Error('Log content not found in old format response');
                    }
                } catch (innerError) {
                    console.error('[FetchOperations] fetchLogContent -- Failed to fetch log content with both formats:', innerError);
                    
                    // Try one more approach - direct CLI output without JSON
                    try {
                        console.log('[FetchOperations] fetchLogContent -- Trying direct CLI output without JSON');
                        const { stdout: directOutput } = await execAsync(`sf apex get log -i ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                        console.log('[FetchOperations] fetchLogContent -- Successfully fetched log content with direct CLI output');
                        if (directOutput && directOutput.trim().length > 0) {
                            return directOutput;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError) {
                        try {
                            console.log('[FetchOperations] fetchLogContent -- Trying direct CLI output with old format');
                            const { stdout: oldDirectOutput } = await execAsync(`sfdx force:apex:log:get --logid ${logId}`, { maxBuffer: MAX_BUFFER_SIZE });
                            console.log('[FetchOperations] fetchLogContent -- Successfully fetched log content with direct CLI output (old format)');
                            if (oldDirectOutput && oldDirectOutput.trim().length > 0) {
                                return oldDirectOutput;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError) {
                            console.error('[FetchOperations] fetchLogContent -- All attempts to fetch log content failed');
                            throw new Error('Failed to fetch log content. The log may be too large to download. Please try using the Salesforce CLI directly.');
                        }
                    }
                }
            }
            
            // This should not be reached due to the throws above, but just in case
            console.error('[FetchOperations] fetchLogContent -- No log content found in any format');
            throw new Error('Log content not found in any format');
        } catch (error: any) {
            console.error(`[FetchOperations] fetchLogContent -- Error fetching log with ID ${logId}:`, error);
            throw error;
        }
    }
} 