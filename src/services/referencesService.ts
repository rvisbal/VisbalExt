import * as vscode from 'vscode';
import * as path from 'path';
import { SymbolNavigationService } from './symbolNavigationService';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Interface for a reference location
 */
export interface ReferenceLocation {
    filePath: vscode.Uri;
    position: vscode.Position;
    lineText: string;
    fileName: string;
    contextBefore: string;
    contextAfter: string;
}

/**
 * Interface for symbol information used in references
 */
export interface SymbolReference {
    symbol: string;
    type: string;
    className?: string;
    contextDescription: string;
    references: ReferenceLocation[];
}

/**
 * ReferencesService - Finds all references to a selected symbol in the codebase
 * Built on top of SymbolNavigationService for symbol identification
 */
export class ReferencesService {
    /**
     * Initialize the ReferencesService with dependencies
     */
    public static initialize(): void {
        // Initialize SymbolNavigationService with OrgUtils logging
        SymbolNavigationService.initialize(
            (message: string, ...args: any[]) => {
                OrgUtils.logDebug(`[References-Symbol] ${message}`, ...args);
            },
            (message: string, error: any) => {
                OrgUtils.logError(`[References-Symbol] ${message}`, error);
            }
        );
    }

    /**
     * Finds all references to the symbol at the current cursor position
     * @returns Promise<SymbolReference | null> The symbol and its references, or null if no symbol found
     */
    public static async findAllReferences(): Promise<SymbolReference | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        OrgUtils.logDebug('[VisbalExt.ReferencesService] findAllReferences -- Starting reference search');

        // Step 1: Use SymbolNavigationService to identify the symbol
        const symbolInfo = await this.identifySymbolFromCursor(editor);
        if (!symbolInfo) {
            throw new Error('No symbol found at cursor position. Please place cursor on a method, property, class, or other symbol.');
        }

