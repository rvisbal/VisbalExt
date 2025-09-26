import * as vscode from 'vscode';
import * as path from 'path';
import { ReferencesService, SymbolReference } from './referencesService';
import { SymbolNavigationService } from './symbolNavigationService';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Interface for an unused symbol
 */
export interface UnusedSymbol {
    symbol: string;
    type: 'method' | 'property' | 'class' | 'variable';
    className?: string;
    filePath: string;
    fileName: string;
    position: vscode.Position;
    lineText: string;
    contextBefore: string;
    contextAfter: string;
    annotations?: string[];
    isPublic: boolean;
    isStatic: boolean;
    isTest: boolean;
    reason: string; // Why it's considered unused
}

/**
 * Interface for unused code analysis result
 */
export interface UnusedCodeReport {
    totalSymbols: number;
    unusedCount: number;
    unusedMethods: number;
    unusedProperties: number;
    unusedClasses: number;
    unusedVariables: number;
    symbols: UnusedSymbol[];
    scannedFiles: string[];
    scanTime: Date;
    excludedFiles: string[];
    excludedSymbols: number;
}

/**
 * Configuration for unused code detection
 */
export interface UnusedCodeConfig {
    includePrivateMembers: boolean;
    includeTestMethods: boolean;
    includeAuraEnabledMethods: boolean;
    includeWebServiceMethods: boolean;
    excludePatterns: string[];
    scanScope: 'workspace' | 'currentFile' | 'directory';
    targetDirectory?: string;
}

/**
 * UnusedCodeService - Analyzes the codebase to find unused methods, properties, and classes
 */
export class UnusedCodeService {
    private static instance: UnusedCodeService;
    private progressCallback?: (message: string, percentage?: number) => void;

    private constructor() {}

    public static getInstance(): UnusedCodeService {
        if (!UnusedCodeService.instance) {
            UnusedCodeService.instance = new UnusedCodeService();
        }
        return UnusedCodeService.instance;
    }

    /**
     * Initialize the service
     */
    public static initialize(): void {
        // Initialize ReferencesService dependency
        ReferencesService.initialize();
        
        // Initialize SymbolNavigationService with OrgUtils logging
        SymbolNavigationService.initialize(
            (message: string, ...args: any[]) => {
                OrgUtils.logDebug(`[UnusedCode-Symbol] ${message}`, ...args);
            },
            (message: string, error: any) => {
                OrgUtils.logError(`[UnusedCode-Symbol] ${message}`, error);
            }
        );
    }

    /**
     * Set progress callback for reporting scan progress
     */
    public setProgressCallback(callback: (message: string, percentage?: number) => void): void {
        this.progressCallback = callback;
    }

    private reportProgress(message: string, percentage?: number): void {
        if (this.progressCallback) {
            this.progressCallback(message, percentage);
        }
        OrgUtils.logDebug(`[VisbalExt.UnusedCodeService] Progress: ${message}${percentage ? ` (${percentage}%)` : ''}`);
    }

    /**
     * Analyze the workspace for unused code
     */
    public async analyzeWorkspace(config?: Partial<UnusedCodeConfig>): Promise<UnusedCodeReport> {
        const defaultConfig: UnusedCodeConfig = {
            includePrivateMembers: true,
            includeTestMethods: false, // Exclude test methods by default
            includeAuraEnabledMethods: false, // Exclude @AuraEnabled methods by default
            includeWebServiceMethods: false, // Exclude webservice methods by default
            excludePatterns: [
                '**/test/**', 
                '**/tests/**', 
                '**/*Test.cls', 
                '**/*_Test.cls',
                '**/*test.cls',
                '**/*TestClass.cls',
                '**/*Tests.cls'
            ],
            scanScope: 'workspace'
        };

        const finalConfig = { ...defaultConfig, ...config };
        
        OrgUtils.logDebug('[VisbalExt.UnusedCodeService] analyzeWorkspace -- Starting unused code analysis', finalConfig);
        this.reportProgress('Starting unused code analysis...');

        const startTime = new Date();
        const unusedSymbols: UnusedSymbol[] = [];
        const scannedFiles: string[] = [];
        const excludedFiles: string[] = [];
        let excludedSymbols = 0;
        let totalSymbols = 0;

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folders found');
            }

