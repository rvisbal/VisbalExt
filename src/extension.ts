import * as vscode from 'vscode';
import { FindModel } from './findModel';
import { SearchLibrary } from './searchLibrary';
import { LogSummaryView } from './views/logSummaryView';
import { VisbalLogView } from './views/visbalLogView';
import { LogDetailView } from './views/logDetailView';

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

  // Add commands to subscriptions
  context.subscriptions.push(helloWorldCommand);
  context.subscriptions.push(showFindModelCommand);
  context.subscriptions.push(showLogSummaryCommand);
  context.subscriptions.push(refreshVisbalLogCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {} 