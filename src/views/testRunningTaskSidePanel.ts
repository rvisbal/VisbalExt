import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgUtils } from '../utils/orgUtils';

//@description: TestItem is a class that represents a test item in the test run results view or RUNNING TASK view
export class TestItem extends vscode.TreeItem {
    private _status: any = 'pending';
    private _logId?: string;
    private _error?: string;
    private static downloadingLogs = new Set<string>();

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted' = 'pending',
        public readonly children: TestItem[] = [],
        logId?: string,
        public readonly className?: string
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
        } else if (className && collapsibleState === vscode.TreeItemCollapsibleState.None) {
            // If no log ID but we have class name and this is a method (not a class), set up command to open test file
            this.command = {
                title: 'Open Test File',
                command: 'visbal-ext.openTestFile',
                arguments: [className, label] // label is the method name
            };
        }
    }

    get status(): 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted' {
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

    updateStatus(status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted') {
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
                // Check if the error indicates the method doesn't exist
                if (this._error && this._error.includes('does not exist')) {
                    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
                    this.description = 'Method not found';
                } else {
                    this.iconPath = new vscode.ThemeIcon('error');
                    this.description = 'Failed';
                }
                break;
            case 'aborted':
                this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsErrorIcon.foreground'));
                this.description = 'Aborted';
                break;
            case 'pending':
                this.iconPath = new vscode.ThemeIcon('circle-outline');
                this.description = 'Pending';
                break;
            case 'skipped':
                this.iconPath = new vscode.ThemeIcon('circle-slash');
                this.description = 'Skipped';
                break;
        }
    }

    // Helper method to check if any children have failed
    hasFailedChildren(): boolean {
        return this.children.some(child => child.status === 'failed');
    }

    // Helper method to check if any children have been skipped
    hasSkippedChildren(): boolean {
        return this.children.some(child => child.status === 'skipped');
    }

    // Helper method to check if any children have been aborted
    hasAbortedChildren(): boolean {
        return this.children.some(child => child.status === 'aborted');
    }

    // Helper method to check if all children are complete (success, failed, skipped, or aborted)
    areAllChildrenComplete(): boolean {
        return this.children.every(child => 
            child.status === 'success' || 
            child.status === 'failed' || 
            child.status === 'skipped' ||
            child.status === 'aborted'
        );
    }
}

