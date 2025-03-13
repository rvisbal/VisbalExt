import * as vscode from 'vscode';
import { FindModel } from './findModel';
import { SearchLibrary } from './searchLibrary';
import { VisbalLogView } from './views/visbalLogView';
import { LogDetailView } from './views/logDetailView';
import { LogFileEditorProvider } from './logFileEditor';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Visbal extension is now active');

  // Register the log file editor provider
  const logFileEditorProvider = new LogFileEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'visbal.logEditor',
      logFileEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  // Register the Visbal Log view provider
  const visbalLogViewProvider = new VisbalLogView(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      VisbalLogView.viewType,
      visbalLogViewProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal-ext.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from Visbal Extension!');
    }),
    vscode.commands.registerCommand('visbal-ext.showFindModel', () => {
      // Show the find model
      FindModel.show(context, async (searchText: string) => {
        // When the find button is clicked, search for the text
        await SearchLibrary.findInEditor(searchText);
      });
    }),
    vscode.commands.registerCommand('visbal-ext.showLogSummary', () => {
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
    }),
    vscode.commands.registerCommand('visbal-ext.refreshVisbalLog', () => {
      visbalLogViewProvider.refresh();
    })
  );

  // Register commands for the Visbal Log view
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.refreshLogs', () => {
      visbalLogViewProvider.refreshLogs();
    }),
    vscode.commands.registerCommand('visbal.downloadLog', (logId: string) => {
      visbalLogViewProvider.downloadLog(logId);
    }),
    vscode.commands.registerCommand('visbal.openLog', (logId: string) => {
      visbalLogViewProvider.openLog(logId);
    }),
    vscode.commands.registerCommand('visbal.viewLog', (logId: string) => {
      visbalLogViewProvider.viewLog(logId);
    }),
    vscode.commands.registerCommand('visbal.deleteLog', (logId: string) => {
      visbalLogViewProvider.deleteLog(logId);
    }),
    vscode.commands.registerCommand('visbal.deleteAllLogs', () => {
      visbalLogViewProvider.deleteAllLogs();
    })
  );

  // Register a command to open a log file in the detail view
  context.subscriptions.push(
    vscode.commands.registerCommand('visbal.openLogDetail', (logFilePath: string, logId: string) => {
      LogDetailView.createOrShow(context.extensionUri, logFilePath, logId);
    })
  );

  // Set context for log editor
  vscode.commands.executeCommand('setContext', 'visbal.logEditorEnabled', true);
}

// This method is called when your extension is deactivated
export function deactivate() {} 