            // Find all Apex files in the workspace
            const apexFiles = await this.findApexFiles(finalConfig);
            this.reportProgress(`Found ${apexFiles.length} Apex files to analyze`);

            for (let i = 0; i < apexFiles.length; i++) {
                const file = apexFiles[i];
                const fileName = path.basename(file.fsPath);
                
                // Check if file should be excluded
                if (this.shouldExcludeFile(file.fsPath, finalConfig.excludePatterns)) {
                    excludedFiles.push(file.fsPath);
                    continue;
                }

                const progress = Math.floor((i / apexFiles.length) * 100);
                this.reportProgress(`Analyzing ${fileName}...`, progress);

                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const fileSymbols = await this.extractSymbolsFromDocument(document, finalConfig);
                    
                    totalSymbols += fileSymbols.length;
                    scannedFiles.push(file.fsPath);

                    // Check each symbol for references
                    for (const symbolInfo of fileSymbols) {
                        // Apply exclusion rules
                        if (this.shouldExcludeSymbol(symbolInfo, finalConfig)) {
                            excludedSymbols++;
                            continue;
                        }

                        try {
                            // Use ReferencesService to check for references
                            const hasReferences = await this.checkSymbolHasReferences(
                                symbolInfo.symbol, 
                                symbolInfo.type, 
                                symbolInfo.className, 
                                document, 
                                symbolInfo.annotations
                            );

                            if (!hasReferences) {
                                unusedSymbols.push({
                                    ...symbolInfo,
                                    reason: this.generateUnusedReason(symbolInfo)
                                });
                            }
                        } catch (error) {
                            OrgUtils.logError(`[VisbalExt.UnusedCodeService] Error checking references for ${symbolInfo.symbol}:`, error);
                        }
                    }
                } catch (error) {
                    OrgUtils.logError(`[VisbalExt.UnusedCodeService] Error processing file ${file.fsPath}:`, error);
                }
            }

            this.reportProgress('Analysis complete, generating report...', 100);

            const report: UnusedCodeReport = {
                totalSymbols,
                unusedCount: unusedSymbols.length,
                unusedMethods: unusedSymbols.filter(s => s.type === 'method').length,
                unusedProperties: unusedSymbols.filter(s => s.type === 'property').length,
                unusedClasses: unusedSymbols.filter(s => s.type === 'class').length,
                unusedVariables: unusedSymbols.filter(s => s.type === 'variable').length,
                symbols: this.sortUnusedSymbols(unusedSymbols),
                scannedFiles,
                scanTime: startTime,
                excludedFiles,
                excludedSymbols
            };

            OrgUtils.logDebug('[VisbalExt.UnusedCodeService] analyzeWorkspace -- Analysis complete', {
                totalSymbols: report.totalSymbols,
                unusedCount: report.unusedCount,
                scannedFiles: report.scannedFiles.length,
                excludedFiles: report.excludedFiles.length
            });

            return report;

        } catch (error) {
            OrgUtils.logError('[VisbalExt.UnusedCodeService] analyzeWorkspace -- Error during analysis:', error);
            throw error;
        }
    }

    /**
     * Analyze the current file for unused code
     */
    public async analyzeCurrentFile(config?: Partial<UnusedCodeConfig>): Promise<UnusedSymbol[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        const defaultConfig: UnusedCodeConfig = {
            includePrivateMembers: true,
            includeTestMethods: false,
            includeAuraEnabledMethods: false,
            includeWebServiceMethods: false,
            excludePatterns: [
                '**/*Test.cls', 
                '**/*_Test.cls',
                '**/*test.cls',
                '**/*TestClass.cls',
                '**/*Tests.cls'
            ],
            scanScope: 'currentFile'
        };

        const finalConfig = { ...defaultConfig, ...config };
        
        OrgUtils.logDebug('[VisbalExt.UnusedCodeService] analyzeCurrentFile -- Starting analysis for current file');
        this.reportProgress('Analyzing current file...');

        const document = editor.document;
        const fileName = path.basename(document.fileName);
        const unusedSymbols: UnusedSymbol[] = [];

        try {
            // Extract symbols from current document
            const fileSymbols = await this.extractSymbolsFromDocument(document, finalConfig);
            this.reportProgress(`Found ${fileSymbols.length} symbols in ${fileName}`);

            // Check each symbol for references
            for (let i = 0; i < fileSymbols.length; i++) {
                const symbolInfo = fileSymbols[i];
                const progress = Math.floor((i / fileSymbols.length) * 100);
                this.reportProgress(`Checking ${symbolInfo.symbol}...`, progress);

                // Apply exclusion rules
                if (this.shouldExcludeSymbol(symbolInfo, finalConfig)) {
                    continue;
                }

                try {
                    const hasReferences = await this.checkSymbolHasReferences(
                        symbolInfo.symbol, 
                        symbolInfo.type, 
                        symbolInfo.className, 
                        document, 
                        symbolInfo.annotations
                    );

                    if (!hasReferences) {
                        unusedSymbols.push({
                            ...symbolInfo,
                            reason: this.generateUnusedReason(symbolInfo)
                        });
                    }
                } catch (error) {
                    OrgUtils.logError(`[VisbalExt.UnusedCodeService] Error checking references for ${symbolInfo.symbol}:`, error);
                }
            }

            this.reportProgress('Analysis complete', 100);
            OrgUtils.logDebug(`[VisbalExt.UnusedCodeService] analyzeCurrentFile -- Found ${unusedSymbols.length} unused symbols in ${fileName}`);

            return this.sortUnusedSymbols(unusedSymbols);

        } catch (error) {
            OrgUtils.logError('[VisbalExt.UnusedCodeService] analyzeCurrentFile -- Error during analysis:', error);
            throw error;
        }
    }

    /**
     * Find all Apex files in the workspace
     */
    private async findApexFiles(config: UnusedCodeConfig): Promise<vscode.Uri[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const excludePattern = '{**/node_modules/**,**/.sfdx/**,**/dist/**,**/out/**,**/build/**}';
        
        let allApexFiles: vscode.Uri[] = [];

        if (config.scanScope === 'directory' && config.targetDirectory) {
            // Scan specific directory
            const targetPattern = `${config.targetDirectory}/**/*.{cls,trigger}`;
            allApexFiles = await vscode.workspace.findFiles(targetPattern, excludePattern);
        } else {
            // Scan workspace - focus on Salesforce project structure
            allApexFiles = await vscode.workspace.findFiles('force-app/**/*.{cls,trigger}', excludePattern);
            
            // If no files found in force-app, try other common Salesforce directories
            if (allApexFiles.length === 0) {
                allApexFiles = await vscode.workspace.findFiles('src/**/*.{cls,trigger}', excludePattern);
            }
            
            // If still no files, fallback to broader search
            if (allApexFiles.length === 0) {
                allApexFiles = await vscode.workspace.findFiles('**/*.{cls,trigger}', excludePattern);
            }
        }

        return allApexFiles;
    }

    /**
     * Extract symbols from a document
     */
    private async extractSymbolsFromDocument(
        document: vscode.TextDocument, 
        config: UnusedCodeConfig
    ): Promise<Omit<UnusedSymbol, 'reason'>[]> {
        const symbols: Omit<UnusedSymbol, 'reason'>[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const fileName = path.basename(document.fileName);
        
        // Check if this is a test class (contains @isTest annotation at class level)
        if (this.isTestClass(text)) {
            OrgUtils.logDebug(`[VisbalExt.UnusedCodeService] extractSymbolsFromDocument -- Skipping test class: ${fileName}`);
            return symbols; // Return empty array for test classes
        }
        
        // Extract class-level information
        const classInfo = this.extractClassInfo(text);
        
        // Pattern matching for different symbol types
        const patterns = {
            method: /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?((?:virtual|abstract|override)\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/gm,
            property: /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:\{\s*(?:get|set)|\s*=|\s*;)/gm,
            class: /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?((?:virtual|abstract)\s+)?class\s+(\w+)/gm,
            variable: /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?(final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:=|\s*;)/gm
        };

        for (const [symbolType, pattern] of Object.entries(patterns)) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const lineIndex = text.substring(0, match.index).split('\n').length - 1;
                const lineText = lines[lineIndex];
                
                let symbolName: string;
                let visibility: string = '';
                let isStatic: boolean = false;
                let annotations: string[] = [];

                // Parse match groups based on symbol type
                switch (symbolType) {
                    case 'method':
                        annotations = this.parseAnnotations(match[1] || '');
                        visibility = match[2] || 'private';
                        isStatic = !!(match[3]?.trim());
                        symbolName = match[6];
                        break;
                    case 'property':
                        annotations = this.parseAnnotations(match[1] || '');
                        visibility = match[2] || 'private';
                        isStatic = !!(match[3]?.trim());
                        symbolName = match[5];
                        break;
                    case 'class':
                        annotations = this.parseAnnotations(match[1] || '');
                        visibility = match[2] || 'private';
                        symbolName = match[4];
                        break;
                    case 'variable':
                        annotations = this.parseAnnotations(match[1] || '');
                        visibility = match[2] || 'private';
                        isStatic = !!(match[3]?.trim());
                        symbolName = match[6];
                        break;
                    default:
                        continue;
                }

                // Skip if symbol name is empty or invalid
                if (!symbolName || symbolName.trim() === '') {
                    continue;
                }

                const position = new vscode.Position(lineIndex, match.index - text.substring(0, match.index).lastIndexOf('\n') - 1);
                const contextBefore = lineIndex > 0 ? lines[lineIndex - 1].trim() : '';
                const contextAfter = lineIndex < lines.length - 1 ? lines[lineIndex + 1].trim() : '';

                const isPublic = visibility.includes('public') || visibility.includes('global');
                const isTest = this.isTestSymbol(symbolName, annotations, text, lineIndex);

                symbols.push({
                    symbol: symbolName,
                    type: symbolType as 'method' | 'property' | 'class' | 'variable',
                    className: classInfo?.name,
                    filePath: document.uri.fsPath,
                    fileName,
                    position,
                    lineText: lineText.trim(),
                    contextBefore,
                    contextAfter,
                    annotations,
                    isPublic,
                    isStatic,
                    isTest
                });
            }
        }

        return symbols;
    }

    /**
     * Extract class information from document text
     */
    private extractClassInfo(text: string): { name: string; annotations: string[] } | null {
        const classPattern = /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?((?:virtual|abstract)\s+)?class\s+(\w+)/m;
        const match = classPattern.exec(text);
        
        if (match) {
            return {
                name: match[4],
                annotations: this.parseAnnotations(match[1] || '')
            };
        }
        
        return null;
    }

    /**
     * Parse annotations from annotation string
     */
    private parseAnnotations(annotationStr: string): string[] {
        const annotations: string[] = [];
        const annotationPattern = /@(\w+)/g;
        let match;
        
        while ((match = annotationPattern.exec(annotationStr)) !== null) {
            annotations.push(match[1]);
        }
        
        return annotations;
    }

    /**
     * Check if a document represents a test class
     */
    private isTestClass(text: string): boolean {
        // Check for @isTest annotation at class level
        const classTestPattern = /@istest\s+(?:(?:public|private|global)\s+)?(?:virtual\s+|abstract\s+)?class\s+/i;
        if (classTestPattern.test(text)) {
            return true;
        }
        
        // Check for @testVisible or @testSetup annotations which indicate test-related code
        const testAnnotationPattern = /@(testVisible|testSetup)/i;
        if (testAnnotationPattern.test(text)) {
            return true;
        }
        
        // Check if class name ends with Test
        const classNameTestPattern = /class\s+\w*test(?:\s|$)/i;
        if (classNameTestPattern.test(text)) {
            return true;
        }
        
        return false;
    }

    /**
     * Check if a symbol is a test symbol
     */
    private isTestSymbol(symbolName: string, annotations: string[], text: string, lineIndex: number): boolean {
        // Check annotations
        const hasTestAnnotation = annotations.some(ann => 
            ann.toLowerCase() === 'istest' || 
            ann.toLowerCase() === 'testsetup' ||
            ann.toLowerCase() === 'testvisible'
        );
        
        if (hasTestAnnotation) {
            return true;
        }
        
        // Check symbol name patterns
        const testNamePattern = /test/i;
        if (testNamePattern.test(symbolName)) {
            return true;
        }
        
        // Check if in test class
        const classTestPattern = /@istest|testmethod|class\s+\w*test/i;
        return classTestPattern.test(text);
    }

    /**
     * Check if a symbol has references using ReferencesService
     */
    private async checkSymbolHasReferences(
        symbol: string, 
        symbolType: string, 
        className?: string, 
        currentDocument?: vscode.TextDocument,
        annotations?: string[]
    ): Promise<boolean> {
        try {
            // For methods, we need to simulate having a cursor position to use ReferencesService
            if (currentDocument) {
                // Find the symbol in the document to get a position
                const text = currentDocument.getText();
                const symbolPattern = new RegExp(`\\b${symbol}\\b`, 'i');
                const match = symbolPattern.exec(text);
                
                if (match) {
                    // Temporarily set the active editor to this document and position
                    const editor = await vscode.window.showTextDocument(currentDocument, { preview: true, preserveFocus: true });
                    const position = currentDocument.positionAt(match.index);
                    editor.selection = new vscode.Selection(position, position);
                    
                    try {
                        // Use ReferencesService to find references
                        const result = await ReferencesService.findAllReferences();
                        return result !== null && result.references.length > 1; // More than just the definition
                    } catch (error) {
                        // If ReferencesService fails, fall back to manual search
                        return await this.manualReferenceCheck(symbol, symbolType, className, currentDocument, annotations);
                    }
                }
            }
            
            // Fallback to manual reference checking
            return await this.manualReferenceCheck(symbol, symbolType, className, currentDocument, annotations);
            
        } catch (error) {
            OrgUtils.logError(`[VisbalExt.UnusedCodeService] Error checking references for ${symbol}:`, error);
            // On error, assume it has references to be safe
            return true;
        }
    }

    /**
     * Manual reference checking as fallback
     */
    private async manualReferenceCheck(
        symbol: string, 
        symbolType: string, 
        className?: string,
        excludeDocument?: vscode.TextDocument,
        annotations?: string[]
    ): Promise<boolean> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return false;
            }

            // Search patterns based on symbol type
            let searchPatterns: string[] = [];
            
            switch (symbolType) {
                case 'method':
                    searchPatterns = [
                        `${symbol}\\s*\\(`, // Method call
                        `\\.\\s*${symbol}\\s*\\(`, // Object method call
                        `this\\.\\s*${symbol}\\s*\\(`
                    ];
                    if (className) {
                        searchPatterns.push(`${className}\\.\\s*${symbol}\\s*\\(`);
                    }
                    break;
                case 'property':
                    searchPatterns = [
                        `\\b${symbol}\\b(?!\\s*\\()`, // Property access (not method call)
                        `\\.\\s*${symbol}\\b(?!\\s*\\()`,
                        `this\\.\\s*${symbol}\\b(?!\\s*\\()`
                    ];
                    break;
                case 'class':
                    searchPatterns = [
                        `new\\s+${symbol}\\b`,
                        `${symbol}\\.\\w+`,
                        `\\b${symbol}\\s+\\w+`
                    ];
                    break;
                case 'variable':
                    searchPatterns = [`\\b${symbol}\\b`];
                    break;
            }

            // Search in workspace files
            const excludePattern = '{**/node_modules/**,**/.sfdx/**,**/dist/**,**/out/**,**/build/**}';
            const apexFiles = await vscode.workspace.findFiles('**/*.{cls,trigger}', excludePattern);
            
            for (const file of apexFiles) {
                // Skip the exclude document if specified
                if (excludeDocument && file.fsPath === excludeDocument.uri.fsPath) {
                    continue;
                }
                
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const text = document.getText();
                    
                    for (const pattern of searchPatterns) {
                        const regex = new RegExp(pattern, 'gi');
                        if (regex.test(text)) {
                            return true; // Found a reference
                        }
                    }
                } catch (error) {
                    // Skip files we can't read
                    continue;
                }
            }
            
            return false; // No references found
            
        } catch (error) {
            OrgUtils.logError(`[VisbalExt.UnusedCodeService] Error in manual reference check:`, error);
            return true; // On error, assume it has references
        }
    }

    /**
     * Check if a file should be excluded based on patterns
     */
    private shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
        const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
        const fileName = path.basename(filePath);
        
        // Always exclude test files (files ending with Test.cls, _Test.cls, etc.)
        if (fileName.toLowerCase().includes('test.cls')) {
            OrgUtils.logDebug(`[VisbalExt.UnusedCodeService] shouldExcludeFile -- Excluding test file: ${fileName}`);
            return true;
        }
        
        return excludePatterns.some(pattern => {
            // Convert glob pattern to regex
            const regexPattern = pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '[^/]');
            
            const regex = new RegExp(regexPattern, 'i');
            return regex.test(normalizedPath);
        });
    }

    /**
     * Check if a symbol should be excluded based on configuration
     */
    private shouldExcludeSymbol(symbol: Omit<UnusedSymbol, 'reason'>, config: UnusedCodeConfig): boolean {
        // Exclude test methods if configured
        if (!config.includeTestMethods && symbol.isTest) {
            return true;
        }

        // Exclude @AuraEnabled methods if configured
        if (!config.includeAuraEnabledMethods && symbol.annotations?.includes('AuraEnabled')) {
            return true;
        }

        // Exclude webservice methods if configured
        if (!config.includeWebServiceMethods && symbol.annotations?.some(ann => 
            ann.toLowerCase() === 'webservice' || ann.toLowerCase() === 'remoteaction'
        )) {
            return true;
        }

        // Exclude private members if configured
        if (!config.includePrivateMembers && !symbol.isPublic) {
            return true;
        }

        // Exclude constructors and special methods
        if (symbol.type === 'method') {
            const specialMethods = ['finalize', 'clone', 'hashcode', 'equals', 'tostring'];
            if (specialMethods.includes(symbol.symbol.toLowerCase())) {
                return true;
            }
            
            // Exclude constructors (same name as class)
            if (symbol.className && symbol.symbol.toLowerCase() === symbol.className.toLowerCase()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Generate reason text for why a symbol is considered unused
     */
    private generateUnusedReason(symbol: Omit<UnusedSymbol, 'reason'>): string {
        const reasons: string[] = [];
        
        if (symbol.isTest) {
            reasons.push('Test symbol with no references');
        } else if (symbol.annotations?.includes('AuraEnabled')) {
            reasons.push('@AuraEnabled method with no LWC references');
        } else if (!symbol.isPublic) {
            reasons.push('Private symbol with no internal references');
        } else {
            reasons.push('Public symbol with no references found');
        }

        if (symbol.annotations && symbol.annotations.length > 0) {
            reasons.push(`Annotations: @${symbol.annotations.join(', @')}`);
        }

        return reasons.join(' • ');
    }

    /**
     * Sort unused symbols for display
     */
    private sortUnusedSymbols(symbols: UnusedSymbol[]): UnusedSymbol[] {
        return symbols.sort((a, b) => {
            // Sort by file name first
            const fileCompare = a.fileName.localeCompare(b.fileName);
            if (fileCompare !== 0) return fileCompare;
            
            // Then by symbol type (methods first, then properties, etc.)
            const typeOrder = { method: 1, property: 2, class: 3, variable: 4 };
            const typeCompare = (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
            if (typeCompare !== 0) return typeCompare;
            
            // Finally by line number
            return a.position.line - b.position.line;
        });
    }
}
