import * as vscode from 'vscode';

export class TestItem extends vscode.TreeItem {
    private _status: 'running' | 'success' | 'failed' | 'pending' | 'downloading';
    private _logId?: string;
    private static downloadingLogs = new Set<string>();

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' = 'pending',
        public readonly children: TestItem[] = [],
        logId?: string
    ) {
        super(label, collapsibleState);
        this._status = status;
        this._logId = logId;
        this.updateStatus(status);
        
        // Remove contextValue to hide the icons
        this.contextValue = undefined;
        
        if (logId) {
            this.tooltip = `Log ID: ${logId}`;
            this.command = {
                title: 'View Log',
                command: 'visbal-ext.viewTestLog',
                arguments: [logId, label]
            };
        }
    }

    get status(): 'running' | 'success' | 'failed' | 'pending' | 'downloading' {
        return this._status;
    }

    get logId(): string | undefined {
        return this._logId;
    }

    set logId(value: string | undefined) {
        this._logId = value;
        if (value) {
            this.tooltip = `Log ID: ${value}`;
            this.command = {
                title: 'View Log',
                command: 'visbal-ext.viewTestLog',
                arguments: [value, this.label]
            };
        }
    }

    static isDownloading(logId: string): boolean {
        return TestItem.downloadingLogs.has(logId);
    }

    static setDownloading(logId: string, isDownloading: boolean) {
        if (isDownloading) {
            TestItem.downloadingLogs.add(logId);
        } else {
            TestItem.downloadingLogs.delete(logId);
        }
    }

    updateStatus(status: 'running' | 'success' | 'failed' | 'pending' | 'downloading') {
        this._status = status;
        switch (status) {
            case 'running':
                this.iconPath = new vscode.ThemeIcon('sync~spin');
                this.description = 'Running...';
                break;
            case 'downloading':
                this.iconPath = new vscode.ThemeIcon('cloud-download');
                this.description = 'Downloading log...';
                break;
            case 'success':
                this.iconPath = new vscode.ThemeIcon('pass-filled');
                this.description = 'Passed';
                break;
            case 'failed':
                this.iconPath = new vscode.ThemeIcon('error');
                this.description = 'Failed';
                break;
            case 'pending':
                this.iconPath = new vscode.ThemeIcon('circle-outline');
                this.description = 'Pending';
                break;
        }
    }

    // Helper method to check if any children have failed
    hasFailedChildren(): boolean {
        return this.children.some(child => child.status === 'failed');
    }

    // Helper method to check if all children are complete (success or failed)
    areAllChildrenComplete(): boolean {
        return this.children.every(child => 
            child.status === 'success' || child.status === 'failed'
        );
    }
}

