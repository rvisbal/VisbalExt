import * as vscode from 'vscode';
import { ReferencesService, ReferenceLocation, SymbolReference } from '../services/referencesService';
import * as OrgUtilsModule from '../utils/orgUtils';
const OrgUtils = OrgUtilsModule.OrgUtils;

/**
 * Tree item for displaying reference results
 */
export class ReferenceTreeItem extends vscode.TreeItem {
    public readonly children: ReferenceTreeItem[] = [];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly referenceLocation?: ReferenceLocation,
        public readonly itemType: 'file' | 'reference' | 'root' = 'reference'
    ) {
        super(label, collapsibleState);
        
        if (itemType === 'file') {
            // File node - shows file name and reference count with clickable link to file
            this.iconPath = this.getFileIcon(referenceLocation?.fileName || '');
            this.contextValue = 'referenceFile';
            this.tooltip = `Click to open: ${referenceLocation?.filePath.fsPath || ''}`;
            
            // Make file header clickable - opens the file
            if (referenceLocation) {
                this.command = {
                    title: 'Open File',
                    command: 'visbal-ext.openFile',
                    arguments: [referenceLocation.filePath]
                };
            }
        } else if (itemType === 'reference') {
            // Reference node - enhanced display with better icons and formatting
            this.iconPath = this.getReferenceIcon(referenceLocation);
            this.contextValue = 'referenceItem';
            
            if (referenceLocation) {
                const lineNumber = referenceLocation.position.line + 1;
                
                // Format the display with better spacing and line indicator
                this.description = `${lineNumber}`;
                
                // Enhanced tooltip with more context
                const context = this.buildContextTooltip(referenceLocation);
                this.tooltip = context;
                
                // Set up command to navigate to the reference with better positioning
                this.command = {
                    title: 'Go to Reference',
                    command: 'visbal-ext.goToReference',
                    arguments: [referenceLocation.filePath, referenceLocation.position]
                };
                
                // Add resource URI for better VS Code integration
                this.resourceUri = referenceLocation.filePath;
            }
        } else if (itemType === 'root') {
            // Root node - shows symbol information with appropriate icon
            this.iconPath = new vscode.ThemeIcon('references', new vscode.ThemeColor('symbolIcon.referenceForeground'));
            this.contextValue = 'referenceRoot';
            this.tooltip = 'All references to this symbol. Click any reference below to navigate.';
        }
    }

    /**
     * Adds a child reference item to this file node
     */
    addChild(child: ReferenceTreeItem): void {
        this.children.push(child);
    }

    /**
     * Gets the appropriate icon for different file types
     */
    private getFileIcon(fileName: string): vscode.ThemeIcon {
        const extension = fileName.toLowerCase().split('.').pop() || '';
        
        switch (extension) {
            case 'cls':
                return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'));
            case 'trigger':
                return new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('symbolIcon.eventForeground'));
            case 'page':
            case 'component':
                return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('symbolIcon.interfaceForeground'));
            case 'js':
                return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('symbolIcon.functionForeground'));
            case 'css':
                return new vscode.ThemeIcon('symbol-color', new vscode.ThemeColor('symbolIcon.colorForeground'));
            case 'html':
                return new vscode.ThemeIcon('symbol-tag', new vscode.ThemeColor('symbolIcon.tagForeground'));
            default:
                return new vscode.ThemeIcon('file-code', new vscode.ThemeColor('symbolIcon.fileForeground'));
        }
    }

    /**
     * Gets the appropriate icon for reference items based on context
     */
    private getReferenceIcon(referenceLocation?: ReferenceLocation): vscode.ThemeIcon {
        if (!referenceLocation) {
            return new vscode.ThemeIcon('symbol-reference');
        }

        const lineText = referenceLocation.lineText.trim();
        
        // Detect different types of references and use appropriate icons
        if (lineText.includes('public ') || lineText.includes('private ') || lineText.includes('protected ')) {
            if (lineText.includes('class ')) {
                return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'));
            } else if (lineText.includes('(')) {
                return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
            } else {
                return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('symbolIcon.propertyForeground'));
            }
        } else if (lineText.includes('new ')) {
            return new vscode.ThemeIcon('symbol-constructor', new vscode.ThemeColor('symbolIcon.constructorForeground'));
        } else if (lineText.includes('(')) {
            return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
        } else if (lineText.includes('.')) {
            return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('symbolIcon.propertyForeground'));
        } else if (lineText.startsWith('//') || lineText.includes('/*')) {
            return new vscode.ThemeIcon('comment', new vscode.ThemeColor('editorComment.foreground'));
        } else {
            return new vscode.ThemeIcon('symbol-variable', new vscode.ThemeColor('symbolIcon.variableForeground'));
        }
    }

    /**
     * Builds an informative tooltip with context
     */
    private buildContextTooltip(referenceLocation: ReferenceLocation): string {
        const lineNumber = referenceLocation.position.line + 1;
        const fileName = referenceLocation.fileName;
        
        let tooltip = `📍 ${fileName}:${lineNumber}\n\n`;
        
        // Add context lines if available
        if (referenceLocation.contextBefore) {
            tooltip += `${lineNumber - 1}: ${referenceLocation.contextBefore}\n`;
        }
        
        tooltip += `▶ ${lineNumber}: ${referenceLocation.lineText}\n`;
        
        if (referenceLocation.contextAfter) {
            tooltip += `${lineNumber + 1}: ${referenceLocation.contextAfter}\n`;
        }
        
        tooltip += '\n💡 Click to navigate to this reference';
        
        return tooltip;
    }
}

