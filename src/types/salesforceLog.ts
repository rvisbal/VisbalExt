export interface SalesforceLog {
    id: string;
    logUser: string;
    application: string;
    operation: string;
    request: string;
    status: string;
    logLength: number;
    lastModifiedDate: string;
    downloaded?: boolean;
    localFilePath?: string;
} 