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
import { StatusBarService } from './services/statusBarService';
import { LogTreeView } from './views/logTreeView';
import { DebugConsoleView } from './views/debugConsoleView';
import { TestResultsView } from './views/testResultsView';
import { SamplePanelView } from './views/samplePanelView';

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('Visbal Extension');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('[VisbalExt.Extension] Activating Visbal Extension...');
  
  // Initialize status bar
  statusBarService.showMessage('[VisbalExt.Extension] activated', 'rocket');
  context.subscriptions.push({ dispose: () => {
    statusBarService.dispose();
    outputChannel.dispose();
  }});

  // Initialize services
  const metadataService = new MetadataService();

  // Create view providers
  const visbalLogViewProvider = new VisbalLogView(context);
  const testExplorer = new TestClassExplorerView(
    context.extensionUri,
    statusBarService,
    context
  );
  const soqlPanel = new SoqlPanelView(metadataService);
  const debugConsoleView = new DebugConsoleView(context.extensionUri);
  const samplePanel = new SamplePanelView();

  // Register Test Explorer View (sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TestClassExplorerView.viewType,
      testExplorer
    )
  );

  // Register Debug Console View
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DebugConsoleView.viewType,
      debugConsoleView,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register Visbal Log View (bottom panel)
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

  // Register SOQL Panel View (bottom panel)
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

  // Register Sample Panel View (bottom panel)
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

  // Register Test Results View
  const testResultsView = new TestResultsView(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TestResultsView.viewType,
      testResultsView,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register commands for panel activation
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showVisbalLog', () => {
      vscode.commands.executeCommand('workbench.view.extension.visbal-log-container');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showVisbalSoql', () => {
      vscode.commands.executeCommand('workbench.view.extension.visbal-soql-container');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showVisbalSample', () => {
      vscode.commands.executeCommand('workbench.view.extension.visbal-sample-container');
    })
  );

  // Register debug view commands
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.showDebugConsole', () => {
      vscode.commands.executeCommand('workbench.view.extension.visbal-debug');
    })
  );

  // Register the Refresh Visbal Log command
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.refreshVisbalLog', () => {
      visbalLogViewProvider.refresh();
    })
  );

  // Register command to open log detail view
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.openLogDetail', (logFilePath: string, logId: string) => {
      console.log(`[VisbalExt.Extension] openLogDetail -- Opening log detail view for: ${logFilePath}`);
      LogDetailView.createOrShow(context.extensionUri, logFilePath, logId);
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

  // Create and register the log tree view
  const logTreeView = new LogTreeView(context);

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

  // Update debug event handlers to use output channel
  vscode.debug.onDidStartDebugSession(() => {
    outputChannel.appendLine('[Debug] Debug session started');
    debugConsoleView.clear();
    debugConsoleView.addOutput('Debug session started', 'info');
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