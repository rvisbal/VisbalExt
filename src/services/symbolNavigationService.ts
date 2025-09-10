import * as vscode from 'vscode';

/**
 * SymbolNavigationService - Handles file navigation and symbol search operations
 */
export class SymbolNavigationService {
    private static logDebug: (message: string, ...args: any[]) => void;
    private static logError: (message: string, error: any) => void;

    /**
     * Symbol types that can be navigated to
     */
    private static readonly SymbolType = {
        METHOD: 'method',
        PROPERTY: 'property',
        CLASS: 'class',
        VARIABLE: 'variable',
        CSS_CLASS: 'css-class',
        CSS_ID: 'css-id',
        FUNCTION: 'function'
    } as const;

    /**
     * File type mappings - what file types to search for each source file type
     */
    private static readonly FILE_TYPE_MAPPINGS = {
        'cls': ['cls'],
        'html': ['js', 'css', 'html'],
        'htm': ['js', 'css', 'html'],
        'js': ['js', 'css'],
        'css': ['css'],
        'scss': ['scss', 'css'],
        'less': ['less', 'css'],
        'ts': ['ts', 'js'],
        'jsx': ['jsx', 'js'],
        'tsx': ['tsx', 'ts', 'js']
    };

    /**
     * Initialize the SymbolNavigationService with dependencies
     */
    public static initialize(
        logDebug: (message: string, ...args: any[]) => void,
        logError: (message: string, error: any) => void
    ): void {
        this.logDebug = logDebug;
        this.logError = logError;
    }

