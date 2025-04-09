import * as vscode from 'vscode';
import { OrgUtils } from '../utils/orgUtils';

export class TestItem extends vscode.TreeItem {
    private _status: 'running' | 'success' | 'failed' | 'pending' | 'downloading';
    private _logId?: string;
    private _error?: string;
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

    get error(): string | undefined {
        return this._error;
    }

    set error(value: string | undefined) {
        this._error = value;
        if (value) {
            this.tooltip = `Log ID: ${value}`;
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

    private testRuns = new Map<string, TestItem>();
    private refreshTimer: NodeJS.Timeout | undefined;
    private pendingUpdates: Set<string> = new Set(); // Track pending updates
    private _view?: vscode.TreeView<TestItem>;

    constructor() {
        OrgUtils.logDebug('[VisbalExt.TestRunResultsProvider] Initializing provider');
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
        OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] Adding test run for class: ${className} with ${methods.length} methods at ${new Date(startTime).toISOString()}`);
        
        // Clear any existing test run for this class
        this.testRuns.delete(className);
        
        const methodItems = methods.map(method => {
            OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] Creating method item: ${method}`);
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
        OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] Test run added in ${endTime - startTime}ms, scheduling refresh`);
        this.scheduleRefresh();

        // Reveal the new test run
        if (this._view) {
            this._view.reveal(classItem, { focus: true, select: true, expand: true });
        }
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading' | 'pending', logId?: string, error?: string) {
        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Updating method status: ${className}.${methodName} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            const methodItem = classItem.children.find(m => m.label === methodName);
            if (methodItem) {
                OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus -- Found method item, updating status`);
                methodItem.updateStatus(status);
                
                // Update logId if provided
                if (logId) {
                    methodItem.logId = logId;
                }

                if (error) {
                    methodItem.error = error;
                }

                // Track this update
                this.pendingUpdates.add(`${className}.${methodName}`);
                
                // Auto-update class status if all methods are complete
                if (classItem.areAllChildrenComplete()) {
                    const newStatus = classItem.hasFailedChildren() ? 'failed' : 'success';
                    OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus Auto-updating class status to ${newStatus}`);
                    classItem.updateStatus(newStatus);
                }
                
                const endTime = Date.now();
                OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus Method status updated in ${endTime - startTime}ms, scheduling refresh`);
                this.scheduleRefresh();

                // Reveal the updated method
                if (this._view) {
                    this._view.reveal(methodItem, { focus: true, select: true });
                }
            } else {
                OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus Method ${methodName} not found in class ${className}`);
            }
        } else {
            OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateMethodStatus Class ${className} not found in test runs`);
        }
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'downloading' | 'pending') {
        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateClassStatus -- Updating class status: ${className} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateClassStatus Found class item, updating status`);
            classItem.updateStatus(status);
            
            // Track this update
            this.pendingUpdates.add(className);
            
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateClassStatus Class status updated in ${endTime - startTime}ms, scheduling refresh`);
            this.scheduleRefresh();

            // Reveal the updated class
            if (this._view) {
                this._view.reveal(classItem, { focus: true, select: true });
            }
        } else {
            OrgUtils.logDebug(`[VisbalExt.TestRunResultsProvider] updateClassStatus Class ${className} not found in test runs`);
        }
    }

    clear() {
        this.testRuns.clear();
        this._onDidChangeTreeData.fire();
    }

    public getTestRuns(): Map<string, TestItem> {
        return this.testRuns;
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
    }

    getProvider(): TestRunResultsProvider {
        return this.provider;
    }

    addTestRun(className: string, methods: string[]) {
        this.provider.addTestRun(className, methods);
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'downloading' | 'pending', logId?: string, error?: string) {
        this.provider.updateMethodStatus(className, methodName, status, logId, error);
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'downloading' | 'pending') {
        this.provider.updateClassStatus(className, status);
    }

    clear() {
        this.provider.clear();
    }

    /**
     * Clears all test runs from the view
     */
    public clearResults() {
        // Clear the tree data provider which will automatically update the view
        this.provider.clear();
    }

    // Update rerunAllTests method
    public async rerunAllTests() {
        const testRuns = this.provider.getTestRuns();
        if (testRuns.size === 0) {
            vscode.window.showInformationMessage('No tests to rerun');
            return;
        }

        // Show loading message
        const loadingMessage = vscode.window.setStatusBarMessage('$(sync~spin) Rerunning tests...');

        try {
            // Convert the Map entries to an array for easier processing
            const tests = Array.from(testRuns.entries());

            if (tests.length === 1) {
                // Single test class scenario
                const [className, classItem] = tests[0];
                if (classItem.children.length === 1) {
                    // Single method in a single class
                    const methodName = classItem.children[0].label;
                    await vscode.commands.executeCommand('visbal-ext.testClassExplorerView.runTest', {
                        testClass: className,
                        testMethod: methodName
                    });
                } else {
                    // Multiple methods in a single class
                    await vscode.commands.executeCommand('visbal-ext.testClassExplorerView.runTest', {
                        testClass: className
                    });
                }
            } else {
                // Multiple test classes scenario
                const testClasses = {
                    classes: tests.map(([className]) => className),
                    methods: [],
                    runMode: 'sequential'
                };
                await vscode.commands.executeCommand('visbal-ext.testClassExplorerView.runSelectedTests', testClasses);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to rerun tests: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Clear the loading message
            loadingMessage.dispose();
        }
    }
} 