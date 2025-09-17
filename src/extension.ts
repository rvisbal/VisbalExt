import * as vscode from 'vscode';
import { FindModel } from './findModal';
import { SearchLibrary } from './searchLibrary';
import { VisbalLogView } from './views/apexLogTab';
import { LogDetailView } from './views/logDetailView';
import { TestClassExplorerView } from './views/testClassExplorerSidePanel';
import { salesforceApi } from './services/salesforceApiService';
import { statusBarService } from './services/statusBarService';
import { SoqlTab } from './views/soqlTab';
import { MetadataService } from './services/metadataService';
import { SfdxService } from './services/sfdxService';
import { OrgUtils } from './utils/orgUtils';
import { ViewId } from './types/salesforceTypes';
import { OrgTabView } from './views/orgTab';    

import { DebugConsoleView } from './views/debugConsoleView';
import { TestSummaryView } from './views/testSummarySidePanel';
import { TestRunningTaskView, TestItem } from './views/testRunningTaskSidePanel';

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { GitService } from './services/gitService';
import { GitHistoryView } from './views/gitHistoryView';
import { GitHistoryViewPanels } from './views/gitHistoryViewPanels';
import { GitHistoryListView } from './views/gitHistoryListView';
import { ExecuteApexTab } from './views/executeApexTab';
import { TractionTab } from './views/tractionTab';
import { LogFilterView } from './views/logFilterView';
import { LogFilterService, logFilterService } from './services/logFilterService';
import { JsonViewerTab } from './views/jsonViewerTab';
import { JsonViewerService } from './services/jsonViewerService';
import { StorageService } from './services/storageService';
import { OrgListCacheService } from './services/orgListCacheService';
import { ReferencesView } from './views/referencesView';
import { SymbolNavigationService } from './services/symbolNavigationService';

let outputChannel: vscode.OutputChannel;

