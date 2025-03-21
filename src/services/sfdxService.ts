//import { execAsync } from '../utils/execUtils';
import { promisify } from 'util';
import { OrgUtils } from '../utils/orgUtils';
import { ApexClass, SalesforceLog } from '../types/salesforceTypes';
import * as fs from 'fs';
import { readFile, unlink } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Maximum buffer size for CLI commands (100MB)
const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

export class SfdxService {
    constructor() {}

    //#region Core Functionality
	private async _executeCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[VisbalExt.SfdxService] _executeCommand Error executing command: ${command}`, error);
                    reject(error);
                    return;
                }
                
                if (stderr && stderr.length > 0) {
                    console.warn(`[VisbalExt.SfdxService] _executeCommand Command produced stderr: ${command}`, stderr);
                }
                
                resolve(stdout);
            });
        });
    }
	
    private async _executeCommand2(command: string, options: any = {}): Promise<string> {
        try {
            const { stdout } = await execAsync(command, { maxBuffer: MAX_BUFFER_SIZE, ...options });
            return stdout.toString();
        } catch (error: any) {
            console.error('[VisbalExt.SfdxService] Error executing command:', error);
            throw error;
        }
    }

    /**
     * Gets the current user ID using either new SF CLI or old SFDX CLI format
     * @returns Promise<string> The user ID
     * @throws Error if unable to get user ID
     */
    public async getCurrentUserId(): Promise<string> {
        let userId = '';
        try {
            // Try with new CLI format first
            try {
                let command = 'sf org display user';
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                console.log('[VisbalExt.SfdxService] getCurrentUserId command:', command);
                const userIdResult = await this._executeCommand(command);
                console.log(`[VisbalExt.SfdxService] User ID result: ${userIdResult}`);
                const userIdJson = JSON.parse(userIdResult);
                userId = userIdJson.result.id;
                console.log(`[VisbalExt.SfdxService] Current user ID: ${userId}`);
            } catch (error) {
                console.error('[VisbalExt.SfdxService] getCurrentUserId Error getting user ID with new CLI format:', error);
                let command = 'sfdx force:user:display';
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                const userIdResult = await this._executeCommand(command);
                console.log(`[VisbalExt.SfdxService] getCurrentUserId User ID result (old format): ${userIdResult}`);
                const userIdJson = JSON.parse(userIdResult);
                userId = userIdJson.result.id;
                console.log(`[VisbalExt.SfdxService] getCurrentUserId Current user ID (old format): ${userId}`);
            }

            return userId;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] getCurrentUserId Error getting user ID:', error);
            throw error;
        }
    }
    //#endregion

    //#region Organization Management
    public async getCurrentOrgAlias(): Promise<string> {
        try {
            console.log('[VisbalExt.SfdxService] getCurrentOrgAlias -- Getting current org alias');
            const command = 'sf org display --json';
            console.log('[VisbalExt.SfdxService] getCurrentOrgAlias -- command:', command);
            const orgInfo = await this._executeCommand(command);
            console.log('[VisbalExt.SfdxService] getCurrentOrgAlias -- orgInfo:', orgInfo);
            const result = JSON.parse(orgInfo);
            if (result.status === 0 && result.result) {
                // Use alias if available, otherwise use username
                const alias = result.result.alias || result.result.username;
                if (!alias) {
                    throw new Error('No org alias or username found');
                }
               
                return alias;
            }
            throw new Error('No default org set');
        } catch (error) {
            console.error('[VisbalExt.CacheService] Error getting current org alias:', error);
            throw error;
        }
    }

    /**
     * Lists all available Salesforce orgs grouped by type
     * @returns Promise containing the organized list of orgs
     */
    public async listOrgs(): Promise<any> {
        try {
            console.log('[VisbalExt.SfdxService] listOrgs -- Fetching org list');
            const command = 'sf org list --all --json';
            console.log('[VisbalExt.SfdxService] getCurrentOrgAlias -- command:', command);
            const resultStr = await this._executeCommand(command);
            const result = JSON.parse(resultStr);
            console.log('[VisbalExt.SfdxService] listOrgs -- result:', result);
            
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

            console.log('[VisbalExt.SfdxService] listOrgs -- Successfully organized org list', organizedOrgs);
            return organizedOrgs;
        } catch (error: any) {
            console.error('[VisbalExt.SfdxService] listOrgs -- Error:', error);
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
                
                console.log(`[VisbalExt.SfdxService] Updating debug level with command: ${command}`);
                await this._executeCommand(command);
            } catch (error) {
                console.error('[VisbalExt.SfdxService] Error updating debug level with new CLI format:', error);
                
                // Try with old CLI format
                let command = `sfdx force:data:record:update --sobjecttype DebugLevel --sobjectid ${debugLevelId} --values "${debugLevelFields}" --usetoolingapi`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                console.log(`[VisbalExt.SfdxService] Updating debug level with command (old format): ${command}`);
                await this._executeCommand(command);
            }
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error updating debug level:', error);
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
            const parsedResult = JSON.parse(result);
            
            if (parsedResult.status === 0 && parsedResult.result && parsedResult.result.id) {
                return parsedResult.result.id;
            }
            throw new Error('Failed to create debug level');
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error creating debug level:', error);
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
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error getting trace flag:', error);
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
                console.log(`[VisbalExt.SfdxService] Deleting trace flag with command: ${command}`);
                await this._executeCommand(command);
            } catch (error) {
                console.error('[VisbalExt.SfdxService] Error deleting trace flag with new CLI format:', error);
                
                // Try with old CLI format
                command = `sfdx force:data:record:delete --sobjecttype TraceFlag --sobjectid ${traceFlagId} --usetoolingapi --json`;
                console.log(`[VisbalExt.SfdxService] Deleting trace flag with command (old format): ${command}`);
                await this._executeCommand(command);
            }
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error deleting trace flag:', error);
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
                
                console.log(`[VisbalExt.SfdxService] Creating trace flag with command: ${command}`);
                const result = await this._executeCommand(command);
                const json = JSON.parse(result);
                return json.result.id;
            } catch (error) {
                console.error('[VisbalExt.SfdxService] Error creating trace flag with new CLI format:', error);
                
                // Try with old CLI format
                let command = `sfdx force:data:record:create --sobjecttype TraceFlag --values "${debugValues}" --usetoolingapi`;
                
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (selectedOrg?.alias) {
                    command += ` --target-org ${selectedOrg.alias}`;
                }
                command += ' --json';
                
                console.log(`[VisbalExt.SfdxService] Creating trace flag with command (old format): ${command}`);
                const result = await this._executeCommand(command);
                const json = JSON.parse(result);
                return json.result.id;
            }
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error creating trace flag:', error);
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
            console.log('[VisbalExt.SfdxService] getLogContent -- logId:', logId);
            
            // Try direct file output first (most reliable for large logs)
            try {
                const selectedOrg = await OrgUtils.getSelectedOrg();
                if (!selectedOrg?.alias) {
                    throw new Error('No org selected');
                }
                
                const tempFile = path.join(os.tmpdir(), `${logId}.log`);
                const command = `sf apex log get --log-id ${logId} > "${tempFile}" --target-org ${selectedOrg.alias}`;
                console.log('[VisbalExt.SfdxService] getLogContent -- command:', command);
                await this._executeCommand(command);
                const content = await readFile(tempFile, 'utf8');
                await unlink(tempFile);
                return content;
            } catch (directError) {
                console.log('[VisbalExt.SfdxService] Direct file output failed, trying JSON format', directError);
                
                // Try JSON format
                try {
                    const selectedOrg = await OrgUtils.getSelectedOrg();
                    if (!selectedOrg?.alias) {
                        throw new Error('No org selected');
                    }
                    
                    const result = await this._executeCommand(`sf apex log get --log-id ${logId} --json --target-org ${selectedOrg.alias}`);
                    const parsedResult = JSON.parse(result);
                    if (parsedResult.result?.log) {
                        return parsedResult.result.log;
                    }
                } catch (jsonError) {
                    console.log('[VisbalExt.SfdxService] JSON format failed, trying direct output', jsonError);
                    
                    // Try direct output as last resort
                    const selectedOrg = await OrgUtils.getSelectedOrg();
                    if (!selectedOrg?.alias) {
                        throw new Error('No org selected');
                    }
                    
                    const { stdout } = await execAsync(
                        `sf apex log get --log-id ${logId} --target-org ${selectedOrg.alias}`,
                        { maxBuffer: MAX_BUFFER_SIZE }
                    );
                    return stdout;
                }
            }
            
            throw new Error('Failed to get log content using any available method');
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error getting log content:', error);
            throw error;
        }
    }

    /**
     * Lists all Apex logs
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     */
    public async listApexLogs(): Promise<string> {
        try {
            console.log('[VisbalExt.SfdxService] Listing Apex logs...');
            let command = 'sf apex list log';
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            
            const result = await this._executeCommand(command);
            return result;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Failed to list Apex logs:', error);
            throw error;
        }
    }
	
	
	/**
     * Lists all Apex logs
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     */
    public async getLogContent(logId: string, useDefaultOrg: boolean = false): Promise<string> {
        try {
            console.log('[VisbalExt.SfdxService] getLogContent...');
            let command = `sf apex get log -i ${logId}`;
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!useDefaultOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            console.log('[VisbalExt.SfdxService] getLogContent -- command:', command);
            const result = await this._executeCommand(command);
            return result;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Failed to getLogContent:', error);
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
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error deleting log:', error);
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
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error deleting logs in bulk:', error);
            throw error;
        }
    }

    /**
     * Fetches Salesforce logs using SOQL query
     * @returns Promise<SalesforceLog[]> Array of Salesforce logs
     * @throws Error if unable to fetch logs
     */
    public async fetchSalesforceLogsSoql(): Promise<SalesforceLog[]> {
        console.log('[VisbalExt.SfdxService] Starting to fetch Salesforce logs via SOQL');
        try {
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!selectedOrg) {
                throw new Error('No org selected');
            }
            console.log(`[VisbalExt.SfdxService] Connected to org: ${selectedOrg.alias}`);

            // Check if SF CLI is installed
            let sfInstalled = false;
            try {
                console.log('[VisbalExt.SfdxService] Checking if SF CLI is installed');
                const sfVersionOutput = await this._executeCommand('sf version');
                console.log(`[VisbalExt.SfdxService] SF CLI version: ${sfVersionOutput.trim()}`);
                sfInstalled = true;
            } catch (err) {
                console.log('[VisbalExt.SfdxService] SF CLI not installed');
            }

            if (!sfInstalled) {
                console.error('[VisbalExt.SfdxService] SF CLI is not installed');
                throw new Error('Please install the Salesforce CLI (npm install -g @salesforce/cli).');
            }

            // SOQL query to fetch debug logs
            const soqlQuery = `SELECT Id, LogUser.Name, Operation, Application, Status, LogLength, LastModifiedDate, Request, Location FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 50`;
            console.log(`[VisbalExt.SfdxService] SOQL query: ${soqlQuery}`);
            
            // Try to execute SOQL query using the new command format first
            let queryResult;
            console.log('[VisbalExt.SfdxService] Trying to execute SOQL query with new CLI format');
            try {
                const command = `sf data query --query "${soqlQuery}" --target-org ${selectedOrg.alias} --json`;
                console.log(`[VisbalExt.SfdxService] Executing: ${command}`);
                const queryData = await this._executeCommand(command);
                console.log('[VisbalExt.SfdxService] Successfully executed SOQL query with new CLI format');
                queryResult = JSON.parse(queryData);
            } catch (error) {
                console.log('[VisbalExt.SfdxService] Failed with new CLI format, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:data:soql:query -q "${soqlQuery}" --target-org ${selectedOrg.alias} --json`;
                    console.log(`[VisbalExt.SfdxService] Executing: ${command}`);
                    const queryData = await this._executeCommand(command);
                    console.log('[VisbalExt.SfdxService] Successfully executed SOQL query with old CLI format');
                    queryResult = JSON.parse(queryData);
                } catch (innerError) {
                    console.error('[VisbalExt.SfdxService] Failed to execute SOQL query with both formats:', innerError);
                    throw new Error('Failed to execute SOQL query. Please ensure your Salesforce CLI is properly configured.');
                }
            }
            
            if (!queryResult.result || !queryResult.result.records || !Array.isArray(queryResult.result.records)) {
                console.log('[VisbalExt.SfdxService] No logs found in query result:', queryResult);
                return [];
            }
            
            console.log(`[VisbalExt.SfdxService] Found ${queryResult.result.records.length} debug logs via SOQL`);
            
            // Format the logs
            console.log('[VisbalExt.SfdxService] Formatting logs from SOQL query');
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
            
            console.log(`[VisbalExt.SfdxService] Returning ${formattedLogs.length} formatted logs from SOQL query`);
            return formattedLogs;
        } catch (error: any) {
            console.error('[VisbalExt.SfdxService] Error:', error);
            throw error;
        }
    }

    /**
     * Fetches the content of a specific Salesforce debug log
     * @param logId The ID of the log to fetch
     * @returns Promise<string> The log content
     * @throws Error if unable to fetch log content
     */
    public async fetchLogContent(logId: string): Promise<string> {
        console.log(`[VisbalExt.SfdxService] Starting to fetch content for log: ${logId}`);
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
                console.log(`[VisbalExt.SfdxService] Creating directory: ${targetDir}`);
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Create a temporary file path for direct output
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Sanitize the log ID to avoid any issues with special characters
            const sanitizedLogId = logId.replace(/[\/\\:*?"<>|]/g, '_');
            // Format: id_operation_status_size_date.log with temp_ prefix
            const tempFilePath = path.join(targetDir, `temp_${sanitizedLogId}_${timestamp}.log`);
            
            console.log(`[VisbalExt.SfdxService] Temp file path: ${tempFilePath}`);
            console.log(`[VisbalExt.SfdxService] Target directory: ${targetDir}`);
            
            // Try direct file output first (most reliable for large logs)
            try {
                console.log(`[VisbalExt.SfdxService] Trying direct file output to: ${tempFilePath}`);
                
                // Try with new CLI format first
                try {
                    const selectedOrg = await OrgUtils.getSelectedOrg();  
                    const command = `sf apex get log -i ${logId} > "${tempFilePath}" --target-org ${selectedOrg?.alias}`;
                    console.log(`[VisbalExt.SfdxService] Executing direct output command: ${command}`);
                    await this._executeCommand(command);
                    
                    // Check if the file was created and has content
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                        console.log(`[VisbalExt.SfdxService] Successfully wrote log to file: ${tempFilePath}`);
                        const logContent = fs.readFileSync(tempFilePath, 'utf8');
                        
                        // Clean up the temporary file
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            console.log(`[VisbalExt.SfdxService] Warning: Could not delete temp file: ${tempFilePath}`);
                        }
                        
                        return logContent;
                    }
                } catch (directOutputError) {
                    console.log('[VisbalExt.SfdxService] Direct output with new CLI format failed, trying old format', directOutputError);
                    
                    // Try with old CLI format
                    try {
                        const command = `sfdx force:apex:log:get --logid ${logId} > "${tempFilePath}"`;
                        console.log(`[VisbalExt.SfdxService] Executing direct output command with old format: ${command}`);
                        await this._executeCommand(command);
                        
                        // Check if the file was created and has content
                        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                            console.log(`[VisbalExt.SfdxService] Successfully wrote log to file with old format: ${tempFilePath}`);
                            const logContent = fs.readFileSync(tempFilePath, 'utf8');
                            
                            // Clean up the temporary file
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                console.log(`[VisbalExt.SfdxService] Warning: Could not delete temp file: ${tempFilePath}`);
                            }
                            
                            return logContent;
                        }
                    } catch (oldDirectOutputError) {
                        console.log('[VisbalExt.SfdxService] Direct output with old CLI format failed', oldDirectOutputError);
                    }
                }
            } catch (error) {
                console.log('[VisbalExt.SfdxService] Direct file output approach failed, falling back to standard methods', error);
            }
            
            // If direct file output failed, try the standard methods with increased buffer size
            
            // Try to fetch the log using the new command format first
            let log;
            console.log('[VisbalExt.SfdxService] Trying to fetch log content with new CLI format');
            try {
                const selectedOrg = await OrgUtils.getSelectedOrg();
                const command = `sf apex get log -i ${logId} --json --target-org ${selectedOrg?.alias}`;
                console.log(`[VisbalExt.SfdxService] Executing: ${command}`);
                const logData = await this._executeCommand(command);
                console.log('[VisbalExt.SfdxService] Successfully fetched log content with new CLI format');
                log = JSON.parse(logData);
                
                // Debug the response structure
                console.log(`[VisbalExt.SfdxService] Response structure: ${JSON.stringify(Object.keys(log))}`);
                if (log.result) {
                    console.log(`[VisbalExt.SfdxService] Result structure: ${typeof log.result} ${Array.isArray(log.result) ? 'array' : 'not array'}`);
                    if (Array.isArray(log.result) && log.result.length > 0) {
                        console.log(`[VisbalExt.SfdxService] First result item keys: ${JSON.stringify(Object.keys(log.result[0]))}`);
                    }
                }
                
                // Handle different response formats
                if (log.result) {
                    if (typeof log.result === 'string') {
                        // Direct log content as string
                        console.log('[VisbalExt.SfdxService] Found log content as string in result');
                        return log.result;
                    } else if (typeof log.result.log === 'string') {
                        // Log content in result.log
                        console.log('[VisbalExt.SfdxService] Found log content in result.log');
                        return log.result.log;
                    } else if (Array.isArray(log.result) && log.result.length > 0) {
                        // Array result format
                        const firstResult = log.result[0];
                        
                        // Check for common properties that might contain the log
                        if (firstResult.log) {
                            console.log('[VisbalExt.SfdxService] Found log content in result[0].log');
                            return firstResult.log;
                        } else if (firstResult.body) {
                            console.log('[VisbalExt.SfdxService] Found log content in result[0].body');
                            return firstResult.body;
                        } else if (firstResult.content) {
                            console.log('[VisbalExt.SfdxService] Found log content in result[0].content');
                            return firstResult.content;
                        } else if (firstResult.text) {
                            console.log('[VisbalExt.SfdxService] Found log content in result[0].text');
                            return firstResult.text;
                        } else {
                            // If we can't find a specific property, try to stringify the first result
                            console.log('[VisbalExt.SfdxService] No specific log property found, using entire result object');
                            return JSON.stringify(firstResult, null, 2);
                        }
                    }
                }
                
                // If we couldn't find the log content in the expected places, try direct CLI output
                console.log('[VisbalExt.SfdxService] Could not find log content in JSON response, trying direct CLI output');
                throw new Error('Log content not found in expected format');
            } catch (error) {
                console.log('[VisbalExt.SfdxService] Failed with new CLI format or parsing, trying old format', error);
                // If the new command fails, try the old format
                try {
                    const command = `sfdx force:apex:log:get --logid ${logId} --json`;
                    console.log(`[VisbalExt.SfdxService] Executing: ${command}`);
                    const logData = await this._executeCommand(command);
                    console.log('[VisbalExt.SfdxService] Successfully fetched log content with old CLI format');
                    log = JSON.parse(logData);
                    
                    // Debug the response structure
                    console.log(`[VisbalExt.SfdxService] Old format response structure: ${JSON.stringify(Object.keys(log))}`);
                    
                    if (log.result && log.result.log) {
                        console.log(`[VisbalExt.SfdxService] Found log content in old format result.log`);
                        return log.result.log;
                    } else {
                        console.error('[VisbalExt.SfdxService] Log not found in old format response:', log);
                        throw new Error('Log content not found in old format response');
                    }
                } catch (innerError) {
                    console.error('[VisbalExt.SfdxService] Failed to fetch log content with both formats:', innerError);
                    
                    // Try one more approach - direct CLI output without JSON
                    try {
                        console.log('[VisbalExt.SfdxService] Trying direct CLI output without JSON');
                        const selectedOrg = await OrgUtils.getSelectedOrg();
                        const directOutput = await this._executeCommand(`sf apex get log -i ${logId} --target-org ${selectedOrg?.alias}`);
                        console.log('[VisbalExt.SfdxService] Successfully fetched log content with direct CLI output');
                        if (directOutput && directOutput.trim().length > 0) {
                            return directOutput;
                        } else {
                            throw new Error('Empty log content from direct CLI output');
                        }
                    } catch (directError) {
                        try {
                            console.log('[VisbalExt.SfdxService] Trying direct CLI output with old format');
                            const oldDirectOutput = await this._executeCommand(`sfdx force:apex:log:get --logid ${logId}`);
                            console.log('[VisbalExt.SfdxService] Successfully fetched log content with direct CLI output (old format)');
                            if (oldDirectOutput && oldDirectOutput.trim().length > 0) {
                                return oldDirectOutput;
                            } else {
                                throw new Error('Empty log content from direct CLI output (old format)');
                            }
                        } catch (oldDirectError) {
                            console.error('[VisbalExt.SfdxService] All attempts to fetch log content failed');
                            throw new Error('Failed to fetch log content. The log may be too large to download. Please try using the Salesforce CLI directly.');
                        }
                    }
                }
            }
            
            // This should not be reached due to the throws above, but just in case
            console.error('[VisbalExt.SfdxService] No log content found in any format');
            throw new Error('Log content not found in any format');
        } catch (error: any) {
            console.error(`[VisbalExt.SfdxService] Error fetching log with ID ${logId}:`, error);
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
            console.log('[VisbalExt.SfdxService] No logs to delete');
            throw new Error('No logs to delete');
        }

        console.log(`[VisbalExt.SfdxService] Found ${logIds.length} logs to delete`);

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
                    console.log(`[VisbalExt.SfdxService] Deleting batch of logs with new CLI format: ${deleteCmd}`);
                    await this._executeCommand(deleteCmd);
                    
                    deletedCount += batch.length;
                    console.log(`[VisbalExt.SfdxService] Deleted batch of ${batch.length} logs with new CLI format, total: ${deletedCount}`);
                } catch (error) {
                    console.error(`[VisbalExt.SfdxService] Error deleting batch of logs with new CLI format:`, error);
                    
                    // Try with old CLI format
                    try {
                        // For old CLI format, we need to delete one by one
                        console.log('[VisbalExt.SfdxService] Trying to delete logs with old CLI format');
                        let batchDeletedCount = 0;
                        
                        for (const logId of batch) {
                            try {
                                const oldDeleteCmd = `sfdx force:data:record:delete --sobjecttype ApexLog --sobjectid ${logId} --json`;
                                console.log(`[VisbalExt.SfdxService] Deleting log with old CLI format: ${oldDeleteCmd}`);
                                await this._executeCommand(oldDeleteCmd);
                                batchDeletedCount++;
                                console.log(`[VisbalExt.SfdxService] Deleted log ${logId} with old CLI format`);
                            } catch (singleError) {
                                console.error(`[VisbalExt.SfdxService] Error deleting log ${logId} with old CLI format:`, singleError);
                                // Continue with other logs in the batch
                            }
                        }
                        
                        deletedCount += batchDeletedCount;
                        console.log(`[VisbalExt.SfdxService] Deleted ${batchDeletedCount} logs with old CLI format, total: ${deletedCount}`);
                    } catch (oldFormatError) {
                        console.error(`[VisbalExt.SfdxService] Error deleting batch of logs with old CLI format:`, oldFormatError);
                        // Continue with other batches
                    }
                }
            } catch (error) {
                console.error(`[VisbalExt.SfdxService] Error deleting batch of logs:`, error);
                // Continue with other batches
            }
        }

        console.log(`[VisbalExt.SfdxService] Successfully deleted ${deletedCount} logs from server`);
    }

    
    //#endregion

    //#region Apex Tests
    /**
     * Lists all Apex classes using SOQL query
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            console.log('[VisbalExt.SfdxService] Listing Apex classes...');
            // Use SOQL query to get Apex classes with TracHier namespace
            const soqlQuery = "SELECT Id, Name, NamespacePrefix FROM ApexClass WHERE NamespacePrefix IN ('TracHier', 'TracRTC') ORDER BY Name";
			const records =  await this.executeSoqlQuery(soqlQuery, true);
			
            console.log(`[VisbalExt.SfdxService] Found ${records.length} classes in TracHier, TracRTC  namespace`);
            
            return records.map((cls: any) => ({
                id: cls.Id,
                name: cls.Name,
                fullName: cls.Name,
                namespace: cls.NamespacePrefix,
                status: 'Active'
            }));
        } catch (error: any) {
            console.error('[VisbalExt.SfdxService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class using SOQL query
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            console.log(`[VisbalExt.SfdxService] getApexClassBody -- Getting body for class: ${className}`);
            // Use SOQL query to get the class body
            const soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${className}' LIMIT 1`;
            const records =  await this.executeSoqlQuery(soqlQuery, true);
            
            const classRecord = records[0];
            console.log('[VisbalExt.SfdxService] getApexClassBody -- Successfully retrieved class body');
            return classRecord.Body;
        } catch (error: any) {
            console.error(`[VisbalExt.SfdxService] getApexClassBody -- Failed to get class body for ${className}:`, error);
            throw new Error(`Failed to get class body for ${className}: ${error.message}`);
        }
    }

    /**
     * Runs Apex tests
     */
    public async runTests(testClass: string, testMethod?: string): Promise<any> {
        const startTime = Date.now();
        try {
            console.log(`[VisbalExt.SfdxService] Starting test execution at ${new Date(startTime).toISOString()}`);
            console.log(`[VisbalExt.SfdxService] Running tests for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            
            const command = testMethod
                ? `sf apex run test --tests ${testClass}.${testMethod} --json`
                : `sf apex run test --class-names ${testClass} --json`;
            
            console.log(`[VisbalExt.SfdxService] Executing command: ${command}`);
            const output = await this._executeCommand(command);
            const result = JSON.parse(output).result;
            
            const endTime = Date.now();
            console.log(`[VisbalExt.SfdxService] Test execution completed in ${endTime - startTime}ms`);
            console.log('[VisbalExt.SfdxService] Test run result:', result);
            
            return result;
        } catch (error: any) {
            const endTime = Date.now();
            console.error(`[VisbalExt.SfdxService] Test execution failed after ${endTime - startTime}ms:`, error);
            throw new Error(`Failed to run tests: ${error.message}`);
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
            console.log(`[VisbalExt.SfdxService] Getting test run result at ${new Date(startTime).toISOString()}`);
            console.log('[VisbalExt.SfdxService] Test run ID:', testRunId);
            
            // Get the test run details
            let command = `sf apex get test --test-run-id ${testRunId}`;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                //command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            console.log(`[VisbalExt.SfdxService] Executing command: ${command}`);
            const result = await this._executeCommand(command);
            const parsedResult = JSON.parse(result);
            
            const endTime = Date.now();
            console.log(`[VisbalExt.SfdxService] Test run result retrieved in ${endTime - startTime}ms`);
            console.log('[VisbalExt.SfdxService] Test run details:', parsedResult);
            
            return parsedResult.result || null;
        } catch (error) {
            const endTime = Date.now();
            console.error(`[VisbalExt.SfdxService] Error getting test run result after ${endTime - startTime}ms:`, error);
            throw error;
        }
    }

    /**
     * Gets the content of a test log
     * @param testRunId The ID of the test run
     * @returns Promise<string> The log content
     */
    public async getTestLog(testRunId: string): Promise<string> {
        try {
            console.log('[VisbalExt.SfdxService] getTestLog -- Getting test log:', testRunId);
            let command = `sf apex get test --test-run-id ${testRunId}`;
            
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            
            console.log(`[VisbalExt.SfdxService] Executing command: ${command}`);
            const result = await this._executeCommand(command);
            const parsedResult = JSON.parse(result);
            
            if (!parsedResult.result) {
                console.warn('[VisbalExt.SfdxService] No test log content found');
                return '';
            }

            // Extract log content from the result, checking multiple possible locations
            const logContent = parsedResult.result.tests?.[0]?.message || 
                             parsedResult.result.summary?.testExecutionResult || 
                             parsedResult.result.summary?.outcome || 
                             parsedResult.result.tests?.[0]?.stackTrace ||
                             parsedResult.result.tests?.[0]?.outcome ||
                             '';

            console.log('[VisbalExt.SfdxService] Successfully retrieved test log content');
            return logContent;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error getting test log:', error);
            // Return empty string instead of throwing to maintain consistent return type
            return '';
        }
    }

    /**
     * Gets the ID of a test log
     * @param apexId The ID of the Apex test
     * @returns Promise<string> The log ID
     */
    public async getTestLogId(apexId: string): Promise<string> {
        try {
            console.log('[VisbalExt.SfdxService] getTestLogId -- apexId:', apexId);

            // Get test run details to get the start time
            let command = `sf apex get test --test-run-id ${apexId} `;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                //command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            console.log(`[VisbalExt.SfdxService] Executing command: ${command}`);

            const testRunDetailsResult = await this._executeCommand(command);
            const testRunDetails = JSON.parse(testRunDetailsResult);

            if (!testRunDetails?.result?.summary?.testStartTime) {
                console.warn('[VisbalExt.SfdxService] No test start time found in test run details');
                return '';
            }

            // Get all logs and filter by timestamp
            const logListCommand = `sf apex list log --json`;
            console.log('[VisbalExt.SfdxService] getTestLogId -- logListCommand:', logListCommand);
            const logListResult = await this._executeCommand(logListCommand);
            const logList = JSON.parse(logListResult);

            if (!logList?.result || !logList.result[0]?.Id) {
                console.warn('[VisbalExt.SfdxService] No logs found');
                return '';
            }

            return logList.result[0].Id;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] getTestLogId -- error:', error);
            throw error;
        }
    }

    /**
     * Gets the log content for a test run
     * @param testRunId The ID of the test run
     * @returns Promise containing the log content and metadata
     */
    public async getTestRunLog(testRunId: string): Promise<any> {
        try {
            console.log('[VisbalExt.SfdxService] Fetching logs for completed test run:', testRunId);
            
            // First verify the test run has completed
            let command = `sf apex get test --test-run-id ${testRunId} `;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (selectedOrg?.alias) {
                //command += ` --target-org ${selectedOrg.alias}`;
            }
            command += ' --json';
            console.log(`[VisbalExt.SfdxService] Executing command: ${command}`);

            const testResult = await this._executeCommand(command);
            const parsedTestResult = JSON.parse(testResult);
            
            if (!parsedTestResult.result?.tests?.[0]) {
                throw new Error('Test results not found');
            }

            // Get the test run logs
            try {
                const logResult = await this._executeCommand(`sf apex list log --json`);
                const parsedLog = JSON.parse(logResult);
                
                // Find the most recent log for this test run
                const testLogs = parsedLog.result.filter((log: any) => 
                    log.Operation === 'ApexTest' && 
                    new Date(log.StartTime) >= new Date(parsedTestResult.result.summary.testStartTime)
                ).sort((a: any, b: any) => 
                    new Date(b.StartTime).getTime() - new Date(a.StartTime).getTime()
                );

                if (testLogs.length > 0) {
                    const latestLog = testLogs[0];
                    // Fetch the actual log content
                    const logContent = await this._executeCommand(`sf apex get log --log-id ${latestLog.Id} --json`);
                    const parsedLogContent = JSON.parse(logContent);

                    if (parsedLogContent.result) {
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (workspaceRoot) {
                            const logsDir = `${workspaceRoot}/.sf/logs`;
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const fileName = `test-run-${testRunId}-${timestamp}.log`;
                            const targetFilePath = `${logsDir}/${fileName}`;

                            // Create logs directory if it doesn't exist
                            await vscode.workspace.fs.createDirectory(vscode.Uri.file(logsDir));
                            
                            console.log('[VisbalExt.SfdxService] getTestRunLog -- parsedLogContent.result.log:', parsedLogContent.result.log);
                            // Write log content to file
                            await vscode.workspace.fs.writeFile(
                                vscode.Uri.file(targetFilePath),
                                Buffer.from(parsedLogContent.result.log.result[0].log || '', 'utf8')
                            );

                            // Open the log file
                            const document = await vscode.workspace.openTextDocument(targetFilePath);
                            await vscode.window.showTextDocument(document);
                            
                            console.log('[VisbalExt.SfdxService] Test run log saved and opened:', targetFilePath);
                            return {
                                logId: latestLog.Id,
                                logPath: targetFilePath,
                                content: parsedLogContent.result.log
                            };
                        }
                    }
                } else {
                    console.warn('[VisbalExt.SfdxService] No matching logs found for test run');
                }
            } catch (logError) {
                console.error('[VisbalExt.SfdxService] Error fetching test run log:', logError);
                throw logError;
            }

            return null;
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error getting test run log:', error);
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
            console.log('[VisbalExt.SfdxService] Executing SOQL query:', query);
            
            // Execute the query using the Salesforce CLI
            let command = `sf data query --query "${query}" --json`;
            const selectedOrg = await OrgUtils.getSelectedOrg();
            if (!useDefaultOrg && selectedOrg?.alias) {
                command += ` --target-org ${selectedOrg.alias}`;
            }
            if (useToolingApi) {
                command += ' --use-tooling-api';
            }
            command += ' --json';
            const resultStr = await this._executeCommand(command);
            const result = JSON.parse(resultStr);
            
            if (result.status === 0 && result.result) {
                console.log('[VisbalExt.SfdxService] SOQL query executed successfully');
                return result.result.records || [];
            } else {
                throw new Error(result.message || 'Failed to execute SOQL query');
            }
        } catch (error: any) {
            console.error('[VisbalExt.SfdxService] Error executing SOQL query:', error);
            throw error;
        }
    }

    /**
     * Executes anonymous Apex code
     */
    public async executeAnonymousApex(code: string): Promise<any> {
        try {
            console.log('[VisbalExt.SfdxService] Executing anonymous Apex:', code);
            
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
            const result = JSON.parse(resultStr);
            
            // Clean up the temporary file
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tempFile));
            } catch (error) {
                console.warn('[VisbalExt.SfdxService] Failed to delete temporary file:', error);
            }

            if (result.status === 0) {
                console.log('[VisbalExt.SfdxService] Anonymous Apex executed successfully');
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
            console.error('[VisbalExt.SfdxService] Error executing anonymous Apex:', error);
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
            console.log('[VisbalExt.SfdxService] queryApexLogIds -- Querying all ApexLog IDs');
            
            // Try with new CLI format first
            try {
				const query = 'SELECT Id FROM ApexLog';
				let records =  await this.executeSoqlQuery(query, false, true);
				
                
                if (records) {
                    return records.map((record: any) => record.Id);
                }
            } catch (error) {
                console.error('[VisbalExt.SfdxService] Error querying ApexLog IDs with new CLI format:', error);
                
                // Try with old CLI format
                const command = 'sfdx force:data:soql:query --query "SELECT Id FROM ApexLog" --usetoolingapi --json';
                console.log(`[VisbalExt.SfdxService] queryApexLogIds -- Executing command (old format): ${command}`);
                const queryResult = await this._executeCommand(command);
                const queryData = JSON.parse(queryResult);
                
                if (queryData.result && queryData.result.records) {
                    return queryData.result.records.map((record: any) => record.Id);
                }
            }
            
            return [];
        } catch (error) {
            console.error('[VisbalExt.SfdxService] Error querying ApexLog IDs:', error);
            throw error;
        }
    }
} 
