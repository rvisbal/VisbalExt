/**
 * Enumeration of view IDs used throughout the extension
 */
export enum ViewId {
    APEX_LOG = 'apexLog',
    EXECUTE_APEX = 'executeApex',
    TEST_EXPLORER = 'testExplorer',
    SOQL = 'soql',
    TRACTION = 'traction',
    ORG_TAB = 'orgTab'
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

/**
 * Represents a Salesforce organization
 */
export interface SalesforceOrg {
    username: string;
    alias?: string;
    instanceUrl: string;
    isDefault: boolean;
    type: 'devHub' | 'sandbox' | 'scratchOrg' | 'nonScratchOrg' | 'other';
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    expirationDate?: string;
    orgId?: string;
    id?: string; // Add id property here
    connectedStatus?: string;
    accessToken?: string;
    instanceApiVersion?: string;
    instanceApiVersionLastRetrieved?: string;
    isDefaultDevHubUsername?: boolean;
    isDefaultUsername?: boolean;
    isDevHub?: boolean;
    lastUsed?: string;
    namespacePrefix?: string;
    userId?: string;
}

/**
 * Groups of Salesforce organizations by type
 */
export interface OrgGroups {
    devHubs: SalesforceOrg[];
    sandboxes: SalesforceOrg[];
    scratchOrgs: SalesforceOrg[];
    nonScratchOrgs: SalesforceOrg[];
    other: SalesforceOrg[];
}

/**
 * Represents a selected organization with timestamp
 */
export interface SelectedOrg {
    alias: string;
    timestamp: string;
}

/**
 * Cache structure for view-specific org selections
 */
export type ViewOrgSelectionsCache = { versionId?: string } & {
    [key in ViewId]?: SelectedOrg;
};


/**
 * Represents a trace flag in Salesforce
 */
export interface TraceFlag {
    Id: string;
    LogType: string;
    StartDate: string;
    ExpirationDate: string;
    DebugLevelId: string;
}
