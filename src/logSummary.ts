import * as vscode from 'vscode';

/**
 * LogSummary class that provides functionality for summarizing log files
 */
export class LogSummary {
  private static panel: vscode.WebviewPanel | undefined;

  /**
   * Shows the log summary panel for the current log file
   * @param context The extension context
   */
  public static show(context: vscode.ExtensionContext): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor found');
      return;
    }

    // Check if the active file is a log file
    if (!editor.document.fileName.toLowerCase().endsWith('.log')) {
      vscode.window.showInformationMessage('The active file is not a log file');
      return;
    }

    // Get the log file name
    const logFileName = editor.document.fileName.split(/[\/\\]/).pop() || 'Log';

    // If we already have a panel, show it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(editor.document.getText());
      return;
    }

    // Create a new panel
    this.panel = vscode.window.createWebviewPanel(
      'logSummary',
      `Summary: ${logFileName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set the webview's initial HTML content
    this.updatePanel(editor.document.getText());

    // Reset when the panel is closed
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      context.subscriptions
    );
  }

  /**
   * Updates the panel with the log content
   * @param logContent The log content to display
   */
  private static updatePanel(logContent: string): void {
    if (!this.panel) {
      return;
    }

    // For now, just display a placeholder message
    // Later, you can implement actual log summarization logic here
    this.panel.webview.html = this.getWebviewContent(logContent);
  }

  /**
   * Returns the HTML content for the webview
   * @param logContent The log content to display
   */
  private static getWebviewContent(logContent: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Log Summary</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .container {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            h2 {
                margin-top: 0;
                color: var(--vscode-editor-foreground);
            }
            .summary-section {
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 15px;
                margin-bottom: 15px;
            }
            .placeholder {
                font-style: italic;
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Log Summary</h2>
            <div class="summary-section">
                <p class="placeholder">This is a placeholder for the log summary functionality.</p>
                <p class="placeholder">In the future, this panel will display a summary of the log file content.</p>
            </div>
        </div>
    </body>
    </html>`;
  }
} 