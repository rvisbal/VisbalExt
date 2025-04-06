import * as vscode from 'vscode';
import { StatusBarService } from '../services/statusBarService';
import { MetadataService, TestMethod } from '../services/metadataService';
import { SfdxService } from '../services/sfdxService';
import { StorageService } from '../services/storageService';
import { TestClass } from '../types/testClass';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { OrgUtils } from '../utils/orgUtils';


import { TestRunResultsView } from './testRunResultsView';
import { TestSummaryView } from './testSummaryView';

enum TestStatus {
    pending = 'pending',
    running = 'running',
    success = 'success',
    failed = 'failed',
    downloading = 'downloading'
}

interface TestRunSuccess {
    methodName: string;
    outcome: string;
    runTime: number;
    message?: string;
}

interface TestRunFailure {
    methodName: string;
    outcome: string;
    runTime: number;
    message: string;
    stackTrace?: string;
}

interface TestRunResult {
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

interface TestProgressState {
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
}

export class TestClassExplorerView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testClassExplorerView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _statusBarService: StatusBarService;
    private _metadataService: MetadataService;
    private _storageService: StorageService;
    private _testController: vscode.TestController;
    private _testItems: Map<string, vscode.TestItem>;
    private _orgUtils = OrgUtils;
    private _testRunResultsView: TestRunResultsView;
    private _testSummaryView: TestSummaryView;
    private _sfdxService: SfdxService;
    private _abortController: AbortController | null = null;
    private _isRunning: boolean = false;

