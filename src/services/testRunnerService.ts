import * as vscode from 'vscode';
import { SfdxService } from './sfdxService';
import { SalesforceApiService } from './salesforceApiService';
import { OrgUtils } from '../utils/orgUtils';

export class TestRunnerService {
    constructor(
        private context: vscode.ExtensionContext,
        private sfdxService: SfdxService,
        private salesforceApiService: SalesforceApiService
    ) {
        // Constructor logic
    }

    public async runTests(
        testClass: string,
        testMethod?: string,
        useDefaultOrg: boolean = false,
        showTestCoverage: boolean = true,
        signal?: AbortSignal,
        targetOrgAlias?: string
    ): Promise<any> {
        OrgUtils.logDebug('[VisbalExt.TestRunnerService] runTests -- Starting test run');
        return this.sfdxService.runTests(testClass, testMethod, useDefaultOrg, showTestCoverage, signal, targetOrgAlias);
    }
}
