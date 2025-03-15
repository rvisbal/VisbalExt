import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

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
            console.log(`[MetadataService] Executing CLI command: ${command}`);
            
            // Get the default org username - don't use bash on Windows
            try {
                const sfCommand = 'sf config get target-org --json';
                console.log(`[MetadataService] Checking target org with: ${sfCommand}`);
                
                const { stdout: orgInfo } = await execAsync(sfCommand);
                
                if (orgInfo && orgInfo.trim()) {
                    try {
                        const parsedInfo = JSON.parse(orgInfo);
                        const targetOrg = parsedInfo.result && parsedInfo.result[0] ? parsedInfo.result[0].value : null;
                        
                        if (targetOrg) {
                            console.log(`[MetadataService] Using target org: ${targetOrg}`);
                            
                            // Add the target org to the command if it doesn't already have one
                            if (!command.includes('-o') && !command.includes('--target-org')) {
                                command = `${command.replace(' --json', '')} --target-org ${targetOrg} --json`;
                            }
                        } else {
                            throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                        }
                    } catch (parseError) {
                        console.error('[MetadataService] Failed to parse org info:', parseError);
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
            console.log(`[MetadataService] Executing final command: ${command}`);
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                console.warn(`[MetadataService] Command produced stderr: ${stderr}`);
                // Only throw if it seems like a real error, as some commands output warnings to stderr
                if (stderr.includes('Error:') || stderr.includes('error:')) {
                    throw new Error(stderr);
                }
            }
            
            console.log(`[MetadataService] Command executed successfully`);
            return stdout;
        } catch (error: any) {
            console.error(`[MetadataService] Command execution failed:`, error);
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
            console.log('[MetadataService] Executing SOQL query:', query);
            
            // Execute the query using the Salesforce CLI
            const command = `sf data query --query "${query}" --json`;
            const resultStr = await this.executeCliCommand(command);
            const result = JSON.parse(resultStr);
            
            if (result.status === 0 && result.result) {
                console.log('[MetadataService] SOQL query executed successfully');
                return result.result.records || [];
            } else {
                throw new Error(result.message || 'Failed to execute SOQL query');
            }
        } catch (error: any) {
            console.error('[MetadataService] Error executing SOQL query:', error);
            throw error;
        }
    }

    /**
     * Lists all Apex classes using SOQL query
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            console.log('[MetadataService] Listing Apex classes...');
            // Use SOQL query to get Apex classes with TracHier namespace
            const soqlQuery = "SELECT Id, Name, NamespacePrefix FROM ApexClass WHERE NamespacePrefix = 'TracHier' ORDER BY Name";
            const command = `sf data query --query "${soqlQuery}" --json`;
            
            console.log(`[MetadataService] Executing SOQL query: ${soqlQuery}`);
            const output = await this.executeCliCommand(command);
            const parsedOutput = JSON.parse(output);
            
            if (!parsedOutput.result || !parsedOutput.result.records) {
                console.log('[MetadataService] No classes found or unexpected response format');
                return [];
            }
            
            const records = parsedOutput.result.records;
            console.log(`[MetadataService] Found ${records.length} classes in TracHier namespace`);
            
            return records.map((cls: any) => ({
                id: cls.Id,
                name: cls.Name,
                fullName: cls.Name,
                namespace: cls.NamespacePrefix,
                status: 'Active'
            }));
        } catch (error: any) {
            console.error('[MetadataService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class using SOQL query
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            console.log(`[MetadataService] Getting body for class: ${className}`);
            // Use SOQL query to get the class body
            const soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${className}' LIMIT 1`;
            const command = `sf data query --query "${soqlQuery}" --json`;
            
            console.log(`[MetadataService] Executing SOQL query: ${soqlQuery}`);
            const output = await this.executeCliCommand(command);
            const parsedOutput = JSON.parse(output);
            
            if (!parsedOutput.result || !parsedOutput.result.records || parsedOutput.result.records.length === 0) {
                throw new Error(`Class ${className} not found`);
            }
            
            const classRecord = parsedOutput.result.records[0];
            console.log('[MetadataService] Successfully retrieved class body');
            return classRecord.Body;
        } catch (error: any) {
            console.error(`[MetadataService] Failed to get class body for ${className}:`, error);
            throw new Error(`Failed to get class body for ${className}: ${error.message}`);
        }
    }

    /**
     * Extracts test methods from a class body
     */
    public extractTestMethods(classBody: string): TestMethod[] {
        console.log('[MetadataService] Extracting test methods from class body...');
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
                    console.log(`[MetadataService] Found potential test method in @isTest class: ${methodName}`);
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
                    console.log(`[MetadataService] Found test method: ${methodName}`);
                    methods.push({
                        name: methodName,
                        isTestMethod: true
                    });
                }
            }
        }

        console.log(`[MetadataService] Extracted ${methods.length} test methods`);
        return methods;
    }

    /**
     * Checks if a class is a test class based on its body
     */
    public isTestClass(classBody: string): boolean {
        console.log('[MetadataService] Checking if class is a test class...');
        const isTest = classBody.includes('@isTest') || 
                      classBody.includes('testMethod') || 
                      this.extractTestMethods(classBody).length > 0;
        console.log(`[MetadataService] Is test class: ${isTest}`);
        return isTest;
    }

    /**
     * Gets all test classes from the org
     */
    public async getTestClasses(): Promise<ApexClass[]> {
        try {
            console.log('[MetadataService] Getting all test classes...');
            // Get all classes first
            const allClasses = await this.listApexClasses();
            console.log(`[MetadataService] Retrieved ${allClasses.length} total classes`);
            
            // Filter test classes by name only (without checking body)
            const testClasses = allClasses.filter(cls => 
                cls.name.toLowerCase().includes('test') || 
                cls.name.toLowerCase().endsWith('tests')
            );
            
            console.log(`[MetadataService] Found ${testClasses.length} test classes by name`);
            return testClasses;
        } catch (error: any) {
            console.error('[MetadataService] Failed to get test classes:', error);
            throw new Error(`Failed to get test classes: ${error.message}`);
        }
    }

    /**
     * Runs Apex tests
     */
    public async runTests(testClass: string, testMethod?: string): Promise<any> {
        try {
            console.log(`[MetadataService] Running tests for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            const command = testMethod
                ? `sf apex run test --tests ${testClass}.${testMethod} --json`
                : `sf apex run test --class-names ${testClass} --json`;
            const output = await this.executeCliCommand(command);
            const result = JSON.parse(output).result;
            console.log('[MetadataService] Test run completed successfully');
            return result;
        } catch (error: any) {
            console.error('[MetadataService] Failed to run tests:', error);
            throw new Error(`Failed to run tests: ${error.message}`);
        }
    }

    /**
     * Gets an Apex log by its ID
     */
    public async getApexLog(logId: string): Promise<any> {
        try {
            console.log(`[MetadataService] Getting Apex log with ID: ${logId}`);
            const output = await this.executeCliCommand(`sf apex get log --log-id ${logId} --json`);
            const result = JSON.parse(output).result;
            console.log('[MetadataService] Successfully retrieved Apex log');
            return result;
        } catch (error: any) {
            console.error(`[MetadataService] Failed to get Apex log ${logId}:`, error);
            throw new Error(`Failed to get Apex log: ${error.message}`);
        }
    }

    /**
     * Lists Apex logs
     */
    public async listApexLogs(): Promise<any[]> {
        try {
            console.log('[MetadataService] Listing Apex logs...');
            const output = await this.executeCliCommand('sf apex list log --json');
            const result = JSON.parse(output).result;
            console.log(`[MetadataService] Found ${result.length} logs`);
            return result;
        } catch (error: any) {
            console.error('[MetadataService] Failed to list Apex logs:', error);
            throw new Error(`Failed to list Apex logs: ${error.message}`);
        }
    }

    /**
     * Gets test methods for a specific class
     */
    public async getTestMethodsForClass(className: string): Promise<TestMethod[]> {
        try {
            console.log(`[MetadataService] Getting test methods for class: ${className}`);
            // Get the class body
            const classBody = await this.getApexClassBody(className);
            
            // Extract test methods from the body
            const testMethods = this.extractTestMethods(classBody);
            console.log(`[MetadataService] Found ${testMethods.length} test methods in ${className}`);
            
            return testMethods;
        } catch (error: any) {
            console.error(`[MetadataService] Failed to get test methods for ${className}:`, error);
            throw new Error(`Failed to get test methods for ${className}: ${error.message}`);
        }
    }

    public async getTestLog(logId: string): Promise<string> {
        try {
            console.log('[MetadataService] Attempting to fetch test log with ID:', logId);
            
            // Execute SFDX command to get the log
            const command = 'sf apex get log --json -i ' + logId;
            console.log('[MetadataService] Executing command:', command);
            
            const result = await this.executeCliCommand(command);
            console.log('[MetadataService] Raw command result:', result);

            const parsedResult = JSON.parse(result);
            console.log('[MetadataService] Parsed result:', parsedResult);

            if (parsedResult && parsedResult.status === 0 && parsedResult.result) {
                console.log('[MetadataService] Successfully retrieved log content');
                return parsedResult.result.log;
            }

            console.error('[MetadataService] Failed to fetch test log - Invalid response structure');
            throw new Error('Failed to fetch test log - Invalid response structure');
        } catch (error) {
            console.error('[MetadataService] Error fetching test log:', error);
            throw new Error('Failed to fetch test log: ' + (error as Error).message);
        }
    }
} 