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
import { SymbolReference } from './services/referencesService';
import { SymbolNavigationService } from './services/symbolNavigationService';

let outputChannel: vscode.OutputChannel;

// Helper function to check if a method is preceded by @IsTest annotation
async function isMethodPrecededByIsTestAnnotation(document: vscode.TextDocument, position: vscode.Position, methodName: string): Promise<boolean> {
    try {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Find the line with the method declaration
        let methodLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Look for the method name in a method declaration pattern
            const methodPattern = new RegExp(`\\b(public|private|protected|global)?\\s*(static)?\\s*\\w+\\s+${methodName}\\s*\\(`);
            if (methodPattern.test(line)) {
                methodLineIndex = i;
                break;
            }
        }
        
        if (methodLineIndex === -1) {
            return false;
        }
        
        // Look backwards from the method line to find @IsTest annotation
        // Check up to 10 lines before the method (to account for comments, etc.)
        for (let i = methodLineIndex - 1; i >= Math.max(0, methodLineIndex - 10); i--) {
            const line = lines[i].trim();
            
            // Skip empty lines and comments
            if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
                continue;
            }
            
            // Check for @IsTest annotation (case insensitive)
            if (line.toLowerCase().includes('@istest')) {
                return true;
            }
            
            // If we hit another method or class declaration, stop searching
            if (line.includes('public ') || line.includes('private ') || line.includes('protected ') || line.includes('global ')) {
                if (line.includes('class ') || (line.includes('(') && !line.toLowerCase().includes('@istest'))) {
                    break;
                }
            }
        }
        
        return false;
    } catch (error) {
        OrgUtils.logDebug(`[VisbalExt.Extension] isMethodPrecededByIsTestAnnotation -- Error: ${error}`);
        return false;
    }
}

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
                
                // Method 2: Get class name from current file name (if it's a test class)
                const fileName = editor.document.fileName;
                const fileBaseName = fileName.split(/[\\/]/).pop()?.replace('.cls', '');
                let isInTestClass = false;
                
                if (fileBaseName && (fileBaseName.toLowerCase().includes('test') || fileBaseName.toLowerCase().endsWith('tests'))) {
                    testClassName = fileBaseName;
                    isInTestClass = true;
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test class from filename: ${testClassName}`);
                }
                
                if (symbolInfo && symbolInfo.symbol) {
                    // If we're in a test class, check if the current symbol is a test method by looking for @IsTest annotation
                    if (isInTestClass && (symbolInfo.type === 'method' || symbolInfo.type === 'variable')) {
                        const isTestMethod = await isMethodPrecededByIsTestAnnotation(editor.document, position, symbolInfo.symbol);
                        if (isTestMethod) {
                            testMethodName = symbolInfo.symbol;
                            OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test method with @IsTest annotation: ${testMethodName}`);
                        } else {
                            OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Method ${symbolInfo.symbol} found but no @IsTest annotation detected`);
                        }
                    }
                    // Fallback: Check if the method name explicitly contains 'test' (for backwards compatibility)
                    else if (symbolInfo.symbol.toLowerCase().includes('test')) {
                        testMethodName = symbolInfo.symbol;
                        OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test method from cursor (contains 'test'): ${testMethodName}`);
                    }
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
                
                // Method 5: If we're in a log file, try to extract test class name from log content
                if (!testClassName && (fileName.endsWith('.log') || fileName.includes('debug'))) {
                    OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- In log file, attempting to extract test class from content`);
                    const document = editor.document;
                    const currentLine = document.lineAt(position.line).text;
                    
                    // Look for patterns like "ClassName.methodName" in log files
                    const logClassMatch = currentLine.match(/(\w*Test\w*)\./);
                    if (logClassMatch) {
                        testClassName = logClassMatch[1];
                        OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test class from log line: ${testClassName}`);
                        
                        // Also try to extract method name from the same line
                        const logMethodMatch = currentLine.match(/\w*Test\w*\.(\w+)/);
                        if (logMethodMatch && !testMethodName) {
                            testMethodName = logMethodMatch[1];
                            OrgUtils.logDebug(`[VisbalExt.Extension] selectAndRunTestClass -- Detected test method from log line: ${testMethodName}`);
                        }
                    }
                }
                
                if (!testClassName) {
                    const fileExtension = fileName.split('.').pop()?.toLowerCase();
                    if (fileExtension === 'log') {
                        vscode.window.showErrorMessage('Could not detect a test class from log file. Try opening the actual .cls test file, or place cursor on a line containing "TestClassName.methodName".');
                    } else {
                        vscode.window.showErrorMessage('Could not detect a test class. Make sure you are in a test class file (.cls) that contains "Test" in the class name, or have selected a test class name.');
                    }
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

  // Register @AuraEnabled report command
  const auraEnabledReportCommand = vscode.commands.registerCommand('visbal-ext.reportAuraEnabled', async () => {
    try {
      outputChannel.appendLine('[VisbalExt.Extension] reportAuraEnabled -- Starting @AuraEnabled report generation');
      
      // Helper function to send progress updates to Traction tab
      const sendProgressToTraction = (title: string, description: string, percentage?: number) => {
        try {
          if (tractionTab && tractionTab.updateProgress) {
            tractionTab.updateProgress(title, description, percentage);
          }
        } catch (e) {
          // Silently fail if we can't send progress updates
        }
      };
      
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Scanning @AuraEnabled methods and LWC references...",
        cancellable: false
      }, async (progress) => {
        try {
          // Stage 1: Initialize scanning
          sendProgressToTraction('Scanning Apex Classes', 'Analyzing @AuraEnabled methods in force-app/main/default/classes...', 25);
          progress.report({ increment: 25, message: "Scanning Apex classes..." });
          
          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const { AuraEnabledService } = await import('./services/auraEnabledService');
          
          // Stage 2: Find LWC references
          sendProgressToTraction('Scanning LWC References', 'Searching for method references in force-app/main/default/lwc...', 50);
          progress.report({ increment: 25, message: "Scanning LWC references..." });
          
          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const resultsByClass = await AuraEnabledService.findAuraEnabledMethods();
          
          if (resultsByClass.size === 0) {
            sendProgressToTraction('No Results Found', 'No @AuraEnabled methods found that are referenced by Lightning Web Components.', 100);
            vscode.window.showInformationMessage('No @AuraEnabled methods found that are referenced by Lightning Web Components.');
            return;
          }
          
          // Stage 3: Build results
          sendProgressToTraction('Building Reference Tree', 'Organizing results by class and method...', 75);
          progress.report({ increment: 25, message: "Building reference tree..." });
          
          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Calculate totals for the summary
          let totalMethods = 0;
          let totalReferences = 0;
          for (const [className, methods] of resultsByClass) {
            totalMethods += methods.length;
            totalReferences += methods.reduce((sum, method) => sum + method.references.length, 0);
          }
          
          // Stage 4: Update UI
          sendProgressToTraction('Complete', 'Opening References panel...', 100);
          progress.report({ increment: 25, message: "Opening References panel..." });
          
          // Small delay before completion
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Update the references view with hierarchical results
          if (referencesView) {
            // Use the custom method to display hierarchical @AuraEnabled results
            if (referencesView.getTreeDataProvider().updateAuraEnabledReferences) {
              referencesView.getTreeDataProvider().updateAuraEnabledReferences(resultsByClass);
            } else {
              // Fallback to standard method with flattened structure
              const flattenedReferences: SymbolReference[] = [];
              for (const [className, methods] of resultsByClass) {
                flattenedReferences.push(...methods);
              }
              
              const combinedReference: SymbolReference = {
                symbol: '@AuraEnabled Methods',
                type: 'Report',
                contextDescription: `@AuraEnabled Methods (${totalMethods} methods with LWC references)`,
                references: flattenedReferences.flatMap(sr => sr.references)
              };
              
              referencesView.getTreeDataProvider().updateReferences(combinedReference);
            }
            
            // Show the References panel
            try {
              await vscode.commands.executeCommand('workbench.view.extension.visbal-references-container');
            } catch (error) {
              console.log('[Extension] Could not open references panel, but results are available');
            }
            
            vscode.window.showInformationMessage(`Found ${resultsByClass.size} classes with ${totalMethods} @AuraEnabled methods and ${totalReferences} LWC references. Check the References panel.`);
          } else {
            // Fallback: show results in output channel
            let message = `Found @AuraEnabled methods with LWC references:\n\n`;
            
            for (const [className, methods] of resultsByClass) {
              message += `📁 ${className}\n`;
              methods.forEach((method, methodIndex) => {
                message += `  ├── ${method.contextDescription} (${method.references.length} references)\n`;
                method.references.forEach(ref => {
                  message += `      └── ${ref.fileName}:${ref.position.line + 1} - ${ref.lineText.trim()}\n`;
                });
                message += '\n';
              });
            }
            
            // Show in output channel
            const auraReportChannel = vscode.window.createOutputChannel('@AuraEnabled Report');
            auraReportChannel.clear();
            auraReportChannel.appendLine(message);
            auraReportChannel.show();
            
            vscode.window.showInformationMessage(`Found ${resultsByClass.size} classes with ${totalMethods} @AuraEnabled methods. See Output panel for details.`);
          }
        } catch (error: any) {
          sendProgressToTraction('Error', `Failed to generate @AuraEnabled report: ${error.message}`, 0);
          outputChannel.appendLine(`[VisbalExt.Extension] reportAuraEnabled -- Error: ${error.message}`);
          vscode.window.showErrorMessage(`Failed to generate @AuraEnabled report: ${error.message}`);
        }
      });
    } catch (error: any) {
      outputChannel.appendLine(`[VisbalExt.Extension] reportAuraEnabled -- Error: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to generate @AuraEnabled report: ${error.message}`);
    }
  });

  context.subscriptions.push(auraEnabledReportCommand);

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
            
            // Generate unique filename based on original file and filter
            const originalFileName = activeEditor.document.fileName.split(/[\/\\]/).pop() || 'unknown.log';
            const baseName = originalFileName.replace(/\.log$/, '');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '');
            const filterName = selectedFilter.label.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${baseName}_filtered_${filterName}_${timestamp}.log`;
            
            // Save filtered results to .visbal/logs directory
            const savedFilePath = await logFilterService.saveFilteredResults(result, fileName);
            
            // Open the saved file
            const document = await vscode.workspace.openTextDocument(savedFilePath);
            await vscode.window.showTextDocument(document);
            
            statusBarService.showSuccess(`Filter applied: ${result.totalMatches} matches found and saved to ${fileName}`);
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