        const { symbol, type, className } = symbolInfo;
        const searchContext = className ? `${className}.${symbol}` : symbol;
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] findAllReferences -- Found symbol: ${searchContext} (type: ${type})`);

        // Step 2: Search for all references to this symbol
        const references = await this.searchForReferences(symbol, type, className, editor);

        return {
            symbol,
            type,
            className,
            contextDescription: searchContext,
            references
        };
    }

    /**
     * Identifies the symbol at the cursor position using existing navigation logic
     */
    private static async identifySymbolFromCursor(editor: vscode.TextEditor): Promise<{symbol: string, type: string, className?: string} | null> {
        const position = editor.selection.active;
        
        try {
            // Use the SymbolNavigationService's public extractSymbolInfo method
            const symbolInfo = SymbolNavigationService.extractSymbolInfo(editor.document, position);
            
            if (!symbolInfo) {
                return null;
            }
            
            return {
                symbol: symbolInfo.symbol,
                type: symbolInfo.type,
                className: symbolInfo.className
            };
        } catch (error) {
            OrgUtils.logError('[VisbalExt.ReferencesService] identifySymbolFromCursor -- Error identifying symbol:', error);
            return null;
        }
    }


    /**
     * Searches for all references to a symbol across the codebase
     */
    private static async searchForReferences(
        symbol: string,
        symbolType: string,
        className?: string,
        currentEditor?: vscode.TextEditor
    ): Promise<ReferenceLocation[]> {
        
        const references: ReferenceLocation[] = [];
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchForReferences -- Searching for ${symbolType} '${symbol}' ${className ? `in class '${className}'` : 'globally'}`);
        
        // Step 1: Search in current file first (for performance)
        if (currentEditor) {
            const localRefs = await this.searchInDocument(currentEditor.document, symbol, symbolType, className);
            references.push(...localRefs);
            OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchForReferences -- Found ${localRefs.length} references in current file`);
        }
        
        // Step 2: Search in workspace files
        const workspaceRefs = await this.searchInWorkspace(symbol, symbolType, className, currentEditor?.document.uri);
        references.push(...workspaceRefs);
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchForReferences -- Found ${references.length} total references before deduplication`);
        
        // Step 3: Remove duplicates based on file path and line number
        const deduplicatedRefs = this.removeDuplicateReferences(references);
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchForReferences -- Found ${deduplicatedRefs.length} unique references after deduplication`);
        
        // Sort references by file name, then by line number
        deduplicatedRefs.sort((a, b) => {
            const fileCompare = a.fileName.localeCompare(b.fileName);
            if (fileCompare !== 0) return fileCompare;
            return a.position.line - b.position.line;
        });
        
        return deduplicatedRefs;
    }

    /**
     * Searches for references in a specific document
     */
    private static async searchInDocument(
        document: vscode.TextDocument,
        symbol: string,
        symbolType: string,
        className?: string
    ): Promise<ReferenceLocation[]> {
        
        const references: ReferenceLocation[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const processedLines = new Set<number>(); // Track lines we've already found matches on
        
        // Create search patterns based on symbol type
        const searchPatterns = this.createSearchPatterns(symbol, symbolType, className);
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            
            // Skip if we've already found a reference on this line
            if (processedLines.has(lineIndex)) {
                continue;
            }
            
            // Check all patterns, but only keep the first match per line
            for (const pattern of searchPatterns) {
                const regex = new RegExp(pattern.regex);
                const match = regex.exec(lineText);
                
                if (match) {
                    const matchStart = match.index;
                    const position = new vscode.Position(lineIndex, matchStart);
                    
                    // Get context lines
                    const contextBefore = lineIndex > 0 ? lines[lineIndex - 1] : '';
                    const contextAfter = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';
                    
                    references.push({
                        filePath: document.uri,
                        position,
                        lineText: lineText.trim(),
                        fileName: document.fileName.split(/[\/\\]/).pop() || document.fileName,
                        contextBefore: contextBefore.trim(),
                        contextAfter: contextAfter.trim()
                    });
                    
                    processedLines.add(lineIndex);
                    break; // Only one match per line
                }
            }
        }
        
        return references;
    }

    /**
     * Searches for references in raw file content (Node.js file reading)
     */
    private static async searchInFileContent(
        fileContent: string,
        filePath: string,
        symbol: string,
        symbolType: string,
        className?: string
    ): Promise<ReferenceLocation[]> {
        
        const references: ReferenceLocation[] = [];
        const lines = fileContent.split('\n');
        const processedLines = new Set<number>(); // Track lines we've already found matches on
        
        // Create search patterns based on symbol type
        const searchPatterns = this.createSearchPatterns(symbol, symbolType, className);
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            
            // Skip if we've already found a reference on this line
            if (processedLines.has(lineIndex)) {
                continue;
            }
            
            // Check all patterns, but only keep the first match per line
            for (const pattern of searchPatterns) {
                const regex = new RegExp(pattern.regex);
                const match = regex.exec(lineText);
                
                if (match) {
                    const matchStart = match.index;
                    const position = new vscode.Position(lineIndex, matchStart);
                    
                    // Get context lines
                    const contextBefore = lineIndex > 0 ? lines[lineIndex - 1] : '';
                    const contextAfter = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';
                    
                    references.push({
                        filePath: vscode.Uri.file(filePath),
                        position,
                        lineText: lineText.trim(),
                        fileName: filePath.split(/[\/\\]/).pop() || filePath,
                        contextBefore: contextBefore.trim(),
                        contextAfter: contextAfter.trim()
                    });
                    
                    processedLines.add(lineIndex);
                    break; // Only one match per line
                }
            }
        }
        
        return references;
    }

    /**
     * Searches for references across the workspace
     */
    private static async searchInWorkspace(
        symbol: string,
        symbolType: string,
        className?: string,
        excludeUri?: vscode.Uri
    ): Promise<ReferenceLocation[]> {
        
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        
        const references: ReferenceLocation[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        
        // Lightweight search focusing only on primary Apex classes to avoid triggering external processes
        // Only search .cls files in the main classes directory for performance and to prevent command windows
        
        const classesPath = 'force-app/main/default/classes';
        const classesDir = path.join(workspaceFolder.uri.fsPath, classesPath);
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchInWorkspace -- Searching in ${classesPath} directory`);
        
        try {
            // Use Node.js fs instead of VS Code workspace API to avoid external processes
            const fs = await import('fs');
            const fsPromises = fs.promises;
            
            if (await this.directoryExists(classesDir)) {
                const files = await fsPromises.readdir(classesDir);
                const clsFiles = files.filter(file => file.endsWith('.cls'));
                
                for (const fileName of clsFiles) {
                    const filePath = path.join(classesDir, fileName);
                    const fileUri = vscode.Uri.file(filePath);
                    
                    // Skip the current file if we already searched it
                    if (excludeUri && path.normalize(filePath) === path.normalize(excludeUri.fsPath)) {
                        OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchInWorkspace -- Skipping current file: ${filePath}`);
                        continue;
                    }
                    
                    try {
                        // Read file directly with Node.js to avoid VS Code workspace operations that trigger external processes
                        const fileContent = await fsPromises.readFile(filePath, 'utf8');
                        const fileRefs = await this.searchInFileContent(fileContent, filePath, symbol, symbolType, className);
                        references.push(...fileRefs);
                    } catch (error) {
                        OrgUtils.logError(`[VisbalExt.ReferencesService] searchInWorkspace -- Error reading file ${filePath}:`, error);
                    }
                }
            } else {
                OrgUtils.logDebug(`[VisbalExt.ReferencesService] searchInWorkspace -- Classes directory not found: ${classesDir}`);
            }
        } catch (error) {
            OrgUtils.logError(`[VisbalExt.ReferencesService] searchInWorkspace -- Error accessing classes directory:`, error);
        }
        
        return references;
    }

    /**
     * Removes duplicate references based on file path and line number
     */
    private static removeDuplicateReferences(references: ReferenceLocation[]): ReferenceLocation[] {
        const seen = new Set<string>();
        const uniqueRefs: ReferenceLocation[] = [];
        
        for (const ref of references) {
            // Create unique key based on normalized file path, line number, and line content
            // Using line content instead of character position for more robust deduplication
            const normalizedPath = path.normalize(ref.filePath.fsPath);
            const trimmedLineText = ref.lineText.trim();
            const key = `${normalizedPath}:${ref.position.line}:${trimmedLineText}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                uniqueRefs.push(ref);
                OrgUtils.logDebug(`[VisbalExt.ReferencesService] removeDuplicateReferences -- Keeping reference: ${ref.fileName}:${ref.position.line + 1} - ${trimmedLineText.substring(0, 50)}...`);
            } else {
                OrgUtils.logDebug(`[VisbalExt.ReferencesService] removeDuplicateReferences -- Removed duplicate: ${ref.fileName}:${ref.position.line + 1} - ${trimmedLineText.substring(0, 50)}...`);
            }
        }
        
        OrgUtils.logDebug(`[VisbalExt.ReferencesService] removeDuplicateReferences -- Processed ${references.length} references, kept ${uniqueRefs.length} unique ones`);
        return uniqueRefs;
    }

    /**
     * Checks if a directory exists without triggering external processes
     */
    private static async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const fs = await import('fs');
            const stats = await fs.promises.stat(dirPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Creates search patterns based on symbol type and context
     */
    private static createSearchPatterns(symbol: string, symbolType: string, className?: string): Array<{regex: string, description: string}> {
        const patterns: Array<{regex: string, description: string}> = [];
        
        // Escape special regex characters in symbol name
        const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        switch (symbolType) {
            case 'method':
                // Method calls: symbol(), object.symbol(), this.symbol()
                patterns.push(
                    { regex: `\\b${escapedSymbol}\\s*\\(`, description: 'Method call' },
                    { regex: `\\.\\s*${escapedSymbol}\\s*\\(`, description: 'Method call on object' },
                    { regex: `this\\.\\s*${escapedSymbol}\\s*\\(`, description: 'Method call on this' }
                );
                
                // Method declarations: public/private type symbol(
                patterns.push(
                    { regex: `(?:public|private|protected)\\s+\\w+\\s+${escapedSymbol}\\s*\\(`, description: 'Method declaration' }
                );
                
                // Class-specific method calls if className provided
                if (className) {
                    patterns.push(
                        { regex: `${className}\\.\\s*${escapedSymbol}\\s*\\(`, description: `Static method call on ${className}` }
                    );
                }
                break;
                
            case 'property':
                // Property access: symbol, object.symbol, this.symbol
                patterns.push(
                    { regex: `\\b${escapedSymbol}\\b(?!\\s*\\()`, description: 'Property access' },
                    { regex: `\\.\\s*${escapedSymbol}\\b(?!\\s*\\()`, description: 'Property access on object' },
                    { regex: `this\\.\\s*${escapedSymbol}\\b(?!\\s*\\()`, description: 'Property access on this' }
                );
                
                // Property declarations
                patterns.push(
                    { regex: `(?:public|private|protected)\\s+\\w+\\s+${escapedSymbol}\\b`, description: 'Property declaration' }
                );
                break;
                
            case 'class':
                // Class usage: new Symbol(), Symbol.method(), Symbol variable
                patterns.push(
                    { regex: `\\bnew\\s+${escapedSymbol}\\b`, description: 'Class instantiation' },
                    { regex: `${escapedSymbol}\\.\\w+`, description: 'Static member access' },
                    { regex: `\\b${escapedSymbol}\\s+\\w+`, description: 'Variable declaration' }
                );
                
                // Class declaration
                patterns.push(
                    { regex: `\\bclass\\s+${escapedSymbol}\\b`, description: 'Class declaration' }
                );
                break;
                
            case 'variable':
                // Variable usage
                patterns.push(
                    { regex: `\\b${escapedSymbol}\\b`, description: 'Variable usage' }
                );
                break;
        }
        
        return patterns;
    }
}
