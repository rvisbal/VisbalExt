import * as vscode from 'vscode';
import { StatusBarService } from '../services/statusBarService';
import { MetadataService, TestMethod } from '../services/metadataService';
import { StorageService } from '../services/storageService';
import { TestClass } from '../types/testClass';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { VisbalLogView } from './visbalLogView';
import { TestRunResultsView } from './testRunResultsView';
import { TestResultsView } from './testResultsView';

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

export class TestClassExplorerView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testClassExplorerView';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _statusBarService: StatusBarService;
    private _metadataService: MetadataService;
    private _storageService: StorageService;
    private _testController: vscode.TestController;
    private _testItems: Map<string, vscode.TestItem>;
    private _visbalLogView: VisbalLogView;
    private _testRunResultsView: TestRunResultsView;
    private _testResultsView: TestResultsView;

    constructor(
        extensionUri: vscode.Uri,
        statusBarService: StatusBarService,
        private readonly _context: vscode.ExtensionContext,
        testRunResultsView: TestRunResultsView,
        testResultsView: TestResultsView
    ) {
        this._extensionUri = extensionUri;
        this._statusBarService = statusBarService;
        this._metadataService = new MetadataService();
        this._storageService = new StorageService(_context);
        this._testController = vscode.tests.createTestController('testClassExplorerView', 'Test Class Explorer');
        this._testItems = new Map();
        this._visbalLogView = new VisbalLogView(this._context);
        this._testRunResultsView = testRunResultsView;
        this._testResultsView = testResultsView;
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
            console.log('[VisbalExt.TestClassExplorerView] webview -- Received message from webview:', data);
            switch (data.command) {
                case 'fetchTestClasses':
                    await this._fetchTestClasses(data.forceRefresh);
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
                case 'viewTestLog':
                    await this._viewTestLog(data.logId, data.testName);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(data.message);
                    break;
            }
        });

        // Initial fetch of test classes when view becomes visible
        setTimeout(() => {
            console.log('[VisbalExt.TestClassExplorerView] Initial fetch of test classes');
            if (this._view && this._view.visible) {
                // Use cached data if available
                this._fetchTestClasses(false);
            }
        }, 1000);
    }

    private async _fetchTestClasses(forceRefresh: boolean = false) {
        try {
            this._statusBarService.showMessage('$(sync~spin) Fetching test classes...');
            
            let testClasses: TestClass[];
            
            if (!forceRefresh) {
                // Try to get from storage first
                testClasses = this._storageService.getTestClasses();
                if (testClasses.length > 0) {
                    console.log('[VisbalExt.TestClassExplorerView] Using stored test classes');
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
            console.log('[VisbalExt.TestClassExplorerView] [FETCH] Received test classes:', apexClasses?.length || 0, 'classes');
            
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
            this._storageService.saveTestClasses(testClasses);
            console.log('[VisbalExt.TestClassExplorerView] Test classes cached');

            // Add test classes to VSCode Test Explorer
            if (testClasses) {
                console.log('[VisbalExt.TestClassExplorerView] Adding test classes to Test Explorer');
                for (const testClass of testClasses) {
                    await this._addTestToExplorer(testClass);
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
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Adding test class:', testClass.name);
        
        // Create test item for the class
        const classItem = this._testController.createTestItem(
            testClass.id,
            testClass.name,
            vscode.Uri.file(testClass.attributes.fileName)
        );
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Created class test item:', classItem.label);

        // Add test methods
        if (testClass.methods && testClass.methods.length > 0) {
            console.log(`[VisbalExt.TestClassExplorerView] Adding ${testClass.methods.length} methods for class ${testClass.name}`);
            
            for (const method of testClass.methods) {
                const methodItem = this._testController.createTestItem(
                    `${testClass.id}.${method}`,
                    method,
                    vscode.Uri.file(testClass.attributes.fileName)
                );
                console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Created method test item:', methodItem.label);
                
                classItem.children.add(methodItem);
            }
        } else {
            console.log(`[VisbalExt.TestClassExplorerView] No methods found for class ${testClass.name}`);
        }

        // Add to test controller
        this._testController.items.add(classItem);
        this._testItems.set(testClass.name, classItem);
        console.log('[VisbalExt.TestClassExplorerView] [EXPLORER] Test items updated in controller');
    }

    private async _fetchTestMethods(className: string) {
        try {
            this._statusBarService.showMessage(`$(sync~spin) Fetching test methods for ${className}...`);
            
            // Try to get from storage first
            let testMethods = this._storageService.getTestMethodsForClass(className);
            
            if (testMethods.length === 0) {
                // If not in storage, fetch from Salesforce
                testMethods = await this._metadataService.getTestMethodsForClass(className);
                // Save to storage
                this._storageService.saveTestMethodsForClass(className, testMethods);
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
            const result = await this._metadataService.runTests(testClass, testMethod);
            console.log('[VisbalExt.TestClassExplorerView] _runTest -- Test execution completed. Result:', result);

            if (result && result.testRunId) {
                console.log('[VisbalExt.TestClassExplorerView] _runTestFetching test run details for:', result.testRunId);
                const testRunResult = await this._metadataService.getTestRunResult(result.testRunId);
                console.log('[VisbalExt.TestClassExplorerView] _runTest -- testRunResult:', testRunResult);
                console.log('[VisbalExt.TestClassExplorerView] _runTest -- testRunResult.summary:', testRunResult.summary);

                // Use the shared test results view instance
                if (testRunResult?.summary) {
                    console.log('[VisbalExt.TestClassExplorerView] Updating test results view with summary:', testRunResult.summary);
                    this._testResultsView.updateSummary(testRunResult.summary);
                } else {
                    console.warn('[VisbalExt.TestClassExplorerView] No summary data available in test run result');
                }

                // Update test results in webview
                if (this._view) {
                    console.log('[VisbalExt.TestClassExplorerView] Sending test results to webview');
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
                            console.log(`[VisbalExt.TestClassExplorer] Processing log for test: ${t.ApexClass?.Name || 'Unknown'}`);
                            
                            // Download and open log for the first test only to avoid multiple windows
                            if (mainClassMap.size === 0) {
                                console.log(`[VisbalExt.TestClassExplorer] Downloading and opening log: ${logId}`);
                                await this._visbalLogView.downloadLog(logId);
                                await this._visbalLogView.openLog(logId);
                            } else {
                                // For subsequent tests, just download in background
                                console.log(`[VisbalExt.TestClassExplorer] Downloading additional log: ${logId}`);
                                this._visbalLogView.downloadLog(logId);
                            }
                        } else {
                            console.warn(`[VisbalExt.TestClassExplorer] No log ID found for test: ${t.ApexClass?.Name || 'Unknown'}`);
                        }
                        
                        //UPDATE THE STATUS OF THE METHOD
                        if (!mainClassMap.has(t.ApexClass.Name)) {
                            mainClassMap.set(t.ApexClass.Name, true);
                        }
                        console.log('[VisbalExt.TestClassExplorerView] _runTest -- Test:', t);
                        if (t.Outcome === 'Pass') {
                            this._testRunResultsView.updateMethodStatus(testClass, t.MethodName, 'success');
                        }
                        else {
                            this._testRunResultsView.updateMethodStatus(testClass, t.methodName, 'failed');
                            mainClassMap.set(t.ApexClass.Name, false);
                        }
                    } catch (error) {
                        console.error(`[VisbalExt.TestClassExplorer] Error processing test log: ${error}`);
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
    
    private async _runSelectedTests(tests: { classes: string[], methods: { className: string, methodName: string }[] }) {
        try {
            const totalCount = tests.classes.length + tests.methods.length;
            
            // Show running state in the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testRunStarted'
                });
            }

            this._statusBarService.showMessage(`$(beaker~spin) Running ${totalCount} selected tests...`);
            
            // Check if Salesforce Extension Pack is installed
            const sfExtension = vscode.extensions.getExtension('salesforce.salesforcedx-vscode-core');
            
            if (!sfExtension) {
                throw new Error('Salesforce Extension Pack is required to run tests. Please install it from the VS Code marketplace.');
            }
            
            const results = [];
            console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- tests:', tests);
            console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- tests.classes:', tests.classes);
            console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- tests.methods:', tests.methods);
            

            // Run class tests
            for (const className of tests.classes) {
                try {
                    console.log(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- Running test class: ${className}`, className);
                    const result = await this._metadataService.runTests(className);
                    if (result) {
                        results.push(result);
                    }
                } catch (error: any) {
                    console.error(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- Error running test class ${className}:`, error);
                }
            }


            //add the tests to the Running task
            const classesWithMethods = new Map<string, string[]>();
            for (const { className, methodName } of tests.methods) {
                try {
                    if (!classesWithMethods.has(className)) {
                        classesWithMethods.set(className, []);
                    }
                    classesWithMethods.get(className)?.push(methodName);
                } catch (error: any) {
                    console.error(`[VisbalExt.TestClassExplorerView] _runSelectedTests -- Error running test class ${className}:`, error);
                }
            }

            for (const [className, methodNames] of classesWithMethods.entries()) {
                this._testRunResultsView.addTestRun(className, methodNames);
            }
            
            // Run method tests
            for (const { className, methodName } of tests.methods) {
                try {
                    this._testRunResultsView.updateMethodStatus(className, methodName, 'running');
                    console.log(`[VisbalExt.VisbalExt.TestClassExplorerView] _runSelectedTests -- Running test method: ${className}.${methodName}`);
                    
                    // Create an async function to handle test execution and log downloading in parallel
                    const handleTestAndLog = async () => {
                        const result = await this._metadataService.runTests(className, methodName);
                        if (result && result.testRunId) {
                            const [testRunResult, logId] = await Promise.all([
                                this._metadataService.getTestRunResult(result.testRunId),
                                this._metadataService.getTestLogId(result.testRunId)
                            ]);

                            const mainClassMap = new Map<string, Boolean>();
                            for (const t of testRunResult.tests) {
                                try {
                                    if (logId) {
                                        console.log(`[VisbalExt.TestClassExplorer] Processing log for test: ${t.ApexClass?.Name || 'Unknown'}`);
                                        this._testRunResultsView.updateMethodStatus(className, t.MethodName, 'downloading');
                                        
                                        // Download log in background
                                        this._visbalLogView.downloadLog(logId).catch(error => {
                                            console.error(`[VisbalExt.TestClassExplorer] Error downloading log: ${error}`);
                                        });
                                    }

                                    if (!mainClassMap.has(t.ApexClass.Name)) {
                                        mainClassMap.set(t.ApexClass.Name, true);
                                    }

                                    if (t.Outcome === 'Pass') {
                                        this._testRunResultsView.updateMethodStatus(className, t.MethodName, 'success');
                                    } else {
                                        this._testRunResultsView.updateMethodStatus(className, t.methodName, 'failed');
                                        mainClassMap.set(t.ApexClass.Name, false);
                                    }
                                } catch (error) {
                                    console.error(`[VisbalExt.TestClassExplorer] Error processing test result: ${error}`);
                                    this._testRunResultsView.updateMethodStatus(className, t.MethodName, 'failed');
                                }
                            }

                            // Update class status after all methods are processed
                            for (const [className, isSuccess] of mainClassMap.entries()) {
                                this._testRunResultsView.updateClassStatus(
                                    className, 
                                    isSuccess ? 'success' : 'failed'
                                );
                            }
                        }
                    };

                    // Execute the async function without waiting
                    handleTestAndLog().catch(error => {
                        console.error(`[VisbalExt.TestClassExplorer] Error in test execution: ${error}`);
                        this._testRunResultsView.updateMethodStatus(className, methodName, 'failed');
                    });

                } catch (error) {
                    console.error(`[VisbalExt.TestClassExplorer] Error running test method ${className}.${methodName}: ${error}`);
                    this._testRunResultsView.updateMethodStatus(className, methodName, 'failed');
                }
            }
            
            console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- results:', results);
            // Combine results
            const combinedResult = this._combineTestResults(results);

            console.log('[VisbalExt.TestClassExplorerView] _runSelectedTests -- combinedResult:', combinedResult);
            
            // Send the combined results to the webview
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testResultsLoaded',
                    results: combinedResult
                });
            }
            
            this._statusBarService.hide();
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
    
    private _combineTestResults(results: any[]): any {
        if (!results || results.length === 0) {
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
        
        // If only one result, return it directly
        if (results.length === 1) {
            return results[0];
        }
        
        // Combine multiple results
        const combinedTests = [];
        let totalTests = 0;
        let totalPassing = 0;
        let totalFailing = 0;
        let totalSkipped = 0;
        let totalTime = 0;
        
        for (const result of results) {
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
                }

                .test-method-item {
                    padding: 2px 5px 2px 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    width: 100%;
                }

                .test-method-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }

                .test-method-name {
                    margin-left: 5px;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
                        <button id="runSelectedButton" class="button" disabled>Run Selected</button>
                    </div>
                    <button id="refreshButton" class="icon-button refresh" title="Refresh Test Classes">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z"/>
                        </svg>
                    </button>
                </div>
                <div id="loading" class="loading hidden">
                    <div class="spinner"></div>
                    <span>Loading test classes...</span>
                </div>
                <div id="notificationContainer" class="notification-container hidden">
                    <div class="notification-message" id="notificationMessage"></div>
                </div>
                <div id="errorContainer" class="error-container hidden">
                    <div class="error-message" id="errorMessage"></div>
                </div>
                <div class="split-container">
                    <div id="testClassesContainer" class="test-classes-container">
                        <div id="noTestClasses" class="no-data">
                            No test classes found. Click the refresh button to fetch test classes.
                        </div>
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
                    const errorContainer = document.getElementById('errorContainer');
                    const errorMessage = document.getElementById('errorMessage');
                    const notificationContainer = document.getElementById('notificationContainer');
                    const notificationMessage = document.getElementById('notificationMessage');
                    const testClassesList = document.getElementById('testClassesList');
                    const noTestClasses = document.getElementById('noTestClasses');
                    
                    // Track selected tests
                    const selectedTests = {
                        classes: {},
                        methods: {},
                        count: 0
                    };
                    
                    // Event listeners
                    refreshButton.addEventListener('click', () => {
                        fetchTestClasses(true);
                    });
                    
                    runSelectedButton.addEventListener('click', () => {
                        runSelectedTests();
                    });
                    
                    // Functions
                    function fetchTestClasses(forceRefresh = false) {
                        console.log('[VisbalExt.TestClassExplorerView] Fetching test classes...');
                        showLoading();
                        hideError();
                        hideNotification();
                        vscode.postMessage({ 
                            command: 'fetchTestClasses',
                            forceRefresh: forceRefresh 
                        });
                    }
                    
                    function showLoading() {
                        loading.classList.remove('hidden');
                    }
                    
                    function hideLoading() {
                        loading.classList.add('hidden');
                    }
                    
                    function showError(message) {
                        errorMessage.textContent = message;
                        errorContainer.classList.remove('hidden');
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
                    }
                    
                    function runSelectedTests() {
                        const testsToRun = {
                            classes: Object.keys(selectedTests.classes),
                            methods: Object.entries(selectedTests.methods).map(([key]) => {
                                const [className, methodName] = key.split('.');
                                return { className, methodName };
                            })
                        };
                        
                        if (testsToRun.classes.length === 0 && testsToRun.methods.length === 0) {
                            showNotification('No tests selected to run.');
                            return;
                        }
                        
                        showLoading();
                        hideError();
                        hideNotification();
                        
                        vscode.postMessage({
                            command: 'runSelectedTests',
                            tests: testsToRun
                        });
                    }
                    
                    function renderTestClasses(testClasses) {
                        console.log('[VisbalExt.TestClassExplorerView] Rendering test classes:', testClasses);
                        testClassesList.innerHTML = '';
                        
                        // Reset selection state
                        selectedTests.classes = {};
                        selectedTests.methods = {};
                        selectedTests.count = 0;
                        updateSelectionCount();
                        
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
                            li.appendChild(runButton);
                            
                            // Create a container for test methods (initially hidden)
                            const methodsList = document.createElement('ul');
                            methodsList.className = 'test-methods-list hidden';
                            methodsList.dataset.loaded = 'false';
                            
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
                            
                            // Add checkbox for method selection
                            const checkboxContainer = document.createElement('div');
                            checkboxContainer.className = 'checkbox-container';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'checkbox method-checkbox';
                            checkbox.dataset.class = className;
                            checkbox.dataset.method = method.name;
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
                    }
                    
                    function runTest(testClass, testMethod) {
                        console.log('[VisbalExt.TestClassExplorerView] -- runTest -- Running test:', testClass, testMethod);
                        showLoading();
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
                            const statusIcon = testItem.querySelector('.test-status');
                            
                            if (runButton) {
                                runButton.style.display = 'none';
                            }
                            
                            if (statusIcon) {
                                statusIcon.innerHTML = '<svg class="test-status running" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.5 8c0 3.584-2.916 6.5-6.5 6.5S1.5 11.584 1.5 8 4.416 1.5 8 1.5 14.5 4.416 14.5 8zM8 2.5A5.5 5.5 0 1 0 13.5 8 5.506 5.506 0 0 0 8 2.5z"/></svg>';
                            }
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
                                    statusIcon.innerHTML = test.outcome === 'Pass' ? 
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14.4 3.686L5.707 12.379 1.6 8.272l.707-.707 3.4 3.4 8-8 .693.721z"/></svg>' :
                                        '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.657 3.757L9.414 8l4.243 4.242-.707.707L8.707 8.707l-4.243 4.243-.707-.707L8 8 3.757 3.757l.707-.707L8.707 7.293l4.243-4.243z"/></svg>';
                                    
                                    statusIcon.className = 'icon test-status ' + (test.outcome === 'Pass' ? 'passed' : 'failed');

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
                                testOutcome.style.color = test.outcome === 'Pass' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                                
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
                                console.log('[VisbalExt.TestClassExplorerView] Test methods loaded:', message.testMethods);
                                renderTestMethods(message.className, message.testMethods);
                                break;
                            case 'testResultsLoaded':
                                hideLoading();
                                console.log('[VisbalExt.TestClassExplorerView] Test results loaded:', message.results);
                                handleTestResults(message.results);
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
                                selectedTests.classes[className] = true;
                                selectedTests.count++;
                            }
                        });
                        
                        // Update all method checkboxes
                        methodCheckboxes.forEach(checkbox => {
                            checkbox.checked = isChecked;
                            if (isChecked) {
                                const className = checkbox.dataset.class;
                                const methodName = checkbox.dataset.method;
                                const key = className + '.' + methodName;
                                selectedTests.methods[key] = true;
                                selectedTests.count++;
                            }
                        });
                        
                        updateSelectionCount();
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
                    }

                    // Update the existing toggle functions to call updateSelectAllCheckbox
                    const originalToggleClassSelection = toggleClassSelection;
                    toggleClassSelection = function(className, checkbox) {
                        originalToggleClassSelection(className, checkbox);
                        updateSelectAllCheckbox();
                    };

                    const originalToggleMethodSelection = toggleMethodSelection;
                    toggleMethodSelection = function(className, methodName, checkbox) {
                        originalToggleMethodSelection(className, methodName, checkbox);
                        updateSelectAllCheckbox();
                    };
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
            console.log('[VisbalExt.TestClassExplorerView] Viewing test log:', { logId, testName });
            const logContent = await this._metadataService.getTestLog(logId);
            console.log('[VisbalExt.TestClassExplorerView] Log content retrieved:', !!logContent);
            
            if (logContent) {
                // Create a temporary file with the log content
                const tmpPath = join(vscode.workspace.rootPath || '', '.sf', 'logs', `${testName}-${new Date().getTime()}.log`);
                console.log('[VisbalExt.TestClassExplorerView] Creating log file at:', tmpPath);
                
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
                const editor = await vscode.window.showTextDocument(document);
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), logContent);
                });
                console.log('[VisbalExt.TestClassExplorerView] Log file created and opened');
            }
        } catch (error) {
            console.error('[VisbalExt.TestClassExplorerView] Error viewing test log:', {
                testName,
                logId,
                error: error
            });
            vscode.window.showWarningMessage(`[VisbalExt.TestClassExplorerView] Could not view log for test ${testName}: ${(error as Error).message}`);
        }
    }
}
