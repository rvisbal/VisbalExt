import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { statusBarService } from './statusBarService';

const execAsync = promisify(exec);

/**
 * Service for interacting with Salesforce REST API
 */
export class SalesforceApiService {
    private _instance: AxiosInstance | null = null;
    private _accessToken: string | null = null;
    private _instanceUrl: string | null = null;
    private _apiVersion = 'v59.0'; // Default API version, can be updated

    /**
     * Initialize the Salesforce API service
     */
    public async initialize(): Promise<boolean> {
        try {
            console.log('[VisbalExt.SalesforceApiService] initialize -- Initializing Salesforce API service');
            statusBarService.showProgress('Initializing Salesforce API...');
            
            // Get authentication details from Salesforce CLI
            const authDetails = await this._getAuthDetailsFromCli();
            
            if (!authDetails) {
                console.error('[VisbalExt.SalesforceApiService] initialize -- Failed to get auth details from CLI');
                statusBarService.showError('Failed to get auth details from CLI');
                return false;
            }
            
            this._accessToken = authDetails.accessToken;
            this._instanceUrl = authDetails.instanceUrl;
            
            // Create axios instance with default configuration
            this._instance = axios.create({
                baseURL: `${this._instanceUrl}/services/data/${this._apiVersion}`,
                headers: {
                    'Authorization': `Bearer ${this._accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('[VisbalExt.SalesforceApiService] initialize -- Successfully initialized Salesforce API service');
            statusBarService.showSuccess('Salesforce API initialized');
            return true;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] initialize -- Error:', error);
            statusBarService.showError(`Failed to initialize Salesforce API: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to initialize Salesforce API: ${error.message}`);
            return false;
        }
    }

    /**
     * Execute a SOQL query using the REST API
     * @param soql The SOQL query to execute
     * @param useToolingApi Whether to use the Tooling API
     */
    public async query(soql: string, useToolingApi: boolean = false): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress('Executing SOQL query...');
            
            // Encode the SOQL query for URL
            const encodedQuery = encodeURIComponent(soql);
            
            // Determine the API endpoint based on whether to use Tooling API
            const endpoint = useToolingApi ? 
                `/tooling/query?q=${encodedQuery}` : 
                `/query?q=${encodedQuery}`;
            
            console.log(`[VisbalExt.SalesforceApiService] query -- Executing SOQL query: ${soql}`);
            
            // Execute the query
            const response = await this._instance!.get(endpoint);
            
            console.log(`[VisbalExt.SalesforceApiService] query -- Query returned ${response.data.records?.length || 0} records`);
            statusBarService.showSuccess('SOQL query completed');
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] query -- Error:', error);
            statusBarService.showError(`Query error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a specific record by ID
     * @param objectType The Salesforce object type
     * @param recordId The record ID
     * @param fields The fields to retrieve (comma-separated)
     * @param useToolingApi Whether to use the Tooling API
     */
    public async getRecord(objectType: string, recordId: string, fields?: string, useToolingApi: boolean = false): Promise<any> {
        try {
            if (!this._instance) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Determine the API endpoint based on whether to use Tooling API
            const baseEndpoint = useToolingApi ? '/tooling/sobjects' : '/sobjects';
            
            // Build the endpoint URL
            let endpoint = `${baseEndpoint}/${objectType}/${recordId}`;
            
            // Add fields parameter if provided
            if (fields) {
                endpoint += `?fields=${encodeURIComponent(fields)}`;
            }
            
            console.log(`[VisbalExt.SalesforceApiService] getRecord -- Getting record: ${objectType}/${recordId}`);
            
            // Execute the request
            const response = await this._instance!.get(endpoint);
            
            console.log(`[VisbalExt.SalesforceApiService] getRecord -- Successfully retrieved record: ${objectType}/${recordId}`);
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] getRecord -- Error:', error);
            throw new Error(`Failed to get record: ${error.message}`);
        }
    }

    /**
     * Create a new record
     * @param objectType The Salesforce object type
     * @param data The record data
     * @param useToolingApi Whether to use the Tooling API
     */
    public async createRecord(objectType: string, data: any, useToolingApi: boolean = false): Promise<any> {
        try {
            if (!this._instance) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Determine the API endpoint based on whether to use Tooling API
            const baseEndpoint = useToolingApi ? '/tooling/sobjects' : '/sobjects';
            
            // Build the endpoint URL
            const endpoint = `${baseEndpoint}/${objectType}`;
            
            console.log(`[VisbalExt.SalesforceApiService] createRecord -- Creating record: ${objectType}`);
            
            // Execute the request
            const response = await this._instance!.post(endpoint, data);
            
            console.log(`[VisbalExt.SalesforceApiService] createRecord -- Successfully created record: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] createRecord -- Error:', error);
            throw new Error(`Failed to create record: ${error.message}`);
        }
    }

    /**
     * Update an existing record
     * @param objectType The Salesforce object type
     * @param recordId The record ID
     * @param data The record data
     * @param useToolingApi Whether to use the Tooling API
     */
    public async updateRecord(objectType: string, recordId: string, data: any, useToolingApi: boolean = false): Promise<any> {
        try {
            if (!this._instance) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Determine the API endpoint based on whether to use Tooling API
            const baseEndpoint = useToolingApi ? '/tooling/sobjects' : '/sobjects';
            
            // Build the endpoint URL
            const endpoint = `${baseEndpoint}/${objectType}/${recordId}`;
            
            console.log(`[VisbalExt.SalesforceApiService] updateRecord -- Updating record: ${objectType}/${recordId}`);
            
            // Execute the request
            const response = await this._instance!.patch(endpoint, data);
            
            console.log(`[VisbalExt.SalesforceApiService] updateRecord -- Successfully updated record: ${objectType}/${recordId}`);
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] updateRecord -- Error:', error);
            throw new Error(`Failed to update record: ${error.message}`);
        }
    }

    /**
     * Delete a record
     * @param objectType The Salesforce object type
     * @param recordId The record ID
     * @param useToolingApi Whether to use the Tooling API
     */
    public async deleteRecord(objectType: string, recordId: string, useToolingApi: boolean = false): Promise<void> {
        try {
            if (!this._instance) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Determine the API endpoint based on whether to use Tooling API
            const baseEndpoint = useToolingApi ? '/tooling/sobjects' : '/sobjects';
            
            // Build the endpoint URL
            const endpoint = `${baseEndpoint}/${objectType}/${recordId}`;
            
            console.log(`[VisbalExt.SalesforceApiService] deleteRecord -- Deleting record: ${objectType}/${recordId}`);
            
            // Execute the request
            await this._instance!.delete(endpoint);
            
            console.log(`[VisbalExt.SalesforceApiService] deleteRecord -- Successfully deleted record: ${objectType}/${recordId}`);
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] deleteRecord -- Error:', error);
            throw new Error(`Failed to delete record: ${error.message}`);
        }
    }

    /**
     * Execute an Apex REST endpoint
     * @param endpoint The Apex REST endpoint
     * @param method The HTTP method
     * @param data The request data (for POST, PUT, PATCH)
     */
    public async executeApexRest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress(`Executing Apex REST: ${method} ${endpoint}...`);
            
            // Ensure the endpoint starts with a slash
            const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            
            // Create the full URL for the Apex REST endpoint
            const url = `${this._instanceUrl}/services/apexrest${formattedEndpoint}`;
            
            // Create the request configuration
            const config: AxiosRequestConfig = {
                method: method,
                url: url,
                headers: {
                    'Authorization': `Bearer ${this._accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: data
            };
            
            // Execute the request
            const response = await axios(config);
            
            statusBarService.showSuccess('Apex REST execution completed');
            return response.data;
        } catch (error: any) {
            statusBarService.showError(`Apex REST error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get authentication details from Salesforce CLI
     */
    private async _getAuthDetailsFromCli(): Promise<{ accessToken: string, instanceUrl: string } | null> {
        try {
            console.log('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Getting auth details from CLI');
            
            // Try with new CLI format first
            try {
                const { stdout: orgInfo } = await execAsync('sf org display --json');
                console.log('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Successfully got org info with new CLI format');
                
                const orgData = JSON.parse(orgInfo);
                
                if (!orgData.result || !orgData.result.accessToken || !orgData.result.instanceUrl) {
                    console.error('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Invalid org data from new CLI format:', orgData);
                    throw new Error('Invalid org data from new CLI format');
                }
                
                return {
                    accessToken: orgData.result.accessToken,
                    instanceUrl: orgData.result.instanceUrl
                };
            } catch (error) {
                console.log('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Failed with new CLI format, trying old format', error);
                
                // If the new command fails, try the old format
                const { stdout: orgInfo } = await execAsync('sfdx force:org:display --json');
                console.log('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Successfully got org info with old CLI format');
                
                const orgData = JSON.parse(orgInfo);
                
                if (!orgData.result || !orgData.result.accessToken || !orgData.result.instanceUrl) {
                    console.error('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Invalid org data from old CLI format:', orgData);
                    return null;
                }
                
                return {
                    accessToken: orgData.result.accessToken,
                    instanceUrl: orgData.result.instanceUrl
                };
            }
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] _getAuthDetailsFromCli -- Error:', error);
            return null;
        }
    }

    /**
     * Set the API version
     * @param version The API version to use (e.g., 'v59.0')
     */
    public setApiVersion(version: string): void {
        if (!version.startsWith('v')) {
            version = `v${version}`;
        }
        
        this._apiVersion = version;
        
        // Update the baseURL if instance is already initialized
        if (this._instance && this._instanceUrl) {
            this._instance.defaults.baseURL = `${this._instanceUrl}/services/data/${this._apiVersion}`;
        }
    }

    /**
     * Retrieve metadata using the Metadata API
     * @param metadataType The type of metadata (e.g., 'CustomObject', 'ApexClass')
     * @param fullNames Array of API names to retrieve
     */
    public async retrieveMetadata(metadataType: string, fullNames: string[]): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress(`Retrieving ${metadataType} metadata...`);
            
            const endpoint = '/tooling/sobjects/MetadataContainer';
            const response = await this._instance.post(endpoint, {
                name: `retrieve_${Date.now()}`,
                metadataContainerMembers: fullNames.map(name => ({
                    type: metadataType,
                    fullName: name
                }))
            });
            
            console.log(`[VisbalExt.SalesforceApiService] retrieveMetadata -- Retrieved ${metadataType} metadata`);
            statusBarService.showSuccess('Metadata retrieval completed');
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] retrieveMetadata -- Error:', error);
            statusBarService.showError(`Metadata retrieval error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Deploy metadata using the Metadata API
     * @param metadataType The type of metadata
     * @param metadata The metadata to deploy
     */
    public async deployMetadata(metadataType: string, metadata: any): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress(`Deploying ${metadataType} metadata...`);
            
            const endpoint = '/tooling/sobjects/MetadataContainer';
            const response = await this._instance.post(endpoint, {
                name: `deploy_${Date.now()}`,
                metadataContainerMembers: [{
                    type: metadataType,
                    content: JSON.stringify(metadata)
                }]
            });
            
            console.log(`[VisbalExt.SalesforceApiService] deployMetadata -- Deployed ${metadataType} metadata`);
            statusBarService.showSuccess('Metadata deployment completed');
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] deployMetadata -- Error:', error);
            statusBarService.showError(`Metadata deployment error: ${error.message}`);
            throw error;
        }
    }

    /**
     * List metadata types available in the org
     */
    public async listMetadataTypes(): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress('Retrieving metadata types...');
            
            const endpoint = '/tooling/sobjects';
            const response = await this._instance.get(endpoint);
            
            console.log('[VisbalExt.SalesforceApiService] listMetadataTypes -- Retrieved metadata types');
            statusBarService.showSuccess('Metadata types retrieved');
            return response.data.sobjects;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] listMetadataTypes -- Error:', error);
            statusBarService.showError(`Failed to list metadata types: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a composite request to perform multiple operations in a single call
     * @param requests Array of subrequests to execute
     * @param allOrNone Whether to roll back all changes if any request fails
     */
    public async executeComposite(requests: Array<{
        method: string;
        url: string;
        referenceId: string;
        body?: any;
    }>, allOrNone: boolean = true): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress('Executing composite request...');
            
            const endpoint = '/composite';
            const response = await this._instance.post(endpoint, {
                allOrNone,
                compositeRequest: requests
            });
            
            console.log('[VisbalExt.SalesforceApiService] executeComposite -- Composite request completed');
            statusBarService.showSuccess('Composite request completed');
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] executeComposite -- Error:', error);
            statusBarService.showError(`Composite request error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a bulk API job for large data operations
     * @param objectType The Salesforce object type
     * @param operation The operation type ('insert', 'update', 'delete', 'query')
     * @param records Array of records to process
     */
    public async createBulkJob(objectType: string, operation: 'insert' | 'update' | 'delete' | 'query', records: any[]): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            statusBarService.showProgress(`Creating bulk ${operation} job for ${objectType}...`);
            
            // Create the bulk job
            const createJobResponse = await this._instance.post('/jobs/ingest', {
                object: objectType,
                operation,
                contentType: 'JSON',
                lineEnding: 'LF'
            });
            
            const jobId = createJobResponse.data.id;
            
            // Upload the data
            await this._instance.put(
                `/jobs/ingest/${jobId}/batches`,
                records,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // Close the job
            await this._instance.patch(`/jobs/ingest/${jobId}`, {
                state: 'UploadComplete'
            });
            
            console.log(`[VisbalExt.SalesforceApiService] createBulkJob -- Created bulk job: ${jobId}`);
            statusBarService.showSuccess('Bulk job created and data uploaded');
            return jobId;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] createBulkJob -- Error:', error);
            statusBarService.showError(`Bulk job error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check the status of a bulk API job
     * @param jobId The ID of the bulk job
     */
    public async checkBulkJobStatus(jobId: string): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }
            
            const response = await this._instance.get(`/jobs/ingest/${jobId}`);
            
            console.log(`[VisbalExt.SalesforceApiService] checkBulkJobStatus -- Job ${jobId} status: ${response.data.state}`);
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] checkBulkJobStatus -- Error:', error);
            throw error;
        }
    }

    /**
     * Run Apex tests and return the test run ID
     * @param testClasses Array of Apex test class names to run. If empty, runs all tests.
     * @param testMethods Array of specific test methods to run (optional)
     * @returns The test run ID that can be used to check status and get logs
     */
    public async runApexTests(testClasses: string[] = [], testMethods: string[] = []): Promise<string> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }

            statusBarService.showProgress('Starting Apex test run...');

            // Create the test run request
            const testRequest = {
                testLevel: testClasses.length ? 'RunSpecifiedTests' : 'RunLocalTests',
                classids: testClasses,
                suiteids: [],
                maxFailedTests: -1,
                testMethods: testMethods
            };

            const response = await this._instance.post('/tooling/runTestsAsynchronous', testRequest);
            const testRunId = response.data;

            console.log(`[VisbalExt.SalesforceApiService] runApexTests -- Test run started with ID: ${testRunId}`);
            statusBarService.showSuccess('Test run started');
            return testRunId;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] runApexTests -- Error:', error);
            statusBarService.showError(`Failed to start test run: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get the status of an Apex test run
     * @param testRunId The ID of the test run
     * @returns Test run status and results
     */
    public async getApexTestStatus(testRunId: string): Promise<any> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }

            const query = encodeURIComponent(
                `SELECT Id, Status, StartTime, EndTime, ApexClassId, MethodName, Message, StackTrace, Outcome, ApexLogId ` +
                `FROM ApexTestResult WHERE AsyncApexJobId = '${testRunId}'`
            );

            const response = await this._instance.get(`/tooling/query?q=${query}`);
            console.log(`[VisbalExt.SalesforceApiService] getApexTestStatus -- Retrieved status for test run: ${testRunId}`);
            return response.data.records;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] getApexTestStatus -- Error:', error);
            throw error;
        }
    }

    /**
     * Get the debug log for a specific test method
     * @param logId The ID of the debug log (ApexLogId from test results)
     * @returns The debug log content
     */
    public async getApexTestLog(logId: string): Promise<string> {
        try {
            if (!this._instance) {
                throw new Error('Salesforce API service not initialized');
            }

            statusBarService.showProgress('Retrieving test log...');

            const response = await this._instance.get(`/tooling/sobjects/ApexLog/${logId}/Body`);
            
            console.log(`[VisbalExt.SalesforceApiService] getApexTestLog -- Retrieved log: ${logId}`);
            statusBarService.showSuccess('Test log retrieved');
            return response.data;
        } catch (error: any) {
            console.error('[VisbalExt.SalesforceApiService] getApexTestLog -- Error:', error);
            statusBarService.showError(`Failed to retrieve test log: ${error.message}`);
            throw error;
        }
    }
}

// Export a singleton instance
export const salesforceApi = new SalesforceApiService(); 