export class TestRunningTaskProvider implements vscode.TreeDataProvider<TestItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TestItem | undefined | null | void> = new vscode.EventEmitter<TestItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TestItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private testRuns = new Map<string, TestItem>();
    private refreshTimer: NodeJS.Timeout | undefined;
    private pendingUpdates: Set<string> = new Set(); // Track pending updates
    private _view?: vscode.TreeView<TestItem>;
    private _isAborted: boolean = false; // Track if tests have been aborted
    
    // Status update callback for Test Classes webview synchronization
    private _statusUpdateCallback?: (className: string, methodName: string, status: string, logId?: string, error?: string) => void;
    
    // Batch processing for performance
    private batchTimer: NodeJS.Timeout | undefined;
    private pendingTestRuns: Map<string, string[]> = new Map();
    private statusUpdateQueue: Array<{className: string, methodName: string, status: string, apexLogId?: string, message?: string, timestamp: number}> = [];

    constructor() {
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] constructor -- Initializing Test Running Task Provider');
    }

    setTreeView(view: vscode.TreeView<TestItem>) {
        this._view = view;
    }

    setStatusUpdateCallback(callback: (className: string, methodName: string, status: string, logId?: string, error?: string) => void) {
        this._statusUpdateCallback = callback;
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] setStatusUpdateCallback -- Status update callback set for Test Classes webview synchronization');
    }

    getTreeItem(element: TestItem): vscode.TreeItem {
        // Remove contextValue to hide the icons
        element.contextValue = undefined;
        return element;
    }

    getChildren(element?: TestItem): TestItem[] {
        if (!element) {
            // Sort test runs alphabetically by class name
            return Array.from(this.testRuns.values()).sort((a, b) => 
                a.label.localeCompare(b.label)
            );
        }
        // Sort methods alphabetically within each class
        return element.children.sort((a, b) => 
            a.label.localeCompare(b.label)
        );
    }

    private scheduleRefresh(immediate: boolean = false) {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        if (immediate) {
            this._onDidChangeTreeData.fire();
            this.refreshTimer = undefined;
            return;
        }

        this.refreshTimer = setTimeout(() => {
            this._onDidChangeTreeData.fire();
            this.refreshTimer = undefined;
        }, 100); // Debounce updates
    }

    // Batch processing methods for performance
    addTestRunBatch(className: string, methods: string[]) {
        // Don't add new test runs if tests have been aborted
        if (this._isAborted) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Ignoring addTestRunBatch for ${className} - tests have been aborted`);
            return;
        }

        // Queue the test run for batch processing
        this.pendingTestRuns.set(className, methods);
        this.scheduleBatchProcessing();
    }

    private scheduleBatchProcessing(): void {
        // Clear existing timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }

        // Schedule batch processing with 200ms debounce
        this.batchTimer = setTimeout(() => {
            this.processBatchedTestRuns();
        }, 200);
    }

    private processBatchedTestRuns(): void {
        if (this.pendingTestRuns.size === 0) {
            return;
        }

        // Clear any existing batch timer since we're processing now
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }

        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] processBatchedTestRuns -- Processing ${this.pendingTestRuns.size} batched test runs`);

        // Process all pending test runs in one go
        for (const [className, methods] of this.pendingTestRuns) {
            this.addTestRunInternal(className, methods);
        }

        // Clear the pending runs
        this.pendingTestRuns.clear();

        const endTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] processBatchedTestRuns -- Completed batch processing in ${endTime - startTime}ms`);

        // Trigger a single refresh for all changes
        this.scheduleRefresh(true);
    }

    addTestRun(className: string, methods: string[]) {
        // Use batch processing for better performance
        this.addTestRunBatch(className, methods);
    }

    addTestRunImmediate(className: string, methods: string[]) {
        // Add test run immediately without batch processing
        // This is used when we need immediate access to the test runs
        this.addTestRunInternal(className, methods);
    }

    flushPendingTestRuns(): void {
        // Immediately process any pending test runs
        if (this.pendingTestRuns.size > 0) {
            this.processBatchedTestRuns();
        }
    }

    private addTestRunInternal(className: string, methods: string[]) {
        // Don't add new test runs if tests have been aborted
        if (this._isAborted) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Ignoring addTestRun for ${className} - tests have been aborted`);
            return;
        }

        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Adding test run for class: ${className} with ${methods.length} methods at ${new Date(startTime).toISOString()}`);
        
        let existingMethodItems: TestItem[] = [];
        const existingClassItem = this.testRuns.get(className);
        if (existingClassItem) {
            // Preserve existing method items with their statuses
            existingMethodItems = existingClassItem.children;
        }
        
        // Filter out empty method names
        const validMethods = methods.filter(method => method && method.trim() !== '');
        
        // Create a map of existing methods by name for quick lookup
        const existingMethodMap = new Map<string, TestItem>();
        existingMethodItems.forEach(item => {
            existingMethodMap.set(item.label, item);
        });
        
        // Build the final list of method items, preserving existing statuses
        const methodItems: TestItem[] = [];
        const allMethodNames = new Set([...existingMethodItems.map(item => item.label), ...validMethods]);
        
        for (const methodName of allMethodNames) {
            const existingItem = existingMethodMap.get(methodName);
            if (existingItem) {
                // Preserve existing item with its current status
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Preserving existing method: ${methodName} with status: ${existingItem.status}`);
                methodItems.push(existingItem);
            } else {
                // Create new item for new methods
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Creating new method item: ${methodName}`);
                const newItem = new TestItem(
                    methodName,
                    vscode.TreeItemCollapsibleState.None,
                    'pending',
                    [],
                    undefined,
                    className
                );
                methodItems.push(newItem);
            }
        }

        // Determine class status based on method statuses
        let classStatus: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted' = 'running';
        const hasRunning = methodItems.some(item => item.status === 'running');
        const hasPending = methodItems.some(item => item.status === 'pending');
        const hasFailed = methodItems.some(item => item.status === 'failed');
        const hasAborted = methodItems.some(item => item.status === 'aborted');
        const allSuccess = methodItems.length > 0 && methodItems.every(item => item.status === 'success');
        
        if (hasFailed) {
            classStatus = 'failed';
        } else if (hasAborted) {
            classStatus = 'aborted';
        } else if (allSuccess) {
            classStatus = 'success';
        } else if (hasRunning || hasPending) {
            classStatus = 'running';
        }

        const classItem = new TestItem(
            className,
            vscode.TreeItemCollapsibleState.Expanded,
            classStatus,
            methodItems
        );

        this.testRuns.set(className, classItem);
        
        const endTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Test run added in ${endTime - startTime}ms, scheduling refresh`);
        this.scheduleRefresh(true); // Force immediate refresh for new test runs

        // Reveal the new test run
        if (this._view) {
            this._view.reveal(classItem, { focus: true, select: true, expand: true });
        }
    }

    /*
        @description: Add a single method to the test run
        @param className: The name of the class to add the method to
        @param methodName: The name of the method to add
    */
    addSingleMethod(className: string, methodName: string) {
        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] addSingleMethod -- Adding single method: ${className}.${methodName} at ${new Date(startTime).toISOString()}`);
        
        const validMethod = methodName != undefined && methodName != '';
        
        if (!this.testRuns.has(className)) {
            // If class doesn't exist, create it with the new method
            this.addTestRun(className, validMethod ? [methodName] : []);
        } else if (validMethod) {
            // If class exists and method is valid, append the method if it doesn't already exist
            const classItem = this.testRuns.get(className)!;
            const methodExists = classItem.children.some(child => child.label === methodName);
            
            if (!methodExists) {
                classItem.children.push(new TestItem(methodName, vscode.TreeItemCollapsibleState.None, 'pending'));
                this.scheduleRefresh(true); // Force immediate refresh when adding new method
            }
        }
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted', logId?: string, error?: string) {
        // Don't update method status if tests have been aborted
        if (this._isAborted) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] Ignoring updateMethodStatus for ${className}.${methodName} - tests have been aborted`);
            return;
        }

        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus -- Updating method status: ${className}.${methodName} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        let classItem = this.testRuns.get(className);
        
        // If class is not found, check if there are pending test runs and flush them
        if (!classItem && this.pendingTestRuns.size > 0) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus -- Class ${className} not found, flushing pending test runs`);
            this.flushPendingTestRuns();
            classItem = this.testRuns.get(className);
        }

        // If class is still not found, create it with the method to prevent status loss
        if (!classItem) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus -- Class ${className} still not found, creating it with method ${methodName}`);
            this.addTestRunInternal(className, [methodName]);
            classItem = this.testRuns.get(className);
        }
        
        if (classItem) {
            let methodItem = classItem.children.find(m => m.label === methodName);
            
            // If method is not found, add it to the class
            if (!methodItem) {
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus -- Method ${methodName} not found in class ${className}, adding it`);
                methodItem = new TestItem(methodName, vscode.TreeItemCollapsibleState.None, 'pending');
                classItem.children.push(methodItem);
                this.scheduleRefresh(true);
            }
            
            if (methodItem) {
                // Determine final status based on error message if provided
                let finalStatus = status;
                if (error && error.includes('does not exist')) {
                    finalStatus = 'failed';
                }
                
                methodItem.updateStatus(finalStatus);
                
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
                    let newStatus: 'success' | 'failed' | 'skipped' | 'aborted';
                    if (classItem.hasFailedChildren()) {
                        newStatus = 'failed';
                    } else if (classItem.hasAbortedChildren()) {
                        newStatus = 'aborted';
                    } else if (classItem.hasSkippedChildren()) {
                        newStatus = 'skipped';
                    } else {
                        newStatus = 'success';
                    }
                    
                    OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus updating class status to ${newStatus} on ${className}.${methodName}`);
                    classItem.updateStatus(newStatus);
                    
                    if (newStatus === 'failed') {
                        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus selectTestMethod -- className:${className} -- methodName:${methodName}`);
                        OrgUtils.selectTestMethod(className, methodName);
                    }
                }
                
                const endTime = Date.now();
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus Method status updated in ${endTime - startTime}ms, scheduling refresh on ${className}.${methodName}`);
                this.scheduleRefresh();

                // Notify Test Classes webview of status update
                if (this._statusUpdateCallback) {
                    this._statusUpdateCallback(className, methodName, finalStatus, logId, error);
                }

                // Reveal the updated method
                if (this._view) {
                    this._view.reveal(methodItem, { focus: true, select: true });
                }
            } else {
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus Method ${methodName} not found in class ${className}`);
            }
        } else {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateMethodStatus Class ${className} not found in test runs`);
        }
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted') {
        const startTime = Date.now();
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateClassStatus -- Updating class status: ${className} -> ${status} at ${new Date(startTime).toISOString()}`);
        
        const classItem = this.testRuns.get(className);
        if (classItem) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateClassStatus Found class item, updating status`);
            classItem.updateStatus(status);
            
            // Track this update
            this.pendingUpdates.add(className);
            
            const endTime = Date.now();
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateClassStatus Class status updated in ${endTime - startTime}ms, scheduling refresh`);
            this.scheduleRefresh();

            // Reveal the updated class
            if (this._view) {
                this._view.reveal(classItem, { focus: true, select: true });
            }
        } else {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] updateClassStatus Class ${className} not found in test runs`);
        }
    }

    clear() {
        this.testRuns.clear();
        
        // Clear the abort state to allow new test runs
        this.clearAborted();
        
        this._onDidChangeTreeData.fire();
    }

    clearRunningStates() {
        let clearedCount = 0;
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Starting to clear stale running states');
        
        for (const [className, classItem] of this.testRuns) {
            if (classItem.status === 'running') {
                // Check if all children are complete but class is still running
                if (classItem.areAllChildrenComplete()) {
                    // Determine final status based on children
                    let newStatus: 'success' | 'failed' | 'skipped';
                    if (classItem.hasFailedChildren()) {
                        newStatus = 'failed';
                    } else if (classItem.hasSkippedChildren()) {
                        newStatus = 'skipped';
                    } else {
                        newStatus = 'success';
                    }
                    
                    classItem.updateStatus(newStatus);
                    clearedCount++;
                    OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Updated ${className} from running to ${newStatus}`);
                } else {
                    // Class has running methods, mark them as completed (assuming they're stuck)
                    for (const child of classItem.children) {
                        if (child.status === 'running') {
                            child.updateStatus('success'); // Default to success for stale running tests
                            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Updated ${className}.${child.label} from running to success`);
                        }
                    }
                    
                    // Update class status after fixing children
                    if (classItem.areAllChildrenComplete()) {
                        classItem.updateStatus(classItem.hasFailedChildren() ? 'failed' : 'success');
                        clearedCount++;
                        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Updated ${className} after fixing children`);
                    }
                }
            } else {
                // Check individual methods that might be stuck in running state
                for (const child of classItem.children) {
                    if (child.status === 'running') {
                        child.updateStatus('success'); // Default to success for stale running tests
                        clearedCount++;
                        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Updated method ${className}.${child.label} from running to success`);
                    }
                }
            }
        }
        
        if (clearedCount > 0) {
            OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] clearRunningStates -- Cleared ${clearedCount} stale running states`);
            this._onDidChangeTreeData.fire();
            return clearedCount;
        } else {
            OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] clearRunningStates -- No stale running states found');
            return 0;
        }
    }

    /**
     * Selectively reset status of specific test methods to 'pending' while preserving others
     * @param testsToReset Array of {className, methodName} objects to reset
     */
    resetSelectedTests(testsToReset: { className: string, methodName: string }[]) {
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] resetSelectedTests -- Resetting ${testsToReset.length} specific tests`);
        
        for (const { className, methodName } of testsToReset) {
            const classItem = this.testRuns.get(className);
            if (classItem) {
                const methodItem = classItem.children.find(child => child.label === methodName);
                if (methodItem) {
                    methodItem.updateStatus('pending');
                    // Clear any previous log ID and error
                    methodItem.logId = undefined;
                    methodItem.error = undefined;
                    OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] resetSelectedTests -- Reset ${className}.${methodName} to pending`);
                }
            }
        }
        
        this._onDidChangeTreeData.fire();
    }

    /**
     * Reset status of all methods in specific classes to 'pending' while preserving other classes
     * @param classesToReset Array of class names to reset all methods for
     */
    resetSelectedClasses(classesToReset: string[]) {
        OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] resetSelectedClasses -- Resetting ${classesToReset.length} classes`);
        
        for (const className of classesToReset) {
            const classItem = this.testRuns.get(className);
            if (classItem) {
                // Reset all methods in this class
                classItem.children.forEach(methodItem => {
                    methodItem.updateStatus('pending');
                    methodItem.logId = undefined;
                    methodItem.error = undefined;
                });
                // Reset class status too
                classItem.updateStatus('pending');
                OrgUtils.logDebug(`[VisbalExt.TestRunningTaskProvider] resetSelectedClasses -- Reset class ${className} and all its methods`);
            }
        }
        
        this._onDidChangeTreeData.fire();
    }

    public getTestRuns(): Map<string, TestItem> {
        return this.testRuns;
    }

    /**
     * Set the abort state to prevent further test run additions
     */
    public setAborted() {
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] Setting aborted state - no more test runs will be added');
        this._isAborted = true;
    }

    /**
     * Clear the abort state to allow new test runs
     */
    public clearAborted() {
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskProvider] Clearing aborted state - test runs can be added again');
        this._isAborted = false;
    }
}

