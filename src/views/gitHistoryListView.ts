import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { OrgUtils } from '../utils/orgUtils';

export class GitHistoryListView {
    private static currentPanel: GitHistoryListView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentHistory: any[] = [];
    private _currentFilePath: string = '';

    private constructor(
        panel: vscode.WebviewPanel,
        private gitService: GitService
    ) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent([]);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openDiff':
                        await this._openDiffView(message.commitIndex);
                        return;
                    case 'openCommitDiff':
                        await this._openCommitDiffView(message.currentIndex, message.previousIndex);
                        return;
                    case 'copyCommitHash':
                        if (this._currentHistory[message.commitIndex]) {
                            await vscode.env.clipboard.writeText(this._currentHistory[message.commitIndex].hash);
                            vscode.window.showInformationMessage('Commit hash copied to clipboard');
                        }
                        return;
                    case 'openCommitInBrowser':
                        await this._openCommitInBrowser(message.commitIndex);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Creates or shows the Git history list view
     */
    public static createOrShow(
        context: vscode.ExtensionContext,
        gitService: GitService,
        filePath: string,
        startLine?: number,
        endLine?: number
    ) {
        const column = vscode.ViewColumn.Two; // Open in a new column

        // If we already have a panel, dispose it and create a new one
        if (GitHistoryListView.currentPanel) {
            GitHistoryListView.currentPanel.dispose();
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'gitHistoryList',
            'Git History',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        // Create the panel instance
        GitHistoryListView.currentPanel = new GitHistoryListView(panel, gitService);

        // Update the content
        GitHistoryListView.currentPanel.updateContent(filePath, startLine, endLine);

        // Handle panel close
        panel.onDidDispose(() => {
            GitHistoryListView.currentPanel = undefined;
        }, null, context.subscriptions);
    }

    private async updateContent(filePath: string, startLine?: number, endLine?: number) {
        this._currentFilePath = filePath;
        
        try {
            // Get git history - always use selection if provided
            let history: any[];
            if (startLine !== undefined && endLine !== undefined) {
                history = await this.gitService.getHistoryForSelection(filePath, startLine, endLine);
            } else {
                history = await this.gitService.getHistoryForFile(filePath);
            }

            // Update the history date format to be YYYY-MM-DD HH:MM AM/PM (same as gitHistoryView.ts)
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

            OrgUtils.logDebug('[VisbalExt.GitHistoryListView] updateContent -- history length:', history.length);
            if (history.length > 0) {
                OrgUtils.logDebug('[VisbalExt.GitHistoryListView] updateContent -- first commit:', history[0]);
            }

            this._currentHistory = history;

            // Update the webview content
            this._panel.webview.html = this._getWebviewContent(history);

            // Update panel title
            const fileName = require('path').basename(filePath);
            const selectionText = startLine !== undefined && endLine !== undefined ? ` (lines ${startLine}-${endLine})` : '';
            this._panel.title = `Git History: ${fileName}${selectionText}`;

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitHistoryListView] updateContent -- Error:', error);
            vscode.window.showErrorMessage(`Failed to load git history: ${error.message}`);
            
            // Show error in webview
            this._panel.webview.html = this._getErrorWebviewContent(error.message);
        }
    }