export class TestRunResultsProvider implements vscode.TreeDataProvider<TestItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TestItem | undefined | null | void> = new vscode.EventEmitter<TestItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TestItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private testRuns: Map<string, TestItem> = new Map();
    private refreshTimer: NodeJS.Timeout | undefined;
    private pendingUpdates: Set<string> = new Set(); // Track pending updates
    private _view: vscode.TreeView<TestItem> | undefined;

    constructor() {
        console.log('[VisbalExt.TestRunResultsProvider] Initializing provider');
    }

    setTreeView(view: vscode.TreeView<TestItem>) {
        this._view = view;
    }

    getTreeItem(element: TestItem): vscode.TreeItem {
        // Remove contextValue to hide the icons
        element.contextValue = undefined;
        return element;
    }

    getChildren(element?: TestItem): TestItem[] {
        if (!element) {
            return Array.from(this.testRuns.values());
        }
        return element.children;
    }

    private scheduleRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        this.refreshTimer = setTimeout(() => {
            this._onDidChangeTreeData.fire();
            this.refreshTimer = undefined;
        }, 100); // Debounce updates
    }

    addTestRun(className: string, methods: string[]) {
        const startTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] Adding test run for class: ${className} with ${methods.length} methods at ${new Date(startTime).toISOString()}`);
        
        // Clear any existing test run for this class
        this.testRuns.delete(className);
        
        const methodItems = methods.map(method => {
            console.log(`[VisbalExt.TestRunResultsProvider] Creating method item: ${method}`);
            return new TestItem(
                method,
                vscode.TreeItemCollapsibleState.None,
                'pending'
            );
        });

        const classItem = new TestItem(
            className,
            vscode.TreeItemCollapsibleState.Expanded,
            'running',
            methodItems
        );

        this.testRuns.set(className, classItem);
        
        const endTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] Test run added in ${endTime - startTime}ms, scheduling refresh`);
        this.scheduleRefresh();

        // Reveal the new test run
        if (this._view) {
            this._view.reveal(classItem, { focus: true, select: true, expand: true });
        }
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading', logId?: string) {
        const startTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Updating method status: ${className}.${methodName} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            const methodItem = classItem.children.find(m => m.label === methodName);
            if (methodItem) {
                console.log(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Found method item, updating status`);
                methodItem.updateStatus(status);
                
                // Update logId if provided
                if (logId) {
                    methodItem.logId = logId;
                }

                // Track this update
                this.pendingUpdates.add(`${className}.${methodName}`);
                
                // Auto-update class status if all methods are complete
                if (classItem.areAllChildrenComplete()) {
                    const newStatus = classItem.hasFailedChildren() ? 'failed' : 'success';
                    console.log(`[VisbalExt.TestRunResultsProvider] Auto-updating class status to ${newStatus}`);
                    classItem.updateStatus(newStatus);
                }
                
                const endTime = Date.now();
                console.log(`[VisbalExt.TestRunResultsProvider] Method status updated in ${endTime - startTime}ms, scheduling refresh`);
                this.scheduleRefresh();

                // Reveal the updated method
                if (this._view) {
                    this._view.reveal(methodItem, { focus: true, select: true });
                }
            } else {
                console.warn(`[VisbalExt.TestRunResultsProvider] Method ${methodName} not found in class ${className}`);
            }
        } else {
            console.warn(`[VisbalExt.TestRunResultsProvider] Class ${className} not found in test runs`);
        }
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'downloading') {
        const startTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] updateClassStatus -- Updating class status: ${className} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            console.log(`[VisbalExt.TestRunResultsProvider] Found class item, updating status`);
            classItem.updateStatus(status);
            
            // Track this update
            this.pendingUpdates.add(className);
            
            const endTime = Date.now();
            console.log(`[VisbalExt.TestRunResultsProvider] Class status updated in ${endTime - startTime}ms, scheduling refresh`);
            this.scheduleRefresh();

            // Reveal the updated class
            if (this._view) {
                this._view.reveal(classItem, { focus: true, select: true });
            }
        } else {
            console.warn(`[VisbalExt.TestRunResultsProvider] Class ${className} not found in test runs`);
        }
    }

    clear() {
        this.testRuns.clear();
        this._onDidChangeTreeData.fire();
    }
}

export class TestRunResultsView {
    private provider: TestRunResultsProvider;
    private treeView: vscode.TreeView<TestItem>;

    constructor(context: vscode.ExtensionContext) {
        this.provider = new TestRunResultsProvider();
        this.treeView = vscode.window.createTreeView('testRunResults', {
            treeDataProvider: this.provider,
            showCollapseAll: true,
            canSelectMany: false
        });
        this.provider.setTreeView(this.treeView);
        context.subscriptions.push(this.treeView);
    }

    getProvider(): TestRunResultsProvider {
        return this.provider;
    }

    addTestRun(className: string, methods: string[]) {
        this.provider.addTestRun(className, methods);
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading', logId?: string) {
        this.provider.updateMethodStatus(className, methodName, status, logId);
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'downloading') {
        this.provider.updateClassStatus(className, status);
    }

    clear() {
        this.provider.clear();
    }
} 