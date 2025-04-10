import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync, symlinkSync } from 'fs';
import { readFileSync } from 'fs';
import { SfdxService } from './sfdxService';
import { OrgUtils } from '../utils/orgUtils';

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

interface JsoResult {
    result?: Array<{ log: string }>;
}

export class MetadataService {
    private _sfdxService: SfdxService;
	  
    constructor() {
		this._sfdxService = new SfdxService();
	}

    private async executeCliCommandAnonymous(command: string): Promise<string> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandAnonymous Executing CLI command: ${command}`);
            
            // Execute the command directly without bash -c wrapper
            //OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandAnonymous Executing final command: ${command}`);
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                OrgUtils.logDebug(`[MetadataService] Command produced stderr: ${stderr}`);
                // Only throw if it seems like a real error, as some commands output warnings to stderr
                if (stderr.includes('Error:') || stderr.includes('error:')) {
                    throw new Error(stderr);
                }
            }
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandAnonymous Command executed successfully`);
            return stdout;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.MetadataService] executeCliCommandAnonymous Command execution failed:`,  error);
            throw error;
        }
    }
    /**
     * Executes a CLI command and returns the result
     */
    private async executeCliCommand(command: string): Promise<string> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand Executing CLI command: ${command}`);
            
            // Get the default org username - don't use bash on Windows
            try {
                //const sfCommand = 'sf config get target-org --json';
                //OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 1 command: ${command}`);
                
                const { stdout: result, stderr } = await execAsync(command);
                OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 1 result: `, result);result
                if (stderr) {
                    OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 1 stderr: `, stderr);
                }
                
                if (result && result.trim()) {
                    try {
                        return result;                   
                    } catch (parseError: any) {
                        OrgUtils.logError('[VisbalExt.MetadataService] executeCliCommand execAsync 1 parseError:', parseError);
                        OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 parseError.message:', parseError.message);
                        OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 parseError.stack:', parseError.stack);     
                      
                        throw new Error(parseError.message);
                        //const parseError1 = JSON.parse(parseError);
                        //OrgUtils.logError('[VisbalExt.MetadataService] executeCliCommand parseError1:', parseError1);
                        //throw new Error('Failed to parse org info. Please ensure Salesforce CLI is properly installed.');
                    }
                } else {
                    throw new Error('Executing executeCliCommand failed');
                }
            } catch (orgError : any) {
                //OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 Failed to get target org:', orgError);
                //const orgError1 = JSON.parse(orgError);
                //OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 Failed orgError1:', orgError1);
                //OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 Failed orgError1.message:', orgError1.message);
                //OrgUtils.logDebug('[VisbalExt.MetadataService] executeCliCommand execAsync 1 Failed orgError1.stack:', orgError1.stack);
                // Check if Salesforce CLI is installed
                try {
                    await execAsync('sf --version');
                } catch (cliError) {
                    throw new Error('Salesforce CLI (sf) is not installed or not in PATH. Please install it from https://developer.salesforce.com/tools/sfdxcli');
                }
                
                if (orgError.stdout) {
                    const parsedStdout = JSON.parse(orgError.stdout);
                    OrgUtils.logError(`[VisbalExt.MetadataService] runTests ERROR parsedStdout: `, parsedStdout);
                    throw new Error(`Failed to run tests: ${parsedStdout.message}`);
                }
                else {
                    throw new Error(`Failed to run tests: ${orgError.message}`);
                }
            }
            
            // Execute the command directly without bash -c wrapper
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 2 command: ${command}`);
            const { stdout, stderr } = await execAsync(command);
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 2 stdout: `, stdout);
            
            if (stderr) {
                OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 2 stderr: `, stderr);
                
                return '';
                //OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand Command produced stderr: ${stderr}`);
                // Only throw if it seems like a real error, as some commands output warnings to stderr
                //if (stderr.includes('Error:') || stderr.includes('error:')) {
                //    throw new Error(stderr);
                //}
            }
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommand execAsync 2 Command executed successfully`);
            return stdout;
        } catch (error: any) {
            //const parsedStdout = JSON.parse(error.stdout);
            //OrgUtils.logError(`[VisbalExt.MetadataService] executeCliCommand execAsync 2 ERROR_stdout: `, parsedStdout);
            throw error;
           
            

        }
    }


    private async executeCliCommandTargetOrg(command: string, targetOrg: string): Promise<string> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandTargetOrg Executing CLI command: ${command}`);
            
            // Get the default org username - don't use bash on Windows
            try {
                const sfCommand = 'sf config get target-org --json';
                OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandTargetOrg Checking target org with: ${sfCommand}`);
                
                const { stdout: orgInfo } = await execAsync(sfCommand);
                
                if (orgInfo && orgInfo.trim()) {
                    try {

                        if (targetOrg) {
                            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandTargetOrg Using target org: ${targetOrg}`);
                            
                            // Add the target org to the command if it doesn't already have one
                            if (!command.includes('-o') && !command.includes('--target-org')) {
                                command = `${command.replace(' --json', '')} --target-org ${targetOrg} --json`;
                            }
                        } else {
                            throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                        }
                    } catch (parseError : any) {
                        OrgUtils.logError('[VisbalExt.MetadataService] executeCliCommandTargetOrg Failed to parse org info:', parseError );
                        throw new Error('Failed to parse org info. Please ensure Salesforce CLI is properly installed.');
                    }
                } else {
                    throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                }
            } catch (orgError) {
                OrgUtils.logDebug('[MetadataService] Failed to get target org:', orgError);
                
                // Check if Salesforce CLI is installed
                try {
                    await execAsync('sf --version');
                } catch (cliError) {
                    throw new Error('Salesforce CLI (sf) is not installed or not in PATH. Please install it from https://developer.salesforce.com/tools/sfdxcli');
                }
                
                throw new Error('No default org set. Please use "sf org set default" to set a default org.');
            }
            
            // Execute the command directly without bash -c wrapper
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Executing final command: ${command}`);
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                OrgUtils.logDebug(`[MetadataService] executeCliCommandTargetOrg Command produced stderr: ${stderr}`);
                // Only throw if it seems like a real error, as some commands output warnings to stderr
                if (stderr.includes('Error:') || stderr.includes('error:')) {
                    throw new Error(stderr);
                }
            }
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] executeCliCommandTargetOrg Command executed successfully`);
            return stdout;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.MetadataService] executeCliCommandTargetOrg Command execution failed:`, error);
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
            OrgUtils.logDebug('[VisbalExt.MetadataService] Executing SOQL query:', query);
            
            // Execute the query using the Salesforce CLI
            const command = `sf data query --query "${query}" --json`;
            const resultStr = await this.executeCliCommand(command);
            const result = JSON.parse(resultStr);
            
            if (result.status === 0 && result.result) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] SOQL query executed successfully');
                return result.result.records || [];
            } else {
                throw new Error(result.message || 'Failed to execute SOQL query');
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Error executing SOQL query:', error);
            throw error;
        }
    }

    /**
     * Lists all Apex classes using SOQL query
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] Listing Apex classes...');
            // Use SOQL query to get Apex classes with TracHier namespace
            const soqlQuery = "SELECT Id, Name, NamespacePrefix FROM ApexClass WHERE NamespacePrefix IN ('TracHier', 'TracRTC') ORDER BY Name";
            const records =  await this._sfdxService.executeSoqlQuery(soqlQuery);
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Found ${records.length} classes in TracHier, TracRTC  namespace`);
            
            return records.map((cls: any) => ({
                id: cls.Id,
                name: cls.Name,
                fullName: cls.Name,
                namespace: cls.NamespacePrefix,
                status: 'Active'
            }));
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class using SOQL query
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getApexClassBody -- Getting body for class: ${className}`);
            // Use SOQL query to get the class body
            const soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${className}' LIMIT 1`;
			const records =  await this._sfdxService.executeSoqlQuery(soqlQuery);
            
            const classRecord = records[0];
            OrgUtils.logDebug('[VisbalExt.MetadataService] getApexClassBody -- Successfully retrieved class body');
            return classRecord.Body;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.MetadataService] getApexClassBody -- Failed to get class body for ${className}:`, error);
            throw new Error(`Failed to get class body for ${className}: ${error.message}`);
        }
    }

    /**
     * Extracts test methods from a class body
     */
    public extractTestMethods(classBody: string): TestMethod[] {
        OrgUtils.logDebug('[VisbalExt.MetadataService] extractTestMethods -- Extracting test methods from class body...');
        const methods: TestMethod[] = [];
        
        // Regular expressions to match test methods - improved to catch more patterns
        const patterns = [
            /(?<!@TestSetup\s+)@isTest\s+(?:static\s+)?void\s+(\w+)\s*\(/gi,
            /(?<!@TestSetup\s+)testMethod\s+(?:static\s+)?void\s+(\w+)\s*\(/gi,
            /(?<!@TestSetup\s+)@isTest\s+(?:static\s+)?(?:void\s+)?(\w+)\s*\(/gi,
            /(?<!@TestSetup\s+)static\s+(?:void|testmethod)\s+(\w+)\s*\(/gi,
            /(?<!@TestSetup\s+)(?:public|private|protected)?\s+static\s+(?:void|testmethod)\s+(\w+)\s*\(/gi,
            /(?<!@TestSetup\s+)(?:public|private|protected)?\s+(?:static)?\s+(?:void)?\s+(?:testmethod)?\s+(\w+Test)\s*\(/gi
        ];

        // Pattern to detect @TestSetup methods
        const testSetupPattern = /@TestSetup\s+(?:static\s+)?void\s+(\w+)\s*\(/gi;
        
        // First check for @TestSetup methods and exclude them
        const testSetupMethods = new Set<string>();
        let methodMatch;
        while ((methodMatch = testSetupPattern.exec(classBody)) !== null) {
            testSetupMethods.add(methodMatch[1]);
        }
        
        // If the class itself is annotated with @isTest, all methods could be test methods
        const classBodyLower = classBody.toLowerCase();
        const isTestClass = classBodyLower.includes('@istest') || 
                          classBodyLower.includes('testmethod');
        
        if (isTestClass) {
            // Look for all methods in the class that are not @TestSetup
            const methodPattern = /(?<!@TestSetup\s+)(?:public|private|protected)?\s+(?:static)?\s+(?:void)?\s+(\w+)\s*\(/gi;
            let methodMatch;
            
            while ((methodMatch = methodPattern.exec(classBody)) !== null) {
                const methodName = methodMatch[1];
                // Skip constructor, known non-test methods, @TestSetup methods, and common keywords
                const commonKeywords = ['for', 'if', 'while', 'catch', 'finally', 'else', 'do', 'try', 'switch', 'case'];
                if (!methodName.includes('__') && 
                    !['equals', 'hashCode', 'toString', 'clone'].includes(methodName) &&
                    !testSetupMethods.has(methodName) &&
                    !commonKeywords.includes(methodName.toLowerCase()) &&
                    !methods.some(m => m.name === methodName)) {
                    // Additional check to ensure it's not a TestSetup method
                    const methodStart = classBody.indexOf(methodName);
                    const methodContext = classBody.substring(Math.max(0, methodStart - 100), methodStart);
                    if (!methodContext.toLowerCase().includes('@testsetup')) {
                        OrgUtils.logDebug(`[VisbalExt.MetadataService] extractTestMethods -- Found potential test method in @isTest class: ${methodName}`);
                        methods.push({
                            name: methodName,
                            isTestMethod: true
                        });
                    }
                }
            }
        }

        // double check if potentials are test methods by verifying they have the @isTest annotation
        for (const method of methods) {
            const methodName = method.name;
            // Find all occurrences of the method name
            let currentPos = 0;
            let methodStart = -1;
            let methodContext = '';

            // Find the actual method declaration
            const methodPattern = new RegExp(`(?:private|public|protected)?\\s+static\\s+void\\s+${methodName}\\s*\\(`, 'i');
            const match = methodPattern.exec(classBody);
            
            if (match) {
                methodStart = match.index;
                // Look backwards from method declaration to find the comment block or previous method
                let contextStart = methodStart;
                while (contextStart > 0) {
                    contextStart--;
                    // If we find a closing brace, we've gone too far back (into previous method)
                    if (classBody[contextStart] === '}') {
                        contextStart++;
                        break;
                    }
                    // If we find a line with just whitespace and newline, we've found the start
                    if (classBody.substring(contextStart - 1, contextStart + 1).match(/\n\s*\n/)) {
                        break;
                    }
                }
                methodContext = classBody.substring(contextStart, methodStart).trim();
            }

            if (methodStart === -1) {
                method.isTestMethod = false;
                continue;
            }

            // Check for @isTest annotation in the context before the method
            const hasIsTestAnnotation = /@istest\b/i.test(methodContext);

            if (methodName === "testEnforceRuleParentDunsChange" || methodName === "testEnforceRuleParentDunsChangeMatchLowerToUpper") {
                OrgUtils.logDebug(`[VisbalExt.MetadataService] extractTestMethods --  methodName:${methodName} methodContext:`, methodContext);
            }

            // Method is a test only if it has @isTest annotation before its declaration
            method.isTestMethod = hasIsTestAnnotation;
            
            if (method.isTestMethod) {
                OrgUtils.logDebug(`[VisbalExt.MetadataService] extractTestMethods -- Found test method: ${methodName}`);
            }
        }   

        // Filter out non-test methods before returning
        return methods.filter(method => method.isTestMethod);
    }

    /**
     * Checks if a class is a test class based on its body
     */
    public isTestClass(classBody: string): boolean {
        OrgUtils.logDebug('[VisbalExt.MetadataService] Checking if class is a test class...');
        const classBodyLower = classBody.toLowerCase();
        const isTest = classBodyLower.includes('@istest') || 
                      classBodyLower.includes('testmethod') || 
                      this.extractTestMethods(classBody).length > 0;
        OrgUtils.logDebug(`[VisbalExt.MetadataService] Is test class: ${isTest}`);
        return isTest;
    }

    /**
     * Gets all test classes from the org
     */
    public async getTestClasses(): Promise<ApexClass[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] Getting all test classes...');
            // Get all classes first
            const allClasses = await this.listApexClasses();
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Retrieved ${allClasses.length} total classes`);
            
            // Filter test classes by name only (without checking body)
            const testClasses = allClasses.filter(cls => 
                cls.name.toLowerCase().includes('test') || 
                cls.name.toLowerCase().endsWith('tests')
            );
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Found ${testClasses.length} test classes by name`);
            return testClasses;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Failed to get test classes:', error);
            throw new Error(`Failed to get test classes: ${error.message}`);
        }
    }

    /**
     * Runs Apex tests
     */
    public async runTests(testClass: string, testMethod?: string): Promise<any> {
        const startTime = Date.now();
        return this._sfdxService.runTests(testClass, testMethod, false);
        /*
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- Starting test execution at ${new Date(startTime).toISOString()}`);
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- Running tests for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            
            const command = testMethod
                ? `sf apex run test --tests ${testClass}.${testMethod} --json`
                : `sf apex run test --class-names ${testClass} --json`;
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- executeCliCommand: ${command}`);
            const output = await this.executeCliCommand(command);
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- output: ${output}`);
            const result = JSON.parse(output).result;
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.MetadataService] runTests -- Test execution completed in ${endTime - startTime}ms`);
            OrgUtils.logDebug('[VisbalExt.MetadataService] runTests -- Test run result:', result);
            
            return result;
        } catch (error: any) {
            const endTime = Date.now();
            OrgUtils.logError(`[VisbalExt.MetadataService] runTests -- ERROR after ${endTime - startTime}ms:`, error);
            throw new Error(`Failed to run tests: ${error.message}`);
        }
            */
    }

    /**
     * Gets an Apex log by its ID
     */
    public async getApexLog(logId: string): Promise<any> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Getting Apex log with ID: ${logId}`);
            const output = await this.executeCliCommand(`sf apex get log --log-id ${logId} --json`);
            const result = JSON.parse(output).result;
            OrgUtils.logDebug('[VisbalExt.MetadataService] Successfully retrieved Apex log');
            return result;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.MetadataService] Failed to get Apex log ${logId}:`, error);
            throw new Error(`Failed to get Apex log: ${error.message}`);
        }
    }

    /**
     * Lists Apex logs
     */
    public async listApexLogs(): Promise<any[]> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] Listing Apex logs...');
            const output = await this._sfdxService.listApexLogs();
            const result = JSON.parse(output).result;
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Found ${result.length} logs`);
            return result;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Failed to list Apex logs:', error);
            throw new Error(`Failed to list Apex logs: ${error.message}`);
        }
    }

    /**
     * Gets test methods for a specific class
     */
    public async getTestMethodsForClass(className: string): Promise<TestMethod[]> {
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestMethodsForClass -- Getting test methods for class: ${className}`);
            // Get the class body
            const classBody = await this.getApexClassBody(className);
            
            // Extract test methods from the body
            const testMethods = this.extractTestMethods(classBody);
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestMethodsForClass -- Found ${testMethods.length} test methods in ${className}`);
            
            return testMethods;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.MetadataService] getTestMethodsForClass -- Failed to get test methods for ${className}:`, error);
            throw new Error(`Failed to get test methods for ${className}: ${error.message}`);
        }
    }

    public async getTestLog(logId: string): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLog -- Getting test log:', logId);
            const logResult = await this.executeCliCommand(`sf apex get log --log-id ${logId} --json`);
            const parsedResult = OrgUtils.parseResultJson(logResult);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLog -- parsedResult:', parsedResult);
            if (!parsedResult.isJson ) {
                return logResult;
            }
            else if (parsedResult.content && parsedResult.content) {
                const jsoResult: JsoResult = parsedResult.content;
                //check if jsoResult has property result and if it is an array and has length
                if (jsoResult.result && Array.isArray(jsoResult.result) && jsoResult.result.length > 0) {
                    return jsoResult.result[0].log;
                }
                else {
                    return logResult;
                }
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] getTestLog -- Error getting test log:', error );
            throw error;
        }
        // Add a default return statement to handle any unexpected paths
        return '';
    }

    public async getTestRunResult(testRunId: string): Promise<any> {
        const startTime = Date.now();
        try {
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestRunResult -- Getting test run result at ${new Date(startTime).toISOString()}`);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestRunResult -- Test run ID:', testRunId);
            
            // Get the test run details
            const command = `sf apex get test --test-run-id ${testRunId} --json`;
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestRunResult -- executeCliCommand: ${command}`);
            const result = await this.executeCliCommand(command);
            const parsedResult = JSON.parse(result);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestRunResult -- Test run details:', parsedResult);
            
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestRunResult -- Test run result retrieved in ${endTime - startTime}ms`);
            
            // Return the result immediately - log fetching will be handled separately after test completion
            return parsedResult.result || null;
        } catch (error: any) {
            const endTime = Date.now();
            OrgUtils.logError(`[VisbalExt.MetadataService] getTestRunResult -- Error getting test run result after ${endTime - startTime}ms:`, error);
            throw error;
        }
    }

    public async getTestRunLog(testRunId: string): Promise<any> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestRunLog -- Fetching logs for completed test run:', testRunId);
            
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
                            
                            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestRunLog -- parsedLogContent.result.log:', parsedLogContent.result.log);
                            // Write log content to file
                            await vscode.workspace.fs.writeFile(
                                vscode.Uri.file(targetFilePath),
                                Buffer.from(parsedLogContent.result.log.result[0].log || '', 'utf8')
                            );

                            // Open the log file
                            const document = await vscode.workspace.openTextDocument(targetFilePath);
                            await vscode.window.showTextDocument(document);
                            
                            OrgUtils.logDebug('[VisbalExt.MetadataService] Test run log saved and opened:', targetFilePath);
                            return {
                                logId: latestLog.Id,
                                logPath: targetFilePath,
                                content: parsedLogContent.result.loggetLogContent
                            };
                        }
                    }
                } else {
                    OrgUtils.logDebug('[VisbalExt.MetadataService] No matching logs found for test run');
                }
            } catch (logError: any) {
                OrgUtils.logError('[VisbalExt.MetadataService] Error fetching test run log:', logError);
                throw logError;
            }

            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Error getting test run log:', error);
            throw error;
        }
    }
    
     public async executeAnonymousApex(code: string): Promise<any> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] Executing anonymous Apex:', code);
            
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
            } catch (error: any) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] Failed to delete temporary file:', error);
            }

            if (result.status === 0) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] Anonymous Apex executed successfully');
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
            OrgUtils.logError('[VisbalExt.MetadataService] Error executing anonymous Apex:', error);
            throw error;
        }
    }
	
	
	//#region LOGFILE
    // Add this method to execute commands
    private async _executeCommand(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    OrgUtils.logError(`[VisbalExt.MetadataService] Error executing command: ${command}`, error);
                    reject(error);
                    return;
                }
                
                if (stderr && stderr.length > 0) {
                    OrgUtils.logDebug(`[VisbalExt.MetadataService] Command produced stderr: ${command}`, stderr);
                }
                
                resolve(stdout);
            });
        });
    }


	 public async getLogContent(logId: string): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] getLogContent -- logId:', logId);
            
            // Create .sfdx/tools/debug/logs directory if it doesn't exist
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }

            const logsDir = join(workspaceRoot, '.sfdx', 'tools', 'debug', 'logs');
            if (!existsSync(logsDir)) {
                mkdirSync(logsDir, { recursive: true });
            }

            const logFilePath = join(logsDir, `${logId}.log`);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getLogContent -- command:', `sf apex log get --log-id ${logId} > "${logFilePath}"`);
            
            // Get the log content and save it to the file
            const command = `sf apex log get --log-id ${logId} > "${logFilePath}"`;
            await this.executeCliCommand(command);

            // Read the log content from the file
            const logContent = readFileSync(logFilePath, 'utf8');
            OrgUtils.logDebug('[VisbalExt.MetadataService] getLogContent open  file:',  logFilePath);
            // Open the file logFilePath
            const document = await vscode.workspace.openTextDocument(logFilePath);
            return logContent;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] getLogContent -- error:', error);
            throw new Error(`Failed to get log content: ${error.message}`);
        }
    }
	
	
	public async getTestLogId(apexId: string): Promise<string> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- apexId:', apexId);


            // Get test run details to get the start time
            const testRunDetailsCommand = `sf apex get test --test-run-id ${apexId} --json`;
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- testRunDetailsCommand:', testRunDetailsCommand);
            const testRunDetailsResult = await this._executeCommand2(testRunDetailsCommand);

            //OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId testRunDetailsResult.stdout`, testRunDetailsResult.stdout);    
            const testRunDetails = JSON.parse(testRunDetailsResult.stdout);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- testRunDetails:', testRunDetails);
            if (!testRunDetails?.result?.summary?.testStartTime) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- No test start time found in test run details');
                return '';
            }

            const testStartTime = new Date(testRunDetails.result.summary.testStartTime);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- Test start time:', testStartTime);


            // Get all logs and filter by timestamp
            const logListCommand = `sf apex list log --json`;
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- logListCommand:', logListCommand);
            const logListResult = await this._executeCommand2(logListCommand);
            //OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId logListResult.stdout:`, logListResult.stdout);
            const logList = JSON.parse(logListResult.stdout);
            if (!logList?.result || logList.result.length === 0) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- No logs found');
                return '';
            }
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId logList:`,logList);    
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId logList.result:`,logList.result);  
            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId logList.result[0].Id:`,logList.result[0].Id);  
            
            //return logList.result[0].Id;
          

            // Filter logs that were created after the test started and are ApexTest logs
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId Test start time (UTC):', testStartTime.toISOString());
            
            const relevantLogs = logList.result
                .sort((a: any, b: any) => {
                    try {
                        const timeA = new Date(a.StartTime).getTime();
                        const timeB = new Date(b.StartTime).getTime();
                        return timeB - timeA;
                    } catch (error: any) {
                        OrgUtils.logError('[VisbalExt.MetadataService] Error sorting logs:', error);
                        return 0;
                    }
                });

            OrgUtils.logDebug(`[VisbalExt.MetadataService] getTestLogId relevantLogs:`, relevantLogs);          
            const logIds = relevantLogs.map((log: any) => log.Id);
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- logIds:', logIds);
            // Get the latest log (first element after sorting)
            const latestLog = relevantLogs[0];
            OrgUtils.logDebug('[VisbalExt.MetadataService] getTestLogId -- latestLog:', latestLog);
            // If you just need the ID:
            return latestLog?.Id;

            
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] getTestLogId -- error:', error);
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

    public async deleteViaSoql(logId: string): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.MetadataService] Deleting log via SOQL:', logId);
            
            // Use SOQL query to delete the log
            const soqlQuery = `DELETE FROM ApexLog WHERE Id = '${logId}'`;
            const command = `sf data delete record --sobject ApexLog --record-id ${logId} --json`;
            
            OrgUtils.logDebug(`[VisbalExt.MetadataService] Executing delete command: ${command}`);
            const output = await this.executeCliCommand(command);
            const result = JSON.parse(output);
            
            if (result.status === 0) {
                OrgUtils.logDebug('[VisbalExt.MetadataService] Log deleted successfully');
            } else {
                throw new Error(result.message || 'Failed to delete log');
            }
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.MetadataService] Error deleting log:', error);
            throw new Error(`Failed to delete log: ${error.message}`);
        }
    }

    /**
     * Lists all available Salesforce orgs grouped by type
     * @returns Promise containing the organized list of orgs
     */
    public async listOrgs(): Promise<any[]> {
        try {
            const result = await this._sfdxService.executeCommand('sfdx force:org:list --json');
            const data = JSON.parse(result);
            return [...(data.result.nonScratchOrgs || []), ...(data.result.scratchOrgs || [])];
        } catch (error: any) {
            OrgUtils.logError('Error listing orgs:', error);
            throw new Error(`Failed to list orgs: ${error.message}`);
        }
    }

    /**
     * Sets the default Salesforce org
     * @param username The username of the org to set as default
     */
    public async setDefaultOrg(orgId: string): Promise<void> {
        try {
            await this._sfdxService.executeCommand(`sfdx force:config:set defaultusername=${orgId}`);
        } catch (error: any) {
            OrgUtils.logError('Error setting default org:', error);
            throw new Error(`Failed to set default org: ${error.message}`);
        }
    }
} 