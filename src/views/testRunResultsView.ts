import * as vscode from 'vscode';

class TestItem extends vscode.TreeItem {
    private _status: 'running' | 'success' | 'failed' | 'pending' | 'downloading';

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' = 'pending',
        public readonly children: TestItem[] = []
    ) {
        super(label, collapsibleState);
        this._status = status;
        this.updateStatus(status);
    }

    get status(): 'running' | 'success' | 'failed' | 'pending' | 'downloading' {
        return this._status;
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

    // Helper method to check if all children have completed
    areAllChildrenComplete(): boolean {
        return this.children.every(child => 
            child.status === 'success' || child.status === 'failed'
        );
    }

    // Helper method to check if any children have failed
    hasFailedChildren(): boolean {
        return this.children.some(child => child.status === 'failed');
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
        console.log(`[VisbalExt.TestRunResultsProvider] getTreeItem called for: ${element.label} (${element.status})`);
        return element;
    }

    getChildren(element?: TestItem): Thenable<TestItem[]> {
        console.log(`[VisbalExt.TestRunResultsProvider] getChildren called for: ${element?.label || 'root'}`);
        if (!element) {
            const items = Array.from(this.testRuns.values());
            console.log(`[VisbalExt.TestRunResultsProvider] Returning ${items.length} root items`);
            return Promise.resolve(items);
        }
        console.log(`[VisbalExt.TestRunResultsProvider] Returning ${element.children.length} child items for ${element.label}`);
        return Promise.resolve(element.children);
    }

    private scheduleRefresh() {
        console.log('[VisbalExt.TestRunResultsProvider] Scheduling refresh');
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Fire immediate refresh
        this._onDidChangeTreeData.fire();

        // Schedule a follow-up refresh
        this.refreshTimer = setTimeout(() => {
            console.log('[VisbalExt.TestRunResultsProvider] Executing scheduled refresh');
            // Check if there are any pending updates
            if (this.pendingUpdates.size > 0) {
                console.log(`[VisbalExt.TestRunResultsProvider] Processing ${this.pendingUpdates.size} pending updates`);
                this.pendingUpdates.clear();
            }
            this._onDidChangeTreeData.fire();
            this.refreshTimer = undefined;
        }, 100);
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

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading') {
        const startTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Updating method status: ${className}.${methodName} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            const methodItem = classItem.children.find(m => m.label === methodName);
            if (methodItem) {
                console.log(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Found method item, updating status`);
                methodItem.updateStatus(status);

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
        const startTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] Clearing all test runs at ${new Date(startTime).toISOString()}`);
        
        this.testRuns.clear();
        this.pendingUpdates.clear();
        
        const endTime = Date.now();
        console.log(`[VisbalExt.TestRunResultsProvider] Test runs cleared in ${endTime - startTime}ms, scheduling refresh`);
        this.scheduleRefresh();
    }
}

export class TestRunResultsView {
    private provider: TestRunResultsProvider;
    private treeView: vscode.TreeView<TestItem>;

    constructor(context: vscode.ExtensionContext) {
        this.provider = new TestRunResultsProvider();
        this.treeView = vscode.window.createTreeView('testRunResults', {
            treeDataProvider: this.provider,
            showCollapseAll: true
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

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading') {
        this.provider.updateMethodStatus(className, methodName, status);
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'downloading') {
        this.provider.updateClassStatus(className, status);
    }

    clear() {
        this.provider.clear();
    }
} 