// Configuration helper function
function isModuleEnabled(moduleName: string): boolean {
  const config = vscode.workspace.getConfiguration('visbal');
  return config.get(`modules.${moduleName}.enabled`, true);
}

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Visbal Extension');
  context.subscriptions.push(outputChannel);

  // Initialize core services
  const sfdxService = new SfdxService();
  const cachePath = OrgUtils.getCachePath();
  const orgListCacheService = new OrgListCacheService(cachePath);
  OrgUtils.initialize([], context, sfdxService, orgListCacheService);

  OrgUtils.logDebug('[VisbalExt.Extension] activate -- Activating extension');

  // Check if there's a default org set for the project first
  try {
    const alias = await OrgUtils.getCurrentOrgAlias();
    const userId = await OrgUtils.getCurrentUserId(alias);
    OrgUtils.logDebug(`[VisbalExt.Extension] activate -- Org found - alias: ${alias}, userId: ${userId}`);
    outputChannel.appendLine(`[VisbalExt.Extension] activate -- Connected to org: ${alias}`);
  } catch (error: any) {
    OrgUtils.logDebug('[VisbalExt.Extension] activate -- No default org set or connection failed');
    outputChannel.appendLine('[VisbalExt.Extension] activate -- No default org configured - some features may be limited');
    statusBarService.showMessage('No Salesforce org configured', 'warning');
  }
  
  
  // Initialize services with context
  LogFilterService.getInstance(context);
  
  // Initialize status bar
  statusBarService.showMessage('[VisbalExt.Extension] activated', 'rocket');
  context.subscriptions.push({ dispose: () => {
    statusBarService.dispose();
    outputChannel.dispose();
  }});

  // Initialize services
  const metadataService = new MetadataService(sfdxService);
  const storageService = new StorageService(context); // Instantiate StorageService
  context.subscriptions.push(statusBarService);

  // Initialize debug console view
  OrgUtils.logDebug('[VisbalExt.Extension] activate -- Initializing DebugConsoleView: Initialize debug console view');
  outputChannel.appendLine('[VisbalExt.Extension] activate -- Initializing DebugConsoleView');
  const debugConsoleView = new DebugConsoleView(context.extensionUri);

  // Register the clear console command
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.clearConsole', () => {
      debugConsoleView.clear();
    })
  );

  // Declare views that might be conditionally initialized
  let testRunningTaskView: TestRunningTaskView | undefined;
  let visbalLogViewProvider: VisbalLogView | undefined;
  let soqlPanel: SoqlTab | undefined;
  let samplePanel: ExecuteApexTab | undefined;
  let orgTabViewProvider: OrgTabView | undefined;
  let tractionTab: TractionTab | undefined;
  let jsonViewerTab: JsonViewerTab | undefined;
  let referencesView: ReferencesView | undefined;

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('visbal.modules')) {
        vscode.window.showInformationMessage('Visbal Extension configuration changed. Please reload the window to apply changes.');
      }
    })
  );

  // Initialize views based on configuration
  if (isModuleEnabled('testExplorer')) {
    // Initialize test run results view first
    OrgUtils.logDebug('[VisbalExt.Extension] activate -- Initializing TestRunningTaskView: Initialize test run results view first');
    outputChannel.appendLine('[VisbalExt.Extension] activate -- Initializing TestRunningTaskView');
    testRunningTaskView = new TestRunningTaskView(context);

    // Initialize test results view
    OrgUtils.logDebug('[VisbalExt.Extension] activate -- Initializing TestSummaryView: Initialize test results view');
    outputChannel.appendLine('[VisbalExt.Extension] activate -- Initializing TestSummaryView');
    const testSummaryView = new TestSummaryView(context.extensionUri);

    // Set reference to TestSummaryView in TestRunningTaskView for detailed error access
    testRunningTaskView.setTestSummaryView(testSummaryView);

    // Initialize test class explorer view with test results view
    OrgUtils.logDebug('[VisbalExt.Extension] activate -- Initializing TestClassExplorerView: Initialize test class explorer view with test results view');
    outputChannel.appendLine('[VisbalExt.Extension] activate -- Initializing TestClassExplorerView');
    const testClassExplorerView = new TestClassExplorerView(
        context.extensionUri,
        statusBarService,
        context,
        testRunningTaskView,
        testSummaryView,
        salesforceApi,
        sfdxService,
        storageService
    );

    // Register test class explorer view commands
    context.subscriptions.push(
        vscode.commands.registerCommand('visbal-ext.testClassExplorerView.runTest', (args) => {
            OrgUtils.logDebug('[VisbalExt.Extension] testClassExplorerView.runTest command called with args:', args);
            testClassExplorerView.runTest(args.testClass, args.testMethod);
        }),
        vscode.commands.registerCommand('visbal-ext.testClassExplorerView.runSelectedTests', (args) => {
            testClassExplorerView.runSelectedTests(args);
        }),
        vscode.commands.registerCommand('visbal-ext.rerunAllTests', async () => {
            if (testClassExplorerView) {
                await testClassExplorerView.rerunAllTests();
            } else {
                vscode.window.showErrorMessage('Test class explorer view is not initialized');
            }
        }),
        vscode.commands.registerCommand('visbal-ext.rerunFailedTests', async () => {
            if (testClassExplorerView) {
                await testClassExplorerView.rerunFailedTests();
            } else {
                vscode.window.showErrorMessage('Test class explorer view is not initialized');
            }
        }),
        vscode.commands.registerCommand('visbal-ext.rerunSelectedTests', (args) => {
            testClassExplorerView.rerunSelectedTests();
        }),
        vscode.commands.registerCommand('visbal-ext.clearRunningTests', async () => {
            if (testClassExplorerView) {
                await testClassExplorerView.clearRunningTestStates();
            } else {
                vscode.window.showErrorMessage('Test class explorer view is not initialized');
            }
        }),
        vscode.commands.registerCommand('visbal-ext.exportTestResults', async () => {
            if (testRunningTaskView) {
                await testRunningTaskView.exportTestResults();
            } else {
                vscode.window.showErrorMessage('Test running task view is not initialized');
            }
        }),
        vscode.commands.registerCommand('visbal-ext.cleanupDebugFiles', async () => {
            try {
                const result = OrgUtils.cleanupOldDebugFiles();
                vscode.window.showInformationMessage(`Visbal Debug Cleanup: ${result}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to cleanup debug files: ${error}`);
            }
        }),
        vscode.commands.registerCommand('visbal-ext.selectAndRunTestClass', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor found');
                    return;
                }
                
                let testClassName: string | undefined;
                let testMethodName: string | undefined;
                
                // Method 1: Try to detect method name from cursor position/selection
                const position = editor.selection.active;
                const symbolInfo = SymbolNavigationService.extractSymbolInfo(editor.document, position);
                
                if (symbolInfo && symbolInfo.symbol) {
                    // Check if the cursor is on a test method name
                    if (symbolInfo.symbol.toLowerCase().includes('test')) {
                        testMethodName = symbolInfo.symbol;
                        OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test method from cursor: ${testMethodName}`);
                    }
                }
                
                // Method 2: Get class name from current file name (if it's a test class)
                const fileName = editor.document.fileName;
                const fileBaseName = fileName.split(/[\\/]/).pop()?.replace('.cls', '');
                
                if (fileBaseName && (fileBaseName.toLowerCase().includes('test') || fileBaseName.toLowerCase().endsWith('tests'))) {
                    testClassName = fileBaseName;
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test class from filename: ${testClassName}`);
                }
                
                // Method 3: Try to extract class name from cursor position (if user has selected a class name)
                if (!testClassName && symbolInfo && symbolInfo.type === 'class') {
                    testClassName = symbolInfo.symbol;
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test class from cursor: ${testClassName}`);
                }
                
                // Method 4: Look for class declaration in the current file
                if (!testClassName) {
                    const document = editor.document;
                    const text = document.getText();
                    const classMatch = text.match(/(?:public|private|global)?\s*class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/);
                    
                    if (classMatch && (classMatch[1].toLowerCase().includes('test') || classMatch[1].toLowerCase().endsWith('tests'))) {
                        testClassName = classMatch[1];
                        OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test class from file content: ${testClassName}`);
                    }
                }
                
                if (!testClassName) {
                    vscode.window.showErrorMessage('Could not detect a test class. Make sure you are in a test class file or have selected a test class name.');
                    return;
                }
                
                // Show the Test Explorer panel
                try {
                    await vscode.commands.executeCommand('workbench.view.extension.visbal-test-container');
                } catch (error) {
                    OrgUtils.logDebug('[VisbalExt.Extension] selectAndRunTestClass -- Could not open test container, continuing anyway');
                }
                
                // Run the detected test (method or class)
                const targetDescription = testMethodName ? `method: ${testMethodName}` : `class: ${testClassName}`;
                const runningMessage = vscode.window.setStatusBarMessage(`$(beaker~spin) Running test ${targetDescription}...`);
                
                try {
                    // Add debug logging
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- About to execute command for test class: ${testClassName}, method: ${testMethodName || 'all methods'}`);
                    
                    // Reuse existing command instead of calling service directly
                    await vscode.commands.executeCommand('visbal-ext.testClassExplorerView.runTest', {
                        testClass: testClassName,
                        testMethod: testMethodName  // Will be undefined if no specific method detected
                    });
                    
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Command executed successfully for test class: ${testClassName}, method: ${testMethodName || 'all methods'}`);
                    
                    runningMessage.dispose();
                    const successMessage = testMethodName 
                        ? `Test method '${testMethodName}' in class '${testClassName}' has been executed.`
                        : `Test class '${testClassName}' has been executed.`;
                    vscode.window.showInformationMessage(`${successMessage} Check the Test Summary view for results.`);
                } catch (testError) {
                    runningMessage.dispose();
                    OrgUtils.logError(`[VisbalExt.Extension] selectAndRunTestClass -- Error executing test: ${testError}`, testError);
                    vscode.window.showErrorMessage(`Failed to run test ${targetDescription}: ${testError}`);
                }
                
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.Extension] selectAndRunTestClass -- Error:', error);
                vscode.window.showErrorMessage(`Failed to run test: ${error.message}`);
            }
        })
        
    );

    // Register test class explorer view
    OrgUtils.logDebug('[VisbalExt.Extension] activate -- Register TestClassExplorerView: Register test class explorer view');
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TestClassExplorerView.viewType,
            testClassExplorerView
        )
    );


    // Register test run results view
    const treeView = vscode.window.createTreeView('testRunResults', {
        treeDataProvider: testRunningTaskView.getProvider(),
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register test results view
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-test-summary',
        testSummaryView,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );

    // Register command to handle test file opening
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.openTestFile', async (className: string, methodName: string) => {
        try {
          OrgUtils.logDebug('[VisbalExt.Extension] activate -- Opening test file:', { className, methodName });
          await OrgUtils.openTestFile(className, methodName);
        } catch (error: any) {
          OrgUtils.logError(`[VisbalExt.Extension] activate -- Error opening test file for ${className}.${methodName}:`, error);
          vscode.window.showErrorMessage(`Could not open test file for ${className}.${methodName}: ${error.message}`);
        }
      })
    );

    // Register command to handle test log viewing
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.viewTestLog', async (logId: string, testName: string) => {
        try {
          OrgUtils.logDebug('[VisbalExt.Extension] activate -- Viewing test log:', { logId, testName });
          
          // Show immediate visual feedback in status bar
          statusBarService.showProgress(`Opening log for test: ${testName}...`);
          
          // Mark the log as downloading in the test explorer UI
          TestItem.setDownloading(logId, true);
          
          // Use the test explorer's selected org instead of the project default org
          let selectedOrg = await OrgUtils.getSelectedOrgForView(ViewId.TEST_EXPLORER);
          if (!selectedOrg?.alias) {
            // Fallback to default org if no test explorer org is selected
            selectedOrg = { alias: await OrgUtils.getCurrentOrgAlias(), timestamp: new Date().toISOString() };
          }
          
          await OrgUtils.openLog(logId, context.extensionUri, selectedOrg.alias);
          
          // Show success feedback
          statusBarService.showSuccess(`Log opened for test: ${testName}`);
          
          // Clear downloading state
          TestItem.setDownloading(logId, false);
          
        } catch (error: any) {
          TestItem.setDownloading(logId, false);
          statusBarService.showError(`Failed to open log for test ${testName}: ${error.message}`);
          OrgUtils.logError(`[VisbalExt.Extension] activate Error viewing test:${testName} log:${logId}`, error);
          vscode.window.showWarningMessage(`Could not view log for test ${testName}: ${(error as Error).message}`);
        }
      })
    );
  } 

  //if (isModuleEnabled('orgs')) {
    orgTabViewProvider = new OrgTabView(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-orgs',
        orgTabViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      ) 
    );

    
  //}

  if (isModuleEnabled('logAnalyzer')) {
    // Create and register Visbal Log View
    visbalLogViewProvider = new VisbalLogView(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-log',
        visbalLogViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );

    // Register the Refresh Visbal Log command
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.refreshVisbalLog', () => {
        visbalLogViewProvider?.refresh();
      })
    );
  }

  if (isModuleEnabled('soqlQuery')) {
    // Create and register SOQL Panel
    soqlPanel = new SoqlTab(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-soql',
        soqlPanel,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );
  }

  if (isModuleEnabled('samplePanel')) {
    // Create and register Sample Panel
    samplePanel = new ExecuteApexTab(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-apex',
        samplePanel,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );
  }

  if (isModuleEnabled('traction')) {
    // Create and register Traction Tab
    tractionTab = new TractionTab(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-traction',
        tractionTab,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );
  }

  if (isModuleEnabled('jsonViewer')) {
    // Create and register JSON Viewer Tab
    jsonViewerTab = new JsonViewerTab(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-json-viewer',
        jsonViewerTab,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );

    // Initialize JSON Viewer Service
    const jsonViewerService = JsonViewerService.getInstance(context);
    jsonViewerService.initialize(jsonViewerTab);
  }

  // Initialize References View (using simple logging to avoid external processes)
  outputChannel.appendLine('[VisbalExt.Extension] activate -- Initializing ReferencesView');
  referencesView = new ReferencesView(context);

  // Register commands for panel activation (only if respective modules are enabled)
  if (isModuleEnabled('logAnalyzer')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showVisbalLog', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-log-container');
      })
    );
    
    // Register log filter commands
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showLogFilterManager', () => {
        LogFilterView.createOrShow(context.extensionUri);
      })
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.createLogFilter', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter filter name',
          placeHolder: 'My Custom Filter'
        });
        
        if (name) {
          const description = await vscode.window.showInputBox({
            prompt: 'Enter filter description (optional)',
            placeHolder: 'Description of what this filter does'
          });
          
          try {
            const condition = logFilterService.createCondition('content', 'contains', 'USER_DEBUG');
            const filter = logFilterService.createFilter(name, description || '', [condition]);
            statusBarService.showSuccess(`Filter "${filter.name}" created successfully`);
            
            // Open filter manager to edit the filter
            LogFilterView.createOrShow(context.extensionUri);
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating filter: ${error.message}`);
          }
        }
      })
    );
    
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.applyLogFilter', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document.fileName.endsWith('.log')) {
          vscode.window.showErrorMessage('Please open a .log file to apply filters');
          return;
        }
        
        const filters = logFilterService.getAllFilters();
        if (filters.length === 0) {
          vscode.window.showErrorMessage('No filters available. Create a filter first.');
          return;
        }
        
        const filterItems = filters.map(f => ({
          label: f.name,
          description: f.description,
          detail: `${f.conditions.length} conditions - ${f.isBuiltIn ? 'Built-in' : 'Custom'}`,
          filterId: f.id
        }));
        
        const selectedFilter = await vscode.window.showQuickPick(filterItems, {
          placeHolder: 'Select a filter to apply to the current log file'
        });
        
        if (selectedFilter) {
          try {
            const logContent = activeEditor.document.getText();
            const result = logFilterService.applyFilters(logContent, [selectedFilter.filterId]);
            
            // Create a new document with filtered content
            const filteredContent = result.filteredLines.map(line => line.content).join('\n');
            const newDoc = await vscode.workspace.openTextDocument({
              content: filteredContent,
              language: 'log'
            });
            
            await vscode.window.showTextDocument(newDoc);
            statusBarService.showSuccess(`Filter applied: ${result.totalMatches} matches found`);
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error applying filter: ${error.message}`);
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.saveFilteredLogResults', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document.fileName.endsWith('.log')) {
          vscode.window.showErrorMessage('Please open a .log file to apply filters and save results');
          return;
        }
        
        const filters = logFilterService.getAllFilters();
        if (filters.length === 0) {
          vscode.window.showErrorMessage('No filters available. Create a filter first.');
          return;
        }
        
        const filterItems = filters.map(f => ({
          label: f.name,
          description: f.description,
          detail: `${f.conditions.length} conditions - ${f.isBuiltIn ? 'Built-in' : 'Custom'}`,
          filterId: f.id
        }));
        
        const selectedFilter = await vscode.window.showQuickPick(filterItems, {
          placeHolder: 'Select a filter to apply and save results'
        });
        
        if (selectedFilter) {
          try {
            const logContent = activeEditor.document.getText();
            const result = logFilterService.applyFilters(logContent, [selectedFilter.filterId]);
            
            // Save the filtered results to file
            const savedFilePath = await logFilterService.saveFilteredResults(result, 'testResult.log');
            
            // Open the saved file
            const document = await vscode.workspace.openTextDocument(savedFilePath);
            await vscode.window.showTextDocument(document);
            
            statusBarService.showSuccess(`Filter applied and saved: ${result.totalMatches} matches found`);
            vscode.window.showInformationMessage(`Filtered results saved to: ${savedFilePath}`);
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error saving filtered results: ${error.message}`);
          }
        }
      })
    );
  }

  if (isModuleEnabled('soqlQuery')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showVisbalSoql', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-soql-container');
      })
    );
  }

  if (isModuleEnabled('samplePanel')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showVisbalSample', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-apex-container');
      })
    );
  }

  if (isModuleEnabled('traction')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showVisbalTraction', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-traction-container');
      })
    );
  }

  if (isModuleEnabled('jsonViewer')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showJsonViewer', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-json-container');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.openJsonInViewer', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.openJsonFromActiveEditor();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.validateJson', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.validateCurrentJson();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.formatJson', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.formatCurrentJson();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.minifyJson', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.minifyCurrentJson();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.convertJsonToYaml', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.convertJsonToYaml();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.generateJsonSchema', async () => {
        const jsonViewerService = JsonViewerService.getInstance(context);
        await jsonViewerService.createJsonSchema();
      })
    );
  }

  // Note: Removed automatic view container activation to respect user's previous panel selection

  // Register debug view commands
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showDebugConsole', () => {
      vscode.commands.executeCommand('workbench.view.extension.visbal-debug');
    })
  );

  // Register command to fetch logs using REST API
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.fetchLogsViaRestApi', async () => {
      try {
        statusBarService.showProgress('Fetching logs via Salesforce REST API...');
        
        const orgAlias = await OrgUtils.getCurrentOrgAlias();
        const orgId = orgAlias ? await OrgUtils.getOrgIdForAlias(orgAlias) : undefined;
        const initialized = await salesforceApi.initialize(orgAlias || undefined, orgId || undefined);
        if (!initialized) {
          statusBarService.showError('Failed to initialize Salesforce API service');
          vscode.window.showErrorMessage('Failed to initialize Salesforce API service');
          return;
        }
        
        const query = "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200";
        const result = await salesforceApi.query(query, true);
        
        if (!result || !result.records || !Array.isArray(result.records)) {
          statusBarService.showError('No logs found or invalid response from Salesforce API');
          vscode.window.showErrorMessage('No logs found or invalid response from Salesforce API');
          return;
        }
        
        statusBarService.showSuccess(`Successfully fetched ${result.records.length} logs`);
        vscode.window.showInformationMessage(`Successfully fetched ${result.records.length} logs via REST API`);
      } catch (error: any) {
        statusBarService.showError(`Error fetching logs: ${error.message}`);
        vscode.window.showErrorMessage(`Error fetching logs via REST API: ${error.message}`);
      }
    })
  );

  // Register command to execute Apex REST endpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.executeApexRest', async () => {
      try {
        const endpoint = await vscode.window.showInputBox({
          prompt: 'Enter the Apex REST endpoint (e.g., "MyApexClass")',
          placeHolder: 'MyApexClass'
        });
        
        if (!endpoint) {
          return;
        }
        
        const method = await vscode.window.showQuickPick(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], {
          placeHolder: 'Select HTTP method'
        });
        
        if (!method) {
          return;
        }
        
        let data: any = undefined;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          const jsonInput = await vscode.window.showInputBox({
            prompt: 'Enter JSON data (optional)',
            placeHolder: '{"key": "value"}'
          });
          
          if (jsonInput) {
            try {
              data = JSON.parse(jsonInput);
            } catch (e) {
              statusBarService.showError('Invalid JSON format');
              vscode.window.showErrorMessage('Invalid JSON format');
              return;
            }
          }
        }
        
        statusBarService.showProgress(`Executing Apex REST: ${method} ${endpoint}...`);
        
        const orgAlias = await OrgUtils.getCurrentOrgAlias();
        const orgId = orgAlias ? await OrgUtils.getOrgIdForAlias(orgAlias) : undefined;
        const initialized = await salesforceApi.initialize(orgAlias || undefined, orgId || undefined);
        if (!initialized) {
          statusBarService.showError('Failed to initialize Salesforce API service');
          vscode.window.showErrorMessage('Failed to initialize Salesforce API service');
          return;
        }
        
        const result = await salesforceApi.executeApexRest(endpoint, method, data);
        
        const document = await vscode.workspace.openTextDocument({
          content: JSON.stringify(result, null, 2),
          language: 'json'
        });
        
        await vscode.window.showTextDocument(document);
        
        statusBarService.showSuccess('Successfully executed Apex REST endpoint');
        vscode.window.showInformationMessage('Successfully executed Apex REST endpoint');
      } catch (error: any) {
        statusBarService.showError(`Error executing Apex REST: ${error.message}`);
        vscode.window.showErrorMessage(`Error executing Apex REST: ${error.message}`);
      }
    })
  );


  // Register the Show Find Model command
  let showFindModelCommand = vscode.commands.registerCommand('visbal-ext.showFindModel', () => {
    // Show the find model
    FindModel.show(context, async (searchText: string) => {
      // When the find button is clicked, search for the text
      await SearchLibrary.findInEditor(searchText);
    });
  });

  

  // Add commands to subscriptions
  context.subscriptions.push(showFindModelCommand);


  // Update debug event handlers
  vscode.debug.onDidStartDebugSession(() => {
    OrgUtils.logDebug('[VisbalExt.Extension] onDebugSessionStarted -- Debug session started');
    outputChannel.appendLine('[Debug] Debug session started');
    debugConsoleView.clear();
    debugConsoleView.addOutput('Debug session started', 'info');
    testRunningTaskView?.clear();
  });

  vscode.debug.onDidTerminateDebugSession(() => {
    outputChannel.appendLine('[Debug] Debug session ended');
    debugConsoleView.addOutput('Debug session ended', 'info');
  });

  vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
    outputChannel.appendLine(`[Debug] ${event.event}: ${JSON.stringify(event.body)}`);
    debugConsoleView.addOutput(`${event.event}: ${JSON.stringify(event.body)}`, 'info');
  });

  const gitService = new GitService(context);
  
  const gitHistorySelectionMode = vscode.workspace.getConfiguration('visbal.gitHistory').get('view');

  if (gitHistorySelectionMode != 'IDE') {
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showGitHistoryForSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      // Check if the file is saved
      if (editor.document.isUntitled) {
        vscode.window.showErrorMessage('Please save the file before viewing its Git history');
        return;
      }

      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showErrorMessage('No text selected');
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const startLine = selection.start.line + 1; // Convert to 1-based line numbers
      const endLine = selection.end.line + 1;
      //@ext:visbal.gitHistory.view
      //based on the configuration, show the git history view
      if (gitHistorySelectionMode === 'panel') {
        //@ext:visbal.gitHistory.view.panel
        GitHistoryViewPanels.createOrShow(context, gitService, filePath, startLine, endLine);
      }
      else {
        GitHistoryView.createOrShow(context, gitService, filePath, startLine, endLine);
      }
    })
  );
}
else {
  // Alternative command that shows Git history in a dedicated panel with click-to-diff functionality
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showGitHistoryForSelectionAlternative', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      // Check if the file is saved
      if (editor.document.isUntitled) {
        vscode.window.showErrorMessage('Please save the file before viewing its Git history');
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const selection = editor.selection;
      
      // Show the Git history list view
      if (selection.isEmpty) {
        // Show history for entire file
        GitHistoryListView.createOrShow(context, gitService, filePath);
      } else {
        // Show history for selection
        const startLine = selection.start.line + 1; // Convert to 1-based line numbers
        const endLine = selection.end.line + 1;
        GitHistoryListView.createOrShow(context, gitService, filePath, startLine, endLine);
      }
    })
  );
}

context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showGitHistoryForFile', (fileUri?: vscode.Uri) => {
      let filePath: string | undefined;
      let isUntitled = false;
      
      if (fileUri && fileUri.fsPath) {
        filePath = fileUri.fsPath;
        // Check if this is an untitled URI
        isUntitled = fileUri.scheme === 'untitled';
      } else if (vscode.window.activeTextEditor) {
        filePath = vscode.window.activeTextEditor.document.uri.fsPath;
        isUntitled = vscode.window.activeTextEditor.document.isUntitled;
      }
      
      if (!filePath) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
      
      if (isUntitled) {
        vscode.window.showErrorMessage('Please save the file before viewing its Git history');
        return;
      }
      
      GitHistoryView.createOrShowForFile(context, gitService, filePath);
    })
  );

  

  // Command to toggle code coverage for test runs
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.toggleCodeCoverage', async () => {
      const config = vscode.workspace.getConfiguration('visbal.apexTest');
      const currentValue = config.get<boolean>('enableCodeCoverage', false);
      const newValue = !currentValue;
      
      try {
        await config.update('enableCodeCoverage', newValue, vscode.ConfigurationTarget.Global);
        const status = newValue ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Code coverage for test runs is now ${status}`);
        OrgUtils.logDebug(`[VisbalExt.Extension] toggleCodeCoverage -- Code coverage ${status}`);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to update code coverage setting: ${error.message}`);
        OrgUtils.logError('[VisbalExt.Extension] toggleCodeCoverage -- Failed to update setting', error);
      }
    })
  );

  // Command to show the Visbal Extension output channel
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showOutput', () => {
      outputChannel.show();
    })
  );

  // Command to navigate to symbol definition based on cursor position
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.navigateToSelectedDefinition', async () => {
      try {
        OrgUtils.logDebug('[VisbalExt.Extension] _navigateToSelectedDefinition -- Navigating to selected definition');
        await OrgUtils.navigateToSelectedDefinition();
      } catch (error: any) {
        OrgUtils.logError('[VisbalExt.Extension] Error navigating to selected definition:', error);
        vscode.window.showErrorMessage(`Could not navigate to selected definition: ${error.message}`);
      }
    })
  );

  outputChannel.appendLine('[VisbalExt.Extension] Visbal Extension activated successfully');
  
  // Only show output channel if configured to do so
  const showOutputOnActivation = vscode.workspace.getConfiguration('visbal').get('output.showOnActivation', false);
  if (showOutputOnActivation) {
    outputChannel.show();
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel.appendLine('[VisbalExt.Extension] deactivate Deactivating Visbal Extension...');
  statusBarService.dispose();
  if (outputChannel) {
    outputChannel.dispose();
  }
} 