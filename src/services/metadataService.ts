import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { readFile, unlink } from 'fs/promises';

const execAsync = promisify(exec);

export interface ApexClass {
    id?: string;
    name: string;
    fullName?: string;
    status?: string;
    body?: string;
    namespace?: string;
}

export interface TestMethod {
    name: string;
    isTestMethod: boolean;
}

export class MetadataService {
    constructor() {}

    /**
     * Executes a CLI command and returns the result
     */
    private async executeCliCommand(command: string): Promise<string> {
        try {
            console.log(`[VisbalExt.MetadataService] Executing CLI command: ${command}`);
            
            // Get the default org username - don't use bash on Windows
            try {
                const sfCommand = 'sf config get target-org --json';
                console.log(`[VisbalExt.MetadataService] Checking target org with: ${sfCommand}`);
                
                const { stdout: orgInfo } = await execAsync(sfCommand);
                
                if (orgInfo && orgInfo.trim()) {
                    try {
                        const parsedInfo = JSON.parse(orgInfo);
                        const targetOrg = parsedInfo.result && parsedInfo.result[0] ? parsedInfo.result[0].value : null;
                        
                        if (targetOrg) {
                            console.log(`[VisbalExt.MetadataService] Using target org: ${targetOrg}`);
                            
                            // Add the target org to the command if it doesn't already have one
                            if (!command.includes('-o') && !command.includes('--target-org')) {
                                command = `${command.replace(' --json', '')} --target-org ${targetOrg} --json`;
                            }
                        } else {
                            throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                        }
                    } catch (parseError) {
                        console.error('[VisbalExt.MetadataService] Failed to parse org info:', parseError);
                        throw new Error('Failed to parse org info. Please ensure Salesforce CLI is properly installed.');
                    }
                } else {
                    throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                }
            } catch (orgError: any) {
                console.warn('[MetadataService] Failed to get target org:', orgError);
                
                // Check if Salesforce CLI is installed
                try {
                    await execAsync('sf --version');
                } catch (cliError) {
                    throw new Error('Salesforce CLI (sf) is not installed or not in PATH. Please install it from https://developer.salesforce.com/tools/sfdxcli');
                }
                
                throw new Error('No default org set. Please use "sf org set default" to set a default org.');
            }
            
            // Execute the command directly without bash -c wrapper
            console.log(`[VisbalExt.MetadataService] Executing final command: ${command}`);
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                console.warn(`[MetadataService] Command produced stderr: ${stderr}`);
                // Only throw if it seems like a real error, as some commands output warnings to stderr
                if (stderr.includes('Error:') || stderr.includes('error:')) {
                    throw new Error(stderr);
                }
            }
            
            console.log(`[VisbalExt.MetadataService] Command executed successfully`);
            return stdout;
        } catch (error: any) {
            console.error(`[VisbalExt.MetadataService] Command execution failed:`, error);
            throw error;
        }
    }

    /**
     * Executes a SOQL query and returns the results
     * @param query The SOQL query to execute
     * @returns Promise containing the query results
     */
    public async executeSoqlQuery(query: string): Promise<any[]> {
        try {
            console.log('[VisbalExt.MetadataService] Executing SOQL query:', query);
            
            // Execute the query using the Salesforce CLI
            const command = `sf data query --query "${query}" --json`;
            const resultStr = await this.executeCliCommand(command);
            const result = JSON.parse(resultStr);
            
            if (result.status === 0 && result.result) {
                console.log('[VisbalExt.MetadataService] SOQL query executed successfully');
                return result.result.records || [];
            } else {
                throw new Error(result.message || 'Failed to execute SOQL query');
            }
        } catch (error: any) {
            console.error('[VisbalExt.MetadataService] Error executing SOQL query:', error);
            throw error;
        }
    }

    /**
     * Lists all Apex classes using SOQL query
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            console.log('[VisbalExt.MetadataService] Listing Apex classes...');
            // Use SOQL query to get Apex classes with TracHier namespace
            const soqlQuery = "SELECT Id, Name, NamespacePrefix FROM ApexClass WHERE NamespacePrefix = 'TracHier' ORDER BY Name";
            const command = `sf data query --query "${soqlQuery}" --json`;
            
            console.log(`[VisbalExt.MetadataService] Executing SOQL query: ${soqlQuery}`);
            const output = await this.executeCliCommand(command);
            const parsedOutput = JSON.parse(output);
            
            if (!parsedOutput.result || !parsedOutput.result.records) {
                console.log('[VisbalExt.MetadataService] No classes found or unexpected response format');
                return [];
            }
            
            const records = parsedOutput.result.records;
            console.log(`[VisbalExt.MetadataService] Found ${records.length} classes in TracHier namespace`);
            
            return records.map((cls: any) => ({
                id: cls.Id,
                name: cls.Name,
                fullName: cls.Name,
                namespace: cls.NamespacePrefix,
                status: 'Active'
            }));
        } catch (error: any) {
            console.error('[VisbalExt.MetadataService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class using SOQL query
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            console.log(`[VisbalExt.MetadataService] Getting body for class: ${className}`);
            // Use SOQL query to get the class body
            const soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${className}' LIMIT 1`;
            const command = `sf data query --query "${soqlQuery}" --json`;
            
            console.log(`[VisbalExt.MetadataService] Executing SOQL query: ${soqlQuery}`);
            const output = await this.executeCliCommand(command);
            const parsedOutput = JSON.parse(output);
            
            if (!parsedOutput.result || !parsedOutput.result.records || parsedOutput.result.records.length === 0) {
                throw new Error(`Class ${className} not found`);
            }
            
            const classRecord = parsedOutput.result.records[0];
            console.log('[VisbalExt.MetadataService] Successfully retrieved class body');
            return classRecord.Body;
        } catch (error: any) {
            console.error(`[VisbalExt.MetadataService] Failed to get class body for ${className}:`, error);
            throw new Error(`Failed to get class body for ${className}: ${error.message}`);
        }
    }

    /**
     * Extracts test methods from a class body
     */
    public extractTestMethods(classBody: string): TestMethod[] {
        console.log('[VisbalExt.MetadataService] Extracting test methods from class body...');
        const methods: TestMethod[] = [];
        
        // Regular expressions to match test methods - improved to catch more patterns
        const patterns = [
            /@isTest\s+(?:static\s+)?void\s+(\w+)\s*\(/g,
            /testMethod\s+(?:static\s+)?void\s+(\w+)\s*\(/g,
            /@isTest\s+(?:static\s+)?(?:void\s+)?(\w+)\s*\(/g,
            /static\s+(?:void|testmethod)\s+(\w+)\s*\(/gi,
            /(?:public|private|protected)?\s+static\s+(?:void|testmethod)\s+(\w+)\s*\(/gi,
            /(?:public|private|protected)?\s+(?:static)?\s+(?:void)?\s+(?:testmethod)?\s+(\w+Test)\s*\(/gi
        ];

        // If the class itself is annotated with @isTest, all methods could be test methods
        const isTestClass = classBody.includes('@isTest') || 
                           classBody.toLowerCase().includes('testmethod');
        
        if (isTestClass) {
            // Look for all methods in the class
            const methodPattern = /(?:public|private|protected)?\s+(?:static)?\s+(?:void)?\s+(\w+)\s*\(/gi;
            let methodMatch;
            while ((methodMatch = methodPattern.exec(classBody)) !== null) {
                const methodName = methodMatch[1];
                // Skip constructor and known non-test methods
                if (!methodName.includes('__') && 
                    !['equals', 'hashCode', 'toString', 'clone'].includes(methodName) &&
                    !methods.some(m => m.name === methodName)) {
                    console.log(`[VisbalExt.MetadataService] Found potential test method in @isTest class: ${methodName}`);
                    methods.push({
                        name: methodName,
                        isTestMethod: true
                    });
                }
            }
        }
        
        // Use the specific test method patterns
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(classBody)) !== null) {
                const methodName = match[1];
                if (!methods.some(m => m.name === methodName)) {
                    console.log(`[VisbalExt.MetadataService] Found test method: ${methodName}`);
                    methods.push({
                        name: methodName,
                        isTestMethod: true
                    });
                }
            }
        }

        console.log(`[VisbalExt.MetadataService] Extracted ${methods.length} test methods`);
        return methods;
    }

    /**
     * Checks if a class is a test class based on its body
     */
    public isTestClass(classBody: string): boolean {
        console.log('[VisbalExt.MetadataService] Checking if class is a test class...');
        const isTest = classBody.includes('@isTest') || 
                      classBody.includes('testMethod') || 
                      this.extractTestMethods(classBody).length > 0;
        console.log(`[VisbalExt.MetadataService] Is test class: ${isTest}`);
        return isTest;
    }

    /**
     * Gets all test classes from the org
     */
    public async getTestClasses(): Promise<ApexClass[]> {
        try {
            console.log('[VisbalExt.MetadataService] Getting all test classes...');
            // Get all classes first
            const allClasses = await this.listApexClasses();
            console.log(`[VisbalExt.MetadataService] Retrieved ${allClasses.length} total classes`);
            
            // Filter test classes by name only (without checking body)
            const testClasses = allClasses.filter(cls => 
                cls.name.toLowerCase().includes('test') || 
                cls.name.toLowerCase().endsWith('tests')
            );
            
            console.log(`[VisbalExt.MetadataService] Found ${testClasses.length} test classes by name`);
            return testClasses;
        } catch (error: any) {
            console.error('[VisbalExt.MetadataService] Failed to get test classes:', error);
            throw new Error(`Failed to get test classes: ${error.message}`);
        }
    }

    /**
     * Runs Apex tests
     */
    public async runTests(testClass: string, testMethod?: string): Promise<any> {
        try {
            console.log(`[VisbalExt.MetadataService] Running tests for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            const command = testMethod
                ? `sf apex run test --tests ${testClass}.${testMethod} --json`
                : `sf apex run test --class-names ${testClass} --json`;
            const output = await this.executeCliCommand(command);
            const result = JSON.parse(output).result;
            console.log('[VisbalExt.MetadataService] Test run completed successfully');
            return result;
        } catch (error: any) {
            console.error('[VisbalExt.MetadataService] Failed to run tests:', error);
            throw new Error(`Failed to run tests: ${error.message}`);
        }
    }

    /**
     * Gets an Apex log by its ID
     */
    public async getApexLog(logId: string): Promise<any> {
        try {
            console.log(`[VisbalExt.MetadataService] Getting Apex log with ID: ${logId}`);
            const output = await this.executeCliCommand(`sf apex get log --log-id ${logId} --json`);
            const result = JSON.parse(output).result;
            console.log('[VisbalExt.MetadataService] Successfully retrieved Apex log');
            return result;
        } catch (error: any) {
            console.error(`[VisbalExt.MetadataService] Failed to get Apex log ${logId}:`, error);
            throw new Error(`Failed to get Apex log: ${error.message}`);
        }
    }

    /**
     * Lists Apex logs
     */
    public async listApexLogs(): Promise<any[]> {
        try {
            console.log('[VisbalExt.MetadataService] Listing Apex logs...');
            const output = await this.executeCliCommand('sf apex list log --json');
            const result = JSON.parse(output).result;
            console.log(`[VisbalExt.MetadataService] Found ${result.length} logs`);
            return result;
        } catch (error: any) {
            console.error('[VisbalExt.MetadataService] Failed to list Apex logs:', error);
            throw new Error(`Failed to list Apex logs: ${error.message}`);
        }
    }

    /**
     * Gets test methods for a specific class
     */
    public async getTestMethodsForClass(className: string): Promise<TestMethod[]> {
        try {
            console.log(`[VisbalExt.MetadataService] Getting test methods for class: ${className}`);
            // Get the class body
            const classBody = await this.getApexClassBody(className);
            
            // Extract test methods from the body
            const testMethods = this.extractTestMethods(classBody);
            console.log(`[VisbalExt.MetadataService] Found ${testMethods.length} test methods in ${className}`);
            
            return testMethods;
        } catch (error: any) {
            console.error(`[VisbalExt.MetadataService] Failed to get test methods for ${className}:`, error);
            throw new Error(`Failed to get test methods for ${className}: ${error.message}`);
        }
    }

    public async getTestLog(logId: string): Promise<string> {
        try {
            console.log('[VisbalExt.MetadataService] Getting test log:', logId);
            const result = await this.executeCliCommand(`sf apex get log --log-id ${logId} --json`);
            const parsedResult = JSON.parse(result);
            console.log('[VisbalExt.MetadataService] Test log retrieved');
            return parsedResult.result?.log || '';
        } catch (error) {
            console.error('[VisbalExt.MetadataService] Error getting test log:', error);
            throw error;
        }
    }

    public async getTestRunResult(testRunId: string): Promise<any> {
        try {
            console.log('[VisbalExt.MetadataService] Getting test run result:', testRunId);
            
            // Get the test run details
            const result = await this.executeCliCommand(`sf apex get test --test-run-id ${testRunId} --json`);
            const parsedResult = JSON.parse(result);
            console.log('[VisbalExt.MetadataService] Test run result retrieved:', parsedResult);
			console.log('[VisbalExt.MetadataService] TEST FINISH');
            // Return the result immediately - log fetching will be handled separately after test completion
            return parsedResult.result || null;
        } catch (error) {
            console.error('[VisbalExt.MetadataService] Error getting test run result:', error);
            throw error;
        }
    }

    public async getTestRunLog(testRunId: string): Promise<any> {
        try {
            console.log('[VisbalExt.MetadataService] Fetching logs for completed test run:', testRunId);
            
            // First verify the test run has completed
            const testResult = await this.executeCliCommand(`sf apex get test --test-run-id ${testRunId} --json`);
            const parsedTestResult = JSON.parse(testResult);
            
            if (!parsedTestResult.result?.tests?.[0]) {
                throw new Error('Test results not found');
            }

            // Get the test run logs
            try {
                const logResult = await this.executeCliCommand(`sf apex list log --json`);
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
                    const logContent = await this.executeCliCommand(`sf apex get log --log-id ${latestLog.Id} --json`);
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
                            
                            // Write log content to file
                            await vscode.workspace.fs.writeFile(
                                vscode.Uri.file(targetFilePath),
                                Buffer.from(parsedLogContent.result.log || '', 'utf8')
                            );

                            // Open the log file
                            const document = await vscode.workspace.openTextDocument(targetFilePath);
                            await vscode.window.showTextDocument(document);
                            
                            console.log('[VisbalExt.MetadataService] Test run log saved and opened:', targetFilePath);
                            return {
                                logId: latestLog.Id,
                                logPath: targetFilePath,
                                content: parsedLogContent.result.log
                            };
                        }
                    }
                } else {
                    console.warn('[VisbalExt.MetadataService] No matching logs found for test run');
                }
            } catch (logError) {
                console.error('[VisbalExt.MetadataService] Error fetching test run log:', logError);
                throw logError;
            }

            return null;
        } catch (error) {
            console.error('[VisbalExt.MetadataService] Error getting test run log:', error);
            throw error;
        }
    }
    
     public async executeAnonymousApex(code: string): Promise<any> {
        try {
            console.log('[VisbalExt.MetadataService] Executing anonymous Apex:', code);
            
            // Create a temporary file to store the Apex code
            const tempFile = `${os.tmpdir()}/temp_apex_${Date.now()}.apex`;
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(tempFile),
                Buffer.from(code, 'utf8')
            );

            // Execute the anonymous Apex using the Salesforce CLI
            const command = `sf apex run --file "${tempFile}" --json`;
            const resultStr = await this.executeCliCommand(command);
            const result = JSON.parse(resultStr);
            
            // Clean up the temporary file
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tempFile));
            } catch (error) {
                console.warn('[VisbalExt.MetadataService] Failed to delete temporary file:', error);
            }

            if (result.status === 0) {
                console.log('[VisbalExt.MetadataService] Anonymous Apex executed successfully');
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
            console.error('[VisbalExt.MetadataService] Error executing anonymous Apex:', error);
            throw error;
        }
    }
	
	
	//#region LOGFILE
    // Add this method to execute commands
    private async _executeCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[VisbalExt.MetadataService] Error executing command: ${command}`, error);
                    reject(error);
                    return;
                }
                
                if (stderr && stderr.length > 0) {
                    console.warn(`[VisbalExt.MetadataService] Command produced stderr: ${command}`, stderr);
                }
                
                resolve(stdout);
            });
        });
    }


	 public async getLogContent(logId: string): Promise<string> {
        try {
			console.log('[VisbalExt.MetadataService] getLogContent -- logId:',logId);
            const tempFile = path.join(os.tmpdir(), `${logId}.log`);
            const command = `sf apex log get --log-id ${logId} > "${tempFile}"`;
			console.log('[VisbalExt.MetadataService] getLogContent -- command:',command);
            await this._executeCommand(command);
            const content = await readFile(tempFile, 'utf8');
            await unlink(tempFile);
            return content;
        } catch (error) {
            console.error('[VisbalExt.MetadataService] Error getting log content:', error);
            throw error;
        }
    }
	
	
	public async fetchSalesforceLogs(apexId: string): Promise<string[]> {
        try {
            console.log('[VisbalExt.MetadataService] fetchSalesforceLogs -- apexId:', apexId);

            // Get test run details to ensure it exists and get potential log Ids.
            const testRunDetailsCommand = `sf apex get test --test-run-id ${apexId} --json`;
            console.log('[VisbalExt.MetadataService] fetchSalesforceLogs -- testRunDetailsCommand:', testRunDetailsCommand);
            const testRunDetailsResult = await this._executeCommand2(testRunDetailsCommand);
            console.log(`[VisbalExt.MetadataService] fetchSalesforceLogs testRunDetailsResult`, testRunDetailsResult);

            // Get the log IDs associated with the test run.
            const logListCommand = `sf apex log list --test-run-id ${apexId} --json`;
            console.log('[VisbalExt.MetadataService] fetchSalesforceLogs -- logListCommand:', logListCommand);
            const logListResult = await this._executeCommand2(logListCommand);
            console.log(`[VisbalExt.MetadataService] fetchSalesforceLogs logListResult`, logListResult);

            // Parse the JSON output and extract the log IDs.
            const logListJson = JSON.parse(logListResult.stdout);
            const logIds: string[] = Array.isArray(logListJson) ? logListJson.map((log: any) => log.Id) : [];
            console.log('[VisbalExt.MetadataService] fetchSalesforceLogs -- logIds:', logIds);

            return logIds;
        } catch (error) {
            console.error('[VisbalExt.MetadataService] fetchSalesforceLogs -- error:', error);
            throw error;
        }
    }
	
	
	private async _executeCommand2(command: string): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            exec(command, (error: Error | null, stdout: string, stderr: string) => {
                if (error) {
                    // If there's an error but we still have output, return the output
                    if (stdout || stderr) {
                        resolve({ stdout: stdout || '', stderr: stderr || '' });
                    } else {
                        reject(error);
                    }
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

	//#endregion LOGFILE
} 