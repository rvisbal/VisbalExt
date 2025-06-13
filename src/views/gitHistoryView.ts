import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { OrgUtils } from '../utils/orgUtils';
import { WebviewUtils } from '../utils/webviewUtils';

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

    public static createOrShowForFile(
        context: vscode.ExtensionContext,
        gitService: GitService,
        filePath: string
    ) {
        // If we already have a panel, just update its content for the file
        if (GitHistoryView.currentPanel) {
            GitHistoryView.currentPanel.updateContentForFile(filePath);
            return;
        }

        // Create a new panel with specific options for floating modal behavior
        const panel = vscode.window.createWebviewPanel(
            'gitHistory',
            'Git History - ' + filePath.split(/[\\/]/).pop(),
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

        // Update the content for the entire file
        GitHistoryView.currentPanel.updateContentForFile(filePath);

        // Handle panel close
        panel.onDidDispose(() => {
            GitHistoryView.currentPanel = undefined;
        }, null, context.subscriptions);
    }

    private _showLoadingOverlay(message: string = 'Loading git history...') {
        this._panel.webview.html = `
            <html>
            <head>
                <style>
                    body { display: flex; align-items: center; justify-content: center; height: 100vh; background: var(--vscode-editor-background); }
                    .spinner { border: 4px solid #eee; border-top: 4px solid #0078d4; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    .msg { color: var(--vscode-editor-foreground); font-size: 1.2em; text-align: center; }
                </style>
            </head>
            <body>
                <div>
                    <div class="spinner"></div>
                    <div class="msg">${message}</div>
                </div>
            </body>
            </html>
        `;
    }

    private async updateContent(filePath: string, startLine: number, endLine: number) {
        try {
            this._showLoadingOverlay();
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
            OrgUtils.logDebug('[VisbalExt.GitHistoryView] updateContent -- history length:', history.length);
            if (history.length > 0) {
                OrgUtils.logDebug('[VisbalExt.GitHistoryView] updateContent -- first commit:', history[0]);
            }
            this._currentHistory = history;
            this._panel.webview.html = this._getWebviewContent(history);
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to get git history: ' + error.message);
        }
    }

    private async updateContentForFile(filePath: string) {
        try {
            this._showLoadingOverlay();
            const history = await this.gitService.getHistoryForFile(filePath);
            // Update the history date format to be YYYY-MM-DD HH:MM AM/PM
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
            OrgUtils.logDebug('[VisbalExt.GitHistoryView] updateContentForFile -- history length:', history.length);
            if (history.length > 0) {
                OrgUtils.logDebug('[VisbalExt.GitHistoryView] updateContentForFile -- first commit:', history[0]);
            }
            this._currentHistory = history;
            this._panel.webview.html = this._getWebviewContent(history);
            // Update the panel title to include the filename
            this._panel.title = 'Git History - ' + filePath.split(/[\\/]/).pop();
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to get git history for file: ' + error.message);
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
        // HTML TEMPLATE STRING
        // JavaScript/HTML section, type script rule dont apply in this block
        const html = `<!DOCTYPE html>
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
        .diff-container::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
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
        .diff-side::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
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
            overflow-y: auto;
            max-height: 60vh;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none;  /* IE and Edge */
        }
        .diff-content::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
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
        .omitted {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            background: var(--vscode-editor-background);
            border: none;
            opacity: 0.7;
            font-size: 1.1em;
            letter-spacing: 0.2em;
            user-select: none;
        }
        .line.omitted {
            min-height: 18px;
            line-height: 18px;
        }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px 4px 12px;
            background: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            z-index: 2;
        }
        .toolbar select, .toolbar button, .toolbar .dropdown {
            margin-right: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: var(--vscode-font-size);
            padding: 2px 8px;
        }
        .toolbar .dropdown {
            position: relative;
            display: inline-block;
        }
        .toolbar .dropdown-content {
            display: none;
            position: absolute;
            background: var(--vscode-editorWidget-background);
            min-width: 180px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-top: 2px;
        }
        .toolbar .dropdown.open .dropdown-content {
            display: block;
        }
        .toolbar .dropdown-content button, .toolbar .dropdown-content label {
            display: block;
            width: 100%;
            background: none;
            border: none;
            text-align: left;
            padding: 6px 12px;
            color: var(--vscode-editor-foreground);
            font-size: var(--vscode-font-size);
            cursor: pointer;
        }
        .toolbar .dropdown-content button.selected, .toolbar .dropdown-content label.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .toolbar .dropdown-content label {
            cursor: pointer;
        }
        .toolbar .codicon {
            font-family: 'codicon';
            font-size: 16px;
            vertical-align: middle;
        }
        .toolbar .sync-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--vscode-editor-foreground);
            font-size: 18px;
            margin-left: 4px;
        }
        .diff-container.side-by-side .diff-side {
            border-right: none !important;
        }
        .diff-container.side-by-side .diff-side:not(:last-child) {
            /* Remove divider for unified look */
            box-shadow: none !important;
        }
        .diff-container.side-by-side {
            /* Remove vertical divider */
            border: none !important;
        }
        .sync-btn.sync-on {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
        }
        .diff-side-right .diff-content {
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none;  /* IE and Edge */
        }
        .diff-side-right .diff-content::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
        }
        #oldContent, #newContent {
            scrollbar-width: none !important; /* Firefox */
            -ms-overflow-style: none !important;  /* IE and Edge */
        }
        #oldContent::-webkit-scrollbar, #newContent::-webkit-scrollbar {
            display: none !important; /* Chrome, Safari and Opera */
        }
        .diff-container, .diff-side {
            overflow: hidden !important;
        }
        #oldContent, #newContent, .diff-content {
            scrollbar-width: none !important; /* Firefox */
            -ms-overflow-style: none !important;
        }
        #oldContent::-webkit-scrollbar, #newContent::-webkit-scrollbar, .diff-content::-webkit-scrollbar {
            display: none !important; /* Chrome, Safari and Opera */
            width: 0 !important;
            background: transparent !important;
        }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vscode/codicons/dist/codicon.css">
</head>
<body>
    <div class="toolbar">
        <div class="dropdown" id="viewerDropdown">
            <button onclick="toggleDropdown('viewerDropdown')"><span class="codicon codicon-diff"></span> <span id="viewerLabel">Side-by-side viewer</span> <span class="codicon codicon-chevron-down"></span></button>
            <div class="dropdown-content">
                <button onclick="setViewer('side-by-side')" id="sideBySideBtn" class="selected">Side-by-side viewer</button>
                <button onclick="setViewer('unified')" id="unifiedBtn">Unified viewer</button>
            </div>
        </div>
        <div class="dropdown" id="whitespaceDropdown">
            <button onclick="toggleDropdown('whitespaceDropdown')"><span class="codicon codicon-filter"></span> <span id="whitespaceLabel">Do not ignore</span> <span class="codicon codicon-chevron-down"></span></button>
            <div class="dropdown-content">
                <button onclick="setWhitespace('none')" id="wsNone" class="selected">Do not ignore</button>
                <button onclick="setWhitespace('trim')" id="wsTrim">Trim whitespaces</button>
                <button onclick="setWhitespace('ignore')" id="wsIgnore">Ignore whitespaces</button>
                <button onclick="setWhitespace('ignore-empty')" id="wsIgnoreEmpty">Ignore whitespaces and empty lines</button>
            </div>
        </div>
        <div class="dropdown" id="highlightDropdown">
            <button onclick="toggleDropdown('highlightDropdown')"><span class="codicon codicon-symbol-color"></span> <span id="highlightLabel">Highlight characters</span> <span class="codicon codicon-chevron-down"></span></button>
            <div class="dropdown-content">
                <button onclick="setHighlight('lines')" id="hlLines">Highlight lines</button>
                <button onclick="setHighlight('words')" id="hlWords">Highlight words</button>
                <button onclick="setHighlight('split')" id="hlSplit">Highlight split changes</button>
                <button onclick="setHighlight('characters')" id="hlChars" class="selected">Highlight characters</button>
            </div>
        </div>
        <div class="dropdown" id="settingsDropdown">
            <button onclick="toggleDropdown('settingsDropdown')"><span class="codicon codicon-settings"></span></button>
            <div class="dropdown-content">
                <label><input type="checkbox" id="showWhitespaces"> Show Whitespaces</label>
                <label><input type="checkbox" id="showLineNumbers" checked> Show Line Numbers</label>
                <label><input type="checkbox" id="showIndentGuides"> Show Indent Guides</label>
                <label><input type="checkbox" id="softWrap"> Soft-Wrap</label>
                <div style="border-top:1px solid var(--vscode-panel-border);margin:4px 0;"></div>
                <label>Highlighting Level
                    <select id="highlightingLevel">
                        <option value="default">Default</option>
                        <option value="minimal">Minimal</option>
                        <option value="full">Full</option>
                    </select>
                </label>
                <label><input type="checkbox" id="breadcrumbs"> Breadcrumbs</label>
                <label><input type="checkbox" id="alignChanges"> Align Changes In Side-by-Side Diff</label>
            </div>
        </div>
        <button class="sync-btn sync-on" title="Synchronize Scrolling" id="syncScrollBtn" onclick="toggleSyncScroll()"><span class="codicon codicon-sync"></span></button>
    </div>
    <div id="diffView" class="diff-view">
        <div class="diff-container side-by-side" id="diffContainer">
            <div class="diff-side">
                <div class="diff-header">Previous Version</div>
                <div id="oldContent" class="diff-content"></div>
            </div>
            <div class="diff-side diff-side-right">
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
                document.querySelector(\`[data-index=\"\${selectedIndex}\"]\`)?.classList.remove('selected');
            }
            document.querySelector(\`[data-index=\"\${index}\"]\`)?.classList.add('selected');
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

        let syncScrollEnabled = true;
        let isSyncingScroll = false;
        function setSyncScroll(enabled) {
            visbalDebugLog('setSyncScroll');
            syncScrollEnabled = enabled;
            const btn = document.getElementById('syncScrollBtn');
            if (enabled) {
                btn.classList.add('sync-on');
            } else {
                btn.classList.remove('sync-on');
            }
        }
        function toggleSyncScroll() {
            setSyncScroll(!syncScrollEnabled);
        }
        function attachSyncScrollListeners() {
            visbalDebugLog('attachSyncScrollListeners');
            // Get the actual scrollable elements
            const oldContent = document.getElementById('oldContent');
            const newContent = document.getElementById('newContent');
            if (!oldContent || !newContent) return;

            // Remove previous listeners if any
            oldContent.onscroll = null;
            newContent.onscroll = null;

            let isSyncingScroll = false;

            oldContent.addEventListener('scroll', function() {
                visbalDebugLog('syncScrollHandler: oldContent');
                if (!syncScrollEnabled || isSyncingScroll) return;
                isSyncingScroll = true;
                newContent.scrollTop = oldContent.scrollTop;
                isSyncingScroll = false;
            });

            newContent.addEventListener('scroll', function() {
                visbalDebugLog('syncScrollHandler: newContent');
                if (!syncScrollEnabled || isSyncingScroll) return;
                isSyncingScroll = true;
                oldContent.scrollTop = newContent.scrollTop;
                isSyncingScroll = false;
            });
        }

        function updateDiffView(diff) {
            const oldContent = document.getElementById('oldContent');
            const newContent = document.getElementById('newContent');
            oldContent.innerHTML = diff.old.map(line => {
                if (line.isOmitted) {
                    return '<div class="line omitted"><span class="line-content omitted">...</span></div>';
                }
                return '<div class="line ' + (line.type || '') + '"><span class="line-number">' + (line.number || ' ') + '</span><span class="line-content">' + escapeHtml(line.content) + '</span></div>';
            }).join('');
            newContent.innerHTML = diff.new.map(line => {
                if (line.isOmitted) {
                    return '<div class="line omitted"><span class="line-content omitted">...</span></div>';
                }
                return '<div class="line ' + (line.type || '') + '"><span class="line-number">' + (line.number || ' ') + '</span><span class="line-content">' + escapeHtml(line.content) + '</span></div>';
            }).join('');
            attachSyncScrollListeners();
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

        // Dropdown logic
        function toggleDropdown(id) {
            document.querySelectorAll('.dropdown').forEach(el => {
                if (el.id !== id) el.classList.remove('open');
            });
            const el = document.getElementById(id);
            if (el) el.classList.toggle('open');
        }
        window.onclick = function(event) {
            if (!event.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown').forEach(el => el.classList.remove('open'));
            }
        };
        // Viewer mode
        function setViewer(mode) {
            document.getElementById('viewerLabel').textContent = mode === 'side-by-side' ? 'Side-by-side viewer' : 'Unified viewer';
            document.getElementById('diffContainer').className = 'diff-container ' + (mode === 'side-by-side' ? 'side-by-side' : 'unified');
            document.getElementById('sideBySideBtn').classList.toggle('selected', mode === 'side-by-side');
            document.getElementById('unifiedBtn').classList.toggle('selected', mode === 'unified');
            toggleDropdown('viewerDropdown');
        }
        // Whitespace
        function setWhitespace(mode) {
            const labels = {
                'none': 'Do not ignore',
                'trim': 'Trim whitespaces',
                'ignore': 'Ignore whitespaces',
                'ignore-empty': 'Ignore whitespaces and empty lines'
            };
            document.getElementById('whitespaceLabel').textContent = labels[mode];
            document.getElementById('wsNone').classList.toggle('selected', mode === 'none');
            document.getElementById('wsTrim').classList.toggle('selected', mode === 'trim');
            document.getElementById('wsIgnore').classList.toggle('selected', mode === 'ignore');
            document.getElementById('wsIgnoreEmpty').classList.toggle('selected', mode === 'ignore-empty');
            toggleDropdown('whitespaceDropdown');
        }
        // Highlight
        function setHighlight(mode) {
            const labels = {
                'lines': 'Highlight lines',
                'words': 'Highlight words',
                'split': 'Highlight split changes',
                'characters': 'Highlight characters'
            };
            document.getElementById('highlightLabel').textContent = labels[mode];
            document.getElementById('hlLines').classList.toggle('selected', mode === 'lines');
            document.getElementById('hlWords').classList.toggle('selected', mode === 'words');
            document.getElementById('hlSplit').classList.toggle('selected', mode === 'split');
            document.getElementById('hlChars').classList.toggle('selected', mode === 'characters');
            toggleDropdown('highlightDropdown');
        }
        // Settings
        document.getElementById('showWhitespaces').onchange = function() { /* implement */ };
        document.getElementById('showLineNumbers').onchange = function() { /* implement */ };
        document.getElementById('showIndentGuides').onchange = function() { /* implement */ };
        document.getElementById('softWrap').onchange = function() { /* implement */ };
        document.getElementById('highlightingLevel').onchange = function() { /* implement */ };
        document.getElementById('breadcrumbs').onchange = function() { /* implement */ };
        document.getElementById('alignChanges').onchange = function() { /* implement */ };
        // Call attachSyncScrollListeners on initial load in case diff is already rendered
        attachSyncScrollListeners();
    </script>
</body>
</html>`;
        //return html;
        return WebviewUtils.injectDebugBox(html);
    }

    private _parseDiff(diff: string): { old: Array<{content: string, type?: string, number?: number, isOmitted?: boolean}>, new: Array<{content: string, type?: string, number?: number, isOmitted?: boolean}> } {
        const lines = diff.split('\n');
        const result = {
            old: [] as Array<{content: string, type?: string, number?: number, isOmitted?: boolean}>,
            new: [] as Array<{content: string, type?: string, number?: number, isOmitted?: boolean}>
        };
        
        let oldLineNumber = 0;
        let newLineNumber = 0;
        let inHeader = true;
        let lastOldLine = 0;
        let lastNewLine = 0;
        let firstHunk = true;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                inHeader = false;
                const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                if (match) {
                    const nextOldLine = parseInt(match[1]);
                    const nextNewLine = parseInt(match[2]);
                    if (!firstHunk) {
                        // Insert omitted lines indicator if there is a gap
                        if (nextOldLine > oldLineNumber || nextNewLine > newLineNumber) {
                            result.old.push({ content: '...', isOmitted: true });
                            result.new.push({ content: '...', isOmitted: true });
                        }
                    }
                    oldLineNumber = nextOldLine;
                    newLineNumber = nextNewLine;
                    firstHunk = false;
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