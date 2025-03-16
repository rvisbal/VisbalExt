import * as vscode from 'vscode';

export class LogTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly logId?: string,
        public readonly logData?: any
    ) {
        super(label, collapsibleState);
        
        if (logId) {
            this.tooltip = `Log ID: ${logId}`;
            this.description = new Date(logData.StartTime).toLocaleString();
            this.contextValue = 'logItem';
            
            // Add icons based on log status
            this.iconPath = new vscode.ThemeIcon(
                logData.Status === 'Success' ? 'check' : 'warning'
            );
        }
    }
}

export class LogTreeDataProvider implements vscode.TreeDataProvider<LogTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<LogTreeItem | undefined | null | void> = new vscode.EventEmitter<LogTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<LogTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private logs: any[] = []) {}

    getTreeItem(element: LogTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: LogTreeItem): Thenable<LogTreeItem[]> {
        if (!element) {
            // Root level - group logs by date
            const groupedLogs = this.groupLogsByDate(this.logs);
            return Promise.resolve(
                Object.entries(groupedLogs).map(([date, logs]) => 
                    new LogTreeItem(
                        date, 
                        vscode.TreeItemCollapsibleState.Collapsed,
                        undefined,
                        { count: logs.length }
                    )
                )
            );
        } else if (!element.logId) {
            // Date group - show logs for this date
            const date = element.label;
            const logsForDate = this.logs.filter(log => 
                new Date(log.StartTime).toDateString() === date
            );
            return Promise.resolve(
                logsForDate.map(log => 
                    new LogTreeItem(
                        `${log.Operation} - ${log.Status}`,
                        vscode.TreeItemCollapsibleState.None,
                        log.Id,
                        log
                    )
                )
            );
        }
        return Promise.resolve([]);
    }

    private groupLogsByDate(logs: any[]): { [key: string]: any[] } {
        return logs.reduce((groups: { [key: string]: any[] }, log) => {
            const date = new Date(log.StartTime).toDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(log);
            return groups;
        }, {});
    }

    refresh(logs: any[] = []): void {
        this.logs = logs;
        this._onDidChangeTreeData.fire();
    }
}

export class LogTreeView {
    private treeView: vscode.TreeView<LogTreeItem>;
    private treeDataProvider: LogTreeDataProvider;

    constructor(context: vscode.ExtensionContext) {
        this.treeDataProvider = new LogTreeDataProvider();
        this.treeView = vscode.window.createTreeView('logTreeView', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true
        });

        context.subscriptions.push(this.treeView);
    }

    refresh(logs: any[] = []): void {
        this.treeDataProvider.refresh(logs);
    }
} 