/**
 * Tree data provider for the references view
 */
export class ReferencesTreeProvider implements vscode.TreeDataProvider<ReferenceTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ReferenceTreeItem | undefined | null | void> = new vscode.EventEmitter<ReferenceTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ReferenceTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootItems: ReferenceTreeItem[] = [];
    private currentSymbolReference: SymbolReference | null = null;

    /**
     * Updates the tree with new reference results
     */
    public updateReferences(symbolReference: SymbolReference | null): void {
        this.currentSymbolReference = symbolReference;
        this.rootItems = [];

        if (symbolReference && symbolReference.references.length > 0) {
            // Create root node showing symbol info
            const rootLabel = `${symbolReference.contextDescription} (${symbolReference.references.length} reference${symbolReference.references.length === 1 ? '' : 's'})`;
            const rootItem = new ReferenceTreeItem(
                rootLabel,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'root'
            );

            // Group references by file
            const fileGroups = new Map<string, ReferenceLocation[]>();
            for (const reference of symbolReference.references) {
                const filePath = reference.filePath.fsPath;
                if (!fileGroups.has(filePath)) {
                    fileGroups.set(filePath, []);
                }
                fileGroups.get(filePath)!.push(reference);
            }

            // Create file nodes with their references (sorted by file name)
            const sortedFileGroups = Array.from(fileGroups.entries()).sort(([a], [b]) => 
                a.split(/[\/\\]/).pop()!.localeCompare(b.split(/[\/\\]/).pop()!)
            );

            for (const [filePath, references] of sortedFileGroups) {
                const fileName = references[0].fileName;
                const refCount = references.length;
                const fileLabel = `📄 ${fileName}`;
                
                const fileItem = new ReferenceTreeItem(
                    fileLabel,
                    vscode.TreeItemCollapsibleState.Expanded,
                    references[0], // Pass first reference for file path info
                    'file'
                );
                
                // Set description to show reference count
                fileItem.description = `${refCount} reference${refCount === 1 ? '' : 's'}`;

                // Sort references by line number
                references.sort((a, b) => a.position.line - b.position.line);

                // Add reference items under each file with enhanced formatting
                for (const reference of references) {
                    const lineNumber = reference.position.line + 1;
                    const lineText = reference.lineText.trim();
                    
                    // Format reference with better visual indicators
                    const referenceLabel = this.formatReferenceLabel(lineText, lineNumber);
                    
                    const referenceItem = new ReferenceTreeItem(
                        referenceLabel,
                        vscode.TreeItemCollapsibleState.None,
                        reference,
                        'reference'
                    );
                    
                    fileItem.addChild(referenceItem);
                }

                rootItem.addChild(fileItem);
            }

            this.rootItems.push(rootItem);
        }

        this._onDidChangeTreeData.fire();
    }

    /**
     * Updates the tree with @AuraEnabled method results organized by class -> method -> references
     */
    public updateAuraEnabledReferences(resultsByClass: Map<string, SymbolReference[]>): void {
        this.currentSymbolReference = null; // Clear current reference since this is a special hierarchical view
        this.rootItems = [];

        if (resultsByClass.size > 0) {
            // Calculate totals for the root label
            let totalMethods = 0;
            let totalReferences = 0;
            for (const [className, methods] of resultsByClass) {
                totalMethods += methods.length;
                totalReferences += methods.reduce((sum, method) => sum + method.references.length, 0);
            }

            // Create overall root node
            const overallRootLabel = `@AuraEnabled Methods (${resultsByClass.size} classes, ${totalMethods} methods, ${totalReferences} references)`;
            const overallRootItem = new ReferenceTreeItem(
                overallRootLabel,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'root'
            );

            // Sort classes by name
            const sortedClasses = Array.from(resultsByClass.entries()).sort(([a], [b]) => a.localeCompare(b));

            // Create class nodes
            for (const [className, methods] of sortedClasses) {
                const classMethodCount = methods.length;
                const classRefCount = methods.reduce((sum, method) => sum + method.references.length, 0);
                
                const classLabel = `📁 ${className}`;
                const classItem = new ReferenceTreeItem(
                    classLabel,
                    vscode.TreeItemCollapsibleState.Expanded,
                    undefined,
                    'file' // Use 'file' type for appropriate styling
                );
                
                // Set description to show method and reference counts
                classItem.description = `${classMethodCount} method${classMethodCount === 1 ? '' : 's'}, ${classRefCount} reference${classRefCount === 1 ? '' : 's'}`;

                // Add command to navigate to class file if we have method definitions
                const firstMethodWithDef = methods.find(m => (m as any).methodDefinition) as any;
                if (firstMethodWithDef?.methodDefinition) {
                    classItem.command = {
                        title: 'Open Class File',
                        command: 'visbal-ext.openFile',
                        arguments: [firstMethodWithDef.methodDefinition.filePath]
                    };
                    
                    // Update tooltip to indicate it's clickable
                    classItem.tooltip = `Click to open ${className}.cls file`;
                    
                    // Set resource URI for better VS Code integration
                    classItem.resourceUri = firstMethodWithDef.methodDefinition.filePath;
                }

                // Sort methods by name
                const sortedMethods = methods.sort((a, b) => a.symbol.localeCompare(b.symbol));

                // Create method nodes
                for (const method of sortedMethods) {
                    const methodLabel = `⚡ ${method.contextDescription}`;
                    
                    // Create a method tree item with navigation to method definition
                    const methodItem = new ReferenceTreeItem(
                        methodLabel,
                        vscode.TreeItemCollapsibleState.Expanded,
                        undefined,
                        'root'
                    );
                    
                    // Set description to show reference count
                    methodItem.description = `${method.references.length} reference${method.references.length === 1 ? '' : 's'}`;

                    // Add command to navigate to method definition if available
                    const methodWithDef = method as any;
                    if (methodWithDef.methodDefinition) {
                        methodItem.command = {
                            title: 'Go to Method Definition',
                            command: 'visbal-ext.goToReference',
                            arguments: [methodWithDef.methodDefinition.filePath, methodWithDef.methodDefinition.position]
                        };
                        
                        // Update tooltip to indicate it's clickable
                        methodItem.tooltip = `Click to go to method definition in ${method.className}.cls\n\n${methodWithDef.methodDefinition.lineText.trim()}`;
                        
                        // Set resource URI for better VS Code integration
                        methodItem.resourceUri = methodWithDef.methodDefinition.filePath;
                        
                        // Use method icon to indicate it's a clickable method
                        methodItem.iconPath = new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
                    }

                    // Sort references by file name, then by line number
                    const sortedReferences = method.references.sort((a, b) => {
                        const fileCompare = a.fileName.localeCompare(b.fileName);
                        if (fileCompare !== 0) return fileCompare;
                        return a.position.line - b.position.line;
                    });

                    // Add reference items under each method
                    for (const reference of sortedReferences) {
                        const lineNumber = reference.position.line + 1;
                        const lineText = reference.lineText.trim();
                        
                        // Format reference with file name and line number
                        const referenceLabel = `${reference.fileName}:${lineNumber} - ${this.formatReferenceLabel(lineText, lineNumber)}`;
                        
                        const referenceItem = new ReferenceTreeItem(
                            referenceLabel,
                            vscode.TreeItemCollapsibleState.None,
                            reference,
                            'reference'
                        );
                        
                        methodItem.addChild(referenceItem);
                    }

                    classItem.addChild(methodItem);
                }

                overallRootItem.addChild(classItem);
            }

            this.rootItems.push(overallRootItem);
        }

        this._onDidChangeTreeData.fire();
    }

    /**
     * Clears the references view
     */
    public clearReferences(): void {
        this.currentSymbolReference = null;
        this.rootItems = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ReferenceTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ReferenceTreeItem): ReferenceTreeItem[] {
        if (!element) {
            return this.rootItems;
        }
        return element.children;
    }

    /**
     * Formats the reference label for better visual presentation
     */
    private formatReferenceLabel(lineText: string, lineNumber: number): string {
        // Truncate very long lines and add ellipsis
        const maxLength = 200;
        let displayText = lineText;
        
        if (displayText.length > maxLength) {
            displayText = displayText.substring(0, maxLength) + '...';
        }
        
        // Remove excessive whitespace
        displayText = displayText.replace(/\s+/g, ' ');
        
        // Format with line number and visual indicator
        return `${displayText}`;
    }

    /**
     * Gets the current symbol reference data
     */
    public getCurrentSymbolReference(): SymbolReference | null {
        return this.currentSymbolReference;
    }
}

