import * as vscode from 'vscode';
import { ReferencesService, ReferenceLocation, SymbolReference } from '../services/referencesService';

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
        const maxLength = 80;
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

        context.subscriptions.push(
            findReferencesCommand,
            goToReferenceCommand,
            refreshReferencesCommand,
            clearReferencesCommand,
            showReferencesPanelCommand,
            openFileCommand,
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

            // Try to show the References panel without triggering external commands
            try {
                // Simple attempt to reveal the first item without external command execution
                setTimeout(() => {
                    const children = this.treeDataProvider.getChildren();
                    if (children.length > 0) {
                        this.treeView.reveal(children[0], { expand: true, focus: true, select: true });
                    }
                }, 50);
            } catch (error) {
                // Silently ignore panel visibility issues to prevent external command execution
                console.log('[References] Panel visibility optimization skipped');
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
            // Try to focus on the tree view without external command execution
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
}
