/**
 * Enumeration of view IDs used throughout the extension
 */
export enum ViewId {
    APEX_LOG = 'apexLog',
    EXECUTE_APEX = 'executeApex',
    TEST_EXPLORER = 'testExplorer',
    SOQL = 'soql',
    TRACTION = 'traction'
}

/**
 * Represents an Apex class in Salesforce
 */
export interface ApexClass {
    id: string;
    name: string;
    fullName: string;
    namespace: string;
    status: string;
}

/**
 * Represents a Salesforce debug log
 */
export interface SalesforceLog {
    id: string;
    logUser: string;
    application: string;
    operation: string;
    request: string;
    status: string;
    logLength: number;
    lastModifiedDate: string;
    downloaded: boolean;
} 