/**
 * Main references view class that manages the tree view and handles commands
 */
export class ReferencesView {
    private treeDataProvider: ReferencesTreeProvider;
    private treeView: vscode.TreeView<ReferenceTreeItem>;
    private statusBarItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        // Initialize the tree data provider
        this.treeDataProvider = new ReferencesTreeProvider();
        
        // Create the tree view
        this.treeView = vscode.window.createTreeView('referencesView', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true,
            canSelectMany: false
        });

        // Create status bar item for showing reference search progress
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.hide();

        // Register commands
        this.registerCommands(context);

        // Initialize the references service with OrgUtils logging
        ReferencesService.initialize();
    }

    /**
     * Registers commands for the references view
     */
    private registerCommands(context: vscode.ExtensionContext): void {
        // Command to find all references
        const findReferencesCommand = vscode.commands.registerCommand('visbal-ext.findAllReferences', async () => {
            await this.findAllReferences();
        });

        // Command to navigate to a specific reference
        const goToReferenceCommand = vscode.commands.registerCommand('visbal-ext.goToReference', async (filePath: vscode.Uri, position: vscode.Position) => {
            await this.goToReference(filePath, position);
        });

        // Command to refresh references
        const refreshReferencesCommand = vscode.commands.registerCommand('visbal-ext.refreshReferences', async () => {
            await this.refreshReferences();
        });

        // Command to clear references
        const clearReferencesCommand = vscode.commands.registerCommand('visbal-ext.clearReferences', () => {
            this.clearReferences();
        });

        // Command to show the References panel
        const showReferencesPanelCommand = vscode.commands.registerCommand('visbal-ext.showReferencesPanel', async () => {
            await this.showReferencesPanel();
        });

        // Command to open a file
        const openFileCommand = vscode.commands.registerCommand('visbal-ext.openFile', async (filePath: vscode.Uri) => {
            await this.openFile(filePath);
        });

        // Command to reload @AuraEnabled report from cache
        const reloadAuraEnabledCommand = vscode.commands.registerCommand('visbal-ext.reloadAuraEnabledFromCache', async () => {
            OrgUtils.logDebug('[VisbalExt.ReferencesView] Reload @AuraEnabled command executed');
            try {
                await this.reloadAuraEnabledFromCache();
            } catch (error) {
                console.error('[VisbalExt.ReferencesView] Error in reload command:', error);
                vscode.window.showErrorMessage(`Reload failed: ${error}`);
            }
        });

        context.subscriptions.push(
            findReferencesCommand,
            goToReferenceCommand,
            refreshReferencesCommand,
            clearReferencesCommand,
            showReferencesPanelCommand,
            openFileCommand,
            reloadAuraEnabledCommand,
            this.treeView,
            this.statusBarItem
        );
    }

    /**
     * Main command to find all references to the symbol at cursor
     */
    public async findAllReferences(): Promise<void> {
        try {
            // Show progress in status bar
            this.statusBarItem.text = "$(search) Searching for references...";
            this.statusBarItem.show();

            // Clear previous results
            this.treeDataProvider.clearReferences();

            // Find references using the service
            const symbolReference = await ReferencesService.findAllReferences();
            
            if (!symbolReference) {
                vscode.window.showInformationMessage('No symbol found at cursor position.');
                return;
            }

            if (symbolReference.references.length === 0) {
                vscode.window.showInformationMessage(`No references found for '${symbolReference.contextDescription}'.`);
                this.treeDataProvider.updateReferences(symbolReference);
                return;
            }

            // Update the tree view with results
            this.treeDataProvider.updateReferences(symbolReference);

            // Show the References panel (since it's collapsed by default)
            try {
                // Execute command to show the References container panel
                await vscode.commands.executeCommand('workbench.view.extension.visbal-references-container');
                
                // After panel is shown, reveal the first item for better UX
                setTimeout(() => {
                    const children = this.treeDataProvider.getChildren();
                    if (children.length > 0) {
                        this.treeView.reveal(children[0], { expand: true, focus: true, select: true });
                    }
                }, 200); // Increased timeout to allow panel to load properly
            } catch (error) {
                // Fallback: try the custom show panel command
                OrgUtils.logDebug('[VisbalExt.References] Direct panel activation failed, trying custom command');
                try {
                    await vscode.commands.executeCommand('visbal-ext.showReferencesPanel');
                    setTimeout(() => {
                        const children = this.treeDataProvider.getChildren();
                        if (children.length > 0) {
                            this.treeView.reveal(children[0], { expand: true, focus: true, select: true });
                        }
                    }, 100);
                } catch (fallbackError) {
                    OrgUtils.logDebug('[VisbalExt.References] All panel activation attempts failed, references still available in tree');
                }
            }

            // Show success message
            const message = `Found ${symbolReference.references.length} reference${symbolReference.references.length === 1 ? '' : 's'} to '${symbolReference.contextDescription}'`;
            vscode.window.showInformationMessage(message);

            this.statusBarItem.hide();

        } catch (error: any) {
            this.statusBarItem.hide();
            console.error('[VisbalExt.ReferencesView] findAllReferences -- Error:', error);
            vscode.window.showErrorMessage(`Could not find references: ${error.message}`);
        }
    }

    /**
     * Navigate to a specific reference location with enhanced UX
     */
    public async goToReference(filePath: vscode.Uri, position: vscode.Position): Promise<void> {
        try {
            // Show progress indicator
            this.statusBarItem.text = "$(loading~spin) Opening reference...";
            this.statusBarItem.show();

            // Use showTextDocument directly with URI and selection to avoid workspace operations
            const editor = await vscode.window.showTextDocument(filePath, {
                selection: new vscode.Range(position, position),
                viewColumn: vscode.ViewColumn.One
            });
            
            // Enhanced cursor positioning with word selection
            const wordRange = editor.document.getWordRangeAtPosition(position);
            if (wordRange) {
                editor.selection = new vscode.Selection(wordRange.start, wordRange.end);
                editor.revealRange(wordRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            } else {
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            }

            // Brief highlight effect (if supported by the theme)
            if (wordRange) {
                const decoration = vscode.window.createTextEditorDecorationType({
                    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
                    borderRadius: '3px'
                });
                
                editor.setDecorations(decoration, [wordRange]);
                
                // Remove highlight after 2 seconds
                setTimeout(() => {
                    decoration.dispose();
                }, 2000);
            }

            // Update status bar with success
            this.statusBarItem.text = "$(check) Reference opened";
            setTimeout(() => {
                this.statusBarItem.hide();
            }, 2000);

        } catch (error: any) {
            this.statusBarItem.hide();
            console.error('[VisbalExt.ReferencesView] goToReference -- Error:', error);
            vscode.window.showErrorMessage(`Could not navigate to reference: ${error.message}`);
        }
    }

    /**
     * Refresh the current references search
     */
    public async refreshReferences(): Promise<void> {
        const currentSymbol = this.treeDataProvider.getCurrentSymbolReference();
        if (!currentSymbol) {
            vscode.window.showInformationMessage('No current references to refresh. Use "Find All References" first.');
            return;
        }

        // Re-run the search
        await this.findAllReferences();
    }

    /**
     * Clear the references view
     */
    public clearReferences(): void {
        this.treeDataProvider.clearReferences();
        vscode.window.showInformationMessage('References view cleared.');
    }

    /**
     * Show the References panel
     */
    public async showReferencesPanel(): Promise<void> {
        try {
            // Open the References container panel
            await vscode.commands.executeCommand('workbench.view.extension.visbal-references-container');
            
            // Focus on the tree view items if available
            const children = this.treeDataProvider.getChildren();
            if (children.length > 0) {
                await this.treeView.reveal(children[0], { focus: true });
                vscode.window.showInformationMessage('References panel is now visible.');
            } else {
                vscode.window.showInformationMessage('References panel is ready. Use "V: Find All References" to search for symbols.');
            }
        } catch (error: any) {
            console.error('[VisbalExt.ReferencesView] showReferencesPanel -- Error:', error);
            vscode.window.showInformationMessage('References panel is available in the side panel.');
        }
    }

    /**
     * Open a file in VS Code without triggering external processes
     */
    public async openFile(filePath: vscode.Uri): Promise<void> {
        try {
            // Show progress indicator
            this.statusBarItem.text = "$(loading~spin) Opening file...";
            this.statusBarItem.show();

            // Use showTextDocument directly with URI to avoid workspace operations
            await vscode.window.showTextDocument(filePath, {
                preview: false,
                viewColumn: vscode.ViewColumn.One
            });

            // Update status bar with success
            this.statusBarItem.text = "$(check) File opened";
            setTimeout(() => {
                this.statusBarItem.hide();
            }, 2000);

        } catch (error: any) {
            this.statusBarItem.hide();
            console.error('[VisbalExt.ReferencesView] openFile -- Error:', error);
            vscode.window.showErrorMessage(`Could not open file: ${error.message}`);
        }
    }

    /**
     * Get the tree view instance
     */
    public getTreeView(): vscode.TreeView<ReferenceTreeItem> {
        return this.treeView;
    }

    /**
     * Get the tree data provider instance
     */
    public getTreeDataProvider(): ReferencesTreeProvider {
        return this.treeDataProvider;
    }

    /**
     * Reload @AuraEnabled report from cache
     */
    public async reloadAuraEnabledFromCache(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Starting cache reload');
            
            // Show progress in status bar
            this.statusBarItem.text = "$(loading~spin) Loading @AuraEnabled report from cache...";
            this.statusBarItem.show();

            // Import and load from cache
            const { AuraEnabledService } = await import('../services/auraEnabledService');
            
            // Get cache info first
            const cacheInfo = AuraEnabledService.getCacheInfo();
            OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Cache info:', cacheInfo);
            
            if (!cacheInfo.exists) {
                OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- No cache found');
                vscode.window.showInformationMessage(
                    'No cached @AuraEnabled report found. Please run a new scan from the Traction tab first.',
                    'Open Traction Tab'
                ).then(selection => {
                    if (selection === 'Open Traction Tab') {
                        vscode.commands.executeCommand('workbench.view.extension.visbal-traction');
                    }
                });
                this.statusBarItem.hide();
                return;
            }

            // Load results from cache
            OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Loading from cache');
            const resultsByClass = AuraEnabledService.loadFromCache();
            
            if (!resultsByClass || resultsByClass.size === 0) {
                OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Cache load failed or empty');
                vscode.window.showWarningMessage('Failed to load cached @AuraEnabled report or cache is empty.');
                this.statusBarItem.hide();
                return;
            }

            OrgUtils.logDebug(`[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Loaded ${resultsByClass.size} classes from cache`);

            // Update the references view with hierarchical results
            if (this.treeDataProvider.updateAuraEnabledReferences) {
                OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Updating tree view');
                this.treeDataProvider.updateAuraEnabledReferences(resultsByClass);
            } else {
                console.warn('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- updateAuraEnabledReferences method not available');
            }

            // Calculate totals for the message
            let totalMethods = 0;
            let totalReferences = 0;
            for (const [className, methods] of resultsByClass) {
                totalMethods += methods.length;
                totalReferences += methods.reduce((sum, method) => sum + method.references.length, 0);
            }

            // Small delay to ensure tree is updated before trying to reveal
            setTimeout(async () => {
                try {
                    const children = this.treeDataProvider.getChildren();
                    OrgUtils.logDebug(`[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Tree has ${children.length} root items`);
                    if (children.length > 0) {
                        await this.treeView.reveal(children[0], { expand: true, focus: false, select: false });
                        OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Tree item revealed');
                    }
                } catch (error) {
                    OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Could not reveal tree items:', error);
                }
            }, 100);

            // Show success message with cache timestamp
            const cacheDate = new Date(cacheInfo.timestamp!).toLocaleString();
            vscode.window.showInformationMessage(
                `Loaded cached @AuraEnabled report: ${resultsByClass.size} classes, ${totalMethods} methods, ${totalReferences} references (cached: ${cacheDate})`
            );

            this.statusBarItem.hide();
            OrgUtils.logDebug('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Cache reload completed successfully');

        } catch (error: any) {
            this.statusBarItem.hide();
            console.error('[VisbalExt.ReferencesView] reloadAuraEnabledFromCache -- Error:', error);
            vscode.window.showErrorMessage(`Could not load @AuraEnabled report from cache: ${error.message}`);
        }
    }
}
