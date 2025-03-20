import { SalesforceLog } from './types/salesforceTypes';
import { SfdxService } from './services/sfdxService';

// This file contains obsolete code that has been moved from active files
// but kept for reference or potential future use.

//#region visbalLogViews
// Methods moved from visbalLogView.ts

export class ObsoleteVisbalLogView {
    private _logs: SalesforceLog[] = [];
    private _sfdxService: SfdxService;

    constructor(sfdxService: SfdxService) {
        this._sfdxService = sfdxService;
    }

    /**
     * Fetches logs using SOQL query
     */
    private async _fetchLogsSoql(): Promise<void> {
        try {
            console.log('[VisbalExt.VisbalLogView] Starting to fetch logs via SOQL');
            const logs = await this._sfdxService.fetchSalesforceLogsSoql();
            this._logs = logs;
            this._sendLogsToWebview(logs);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error fetching logs via SOQL:', error);
            this._showError('Failed to fetch logs via SOQL');
        }
    }

    /**
     * Fetches Salesforce logs using SOQL query
     */
    private async _fetchSalesforceLogsSoql(): Promise<SalesforceLog[]> {
        try {
            return await this._sfdxService.fetchSalesforceLogsSoql();
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error fetching Salesforce logs via SOQL:', error);
            throw error;
        }
    }

    /**
     * Gets log content in JSON format
     */
    private async _getLogContentJson(logId: string): Promise<any> {
        try {
            const result = await this._executeCommand(`sf apex get log --log-id ${logId} --json`);
            return JSON.parse(result);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error getting log content in JSON format:', error);
            throw error;
        }
    }

    /**
     * Gets log content directly
     */
    private async _getLogContentDirect(logId: string): Promise<string> {
        try {
            return await this._executeCommand(`sf apex get log --log-id ${logId}`);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error getting log content directly:', error);
            throw error;
        }
    }

    /**
     * Fetches Salesforce logs
     */
    private async _fetchSalesforceLogs(): Promise<void> {
        try {
            const logs = await this._sfdxService.listApexLogs();
            this._logs = logs;
            this._sendLogsToWebview(logs);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error fetching Salesforce logs:', error);
            this._showError('Failed to fetch logs');
        }
    }

    /**
     * Deletes logs via SOQL API
     */
    private async _deleteViaSoqlApi(): Promise<void> {
        try {
            const logIds = await this._sfdxService.queryApexLogIds();
            if (logIds.length > 0) {
                await this._sfdxService.deleteLogsBulk(logIds);
                this._showSuccess('Successfully deleted all logs');
                await this._fetchLogs(true);
            } else {
                this._showSuccess('No logs to delete');
            }
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error deleting logs via SOQL API:', error);
            this._showError('Failed to delete logs');
        }
    }

    /**
     * Deletes server logs via SOQL
     */
    private async _deleteServerLogsViaSoql(): Promise<void> {
        try {
            await this._deleteViaSoqlApi();
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error deleting server logs via SOQL:', error);
            this._showError('Failed to delete server logs');
        }
    }

    /**
     * Deletes a log in bulk
     */
    private async _deleteLogBulk(logId: string): Promise<void> {
        try {
            await this._sfdxService.deleteLogsBulk([logId]);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error deleting log in bulk:', error);
            throw error;
        }
    }

    /**
     * Creates a new debug level
     */
    private async _createNewDebugLevel(debugLevelName: string, debugLevelFields: string): Promise<string> {
        try {
            return await this._sfdxService.createDebugLevel(debugLevelName, debugLevelFields);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error creating new debug level:', error);
            throw error;
        }
    }

    /**
     * Creates a new trace flag
     */
    private async _createNewTraceFlag(debugLevelId: string, userId: string, formattedStartDate: string, formattedExpirationDate: string): Promise<void> {
        try {
            await this._sfdxService.createTraceFlag(userId, debugLevelId, formattedStartDate, formattedExpirationDate);
        } catch (error) {
            console.error('[VisbalExt.VisbalLogView] Error creating new trace flag:', error);
            throw error;
        }
    }

    // Helper methods needed by the obsolete methods
    private async _executeCommand(command: string): Promise<string> {
        throw new Error('Method not implemented');
    }

    private _sendLogsToWebview(logs: any[]): void {
        throw new Error('Method not implemented');
    }

    private _showError(message: string): void {
        throw new Error('Method not implemented');
    }

    private _showSuccess(message: string): void {
        throw new Error('Method not implemented');
    }

    private async _fetchLogs(forceRefresh: boolean): Promise<void> {
        throw new Error('Method not implemented');
    }
}

//#endregion visbalLogViews 