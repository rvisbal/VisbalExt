import * as vscode from 'vscode';
import { FindModel } from './findModel';
import { SearchLibrary } from './searchLibrary';
import { VisbalLogView } from './views/visbalLogView';
import { LogDetailView } from './views/logDetailView';
import { TestClassExplorerView } from './views/testClassExplorerView';
import { salesforceApi } from './services/salesforceApiService';
import { statusBarService } from './services/statusBarService';
import { SoqlPanelView } from './views/soqlPanelView';
import { MetadataService } from './services/metadataService';

import { DebugConsoleView } from './views/debugConsoleView';
import { TestSummaryView } from './views/testSummaryView';
import { SamplePanelView } from './views/samplePanelView';
import { TestRunResultsView, TestItem } from './views/testRunResultsView';

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

let outputChannel: vscode.OutputChannel;

// Configuration helper function
function isModuleEnabled(moduleName: string): boolean {
  const config = vscode.workspace.getConfiguration('visbal');
  return config.get(`modules.${moduleName}.enabled`, true);
}

// Initialize template files
async function initializeTemplates(context: vscode.ExtensionContext) {
  try {
    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.log('[VisbalExt.Extension] No workspace folder found');
      return;
    }

    // Create src/apex directory if it doesn't exist
    const apexDir = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'apex');
    try {
      await vscode.workspace.fs.createDirectory(apexDir);
    } catch (err) {
      console.log('[VisbalExt.Extension] Error creating src/apex directory:', err);
      return;
    }

    // Check if we need to copy templates
    let existingFiles: [string, vscode.FileType][] = [];
    try {
      existingFiles = await vscode.workspace.fs.readDirectory(apexDir);
    } catch (err) {
      console.log('[VisbalExt.Extension] Error reading src/apex directory:', err);
    }

    // Only copy templates if the directory is empty
    if (existingFiles.length === 0) {
      // Get template files from extension directory
      const extensionTemplatesPath = vscode.Uri.joinPath(context.extensionUri, '.visbal', 'templates', 'apex');
      try {
        const templateFiles = await vscode.workspace.fs.readDirectory(extensionTemplatesPath);
        
        // Copy each template file
        for (const [fileName, fileType] of templateFiles) {
          if (fileType === vscode.FileType.File && fileName.endsWith('.apex')) {
            const targetPath = vscode.Uri.joinPath(apexDir, fileName);
            try {
              const sourceContent = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionTemplatesPath, fileName));
              await vscode.workspace.fs.writeFile(targetPath, sourceContent);
              console.log(`[VisbalExt.Extension] Copied template ${fileName} to workspace`);
            } catch (err) {
              console.error(`[VisbalExt.Extension] Error copying template ${fileName}:`, err);
            }
          }
        }
      } catch (err) {
        console.error('[VisbalExt.Extension] Error accessing template directory:', err);
      }
    } else {
      console.log('[VisbalExt.Extension] src/apex directory not empty, skipping template copy');
    }
  } catch (error) {
    console.error('[VisbalExt.Extension] Error initializing templates:', error);
  }
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Visbal Extension');
  context.subscriptions.push(outputChannel);

  console.log('[VisbalExt.Extension] Activating extension');
  outputChannel.appendLine('[VisbalExt.Extension] Activating extension');
  
  // Initialize templates
  initializeTemplates(context).catch(err => {
    console.error('[VisbalExt.Extension] Error during template initialization:', err);
  });

  // Initialize status bar
  statusBarService.showMessage('[VisbalExt.Extension] activated', 'rocket');
  context.subscriptions.push({ dispose: () => {
    statusBarService.dispose();
    outputChannel.dispose();
  }});

  // Initialize services
  const metadataService = new MetadataService();
  context.subscriptions.push(statusBarService);

  // Initialize debug console view
  console.log('[VisbalExt.Extension] Initializing DebugConsoleView');
  outputChannel.appendLine('[VisbalExt.Extension] Initializing DebugConsoleView');
  const debugConsoleView = new DebugConsoleView(context.extensionUri);

  // Declare views that might be conditionally initialized
  let testRunResultsView: TestRunResultsView | undefined;
  let visbalLogViewProvider: VisbalLogView | undefined;
  let soqlPanel: SoqlPanelView | undefined;
  let samplePanel: SamplePanelView | undefined;

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
    console.log('[VisbalExt.Extension] Initializing TestRunResultsView');
    outputChannel.appendLine('[VisbalExt.Extension] Initializing TestRunResultsView');
    testRunResultsView = new TestRunResultsView(context);

    // Initialize test results view
    console.log('[VisbalExt.Extension] Initializing TestSummaryView');
    outputChannel.appendLine('[VisbalExt.Extension] Initializing TestSummaryView');
    const testSummaryView = new TestSummaryView(context.extensionUri);

    // Initialize test class explorer view with test results view
    console.log('[VisbalExt.Extension] Initializing TestClassExplorerView');
    outputChannel.appendLine('[VisbalExt.Extension] Initializing TestClassExplorerView');
    const testClassExplorerView = new TestClassExplorerView(
        context.extensionUri,
        statusBarService,
        context,
        testRunResultsView,
        testSummaryView
    );

    // Register test class explorer view commands
    context.subscriptions.push(
        vscode.commands.registerCommand('visbal-ext.testClassExplorerView.runTest', (args) => {
            testClassExplorerView.runTest(args.testClass, args.testMethod);
        }),
        vscode.commands.registerCommand('visbal-ext.testClassExplorerView.runSelectedTests', (args) => {
            testClassExplorerView.runSelectedTests(args);
        }),
        vscode.commands.registerCommand('visbal-ext.rerunAllTests', async () => {
            if (testRunResultsView) {
                await testRunResultsView.rerunAllTests();
            } else {
                vscode.window.showErrorMessage('Test run results view is not initialized');
            }
        })
    );

    // Register test class explorer view
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TestClassExplorerView.viewType,
            testClassExplorerView
        )
    );

    // Register test run results view
    const treeView = vscode.window.createTreeView('testRunResults', {
        treeDataProvider: testRunResultsView.getProvider(),
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

    // Register command to handle test log viewing
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.viewTestLog', async (logId: string, testName: string) => {
        try {
          console.log('[VisbalExt.Extension] Viewing test log:', { logId, testName });

          // Check if this log is already being downloaded
          if (TestItem.isDownloading(logId)) {
            console.log('[VisbalExt.Extension] Log download already in progress:', logId);
            return;
          }

          // Check if log file already exists in .visbal/logs/
          const logDir = join(vscode.workspace.rootPath || '', '.visbal', 'logs');
          const files = await vscode.workspace.findFiles(`**/${logId}*.log`);
          
          if (files.length > 0) {
            // Log file exists, open it
            console.log('[VisbalExt.Extension] Found existing log file:', files[0].fsPath);
            const document = await vscode.workspace.openTextDocument(files[0]);
            await vscode.window.showTextDocument(document);
            return;
          }

          // Log file not found, download it
          console.log('[VisbalExt.Extension] Log file not found, downloading:', logId);
          TestItem.setDownloading(logId, true);
          
          try {
            const logContent = await metadataService.getTestLog(logId);
            console.log('[VisbalExt.Extension] Log content retrieved:', !!logContent);
            
            if (logContent) {
              // Create logs directory if it doesn't exist
              if (!existsSync(logDir)) {
                mkdirSync(logDir, { recursive: true });
              }

              // Create a file with the log ID in the name
              const tmpPath = join(logDir, `${logId}-${testName}-${new Date().getTime()}.log`);
              console.log('[VisbalExt.Extension] Creating log file at:', tmpPath);
              
              const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + tmpPath));
              const editor = await vscode.window.showTextDocument(document);
              await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), logContent);
              });
              console.log('[VisbalExt.Extension] Log file created and opened');
            }
          } finally {
            TestItem.setDownloading(logId, false);
          }
        } catch (error) {
          TestItem.setDownloading(logId, false);
          console.error('[VisbalExt.Extension] Error viewing test log:', {
            testName,
            logId,
            error: error
          });
          vscode.window.showWarningMessage(`Could not view log for test ${testName}: ${(error as Error).message}`);
        }
      })
    );
  }

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
    soqlPanel = new SoqlPanelView(context);
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
    samplePanel = new SamplePanelView(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'visbal-sample',
        samplePanel,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );
  }

  // Register commands for panel activation (only if respective modules are enabled)
  if (isModuleEnabled('logAnalyzer')) {
    context.subscriptions.push(
      vscode.commands.registerCommand('visbal-ext.showVisbalLog', () => {
        vscode.commands.executeCommand('workbench.view.extension.visbal-log-container');
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
        vscode.commands.executeCommand('workbench.view.extension.visbal-sample-container');
      })
    );
  }

  // Ensure the view container is visible
  vscode.commands.executeCommand('workbench.view.extension.visbal-test-container');

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
        
        const initialized = await salesforceApi.initialize();
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
        
        const initialized = await salesforceApi.initialize();
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

  // Register the Show Log Summary command
  let showLogSummaryCommand = vscode.commands.registerCommand('visbal-ext.showLogSummary', () => {
    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor found');
      return;
    }

    // Get the log file path
    const logFilePath = editor.document.uri.fsPath;
    // Use a generated ID based on the file path
    const logId = `summary_${Date.now()}`;

    // Show the log detail view instead of the summary view
    LogDetailView.createOrShow(context.extensionUri, logFilePath, logId);
  });

  // Add commands to subscriptions
  context.subscriptions.push(showFindModelCommand);
  context.subscriptions.push(showLogSummaryCommand);

  // Update debug event handlers
  vscode.debug.onDidStartDebugSession(() => {
    console.log('[VisbalExt.Extension] Debug session started');
    outputChannel.appendLine('[Debug] Debug session started');
    debugConsoleView.clear();
    debugConsoleView.addOutput('Debug session started', 'info');
    testRunResultsView?.clear();
  });

  vscode.debug.onDidTerminateDebugSession(() => {
    outputChannel.appendLine('[Debug] Debug session ended');
    debugConsoleView.addOutput('Debug session ended', 'info');
  });

  vscode.debug.onDidReceiveDebugSessionCustomEvent(event => {
    outputChannel.appendLine(`[Debug] ${event.event}: ${JSON.stringify(event.body)}`);
    debugConsoleView.addOutput(`${event.event}: ${JSON.stringify(event.body)}`, 'info');
  });

  outputChannel.appendLine('[VisbalExt.Extension] Visbal Extension activated successfully');
  outputChannel.show();
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel.appendLine('[VisbalExt.Extension] Deactivating Visbal Extension...');
  statusBarService.dispose();
  if (outputChannel) {
    outputChannel.dispose();
  }
} 