export class TestRunningTaskView {
    private provider: TestRunningTaskProvider;
    private treeView: vscode.TreeView<TestItem>;
    private testSummaryView?: any; // Reference to TestSummaryView for accessing detailed error data

    constructor(context: vscode.ExtensionContext) {
        this.provider = new TestRunningTaskProvider();
        this.treeView = vscode.window.createTreeView('testRunResults', {
            treeDataProvider: this.provider,
            showCollapseAll: true,
            canSelectMany: false
        });
        this.provider.setTreeView(this.treeView);
    }

    /**
     * Sets the reference to TestSummaryView for accessing detailed error information
     * @param testSummaryView Reference to the TestSummaryView instance
     */
    public setTestSummaryView(testSummaryView: any) {
        this.testSummaryView = testSummaryView;
    }

    getProvider(): TestRunningTaskProvider {
        return this.provider;
    }

    addTestRun(className: string, methods: string[]) {
        this.provider.addTestRun(className, methods);
    }

    addTestRunImmediate(className: string, methods: string[]) {
        this.provider.addTestRunImmediate(className, methods);
    }

    flushPendingTestRuns(): void {
        this.provider.flushPendingTestRuns();
    }

    setStatusUpdateCallback(callback: (className: string, methodName: string, status: string, logId?: string, error?: string) => void) {
        this.provider.setStatusUpdateCallback(callback);
    }