    private async _openDiffView(commitIndex: number) {
        if (!this._currentHistory[commitIndex]) {
            return;
        }

        try {
            const selectedCommit = this._currentHistory[commitIndex];
            const fileName = require('path').basename(this._currentFilePath);
            
            // Get the parent commit hash first
            const parentCommitHash = await this.gitService.getParentCommitHash(selectedCommit.hash);
            
            // Get file content from the selected commit
            const commitFileContent = await this.gitService.getFileContentFromCommit(
                selectedCommit.hash, 
                this._currentFilePath
            );

            // Get file content from the parent commit (what it was before this change)
            let parentFileContent = '';
            let parentHashDisplay = 'initial';
            
            if (parentCommitHash) {
                try {
                    parentFileContent = await this.gitService.getFileContentFromCommit(
                        parentCommitHash, 
                        this._currentFilePath
                    );
                    parentHashDisplay = parentCommitHash.substring(0, 8);
                } catch (error) {
                    OrgUtils.logDebug('[VisbalExt.GitHistoryListView] _openDiffView -- File not found in parent commit, using empty content');
                    parentFileContent = '';
                }
            } else {
                // No parent commit (initial commit), use empty content
                parentFileContent = '';
            }

            // Create URIs for virtual documents
            const fileExtension = require('path').extname(this._currentFilePath);
            
            // Create virtual URIs that won't appear as untitled files
            const parentUri = vscode.Uri.parse(`git-diff:${fileName}-${parentHashDisplay}${fileExtension}`);
            const commitUri = vscode.Uri.parse(`git-diff:${fileName}-${selectedCommit.hash.substring(0, 8)}${fileExtension}`);

            // Register a text document content provider for these virtual URIs
            const provider = new class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    if (uri.path.includes(parentHashDisplay)) {
                        return parentFileContent;
                    } else if (uri.path.includes(selectedCommit.hash.substring(0, 8))) {
                        return commitFileContent;
                    }
                    return '';
                }
            };

            const registration = vscode.workspace.registerTextDocumentContentProvider('git-diff', provider);

