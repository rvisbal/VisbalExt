import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ApexClass {
    id?: string;
    name: string;
    fullName?: string;
    status?: string;
    body?: string;
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
            
            // Get the default org username
            try {
                const { stdout: orgInfo } = await execAsync('bash -c "sf config get target-org --json"');
                const targetOrg = JSON.parse(orgInfo).result[0].value;
                
                if (!targetOrg) {
                    throw new Error('No default org set. Please use "sf org set default" to set a default org.');
                }
                
                console.log(`[MetadataService] Using target org: ${targetOrg}`);
                
                // Add the target org to the command if it doesn't already have one
                if (!command.includes('-o') && !command.includes('--target-org')) {
                    command = `${command.replace(' --json', '')} --target-org ${targetOrg} --json`;
                }
            } catch (orgError: any) {
                console.warn('[MetadataService] Failed to get target org:', orgError);
                throw new Error('No default org set. Please use "sf org set default" to set a default org.');
            }
            
            // Execute the command using bash
            const { stdout, stderr } = await execAsync(`bash -c "${command}"`);
            
            if (stderr) {
                console.warn(`[MetadataService] Command produced stderr: ${stderr}`);
                throw new Error(stderr);
            }
            
            console.log(`[MetadataService] Command executed successfully`);
            return stdout;
        } catch (error: any) {
            console.error(`[MetadataService] Command execution failed:`, error);
            throw error;
        }
    }

    /**
     * Lists all Apex classes using the Metadata API
     */
    public async listApexClasses(): Promise<ApexClass[]> {
        try {
            console.log('[MetadataService] Listing Apex classes...');
            const output = await this.executeCliCommand('sf apex list class --json');
            const result = JSON.parse(output).result;
            console.log(`[MetadataService] Found ${result.length} classes`);
            return result.map((cls: any) => ({
                id: cls.id || cls.fullName,
                name: cls.fullName || cls.name,
                fullName: cls.fullName || cls.name,
                status: 'Active'
            }));
        } catch (error: any) {
            console.error('[MetadataService] Failed to list Apex classes:', error);
            throw new Error(`Failed to list Apex classes: ${error.message}`);
        }
    }

    /**
     * Gets the body of an Apex class
     */
    public async getApexClassBody(className: string): Promise<string> {
        try {
            console.log(`[MetadataService] Getting body for class: ${className}`);
            const output = await this.executeCliCommand(`sf apex get class --class-name ${className} --json`);
            const result = JSON.parse(output).result;
            console.log('[MetadataService] Successfully retrieved class body');
            return result.Body;
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
        
        // Regular expressions to match test methods
        const patterns = [
            /@isTest\s+(?:static\s+)?void\s+(\w+)\s*\(/g,
            /testMethod\s+(?:static\s+)?void\s+(\w+)\s*\(/g,
            /@isTest\s+(?:static\s+)?(?:void\s+)?(\w+)\s*\(/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(classBody)) !== null) {
                console.log(`[MetadataService] Found test method: ${match[1]}`);
                methods.push({
                    name: match[1],
                    isTestMethod: true
                });
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
            
            // Filter potential test classes by name first
            const potentialTestClasses = allClasses.filter(cls => 
                cls.name.toLowerCase().includes('test') || 
                cls.name.toLowerCase().endsWith('tests')
            );
            console.log(`[MetadataService] Found ${potentialTestClasses.length} potential test classes by name`);

            // Get the body for each potential test class and verify
            const testClasses: ApexClass[] = [];
            
            for (const cls of potentialTestClasses) {
                try {
                    console.log(`[MetadataService] Checking class: ${cls.name}`);
                    const body = await this.getApexClassBody(cls.name);
                    if (this.isTestClass(body)) {
                        console.log(`[MetadataService] Confirmed ${cls.name} is a test class`);
                        cls.body = body;
                        testClasses.push(cls);
                    } else {
                        console.log(`[MetadataService] ${cls.name} is not a test class`);
                    }
                } catch (error: any) {
                    console.error(`[MetadataService] Failed to get body for class ${cls.name}:`, error);
                }
            }

            console.log(`[MetadataService] Found ${testClasses.length} confirmed test classes`);
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
                ? `sf apex test run --tests ${testClass}.${testMethod} --json`
                : `sf apex test run --class-names ${testClass} --json`;
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
            const output = await this.executeCliCommand(`sf apex log get --log-id ${logId} --json`);
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
            const output = await this.executeCliCommand('sf apex log list --json');
            const result = JSON.parse(output).result;
            console.log(`[MetadataService] Found ${result.length} logs`);
            return result;
        } catch (error: any) {
            console.error('[MetadataService] Failed to list Apex logs:', error);
            throw new Error(`Failed to list Apex logs: ${error.message}`);
        }
    }
} 