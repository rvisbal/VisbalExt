import * as vscode from 'vscode';

/**
 * SymbolNavigationService - Handles file navigation and symbol search operations
 */
export class SymbolNavigationService {
    private static logDebug: (message: string, ...args: any[]) => void;
    private static logError: (message: string, error: any) => void;
    private static isNavigationInProgress: boolean = false;

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
        'tsx': ['tsx', 'ts', 'js'],
        'log': ['cls', 'html', 'js', 'css', 'ts'], // Log files can reference any code type
        'txt': ['cls', 'html', 'js', 'css', 'ts'], // Text files can reference any code type
        'md': ['cls', 'html', 'js', 'css', 'ts']   // Markdown files can reference any code type
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
                
                // Pattern 4: Constructor call pattern - "new ClassName(" or "= new ClassName("
                const constructorCallPattern = new RegExp(`\\bnew\\s+${word}\\s*\\(`, 'i');
                if (constructorCallPattern.test(line) && /^[A-Z]/.test(word)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Pattern 4 matched: constructor call pattern`);
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                
                // Pattern 5: Variable assignment with class instantiation - "ClassName var = new ClassName("
                const assignmentPattern = new RegExp(`\\b[a-zA-Z_][a-zA-Z0-9_]*\\s*=\\s*new\\s+${word}\\s*\\(`, 'i');
                if (assignmentPattern.test(line) && /^[A-Z]/.test(word)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Pattern 5 matched: class in assignment pattern`);
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
                
            case 'log':
            case 'txt':
            case 'md':
                // Log, text, and markdown files - use enhanced class detection for file references
                // Check if this appears to be a class reference in a file path
                if (/^[A-Z][a-zA-Z0-9_]*$/.test(word) && line.includes('.cls')) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] determineSymbolType -- Log/text/markdown file class pattern matched for: ${word}`);
                    return { symbol: word, type: this.SymbolType.CLASS };
                }
                // Check for method calls
                if (afterWord.startsWith('(') || new RegExp(`\\b${word}\\s*\\(`).test(line)) {
                    return { symbol: word, type: this.SymbolType.FUNCTION };
                }
                // For other cases in log/text/markdown files, prefer CLASS if uppercase, otherwise VARIABLE
                if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
                    return { symbol: word, type: this.SymbolType.CLASS };
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
     * For log/txt/md files with class-prefixed calls, prioritize .cls files
     */
    private static getTargetFileExtensions(sourceExtension: string, className?: string): string[] {
        const mappedExtensions = this.FILE_TYPE_MAPPINGS[sourceExtension as keyof typeof this.FILE_TYPE_MAPPINGS] || [sourceExtension];
        
        // For log/txt/md files with class-prefixed calls, prioritize .cls files for better performance
        if ((sourceExtension === 'log' || sourceExtension === 'txt' || sourceExtension === 'md') && className) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] getTargetFileExtensions -- Prioritizing .cls files for class-prefixed call: ${className}`);
            return ['cls', ...mappedExtensions.filter(ext => ext !== 'cls')];
        }
        
        return mappedExtensions;
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
                    let match;
                    while ((match = searchPattern.exec(text)) !== null) {
                        const position = document.positionAt(match.index);
                        const matchedLine = document.lineAt(position.line).text;
                        
                        // Validate that this is actually a definition, not a usage/call
                        if (this.validateDefinitionMatch(matchedLine, symbol, symbolType)) {
                            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInFiles -- Found ${symbol} in ${file.fsPath} using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                            return { filePath: file, position };
                        } else {
                            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInFiles -- Rejected match in ${file.fsPath} at line ${position.line + 1} - not a valid definition: "${matchedLine.trim()}"`);
                        }
                        
                        // Prevent infinite loop if regex doesn't have global flag
                        if (!searchPattern.global) {
                            break;
                        }
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
                // Apex method definition - comprehensive patterns for all cases
                // Pattern 1: public static void methodName( - with explicit access modifier
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+void\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 2: static void methodName( - no explicit access modifier (defaults to private)
                patterns.push(new RegExp(
                    `\\bstatic\\s+void\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 3: public static ReturnType methodName( - with explicit access modifier and return type
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 4: static ReturnType methodName( - no explicit access modifier with return type
                patterns.push(new RegExp(
                    `\\bstatic\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 5: public ReturnType methodName( - non-static methods with explicit access modifier
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 6: ReturnType methodName( - non-static methods without explicit access modifier
                patterns.push(new RegExp(
                    `\\b[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 7: override methods
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+override\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                break;
                
            case this.SymbolType.FUNCTION:
                // JavaScript/TypeScript function definitions - prioritize actual definitions
                // Pattern 1: Function declaration
                patterns.push(new RegExp(`^\\s*function\\s+${symbol}\\s*\\(`, 'gim'));
                // Pattern 2: Method definition in class/object
                patterns.push(new RegExp(`^\\s*${symbol}\\s*\\([^)]*\\)\\s*{`, 'gim'));
                // Pattern 3: Arrow function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*\\([^)]*\\)\\s*=>`, 'gim'));
                // Pattern 4: Function assignment
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\s*=\\s*function`, 'gim'));
                // Pattern 5: Object method
                patterns.push(new RegExp(`${symbol}\\s*:\\s*function\\s*\\(`, 'gi'));
                // Pattern 6: Fallback - any assignment
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*function`, 'gi'));
                patterns.push(new RegExp(`${symbol}\\s*[:=]\\s*\\(.*\\)\\s*=>`, 'gi'));
                break;
                
            case this.SymbolType.CLASS:
                // Class definitions - prioritize actual class declarations
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|global\\s+)?(abstract\\s+)?class\\s+${symbol}\\b`, 'gim'));
                patterns.push(new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|export\\s+)?(abstract\\s+)?interface\\s+${symbol}\\b`, 'gim'));
                patterns.push(new RegExp(`class\\s+${symbol}\\b`, 'gi'));
                patterns.push(new RegExp(`interface\\s+${symbol}\\b`, 'gi'));
                break;
                
            case this.SymbolType.CSS_CLASS:
                // CSS class definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^\\.${symbol}\\b[^{]*{`, 'gim'));
                patterns.push(new RegExp(`\\.${symbol}\\b`, 'gi'));
                break;
                
            case this.SymbolType.CSS_ID:
                // CSS ID definitions - prioritize CSS rule definitions
                patterns.push(new RegExp(`^#${symbol}\\b[^{]*{`, 'gim'));
                patterns.push(new RegExp(`#${symbol}\\b`, 'gi'));
                break;
                
            case this.SymbolType.PROPERTY:
            case this.SymbolType.VARIABLE:
                // Apex property/variable definitions - handle all documented patterns
                // Pattern 1: public static final constants - most common
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+final\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\b`,
                    'gim'
                ));
                // Pattern 2: public static variables (non-final)
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\b`,
                    'gim'
                ));
                // Pattern 3: instance properties/fields  
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\b`,
                    'gim'
                ));
                
                // FALLBACK: Method patterns (since methods are sometimes misclassified as variables)
                // Pattern 4: public static void methodName( - with explicit access modifier
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+void\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 5: static void methodName( - no explicit access modifier (defaults to private)
                patterns.push(new RegExp(
                    `\\bstatic\\s+void\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 6: public static ReturnType methodName( - with explicit access modifier and return type
                patterns.push(new RegExp(
                    `\\b(public|private|protected|global)\\s+static\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                // Pattern 7: static ReturnType methodName( - no explicit access modifier with return type
                patterns.push(new RegExp(
                    `\\bstatic\\s+[\\w<>\\[\\]_,\\s]+\\s+${symbol}\\s*\\(`,
                    'gim'
                ));
                
                // Pattern 8: JavaScript/TypeScript variable declarations
                patterns.push(new RegExp(`^\\s*(const|let|var)\\s+${symbol}\\b`, 'gim'));
                // Pattern 9: Property assignment fallback
                patterns.push(new RegExp(`\\b${symbol}\\s*[:=]`, 'gi'));
                break;
        }
        
        return patterns;
    }

    /**
     * Validates that a matched line contains an actual definition, not just a usage/call
     */
    private static validateDefinitionMatch(line: string, symbol: string, symbolType: string): boolean {
        const trimmedLine = line.trim();
        
        switch (symbolType) {
            case this.SymbolType.METHOD:
                // For methods, ensure it's not a constructor call or method invocation
                
                // Reject lines with assignment operators before the symbol (e.g., "var = new Symbol(")
                if (/\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=.*new\s+/i.test(trimmedLine)) {
                    return false;
                }
                
                // Reject lines that look like variable declarations with instantiation
                // e.g., "ClassName var = new ClassName(" or "var obj = Symbol("
                const variableDeclarationPattern = new RegExp(`\\b[a-zA-Z_][a-zA-Z0-9_]*\\s*=.*\\b${symbol}\\s*\\(`, 'i');
                if (variableDeclarationPattern.test(trimmedLine)) {
                    return false;
                }
                
                // Accept lines that start with access modifiers (proper method definitions)
                if (/^(public|private|protected|global)\s/i.test(trimmedLine)) {
                    return true;
                }
                
                // Accept lines that look like method signatures at the beginning of a line
                const methodSignaturePattern = new RegExp(`^\\s*[\\w<>\\[\\]_]+\\s+${symbol}\\s*\\(`, 'i');
                if (methodSignaturePattern.test(trimmedLine)) {
                    return true;
                }
                
                return false;
                
            case this.SymbolType.CLASS:
                // For classes, ensure it's a class declaration, not an instantiation
                
                // Reject lines with "new" keyword (instantiations)
                if (/\bnew\s+/i.test(trimmedLine)) {
                    return false;
                }
                
                // Accept lines that start with class declaration keywords
                if (/^(public|private|protected|global)?\s*(abstract\s+)?(class|interface)\s/i.test(trimmedLine)) {
                    return true;
                }
                
                // Reject variable assignments
                if (/\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(trimmedLine)) {
                    return false;
                }
                
                return true; // Allow other class-related patterns
                
            case this.SymbolType.PROPERTY:
            case this.SymbolType.VARIABLE:
                // For properties/variables, look for declarations, not assignments or usage
                
                // Accept lines that start with access modifiers (property declarations)
                if (/^(public|private|protected|global|static)\s/i.test(trimmedLine)) {
                    return true;
                }
                
                // Accept variable declarations
                if (/^(const|let|var)\s/i.test(trimmedLine)) {
                    return true;
                }
                
                return true; // Be more permissive for properties
                
            default:
                return true; // Default to accepting for other types
        }
    }

    /**
     * Searches for a symbol definition in the current file first
     */
    private static searchInCurrentFile(document: vscode.TextDocument, symbol: string, symbolType: string): {filePath: vscode.Uri, position: vscode.Position} | null {
        const text = document.getText();
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        for (const searchPattern of searchPatterns) {
            searchPattern.lastIndex = 0;
            let match;
            while ((match = searchPattern.exec(text)) !== null) {
                const position = document.positionAt(match.index);
                const matchedLine = document.lineAt(position.line).text;
                
                // Validate that this is actually a definition, not a usage/call
                if (this.validateDefinitionMatch(matchedLine, symbol, symbolType)) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] searchInCurrentFile -- Found ${symbol} in current file using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                    return { filePath: document.uri, position };
                } else {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] searchInCurrentFile -- Rejected match at line ${position.line + 1} - not a valid definition: "${matchedLine.trim()}"`);
                }
                
                // Prevent infinite loop if regex doesn't have global flag
                if (!searchPattern.global) {
                    break;
                }
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
        
        // Strip namespace prefix from className for file search
        // Namespace prefixes follow pattern: NamespacePrefix__ActualClassName
        let fileClassName = className;
        if (className.includes('__')) {
            const parts = className.split('__');
            if (parts.length === 2) {
                fileClassName = parts[1]; // Use the actual class name without namespace prefix
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Stripped namespace prefix: ${className} -> ${fileClassName}`);
            }
        }
        
        try {
            // Hierarchical search for specific class file:
            // 1. force-app/main/default/classes/ (user classes)
            // 2. .sfdx/tools/StandardApexLibrary/ (standard library fallback)
            
            // Step 1: Look in user classes first (using actual class name without namespace)
            let userClassPattern = new vscode.RelativePattern(workspaceFolder, `force-app/main/default/classes/${fileClassName}.cls`);
            let userClassFiles = await vscode.workspace.findFiles(userClassPattern);
            
            // Step 2: Fallback to standard library (use original className for standard library search)
            let standardLibPattern = new vscode.RelativePattern(workspaceFolder, `.sfdx/tools/*/StandardApexLibrary/**/${fileClassName}.cls`);
            let standardLibFiles = await vscode.workspace.findFiles(standardLibPattern);
            
            // Combine results, prioritizing user classes
            const allClassFiles = [...userClassFiles, ...standardLibFiles];
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Found ${userClassFiles.length} user class files and ${standardLibFiles.length} standard library files for ${fileClassName}.cls (original: ${className})`);
            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- User files: ${userClassFiles.map(f => f.fsPath).join(', ') || 'none'}`);
            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Standard files: ${standardLibFiles.map(f => f.fsPath).join(', ') || 'none'}`);
            
            if (allClassFiles.length === 0) {
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Class file ${fileClassName}.cls (original: ${className}) not found in user code or standard library`);
                return null;
            }

            // Validate that files actually exist before proceeding
            const existingFiles: vscode.Uri[] = [];
            for (const file of allClassFiles) {
                try {
                    await vscode.workspace.fs.stat(file);
                    existingFiles.push(file);
                } catch (error) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- File ${file.fsPath} does not exist, skipping`);
                }
            }
            
            if (existingFiles.length === 0) {
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- No existing files found for ${fileClassName}.cls (original: ${className}) after validation`);
                return null;
            }

            // Search in the first existing class file (user classes have priority)
            const classFile = existingFiles[0];
            try {
                const document = await vscode.workspace.openTextDocument(classFile);
                const text = document.getText();
                const searchPatterns = this.createSearchPatterns(symbol, symbolType);
                
                for (const searchPattern of searchPatterns) {
                    searchPattern.lastIndex = 0;
                    let match;
                    while ((match = searchPattern.exec(text)) !== null) {
                        const position = document.positionAt(match.index);
                        const matchedLine = document.lineAt(position.line).text;
                        
                        // Validate that this is actually a definition, not a usage/call
                        if (this.validateDefinitionMatch(matchedLine, symbol, symbolType)) {
                            this.logDebug(`[VisbalExt.SymbolNavigationService] Found ${symbol} in ${fileClassName}.cls (original: ${className}) using pattern: ${searchPattern.source} at line ${position.line + 1}`);
                            return { filePath: classFile, position };
                        } else {
                            this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Rejected match in ${fileClassName}.cls at line ${position.line + 1} - not a valid definition: "${matchedLine.trim()}"`);
                        }
                        
                        // Prevent infinite loop if regex doesn't have global flag
                        if (!searchPattern.global) {
                            break;
                        }
                    }
                }
                
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Symbol ${symbol} not found in ${fileClassName}.cls (original: ${className})`);
            } catch (error) {
                this.logError(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Could not read class file: ${classFile.fsPath}`, error as Error);
            }
        } catch (error) {
            this.logError(`[VisbalExt.SymbolNavigationService] searchInSpecificClass -- Error searching in specific class ${className}:`, error as Error);
        }
        
        return null;
    }

    /**
     * Searches for a direct class file by name (for log file navigation)
     */
    private static async searchForDirectClassFile(className: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        
        try {
            // Look for the exact class file
            const classPattern = new vscode.RelativePattern(workspaceFolder, `**/${className}.cls`);
            const classFiles = await vscode.workspace.findFiles(classPattern);
            
            if (classFiles.length === 0) {
                return null;
            }
            
            // Use the first found class file (prioritize user classes over standard lib)
            const classFile = classFiles[0];
            
            // Open the file and navigate to the class declaration
            const document = await vscode.workspace.openTextDocument(classFile);
            const text = document.getText();
            
            // Look for the class declaration line
            const classDeclarationPattern = new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|global\\s+)?(abstract\\s+)?class\\s+${className}\\b`, 'gim');
            const match = classDeclarationPattern.exec(text);
            
            if (match) {
                const position = document.positionAt(match.index);
                this.logDebug(`[VisbalExt.SymbolNavigationService] searchForDirectClassFile -- Found class declaration for ${className} at line ${position.line + 1}`);
                return { filePath: classFile, position };
            }
            
            // Fallback: navigate to the beginning of the file
            this.logDebug(`[VisbalExt.SymbolNavigationService] searchForDirectClassFile -- Class declaration pattern not found, navigating to file start for ${className}.cls`);
            return { filePath: classFile, position: new vscode.Position(0, 0) };
            
        } catch (error) {
            this.logError(`[VisbalExt.SymbolNavigationService] searchForDirectClassFile -- Error searching for ${className}.cls:`, error as Error);
            return null;
        }
    }

    /**
     * Searches for a symbol definition across appropriate file types in the workspace
     */
    private static async findSymbolDefinition(symbol: string, symbolType: string, sourceFileExtension: string, currentDocument?: vscode.TextDocument, isThisReference: boolean = false, className?: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        
        // Special handling for log/txt/md files: Try direct class file navigation first for CLASS symbols
        if ((sourceFileExtension === 'log' || sourceFileExtension === 'txt' || sourceFileExtension === 'md') && symbolType === this.SymbolType.CLASS) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Log/text/markdown file: Attempting direct navigation to ${symbol}.cls`);
            const directClassResult = await this.searchForDirectClassFile(symbol);
            if (directClassResult) {
                return directClassResult;
            }
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Direct class file ${symbol}.cls not found, continuing with normal search`);
        }
        
        // For class-prefixed calls (e.g., ClassName.methodName), search the specific class first
        // This applies to calls from .cls files, .log files, .txt files, etc.
        if (className) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Searching for '${className}.${symbol}' in ${className}.cls first (source: ${sourceFileExtension})`);
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
        const targetExtensions = this.getTargetFileExtensions(sourceFileExtension, className);
        const searchPatterns = this.createSearchPatterns(symbol, symbolType);
        
        if (searchPatterns.length === 0) {
            return null;
        }
        
        try {
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Starting workspace search for '${symbol}' in extensions: ${targetExtensions.join(', ')}`);
            
            // Hierarchical search strategy: 
            // 1. force-app/main/default/classes/ (user classes)
            // 2. force-app/main/default/ (other user metadata)  
            // 3. Second iteration: find class file then search within it (for class-prefixed calls)
            
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
                
                // If we have a className and the first search failed, try a second iteration
                // to find the class file itself and then search for the method within it
                if (className) {
                    this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- First iteration failed, trying second iteration: find class '${className}.cls' then method '${symbol}'`);
                    const secondIterationResult = await this.performSecondIterationSearch(className, symbol, symbolType);
                    if (secondIterationResult) {
                        return secondIterationResult;
                    }
                }
            }
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] findSymbolDefinition -- Workspace search completed. Symbol '${symbol}' not found in user code.`);
        } catch (error) {
            this.logError('[VisbalExt.SymbolNavigationService] Error searching for symbol definition:', error as Error);
        }
        
        return null;
    }

    /**
     * Performs a second iteration search when the first iteration fails
     * First tries to find the class file, then searches for the method within it
     */
    private static async performSecondIterationSearch(className: string, symbol: string, symbolType: string): Promise<{filePath: vscode.Uri, position: vscode.Position} | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        
        // Strip namespace prefix from className for file search
        // Namespace prefixes follow pattern: NamespacePrefix__ActualClassName
        let fileClassName = className;
        if (className.includes('__')) {
            const parts = className.split('__');
            if (parts.length === 2) {
                fileClassName = parts[1]; // Use the actual class name without namespace prefix
                this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Stripped namespace prefix: ${className} -> ${fileClassName}`);
            }
        }
        
        try {
            // Step 1: Try to find the class file using a broader search (use actual class name without namespace)
            this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Searching for class file: ${fileClassName}.cls (original: ${className})`);
            
            // Search for the class file in the entire user code base
            let classFilePattern = new vscode.RelativePattern(workspaceFolder, `**/${fileClassName}.cls`);
            let classFiles = await vscode.workspace.findFiles(classFilePattern);
            
            // Filter out StandardApexLibrary files to avoid the fallback we're trying to avoid
            classFiles = classFiles.filter(file => !file.fsPath.includes('StandardApexLibrary'));
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Found ${classFiles.length} instances of ${fileClassName}.cls (original: ${className}) in user code`);
            
            if (classFiles.length === 0) {
                this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Class file ${fileClassName}.cls (original: ${className}) not found in user code`);
                return null;
            }
            
            // Step 2: Search for the method within each found class file
            for (const classFile of classFiles) {
                this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Searching for method '${symbol}' in ${classFile.fsPath}`);
                
                try {
                    const document = await vscode.workspace.openTextDocument(classFile);
                    const result = this.searchInCurrentFile(document, symbol, symbolType);
                    if (result) {
                        this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Successfully found '${symbol}' in ${classFile.fsPath}`);
                        return result;
                    }
                } catch (error) {
                    this.logError(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Error searching in ${classFile.fsPath}:`, error as Error);
                    continue;
                }
            }
            
            this.logDebug(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Method '${symbol}' not found in any instance of ${fileClassName}.cls (original: ${className})`);
            return null;
            
        } catch (error) {
            this.logError(`[VisbalExt.SymbolNavigationService] performSecondIterationSearch -- Error during second iteration search:`, error as Error);
            return null;
        }
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
     * Extracts symbol information from the current cursor position (public method for references feature)
     */
    public static extractSymbolInfo(document: vscode.TextDocument, position: vscode.Position): {symbol: string, type: string, isThisReference: boolean, className?: string} | null {
        return this.extractSymbolFromCursor(document, position);
    }

    /**
     * Navigates to the symbol definition based on the current cursor position
     */
    public static async navigateToSelectedDefinition(): Promise<void> {
        // Check if navigation is already in progress
        if (this.isNavigationInProgress) {
            this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Navigation already in progress, ignoring request`);
            vscode.window.showWarningMessage('Navigation to definition is already in progress. Please wait...');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        // Set navigation in progress flag and show progress
        this.isNavigationInProgress = true;

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Navigating to Definition",
            cancellable: false
        }, async (progress, token) => {
            try {
                progress.report({ increment: 0, message: "Analyzing cursor position..." });

                const sourceFileExtension = editor.document.fileName.split('.').pop()?.toLowerCase() || '';
                const position = editor.selection.active;
                const line = editor.document.lineAt(position.line).text;
                
                // Debug log the cursor position and selection context
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Starting navigation from position ${position.line}:${position.character}`);
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Line content: "${line}"`);
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Character at cursor: "${line[position.character] || 'END_OF_LINE'}" (charCode: ${line.charCodeAt(position.character) || 'N/A'})`);
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- File extension: "${sourceFileExtension}"`);

                progress.report({ increment: 20, message: "Extracting symbol information..." });

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
                    progress.report({ increment: 40, message: `Tracing variable type: ${variableToTrace}...` });
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
                
                progress.report({ increment: 60, message: `Searching for ${type} definition: ${searchContext}...` });

                // Search for symbol definition
                const symbolLocation = await this.findSymbolDefinition(symbol, type, sourceFileExtension, editor.document, isThisReference, className);
                if (!symbolLocation) {
                    let searchScope = 'workspace files';
                    let suggestion = '';
                    
                    if (className) {
                        searchScope = `${className}.cls and workspace files`;
                        suggestion = ` Make sure the ${className} class exists and contains the method '${symbol}'. Check if the class file is in force-app/main/default/classes/ or if it's a standard Salesforce class.`;
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

                progress.report({ increment: 80, message: "Opening definition file..." });

                try {
                    // Open the document containing the symbol
                    const document = await vscode.workspace.openTextDocument(symbolLocation.filePath);
                    const newEditor = await vscode.window.showTextDocument(document);
                    
                    progress.report({ increment: 95, message: "Navigating to symbol..." });

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
                    
                    progress.report({ increment: 100, message: "Navigation complete!" });
                    
                    this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Successfully navigated to ${type} '${searchContext}' in ${location}`);
                    vscode.window.showInformationMessage(successMessage);
                    
                } catch (error: any) {
                    this.logError(`[VisbalExt.SymbolNavigationService] Error opening symbol definition file:`, error);
                    throw new Error(`Could not open file containing ${type} '${searchContext}': ${error.message}`);
                }
            } catch (error) {
                // Re-throw the error to be handled by the calling code
                throw error;
            } finally {
                // Always clear the navigation flag, regardless of success or failure
                this.isNavigationInProgress = false;
                this.logDebug(`[VisbalExt.SymbolNavigationService] navigateToSelectedDefinition -- Navigation flag cleared`);
            }
        });
    }
}