            try {
                // Open diff view showing what changed in this commit (parent vs commit)
                await vscode.commands.executeCommand('vscode.diff', 
                    parentUri, 
                    commitUri, 
                    `${fileName}: ${parentHashDisplay} ↔ ${selectedCommit.hash.substring(0, 8)}`,
                    { 
                        preview: true,
                        preserveFocus: false 
                    }
                );
            } finally {
                // Clean up the provider after a short delay to allow the diff to load
                setTimeout(() => registration.dispose(), 1000);
            }

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitHistoryListView] _openDiffView -- Error:', error);
            vscode.window.showErrorMessage(`Failed to open diff view: ${error.message}`);
        }
    }

    private async _openCommitDiffView(currentIndex: number, previousIndex: number) {
        if (!this._currentHistory[currentIndex] || !this._currentHistory[previousIndex]) {
            return;
        }

        try {
            const currentCommit = this._currentHistory[currentIndex];
            const previousCommit = this._currentHistory[previousIndex];
            const fileName = require('path').basename(this._currentFilePath);
            
            // Get file content from both commits
            const currentFileContent = await this.gitService.getFileContentFromCommit(
                currentCommit.hash, 
                this._currentFilePath
            );

            const previousFileContent = await this.gitService.getFileContentFromCommit(
                previousCommit.hash, 
                this._currentFilePath
            );

            // Create URIs for virtual documents
            const fileExtension = require('path').extname(this._currentFilePath);
            
            // Create virtual URIs that won't appear as untitled files
            const previousUri = vscode.Uri.parse(`git-diff:${fileName}-${previousCommit.hash.substring(0, 8)}${fileExtension}`);
            const currentUri = vscode.Uri.parse(`git-diff:${fileName}-${currentCommit.hash.substring(0, 8)}${fileExtension}`);

            // Register a text document content provider for these virtual URIs
            const provider = new class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    if (uri.path.includes(previousCommit.hash.substring(0, 8))) {
                        return previousFileContent;
                    } else if (uri.path.includes(currentCommit.hash.substring(0, 8))) {
                        return currentFileContent;
                    }
                    return '';
                }
            };

            const registration = vscode.workspace.registerTextDocumentContentProvider('git-diff', provider);

            try {
                // Open diff view showing comparison between the two commits
                await vscode.commands.executeCommand('vscode.diff', 
                    previousUri, 
                    currentUri, 
                    `${fileName}: ${previousCommit.hash.substring(0, 8)} ↔ ${currentCommit.hash.substring(0, 8)}`,
                    { 
                        preview: true,
                        preserveFocus: false 
                    }
                );
            } finally {
                // Clean up the provider after a short delay to allow the diff to load
                setTimeout(() => registration.dispose(), 1000);
            }

        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitHistoryListView] _openCommitDiffView -- Error:', error);
            vscode.window.showErrorMessage(`Failed to open commit diff view: ${error.message}`);
        }
    }

    private async _openCommitInBrowser(commitIndex: number) {
        if (!this._currentHistory[commitIndex]) {
            return;
        }

        const commit = this._currentHistory[commitIndex];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders && workspaceFolders.length > 0) {
            try {
                const baseUrl = await OrgUtils.getBitbucketBaseUrl(workspaceFolders[0].uri.fsPath);
                if (baseUrl) {
                    const commitUrl = `${baseUrl}/commits/${commit.hash}`;
                    await vscode.env.openExternal(vscode.Uri.parse(commitUrl));
                } else {
                    vscode.window.showErrorMessage('Could not determine repository URL.');
                }
            } catch (error: any) {
                OrgUtils.logError('[VisbalExt.GitHistoryListView] _openCommitInBrowser -- Error:', error);
                vscode.window.showErrorMessage('Failed to open commit in browser.');
            }
        }
    }

    private _getWebviewContent(history: any[]): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git History</title>
    <style>
        :root {
            --vscode-editor-background: var(--vscode-editor-background);
            --vscode-editor-foreground: var(--vscode-editor-foreground);
            --vscode-list-hoverBackground: var(--vscode-list-hoverBackground);
            --vscode-list-activeSelectionBackground: var(--vscode-list-activeSelectionBackground);
            --vscode-list-activeSelectionForeground: var(--vscode-list-activeSelectionForeground);
            --vscode-button-background: var(--vscode-button-background);
            --vscode-button-foreground: var(--vscode-button-foreground);
            --vscode-button-hoverBackground: var(--vscode-button-hoverBackground);
            --vscode-input-background: var(--vscode-input-background);
            --vscode-input-border: var(--vscode-input-border);
            --vscode-table-columnBorder: var(--vscode-editorWidget-border, #454545);
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }

        .header {
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-table-columnBorder);
        }

        .header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        .filter-container {
            margin-bottom: 15px;
        }

        .filter-input {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-editor-foreground);
            padding: 8px 12px;
            width: 300px;
            border-radius: 3px;
            font-size: 13px;
        }

        .commits-table {
            width: 100%;
            border-collapse: collapse;
            background-color: var(--vscode-editor-background);
        }

        .commits-table th {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            border: 1px solid var(--vscode-table-columnBorder);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .commits-table td {
            padding: 10px 12px;
            border: 1px solid var(--vscode-table-columnBorder);
            vertical-align: top;
            font-size: 13px;
        }

        .commit-row {
            transition: background-color 0.2s ease;
            cursor: pointer;
        }

        .commit-row:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .commit-row:active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .commit-hash {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            color: #569cd6;
            background-color: rgba(86, 156, 214, 0.1);
            padding: 2px 6px;
            border-radius: 3px;
            display: inline-block;
            margin-right: 8px;
        }

        .commit-message {
            font-weight: 500;
            margin-bottom: 4px;
        }

        .commit-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #cccccc99);
            opacity: 0.8;
        }

        .commit-author {
            font-weight: 500;
            color: #4ec9b0;
        }

        .commit-date {
            color: #dcdcaa;
        }

        .actions-cell {
            white-space: nowrap;
        }

        .action-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            margin-right: 5px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            transition: background-color 0.2s ease;
        }

        .action-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .action-button:active {
            transform: translateY(1px);
        }

        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background-color: var(--vscode-button-background);
        }

        .action-button:disabled:hover {
            background-color: var(--vscode-button-background);
            transform: none;
        }

        .primary-button {
            background-color: #0e639c;
            color: white;
            font-weight: 500;
        }

        .primary-button:hover {
            background-color: #1177bb;
        }

        .secondary-button {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--vscode-button-foreground);
        }

        .no-commits {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .version-column {
            width: 120px;
        }

        .date-column {
            width: 150px;
        }

        .author-column {
            width: 120px;
        }

        .actions-column {
            width: 120px;
        }

        .message-column {
            min-width: 300px;
        }

        @media (max-width: 900px) {
            .author-column, .date-column {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Git History</h1>
        <div class="filter-container">
            <input type="text" id="filterInput" class="filter-input" placeholder="Filter commits by message, author, or hash..." />
        </div>
    </div>

    <div id="content">
        ${history.length === 0 ? 
            '<div class="no-commits">No git history found</div>' :
            this._generateCommitsTable(history)
        }
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function openDiff(commitIndex) {
            vscode.postMessage({
                command: 'openDiff',
                commitIndex: commitIndex
            });
        }

        function openCommitDiff(currentIndex, previousIndex) {
            vscode.postMessage({
                command: 'openCommitDiff',
                currentIndex: currentIndex,
                previousIndex: previousIndex
            });
        }

        function copyCommitHash(commitIndex) {
            vscode.postMessage({
                command: 'copyCommitHash',
                commitIndex: commitIndex
            });
        }

        function openCommitInBrowser(commitIndex) {
            vscode.postMessage({
                command: 'openCommitInBrowser',
                commitIndex: commitIndex
            });
        }

        // Filter functionality
        document.getElementById('filterInput').addEventListener('input', function(e) {
            const filter = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('.commit-row');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(filter)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });

        // Double-click to open diff
        document.addEventListener('DOMContentLoaded', function() {
            const rows = document.querySelectorAll('.commit-row');
            rows.forEach((row, index) => {
                row.addEventListener('dblclick', () => {
                    openDiff(parseInt(row.dataset.commitIndex));
                });
            });
        });
    </script>
</body>
</html>`;
    }

    private _generateCommitsTable(history: any[]): string {
        const rows = history.map((commit, index) => {
            const shortHash = commit.hash.substring(0, 8);
            const commitMessage = this._escapeHtml(commit.message || 'No message');
            const author = this._escapeHtml(commit.author || 'Unknown');
            const date = this._formatDate(commit.date);

            return `
                <tr class="commit-row" data-commit-index="${index}">
                    <td class="version-column">
                        <span class="commit-hash">${shortHash}</span>
                    </td>
                    <td class="date-column">
                        <span class="commit-date">${date}</span>
                    </td>
                    <td class="author-column">
                        <span class="commit-author">${author}</span>
                    </td>
                    <td class="message-column">
                        <div class="commit-message">${commitMessage}</div>
                    </td>
                    <td class="actions-column actions-cell">
                        <button class="action-button primary-button" onclick="openCommitDiff(${index}, ${index + 1})" title="Compare with previous commit" ${index + 1 >= history.length ? 'disabled' : ''}>
                            Diff
                        </button>
                        <button class="action-button secondary-button" onclick="copyCommitHash(${index})" title="Copy commit hash">
                            Copy
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="commits-table">
                <thead>
                    <tr>
                        <th class="version-column">Version</th>
                        <th class="date-column">Date</th>
                        <th class="author-column">Author</th>
                        <th class="message-column">Commit Message</th>
                        <th class="actions-column">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    private _getErrorWebviewContent(errorMessage: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git History - Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 40px;
            text-align: center;
        }
        .error-container {
            max-width: 600px;
            margin: 0 auto;
        }
        .error-icon {
            font-size: 48px;
            color: var(--vscode-errorForeground);
            margin-bottom: 20px;
        }
        .error-message {
            font-size: 16px;
            margin-bottom: 20px;
            color: var(--vscode-errorForeground);
        }
        .error-details {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            text-align: left;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-message">Failed to load Git history</div>
        <div class="error-details">${this._escapeHtml(errorMessage)}</div>
    </div>
</body>
</html>`;
    }

    private _formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateString;
        }
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
        GitHistoryListView.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

