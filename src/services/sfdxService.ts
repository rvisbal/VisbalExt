//import { execAsync } from '../utils/execUtils';
import { OrgUtils } from '../utils/orgUtils';
import { ApexClass, SalesforceLog } from '../types/salesforceTypes';
import * as fs from 'fs';
import { readFile, unlink } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as child_process from 'child_process';

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

interface ExecResult {
    stdout: string;
    stderr: string;
}

interface LogResult {
    log?: string;
    tests?: Array<{
        message?: string;
        stackTrace?: string;
        outcome?: string;
    }>;
    summary?: {
        testExecutionResult?: string;
        outcome?: string;
    };
}

interface ResultContent {
    result?: any;
}

export class SfdxService {
    
    private readonly CACHE_EXPIRATION = 15 * 60 * 1000; // 15 minutes in milliseconds

    constructor() {}

    //#region Core Functionality
    private _executeCommand(command: string): Promise<ExecResult> {
        return new Promise((resolve, reject) => {
            child_process.exec(command, { maxBuffer: MAX_BUFFER_SIZE }, (error, stdout, stderr) => {
                if (!command.includes('sf apex list log')) {
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] _executeCommand command:${command} -- stdout:`);
                }
                if (error) {
                    // If we have stdout even with an error, we might want to use it
                    if (stdout) {
                        resolve({ stdout: stdout.toString(), stderr: stderr?.toString() || '' });
                        return;
                    }
                    OrgUtils.logError('[VisbalExt.SfdxService] _executeCommand', error);
                    reject(error);
                    return;
                }
                
                if (stderr) {
                    OrgUtils.logDebug('[VisbalExt.SfdxService] _executeCommand', `stderr: ${stderr}`);
                }
                
                resolve({ stdout: stdout.toString(), stderr: stderr?.toString() || '' });
            });
        });
    }

    private _executeCommand2(command: string, options: any = {}): Promise<ExecResult> {
        return new Promise((resolve, reject) => {
            child_process.exec(command, { maxBuffer: MAX_BUFFER_SIZE, ...options }, (error, stdout, stderr) => {
                if (error) {
                    // If we have stdout even with an error, we might want to use it
                    if (stdout) {
                        resolve({ stdout: stdout.toString(), stderr: stderr?.toString() || '' });
                        return;
                    }
                    reject(error);
                    return;
                }
                resolve({ stdout: stdout.toString(), stderr: stderr?.toString() || '' });
            });
        });
    }

    /**
     * Gets the current user ID using either new SF CLI or old SFDX CLI format
     * @returns Promise<string> The user ID
     * @throws Error if unable to get user ID
     */
    public async getCurrentUserId(): Promise<string> {
        let userId = '';
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentUserId', 'Getting current user ID');
            try {
                let command = 'sf org display user';
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentUserId', `command: ${command}`);
                const userIdResult = await this._executeCommand(command);
                const userIdJson = JSON.parse(userIdResult.stdout);
                userId = userIdJson.result.id;
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.SfdxService] getCurrentUserId', error);
                let command = 'sfdx force:user:display';
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                const userIdResult = await this._executeCommand(command);
                OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentUserId', `User ID result (old format): ${userIdResult.stdout}`);
                const userIdJson = JSON.parse(userIdResult.stdout);
                userId = userIdJson.result.id;
                OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentUserId', `Current user ID (old format): ${userId}`);
            }

            return userId;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] getCurrentUserId', error);
            throw error;
        }
    }
    //#endregion

    //#region Organization Management
    public async getCurrentOrgAlias(): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentOrgAlias', 'BEGIN');
            const command = 'sf org display --json';
            const orgInfo = await this._executeCommand(command);
            const result = JSON.parse(orgInfo.stdout);
            if (result.status === 0 && result.result) {
                // Use alias if available, otherwise use username
                const alias = result.result.alias || result.result.username;
                OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentOrgAlias -- alias:', alias);
                if (!alias) {
                    throw new Error('No org alias or username found');
                }
                
                OrgUtils.logDebug('[VisbalExt.SfdxService] getCurrentOrgAlias', `CACHED & RETURN alias: `, alias);
                
                return alias;
            }
            throw new Error('No default org set');
        } catch (error: any) {
            
            OrgUtils.logError('[VisbalExt.SfdxService] getCurrentOrgAlias', error);
            throw error;
        }
    }

    /**
     * Lists all available Salesforce orgs grouped by type
     * @returns Promise containing the organized list of orgs
     */
    public async listOrgs(): Promise<any> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] listOrgs', 'Fetching org list');
            const command = 'sf org list --all --json';
            OrgUtils.logDebug(`[VisbalExt.SfdxService] listOrgs command: ${command}`, command);
            const resultStr = await this._executeCommand(command);
            const result = JSON.parse(resultStr.stdout);
            OrgUtils.logDebug('[VisbalExt.SfdxService] listOrgs -- result:', result);
            
            if (!result.result) {
                throw new Error('Failed to retrieve org list: Unexpected response format');
            }

            // Filter and organize orgs by type
            const organizedOrgs = {
                devHubs: [],
                nonScratchOrgs: [],
                sandboxes: [],
                scratchOrgs: [],
                other: []
            };

            // Process each org
            if (result.result.devHubs) {
                organizedOrgs.devHubs = result.result.devHubs
                    .filter((org: any) => org.connectedStatus === 'Connected')
                    .map((org: any) => ({
                        ...org,
                        type: 'devHub'
                    }));
            }

            if (result.result.nonScratchOrgs) {
                organizedOrgs.nonScratchOrgs = result.result.nonScratchOrgs
                    .filter((org: any) => org.connectedStatus === 'Connected')
                    .map((org: any) => ({
                        ...org,
                        type: 'nonScratchOrg'
                    }));
            }

            if (result.result.sandboxes) {
                organizedOrgs.sandboxes = result.result.sandboxes
                    .filter((org: any) => org.connectedStatus === 'Connected')
                    .map((org: any) => ({
                        ...org,
                        type: 'sandbox'
                    }));
            }

            if (result.result.scratchOrgs) {
                organizedOrgs.scratchOrgs = result.result.scratchOrgs
                    .filter((org: any) => !org.isExpired && org.status === 'Active')
                    .map((org: any) => ({
                        ...org,
                        type: 'scratchOrg'
                    }));
            }

            if (result.result.other) {
                organizedOrgs.other = result.result.other
                    .filter((org: any) => org.connectedStatus === 'Connected')
                    .map((org: any) => ({
                        ...org,
                        type: 'other'
                    }));
            }

            OrgUtils.logDebug('[VisbalExt.SfdxService] listOrgs -- Successfully organized org list', organizedOrgs);
            return organizedOrgs;
        } catch (error: any) {
            
            OrgUtils.logError('[VisbalExt.SfdxService] listOrgs', error);
            throw new Error(`Failed to retrieve org list: ${error.message}`);
        }
    }

    
    //#endregion

    //#region Debug Levels and Trace Flags
    /**
     * Updates an existing debug level
     * @param debugLevelId The ID of the debug level to update
     * @param debugLevelFields The fields to update in the format "field1=value1 field2=value2"
     * @throws Error if unable to update debug level
     */
    public async updateDebugLevel(debugLevelId: string, debugLevelFields: string): Promise<void> {
        try {
            // Try with new CLI format first
            try {
                let command = `sf data update record --sobject DebugLevel --record-id ${debugLevelId} --values "${debugLevelFields}" --use-tooling-api`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                OrgUtils.logDebug('[VisbalExt.SfdxService] updateDebugLevel', `command: ${command}`);
                await this._executeCommand(command);
            } catch (error: any) {
                
                OrgUtils.logError('[VisbalExt.SfdxService] updateDebugLevel', error);
                
                // Try with old CLI format
                let command = `sfdx force:data:record:update --sobjecttype DebugLevel --sobjectid ${debugLevelId} --values "${debugLevelFields}" --usetoolingapi`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                OrgUtils.logDebug('[VisbalExt.SfdxService] updateDebugLevel', `command (old format): ${command}`);
                await this._executeCommand(command);
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] updateDebugLevel', error);
            throw new Error('Failed to update debug level');
        }
    }

    /**
     * Creates a new debug level
     * @param debugLevelName The name for the new debug level
     * @param debugLevelFields The fields to set in the format "field1=value1 field2=value2"
     * @returns The ID of the created debug level
     * @throws Error if unable to create debug level
     */
    public async createDebugLevel(debugValues: string): Promise<string> {
        try {
            let command = `sf data create record --sobject DebugLevel --values "${debugValues}" --use-tooling-api`;
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            
            const result = await this._executeCommand(command);
            const parsedResult = JSON.parse(result.stdout);
            
            if (parsedResult.status === 0 && parsedResult.result && parsedResult.result.id) {
                return parsedResult.result.id;
            }
            throw new Error('Failed to create debug level');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error creating debug level:', error);
            throw error;
        }
    }

    /**
     * Gets an existing trace flag for a user
     * @param userId The ID of the user
     * @returns Promise containing the trace flag if found
     */
    public async getTraceFlag(userId: string): Promise<any> {
        try {
            const query = `SELECT Id, DebugLevelId FROM TraceFlag WHERE TracedEntityId = '${userId}' AND LogType = 'DEVELOPER_LOG'`;
			const records =  await this.executeSoqlQuery(query, false, true);
            if (records?.length > 0) {
                return records[0];
            }
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error getting trace flag:', error);
            throw error;
        }
    }

    /**
     * Deletes a trace flag
     * @param traceFlagId The ID of the trace flag to delete
     * @throws Error if unable to delete trace flag
     */
    public async deleteTraceFlag(traceFlagId: string): Promise<void> {
        try {
            let command = `sf data delete record --sobject TraceFlag --record-id ${traceFlagId} --use-tooling-api`;
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';

            // Try with new CLI format first
            try {
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleting trace flag with command: ${command}`);
                await this._executeCommand(command);
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.SfdxService] Error deleting trace flag with new CLI format:', error);
                
                // Try with old CLI format
                command = `sfdx force:data:record:delete --sobjecttype TraceFlag --sobjectid ${traceFlagId} --usetoolingapi --json`;
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleting trace flag with command (old format): ${command}`);
                await this._executeCommand(command);
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error deleting trace flag:', error);
            throw new Error('Failed to delete trace flag');
        }
    }

    /**
     * Creates a new trace flag
     * @param userId The ID of the user to trace
     * @param debugLevelId The ID of the debug level to use
     * @param startDate The start date for the trace flag
     * @param expirationDate The expiration date for the trace flag
     * @returns The ID of the created trace flag
     * @throws Error if unable to create trace flag
     */
    public async createTraceFlag(debugValues: string): Promise<string> {
        try {
            // Try with new CLI format first
            try {
                let command = `sf data create record --sobject TraceFlag --values "${debugValues}" --use-tooling-api`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Creating trace flag with command: ${command}`);
                const result = await this._executeCommand(command);
                const json = JSON.parse(result.stdout);
                return json.result.id;
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.SfdxService] Error creating trace flag with new CLI format:', error);
                
                // Try with old CLI format
                let command = `sfdx force:data:record:create --sobjecttype TraceFlag --values "${debugValues}" --usetoolingapi`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Creating trace flag with command (old format): ${command}`);
                const result = await this._executeCommand(command);
                const json = JSON.parse(result.stdout);
                return json.result.id;
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error creating trace flag:', error);
            throw new Error('Failed to create trace flag');
        }
    }
    //#endregion

    //#region Apex Logs
    /**
     * Gets the content of a log using various methods, falling back to alternatives if one fails
     * @param logId The ID of the log to fetch
     * @returns Promise<string> The log content
     */
    public async getLogContentAndSave(logId: string): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] getLogContent -- logId:', logId);
            
            // Try direct file output first (most reliable for large logs)
            try {
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (!selectedOrg?.alias) {
                    throw new Error('No org selected');
                }
                
                const tempFile = path.join(os.tmpdir(), `${logId}.log`);
                const command = `sf apex log get --log-id ${logId} > "${tempFile}" --target-org ${selectedOrg.alias}`;
                OrgUtils.logDebug('[VisbalExt.SfdxService] getLogContent -- command:', command);
                await this._executeCommand(command);
                const content = await readFile(tempFile, 'utf8');
                await unlink(tempFile);
                return content;
            } catch (directError) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Direct file output failed, trying JSON format', directError);
                
                // Try JSON format
                try {
                    const selectedOrg = await OrgUtils.getSelectedOrg();
                    if (!selectedOrg?.alias) {
                        throw new Error('No org selected');
                    }
                    
                    const result = await this._executeCommand(`sf apex log get --log-id ${logId} --json --target-org ${selectedOrg.alias}`);
                    const parsedResult = JSON.parse(result.stdout);
                    if (parsedResult.result?.log) {
                        return parsedResult.result.log;
                    }
                } catch (jsonError) {
                    OrgUtils.logDebug('[VisbalExt.SfdxService] JSON format failed, trying direct output', jsonError);
                    
                    // Try direct output as last resort
                    const selectedOrg = await OrgUtils.getSelectedOrg();
                    if (!selectedOrg?.alias) {
                        throw new Error('No org selected');
                    }
                    
                    const result = await this._executeCommand(`sf apex log get --log-id ${logId} --target-org ${selectedOrg.alias}`);
                    return result.stdout;
                }
            }
            
            throw new Error('Failed to get log content using any available method');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error getting log content:', error);
            throw error;
        }
    }

    /**
     * Lists all Apex logs
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     */
    public async listApexLogs(): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] Listing Apex logs...');
            let command = 'sf apex list log';
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            
            const result = await this._executeCommand(command);
            return result.stdout;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Failed to list Apex logs:', error);
            throw error;
        }
    }
	
	
	/**
     * Lists all Apex logs
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     */
    public async getLogContent(logId: string, useDefaultOrg: boolean = false): Promise<string> {
        OrgUtils.logDebug(`[VisbalExt.SfdxService] Starting to fetch content for log: ${logId}`);
        try {
            // First, check if we can directly output to a file to avoid buffer issues
            let targetDir: string;
            
            // Check if we have a workspace folder
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use the .visbal/logs directory in the workspace
                targetDir = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visbal', 'logs');
            } else {
                // Use the user's home directory
                targetDir = path.join(os.homedir(), '.visbal', 'logs');
            }
            
            // Create the directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a temporary file path for direct output
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            // Format: id_operation_status_size_date.log with temp_ prefix
            const tempFilePath = path.join(targetDir, `temp_${sanitizedLogId}_${timestamp}.log`);
            
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Temp file path: ${tempFilePath}`);
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Target directory: ${targetDir}`);
            
            // Try direct file output first (most reliable for large logs)
            try {
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Trying direct file output to: ${tempFilePath}`);
                
                // Try with new CLI format first
                try {
                    //const selectedOrg = await OrgUtils.getSelectedOrg();  
                    //const command = `sf apex get log -i ${logId} > "${tempFilePath}" --target-org ${selectedOrg?.alias}`;
                    //OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing direct output command: ${command}`);
                    //const result = await this._executeCommand(command);
                    
                    // Check if the file was created and has content
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] Successfully wrote log to file: ${tempFilePath}`);
                        const logContent = fs.readFileSync(tempFilePath, 'utf8');
                        
                        // Clean up the temporary file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            OrgUtils.logDebug(`[VisbalExt.SfdxService] Warning: Could not delete temp file: ${tempFilePath}`);
                        }
                        
                        return logContent;
                    }
                } catch (directOutputError) {
                    OrgUtils.logError('[VisbalExt.SfdxService] Direct output with new CLI format failed, trying old format', directOutputError instanceof Error ? directOutputError : new Error(String(directOutputError)));
                    
                    // Try with old CLI format
                    try {
                        const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFilePath}"`;
                        
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing direct output command with old format: ${command}`);
                        const result = await this._executeCommand(command);
                        
                        // Check if the file was created and has content
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                            OrgUtils.logDebug(`[VisbalExt.SfdxService] Successfully wrote log to file with old format: ${tempFilePath}`);
                            const logContent = fs.readFileSync(tempFilePath, 'utf8');
                            
                            // Clean up the temporary file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                OrgUtils.logDebug(`[VisbalExt.SfdxService] Warning: Could not delete temp file: ${tempFilePath}`);
                            }
                            
                            return logContent;
                        }
                    } catch (oldDirectOutputError) {
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Direct output with old CLI format failed', oldDirectOutputError);
                    }
                }
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Direct file output approach failed, falling back to standard methods', error);
            }
            
            // If direct file output failed, try the standard methods with increased buffer size
            
            // Try to fetch the log using the new command format first
            let log;
            OrgUtils.logDebug('[VisbalExt.SfdxService] Trying to fetch log content with new CLI format');
            try {
                const selectedOrg = await OrgUtils.getSelectedOrg();
                let command = `sf apex get log -i ${logId}`;
                if (!useDefaultOrg && selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing: ${command}`);
                const result = await this._executeCommand(command);
                OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully fetched log content with new CLI format');
                log = JSON.parse(result.stdout);
                
                // Debug the response structure
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Response structure: ${JSON.stringify(Object.keys(log))}`);
                if (log.result) {
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Result structure: ${typeof log.result} ${Array.isArray(log.result) ? 'array' : 'not array'}`);
                    if (Array.isArray(log.result) && log.result.length > 0) {
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] First result item keys: ${JSON.stringify(Object.keys(log.result[0]))}`);
                    }
                }
                
                // Handle different response formats
                if (log.result) {
                    if (typeof log.result === 'string') {
                        // Direct log content as string
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content as string in result');
                        return log.result;
                    } else if (typeof log.result.log === 'string') {
                        // Log content in result.log
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content in result.log');
                        return log.result.log;
                    } else if (Array.isArray(log.result) && log.result.length > 0) {
                        // Array result format
                        const firstResult = log.result[0];
                        
                        // Check for common properties that might contain the log
                        if (firstResult.log) {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content in result[0].log');
                            return firstResult.log;
                        } else if (firstResult.body) {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content in result[0].body');
                            return firstResult.body;
                        } else if (firstResult.content) {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content in result[0].content');
                            return firstResult.content;
                        } else if (firstResult.text) {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Found log content in result[0].text');
                            return firstResult.text;
                        } else {
                            // If we can't find a specific property, try to stringify the first result
                            OrgUtils.logDebug('[VisbalExt.SfdxService] No specific log property found, using entire result object');
                            return JSON.stringify(firstResult, null, 2);
                        }
                    }
                }
                
                // If we couldn't find the log content in the expected places, try direct CLI output
                OrgUtils.logDebug('[VisbalExt.SfdxService] Could not find log content in JSON response, trying direct CLI output');
                throw new Error('Log content not found in expected format');
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Failed with new CLI format or parsing, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing: ${command}`);
                    const result = await this._executeCommand(command);
                    OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully fetched log content with old CLI format');
                    log = JSON.parse(result.stdout);
                    
                    // Debug the response structure
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Old format response structure: ${JSON.stringify(Object.keys(log))}`);
                    
                    if (log.result && log.result.log) {
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] Found log content in old format result.log`);
                        return log.result.log;
                    } else {
                        OrgUtils.logError('[VisbalExt.SfdxService] Log not found in old format response:', log);
                        throw new Error('Log content not found in old format response');
                    }
                } catch (innerError) {
                    OrgUtils.logError('[VisbalExt.SfdxService] Failed to fetch log content with both formats:', innerError instanceof Error ? innerError : new Error(String(innerError)));
                    
                    // Try one more approach - direct CLI output without JSON
                    try {
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Trying direct CLI output without JSON');
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        const result = await this._executeCommand(`sf apex get log -i ${logId} --target-org ${selectedOrg?.alias}`);
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully fetched log content with direct CLI output');
                        if (result.stdout && result.stdout.trim().length > 0) {
                            return result.stdout;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError) {
                        try {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Trying direct CLI output with old format');
                            const result = await this._executeCommand(`sfdx force:apex:log:get --logid ${logId}`);
                            OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully fetched log content with direct CLI output (old format)');
                            if (result.stdout && result.stdout.trim().length > 0) {
                                return result.stdout;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError) {
                            OrgUtils.logError('[VisbalExt.SfdxService] All attempts to fetch log content failed', oldDirectError instanceof Error ? oldDirectError : new Error(String(oldDirectError)));
                            throw new Error('Failed to fetch log content. The log may be too large to download. Please try using the Salesforce CLI directly.');
                        }
                    }
                }
            }
            
            // This should not be reached due to the throws above, but just in case
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.SfdxService] Error fetching log with ID ${logId}:`, error );
            throw error;
        }
    }

    /**
     * Deletes a log by ID
     * @param logId The ID of the log to delete
     */
    public async deleteLog(logId: string): Promise<void> {
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!selectedOrg?.alias) {
                throw new Error('No org selected');
            }
            
            await this._executeCommand(
                `sf data delete record --sobject ApexLog --record-id ${logId} --json --target-org ${selectedOrg.alias}`
            );
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error deleting log:', error);
            throw error;
        }
    }

    /**
     * Deletes multiple logs in bulk
     * @param logIds Array of log IDs to delete
     */
    public async deleteLogsBulk(logIds: string[]): Promise<void> {
        if (!logIds.length) {
            return;
        }

        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!selectedOrg?.alias) {
                throw new Error('No org selected');
            }
            
            const idList = logIds.join(',');
            await this._executeCommand(
                `sf data delete bulk --sobject ApexLog --ids ${idList} --json --target-org ${selectedOrg.alias}`
            );
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error deleting logs in bulk:', error);
            throw error;
        }
    }

    /**
     * Fetches Salesforce logs using SOQL query
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     * @throws Error if unable to fetch logs
     */
    public async fetchSalesforceLogsSoql(): Promise<SalesforceLog[]> {
        OrgUtils.logDebug('[VisbalExt.SfdxService] Starting to fetch Salesforce logs via SOQL');
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!selectedOrg) {
                throw new Error('No org selected');
            }
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Connected to org: ${selectedOrg.alias}`);

            // Check if SF CLI is installed
            let sfInstalled = false;
            try {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Checking if SF CLI is installed');
                const result = await this._executeCommand('sf version');
                OrgUtils.logDebug(`[VisbalExt.SfdxService] SF CLI version: ${result.stdout}`);
                sfInstalled = true;
            } catch (err) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] SF CLI not installed');
            }

            if (!sfInstalled) {
                throw new Error('Please install the Salesforce CLI (npm install -g @salesforce/cli).');
            }

            // SOQL query to fetch debug logs
            const soqlQuery = `SELECT Id, LogUser.Name, Operation, Application, Status, LogLength, LastModifiedDate, Request, Location FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 50`;
            OrgUtils.logDebug(`[VisbalExt.SfdxService] SOQL query: ${soqlQuery}`);
            
            // Try to execute SOQL query using the new command format first
            let queryResult;
            OrgUtils.logDebug('[VisbalExt.SfdxService] Trying to execute SOQL query with new CLI format');
            try {
                const command = `sf data query --query "${soqlQuery}" --target-org ${selectedOrg.alias} --json`;
                OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing: ${command}`);
                const queryData = await this._executeCommand(command);
                OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully executed SOQL query with new CLI format');
                queryResult = JSON.parse(queryData.stdout);
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:data:soql:query -q "${soqlQuery}" --target-org ${selectedOrg.alias} --json`;
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Executing: ${command}`);
                    const queryData = await this._executeCommand(command);
                    OrgUtils.logDebug('[VisbalExt.SfdxService] Successfully executed SOQL query with old CLI format');
                    queryResult = JSON.parse(queryData.stdout);
                } catch (innerError) {
                    OrgUtils.logError('[VisbalExt.SfdxService] Failed to execute SOQL query with both formats:', innerError instanceof Error ? innerError : new Error(String(innerError)));
                    throw new Error('Failed to execute SOQL query. Please ensure your Salesforce CLI is properly configured.');
                }
            }
            
            if (!queryResult.result || !queryResult.result.records || !Array.isArray(queryResult.result.records)) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] No logs found in query result:', queryResult);
                return [];
            }
            
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Found ${queryResult.result.records.length} debug logs via SOQL`);
            
            // Format the logs
            OrgUtils.logDebug('[VisbalExt.SfdxService] Formatting logs from SOQL query');
            const formattedLogs: SalesforceLog[] = queryResult.result.records.map((log: any) => ({
                id: log.Id,
                logUser: log.LogUser?.Name || 'Unknown User',
                application: log.Application || 'Unknown',
                operation: log.Operation || 'Unknown',
                request: log.Request || '',
                status: log.Status || 'Unknown',
                logLength: log.LogLength || 0,
                lastModifiedDate: log.LastModifiedDate || '',
                downloaded: false
            }));
            
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Returning ${formattedLogs.length} formatted logs from SOQL query`);
            return formattedLogs;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error:', error);
            throw error;
        }
    }

    /**
     * Deletes multiple Salesforce debug logs
     * @param logIds Array of log IDs to delete
     * @throws Error if unable to delete logs
     */
    public async deleteServerLogs(logIds: string[]): Promise<void> {
        if (logIds.length === 0) {
            OrgUtils.logDebug('[VisbalExt.SfdxService] No logs to delete');
            throw new Error('No logs to delete');
        }

        OrgUtils.logDebug(`[VisbalExt.SfdxService] Found ${logIds.length} logs to delete`);

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
                    const selectedOrg = await OrgUtils.getSelectedOrg();
                    const deleteCmd = `sf data delete record --sobject ApexLog --record-ids ${idList} --use-tooling-api --target-org ${selectedOrg?.alias} --json`;
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                    await this._executeCommand(deleteCmd);
                    
                    deletedCount += batch.length;
                    OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                } catch (error: any) {
                    OrgUtils.logError(`[VisbalExt.SfdxService] Error deleting batch of logs with new CLI format:`, error);
                    
                    // Try with old CLI format
                    try {
                        // For old CLI format, we need to delete one by one
                        OrgUtils.logDebug('[VisbalExt.SfdxService] Trying to delete logs with old CLI format');
                        let batchDeletedCount = 0;
                        
                        for (const logId of batch) {
                            try {
                                const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                await this._executeCommand(oldDeleteCmd);
                                batchDeletedCount++;
                                OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleted log ${logId} with old CLI format`);
                            } catch (singleError) {
                                OrgUtils.logError(`[VisbalExt.SfdxService] Error deleting log ${logId} with old CLI format:`, singleError instanceof Error ? singleError : new Error(String(singleError)));
                                // Continue with other logs in the batch
                            }
                        }
                        
                        deletedCount += batchDeletedCount;
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                    } catch (oldFormatError) {
                        OrgUtils.logError(`[VisbalExt.SfdxService] Error deleting batch of logs with old CLI format:`, oldFormatError instanceof Error ? oldFormatError : new Error(String(oldFormatError)));
                        // Continue with other batches
                    }
                }
            } catch (error: any) {
                OrgUtils.logError(`[VisbalExt.SfdxService] Error deleting batch of logs:`, error);
                // Continue with other batches
            }
        }

        OrgUtils.logDebug(`[VisbalExt.SfdxService] Successfully deleted ${deletedCount} logs from server`);
    }

    
    //#endregion

    //#region Apex Tests
    /**
     * Lists all Apex classes using SOQL query
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] Listing Apex classes...');
            // Use SOQL query to get Apex classes with TracHier namespace
            const soqlQuery = "SELECT Id, Name, NamespacePrefix FROM ApexClass WHERE NamespacePrefix IN ('TracHier', 'TracRTC') ORDER BY Name";
			const records =  await this.executeSoqlQuery(soqlQuery, true);
			
            OrgUtils.logDebug(`[VisbalExt.SfdxService] Found ${records.length} classes in TracHier, TracRTC  namespace`);
            
            return records.map((cls: any) => ({
                id: cls.Id,
                name: cls.Name,
                fullName: cls.Name,
                namespace: cls.NamespacePrefix,
                status: 'Active'
            }));
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class using SOQL query
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            OrgUtils.logDebug(`[VisbalExt.SfdxService] getApexClassBody -- Getting body for class: ${className}`);
            // Use SOQL query to get the class body
            const soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${className}' LIMIT 1`;
            const records =  await this.executeSoqlQuery(soqlQuery, true);
            
            const classRecord = records[0];
            OrgUtils.logDebug('[VisbalExt.SfdxService] getApexClassBody -- Successfully retrieved class body');
            return classRecord.Body;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.SfdxService] getApexClassBody -- Failed to get class body for ${className}:`, error);
            throw new Error(`Failed to get class body for ${className}: ${error.message}`);
        }
    }

    /**
     * Runs Apex tests
     */
    public async runTests(testClass: string, testMethod?: string, useDefaultOrg: boolean = false): Promise<any> {
        const startTime = Date.now();
        try {
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runTests -- START at ${new Date(startTime).toISOString()}`);
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runTests -- RUNNING class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            
            let command = testMethod
                ? `sf apex run test --tests ${testClass}.${testMethod} --json`
                : `sf apex run test --class-names ${testClass} --json`;
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runTests -- Selected org:`, selectedOrg);
            if (!useDefaultOrg && selectedOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runTests -- _executeCommand: ${command}`);
            const output = await this._executeCommand(command);
            const endTime = Date.now();
           //OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- ${methodLabel} TIME COMPLETED: ${endTime - startTime}ms`);
            const result: { isJson: boolean; content: ResultContent | null; rawContent: string } = OrgUtils.parseResultJson(output.stdout);
            //OrgUtils.logDebug(`[VisbalExt.SfdxService] runTests -- ${methodLabel} -- hasError: ${result.hasError} -- isJson: ${result.isJson} -- RETURN RESULT:`, result);
            if (result.isJson && result.content && 'result' in result.content) {
                return result.content.result;
            } else {
                return result.rawContent;
            }
        } catch (error: any) {
            const endTime = Date.now();
            //
            if (error.stdout) {
                const parsedStdout = JSON.parse(error.stdout);
                OrgUtils.logError(`[VisbalExt.MetadataService] runTests ERROR parsedStdout: `, parsedStdout);
                throw new Error(`Failed to run tests: ${parsedStdout.message}`);
            }
            else {
                OrgUtils.logError(`[VisbalExt.SfdxService] runTests -- Test execution failed after ${endTime - startTime}ms:`, error);
                throw new Error(`Failed to run tests: ${error.message}`);
            }
        }
    }

    public async runManyTests(tests : { 
        classes: string[], 
        methods: { className: string, methodName: string }[],
        runMode: 'sequential' | 'parallel'
    }, useDefaultOrg: boolean = false): Promise<any> {
        const startTime = Date.now();
        try {
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- START at ${new Date(startTime).toISOString()}`);
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- RUNNING TESTS: `,tests);
            
            let command = `sf apex run test --tests ${tests.methods.map(m => `${m.className}.${m.methodName}`).join(' --tests ')}`;
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- command: ${command}`);
            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- selectedOrg.alias:${selectedOrg?.alias} -- Selected org:`, selectedOrg);
            if (!useDefaultOrg && selectedOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
                OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- command: ${command}`);
            }
            if (tests.runMode === 'sequential') {
                command += ' --synchronous';
            }
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- _executeCommand: ${command}`);
            const output = await this._executeCommand(command);
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runManyTests -- TIME COMPLETED: ${endTime - startTime}ms`, output);

            //extract the id out of >  Run "sf apex get test -i 707Sv00000ZArpD -o test-1p6s0vbccpcu@example.com" to retrieve test results
            //consider that after -o can be variable text
            //const id = output.stdout.match(/Run "sf apex get test -i (\d+) -o (.*)" to retrieve test results/)?.[1];
            //OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- id: ${id}`);

            const id2 = output.stdout.match(/Run "sf apex get test -i ([\w-]+) -o (.*)" to retrieve test results/)?.[1];
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runManyTests -- id2: ${id2}`);

            return id2;
        } catch (error: any) {
            const endTime = Date.now();
            //
            if (error.stdout) {
                const parsedStdout = JSON.parse(error.stdout);
                OrgUtils.logError(`[VisbalExt.MetadataService] runManyTests ERROR parsedStdout: `, parsedStdout);
                throw new Error(`Failed to run tests: ${parsedStdout.message}`);
            }
            else {
                OrgUtils.logError(`[VisbalExt.SfdxService] runManyTests -- Test execution failed after ${endTime - startTime}ms:`, error);
                throw new Error(`Failed to run tests: ${error.message}`);
            }
        }
    }

    public async runAllTests(useDefaultOrg: boolean = false, synchronous: boolean = false): Promise<any> {
        const startTime = Date.now();
        try {
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- START at ${new Date(startTime).toISOString()}`);
            let command = `sf apex run test `;

            const selectedOrg = await OrgUtils.getSelectedOrg();
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- Selected org:`, selectedOrg);
            if (synchronous) {
                command += ` --synchronous`;
            }
            if (!useDefaultOrg && selectedOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json --wait 0'; // Add --wait 0 to get immediate response with testRunId
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- _executeCommand: ${command}`);
            const output = await this._executeCommand(command);
            const result = JSON.parse(output.stdout).result;
            OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- Initial result:', result);
            return result;
            /*
            let finalTestResult = result;
            
            // If we have a testRunId, poll for progress
            if (result && result.testRunId) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- Found testRunId:', result.testRunId);
                let completed = false;
                let attempts = 0;
                const maxAttempts = 100; // Maximum number of polling attempts
                const pollInterval = 3000; // Poll every 3 seconds
                OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- WHILE completed: ${completed} attempts: ${attempts} maxAttempts: ${maxAttempts}`);
                while (!completed && attempts < maxAttempts) {
                    try {
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- Polling attempt ${attempts + 1}`);
                        const testRunResult = await this.getTestRunResult(result.testRunId);
                        OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- Poll result:', testRunResult);
                        
                        if (testRunResult && testRunResult.summary) {
                            const { outcome, testsRan, passing, failing, skipped } = testRunResult.summary;
                            OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- Progress: ${testsRan} tests ran, ${passing} passed, ${failing} failed, ${skipped} skipped`);
                            
                            // Update the final result with the latest data
                            finalTestResult = testRunResult;
                            
                            if (outcome === 'Completed' || outcome === 'Failed') {
                                OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- Tests completed with outcome:', outcome);
                                completed = true;
                                break; // Exit the loop but don't return yet
                            }
                        } else {
                            OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- No summary in test run result');
                        }
                    } catch (pollError: any) {
                        OrgUtils.logError('[VisbalExt.SfdxService] runAllTests -- Error polling test progress:', pollError instanceof Error ? pollError : new Error(String(pollError)));
                    }

                    if (!completed) {
                        OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- Waiting ${pollInterval}ms before next poll`);
                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                        attempts++;
                    }
                }

                if (!completed) {
                    OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- Test execution polling timed out');
                    throw new Error('Test execution timed out or exceeded maximum polling attempts');
                }
            } else {
                OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- No testRunId found in result');
            }
            
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.SfdxService] runAllTests -- TIME COMPLETED: ${endTime - startTime}ms`);
            OrgUtils.logDebug('[VisbalExt.SfdxService] runAllTests -- FINAL RESULT:', finalTestResult);
            
            return finalTestResult;
             */
        } catch (error: any) {
            const endTime = Date.now();
            if (error.stdout) {
                const parsedStdout = JSON.parse(error.stdout);
                OrgUtils.logError(`[VisbalExt.MetadataService] runAllTests ERROR parsedStdout: `, parsedStdout);
                throw new Error(`Failed to run tests: ${parsedStdout.message}`);
            }
            else {
                OrgUtils.logError(`[VisbalExt.SfdxService] runAllTests -- Test execution failed after ${endTime - startTime}ms:`, error);
                throw new Error(`Failed to run tests: ${error.message}`);
            }
        }
           
    }

    /**
     * Gets the result of a test run
     * @param testRunId The ID of the test run
     * @returns Promise containing the test run result
     */
    public async getTestRunResult(testRunId: string): Promise<any> {
        const startTime = Date.now();
        try {
            OrgUtils.logDebug(`[VisbalExt.SfdxService] getTestRunResult Getting test run result at ${new Date(startTime).toISOString()}`);
            OrgUtils.logDebug('[VisbalExt.SfdxService] getTestRunResult Test run ID:', testRunId);
            
            // Get the test run details
            let command = `sf apex get test --test-run-id ${testRunId}`;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ` --json`;
            OrgUtils.logDebug(`[VisbalExt.SfdxService] getTestRunResult Executing command: ${command}`);
            const result = await this._executeCommand(command);
            const parsedResult = OrgUtils.parseResultJson(result.stdout);
            
            // Check if we got a valid result
            if (!parsedResult.isJson || !parsedResult.content) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] getTestRunResult No result found in response:', parsedResult);
                return null;
            }else if (parsedResult.hasError) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] getTestRunResult No result found in response:', parsedResult);
                // @ts-ignore - Handle error case where parsedResult has an error property
                return parsedResult.error || null;
            }

            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.SfdxService] getTestRunResult TIME in ${endTime - startTime}ms`);
            OrgUtils.logDebug('[VisbalExt.SfdxService] getTestRunResult RETURN RESULT:', parsedResult.content);
            if (parsedResult.isJson && parsedResult.content) {
                if (Array.isArray(parsedResult.content)) {
                    return parsedResult.content;
                }
                // @ts-ignore - Handle case where content is an object with result property
                return parsedResult.content.result || parsedResult.content;
            }

            // Extract log content from the result, checking multiple possible locations
            const content = (Array.isArray(parsedResult.content) && parsedResult.content[0] || parsedResult.content) as LogResult;
            const logContent = content?.tests?.[0]?.message || 
                             content?.summary?.testExecutionResult || 
                             content?.summary?.outcome || 
                             content?.tests?.[0]?.stackTrace ||
                             content?.tests?.[0]?.outcome ||
                             '';

            OrgUtils.logDebug('[VisbalExt.SfdxService] getTestLog Successfully retrieved test log content');
            return logContent;

        } catch (error: any) {
            const endTime = Date.now();
            OrgUtils.logError(`[VisbalExt.SfdxService] getTestRunResult catch error ${endTime - startTime}ms:`, error);
            
            // If we get a specific error about the test run not being found, return null instead of throwing
            if (error.message && (
                error.message.includes('No test run found') ||
                error.message.includes('not found')
            )) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] getTestRunResult Test run not found yet, returning null');
                return null;
            }
            
            throw error;
        }
    }
    
    /**
     * Gets the ID of a test log
     * @param apexId The ID of the Apex test
     * @returns Promise<string> The log ID
     */
    public async getTestLogId(apexId: string): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] getTestLogId -- apexId:', apexId);

            // Get all logs and filter by timestamp
            const logListCommand = `sf apex list log --json`;
            OrgUtils.logDebug('[VisbalExt.SfdxService] getTestLogId -- logListCommand:', logListCommand);
            const logListResult = await this._executeCommand(logListCommand);
            const logList = JSON.parse(logListResult.stdout);

            if (!logList?.result || !logList.result[0]?.Id) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] getTestLogId No logs found');
                return '';
            }

            return logList.result[0].Id;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] getTestLogId -- error:', error);
            throw error;
        }
    }



    //#endregion

    //#region SOQL Operations
    /**
     * Executes a SOQL query
     */
    public async executeSoqlQuery(query: string, useDefaultOrg: boolean = false, useToolingApi: boolean = false): Promise<any[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] Executing SOQL query:', query);
            
            // Execute the query using the Salesforce CLI
            let command = `sf data query  `;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            //if query includes breakpoint, new line, or other special characters then use the advance query
            const advanceQuery = query.includes('breakpoint') || query.includes('\n') || query.includes(' ') || query.includes('(') || query.length > 200;
            if (advanceQuery)  {
                // Ensure .visbal directory exists
                if (!fs.existsSync('.visbal')) {
                    fs.mkdirSync('.visbal');
                }
                const queryFilePath = '.visbal/query.txt';
                //delete the query.txt file if it exists
                if (fs.existsSync(queryFilePath)) {
                    fs.unlinkSync(queryFilePath);
                }
                //write the query into a file and add this command
                fs.writeFileSync(queryFilePath, query);
                command += ` --file ${queryFilePath}`;
            }
            else {
                command += ` --query "${query}"`;
            }

            if (!useDefaultOrg && selectedOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            if (useToolingApi) {
                command += ' --use-tooling-api';
            }
            command += ' --json';
            const resultStr = await this._executeCommand(command);
            const result = JSON.parse(resultStr.stdout);
            
            if (result.status === 0 && result.result) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] SOQL query executed successfully');
                return result.result.records || [];
            } else {
                // Extract the actual error message from the result
                let errorMessage = result.message || 'Failed to execute SOQL query';
                if (result.result && result.result.error) {
                    errorMessage = result.result.error;
                } else if (result.error && result.error.message) {
                    errorMessage = result.error.message;
                }
                
                // Format common error messages to be more user-friendly
                if (errorMessage.includes('INVALID_TYPE')) {
                    errorMessage = 'Invalid object type or field in query. Please check your SOQL syntax.';
                } else if (errorMessage.includes('INVALID_FIELD')) {
                    errorMessage = 'One or more fields in your query do not exist on the object. Please verify the field names.';
                } else if (errorMessage.includes('MALFORMED_QUERY')) {
                    errorMessage = 'The SOQL query syntax is invalid. Please check your query format.';
                }
                
                throw new Error(errorMessage);
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error executing SOQL query:', error);
            
            // Format error message for better readability
            let userMessage = error.message;
            if (error.message.includes('Command failed')) {
                userMessage = 'Failed to execute SOQL query. Please verify your Salesforce CLI installation and authentication.';
            } else if (error.message.includes('No authorization information found')) {
                userMessage = 'Not authenticated to Salesforce. Please run "sf org login web" to authenticate.';
            }
            
            throw new Error(userMessage);
        }
    }

    /**
     * Executes anonymous Apex code
     */
    public async executeAnonymousApex(code: string): Promise<any> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] Executing anonymous Apex:', code);
            
            // Create a temporary file to store the Apex code
            const tempFile = `${os.tmpdir()}/temp_apex_${Date.now()}.apex`;
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(tempFile),
                Buffer.from(code, 'utf8')
            );

            // Execute the anonymous Apex using the Salesforce CLI
            let command = `sf apex run --file "${tempFile}" `;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            const resultStr = await this._executeCommand(command);
            const result = JSON.parse(resultStr.stdout);
            
            // Clean up the temporary file
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tempFile));
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.SfdxService] Failed to delete temporary file:', error);
            }

            if (result.status === 0) {
                OrgUtils.logDebug('[VisbalExt.SfdxService] Anonymous Apex executed successfully');
                return {
                    success: result.result.success,
                    compileProblem: result.result.compiled ? null : result.result.compileProblem,
                    exceptionMessage: result.result.exceptionMessage,
                    exceptionStackTrace: result.result.exceptionStackTrace,
                    logs: result.result.logs
                };
            } else {
                throw new Error(result.message || 'Failed to execute anonymous Apex');
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error executing anonymous Apex:', error);
            throw error;
        }
    }
    //#endregion

    /**
     * Queries all ApexLog IDs using SOQL
     * @returns Promise<string[]> Array of ApexLog IDs
     */
    public async queryApexLogIds(): Promise<string[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.SfdxService] queryApexLogIds -- Querying all ApexLog IDs');
            
            // Try with new CLI format first
            try {
				const query = 'SELECT Id FROM ApexLog';
				let records =  await this.executeSoqlQuery(query, false, true);
				
                
                if (records) {
                    return records.map((record: any) => record.Id);
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.SfdxService] Error querying ApexLog IDs with new CLI format:', error);
                
                // Try with old CLI format
                const command = 'sfdx force:data:soql:query --query "SELECT Id FROM ApexLog" --usetoolingapi --json';
                OrgUtils.logDebug(`[VisbalExt.SfdxService] queryApexLogIds -- Executing command (old format): ${command}`);
                const queryResult = await this._executeCommand(command);
                const queryData = JSON.parse(queryResult.stdout);
                
                if (queryData.result && queryData.result.records) {
                    return queryData.result.records.map((record: any) => record.Id);
                }
            }
            
            return [];
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.SfdxService] Error querying ApexLog IDs:', error);
            throw error;
        }
    }

    public async executeCommand(command: string): Promise<string> {
        try {
            const result = await this._executeCommand(command);
            return result.stdout;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            OrgUtils.logError('Error executing SFDX command:', error);
            throw new Error(`Failed to execute SFDX command: ${errorMessage}`);
        }
    }
} 
