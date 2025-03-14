import * as vscode from 'vscode';
import { FindModel } from './findModel';
import { SearchLibrary } from './searchLibrary';
import { VisbalLogView } from './views/visbalLogView';
import { LogDetailView } from './views/logDetailView';
import { salesforceApi } from './services/salesforceApiService';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('RV:Congratulations, your extension "visbal-ext" is now active!');

  // Register the Hello World command
  let helloWorldCommand = vscode.commands.registerCommand('visbal-ext.helloWorld', () => {
    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World from Visbal Extension 2!');
  });

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

  // Register the Visbal Log view provider
  const visbalLogViewProvider = new VisbalLogView(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      VisbalLogView.viewType,
      visbalLogViewProvider
    )
  );

  // Register the Refresh Visbal Log command
  let refreshVisbalLogCommand = vscode.commands.registerCommand('visbal-ext.refreshVisbalLog', () => {
    visbalLogViewProvider.refresh();
  });

  // Register command to open log detail view
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.openLogDetail', (logFilePath: string, logId: string) => {
      console.log(`[Extension] openLogDetail -- Opening log detail view for: ${logFilePath}`);
      LogDetailView.createOrShow(context.extensionUri, logFilePath, logId);
    })
  );

  // Register command to download log
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.downloadLog', (logId: string) => {
      console.log(`[Extension] downloadLog -- Downloading log: ${logId}`);
      vscode.commands.executeCommand('visbal.refreshLogs');
    })
  );

  // Register command to fetch logs using REST API
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.fetchLogsViaRestApi', async () => {
      try {
        vscode.window.showInformationMessage('Fetching logs via Salesforce REST API...');
        
        // Initialize the Salesforce API service
        const initialized = await salesforceApi.initialize();
        
        if (!initialized) {
          vscode.window.showErrorMessage('Failed to initialize Salesforce API service');
          return;
        }
        
        // Execute a SOQL query to fetch logs
        const query = "SELECT Id, LogUser.Name, Application, Operation, Request, Status, LogLength, LastModifiedDate FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT 200";
        const result = await salesforceApi.query(query, true); // Using Tooling API
        
        if (!result || !result.records || !Array.isArray(result.records)) {
          vscode.window.showErrorMessage('No logs found or invalid response from Salesforce API');
          return;
        }
        
        vscode.window.showInformationMessage(`Successfully fetched ${result.records.length} logs via REST API`);
        
        // You can process the logs here or pass them to the log view
        // For demonstration, we'll just show the count
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error fetching logs via REST API: ${error.message}`);
      }
    })
  );

  // Register command to execute Apex REST endpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.executeApexRest', async () => {
      try {
        // Prompt the user for the Apex REST endpoint
        const endpoint = await vscode.window.showInputBox({
          prompt: 'Enter the Apex REST endpoint (e.g., "MyApexClass")',
          placeHolder: 'MyApexClass'
        });
        
        if (!endpoint) {
          return; // User cancelled
        }
        
        // Prompt for the HTTP method
        const method = await vscode.window.showQuickPick(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], {
          placeHolder: 'Select HTTP method'
        });
        
        if (!method) {
          return; // User cancelled
        }
        
        // For methods that require data, prompt for JSON input
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
              vscode.window.showErrorMessage('Invalid JSON format');
              return;
            }
          }
        }
        
        vscode.window.showInformationMessage(`Executing Apex REST: ${method} ${endpoint}...`);
        
        // Initialize the Salesforce API service
        const initialized = await salesforceApi.initialize();
        
        if (!initialized) {
          vscode.window.showErrorMessage('Failed to initialize Salesforce API service');
          return;
        }
        
        // Execute the Apex REST endpoint
        const result = await salesforceApi.executeApexRest(endpoint, method, data);
        
        // Show the result in a new editor
        const document = await vscode.workspace.openTextDocument({
          content: JSON.stringify(result, null, 2),
          language: 'json'
        });
        
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage('Successfully executed Apex REST endpoint');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error executing Apex REST: ${error.message}`);
      }
    })
  );

  // Add commands to subscriptions
  context.subscriptions.push(helloWorldCommand);
  context.subscriptions.push(showFindModelCommand);
  context.subscriptions.push(showLogSummaryCommand);
  context.subscriptions.push(refreshVisbalLogCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {} 