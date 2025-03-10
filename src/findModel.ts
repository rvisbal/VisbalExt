import * as vscode from 'vscode';

/**
 * FindModel class that creates a webview panel with a text input and find button
 */
export class FindModel {
  private static panel: vscode.WebviewPanel | undefined;
  private static searchCallback: ((searchText: string) => void) | undefined;

  /**
   * Shows the find model panel
   * @param context The extension context
   * @param callback Function to call when the find button is clicked
   */
  public static show(context: vscode.ExtensionContext, callback: (searchText: string) => void): void {
    this.searchCallback = callback;

    // If we already have a panel, show it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create a new panel
    this.panel = vscode.window.createWebviewPanel(
      'findModel',
      'Find Text',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set the webview's HTML content
    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'find':
            if (this.searchCallback) {
              this.searchCallback(message.text);
            }
            return;
        }
      },
      undefined,
      context.subscriptions
    );

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
   * Returns the HTML content for the webview
   */
  private static getWebviewContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Find Text</title>
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
            input {
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
            }
            button {
                padding: 8px 16px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            h2 {
                margin-top: 0;
                color: var(--vscode-editor-foreground);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Find Text</h2>
            <input type="text" id="searchInput" placeholder="Enter text to find...">
            <button id="findButton">Find</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Add event listener to the find button
            document.getElementById('findButton').addEventListener('click', () => {
                const text = document.getElementById('searchInput').value;
                vscode.postMessage({
                    command: 'find',
                    text: text
                });
            });
            
            // Also trigger find on Enter key in the input field
            document.getElementById('searchInput').addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    const text = document.getElementById('searchInput').value;
                    vscode.postMessage({
                        command: 'find',
                        text: text
                    });
                }
            });
        </script>
    </body>
    </html>`;
  }
} 