    updateMethodStatus(className: string, methodName: string, status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted', logId?: string, error?: string) {
        this.provider.updateMethodStatus(className, methodName, status, logId, error);
    }

    updateClassStatus(className: string, status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted') {
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

    /**
     * Selectively reset status of specific test methods to 'pending' while preserving others
     * @param testsToReset Array of {className, methodName} objects to reset
     */
    public resetSelectedTests(testsToReset: { className: string, methodName: string }[]) {
        this.provider.resetSelectedTests(testsToReset);
    }

    /**
     * Reset status of all methods in specific classes to 'pending' while preserving other classes
     * @param classesToReset Array of class names to reset all methods for
     */
    public resetSelectedClasses(classesToReset: string[]) {
        this.provider.resetSelectedClasses(classesToReset);
    }

    // Update rerunAllTests method
    public async rerunAllTests() {
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskView] rerunAllTests -- Starting rerun of all tests');
        const testRuns = this.provider.getTestRuns();
        OrgUtils.logDebug('[VisbalExt.TestRunningTaskView] rerunAllTests -- testRuns', testRuns);
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

    public addSingleMethod(className: string, methodName: string) {
        this.provider.addTestRun(className, [methodName]);
    }

    /**
     * Exports all test results to a text file and opens it in Cursor IDE
     */
    public async exportTestResults() {
        try {
            OrgUtils.logDebug('[VisbalExt.TestRunningTaskView] exportTestResults -- Starting export of test results');
            
            const testRuns = this.provider.getTestRuns();
            
            if (testRuns.size === 0) {
                vscode.window.showInformationMessage('No test results to export');
                return;
            }

            // Generate the report content
            const reportContent = this.generateTestResultsReport(testRuns);
            
            // Get workspace folder path
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }
            
            const workspacePath = workspaceFolders[0].uri.fsPath;
            
            // Create .visbal/logs directory if it doesn't exist
            const visbalLogsDir = path.join(workspacePath, '.visbal', 'logs');
            if (!fs.existsSync(visbalLogsDir)) {
                await fs.promises.mkdir(visbalLogsDir, { recursive: true });
                OrgUtils.logDebug('[VisbalExt.TestRunningTaskView] exportTestResults -- Created .visbal/logs directory');
            }
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
            const dateStr = timestamp[0];
            const timeStr = timestamp[1].split('-').slice(0, 3).join('-'); // HH-MM-SS
            const filename = `test-results-${dateStr}-${timeStr}.txt`;
            const filePath = path.join(visbalLogsDir, filename);
            
            // Write the file
            await fs.promises.writeFile(filePath, reportContent, 'utf8');
            
            // Open the file in Cursor IDE
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
            
            vscode.window.showInformationMessage(`Test results exported to .visbal/logs/${filename}`);
            OrgUtils.logDebug('[VisbalExt.TestRunningTaskView] exportTestResults -- Export completed successfully');
            
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            OrgUtils.logError('[VisbalExt.TestRunningTaskView] exportTestResults -- Error exporting test results:', error);
            vscode.window.showErrorMessage(`Failed to export test results: ${errorMessage}`);
        }
    }

