/**
 * Types and interfaces for the Test Class Explorer functionality
 */

export enum TestStatus {
    pending = 'pending',
    running = 'running',
    success = 'success',
    failed = 'failed',
    downloading = 'downloading',
    skipped = 'skipped'
}

export interface TestRunSuccess {
    methodName: string;
    outcome: string;
    runTime: number;
    message?: string;
}

export interface TestRunFailure {
    methodName: string;
    outcome: string;
    runTime: number;
    message: string;
    stackTrace?: string;
}

export interface TestRunResult {
    status: number;
    result: {
        summary: {
            commandTime?: string;
            failing?: number;
            failRate?: string;
            hostname?: string;
            orgId?: string;
            outcome?: string;
            passing?: number;
            passRate?: string;
            skipped?: number;
            testExecutionTime?: string;
            testRunId?: string;
            testsRan?: number;
            testStartTime?: string;
            testTotalTime?: string;
            userId?: string;
            username?: string;
        };
        tests: any[];
    };
    warnings: any[];
}

export interface TestProgressState {
    className: string;
    methodName: string;
    testRunId: string;
    error: string;
    runTest: any;
    runResult: any;
    logId: string;
    initiated: boolean;
    finished: boolean;
    finishExecutingTest: boolean;
    initiateTestResult: boolean;
    finishGettingTestResult: boolean;
    initiateLogId: boolean;
    finishGettingLogId: boolean;
    initiateDownloadingLog: boolean;
    finishDownloadingLog: boolean;
    status: TestStatus;
    downloadLog: boolean;
    hasDebugTrace: boolean;
}
