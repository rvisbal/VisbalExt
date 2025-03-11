import * as vscode from 'vscode';
import { FindModel } from './findModel';
import { SearchLibrary } from './searchLibrary';
import { LogSummaryView } from './views/logSummaryView';

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
    // Show the log summary
    LogSummaryView.show(context);
  });

  // Add commands to subscriptions
  context.subscriptions.push(helloWorldCommand);
  context.subscriptions.push(showFindModelCommand);
  context.subscriptions.push(showLogSummaryCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {} 