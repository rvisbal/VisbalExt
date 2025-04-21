import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

export class GitHistoryView {
    private static currentPanel: GitHistoryView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private gitService: GitService
    ) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent([]);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'selectCommit':
                        this._updateDiffView(message.commitIndex);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _currentHistory: any[] = [];

    public static createOrShow(
        context: vscode.ExtensionContext,
        gitService: GitService,
        filePath: string,
        startLine: number,
        endLine: number
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (GitHistoryView.currentPanel) {
            GitHistoryView.currentPanel._panel.reveal(column);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'gitHistory',
                'Git History',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            GitHistoryView.currentPanel = new GitHistoryView(panel, gitService);
        }

        GitHistoryView.currentPanel.updateContent(filePath, startLine, endLine);
    }

    private async updateContent(filePath: string, startLine: number, endLine: number) {
        try {
            const history = await this.gitService.getHistoryForSelection(filePath, startLine, endLine);
            this._currentHistory = history;
            this._panel.webview.html = this._getWebviewContent(history);
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to get git history: ' + error.message);
        }
    }

    private _updateDiffView(commitIndex: number) {
        if (this._panel && this._currentHistory[commitIndex]) {
            this._panel.webview.postMessage({
                command: 'updateDiff',
                diff: this._parseDiff(this._currentHistory[commitIndex].diff)
            });
        }
    }

    private _getWebviewContent(history: any[]) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Git History</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    font-family: var(--vscode-font-family);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                .diff-view {
                    flex: 1;
                    overflow: auto;
                    display: none;
                    padding: 0;
                    background-color: var(--vscode-editor-background);
                }
                .diff-view.active {
                    display: block;
                }
                .commit-list {
                    height: 200px;
                    display: flex;
                    flex-direction: column;
                    border-top: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                }
                .list-header {
                    display: grid;
                    grid-template-columns: 100px 150px 150px 1fr;
                    gap: 10px;
                    padding: 8px 10px;
                    background-color: var(--vscode-editorGroupHeader-tabsBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-weight: bold;
                    color: var(--vscode-sideBarSectionHeader-foreground);
                    flex-shrink: 0;
                }
                .list-content {
                    overflow-y: auto;
                    flex: 1;
                }
                .commit-item {
                    padding: 8px 10px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: grid;
                    grid-template-columns: 100px 150px 150px 1fr;
                    gap: 10px;
                    align-items: center;
                }
                .commit-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .commit-item.selected {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    color: var(--vscode-list-activeSelectionForeground);
                }
                .commit-item.selected .commit-hash,
                .commit-item.selected .commit-date,
                .commit-item.selected .commit-author {
                    color: var(--vscode-list-activeSelectionForeground);
                }
                .commit-hash {
                    font-family: var(--vscode-editor-font-family);
                    color: var(--vscode-textPreformat-foreground);
                }
                .commit-date {
                    color: var(--vscode-descriptionForeground);
                }
                .commit-author {
                    color: var(--vscode-descriptionForeground);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .commit-message {
                    flex: 1;
                    padding-left: 1em;
                }
                .diff-container {
                    display: flex;
                    height: 100%;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
                .diff-side {
                    flex: 1;
                    overflow: auto;
                    border-right: 1px solid var(--vscode-panel-border);
                    position: relative;
                }
                .diff-side:last-child {
                    border-right: none;
                }
                .diff-header {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    padding: 5px 10px;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-descriptionForeground);
                }
                .diff-content {
                    padding: 0 10px;
                }
                .line {
                    display: flex;
                    min-height: 20px;
                    line-height: 20px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    white-space: pre;
                    padding: 1px 0;
                }
                .line:hover {
                    background-color: var(--vscode-editor-hoverHighlightBackground);
                }
                .line-number {
                    color: var(--vscode-editorLineNumber-foreground);
                    text-align: right;
                    padding-right: 1em;
                    min-width: 3em;
                    user-select: none;
                    opacity: 0.7;
                }
                .line-content {
                    flex: 1;
                    padding-left: 1em;
                }
                .addition {
                    background-color: var(--vscode-diffEditor-insertedLineBackground);
                }
                .addition:hover {
                    background-color: var(--vscode-diffEditor-insertedTextBackground);
                }
                .deletion {
                    background-color: var(--vscode-diffEditor-removedLineBackground);
                }
                .deletion:hover {
                    background-color: var(--vscode-diffEditor-removedTextBackground);
                }
            </style>
        </head>
        <body>
            <div id="diffView" class="diff-view">
                <div class="diff-container">
                    <div class="diff-side">
                        <div class="diff-header">Previous Version</div>
                        <div id="oldContent" class="diff-content"></div>
                    </div>
                    <div class="diff-side">
                        <div class="diff-header">Current Version</div>
                        <div id="newContent" class="diff-content"></div>
                    </div>
                </div>
            </div>
            <div class="commit-list">
                <div class="list-header">
                    <div>Version</div>
                    <div>Date</div>
                    <div>Author</div>
                    <div>Commit Message</div>
                </div>
                <div class="list-content">
                    ${history.map((commit, index) => `
                        <div class="commit-item" data-index="${index}" onclick="selectCommit(${index})">
                            <span class="commit-hash">${commit.hash.substring(0, 7)}</span>
                            <span class="commit-date">${new Date(commit.date).toLocaleString()}</span>
                            <span class="commit-author">${commit.author}</span>
                            <span class="commit-message">${commit.message}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let selectedIndex = -1;

                function selectCommit(index) {
                    // Update selection UI
                    if (selectedIndex >= 0) {
                        document.querySelector(\`[data-index="\${selectedIndex}"]\`)?.classList.remove('selected');
                    }
                    document.querySelector(\`[data-index="\${index}"]\`)?.classList.add('selected');
                    selectedIndex = index;

                    // Show diff view
                    document.getElementById('diffView').classList.add('active');

                    // Request diff update
                    vscode.postMessage({
                        command: 'selectCommit',
                        commitIndex: index
                    });
                }

                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateDiff':
                            updateDiffView(message.diff);
                            break;
                    }
                });

                function updateDiffView(diff) {
                    const oldContent = document.getElementById('oldContent');
                    const newContent = document.getElementById('newContent');
                    
                    oldContent.innerHTML = diff.old.map(line => \`
                        <div class="line \${line.type || ''}">
                            <span class="line-number">\${line.number || ' '}</span>
                            <span class="line-content">\${escapeHtml(line.content)}</span>
                        </div>
                    \`).join('');
                    
                    newContent.innerHTML = diff.new.map(line => \`
                        <div class="line \${line.type || ''}">
                            <span class="line-number">\${line.number || ' '}</span>
                            <span class="line-content">\${escapeHtml(line.content)}</span>
                        </div>
                    \`).join('');
                }

                function escapeHtml(unsafe) {
                    return unsafe
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
                }

                // Select the first commit by default
                if (${history.length} > 0) {
                    selectCommit(0);
                }
            </script>
        </body>
        </html>`;
    }

    private _parseDiff(diff: string): { old: Array<{content: string, type?: string, number?: number}>, new: Array<{content: string, type?: string, number?: number}> } {
        const lines = diff.split('\n');
        const result = {
            old: [] as Array<{content: string, type?: string, number?: number}>,
            new: [] as Array<{content: string, type?: string, number?: number}>
        };
        
        let oldLineNumber = 0;
        let newLineNumber = 0;
        let inHeader = true;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                inHeader = false;
                const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                if (match) {
                    oldLineNumber = parseInt(match[1]);
                    newLineNumber = parseInt(match[2]);
                }
                continue;
            }

            if (inHeader) continue;

            if (line.startsWith('-')) {
                result.old.push({
                    content: line.substring(1),
                    type: 'deletion',
                    number: oldLineNumber++
                });
                result.new.push({ content: '', number: undefined });
            } else if (line.startsWith('+')) {
                result.old.push({ content: '', number: undefined });
                result.new.push({
                    content: line.substring(1),
                    type: 'addition',
                    number: newLineNumber++
                });
            } else {
                result.old.push({
                    content: line,
                    number: oldLineNumber++
                });
                result.new.push({
                    content: line,
                    number: newLineNumber++
                });
            }
        }

        return result;
    }

    private _escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    public dispose() {
        GitHistoryView.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
} 