    /**
     * Generates a formatted text report of all test results
     * @param testRuns Map of test runs to format
     * @returns Formatted text content
     */
    private generateTestResultsReport(testRuns: Map<string, TestItem>): string {
        const lines: string[] = [];
        
        // Header
        lines.push('='.repeat(80));
        lines.push('TEST RESULTS REPORT');
        lines.push('='.repeat(80));
        lines.push(`Generated: ${new Date().toLocaleString()}`);
        lines.push('');
        
        // Get detailed error information from TestSummaryView if available
        const testSummaryData = this.testSummaryView?.getCurrentTests();
        const testSummary = this.testSummaryView?.getCurrentSummary();
        
        // Summary statistics
        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;
        let skippedTests = 0;
        let abortedTests = 0;
        let runningTests = 0;
        let pendingTests = 0;
        
        // Count test results
        testRuns.forEach((classItem) => {
            if (classItem.children.length === 0) {
                // Class-level test (no specific methods)
                totalTests += 1;
                switch (classItem.status) {
                    case 'success': passedTests++; break;
                    case 'failed': failedTests++; break;
                    case 'skipped': skippedTests++; break;
                    case 'aborted': abortedTests++; break;
                    case 'running': runningTests++; break;
                    case 'pending': pendingTests++; break;
                }
            } else {
                // Method-level tests
                classItem.children.forEach(method => {
                    totalTests++;
                    switch (method.status) {
                        case 'success': passedTests++; break;
                        case 'failed': failedTests++; break;
                        case 'skipped': skippedTests++; break;
                        case 'aborted': abortedTests++; break;
                        case 'running': runningTests++; break;
                        case 'pending': pendingTests++; break;
                    }
                });
            }
        });
        
        // Summary section
        lines.push('SUMMARY');
        lines.push('-'.repeat(40));
        lines.push(`Total Tests:    ${totalTests}`);
        lines.push(`Passed:         ${passedTests}`);
        lines.push(`Failed:         ${failedTests}`);
        lines.push(`Skipped:        ${skippedTests}`);
        lines.push(`Aborted:        ${abortedTests}`);
        lines.push(`Running:        ${runningTests}`);
        lines.push(`Pending:        ${pendingTests}`);
        
        if (totalTests > 0) {
            const passPercentage = ((passedTests / totalTests) * 100).toFixed(1);
            lines.push(`Pass Rate:      ${passPercentage}%`);
        }
        
        // Add additional summary info from TestSummary if available
        if (testSummary) {
            lines.push('');
            lines.push('ADDITIONAL DETAILS');
            lines.push('-'.repeat(20));
            if (testSummary.testExecutionTime) {
                lines.push(`Execution Time:  ${testSummary.testExecutionTime}`);
            }
            if (testSummary.commandTime) {
                lines.push(`Command Time:    ${testSummary.commandTime}`);
            }
            if (testSummary.testRunId) {
                lines.push(`Test Run ID:     ${testSummary.testRunId}`);
            }
            if (testSummary.userId) {
                lines.push(`User ID:         ${testSummary.userId}`);
            }
            if (testSummary.username) {
                lines.push(`Username:        ${testSummary.username}`);
            }
        }
        
        lines.push('');
        
        // Detailed results by class
        lines.push('DETAILED RESULTS');
        lines.push('-'.repeat(40));
        lines.push('');
        
        // Sort classes alphabetically
        const sortedTestRuns = Array.from(testRuns.entries()).sort(([a], [b]) => a.localeCompare(b));
        
        sortedTestRuns.forEach(([className, classItem]) => {
            lines.push(`📁 ${className}`);
            
            if (classItem.children.length === 0) {
                // Class-level test result
                const statusIcon = this.getStatusIcon(classItem.status);
                lines.push(`   ${statusIcon} Class Test - ${classItem.status.toUpperCase()}`);
                if (classItem.logId) {
                    lines.push(`      Log ID: ${classItem.logId}`);
                }
                if (classItem.error) {
                    lines.push(`      Error: ${classItem.error}`);
                }
            } else {
                // Method-level tests
                classItem.children.sort((a, b) => a.label.localeCompare(b.label)).forEach(method => {
                    const statusIcon = this.getStatusIcon(method.status);
                    lines.push(`   ${statusIcon} ${method.label} - ${method.status.toUpperCase()}`);
                    
                    if (method.logId) {
                        lines.push(`      Log ID: ${method.logId}`);
                    }
                    if (method.error) {
                        lines.push(`      Error: ${method.error}`);
                    }
                    
                    // Add detailed error information from TestSummaryView if available
                    if (testSummaryData && method.status === 'failed') {
                        const detailedTestResult = testSummaryData.find((test: any) => {
                            const testMethodName = test.MethodName || test.methodName;
                            const testClassName = test.ApexClass?.Name || test.FullName?.split('.')[0];
                            return testMethodName === method.label && testClassName === className;
                        });
                        
                        if (detailedTestResult) {
                            if (detailedTestResult.Message) {
                                lines.push(`      Error Message:`);
                                // Format the error message with proper indentation
                                const errorMessage = detailedTestResult.Message
                                    .replace(/^System\.[^:]+:/, '') // Remove System.* prefix
                                    .trim();
                                errorMessage.split('\n').forEach((line: string) => {
                                    if (line.trim()) {
                                        lines.push(`        ${line.trim()}`);
                                    }
                                });
                            }
                            
                            if (detailedTestResult.StackTrace) {
                                lines.push(`      Stack Trace:`);
                                // Format the stack trace with proper indentation
                                detailedTestResult.StackTrace.split('\n').forEach((line: string) => {
                                    if (line.trim()) {
                                        lines.push(`        ${line.trim()}`);
                                    }
                                });
                            }
                        }
                    }
                });
            }
            lines.push('');
        });
        
        // Footer
        lines.push('-'.repeat(80));
        lines.push('End of Report');
        lines.push('-'.repeat(80));
        
        return lines.join('\n');
    }

    /**
     * Returns an appropriate icon for the test status
     * @param status Test status
     * @returns Icon string
     */
    private getStatusIcon(status: 'running' | 'success' | 'failed' | 'pending' | 'downloading' | 'skipped' | 'aborted'): string {
        switch (status) {
            case 'success': return '✅';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            case 'aborted': return '🛑';
            case 'running': return '🔄';
            case 'downloading': return '⬇️';
            case 'pending': return '⏸️';
            default: return '❓';
        }
    }
} 