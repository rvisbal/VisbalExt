import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

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
            console.log('[SalesforceApiService] initialize -- Initializing Salesforce API service');
            
            // Get authentication details from Salesforce CLI
            const authDetails = await this._getAuthDetailsFromCli();
            
            if (!authDetails) {
                console.error('[SalesforceApiService] initialize -- Failed to get auth details from CLI');
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
            
            console.log('[SalesforceApiService] initialize -- Successfully initialized Salesforce API service');
            return true;
        } catch (error: any) {
            console.error('[SalesforceApiService] initialize -- Error:', error);
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
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Encode the SOQL query for URL
            const encodedQuery = encodeURIComponent(soql);
            
            // Determine the API endpoint based on whether to use Tooling API
            const endpoint = useToolingApi ? 
                `/tooling/query?q=${encodedQuery}` : 
                `/query?q=${encodedQuery}`;
            
            console.log(`[SalesforceApiService] query -- Executing SOQL query: ${soql}`);
            
            // Execute the query
            const response = await this._instance!.get(endpoint);
            
            console.log(`[SalesforceApiService] query -- Query returned ${response.data.records?.length || 0} records`);
            return response.data;
        } catch (error: any) {
            console.error('[SalesforceApiService] query -- Error:', error);
            throw new Error(`Failed to execute SOQL query: ${error.message}`);
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
            
            console.log(`[SalesforceApiService] getRecord -- Getting record: ${objectType}/${recordId}`);
            
            // Execute the request
            const response = await this._instance!.get(endpoint);
            
            console.log(`[SalesforceApiService] getRecord -- Successfully retrieved record: ${objectType}/${recordId}`);
            return response.data;
        } catch (error: any) {
            console.error('[SalesforceApiService] getRecord -- Error:', error);
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
            
            console.log(`[SalesforceApiService] createRecord -- Creating record: ${objectType}`);
            
            // Execute the request
            const response = await this._instance!.post(endpoint, data);
            
            console.log(`[SalesforceApiService] createRecord -- Successfully created record: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            console.error('[SalesforceApiService] createRecord -- Error:', error);
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
            
            console.log(`[SalesforceApiService] updateRecord -- Updating record: ${objectType}/${recordId}`);
            
            // Execute the request
            const response = await this._instance!.patch(endpoint, data);
            
            console.log(`[SalesforceApiService] updateRecord -- Successfully updated record: ${objectType}/${recordId}`);
            return response.data;
        } catch (error: any) {
            console.error('[SalesforceApiService] updateRecord -- Error:', error);
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
            
            console.log(`[SalesforceApiService] deleteRecord -- Deleting record: ${objectType}/${recordId}`);
            
            // Execute the request
            await this._instance!.delete(endpoint);
            
            console.log(`[SalesforceApiService] deleteRecord -- Successfully deleted record: ${objectType}/${recordId}`);
        } catch (error: any) {
            console.error('[SalesforceApiService] deleteRecord -- Error:', error);
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
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Salesforce API service');
                }
            }
            
            // Build the full endpoint URL
            const fullEndpoint = `/apexrest/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;
            
            console.log(`[SalesforceApiService] executeApexRest -- Executing Apex REST: ${method} ${fullEndpoint}`);
            
            // Execute the request based on the method
            let response;
            
            switch (method.toUpperCase()) {
                case 'GET':
                    response = await this._instance!.get(fullEndpoint);
                    break;
                case 'POST':
                    response = await this._instance!.post(fullEndpoint, data);
                    break;
                case 'PUT':
                    response = await this._instance!.put(fullEndpoint, data);
                    break;
                case 'PATCH':
                    response = await this._instance!.patch(fullEndpoint, data);
                    break;
                case 'DELETE':
                    response = await this._instance!.delete(fullEndpoint);
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${method}`);
            }
            
            console.log(`[SalesforceApiService] executeApexRest -- Successfully executed Apex REST: ${method} ${fullEndpoint}`);
            return response.data;
        } catch (error: any) {
            console.error('[SalesforceApiService] executeApexRest -- Error:', error);
            throw new Error(`Failed to execute Apex REST: ${error.message}`);
        }
    }

    /**
     * Get authentication details from Salesforce CLI
     */
    private async _getAuthDetailsFromCli(): Promise<{ accessToken: string, instanceUrl: string } | null> {
        try {
            console.log('[SalesforceApiService] _getAuthDetailsFromCli -- Getting auth details from CLI');
            
            // Try with new CLI format first
            try {
                const { stdout: orgInfo } = await execAsync('sf org display --json');
                console.log('[SalesforceApiService] _getAuthDetailsFromCli -- Successfully got org info with new CLI format');
                
                const orgData = JSON.parse(orgInfo);
                
                if (!orgData.result || !orgData.result.accessToken || !orgData.result.instanceUrl) {
                    console.error('[SalesforceApiService] _getAuthDetailsFromCli -- Invalid org data from new CLI format:', orgData);
                    throw new Error('Invalid org data from new CLI format');
                }
                
                return {
                    accessToken: orgData.result.accessToken,
                    instanceUrl: orgData.result.instanceUrl
                };
            } catch (error) {
                console.log('[SalesforceApiService] _getAuthDetailsFromCli -- Failed with new CLI format, trying old format', error);
                
                // If the new command fails, try the old format
                const { stdout: orgInfo } = await execAsync('sfdx force:org:display --json');
                console.log('[SalesforceApiService] _getAuthDetailsFromCli -- Successfully got org info with old CLI format');
                
                const orgData = JSON.parse(orgInfo);
                
                if (!orgData.result || !orgData.result.accessToken || !orgData.result.instanceUrl) {
                    console.error('[SalesforceApiService] _getAuthDetailsFromCli -- Invalid org data from old CLI format:', orgData);
                    return null;
                }
                
                return {
                    accessToken: orgData.result.accessToken,
                    instanceUrl: orgData.result.instanceUrl
                };
            }
        } catch (error: any) {
            console.error('[SalesforceApiService] _getAuthDetailsFromCli -- Error:', error);
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
}

// Export a singleton instance
export const salesforceApi = new SalesforceApiService(); 