    /**
     * Manually extracts a word from a line when VS Code's word detection fails
     */
    private static extractWordManually(line: string, character: number): {word: string, start: number, end: number} | null {
        // Define word character pattern (alphanumeric and underscore)
        const wordCharPattern = /[a-zA-Z0-9_]/;
        
        this.logDebug(`[VisbalExt.SymbolNavigationService] extractWordManually -- Attempting manual extraction at character ${character} in line: "${line}"`);
        
        // If cursor is not on a word character, return null
        if (character >= line.length || !wordCharPattern.test(line[character])) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractWordManually -- Character at position ${character} is not a word character: "${line[character] || 'END_OF_LINE'}" (charCode: ${line.charCodeAt(character) || 'N/A'})`);
            return null;
        }
        
        this.logDebug(`[VisbalExt.SymbolNavigationService] extractWordManually -- Character at position ${character} IS a word character: "${line[character]}"`);
        
        // Find word start by going backwards
        let start = character;
        while (start > 0 && wordCharPattern.test(line[start - 1])) {
            start--;
        }
        
        // Find word end by going forwards
        let end = character;
        while (end < line.length && wordCharPattern.test(line[end])) {
            end++;
        }
        
        const word = line.substring(start, end);
        this.logDebug(`[VisbalExt.SymbolNavigationService] extractWordManually -- Extracted word: "${word}" from ${start} to ${end}`);
        return word.length > 0 ? { word, start, end } : null;
    }
    
    /**
     * Extracts the symbol and its type from the current cursor position
     */
    private static extractSymbolFromCursor(document: vscode.TextDocument, position: vscode.Position): {symbol: string, type: string, isThisReference: boolean, className?: string, variableToTrace?: string} | null {
        let wordRange = document.getWordRangeAtPosition(position);
        let word: string;
        
        if (!wordRange) {
            const line = document.lineAt(position.line).text;
            const character = position.character;
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- VS Code getWordRangeAtPosition() returned null at position ${position.line}:${position.character}`);
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Line: "${line}"`);
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Character at cursor: "${line[character] || 'END_OF_LINE'}" (charCode: ${line.charCodeAt(character) || 'N/A'})`);
            
            // Try manual word extraction for cases where VS Code's word detection fails
            // This is particularly useful for method calls with parentheses immediately following
            const manualWordMatch = this.extractWordManually(line, character);
            if (manualWordMatch) {
                word = manualWordMatch.word;
                wordRange = new vscode.Range(
                    new vscode.Position(position.line, manualWordMatch.start),
                    new vscode.Position(position.line, manualWordMatch.end)
                );
                this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Manual extraction SUCCEEDED: word="${word}" at ${manualWordMatch.start}-${manualWordMatch.end}`);
            } else {
                this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Manual extraction also FAILED`);
                return null;
            }
        } else {
            word = document.getText(wordRange);
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- VS Code getWordRangeAtPosition() SUCCEEDED: found word "${word}" at range ${wordRange.start.line}:${wordRange.start.character}-${wordRange.end.line}:${wordRange.end.character}`);
        }
        
        const line = document.lineAt(position.line).text;
        const fileExtension = document.fileName.split('.').pop()?.toLowerCase();
        
        this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Found word: "${word}" at position ${position.line}:${position.character} in .${fileExtension} file`);
        
        // Check if this is a "this." reference
        const wordStart = wordRange.start.character;
        const beforeWord = line.substring(0, wordStart);
        const isThisReference = /\bthis\.\s*$/.test(beforeWord);
        
        // Check if this is a class-prefixed method call (e.g., ClassName.methodName)
        let className: string | undefined;
        const classPrefixMatch = beforeWord.match(/\b([A-Z][a-zA-Z0-9_]*)\.\s*$/);
        if (classPrefixMatch) {
            className = classPrefixMatch[1];
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Detected class-prefixed call: ${className}.${word}`);
        }
        
        // Determine symbol type based on context and file type first
        const symbolInfo = this.determineSymbolType(word, line, wordRange, fileExtension || '');
        if (!symbolInfo) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- determineSymbolType returned null for word: "${word}", line: "${line}", fileExtension: "${fileExtension || 'UNKNOWN'}"`);
            return null;
        }
        
        this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Determined symbol type: ${symbolInfo.type} for word: "${word}"`);
        
        // Enhanced variable type tracing - look for variable assignments in the document
        // This is particularly useful for singleton patterns like Logger.getInstance()
        // This should happen BEFORE the old extractInstantiatedClassName to prioritize variable tracing
        if (!className) {
            // Extract the variable name that precedes the word (the object being accessed)
            const beforeWordMatch = beforeWord.match(/\b([A-Za-z0-9_]+)\.\s*$/);
            if (beforeWordMatch) {
                const variableName = beforeWordMatch[1];
                
                // Check if this looks like a variable name (starts with lowercase) vs class name (starts with uppercase)
                if (/^[a-z]/.test(variableName)) {
                    // Store variable name for async resolution during navigation
                    this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Variable ${variableName} will be traced during navigation for ${word}`);
                    // Return variableName as a marker for later async resolution
                    return { 
                        symbol: word, 
                        type: symbolInfo.type, 
                        isThisReference, 
                        className: undefined,
                        variableToTrace: variableName
                    };
                } else {
                    // Looks like a class name (starts with uppercase), treat as direct class reference
                    className = variableName;
                    this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Detected class-prefixed call: ${className}.${word}`);
                }
            }
        }
        
        // Check for instantiated class variable (e.g., `MyClass var = new MyClass(); var.property`)
        // This is now secondary to variable tracing
        if (!className) {
            const instantiatedClassName = this.extractInstantiatedClassName(line, word, wordRange);
            if (instantiatedClassName) {
                className = instantiatedClassName;
                this.logDebug(`[VisbalExt.SymbolNavigationService] extractSymbolFromCursor -- Detected instantiated class variable: ${className}.${word}`);
            }
        }
        
        return { ...symbolInfo, isThisReference, className };
    }

    /**
     * Determines the type of symbol based on context
     */
    private static determineSymbolType(word: string, line: string, wordRange: vscode.Range, fileExtension: string): {symbol: string, type: string} | null {
        const wordEnd = wordRange.end.character;
        const afterWord = line.substring(wordEnd).trim();
        
        switch (fileExtension) {
            case 'cls':
            case 'apex':
                // Apex/Salesforce class file
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.METHOD };
                }
                
                // Check for explicit class declaration
                if (line.includes('class ') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                
                // Check if word is being used as a type declaration (likely a class name)
                // Patterns: "ClassName variableName = ..." or "ClassName variableName;" 
                // or in generics: "List<ClassName>" etc.
                const wordStart = wordRange.start.character;
                const beforeWord = line.substring(0, wordStart).trim();
                const afterWordFull = line.substring(wordRange.end.character);
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Analyzing '${word}' | beforeWord: "${beforeWord}" | afterWord: "${afterWordFull}"`);
                
                // Pattern 1: Word is at start of line or after access modifiers (type declaration)
                const typeDeclarationPattern = /^(\s*(public|private|protected|global|static|final)?\s*)$/;
                if (typeDeclarationPattern.test(beforeWord) && /^[A-Z]/.test(word)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Pattern 1 matched: type declaration with access modifiers`);
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                
                // Pattern 2: Check if word is followed by variable name (ClassName variableName)
                const typeDeclarationFollowPattern = /^\s+[a-z][a-zA-Z0-9_]*\s*[=;]/.test(afterWordFull);
                if (typeDeclarationFollowPattern && /^[A-Z]/.test(word)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Pattern 2 matched: type declaration followed by variable name`);
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                
                // Pattern 3: Word appears inside generic brackets: List<ClassName>, Map<String,ClassName>
                const genericPattern = new RegExp(`<[^>]*\\b${word}\\b[^>]*>`, 'i');
                if (genericPattern.test(line) && /^[A-Z]/.test(word)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Pattern 3 matched: class name in generics`);
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- No class patterns matched, defaulting to PROPERTY`);
                
                return { symbol: word, type: this.SymbolType.PROPERTY };
                
            case 'html':
            case 'htm':
                // HTML file - check for class, id, or function references
                if (line.includes(`class=`) && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_CLASS };
                }
                if (line.includes(`id=`) && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_ID };
                }
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            case 'js':
            case 'ts':
            case 'jsx':
            case 'tsx':
                // JavaScript/TypeScript file
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                if (line.includes('class ') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            case 'css':
            case 'scss':
            case 'less':
                // CSS file
                if (line.trim().startsWith('.') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_CLASS };
                }
                if (line.trim().startsWith('#') && line.includes(word)) {
                    return { symbol: word, type: this.SymbolType.CSS_ID };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
                
            default:
                // Generic fallback
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                return { symbol: word, type: this.SymbolType.VARIABLE };
        }
    }

    /**
     * Gets file extensions to search based on source file extension
     */
    private static getTargetFileExtensions(sourceExtension: string): string[] {
        return this.FILE_TYPE_MAPPINGS[sourceExtension as keyof typeof this.FILE_TYPE_MAPPINGS] || [sourceExtension];
    }

    /**
     * Searches for a symbol in a list of files
     */
    private static async searchInFiles(files: vscode.Uri[], symbol: string, symbolType: string, currentDocument?: vscode.TextDocument, className?: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        for (const file of files) {
            // Skip current file if we already searched it
            if (currentDocument && file.fsPath === currentDocument.uri.fsPath) {
                continue;
            }
            
            // Skip the specific class file if we already searched it for class-prefixed calls
            if (className && file.fsPath.includes(`${className}.cls`)) {
                continue;
            }
            
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                
                // Try each search pattern in priority order
                for (const searchPattern of searchPatterns) {
                    // Reset regex lastIndex to ensure proper matching
                    searchPattern.lastIndex = 0;
                    const match = searchPattern.exec(text);
                    if (match) {
                        const position = document.positionAt(match.index);
                        this.logDebug(`[VisbalExt.SymbolNavigationService] searchInFiles -- Found ${symbol} in ${file.fsPath} using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                        return { filePath: file, position };
                    }
                }
            } catch (error) {
                // Skip files that can't be opened
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInFiles -- Could not read file: ${file.fsPath}`, error);
                continue;
            }
        }
        
        return null;
    }

    /**
     * Creates search patterns for different symbol types
     */
    private static createSearchPatterns(symbol: string, symbolType: string): RegExp[] {
        const patterns: RegExp[] = [];
        
        switch (symbolType) {
            case this.SymbolType.METHOD:
                // Apex method definition - prioritize proper method signatures
                // Pattern 1: Method with access modifier and return type
                patterns.push(new RegExp(
                    `^\\s*(public|private|protected|global)\\s+(static\\s+)?(override\\s+)?[\\w<>\\[\\]_]+\\s+${symbol}\\s*\\(`,
                    'im'
                ));
                // Pattern 2: Method with just access modifier (for void methods)
                patterns.push(new RegExp(
                    `^\\s*(public|private|protected|global)\\s+(static\\s+)?(override\\s+)?${symbol}\\s*\\(`,
                    'im'
                ));
                // Pattern 3: Fallback - any method-like pattern
                patterns.push(new RegExp(
                    `\\s*[\\w<>\\[\\]_]+\\s+${symbol}\\s*\\(`,
                    'i'
                ));
                break;
                
            case this.SymbolType.FUNCTION:
                // JavaScript/TypeScript function definitions - prioritize actual definitions
                // Pattern 1: Function declaration
                patterns.push(new RegExp(`^\\s*function\\s+${symbol}\\s*\\(`, 'im'));
                // Pattern 2: Method definition in class/object
                patterns.push(new RegExp(`^\\s*${symbol}\\s*\\([^)]*\\)\\s*{`, 'im'));
                // Pattern 3: Arrow function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*\\([^)]*\\)\\s*=>`, 'im'));
                // Pattern 4: Function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*function`, 'im'));
                // Pattern 5: Object method
                patterns.push(new RegExp(`${symbol}\\s*:\\s*function\\s*\\(`, 'i'));
                // Pattern 6: Fallback - any assignment
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*function`, 'i'));
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*\\(.*\\)\\s*=>`, 'i'));
                break;
                
            case this.SymbolType.CLASS:
                // Class definitions - prioritize actual class declarations
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|global\\s+)?(abstract\\s+)?class\\s+${symbol}\\b`, 'im'));
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|export\\s+)?(abstract\\s+)?interface\\s+${symbol}\\b`, 'im'));
                patterns.push(new RegExp(`class\\s+${symbol}\\b`, 'i'));
                patterns.push(new RegExp(`interface\\s+${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.CSS_CLASS:
                // CSS class definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^\\.${symbol}\\b[^{]*{`, 'im'));
                patterns.push(new RegExp(`\\.${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.CSS_ID:
                // CSS ID definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^#${symbol}\\b[^{]*{`, 'im'));
                patterns.push(new RegExp(`#${symbol}\\b`, 'i'));
                break;
                
            case this.SymbolType.PROPERTY:
            case this.SymbolType.VARIABLE:
                // Property/variable definitions - prioritize actual declarations
                // Pattern 1: Apex property/field with access modifier
                patterns.push(new RegExp(`^\\s*(public|private|protected|global)\\s+(static\\s+)?[\\w<>\\[\\]]+\\s+${symbol}\\b`, 'im'));
                // Pattern 2: JavaScript/TypeScript variable declarations
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\b`, 'im'));
                // Pattern 3: Property assignment
                patterns.push(new RegExp(`^\\s*${symbol}\\s*[:=]`, 'im'));
                // Pattern 4: Fallback patterns
                patterns.push(new RegExp(`\\b${symbol}\\s*[:=]`, 'i'));
                break;
        }
        
        return patterns;
    }

    /**
     * Searches for a symbol definition in the current file first
     */
    private static searchInCurrentFile(document: vscode.TextDocument, symbol: string, symbolType: string): {filePath: vscode.Uri, position: vscode.Position} | null {
        const text = document.getText();
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        for (const searchPattern of searchPatterns) {
            searchPattern.lastIndex = 0;
            const match = searchPattern.exec(text);
            if (match) {
                const position = document.positionAt(match.index);
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInCurrentFile -- Found ${symbol} in current file using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                return { filePath: document.uri, position };
            }
        }
        
        return null;
    }

    /**
     * Searches for a symbol definition in a specific class file
     */
    private static async searchInSpecificClass(className: string, symbol: string, symbolType: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        
        try {
            // Hierarchical search for specific class file:
            // 1. force-app/main/default/classes/ (user classes)
            // 2. .sfdx/tools/StandardApexLibrary/ (standard library fallback)
            
            // Step 1: Look in user classes first
            let userClassPattern = new vscode.RelativePattern(workspaceFolder, `force-app/main/default/classes/${className}.cls`);
            let userClassFiles = await vscode.workspace.findFiles(userClassPattern);
            
            // Step 2: Fallback to standard library
            let standardLibPattern = new vscode.RelativePattern(workspaceFolder, `.sfdx/tools/*/StandardApexLibrary/**/${className}.cls`);
            let standardLibFiles = await vscode.workspace.findFiles(standardLibPattern);
            
            // Combine results, prioritizing user classes
            const allClassFiles = [...userClassFiles, ...standardLibFiles];
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Found ${userClassFiles.length} user class files and ${standardLibFiles.length} standard library files for ${className}.cls`);
            
            if (allClassFiles.length === 0) {
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Class file ${className}.cls not found in user code or standard library`);
                return null;
            }

            // Search in the first matching class file (user classes have priority)
            const classFile = allClassFiles[0];
            try {
                const document = await vscode.workspace.openTextDocument(classFile);
                const text = document.getText();
                const searchPatterns = this.createSearchPatterns(symbol, symbolType);
                
                for (const searchPattern of searchPatterns) {
                    searchPattern.lastIndex = 0;
                    const match = searchPattern.exec(text);
                    if (match) {
                        const position = document.positionAt(match.index);
                        this.logDebug(`[VisbalExt.SymbolNavigationService] Found ${symbol} in ${className}.cls using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                        return { filePath: classFile, position };
                    }
                }
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Symbol ${symbol} not found in ${className}.cls`);
            } catch (error) {
                this.logError(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Could not read class file: ${classFile.fsPath}`, error as Error);
            }
        } catch (error) {
            this.logError(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Error searching in specific class ${className}:`, error as Error);
        }
        
        return null;
    }

    /**
     * Searches for a symbol definition across appropriate file types in the workspace
     */
    private static async findSymbolDefinition(symbol: string, symbolType: string, sourceFileExtension: string, currentDocument?: vscode.TextDocument, isThisReference: boolean = false, className?: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        
        // For class-prefixed calls (e.g., ClassName.methodName), search the specific class first
        if (className && sourceFileExtension === 'cls') {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Searching for '${className}.${symbol}' in ${className}.cls first`);
            const classResult = await this.searchInSpecificClass(className, symbol, symbolType);
            if (classResult) {
                return classResult;
            }
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- '${className}.${symbol}' not found in ${className}.cls, expanding search`);
        }
        
        // For "this." references, search current file first
        if (isThisReference && currentDocument) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Searching for 'this.${symbol}' in current file first`);
            const currentFileResult = this.searchInCurrentFile(currentDocument, symbol, symbolType);
            if (currentFileResult) {
                return currentFileResult;
            }
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- 'this.${symbol}' not found in current file, expanding search`);
        }
        
        // For regular method calls (no class prefix, no "this."), always search current file first to avoid expensive workspace searches
        if (!className && !isThisReference && currentDocument) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Searching for '${symbol}' in current file first (optimization)`);
            const currentFileResult = this.searchInCurrentFile(currentDocument, symbol, symbolType);
            if (currentFileResult) {
                return currentFileResult;
            }
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- '${symbol}' not found in current file, expanding to workspace search`);
        }

        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const targetExtensions = this.getTargetFileExtensions(sourceFileExtension);
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        if (searchPatterns.length === 0) {
            return null;
        }
        
        try {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Starting workspace search for '${symbol}' in extensions: ${targetExtensions.join(', ')}`);
            
            // Hierarchical search strategy: 
            // 1. force-app/main/default/classes/ (user classes)
            // 2. force-app/main/default/ (other user metadata)  
            // 3. .sfdx/tools/StandardApexLibrary/ (standard library fallback)
            
            for (const extension of targetExtensions) {
                // Step 1: Search force-app/main/default/classes for user classes
                let userClassPattern = new vscode.RelativePattern(workspaceFolder, `force-app/main/default/classes/*.${extension}`);
                let userClassFiles = await vscode.workspace.findFiles(userClassPattern);
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Found ${userClassFiles.length} .${extension} files in force-app/main/default/classes/`);
                
                // Step 2: Search broader force-app/main/default for other types
                let userMetadataPattern = new vscode.RelativePattern(workspaceFolder, `force-app/main/default/**/*.${extension}`);
                let userMetadataFiles = await vscode.workspace.findFiles(userMetadataPattern);
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Found ${userMetadataFiles.length} .${extension} files in force-app/main/default/`);
                
                // Combine user files (classes + other metadata), removing duplicates
                const userFiles = Array.from(new Set([...userClassFiles, ...userMetadataFiles].map(f => f.fsPath)))
                    .map(fsPath => vscode.Uri.file(fsPath));
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Total unique user files: ${userFiles.length}`);
                
                // Search user files first
                if (userFiles.length > 0) {
                    const userResult = await this.searchInFiles(userFiles, symbol, symbolType, currentDocument, className);
                    if (userResult) {
                        return userResult;
                    }
                }
                
                // Step 3: Fallback to standard library if not found in user code
                let standardLibPattern = new vscode.RelativePattern(workspaceFolder, `.sfdx/tools/*/StandardApexLibrary/**/*.${extension}`);
                let standardLibFiles = await vscode.workspace.findFiles(standardLibPattern);
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Found ${standardLibFiles.length} .${extension} files in StandardApexLibrary (fallback)`);
                
                if (standardLibFiles.length > 0) {
                    const standardLibResult = await this.searchInFiles(standardLibFiles, symbol, symbolType, currentDocument, className);
                    if (standardLibResult) {
                        return standardLibResult;
                    }
                }
            }
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Workspace search completed. Symbol '${symbol}' not found in user code or standard library.`);
        } catch (error) {
            this.logError('[VisbalExt.SymbolNavigationService] Error searching for symbol definition:', error as Error);
        }
        
        return null;
    }

    /**
     * Common singleton and factory method patterns
     */
    private static readonly SINGLETON_PATTERNS = [
        'getInstance',
        'getService',
        'getProvider',
        'getManager',
        'getHandler',
        'create',
        'newInstance',
        'of',
        'forName',
        'valueOf'
    ];

    /**
     * Traces variable assignment to determine the actual class type
     */
    private static async traceVariableType(document: vscode.TextDocument, variableName: string): Promise<string | undefined> {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Look for variable declaration and assignment patterns
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Pattern 1: Direct assignment with method call returning a class instance
            // Example: Logger loggerInstance = Logger.getInstance();
            const methodCallPattern = new RegExp(`\\b${variableName}\\s*=\\s*([A-Za-z0-9_]+)\\.(\\w+)\\s*\\(`, 'i');
            const methodMatch = methodCallPattern.exec(line);
            if (methodMatch) {
                const className = methodMatch[1];
                const methodName = methodMatch[2];
                
                // Check if this is a known singleton/factory pattern
                if (this.SINGLETON_PATTERNS.includes(methodName)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] traceVariableType -- Found singleton pattern: ${className}.${methodName}() for variable ${variableName}`);
                    return className;
                }
                
                // Try to determine return type by analyzing the method in the class
                const returnType = await this.analyzeMethodReturnType(document, className, methodName);
                if (returnType) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] traceVariableType -- Determined return type: ${returnType} for ${className}.${methodName}()`);
                    return returnType;
                }
                
                // Fallback: assume method returns the class it's called on
                this.logDebug(`[VisbalExt.SymbolNavigationService] traceVariableType -- Assuming ${className} return type for ${className}.${methodName}()`);
                return className;
            }
            
            // Pattern 2: Variable declaration with explicit type
            // Example: Logger loggerInstance = ...;
            const declarationPattern = new RegExp(`\\b([A-Za-z0-9_]+)\\s+${variableName}\\s*=`, 'i');
            const declMatch = declarationPattern.exec(line);
            if (declMatch && declMatch[1]) {
                const declaredType = declMatch[1];
                // Ensure it's not a keyword or access modifier
                if (!/^(public|private|protected|global|static|final|override|virtual|abstract)$/i.test(declaredType)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] traceVariableType -- Found declared type: ${declaredType} for variable ${variableName}`);
                    return declaredType;
                }
            }
        }
        
        return undefined;
    }

    /**
     * Analyzes method signature to determine return type
     */
    private static async analyzeMethodReturnType(document: vscode.TextDocument, className: string, methodName: string): Promise<string | undefined> {
        // First, try to find the method in the current document
        const currentDocResult = this.analyzeMethodReturnTypeInDocument(document, methodName);
        if (currentDocResult) {
            return currentDocResult;
        }
        
        // If not found in current document, try to find the class file
        if (!vscode.workspace.workspaceFolders) {
            return undefined;
        }

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders[0];
            const classPattern = new vscode.RelativePattern(workspaceFolder, `**/${className}.cls`);
            const classFiles = await vscode.workspace.findFiles(classPattern);
            
            if (classFiles.length > 0) {
                const classFile = classFiles[0];
                const classDocument = await vscode.workspace.openTextDocument(classFile);
                const classResult = this.analyzeMethodReturnTypeInDocument(classDocument, methodName);
                if (classResult) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] analyzeMethodReturnType -- Found return type ${classResult} for ${className}.${methodName}() in ${className}.cls`);
                    return classResult;
                }
            }
        } catch (error) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] analyzeMethodReturnType -- Error searching for ${className}.cls:`, error);
        }
        
        return undefined;
    }
    
    /**
     * Analyzes method signature in a specific document to determine return type
     */
    private static analyzeMethodReturnTypeInDocument(document: vscode.TextDocument, methodName: string): string | undefined {
        const text = document.getText();
        
        // Look for method signature patterns in the document
        const methodSignaturePattern = new RegExp(
            `^\\s*(public|private|protected|global)\\s+(static\\s+)?([A-Za-z0-9_<>\\[\\]]+)\\s+${methodName}\\s*\\(`,
            'im'
        );
        
        const match = methodSignaturePattern.exec(text);
        if (match && match[3]) {
            const returnType = match[3].trim();
            // Filter out access modifiers and common keywords
            if (!/^(void|public|private|protected|global|static|override|virtual|abstract)$/i.test(returnType)) {
                return returnType;
            }
        }
        
        return undefined;
    }

    private static extractInstantiatedClassName(line: string, word: string, wordRange: vscode.Range): string | undefined {
        // Example: MyClass myVar = new MyClass();
        // Example: AnotherClass.staticMethod();
        // Look for patterns like "ClassName variableName = new InstantiatedClass();" or "InstantiatedClass.staticProperty"

        // Pattern for variable declaration with instantiation: `ClassName variableName = new InstantiatedClass();`
        const instantiationRegex = new RegExp(`(?:[A-Za-z0-9_]+)\\s+${word}\\s*=\\s*new\\s+([A-Za-z0-9_]+)\\s*\\(`, 'i');
        let match = instantiationRegex.exec(line);
        if (match && match[1]) {
            return match[1]; // Returns 'InstantiatedClass'
        }

        // Pattern for static method or property access: `ClassName.staticProperty` or `ClassName.staticMethod()`
        // Only consider it if the prefix starts with uppercase (class naming convention)
        const staticAccessRegex = new RegExp(`([A-Z][A-Za-z0-9_]*)\\.${word}(?:\\s*\\()?`, 'i');
        match = staticAccessRegex.exec(line);
        if (match && match[1]) {
            // Check if the matched class name is not the word itself
            if (match[1] !== word) {
                return match[1]; // Returns 'ClassName'
            }
        }
        
        // Pattern for variable declaration: `ClassName variableName = ...;` or `ClassName variableName;`
        // This should capture the declared type when the cursor is on the variableName
        const declarationRegex = new RegExp(`^\\s*([A-Za-z0-9_]+)\\s+${word}\b`, 'i');
        match = declarationRegex.exec(line);
        if (match && match[1]) {
            // Ensure the extracted type is not a keyword or primitive type
            const possibleType = match[1];
            if (!/^(public|private|protected|global|static|void|string|integer|boolean|long|double|decimal|date|datetime|id|object|list|set|map)$/i.test(possibleType)) {
                return possibleType;
            }
        }
        
        return undefined;
    }

    /**
     * Navigates to the symbol definition based on the current cursor position
     */
    public static async navigateToSelectedDefinition(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        const sourceFileExtension = editor.document.fileName.split('.').pop()?.toLowerCase() || '';
        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line).text;
        
        // Debug log the cursor position and selection context
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Starting navigation from position ${position.line}:${position.character}`);
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Line content: "${line}"`);
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Character at cursor: "${line[position.character] || 'END_OF_LINE'}" (charCode: ${line.charCodeAt(position.character) || 'N/A'})`);
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- File extension: "${sourceFileExtension}"`);

        // Extract symbol and type from cursor position
        const symbolInfo = this.extractSymbolFromCursor(editor.document, editor.selection.active);
        if (!symbolInfo) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- extractSymbolFromCursor returned null`);
            throw new Error('No symbol found at cursor position. Please place cursor on a method, property, class, or other symbol.');
        }
        
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Successfully extracted symbol: "${symbolInfo.symbol}", type: "${symbolInfo.type}", isThisReference: ${symbolInfo.isThisReference}, className: "${symbolInfo.className || 'N/A'}", variableToTrace: "${symbolInfo.variableToTrace || 'N/A'}"`);

        let { symbol, type, isThisReference, className, variableToTrace } = symbolInfo;
        
        // If we have a variable to trace, try to resolve its type asynchronously
        if (variableToTrace && !className) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Tracing variable type for ${variableToTrace}`);
            const tracedClassName = await this.traceVariableType(editor.document, variableToTrace);
            if (tracedClassName) {
                className = tracedClassName;
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Successfully traced ${variableToTrace} -> ${className}`);
            } else {
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Could not trace variable type for ${variableToTrace}`);
            }
        }
        
        const searchContext = className ? `${className}.${symbol}` : isThisReference ? `this.${symbol}` : symbol;
        this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Searching for ${type} definition: ${searchContext}`);
        
        // Search for symbol definition
        const symbolLocation = await this.findSymbolDefinition(symbol, type, sourceFileExtension, editor.document, isThisReference, className);
        if (!symbolLocation) {
            let searchScope = 'workspace files';
            let suggestion = '';
            
            if (className) {
                searchScope = `${className}.cls and workspace files`;
                suggestion = ` Make sure the ${className} class exists and contains the method '${symbol}'.`;
            } else if (isThisReference) {
                searchScope = 'current file and workspace';
                suggestion = ` Make sure the method '${symbol}' is defined in this class.`;
            } else if (variableToTrace) {
                searchScope = `traced variable files`;
                suggestion = ` Could not trace the type of variable '${variableToTrace}'. Make sure it's properly declared with a class type.`;
            }
            
            const errorMessage = `${type} definition for '${searchContext}' not found in ${searchScope}.${suggestion}`;
            this.logError(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- ${errorMessage}`, new Error(errorMessage));
            throw new Error(errorMessage);
        }

        try {
            // Open the document containing the symbol
            const document = await vscode.workspace.openTextDocument(symbolLocation.filePath);
            const newEditor = await vscode.window.showTextDocument(document);
            
            // Navigate to the symbol position
            newEditor.revealRange(
                new vscode.Range(symbolLocation.position, symbolLocation.position), 
                vscode.TextEditorRevealType.InCenter
            );
            
            // Set the cursor at the symbol
            newEditor.selection = new vscode.Selection(symbolLocation.position, symbolLocation.position);
            
            const fileName = symbolLocation.filePath.fsPath.split(/[/\\]/).pop();
            const location = symbolLocation.filePath.fsPath === editor.document.uri.fsPath ? 'same file' : fileName;
            
            // Show more specific success message for class-prefixed calls
            let successMessage: string;
            if (className) {
                successMessage = `Navigated to ${type} '${symbol}' in ${fileName}`;
            } else {
                successMessage = `Navigated to ${type} '${searchContext}' in ${location}`;
            }
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Successfully navigated to ${type} '${searchContext}' in ${location}`);
            vscode.window.showInformationMessage(successMessage);
            
        } catch (error: any) {
            this.logError(`[VisbalExt.SymbolNavigationService] Error opening symbol definition file:`, error);
            throw new Error(`Could not open file containing ${type} '${searchContext}': ${error.message}`);
        }
    }
}
