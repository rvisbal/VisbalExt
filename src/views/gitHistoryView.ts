import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { OrgUtils } from '../utils/orgUtils';

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
                    case 'openCommitInBrowser':
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            OrgUtils.getBitbucketBaseUrl(workspaceFolders[0].uri.fsPath).then(baseUrl => {
                                if (baseUrl) {
                                    const commitUrl = `${baseUrl}/commits/${message.hash}`;
                                    vscode.env.openExternal(vscode.Uri.parse(commitUrl));
                                } else {
                                    vscode.window.showErrorMessage('Could not determine Bitbucket URL.');
                                }
                            });
                        }
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
        // If we already have a panel, just update its content
        if (GitHistoryView.currentPanel) {
            GitHistoryView.currentPanel.updateContent(filePath, startLine, endLine);
            return;
        }

        // Create a new panel with specific options for floating modal behavior
        const panel = vscode.window.createWebviewPanel(
            'gitHistory',
            'Git History',
            {
                viewColumn: vscode.ViewColumn.Active,
                preserveFocus: true
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        // Create the panel instance
        GitHistoryView.currentPanel = new GitHistoryView(panel, gitService);

        // Update the content
        GitHistoryView.currentPanel.updateContent(filePath, startLine, endLine);

        // Handle panel close
        panel.onDidDispose(() => {
            GitHistoryView.currentPanel = undefined;
        }, null, context.subscriptions);
    }

    private async updateContent(filePath: string, startLine: number, endLine: number) {
        try {
            const history = await this.gitService.getHistoryForSelection(filePath, startLine, endLine);
            //update the history date format to be YYYY-MM-DD HH:MM AM/PM
            history.forEach(commit => {
                const date = new Date(commit.date);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const time = date.toLocaleString('en-US', { 
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true 
                });
                commit.date = `${year}-${month}-${day} ${time}`;
            });
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
        //JavaScript/HTML section, type script rule dont apply in this block
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
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    -webkit-font-smoothing: antialiased;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    line-height: 1.4;
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
                    height: 250px;
                    min-height: 100px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    border-top: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-sideBar-background);
                    position: relative;
                    resize: vertical;
                    overflow: auto;
                }
                .list-header {
                    display: grid;
                    grid-template-columns: 100px 150px 150px 1fr;
                    gap: 10px;
                    padding: 8px 10px;
                    background-color: var(--vscode-editorGroupHeader-tabsBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-weight: 600;
                    color: var(--vscode-sideBarSectionHeader-foreground);
                    flex-shrink: 0;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    letter-spacing: 0.04em;
                    position: relative;
                    cursor: ns-resize;
                }
                .list-header:hover {
                    background-color: var(--vscode-editorGroupHeader-tabsBackground);
                    opacity: 0.9;
                }
                .list-header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: var(--vscode-focusBorder);
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .list-header:hover::before {
                    opacity: 1;
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
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    line-height: 1.4;
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
                    font-size: var(--vscode-editor-font-size);
                    color: var(--vscode-textPreformat-foreground);
                    font-weight: normal;
                }
                .commit-date, .commit-author {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-descriptionForeground);
                }
                .commit-message {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                }
                .diff-container {
                    display: flex;
                    height: 100%;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    background-color: var(--vscode-editor-background);
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
                    padding: 8px 12px;
                    background-color: var(--vscode-editorGroupHeader-tabsBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-descriptionForeground);
                    font-weight: 500;
                }
                .diff-content {
                    padding: 0;
                    font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .line {
                    display: flex;
                    min-height: 21px;
                    line-height: 21px;
                    font-family: inherit;
                    font-size: inherit;
                    white-space: pre;
                    width: 100%;
                    box-sizing: border-box;
                }
                .line:hover {
                    background-color: var(--vscode-editor-hoverHighlightBackground);
                }
                .line-number {
                    font-family: inherit;
                    font-size: inherit;
                    color: var(--vscode-editorLineNumber-foreground);
                    text-align: right;
                    padding: 0 1em;
                    min-width: 4ch;
                    background-color: var(--vscode-editor-background);
                    border-right: 1px solid var(--vscode-panel-border);
                    user-select: none;
                    opacity: 0.7;
                }
                .line-content {
                    padding: 0 0.5em;
                    font-family: inherit;
                    font-size: inherit;
                }
                .addition {
                    background-color: rgba(40, 200, 40, 0.15);
                }
                .addition:hover {
                    background-color: rgba(40, 200, 40, 0.25);
                }
                .deletion {
                    background-color: rgba(200, 40, 40, 0.15);
                }
                .deletion:hover {
                    background-color: rgba(200, 40, 40, 0.25);
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
                <div class="list-header" title="Drag to resize">
                    <div>Version</div>
                    <div>Date</div>
                    <div>Author</div>
                    <div>Commit Message</div>
                </div>
                <div class="list-content">
                    ${history.map((commit, index) => `
                        <div class="commit-item" data-index="${index}" onclick="selectCommit(${index})">
                            <span class="commit-hash" style="cursor:pointer;text-decoration:underline;" title="Open in Bitbucket" onclick="event.stopPropagation(); openCommitInBrowser('${commit.hash}')">${commit.hash.substring(0, 7)}</span>
                            <span class="commit-date">${commit.date}</span>
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

                function openCommitInBrowser(hash) {
                    vscode.postMessage({
                        command: 'openCommitInBrowser',
                        hash: hash
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

                // Add resize functionality
                const resizer = document.querySelector('.list-header');
                const commitList = document.querySelector('.commit-list');

                let startY = 0;
                let startHeight = 0;

                function initResize(e) {
                    e.preventDefault(); // Prevent text selection while dragging
                    startY = e.clientY;
                    startHeight = parseInt(document.defaultView?.getComputedStyle(commitList).height || '250', 10);
                    
                    document.documentElement.addEventListener('mousemove', resize);
                    document.documentElement.addEventListener('mouseup', stopResize);
                }

                function resize(e) {
                    const newHeight = startHeight - (e.clientY - startY);
                    if (commitList && newHeight >= 100 && newHeight <= window.innerHeight * 0.8) {
                        commitList.style.height = newHeight + 'px';
                    }
                }

                function stopResize() {
                    document.documentElement.removeEventListener('mousemove', resize);
                    document.documentElement.removeEventListener('mouseup', stopResize);
                }

                if (resizer) {
                    resizer.addEventListener('mousedown', initResize);
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