    constructor(
        extensionUri: vscode.Uri,
        statusBarService: StatusBarService,
        private readonly _context: vscode.ExtensionContext,
        testRunResultsView: TestRunResultsView,
        testSummaryView: TestSummaryView
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
        this._metadataService = new MetadataService();
        this._storageService = new StorageService(_context);
        this._testController = vscode.tests.createTestController('testClassExplorerView', 'Test Class Explorer');
        this._testItems = new Map();
        this._testRunResultsView = testRunResultsView;
        this._testSummaryView = testSummaryView;
        this._sfdxService = new SfdxService();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('[VisbalExt.TestClassExplorerView] resolveWebviewView webview -- Received message from webview:', data);
            switch (data.command) {
                case 'fetchTestClasses':
                    await this._fetchTestClasses(data.forceRefresh);
                    if (data.refreshMethods) {
                        // Clear stored test methods for all classes
                        const testClasses = await this._storageService.getTestClasses();
                        for (const testClass of testClasses) {
                            await this._storageService.clearTestMethodsForClass(testClass.name);
                        }
                    }
                    break;
				case 'refreshTestMethods':
                    await this._refreshTestMethods(data.testClass);
                    break;
                case 'fetchTestMethods':
                    await this._fetchTestMethods(data.className);
                    break;
                case 'runTest':
                    await this._runTest(data.testClass, data.testMethod);
                    break;
                case 'runSelectedTests':
                    await this._runSelectedTests(data.tests);
                    break;
                case 'runAllTests':
                    await this._runAllTests(data.runMode);
                    break;  
                case 'viewTestLog':
                    await this._viewTestLog(data.logId, data.testName);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(data.message);
                    break;
                case 'openTestFile':
                    await this._openTestFile(data.className, data.methodName);
                    break;
                case 'showConfirmation':
                    const choice = await vscode.window.showWarningMessage(
                        data.message,
                        { modal: true },
                        'Yes',
                        'No'
                    );
                    if (this._view) {
                        this._view.webview.postMessage({
                            command: 'confirmationResult',
                            confirmed: choice === 'Yes',
                            action: data.action,
                            runMode: data.runMode
                        });
                    }
                    break;
                case 'abortTests':
                    this.abortTests();
                    break;
            }
        });

        // Initial fetch of test classes when view becomes visible
        //setTimeout(() => {
        //    console.log('[VisbalExt.TestClassExplorerView] resolveWebviewView -- Initial fetch of test classes');
        //    if (this._view && this._view.visible) {
                // Use cached data if available
        //        this._fetchTestClasses(false);
        //    }
        //}, 1000);
    }

    private async _fetchTestClasses(forceRefresh: boolean = false, refreshMethods: boolean = false, refreshMode: 'batch' | 'sequential' = 'batch') {
        try {
            this._statusBarService.showMessage('$(sync~spin) Fetching test classes...');
            
            let testClasses: TestClass[];
            
            if (!forceRefresh) {
                // Try to get from storage first
                testClasses = await this._storageService.getTestClasses();
                console.log('[VisbalExt.TestClassExplorerView] _fetchTestClasses Using stored test classes:', testClasses);
                if (testClasses.length > 0) {
                    console.log('[VisbalExt.TestClassExplorerView] _fetchTestClasses Using stored test classes');
                    this._statusBarService.hide();
                    if (this._view) {
                        this._view.webview.postMessage({
                            command: 'testClassesLoaded',
                            testClasses: testClasses
                        });
                    }
                    return;
                }
            }

            // Fetch from Salesforce if not in storage or force refresh
            const apexClasses = await this._metadataService.getTestClasses();
            console.log('[VisbalExt.TestClassExplorerView] _fetchTestClasses Received test classes:', apexClasses?.length || 0, 'classes');
            
            // Filter and transform ApexClass to TestClass
            testClasses = apexClasses
                ?.filter((apexClass: { name: string }) => 
                    apexClass && 
                    apexClass.name && 
                    apexClass.name.endsWith('Test'))
                .map((apexClass: { name: string }) => ({
                    name: apexClass.name,
                    id: apexClass.name,
                    methods: [],
                    symbolTable: {},
                    attributes: {
                        fileName: `${apexClass.name}.cls`,
                        fullName: apexClass.name
                    }
                })) || [];

            // Save to storage
            await this._storageService.saveTestClasses(testClasses);
            console.log('[VisbalExt.TestClassExplorerView] _fetchTestClasses Test classes cached:', testClasses);

            // If refreshMethods is true, fetch methods for each class
            if (refreshMethods) {
                console.log('[VisbalExt.TestClassExplorerView] _fetchTestClasses Refreshing methods for all classes');
                const totalClasses = testClasses.length;
                let processedClasses = 0;

                // Update initial progress
                this._statusBarService.showMessage(`$(sync~spin) Refreshing methods (0/${totalClasses} classes)`);
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `Refreshing methods for ${totalClasses} classes in ${refreshMode} mode...`
                    });
                }

                if (refreshMode === 'batch') {
                    // Process in batches of 5
                    const BATCH_SIZE = 5;
                    for (let i = 0; i < testClasses.length; i += BATCH_SIZE) {
                        const batch = testClasses.slice(i, i + BATCH_SIZE);
                        const batchPromises = batch.map(async (testClass) => {
                            try {
                                const methods = await this._metadataService.getTestMethodsForClass(testClass.name);
                                await this._storageService.saveTestMethodsForClass(testClass.name, methods);
                                testClass.methods = methods.map(m => m.name);
                                processedClasses++;

                                // Update progress
                                const progressMessage = `$(sync~spin) Refreshing methods (${processedClasses}/${totalClasses} classes) - Batch ${Math.floor(i/BATCH_SIZE) + 1}`;
                                this._statusBarService.showMessage(progressMessage);
                                if (this._view) {
                                    this._view.webview.postMessage({
                                        command: 'showNotification',
                                        message: `Refreshing methods: ${processedClasses}/${totalClasses} classes (Current batch: ${Math.floor(i/BATCH_SIZE) + 1})`
                                    });
                                }
                            } catch (error) {
                                console.error(`[VisbalExt.TestClassExplorerView] _fetchTestClasses Error fetching methods for class ${testClass.name}:`, error);
                            }
                        });

                        // Wait for the current batch to complete before moving to the next
                        await Promise.all(batchPromises);
                        console.log(`[VisbalExt.TestClassExplorerView] Completed batch ${Math.floor(i/BATCH_SIZE) + 1} (${processedClasses}/${totalClasses} classes)`);
                    }
                } else {
                    // Process sequentially
                    for (const testClass of testClasses) {
                        try {
                            processedClasses++;
                            const progressMessage = `$(sync~spin) Refreshing methods (${processedClasses}/${totalClasses} classes) - ${testClass.name}`;
                            this._statusBarService.showMessage(progressMessage);
                            
                            // Update webview with current progress
                            if (this._view) {
                                this._view.webview.postMessage({
                                    command: 'showNotification',
                                    message: `Refreshing methods: ${processedClasses}/${totalClasses} classes (Current: ${testClass.name})`
                                });
                            }

                            const methods = await this._metadataService.getTestMethodsForClass(testClass.name);
                            await this._storageService.saveTestMethodsForClass(testClass.name, methods);
                            testClass.methods = methods.map(m => m.name);
                        } catch (error) {
                            console.error(`[VisbalExt.TestClassExplorerView] _fetchTestClasses Error fetching methods for class ${testClass.name}:`, error);
                        }
                    }
                }

                // Show completion message
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `Completed refreshing methods for ${totalClasses} classes`
                    });
                }
            }

            // Add test classes to VSCode Test Explorer
            if (testClasses) {
                console.log('[VisbalExt.TestClassExplorerView] Adding test classes to Test Explorer ', testClasses);
                const totalClasses = testClasses.length;
                let processedClasses = 0;
                const BATCH_SIZE = 5;

                // Show initial loading status
                this._statusBarService.showMessage(`$(sync~spin) Loading test classes into explorer (0/${totalClasses})`);
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `Loading ${totalClasses} test classes into explorer...`
                    });
                }

                // Process classes in batches
                for (let i = 0; i < testClasses.length; i += BATCH_SIZE) {
                    const batch = testClasses.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(async (testClass) => {
                        const result = await this._addTestToExplorer(testClass);
                        processedClasses++;
                        
                        // Update progress after each class is processed
                        const progressMessage = `$(sync~spin) Loading test classes (${processedClasses}/${totalClasses}) - Batch ${Math.floor(i/BATCH_SIZE) + 1}`;
                        this._statusBarService.showMessage(progressMessage);

                        if (this._view) {
                            this._view.webview.postMessage({
                                command: 'showNotification',
                                message: `Loading test classes: ${processedClasses}/${totalClasses} (Current batch: ${Math.floor(i/BATCH_SIZE) + 1})`
                            });
                        }
                        return result;
                    });

                    // Wait for the current batch to complete before moving to the next
                    await Promise.all(batchPromises);
                    
                    // Log batch completion
                    console.log(`[VisbalExt.TestClassExplorerView] Completed batch ${Math.floor(i/BATCH_SIZE) + 1} (${processedClasses}/${totalClasses} classes)`);
                }

                // Show completion message
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'showNotification',
                        message: `Completed loading ${totalClasses} test classes into explorer`
                    });
                }
            }

            if (this._view) {
                console.log('[VisbalExt.TestClassExplorerView] Sending test classes to webview');
                this._view.webview.postMessage({
                    command: 'testClassesLoaded',
                    testClasses: testClasses
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] Error fetching test classes:', error);
            this._statusBarService.hide();
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }

            vscode.window.showErrorMessage(`Error fetching test classes: ${error.message}`);
        }
    }

    private async _addTestToExplorer(testClass: TestClass) {
        console.log('[VisbalExt.TestClassExplorerView] _addTestToExplorer Adding test class:', testClass.name);
        
        // Create test item for the class
        const classItem = this._testController.createTestItem(
            testClass.id,
            testClass.name,
            vscode.Uri.file(testClass.attributes.fileName)
        );
        console.log('[VisbalExt.TestClassExplorerView] _addTestToExplorer Created class test item:', classItem.label);

        // If no methods present, try to fetch them
        if (!testClass.methods || testClass.methods.length === 0) {
            console.log(`[VisbalExt.TestClassExplorerView] No methods found for class ${testClass.name}, fetching them...`);
            try {
                const methods = await this._metadataService.getTestMethodsForClass(testClass.name);
                console.log('[VisbalExt.TestClassExplorerView] _addTestToExplorer Fetched methods:', methods);
                await this._storageService.saveTestMethodsForClass(testClass.name, methods);
                testClass.methods = methods.map(m => m.name);
                console.log(`[VisbalExt.TestClassExplorerView] Fetched ${methods.length} methods for class ${testClass.name}`);
            } catch (error) {
                console.error(`[VisbalExt.TestClassExplorerView] Error fetching methods for class ${testClass.name}:`, error);
            }
        }

        // Add test methods
        if (testClass.methods && testClass.methods.length > 0) {
            console.log(`[VisbalExt.TestClassExplorerView] Adding ${testClass.methods.length} methods for class ${testClass.name}`);
            
            for (const method of testClass.methods) {
                const methodItem = this._testController.createTestItem(
                    `${testClass.id}.${method}`,
                    method,
                    vscode.Uri.file(testClass.attributes.fileName)
                );
                console.log('[VisbalExt.TestClassExplorerView] _addTestToExplorer Created method test item:', methodItem.label);
                
                classItem.children.add(methodItem);
            }
        } else {
            console.log(`[VisbalExt.TestClassExplorerView] No methods available for class ${testClass.name}`);
        }

        // Add to test controller
        this._testController.items.add(classItem);
        this._testItems.set(testClass.name, classItem);
        console.log('[VisbalExt.TestClassExplorerView] _addTestToExplorer Test items updated in controller');
    }
	
	 private async _refreshTestMethods(className: string) {
		  console.log('[VisbalExt.TestClassExplorerView] _refreshTestMethods:', className);
        try {
            this._statusBarService.showMessage(`$(sync~spin) Refreshing test methods for ${className}...`);
            
			// If not in storage, fetch from Salesforce
			const testMethods = await this._metadataService.getTestMethodsForClass(className);
			 console.log('[VisbalExt.TestClassExplorerView] _refreshTestMethods testMethods:', testMethods);
			// Save to storage
			await this._storageService.saveTestMethodsForClass(className, testMethods);
			 console.log('[VisbalExt.TestClassExplorerView] _refreshTestMethods saveTestMethodsForClass:');

            // Send the test methods to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testMethodsLoaded',
                    className,
                    testMethods
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
			console.error('[VisbalExt.TestClassExplorerView] _refreshTestMethods error:',error);
            this._statusBarService.hide();
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }
	

    private async _fetchTestMethods(className: string) {
        try {
            this._statusBarService.showMessage(`$(sync~spin) Fetching test methods for ${className}...`);
            console.log('[VisbalExt.TestClassExplorerView] _fetchTestMethods -- Fetching test methods for:', className);
            // Try to get from storage first
            let testMethods = await this._storageService.getTestMethodsForClass(className);
            console.log('[VisbalExt.TestClassExplorerView] _fetchTestMethods -- testMethods:', testMethods);
            if (testMethods.length === 0) {
                // If not in storage, fetch from Salesforce
                testMethods = await this._metadataService.getTestMethodsForClass(className);
                console.log('[VisbalExt.TestClassExplorerView] _fetchTestMethods -- testMethods from Salesforce:', testMethods);
                // Save to storage
                await this._storageService.saveTestMethodsForClass(className, testMethods);
            }
            
            // Send the test methods to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testMethodsLoaded',
                    className,
                    testMethods
                });
            }
            
            this._statusBarService.hide();
        } catch (error: any) {
            this._statusBarService.hide();
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }

    private async _runTest(testClass: string, testMethod?: string) {
        try {
            console.log(`[VisbalExt.TestClassExplorerView] _runTest -- Starting test run for class: ${testClass}${testMethod ? `, method: ${testMethod}` : ''}`);
            
            // Clear previous test runs from the results view
            this._testRunResultsView.clearResults();
            
            // Get test methods if not provided
            let methodsToRun: string[] = [];
            if (testMethod) {
                methodsToRun = [testMethod];
            } else {
                const methods = await this._metadataService.getTestMethodsForClass(testClass);
                methodsToRun = methods.map(m => m.name);
            }

            // Add test run to results view
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Adding test run to results view');
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- testClass:', testClass);
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- methodsToRun:', methodsToRun);
            this._testRunResultsView.addTestRun(testClass, methodsToRun);

            // Update each method to running state
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Setting methods to running state');
            methodsToRun.forEach(method => {
                this._testRunResultsView.updateMethodStatus(testClass, method, 'running');
            });

            // Update status bar
            this._statusBarService.showMessage(`$(sync~spin) Running tests in ${testClass}...`);

            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Calling MetadataService.runTests');
            const result = await this._sfdxService.runTests(testClass, testMethod);
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Test execution completed. Result:', result);

            if (result && result.testRunId) {
                console.log('[VisbalExt.TestClassExplorerView] _runTest test run details for:', result.testRunId);
                const testRunResult = await this._sfdxService.getTestRunResult(result.testRunId);
                console.log('[VisbalExt.TestClassExplorerView] _runTest -- testRunResult:', testRunResult);
                console.log('[VisbalExt.TestClassExplorerView] _runTest -- testRunResult.summary:', testRunResult.summary);

                // Use the shared test results view instance
                if (testRunResult?.summary) {
                    console.log('[VisbalExt.TestClassExplorerView] _runTest -- Updating test results view with summary:', testRunResult.summary);
                    this._testSummaryView.updateSummary(testRunResult.summary, testRunResult.tests);
                } else {
                    console.warn('[VisbalExt.TestClassExplorerView] _runTest -- No summary data available in test run result');
                }

                // Update test results in webview
                if (this._view) {
                    console.log('[VisbalExt.TestClassExplorerView] _runTest -- testResultsLoaded');
                    this._view.webview.postMessage({
                        command: 'testResultsLoaded',
                        results: testRunResult
                    });
                }
                //test finish we collect the test run id and the logs    
                const mainClassMap = new Map<string, Boolean>();
                for (const t of testRunResult.tests) {
                    try {
                        //update the "Running Task" treeview status
                        this._testRunResultsView.updateMethodStatus(testClass, t.MethodName, 'downloading');
                        const logId = await this._metadataService.getTestLogId(result.testRunId);
                        if (logId) {
                            this._testRunResultsView.updateMethodStatus(testClass, t.MethodName, 'downloading', logId);
                            console.log(`[VisbalExt.TestClassExplorer] _runTest Processing log for test: ${t.ApexClass?.Name || 'Unknown'}`);
                            
                            // Download and open log for the first test only to avoid multiple windows
                            if (mainClassMap.size === 0) {
                                console.log(`[VisbalExt.TestClassExplorer] _runTest -- Downloading and opening log: ${logId}`);
                                await this._orgUtils.downloadLog(logId);
                                await this._orgUtils.openLog(logId, this._extensionUri, 'user_debug');
                            } else {
                                // For subsequent tests, just download in background
                                console.log(`[VisbalExt.TestClassExplorer] _runTest -- Downloading additional log: ${logId}`);
                                this._orgUtils.downloadLog(logId);
                            }
                        } else {
                            console.warn(`[VisbalExt.TestClassExplorer] _runTest -- No log ID found for test: ${t.ApexClass?.Name || 'Unknown'}`);
                        }
                        
                        //UPDATE THE STATUS OF THE METHOD
                        if (!mainClassMap.has(t.ApexClass.Name)) {
                            mainClassMap.set(t.ApexClass.Name, true);
                        }
                        console.log('[VisbalExt.TestClassExplorerView] _runTest -- Test:', t);
                        if (t.Outcome === 'Pass' || t.Outcome === 'Passed') {
                            this._testRunResultsView.updateMethodStatus(testClass, t.MethodName, 'success');
                        }
                        else if (t.Outcome === 'Fail' || t.Outcome === 'Failed') {
                            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Test failed:',t.Outcome);
                            this._testRunResultsView.updateMethodStatus(testClass, t.MethodName, 'failed');
                            mainClassMap.set(t.ApexClass.Name, false);
                        }
                    } catch (error) {
                        console.error(`[VisbalExt.TestClassExplorer] _runTest -- Error processing test log: ${error}`);
                    }
                }

                for (const [className, isSuccess] of mainClassMap.entries()) {
                    if (isSuccess) {
                        this._testRunResultsView.updateClassStatus(className, 'success');
                    }
                    else {
                        this._testRunResultsView.updateClassStatus(className, 'failed');
                    }
                }
               
            }
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] _runTest -- Error during test execution:', error);
            this._testRunResultsView.updateClassStatus(testClass, 'failed');
            if (testMethod) {
                this._testRunResultsView.updateMethodStatus(testClass, testMethod, 'failed');
            }
            vscode.window.showErrorMessage(`Error running tests: ${error.message}`);
        } finally {
            this._statusBarService.hide();
        }
    }
    
    private async _runSelectedTests(tests: { 
        classes: string[], 
        methods: { className: string, methodName: string }[],
        runMode: 'sequential' | 'parallel'
    }) {
        try {

            // Clear previous test runs from the results view
            this._testRunResultsView.clearResults();
            this._testSummaryView.clearView();
            
            const totalCount = tests.classes.length + tests.methods.length;
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunStarted'
                });
            }

            if (tests.methods.length === 1) {
                this._runTest(tests.methods[0].className, tests.methods[0].methodName);
            }
            else {

                this._statusBarService.showMessage(`$(beaker~spin) Running ${totalCount} selected tests in ${tests.runMode} mode...`);
                
                const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
                
                if (!sfExtension) {
                    throw new Error('Salesforce Extension Pack is required to run tests. Please install it from the VS Code marketplace.');
                }
                
                let results: any[] = [];
                console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- tests:', tests);

                // Add the tests to the Running task view
                const classesWithMethods = new Map<string, string[]>();
                for (const { className, methodName } of tests.methods) {
                    if (!classesWithMethods.has(className)) {
                        classesWithMethods.set(className, []);
                    }
                    classesWithMethods.get(className)?.push(methodName);
                }

                // Add class-level tests
                for (const className of tests.classes) {
                    if (!classesWithMethods.has(className)) {
                        const methods = await this._metadataService.getTestMethodsForClass(className);
                        classesWithMethods.set(className, methods.map(m => m.name));
                    }
                }

                // Add all tests to the results view
                for (const [className, methodNames] of classesWithMethods.entries()) {
                    this._testRunResultsView.addTestRun(className, methodNames);
                }

                if (tests.runMode === 'parallel') {
                    const PARALLEL_OLD_WAY = false;
                    if (PARALLEL_OLD_WAY) {
                        //#region PARALLEL_OLD_WAY
                        // Run all tests in parallel and process results as they complete
                        const mainClassMap = new Map<string, Boolean>();
                        const allTestResults: any[] = [];


                        // Create promises for all tests but process them as they complete
                        const testPromises = [];
                        for (const [className, methodNames] of classesWithMethods.entries()) {
                            for (const methodName of methodNames) {
                                this._testRunResultsView.updateMethodStatus(className, methodName, 'running');
                                
                                // Execute test and process its result immediately
                                const testPromise = this._executeTest(className, methodName)
                                    .then(async (result) => {
                                        if (result && result.testRunId) {
                                            try {
                                                const [testRunResult, logId] = await Promise.all([
                                                    this._sfdxService.getTestRunResult(result.testRunId),
                                                    this._sfdxService.getTestLogId(result.testRunId)
                                                ]);
                                                console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests.parallel -- testRunResult:', testRunResult);
                                                console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests.parallel -- logId:', logId);

                                                // Store the test result for summary
                                                if (testRunResult && testRunResult.summary) {
                                                    allTestResults.push(testRunResult);
                                                }

                                                // Process each test in the result
                                                for (const test of testRunResult.tests) {
                                                    const testClassName = test.ApexClass?.Name;
                                                    if (!testClassName) continue;

                                                    // Download log if available
                                                    if (logId) {
                                                        console.log(`[VisbalExt.TestClassExplorer] Processing log for test: ${testClassName}.${test.MethodName}`);
                                                        this._testRunResultsView.updateMethodStatus(testClassName, test.MethodName, 'downloading', logId);
                                                        
                                                        // Download log in background
                                                        this._orgUtils.downloadLog(logId).catch(error => {
                                                            console.error(`[VisbalExt.TestClassExplorer] Error downloading log: ${error}`);
                                                        });
                                                    }

                                                    // Initialize class status if not already set
                                                    if (!mainClassMap.has(testClassName)) {
                                                        mainClassMap.set(testClassName, true);
                                                    }

                                                    // Update method status
                                                    if (test.Outcome === 'Pass' || test.Outcome === 'Passed') {
                                                        this._testRunResultsView.updateMethodStatus(testClassName, test.MethodName, 'success', logId);
                                                    } else if (test.Outcome === 'Fail' || test.Outcome === 'Failed') {
                                                        this._testRunResultsView.updateMethodStatus(testClassName, test.MethodName, 'failed', logId);
                                                        mainClassMap.set(testClassName, false);
                                                    }

                                                    // Update class status immediately
                                                    this._testRunResultsView.updateClassStatus(
                                                        testClassName, 
                                                        mainClassMap.get(testClassName) ? 'success' : 'failed'
                                                    );
                                                }

                                                // Update the webview with current results
                                                if (this._view && allTestResults.length > 0) {
                                                    const combinedSummary = allTestResults.map(result => result.summary);
                                                    const allTests = allTestResults.reduce((acc, result) => acc.concat(result.tests), []);
                                                    this._testSummaryView.updateSummary(combinedSummary, allTests);
                                                }
                                            } catch (error) {
                                                console.error(`[VisbalExt.TestClassExplorer] Error processing test result: ${error}`);
                                            }
                                        }
                                    })
                                    .catch(error => {
                                        console.error(`[VisbalExt.TestClassExplorer] Error executing test ${className}.${methodName}: ${error}`);
                                        this._testRunResultsView.updateMethodStatus(className, methodName, 'failed');
                                    });

                                testPromises.push(testPromise);
                            }
                        }

                        // Wait for all tests to complete
                        await Promise.all(testPromises);

                        // Final update with all results
                        if (allTestResults.length > 0) {
                            const combinedSummary = allTestResults.map(result => result.summary);
                            const allTests = allTestResults.reduce((acc, result) => acc.concat(result.tests), []);
                            this._testSummaryView.updateSummary(combinedSummary, allTests);
                        } else {
                            console.warn('[VisbalExt.TestClassExplorerView] _runSelectedTests.parallel -- No test results available');
                        }
                        //#endregion PARALLEL_OLD_WAY
                    }
                    else {
                        
                        results = await this._runTestSelectedParallel(tests);
                        //combine the results and update the test summary view at the bottom of the test side panel view
                        if (results.length > 0) {
                            const combinedSummary = results.map(result => result.summary);
                            const allTests = results.reduce((acc, result) => acc.concat(result.tests), []);
                            this._testSummaryView.updateSummary(combinedSummary, allTests);
                        }
                    }
                   
                    //#region PARALLEL MODE
                    
                    //#endregion PARALLEL MODE
                    
                } else {
                    //#region SEQUENTIAL MODE
                    // Run tests sequentially
                    results = await this._runTestSelectedSequentially(tests);
                    console.log(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- runMode:${tests.runMode} -- testResultsLoaded results:`, results);
                    //#endregion SEQUENTIAL MODE
                    const SEQUENTIAL_OLD_WAY = false;
                    if (SEQUENTIAL_OLD_WAY) {
                        
                    }
                    else {
                        //combine the results and update the test summary view at the bottom of the test side panel view
                        if (results.length > 0) {
                            const combinedSummary = results.map(result => result.summary);
                            const allTests = results.reduce((acc, result) => acc.concat(result.tests), []);
                            this._testSummaryView.updateSummary(combinedSummary, allTests);
                        }
                    }
                }

                console.log(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- runMode:${tests.runMode} -- testResultsLoaded results:`, results);
                const combinedResult = this._combineTestResults(results);
                console.log(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- runMode:${tests.runMode} -- testResultsLoaded combinedResult:`, combinedResult);    
                console.log(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- runMode:${tests.runMode} -- testResultsLoaded this._view:`, this._view);
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testResultsLoaded',
                        results: combinedResult
                    });
                }
                
                this._statusBarService.hide();
            }
        } catch (error: any) {
            this._statusBarService.hide();
            console.error('[VisbalExt.TestClassExplorerView] Error running selected tests:', error);
            
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'error',
                    message: `Error: ${error.message}`
                });
            }
        }
    }


    private async _processPromises(promises: Promise<any>[]) {
        const results = await Promise.allSettled(promises);
      
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                console.log('Promise resolved:', result.value);
                const { progress } = result.value;
                if (progress?.runTest?.testRunId) {
                    try {
                        // Get log ID
                        const logId = await this._sfdxService.getTestLogId(progress.runTest.testRunId);
                        console.log(`[VisbalExt.TestClassExplorerView] _processPromises -- getTestLogId ${progress.className}.${progress.methodName} -- logId:`, logId);
                        progress.logId = logId;
                        progress.finishGettingLogId = true;
                        
                        // Download log
                        if (logId) {
                            
                            if (progress.downloadLog) {
                                progress.initiateDownloadingLog = true;
                                this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, TestStatus.downloading, logId);
                                await this._orgUtils.downloadLog(logId);
                                progress.finishDownloadingLog = true;
                            }

                            if (progress.runResult && progress.runResult.summary) {
                                if (progress.runResult.summary.outcome === 'Pass' || progress.runResult.summary.outcome === 'Passed') {
                                    this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'success', logId);
                                } else if (progress.runResult.summary.outcome === 'Fail' || progress.runResult.summary.outcome === 'Failed') {
                                    this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'failed', logId);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error processing test logs:', error);
                    }
                }
            } else if (result.status === 'rejected') {
                console.error('Promise rejected:', result.reason);
            }
        }
    }
    
    private async _runTestSelectedParallel(tests: { 
        classes: string[], 
        methods: { className: string, methodName: string }[],
        runMode: 'sequential' | 'parallel'
    }) {
        try {
            const downloadLog = false;
            this._isRunning = true;
            this._abortController = new AbortController();
            const signal = this._abortController.signal;

            // Update UI to show running state
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunStarted'
                });
            }

            const results: any[] = [];
            console.log('[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- tests:', tests);
            let allTestsCompleted = false;      

            const testProgress = new Map<string, TestProgressState>();

            // Check for abort signal
            if (signal.aborted) {
                return [];
            }

            console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- iteration:0`);
            for (const { className, methodName } of tests.methods) {
                const methodId = this.getMethodId(className, methodName);
                //initialize & execute the test
                if (!testProgress.has(methodId)) {     
                    testProgress.set(methodId, {
                        className: className,
                        methodName: methodName,
                        testRunId: '',
                        error: '',
                        runTest: null,
                        runResult: null,
                        logId: '',
                        initiated: false,
                        finished: false,
                        finishExecutingTest: false,
                        initiateTestResult: false,
                        finishGettingTestResult: false,
                        initiateLogId: false,
                        finishGettingLogId: false,
                        initiateDownloadingLog: false,
                        finishDownloadingLog: false,
                        status: TestStatus.running,
                        downloadLog: false
                    });
                    this._testRunResultsView.updateMethodStatus(className, methodName, 'pending');
                }
            }



            const maxRetries = 10 * tests.methods.length;
            let countIteration = 0;
            let retryCount = 0;


            while (!allTestsCompleted && retryCount < maxRetries) {
                if (signal.aborted) {
                    return [];
                }
                countIteration++;
                //get 5 testProgress where initiated is false
                const pendingTests = Array.from(testProgress.values()).filter((progress: TestProgressState) => !progress.initiated);
                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- pendingTests:`, pendingTests);

                //batch pending tests into 5 groups
                const batchSize = 5;
                const batches = [];
                // what if pendingTests.length less that 5?
                if (pendingTests.length < batchSize) {
                    batches.push(pendingTests);
                }
                else {
                    for (let i = 0; i < pendingTests.length; i += batchSize) {
                        batches.push(pendingTests.slice(i, i + batchSize));
                    }
                }
                
                if (batches.length > 0) {
                    retryCount++;
                }
                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- batches:`, batches);
                // Process each batch sequentially
                for (const batch of batches) {
                    // Create promises for the current batch of tests
                    const batchPromises = batch.map((progress) => {
                        if (!progress) {
                            return Promise.resolve(null);
                        }

                    
                        return new Promise<{ className: string; methodName: string; progress: TestProgressState }>(async (resolve, reject) => {
                            try {
                                progress.initiated = true;
                                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- Running: ${progress.className}.${progress.methodName} -- iteration:${countIteration}`);
                                this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'running');
                                // Execute test and wait for result
                                const runTest = await this._sfdxService.runTests(progress.className, progress.methodName);
                                progress.runTest = runTest;
                                progress.finishExecutingTest = true;
                                progress.testRunId = runTest.testRunId;
                                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- getTestRunResult ${progress.className}.${progress.methodName} -- runTest.testRunId:${runTest.testRunId} -- runTest:`, runTest);
                                
                                if (runTest.testRunId) {
                                     console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- getTestRunResult ${progress.className}.${progress.methodName} -- STARTS`);
                                    // Get test run result
                                    const runResult = await this._sfdxService.getTestRunResult(runTest.testRunId);
                                    progress.runResult = runResult;
                                    progress.finishGettingTestResult = true;
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- getTestRunResult ${progress.className}.${progress.methodName} -- runResult:`, runResult);

                                    if (progress.runResult && progress.runResult.summary) {
                                        if (progress.runResult.summary.outcome === 'Pass' || progress.runResult.summary.outcome === 'Passed') {
                                            this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'success', undefined);
                                        } else if (progress.runResult.summary.outcome === 'Fail' || progress.runResult.summary.outcome === 'Failed') {
                                            this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'failed', undefined);
                                        }
                                    }
                                    
                                    resolve({ className: progress.className, methodName: progress.methodName, progress });
                                }
                                else if (runTest.data?.errorCode === 'ALREADY_IN_PROCESS' || runTest.name === 'ALREADY_IN_PROCESS') {
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- ALREADY_IN_PROCESS detected for ${progress.className}.${progress.methodName}`);
                                    console.log('[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- Full runTest object:', runTest);
                                    progress.status = TestStatus.running;
                                    this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'running');
                                    resolve({ className: progress.className, methodName: progress.methodName, progress });  
                                }
                            } catch (error: unknown) {
                                console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedParallel -- Error executing test:`, error);
                                if (error instanceof Error && 'data' in error && typeof error.data === 'object' && error.data && 'errorCode' in error.data && error.data.errorCode === 'ALREADY_IN_PROCESS') {
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- ALREADY_IN_PROCESS detected for ${progress.className}.${progress.methodName}`);
                                    progress.status = TestStatus.running;
                                    this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'running');
                                    resolve({ className: progress.className, methodName: progress.methodName, progress });
                                } else {
                                    progress.error = error instanceof Error ? error.message : String(error);
                                    progress.status = TestStatus.failed;
                                    this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'failed');
                                    reject(error);
                                }
                            }
                        });
                    });

                    // Process all promises in the current batch in parallel
                    if (batchPromises.length > 0) {
                        try {
                            await this._processPromises(batchPromises);
                        } catch (error: unknown) {
                            console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedParallel -- Error processing batch promises:`, error);
                        }
                    }

                    // Add a small delay between batches to prevent overwhelming the system
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // filter where progress.finishGettingTestResult get progress.runResult
                let tempResults = Array.from(testProgress.values()).filter((progress: TestProgressState) => progress.finishGettingTestResult && progress.runResult);
                //get the runResult from tempResults
                let tempRunResults = tempResults.map((progress: TestProgressState) => progress.runResult);
                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- tempRunResults:`, tempRunResults);
               
                if (tempRunResults.length > 0) {
                    const combinedSummary = results.map(result => result.summary);
                    const allTests = results.reduce((acc, result) => acc.concat(result.tests), []);
                    this._testSummaryView.updateSummary(combinedSummary, allTests);
                }
              
                

                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- testProgress:`, testProgress);
                allTestsCompleted = Array.from(testProgress.values()).every((progress: TestProgressState) => 
                    progress.status === TestStatus.success || progress.status === TestStatus.failed
                );
                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- allTestsCompleted:`, allTestsCompleted);

                if (!allTestsCompleted) {
                    // Wait time increases exponentially with iteration count, starting at 1s
                    // and capped at 30s: 1s, 1.5s, 2.25s, 3.37s, ... , 30s max
                    const delay = Math.min(1000 * Math.pow(1.5, countIteration), 30000);
                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel -- delay:${delay}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            }


            if (allTestsCompleted) {
                for (const { className, methodName } of tests.methods) {
                    
                    const methodId = this.getMethodId(className, methodName);
                    const progress = testProgress.get(methodId);
                    if (progress) {
                        results.push(progress.runResult);
                        //isrunning show pending
                        if (progress.status === TestStatus.running) {
                            this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, 'pending');
                        }
                    }
                }
            }
            
            console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedParallel FINISHED -- results:`, results);
            return results || [];                                 
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] Error running selected tests:', error);
            if (error.message === 'Test execution aborted by user') {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testRunAborted'
                    });
                }
            } else {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'error',
                        message: `Error: ${error.message}`
                    });
                }
            }
            return [];
        } finally {
            this._isRunning = false;
            this._abortController = null;
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunFinished'
                });
            }
        }
    }

    private async _runTestSelectedSequentially(tests: { 
        classes: string[], 
        methods: { className: string, methodName: string }[],
        runMode: 'sequential' | 'parallel'
    }) {
        try {
            this._isRunning = true;
            this._abortController = new AbortController();
            const signal = this._abortController.signal;

            // Update UI to show running state
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunStarted'
                });
            }

            //const allTestResults: any[] = [];
            const results: TestRunResult[] = [];
            //const errorMap = new Map<string, string>();
            //const allTestResults: any[] = [];  // Store all test results
            console.log('[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- tests:', tests);
            let allTestsCompleted = false;      

            const testProgress = new Map<string, TestProgressState>();
            const maxRetries = 10 * tests.methods.length;
            let countIteration = 0;

            while (!allTestsCompleted && countIteration < maxRetries) {
                if (signal.aborted) {
                    return [];
                }
                countIteration++;
                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- iteration:${countIteration}`);
                for (const { className, methodName } of tests.methods) {
                    const methodId = this.getMethodId(className, methodName);
                    //initialize & execute the test
                    if (!testProgress.has(methodId)) {     
                        testProgress.set(methodId, {
                            className: className,
                            methodName: methodName,
                            testRunId: '',
                            error: '',
                            runTest: null,
                            runResult: null,
                            logId: '',
                            initiated: false,
                            finished: false,
                            finishExecutingTest: false,
                            initiateTestResult: false,
                            finishGettingTestResult: false,
                            initiateLogId: false,
                            finishGettingLogId: false,
                            initiateDownloadingLog: false,
                            finishDownloadingLog: false,
                            status: TestStatus.running,
                            downloadLog: false
                        });
                        this._testRunResultsView.updateMethodStatus(className, methodName, 'running');
                        console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- Running: ${className}.${methodName} -- iteration:${countIteration}`);
                        const progress = testProgress.get(methodId);
                        if (progress) {
                            try {
                                //const handleTestRun = async () => {
                                    // Execute test and wait for result
                                    const result = await this._sfdxService.runTests(className, methodName);
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- runTests -- ${className}.${methodName} -- A -- iteration:${countIteration} result:`, result);
                                    progress.runTest = result;
                                    progress.testRunId = result.testRunId;
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- runTests -- ${className}.${methodName} -- B -- iteration:${countIteration} result.testRunId:`, result.testRunId);
                                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- runTests -- ${className}.${methodName} -- D -- iteration:${countIteration} progress.testRunId:`, progress.testRunId);
                                    progress.finishExecutingTest = true;

                                    if (!progress.runResult && !progress.initiateTestResult) {
                                        progress.initiateTestResult = true;
                                        const testResult = await this._sfdxService.getTestRunResult(progress.testRunId);
                                        progress.runResult = testResult;
                                        //allTestResults.push(testResult);
                                        progress.finishGettingTestResult = true;
                                        console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestRunResult -- ${className}.${methodName} -- iteration:${countIteration} result:`, testResult);
                                    }

                                    if (!progress.logId && !progress.initiateLogId) {
                                        progress.initiateLogId = true;
                                        const logId = await this._sfdxService.getTestLogId(progress.testRunId);
                                        progress.logId = logId;
                                        progress.finishGettingLogId = true;
                                        console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestLogId -- ${className}.${methodName} -- iteration:${countIteration} logId:`, logId);

                                        if (progress.logId && !progress.initiateDownloadingLog) {
                                            if (progress.downloadLog) {
                                                progress.initiateDownloadingLog = true;
                                                this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, TestStatus.downloading, progress.logId);
                                                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- downloadLog -- A -- ${className}.${methodName} -- iteration:${countIteration} logId:`, progress.logId);
                                                // Download log in background
                                                await this._orgUtils.downloadLog(progress.logId);
                                                progress.finishDownloadingLog = true;
                                                console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- downloadLog -- B -- ${className}.${methodName} -- iteration:${countIteration} logId:`, progress.logId);
                                            }
                                        }
                                    }
                                //}

                                 // Execute the async function without waiting
                                 //handleTestRun().catch(error => {
                                //    console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- handleTestRun -- iteration:${countIteration} ${className}.${methodName} ERROR`, error);
                                //    this._testRunResultsView.updateMethodStatus(className, methodName, 'failed');
                                //});
                            } catch (error) {
                                console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- error: -- ${className}.${methodName} -- iteration:${countIteration}`, error);
                            }
                        }
                    }
                    //console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- iteration:${countIteration} -- allTestResults:${allTestResults.length} LOOP FINISHED`, );
                }
                    

                //get the test result, get the log id & get the test run result & log id
                for (const { className, methodName } of tests.methods) {
                    const methodId = this.getMethodId(className, methodName);
                    const progress = testProgress.get(methodId);
                    if (progress && progress.finishExecutingTest) {
                        const result = progress.runTest;
                        if (result && result.testRunId) {

                            if (!progress.runResult && !progress.initiateTestResult) {
                                progress.initiateTestResult = true;
                                this._sfdxService.getTestRunResult(progress.testRunId)
                                    .then(result => {
                                        progress.runResult = result;
                                        progress.finishGettingTestResult = true;
                                        console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestRunResult -- iteration:${countIteration} result:`, result);
                                    }).catch(error => {
                                        console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestRunResult -- error: ${error} -- iteration:${countIteration}`);
                                    });
                            }

                            if (!progress.logId && !progress.initiateLogId) {
                                progress.initiateLogId = true;
                                this._sfdxService.getTestLogId(progress.testRunId)
                                    .then(logId => {
                                        progress.logId = logId;
                                        progress.finishGettingLogId = true;
                                        console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestLogId -- iteration:${countIteration} logId:`, logId);
                                    }).catch(error => {
                                        console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- getTestLogId -- error: ${error} -- iteration:${countIteration}`);
                                    });
                            }


                        }
                    }
                }

                //download the log
            
                for (const { className, methodName } of tests.methods) {
                    const methodId = this.getMethodId(className, methodName);
                    const progress = testProgress.get(methodId);
                    if (progress && progress.downloadLog && progress.finishGettingLogId) {  
                        if (progress.logId && !progress.initiateDownloadingLog) {
                            progress.initiateDownloadingLog = true;
                            this._testRunResultsView.updateMethodStatus(progress.className, progress.methodName, TestStatus.downloading, progress.logId);
                            // Download log in background
                            this._orgUtils.downloadLog(progress.logId)
                                .then(() => {
                                    progress.finishDownloadingLog = true;
                                    console.log(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- downloadLog -- iteration:${countIteration} logId:`, progress.logId);
                                }).catch(error => {
                                    console.error(`[VisbalExt.TestClassExplorer] _runTestSelectedSequentially -- downloadLog -- error: ${error} -- iteration:${countIteration}`);
                                });

                        }
                    }
                }


                //process the status of the test
                for (const { className, methodName } of tests.methods) {
                    const methodId = this.getMethodId(className, methodName);
                    const progress = testProgress.get(methodId);
                    if (progress) {
                        if (progress.runResult && progress.finishGettingTestResult && (progress.finishDownloadingLog || !progress.downloadLog)) {
                            for (const t of progress.runResult.tests) {
                                if (t.Outcome === 'Pass' || t.Outcome === 'Passed') {
                                    progress.status = TestStatus.success;
                                } else if (t.Outcome === 'Fail' || t.Outcome === 'Failed') {
                                    progress.status = TestStatus.failed;
                                }
                                console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- updateMethodStatus -- iteration:${countIteration} className:${className} methodName:${t.MethodName} status:${progress.status} logId:${progress.logId}`);
                                this._testRunResultsView.updateMethodStatus(className, t.MethodName, progress.status, progress.logId);
                            }
                        }
                    }
                }

                //console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- iteration:${countIteration} -- allTestResults:${allTestResults.length} WHILE LOOP FINISH`, );
                allTestsCompleted = Array.from(testProgress.values()).every((progress: TestProgressState) => 
                    progress.status === TestStatus.success || progress.status === TestStatus.failed
                );

                if (!allTestsCompleted) {
                    // Wait time increases exponentially with iteration count, starting at 1s
                    // and capped at 30s: 1s, 1.5s, 2.25s, 3.37s, ... , 30s max
                    const delay = Math.min(1000 * Math.pow(1.5, countIteration), 30000);
                    console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially -- delay:${delay}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            }


            if (allTestsCompleted) {
                for (const { className, methodName } of tests.methods) {
                    const methodId = this.getMethodId(className, methodName);
                    const progress = testProgress.get(methodId);
                    if (progress) {
                        results.push(progress.runResult);
                    }
                }
            }

            //console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially-- allTestResults:${allTestResults.length} FINISHED`, );
            console.log(`[VisbalExt.TestClassExplorerView] _runTestSelectedSequentially FINISHED -- results:`, results);
            return results;                                 
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] Error running selected tests:', error);
            if (error.message === 'Test execution aborted by user') {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'testRunAborted'
                    });
                }
            } else {
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'error',
                        message: `Error: ${error.message}`
                    });
                }
            }
            return [];
        } finally {
            this._isRunning = false;
            this._abortController = null;
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunFinished'
                });
            }
        }
    }

    private getMethodId(className: string, methodName: string) {
        return `${className}.${methodName}`;
    }   

    private async _runAllTests(runMode: 'sequential' | 'parallel') {
        try {
            console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- runMode:', runMode);

            // Clear previous test runs from the results view
            this._testRunResultsView.clearResults();

            // Update status bar
            this._statusBarService.showMessage(`$(beaker~spin) Running all tests in ${runMode} mode...`);

            // Get all test classes first
            const testClasses = await this._storageService.getTestClasses();
            console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- Found test classes:', testClasses.length);

            // Add all test classes and their methods to the results view
            for (const testClass of testClasses) {
                const methods = await this._storageService.getTestMethodsForClass(testClass.name);
                if (methods.length > 0) {
                    this._testRunResultsView.addTestRun(testClass.name, methods.map(m => m.name));
                    // Set initial status to running
                    methods.forEach(method => {
                        this._testRunResultsView.updateMethodStatus(testClass.name, method.name, 'running');
                    });
                }
            }

            // Execute all tests
            const result = await this._executeAllTest();
            console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- Test execution completed. Result:', result);

            if (result && result.testRunId) {
                const testRunResult = await this._sfdxService.getTestRunResult(result.testRunId);
                console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- testRunResult:', testRunResult);

                // Update test summary view
                if (testRunResult?.summary) {
                    console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- Updating test summary view:', testRunResult.summary);
                    this._testSummaryView.updateSummary(testRunResult.summary, testRunResult.tests);
                }

                // Update test results in webview
                if (this._view) {
                    console.log('[VisbalExt.TestClassExplorerView] _runAllTests -- Sending test results to webview');
                    this._view.webview.postMessage({
                        command: 'testResultsLoaded',
                        results: testRunResult
                    });
                }
            }
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] _runAllTests -- Error during test execution:', error);
            vscode.window.showErrorMessage(`Error running all tests: ${error.message}`);
        } finally {
            this._statusBarService.hide();
        }
    }   

    private async _executeTest(className: string, methodName: string) {
        try {
            console.log(`[VisbalExt.TestClassExplorerView] Executing test: ${className}.${methodName}`);
            
            const result = await this._sfdxService.runTests(className, methodName);
            if (result && result.testRunId) {
                const [testRunResult, logId] = await Promise.all([
                    this._sfdxService.getTestRunResult(result.testRunId),
                    this._sfdxService.getTestLogId(result.testRunId)
                ]);

                if (logId) {
                    console.log(`[VisbalExt.TestClassExplorer] Processing log for test: ${className}.${methodName}`);
                    this._testRunResultsView.updateMethodStatus(className, methodName, 'downloading');
                    
                    // Download log in background
                    this._orgUtils.downloadLog(logId).catch(error => {
                        console.error(`[VisbalExt.TestClassExplorer] Error downloading log: ${error}`);
                    });
                }

                const test = testRunResult.tests.find((t: { MethodName: string, Outcome: string }) => t.MethodName === methodName);
                if (test) {
                    this._testRunResultsView.updateMethodStatus(
                        className,
                        methodName,
                        (test.Outcome === 'Pass' || test.Outcome === 'Passed') ? 'success' : 'failed'
                    );
                }

                return result;
            }
            return null;
        } catch (error) {
            console.error(`[VisbalExt.TestClassExplorer] Error executing test ${className}.${methodName}:`, error);
            this._testRunResultsView.updateMethodStatus(className, methodName, 'failed');
            return null;
        }
    }


    private async _executeAllTest() {
        try {
            console.log(`[VisbalExt.TestClassExplorerView] _executeAllTest:`);
            
            const result = await this._sfdxService.runAllTests();
            console.log('[VisbalExt.TestClassExplorerView] _executeAllTest -- result:', result);
            if (result && result.testRunId) {
                console.log('[VisbalExt.TestClassExplorerView] _executeAllTest -- result.testRunId:', result.testRunId);
                const [testRunResult, logId] = await Promise.all([
                    this._sfdxService.getTestRunResult(result.testRunId),
                    this._sfdxService.getTestLogId(result.testRunId)
                ]);

                // Process each test result
                for (const test of testRunResult.tests) {
                    const className = test.ApexClass?.Name;
                    const methodName = test.MethodName;
                    
                    if (className && methodName) {
                        // Update method status with log ID
                        this._testRunResultsView.updateMethodStatus(
                            className,
                            methodName,
                            (test.Outcome === 'Pass' || test.Outcome === 'Passed') ? 'success' : 'failed',
                            logId
                        );

                        // Update class status based on method outcome
                        this._testRunResultsView.updateClassStatus(
                            className,
                            (test.Outcome === 'Pass' || test.Outcome === 'Passed') ? 'success' : 'failed'
                        );
                    }
                }

                return result;
            }
            return null;
        } catch (error) {
            console.error(`[VisbalExt.TestClassExplorer] Error executing all tests:`, error);
            return null;
        }
    }


    private _combineTestResults(results: any[]): any {
        if (!results || results.length === 0 || !Array.isArray(results)) {
            return {
                summary: {
                    outcome: 'Failed',
                    testsRan: 0,
                    passing: 0,
                    failing: 0,
                    skipped: 0,
                    testTotalTime: 0
                },
                tests: []
            };
        }
        
        // Filter out null/undefined results
        const validResults = results.filter(result => result && result.summary);
        
        // If only one valid result, return it directly
        if (validResults.length === 1) {
            return validResults[0];
        }
        
        // Combine multiple results
        const combinedTests = [];
        let totalTests = 0;
        let totalPassing = 0;
        let totalFailing = 0;
        let totalSkipped = 0;
        let totalTime = 0;
        
        for (const result of validResults) {
            if (result.tests) {
                combinedTests.push(...result.tests);
            }
            
            if (result.summary) {
                totalTests += result.summary.testsRan || 0;
                totalPassing += result.summary.passing || 0;
                totalFailing += result.summary.failing || 0;
                totalSkipped += result.summary.skipped || 0;
                totalTime += result.summary.testTotalTime || 0;
            }
        }
        
        return {
            summary: {
                outcome: totalFailing > 0 ? 'Failed' : 'Passed',
                testsRan: totalTests,
                passing: totalPassing,
                failing: totalFailing,
                skipped: totalSkipped,
                testTotalTime: totalTime
            },
            tests: combinedTests
        };
    }
    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this._getNonce();
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <title>Test Class Explorer</title>
            <link href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'))}" rel="stylesheet" />
            <style>
                :root {
                    --container-padding: 0;
                    --input-padding-vertical: 2px;
                    --input-padding-horizontal: 4px;
                    --input-margin-vertical: 4px;
                    --input-margin-horizontal: 0;
                }

                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: var(--container-padding);
                    margin: 0;
                    width: 100%;
                    height: 100vh;
                    box-sizing: border-box;
                    overflow: hidden;
                }

                .container {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    margin: 0;
                    padding: 0;
                    border-right: 1px solid var(--vscode-panel-border);
                }

                .test-classes-container {
                    flex: 1;
                    overflow-y: auto;
                    margin: 0;
                    padding: 5px;
                    border-top: 1px solid var(--vscode-panel-border);
                    min-height: 0;
                    scrollbar-width: thin; /* For Firefox */
                    scrollbar-color: var(--vscode-scrollbarSlider-background) transparent; /* For Firefox */
                }

                /* Webkit (Chrome, Safari, Edge) scrollbar styles */
                .test-classes-container::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }

                .test-classes-container::-webkit-scrollbar-track {
                    background: var(--vscode-scrollbarSlider-background);
                    opacity: 0.4;
                }

                .test-classes-container::-webkit-scrollbar-thumb {
                    background-color: var(--vscode-scrollbarSlider-background);
                    border-radius: 4px;
                    min-height: 40px;
                }

                .test-classes-container::-webkit-scrollbar-thumb:hover {
                    background-color: var(--vscode-scrollbarSlider-hoverBackground);
                }

                .test-classes-container::-webkit-scrollbar-thumb:active {
                    background-color: var(--vscode-scrollbarSlider-activeBackground);
                }

                .test-classes-container::-webkit-scrollbar-corner {
                    background: transparent;
                }

                /* Make sure the container allows scrolling */
                .split-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    height: 100%;
                    position: relative;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }

                /* Ensure the list takes full height */
                #testClassesList {
                    height: 100%;
                    overflow: visible;
                }

                .actions {
                    padding: 5px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--vscode-editor-background);
                    min-height: 32px;
                }

                .test-classes-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                    width: 100%;
                }

                .test-class-item {
                    padding: 3px 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    width: 100%;
                }

                .test-class-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .test-class-name {
                    margin-left: 5px;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .test-methods-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                    width: 100%;
                    background-color: var(--vscode-list-dropBackground);
                    border-top: 1px solid var(--vscode-list-focusOutline);
                    border-bottom: 1px solid var(--vscode-list-focusOutline);
                }

                .test-method-item {
                    padding: 2px 5px 2px 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    width: 100%;
                }

                .test-method-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .test-method-name {
                    margin-left: -5px;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    padding-right: 8px;
                }

                

                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 12px;
                    margin: 0 2px;
                }

                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .icon-button {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--vscode-editor-foreground);
                    border-radius: 3px;
                    margin: 0 2px;
                }

                .icon-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }

                .loading {
                    display: flex;
                    align-items: center;
                    padding: 5px;
                }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--vscode-editor-foreground);
                    border-radius: 50%;
                    border-top-color: transparent;
                    animation: spin 1s linear infinite;
                    margin-right: 8px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .hidden {
                    display: none !important;
                }

                .error-container {
                    margin: 5px;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                    max-height: 200px;
                    overflow-y: auto;
                    font-size: 12px;
                    position: relative;
                }

                .error-container.collapsed {
                    max-height: 32px;
                    overflow: hidden;
                    cursor: pointer;
                }

                .error-container .error-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 4px;
                }

                .error-container .error-title {
                    font-weight: bold;
                    margin-right: 8px;
                }

                .error-container .error-toggle {
                    cursor: pointer;
                    padding: 2px;
                    position: absolute;
                    right: 4px;
                    top: 4px;
                }

                .error-container .error-content {
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .error-container.collapsed .error-content {
                    display: -webkit-box;
                    -webkit-line-clamp: 1;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .notification-container {
                    margin: 5px;
                    padding: 8px;
                    background-color: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    color: var(--vscode-inputValidation-infoForeground);
                }

                .icon {
                    width: 16px;
                    height: 16px;
                    flex-shrink: 0;
                }

                .select-all-container {
                    display: flex;
                    align-items: center;
                    margin-right: 10px;
                    cursor: pointer;
                }
                .select-all-label {
                    margin-left: 5px;
                    user-select: none;
                }
                .selection-actions {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .run-options {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .run-mode-select {
                    background: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 2px 6px;
                    border-radius: 2px;
                    font-size: 12px;
                }

                .context-menu {
                    position: absolute;
                    background: var(--vscode-menu-background);
                    border: 1px solid var(--vscode-menu-border);
                    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                    border-radius: 3px;
                    padding: 4px 0;
                    min-width: 180px;
                    z-index: 1000;
                    display: none;
                }

                .context-menu.show {
                    display: block;
                }

                .context-menu-item {
                    display: flex;
                    align-items: center;
                    padding: 6px 12px;
                    cursor: pointer;
                    color: var(--vscode-menu-foreground);
                    font-size: 13px;
                    gap: 8px;
                }

                .context-menu-item:hover {
                    background: var(--vscode-menu-selectionBackground);
                    color: var(--vscode-menu-selectionForeground);
                }

                .context-menu-item .codicon {
                    font-size: 14px;
                }

                .abort-button {
                    background-color: var(--vscode-errorForeground);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 12px;
                    margin: 0 2px;
                    display: none;
                }

                .abort-button:hover {
                    opacity: 0.8;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="actions">
                    <div class="selection-actions">
                        <label class="select-all-container">
                            <input type="checkbox" id="selectAllCheckbox" class="checkbox">
                            <span class="select-all-label">Select All</span>
                        </label>
                        <span id="selectionCount" class="selection-count">0 selected</span>
                        <div class="run-options">
                            <select id="runMode" class="run-mode-select">
                                <option value="sequential">Sequential</option>
                                <option value="parallel">Parallel</option>
                            </select>
                            <button id="runSelectedButton" class="button" disabled title="Run Selected Tests">
                                <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                    <path d="M3.5 2.5v11l9-5.5z"/>
                                </svg>
                            </button>
                            <button id="runAllButton" class="button" title="Run All Tests">
                                <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                    <path d="M3.5 2v12l4.5-6L3.5 2zm4.5 0v12l4.5-6L8 2z"/>
                                </svg>
                            </button>
                            <button id="abortButton" class="abort-button" title="Abort Test Run">
                                <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm3.854 3.146L8 8.707l-3.854-3.561-.708.708L7.293 9.5l-3.855 3.854.708.708L8 10.207l3.854 3.855.708-.708L8.707 9.5l3.855-3.854-.708-.708z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <button id="refreshButton" class="icon-button refresh" title="Refresh Options">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z"/>
                        </svg>
                    </button>
                    <div id="refreshContextMenu" class="context-menu">
                        <div class="context-menu-item" id="refreshClasses">
                            <i class="codicon codicon-refresh"></i>
                            Refresh Classes
                        </div>
                        <div class="context-menu-item" id="refreshClassesAndMethodsBatch">
                            <i class="codicon codicon-server-process"></i>
                            Refresh Classes & Methods (Batch)
                        </div>
                        <div class="context-menu-item" id="refreshClassesAndMethodsSequential">
                            <i class="codicon codicon-list-ordered"></i>
                            Refresh Classes & Methods (Sequential)
                        </div>
                    </div>
                </div>
                <div id="loading" class="loading hidden">
                    <div class="spinner"></div>
                    <span id="loadingMessage">Loading test classes...</span>
                </div>
                <div id="notificationContainer" class="notification-container hidden">
                    <div class="notification-message" id="notificationMessage"></div>
                </div>
                <div id="errorContainer" class="error-container collapsed hidden">
                    <div class="error-header">
                        <span class="error-title">Error</span>
                        <span class="error-toggle codicon codicon-chevron-down"></span>
                    </div>
                    <div class="error-content" id="errorMessage"></div>
                </div>
                <div class="split-container">
                    <div id="testClassesContainer" class="test-classes-container">
                        <div id="noTestClasses" class="no-data"></div>
                        <div id="testClassesList"></div>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    const refreshButton = document.getElementById('refreshButton');
                    const runSelectedButton = document.getElementById('runSelectedButton');
                    const selectionCount = document.getElementById('selectionCount');
                    const loading = document.getElementById('loading');
                    const loadingMessage = document.getElementById('loadingMessage');
                    const errorContainer = document.getElementById('errorContainer');
                    const errorMessage = document.getElementById('errorMessage');
                    const notificationContainer = document.getElementById('notificationContainer');
                    const notificationMessage = document.getElementById('notificationMessage');
                    const testClassesList = document.getElementById('testClassesList');
                    const noTestClasses = document.getElementById('noTestClasses');
                    const runAllButton = document.getElementById('runAllButton');
                    const abortButton = document.getElementById('abortButton');
                    
                    // Track selected tests
                    const selectedTests = {
                        classes: {},
                        methods: {},
                        count: 0
                    };

                    // Load saved state if it exists
                    const savedState = vscode.getState();
                    if (savedState) {
                        Object.assign(selectedTests, savedState);
                        updateSelectionCount();
                    }

                    // Function to save state
                    function saveState() {
                        vscode.setState(selectedTests);
                    }
                    
                    // Event listeners
                    refreshButton.addEventListener('click', () => {
                        fetchTestClasses(true, false);
                    });
                    
                    runSelectedButton.addEventListener('click', () => {
                        runSelectedTests();
                    });

                    runAllButton.addEventListener('click', () => {
                        runAllTests();
                    });
                    
                    // Functions
                    function fetchTestClasses(forceRefresh = false, refreshMethods = false, refreshMode = 'batch') {
                        // Check if we already have content and forceRefresh is false
                        const testClassesList = document.getElementById('testClassesList');
                        const methodsLists = document.querySelectorAll('.test-methods-list');
                        
                        if (!forceRefresh && (
                            (testClassesList && testClassesList.children.length > 0) ||
                            (methodsLists && methodsLists.length > 0)
                        )) {
                            console.log('[VisbalExt.TestClassExplorerView] Skipping fetch - content already exists and forceRefresh is false');
                            return;
                        }

                        console.log('[VisbalExt.TestClassExplorerView] Fetching test classes...', { forceRefresh, refreshMethods, refreshMode });
                        showLoading('Loading test classes');
                        hideError();
                        hideNotification();
                        vscode.postMessage({ 
                            command: 'fetchTestClasses',
                            forceRefresh: forceRefresh,
                            refreshMethods: refreshMethods,
                            refreshMode: refreshMode
                        });
                    }
                    
                    function showLoading(m) {
                        loading.classList.remove('hidden');
						loadingMessage.innerHTML = m;
                    }
                    
                    function hideLoading() {
                        loading.classList.add('hidden');
						loadingMessage.innerHTML = '';
                    }
                    
                    function showError(message) {
                        const errorContainer = document.getElementById('errorContainer');
                        const errorContent = document.getElementById('errorMessage');
                        if (errorContent) {
                            errorContent.textContent = message;
                        }
                        if (errorContainer) {
                            errorContainer.classList.remove('hidden');
                            
                            // Add click handler for toggling
                            errorContainer.onclick = function() {
                                this.classList.toggle('collapsed');
                                const toggle = this.querySelector('.error-toggle');
                                if (toggle) {
                                    toggle.classList.toggle('codicon-chevron-down');
                                    toggle.classList.toggle('codicon-chevron-up');
                                }
                            };
                        }
                    }
                    
                    function hideError() {
                        errorContainer.classList.add('hidden');
                    }
                    
                    function showNotification(message) {
                        notificationMessage.textContent = message;
                        notificationContainer.classList.remove('hidden');
                    }
                    
                    function hideNotification() {
                        notificationContainer.classList.add('hidden');
                    }
                    
                    function updateSelectionCount() {
                        const count = selectedTests.count;
                        selectionCount.textContent = count + ' selected';
                        runSelectedButton.style.display = count > 0 ? 'inline-block' : 'none';
                        runSelectedButton.disabled = count === 0;
                    }
                    
                    function toggleClassSelection(className, checkbox) {
                        const isChecked = checkbox.checked;
                        
                        // Update the class selection state
                        if (isChecked) {
                            if (!selectedTests.classes[className]) {
                                selectedTests.classes[className] = true;
                                selectedTests.count++;
                            }

                            // Check all method checkboxes for this class
                            const methodCheckboxes = document.querySelectorAll('.method-checkbox[data-class="' + className + '"]');
                            methodCheckboxes.forEach(methodCheckbox => {
                                if (!methodCheckbox.checked) {
                                    methodCheckbox.checked = true;
                                    const methodName = methodCheckbox.dataset.method;
                                    const key = className + '.' + methodName;
                                    if (!selectedTests.methods[key]) {
                                        selectedTests.methods[key] = true;
                                        selectedTests.count++;
                                    }
                                }
                            });
                        } else {
                            if (selectedTests.classes[className]) {
                                delete selectedTests.classes[className];
                                selectedTests.count--;
                            }
                            
                            // Uncheck all method checkboxes for this class
                            const methodCheckboxes = document.querySelectorAll('.method-checkbox[data-class="' + className + '"]');
                            methodCheckboxes.forEach(methodCheckbox => {
                                if (methodCheckbox.checked) {
                                    methodCheckbox.checked = false;
                                    const methodName = methodCheckbox.dataset.method;
                                    const key = className + '.' + methodName;
                                    if (selectedTests.methods[key]) {
                                        delete selectedTests.methods[key];
                                        selectedTests.count--;
                                    }
                                }
                            });
                        }
                        
                        updateSelectionCount();
                        saveState(); // Save state after selection changes
                    }
                    
                    function toggleMethodSelection(className, methodName, checkbox) {
                        const isChecked = checkbox.checked;
                        const key = className + '.' + methodName;
                        
                        // Update the method selection state
                        if (isChecked) {
                            if (!selectedTests.methods[key]) {
                                selectedTests.methods[key] = true;
                                selectedTests.count++;
                            }
                        } else {
                            if (selectedTests.methods[key]) {
                                delete selectedTests.methods[key];
                                selectedTests.count--;
                            }
                            
                            // Also uncheck the class if it was checked
                            const classCheckbox = document.querySelector('.class-checkbox[data-class="' + className + '"]');
                            if (classCheckbox && classCheckbox.checked) {
                                classCheckbox.checked = false;
                                if (selectedTests.classes[className]) {
                                    delete selectedTests.classes[className];
                                    selectedTests.count--;
                                }
                            }
                        }
                        
                        updateSelectionCount();
                        saveState(); // Save state after selection changes
                    }
                    
                    async function runSelectedTests() {
                        const testsToRun = {
                            classes: Object.keys(selectedTests.classes),
                            methods: Object.entries(selectedTests.methods).map(([key]) => {
                                const [className, methodName] = key.split('.');
                                return { className, methodName };
                            }),
                            runMode: document.getElementById('runMode').value
                        };
                        
                        if (testsToRun.classes.length === 0 && testsToRun.methods.length === 0) {
                            showNotification('No tests selected to run.');
                            return;
                        }
                        
                        showLoading('Runing selected test ' + testsToRun.classes.length);
                        hideError();
                        hideNotification();
                        
                        vscode.postMessage({
                            command: 'runSelectedTests',
                            tests: testsToRun
                        });
                    }

                    async function runAllTests() {
                        // Show confirmation dialog
                        vscode.postMessage({
                            command: 'showConfirmation',
                            message: 'Are you sure you want to run all tests? This may take a while.',
                            action: 'runAllTests',
                            runMode: document.getElementById('runMode').value
                        });
                    }

                    function renderTestClasses(testClasses) {
                        console.log('[VisbalExt.TestClassExplorerView] Rendering test classes:', testClasses);
                        testClassesList.innerHTML = '';
                        
                        if (!testClasses || testClasses.length === 0) {
                            console.log('[VisbalExt.TestClassExplorerView] No test classes to render');
                            noTestClasses.classList.remove('hidden');
                            return;
                        }
                        
                        noTestClasses.classList.add('hidden');
                        
                        testClasses.forEach(function(testClass) {
                            console.log('[VisbalExt.TestClassExplorerView] Rendering test class:', testClass);
                            const li = document.createElement('li');
                            li.className = 'test-class-item';
                            li.dataset.className = testClass.name;
                            
                            // Add checkbox for class selection
                            const checkboxContainer = document.createElement('div');
                            checkboxContainer.className = 'checkbox-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'checkbox class-checkbox';
                            checkbox.dataset.class = testClass.name;
                            // Restore checkbox state from saved state
                            checkbox.checked = !!selectedTests.classes[testClass.name];
                            checkbox.addEventListener('change', function(e) {
                                e.stopPropagation();
                                toggleClassSelection(testClass.name, this);
                            });
                            
                            checkboxContainer.appendChild(checkbox);
                            
                            const expandIcon = document.createElement('i');
                            expandIcon.className = 'codicon codicon-chevron-right';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'test-class-name';
                            nameSpan.textContent = testClass.name || 'Unknown Class';
                            
                            // Create refresh button with refresh icon
                            const refreshClassButton = document.createElement('button');
                            refreshClassButton.className = 'icon-button refresh';
                            refreshClassButton.title = 'Refresh Test Methods';
                            refreshClassButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z"/></svg>';
                            refreshClassButton.onclick = function(e) {
                                e.stopPropagation();
                                refreshTestMethods(testClass.name);
                            };

                            // Create run button with play icon
                            const runButton = document.createElement('button');
                            runButton.className = 'icon-button run';
                            runButton.title = 'Run Test Class';
                            runButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/></svg>';
                            runButton.onclick = function(e) {
                                e.stopPropagation();
                                runTest(testClass.name);
                            };
                            
                            li.appendChild(checkboxContainer);
                            li.appendChild(expandIcon);
                            li.appendChild(nameSpan);
                            li.appendChild(refreshClassButton);
                            li.appendChild(runButton);
                            
                            // Create a container for test methods (initially hidden)
                            const methodsList = document.createElement('ul');
                            methodsList.className = 'test-methods-list hidden';
                            methodsList.dataset.loaded = 'false';

                            // Check if this class has any selected methods
                            const hasSelectedMethods = Object.keys(selectedTests.methods).some(key => 
                                key.startsWith(testClass.name + '.')
                            );
                            
                            // Toggle expand/collapse on click and load test methods if needed
                            li.onclick = function() {
                                if (methodsList.classList.contains('hidden')) {
                                    methodsList.classList.remove('hidden');
                                    expandIcon.className = 'codicon codicon-chevron-down';
                                    
                                    // Load test methods if not already loaded
                                    if (methodsList.dataset.loaded === 'false') {
                                        loadTestMethods(testClass.name, methodsList);
                                    }
                                } else {
                                    methodsList.classList.add('hidden');
                                    expandIcon.className = 'codicon codicon-chevron-right';
                                }
                            };
                            
                            testClassesList.appendChild(li);
                            testClassesList.appendChild(methodsList);

                            // If class has selected methods, automatically expand it
                            if (hasSelectedMethods) {
                                // Simulate a click to expand and load methods
                                li.click();
                            }
                        });
                    }
                    
                    function loadTestMethods(className, methodsListElement) {
                        console.log('[VisbalExt.TestClassExplorerView] Loading test methods for ' + className + '...');
                        
                        // Add loading indicator to the methods list
                        const loadingItem = document.createElement('li');
                        loadingItem.className = 'loading-item';
                        
                        const loadingSpinner = document.createElement('div');
                        loadingSpinner.className = 'spinner';
                        loadingSpinner.style.width = '12px';
                        loadingSpinner.style.height = '12px';
                        
                        const loadingText = document.createElement('span');
                        loadingText.textContent = ' Loading test methods...';
                        loadingText.style.marginLeft = '8px';
                        
                        loadingItem.appendChild(loadingSpinner);
                        loadingItem.appendChild(loadingText);
                        methodsListElement.appendChild(loadingItem);
                        
                        // Request test methods from the extension
                        vscode.postMessage({ 
                            command: 'fetchTestMethods',
                            className: className
                        });
                    }
                    
                    function renderTestMethods(className, testMethods) {
                        console.log('[VisbalExt.TestClassExplorerView] Rendering test methods for ' + className + ':', testMethods);
                        
                        // Find the methods list element for this class
                        const classItem = document.querySelector('.test-class-item[data-class-name="' + className + '"]');
                        if (!classItem) {
                            console.error('[VisbalExt.TestClassExplorerView] Could not find class item for ' + className);
                            return;
                        }
                        
                        const methodsList = classItem.nextElementSibling;
                        if (!methodsList || !methodsList.classList.contains('test-methods-list')) {
                            console.error('[VisbalExt.TestClassExplorerView] Could not find methods list for ' + className);
                            return;
                        }
                        
                        // Clear the methods list
                        methodsList.innerHTML = '';
                        
                        // Mark as loaded
                        methodsList.dataset.loaded = 'true';
                        
                        // Filter out @TestSetup methods
                        const filteredMethods = testMethods.filter(method => {
                            // Check if the method has annotations
                            if (method.annotations) {
                                // Exclude if it has @TestSetup annotation
                                return !method.annotations.some(a => 
                                    a.name.toLowerCase() === 'testsetup'
                                );
                            }
                            return true; // Include methods without annotations
                        });
                        
                        if (!filteredMethods || filteredMethods.length === 0) {
                            const noMethodsItem = document.createElement('li');
                            noMethodsItem.textContent = 'No test methods found in this class.';
                            noMethodsItem.style.fontStyle = 'italic';
                            noMethodsItem.style.padding = '5px';
                            methodsList.appendChild(noMethodsItem);
                            return;
                        }
                        
                        // Add each test method to the list
                        filteredMethods.forEach(function(method) {
                            const methodLi = document.createElement('li');
                            methodLi.className = 'test-method-item';
                            methodLi.dataset.class = className;
                            methodLi.dataset.method = method.name;
                            
                            // Add checkbox for method selection
                            const checkboxContainer = document.createElement('div');
                            checkboxContainer.className = 'checkbox-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'checkbox method-checkbox';
                            checkbox.dataset.class = className;
                            checkbox.dataset.method = method.name;
                            // Restore checkbox state from saved state
                            const key = className + '.' + method.name;
                            checkbox.checked = !!selectedTests.methods[key];
                            checkbox.addEventListener('change', function(e) {
                                e.stopPropagation();
                                toggleMethodSelection(className, method.name, this);
                            });
                            
                            checkboxContainer.appendChild(checkbox);
                                
                                const methodIcon = document.createElement('span');
                                methodIcon.className = 'icon test-status';
                                methodIcon.dataset.methodName = method.name;
                                methodIcon.dataset.className = className;
                                methodIcon.innerHTML = ''; // Remove the bullet point
                                
                                const methodNameSpan = document.createElement('span');
                                methodNameSpan.className = 'test-method-name';
                                methodNameSpan.textContent = method.name.trim();
                                
                                // Add double-click handler to open file
                                methodLi.addEventListener('dblclick', function(e) {
                                    e.stopPropagation();
                                    const testClassName = this.closest('.test-method-item').dataset.class;
                                    const testMethodName = this.closest('.test-method-item').dataset.method;
                                    if (testClassName && testMethodName) {
                                        vscode.postMessage({
                                            command: 'openTestFile',
                                            className: testClassName,
                                            methodName: testMethodName
                                        });
                                    }
                                });
                                
                            // Create run button with play icon
                                const runMethodButton = document.createElement('button');
                            runMethodButton.className = 'icon-button run';
                            runMethodButton.title = 'Run Test Method';
                            runMethodButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z"/></svg>';
                                runMethodButton.onclick = function(e) {
                                    e.stopPropagation();
                                runTest(className, method.name);
                                };
                                
                            methodLi.appendChild(checkboxContainer);
                                methodLi.appendChild(methodIcon);
                                methodLi.appendChild(methodNameSpan);
                                methodLi.appendChild(runMethodButton);
                                methodsList.appendChild(methodLi);
                        });
                        // Find the class item and its expand icon
                        //const classItem = document.querySelector('.test-class-item[data-class-name="' + className + '"]');
                        if (classItem) {
                            const expandIcon = classItem.querySelector('.codicon');
                            if (expandIcon) {
                                expandIcon.className = 'codicon codicon-chevron-down';
                            }
                        }
                        methodsList.classList.remove('hidden');
                    }
					
					
					function refreshTestMethods(testClass) {
                        console.log('[VisbalExt.TestClassExplorerView] -- refreshTestMethods -- Refreshing methods:', testClass);
                        showLoading('Refreshing methods on class ' + testClass  );
                        hideError();
                        hideNotification();

                        vscode.postMessage({ 
                            command: 'refreshTestMethods',
                            testClass
                        });
                    }
                    
                    function runTest(testClass, testMethod) {
                        console.log('[VisbalExt.TestClassExplorerView] -- runTest -- Running test:', testClass, testMethod);
                        showLoading('running test  ' + testClass + '. ' + testMethod );
                        hideError();
                        hideNotification();

                        // Update loading message to be more specific
                        loading.querySelector('span').textContent = 'Running ' + (testMethod ? 'method ' + testMethod : 'class ' + testClass) + '...';

                        // Update UI to show loading state
                        const selector = testMethod ? 
                            '.test-method-item[data-class="' + testClass + '"][data-method="' + testMethod + '"]' :
                            '.test-class-item[data-class-name="' + testClass + '"]';
                        
                        const testItem = document.querySelector(selector);
                        if (testItem) {
                            const runButton = testItem.querySelector('.run');
                            //const statusIcon = testItem.querySelector('.test-status');
                            
                            //if (runButton) {
                            //    runButton.style.display = 'none';
                            //}
                            
                            //if (statusIcon) {
                            //    statusIcon.innerHTML = '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/></svg>';
                            //}
                        }

                        vscode.postMessage({ 
                            command: 'runTest',
                            testClass,
                            testMethod
                        });
                    }
                    
                    function handleTestResults(results) {
                        if (!results || !results.summary) {
                            showError('Invalid test results received');
                            return;
                        }

                        // Update test status icons and cache logs
                        if (results.tests) {
                            results.tests.forEach(test => {
                                const [className, methodName] = test.fullName.split('.');
                                const statusIcon = document.querySelector('.test-status[data-class-name="' + className + '"][data-method-name="' + methodName + '"]');
                                const runButton = statusIcon?.parentElement?.querySelector('.run');
                                
                                if (statusIcon) {
                                    statusIcon.innerHTML = (test.outcome === 'Pass' || test.outcome === 'Passed') ? 
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.4 3.686L5.707 12.379 1.6 8.272l.707-.707 3.4 3.4 8-8 .693.721z"/></svg>' :
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.657 3.757L9.414 8l4.243 4.242-.707.707L8.707 8.707l-4.243 4.243-.707-.707L8 8 3.757 3.757l.707-.707L8.707 7.293l4.243-4.243z"/></svg>';
                                    
                                    statusIcon.className = 'icon test-status ' + ((test.outcome === 'Pass' || test.outcome === 'Passed') ? 'passed' : 'failed');

                                    // Add log ID to the status icon for later reference
                                    if (test.apexLogId) {
                                        statusIcon.dataset.logId = test.apexLogId;
                                        statusIcon.style.cursor = 'pointer';
                                        statusIcon.title = 'Click to view test log';
                                        
                                        // Add click handler to view log
                                        statusIcon.onclick = (e) => {
                                            e.stopPropagation();
                                            vscode.postMessage({
                                                command: 'viewTestLog',
                                                logId: test.apexLogId,
                                                testName: test.fullName
                                            });
                                        };
                                    }
                                }
                                
                                if (runButton) {
                                    runButton.style.display = 'inline-flex';
                                }
                            });
                        }
                        
                        // Create a results container
                        const resultsContainer = document.createElement('div');
                        resultsContainer.className = 'test-results-container';
                        resultsContainer.style.margin = '10px 0';
                        resultsContainer.style.padding = '10px';
                        resultsContainer.style.backgroundColor = 'var(--vscode-editor-background)';
                        resultsContainer.style.border = '1px solid var(--vscode-panel-border)';
                        
                        // Add summary
                        const summary = results.summary;
                        const summaryDiv = document.createElement('div');
                        summaryDiv.style.marginBottom = '10px';
                        
                        const summaryTitle = document.createElement('h3');
                        summaryTitle.textContent = 'Test Results';
                        summaryTitle.style.margin = '0 0 5px 0';
                        summaryTitle.style.fontSize = '1.1em';
                        
                        const outcomeSpan = document.createElement('span');
                        outcomeSpan.textContent = 'Outcome: ' + summary.outcome;
                        outcomeSpan.style.display = 'block';
                        outcomeSpan.style.fontWeight = 'bold';
                        outcomeSpan.style.color = summary.outcome === 'Passed' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                        
                        const statsSpan = document.createElement('span');
                        statsSpan.textContent = 'Tests: ' + summary.testsRan + ', Passed: ' + summary.passing + 
                                               ', Failed: ' + summary.failing + ', Skipped: ' + summary.skipped;
                        statsSpan.style.display = 'block';
                        
                        const timeSpan = document.createElement('span');
                        timeSpan.textContent = 'Time: ' + summary.testTotalTime + 's';
                        timeSpan.style.display = 'block';
                        
                        summaryDiv.appendChild(summaryTitle);
                        summaryDiv.appendChild(outcomeSpan);
                        summaryDiv.appendChild(statsSpan);
                        summaryDiv.appendChild(timeSpan);
                        
                        // Add test details with log links
                        const detailsDiv = document.createElement('div');
                        
                        if (results.tests && results.tests.length > 0) {
                            const testsList = document.createElement('ul');
                            testsList.style.listStyleType = 'none';
                            testsList.style.padding = '0';
                            testsList.style.margin = '0';
                            
                            results.tests.forEach(function(test) {
                                const testItem = document.createElement('li');
                                testItem.style.padding = '5px 0';
                                testItem.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                
                                const testName = document.createElement('div');
                                testName.textContent = test.fullName;
                                testName.style.fontWeight = 'bold';
                                
                                const testOutcome = document.createElement('div');
                                testOutcome.textContent = 'Outcome: ' + test.outcome;
                                testOutcome.style.color = (test.outcome === 'Pass' || test.outcome === 'Passed') ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                                
                                const testTime = document.createElement('div');
                                testTime.textContent = 'Runtime: ' + test.runTime + 's';
                                
                                testItem.appendChild(testName);
                                testItem.appendChild(testOutcome);
                                testItem.appendChild(testTime);
                                
                                // Add log link if available
                                if (test.apexLogId) {
                                    const logLink = document.createElement('a');
                                    logLink.href = '#';
                                    logLink.textContent = 'View Log';
                                    logLink.style.marginLeft = '10px';
                                    logLink.style.color = 'var(--vscode-textLink-foreground)';
                                    logLink.onclick = (e) => {
                                        e.preventDefault();
                                        vscode.postMessage({
                                            command: 'viewTestLog',
                                            logId: test.apexLogId,
                                            testName: test.fullName
                                        });
                                    };
                                    testTime.appendChild(logLink);
                                }
                                
                                // Add error message if any
                                if (test.message) {
                                    const errorMessage = document.createElement('div');
                                    errorMessage.textContent = 'Error: ' + test.message;
                                    errorMessage.style.color = 'var(--vscode-testing-iconFailed)';
                                    errorMessage.style.marginTop = '5px';
                                    testItem.appendChild(errorMessage);
                                }
                                
                                // Add stack trace if any
                                if (test.stackTrace) {
                                    const stackTrace = document.createElement('pre');
                                    stackTrace.textContent = test.stackTrace;
                                    stackTrace.style.fontSize = '0.9em';
                                    stackTrace.style.overflow = 'auto';
                                    stackTrace.style.backgroundColor = 'var(--vscode-editor-background)';
                                    stackTrace.style.padding = '5px';
                                    stackTrace.style.marginTop = '5px';
                                    testItem.appendChild(stackTrace);
                                }
                                
                                testsList.appendChild(testItem);
                            });
                            
                            detailsDiv.appendChild(testsList);
                        } else {
                            const noTests = document.createElement('div');
                            noTests.textContent = 'No test details available';
                            noTests.style.fontStyle = 'italic';
                            detailsDiv.appendChild(noTests);
                        }
                        
                        // Add close button
                        const closeButton = document.createElement('button');
                        closeButton.textContent = 'Close Results';
                        closeButton.className = 'button';
                        closeButton.style.marginTop = '10px';
                        closeButton.onclick = function() {
                            resultsContainer.remove();
                        };
                        
                        // Assemble the results container
                        resultsContainer.appendChild(summaryDiv);
                        resultsContainer.appendChild(detailsDiv);
                        resultsContainer.appendChild(closeButton);
                        
                        // Add to the DOM
                        const container = document.querySelector('.container');
                        container.insertBefore(resultsContainer, testClassesContainer);
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        console.log('[VisbalExt.TestClassExplorerView] Received message from extension:', message);
                        
                        switch (message.command) {
                            case 'testClassesLoaded':
                                hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test classes loaded:', message.testClasses);
                                renderTestClasses(message.testClasses);
                                break;
                            case 'testMethodsLoaded':
								hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test methods loaded:', message.testMethods);
                                renderTestMethods(message.className, message.testMethods);
                                break;
                            case 'testResultsLoaded':
                                hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test results loaded:', message.results);
                                handleTestResults(message.results);
                                break;
                            case 'confirmationResult':
                                if (message.confirmed) {
                                    if (message.action === 'runAllTests') {
                                        showLoading('Running all tests...');
                                        hideError();
                                        hideNotification();
                                        
                                        vscode.postMessage({    
                                            command: 'runAllTests',
                                            runMode: message.runMode
                                        });
                                    }
                                }
                                break;
                            case 'error':
                                hideLoading();
                                console.error('[VisbalExt.TestClassExplorerView] Error:', message.message);
                                showError(message.message);
                                break;
                            case 'showNotification':
                                console.log('[VisbalExt.TestClassExplorerView] Notification:', message.message);
                                showNotification(message.message);
                                break;
                            case 'testRunStarted':
                                document.getElementById('testResults').innerHTML = \`
                                    <div class="running-tests">
                                        <div class="spinner"></div>
                                        <span>Running methods...</span>
                                    </div>
                                \`;
                                abortButton.style.display = 'inline-block';
                                runSelectedButton.disabled = true;
                                runAllButton.disabled = true;
                                break;
                            case 'openTestFile':
                                this._openTestFile(message.className, message.methodName);
                                break;
                            case 'testRunFinished':
                            case 'testRunAborted':
                                abortButton.style.display = 'none';
                                runSelectedButton.disabled = false;
                                runAllButton.disabled = false;
                                break;
                        }
                    });
                    
                    // Initial fetch without force refresh
                    fetchTestClasses(false);

                    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

                    // Add event listener for select all checkbox
                    selectAllCheckbox.addEventListener('change', () => {
                        const isChecked = selectAllCheckbox.checked;
                        
                        // Get all class and method checkboxes
                        const classCheckboxes = document.querySelectorAll('.class-checkbox');
                        const methodCheckboxes = document.querySelectorAll('.method-checkbox');
                        
                        // Reset selection state
                        selectedTests.classes = {};
                        selectedTests.methods = {};
                        selectedTests.count = 0;
                        
                        // Update all class checkboxes
                        classCheckboxes.forEach(checkbox => {
                            checkbox.checked = isChecked;
                            if (isChecked) {
                                const className = checkbox.dataset.class;
                                if (className) {
                                    selectedTests.classes[className] = true;
                                    selectedTests.count++;
                                }
                            }
                        });
                        
                        // Update all method checkboxes
                        methodCheckboxes.forEach(checkbox => {
                            checkbox.checked = isChecked;
                            if (isChecked) {
                                const className = checkbox.dataset.class;
                                const methodName = checkbox.dataset.method;
                                if (className && methodName) {
                                    const key = className + '.' + methodName;
                                    selectedTests.methods[key] = true;
                                    selectedTests.count++;
                                }
                            }
                        });
                        
                        updateSelectionCount();
                        saveState(); // Save state after bulk selection change
                    });

                    // Update select all checkbox state when individual selections change
                    function updateSelectAllCheckbox() {
                        const classCheckboxes = Array.from(document.querySelectorAll('.class-checkbox'));
                        const methodCheckboxes = Array.from(document.querySelectorAll('.method-checkbox'));
                        const allCheckboxes = [...classCheckboxes, ...methodCheckboxes];
                        
                        if (allCheckboxes.length === 0) {
                            selectAllCheckbox.checked = false;
                            selectAllCheckbox.indeterminate = false;
                            return;
                        }
                        
                        const allChecked = allCheckboxes.every(cb => cb.checked);
                        const someChecked = allCheckboxes.some(cb => cb.checked);
                        
                        selectAllCheckbox.checked = allChecked;
                        selectAllCheckbox.indeterminate = someChecked && !allChecked;

                        // Save state after updating select all checkbox
                        saveState();
                    }

                    // Update the existing toggle functions to call updateSelectAllCheckbox
                    const originalToggleClassSelection = toggleClassSelection;
                    toggleClassSelection = function(className, checkbox) {
                        originalToggleClassSelection(className, checkbox);
                        updateSelectAllCheckbox();
                        saveState(); // Save state after selection change
                    };

                    const originalToggleMethodSelection = toggleMethodSelection;
                    toggleMethodSelection = function(className, methodName, checkbox) {
                        originalToggleMethodSelection(className, methodName, checkbox);
                        updateSelectAllCheckbox();
                        saveState(); // Save state after selection change
                    };

                    // Add context menu handling
                    const refreshContextMenu = document.getElementById('refreshContextMenu');
                    const refreshClasses = document.getElementById('refreshClasses');
                    const refreshClassesAndMethodsBatch = document.getElementById('refreshClassesAndMethodsBatch');
                    const refreshClassesAndMethodsSequential = document.getElementById('refreshClassesAndMethodsSequential');

                    // Show context menu on refresh button click
                    refreshButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const buttonRect = refreshButton.getBoundingClientRect();
                        refreshContextMenu.style.top = buttonRect.bottom + 'px';
                        refreshContextMenu.style.right = (window.innerWidth - buttonRect.right) + 'px';
                        refreshContextMenu.classList.add('show');
                    });

                    // Hide context menu when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!refreshContextMenu.contains(e.target)) {
                            refreshContextMenu.classList.remove('show');
                        }
                    });

                    // Handle menu item clicks
                    refreshClasses.addEventListener('click', () => {
                        fetchTestClasses(true, false);
                        refreshContextMenu.classList.remove('show');
                    });

                    refreshClassesAndMethodsBatch.addEventListener('click', () => {
                        fetchTestClasses(true, true, 'batch');
                        refreshContextMenu.classList.remove('show');
                    });

                    refreshClassesAndMethodsSequential.addEventListener('click', () => {
                        fetchTestClasses(true, true, 'sequential');
                        refreshContextMenu.classList.remove('show');
                    });

                    // Add abort button click handler
                    abortButton.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'abortTests'
                        });
                    });

                    // Handle test run state messages
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            // ... existing cases ...
                            case 'testRunStarted':
                                abortButton.style.display = 'inline-block';
                                runSelectedButton.disabled = true;
                                runAllButton.disabled = true;
                                break;
                            case 'testRunFinished':
                            case 'testRunAborted':
                                abortButton.style.display = 'none';
                                runSelectedButton.disabled = false;
                                runAllButton.disabled = false;
                                break;
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private async _viewTestLog(logId: string, testName: string) {
        try {
            console.log('[VisbalExt.TestClassExplorerView] -- _viewTestLog -- Viewing test log:', { logId, testName });
            const logContent = await this._metadataService.getTestLog(logId);
            console.log('[VisbalExt.TestClassExplorerView] -- _viewTestLog --   Log content retrieved:', !!logContent);
            
            if (logContent) {
                // Create a temporary file with the log content
                const tmpPath = join(vscode.workspace.rootPath || '', '.sf', 'logs', `${testName}-${new Date().getTime()}.log`);
                console.log('[VisbalExt.TestClassExplorerView] -- _viewTestLog --   Creating log file at:', tmpPath);
                
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), logContent);
                });
                console.log('[VisbalExt.TestClassExplorerView] -- _viewTestLog --   Log file created and opened');
            }
        } catch (error) {
            console.error('[VisbalExt.TestClassExplorerView] -- _viewTestLog --   Error viewing test log:', {
                testName,
                logId,
                error: error
            });
            vscode.window.showWarningMessage(`[VisbalExt.TestClassExplorerView] -- _viewTestLog --   Could not view log for test ${testName}: ${(error as Error).message}`);
        }
    }

    // Add public methods for running tests
    public runTest(testClass: string, testMethod?: string) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'runTest',
                testClass,
                testMethod
            });
        }
    }

    public runSelectedTests(tests: { classes: string[], methods: { className: string, methodName: string }[], runMode: 'sequential' | 'parallel' }) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'runSelectedTests',
                tests
            });
        }
    }

    public runAllTests(runMode: 'sequential' | 'parallel') {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'runAllTests',
                runMode
            });
        }
    }

    public async rerunSelectedTests() {
        console.log('[VisbalExt.TestClassExplorerView] rerunSelectedTests -- Re-running selected tests');
        if (this._view) {
            // Request the webview to run its currently selected tests
            // The webview maintains the selection state and will use it when receiving this command
            this._view.webview.postMessage({
                command: 'runSelectedTests',
                tests: {
                    runMode: 'sequential'  // Default to sequential mode
                }
            });
        }
    }
    

    // Add handler for opening test files (add near the top of the class where other methods are defined)
    private async _openTestFile(className: string, methodName: string) {
        try {
            if (!vscode.workspace.workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            // Construct the file path
            const filePath = vscode.Uri.joinPath(
                vscode.workspace.workspaceFolders[0].uri,
                'force-app',
                'main',
                'default',
                'classes',
                `${className}.cls`
            );
            
            // Open the document
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            // Search for the method in the file
            const text = document.getText();
            const methodRegex = new RegExp(`\\s*(public|private|protected|global)?\\s*(static)?\\s*\\bvoid\\b\\s*${methodName}\\s*\\(`);
            const match = methodRegex.exec(text);
            
            if (match) {
                // Find the position of the method
                const position = document.positionAt(match.index);
                
                // Reveal the method in the editor
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                
                // Set the cursor at the method
                editor.selection = new vscode.Selection(position, position);
            }
        } catch (error: any) {
            console.error('[VisbalExt.TestClassExplorerView] Error opening test file:', error);
            vscode.window.showErrorMessage(`Error opening test file: ${error.message}`);
        }
    }

    public abortTests() {
        if (this._abortController) {
            this._abortController.abort();
        }
    }
}
