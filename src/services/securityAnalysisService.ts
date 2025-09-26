import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityIssue {
    id: string;
    category: 'CRUD_FLS' | 'DML_LOOPS' | 'SOQL_INJECTION' | 'SHARING' | 'UI_SECURITY' | 'GENERAL';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    file: string;
    line: number;
    column: number;
    code: string;
    recommendation: string;
    ruleSource: string;
}

export interface SecurityReport {
    totalIssues: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
    issues: SecurityIssue[];
    scannedFiles: string[];
    scanTime: Date;
}

export class SecurityAnalysisService {
    private static instance: SecurityAnalysisService;
    
    // Security patterns and rules based on the MD files
    private securityRules = {
        CRUD_FLS: [
            {
                pattern: /\b(?:insert|update|delete|upsert)\s+[a-zA-Z_][a-zA-Z0-9_]*(?:\s*;|\s+[a-zA-Z_][a-zA-Z0-9_]*)/gi,
                severity: 'HIGH' as const,
                title: 'DML Operation without CRUD/FLS Check',
                description: 'DML operation detected without proper CRUD/FLS permission checks',
                recommendation: 'Use isAccessible(), isCreateable(), isUpdateable(), or isDeletable() before DML operations',
                ruleSource: 'CRUD.md'
            },
            {
                pattern: /\[\s*SELECT\s+[\w,\s*]+\s+FROM\s+\w+(?:\s+WHERE.*?)?\s*\]/gi,
                severity: 'MEDIUM' as const,
                title: 'SOQL Query without FLS Check',
                description: 'SOQL query detected without field-level security checks',
                recommendation: 'Check field accessibility using Schema.DescribeFieldResult.isAccessible() or use WITH USER_MODE',
                ruleSource: 'FLS.md'
            }
        ],
        DML_LOOPS: [
            {
                pattern: /for\s*\([^)]+\)\s*\{[^}]*\b(?:insert|update|delete|upsert)\s+[a-zA-Z_]/gi,
                severity: 'HIGH' as const,
                title: 'DML Operation Inside Loop',
                description: 'DML operation found inside a loop which violates governor limits',
                recommendation: 'Use collections to batch DML operations outside loops',
                ruleSource: 'DML_inside_loops.md'
            }
        ],
        SOQL_INJECTION: [
            {
                pattern: /\[\s*SELECT\s+[^]]*\+[^]]*\]/gi,
                severity: 'HIGH' as const,
                title: 'Potential SOQL Injection',
                description: 'String concatenation detected in SOQL query which may lead to SOQL injection',
                recommendation: 'Use bind variables (:variable) instead of string concatenation, or sanitize with String.escapeSingleQuotes()',
                ruleSource: 'SOQL_Injections.md'
            },
            {
                pattern: /String\.format\s*\([^)]*SELECT[^)]*\)/gi,
                severity: 'MEDIUM' as const,
                title: 'Dynamic SOQL Query',
                description: 'Dynamic SOQL query construction detected',
                recommendation: 'Validate inputs and use proper escaping mechanisms',
                ruleSource: 'SOQL_Injections.md'
            }
        ],
        SHARING: [
            {
                pattern: /class\s+\w+(?:\s+extends\s+\w+)?\s*\{/gi,
                severity: 'MEDIUM' as const,
                title: 'Class Missing Sharing Declaration',
                description: 'Class found without explicit sharing declaration',
                recommendation: 'Add "with sharing" keyword for entry point classes (Controllers, @AuraEnabled, WebService)',
                ruleSource: 'Sharing.md'
            },
            {
                pattern: /@AuraEnabled\s+(?:public|global|static)/gi,
                severity: 'HIGH' as const,
                title: '@AuraEnabled Method Security Risk',
                description: '@AuraEnabled method accessible to all users without proper access controls',
                recommendation: 'Ensure class uses "with sharing" and implement proper access control checks',
                ruleSource: 'Sharing.md'
            }
        ],
        UI_SECURITY: [
            {
                pattern: /position\s*:\s*(?:absolute|fixed)/gi,
                severity: 'LOW' as const,
                title: 'Potential Clickjacking Risk',
                description: 'Fixed/absolute positioning detected which may enable clickjacking attacks',
                recommendation: 'Avoid absolute/fixed positioning and implement proper frame-busting techniques',
                ruleSource: 'UI_Security_considerations.md'
            },
            {
                pattern: /System\.debug\s*\([^)]*(?:password|token|secret|key)[^)]*\)/gi,
                severity: 'HIGH' as const,
                title: 'Sensitive Information in Debug',
                description: 'Potential sensitive information exposure in debug statements',
                recommendation: 'Never expose sensitive data in debug statements',
                ruleSource: 'UI_Security_considerations.md'
            }
        ],
        GENERAL: [
            {
                pattern: /trigger\s+\w+\s+on\s+\w+\s*\([^)]+\)/gi,
                severity: 'LOW' as const,
                title: 'Multiple Triggers Warning',
                description: 'Multiple triggers on same sObject can cause unpredictable execution',
                recommendation: 'Use trigger handler pattern and consolidate triggers',
                ruleSource: 'SECURITY_GUIDELINES.md'
            }
        ]
    };

    private constructor() {}

    public static getInstance(): SecurityAnalysisService {
        if (!SecurityAnalysisService.instance) {
            SecurityAnalysisService.instance = new SecurityAnalysisService();
        }
        return SecurityAnalysisService.instance;
    }

    public async analyzeFile(filePath: string): Promise<SecurityIssue[]> {
        const issues: SecurityIssue[] = [];
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const fileExtension = path.extname(filePath).toLowerCase();
            
            // Only analyze relevant file types
            if (!['.cls', '.trigger', '.js', '.ts', '.html', '.css'].includes(fileExtension)) {
                return issues;
            }

            // Clean content by removing comments for better analysis
            const cleanedContent = this.removeComments(content, fileExtension);

            // Apply security rules based on file type
            let relevantCategories: (keyof typeof this.securityRules)[] = [];
            
            if (['.cls', '.trigger'].includes(fileExtension)) {
                relevantCategories = ['CRUD_FLS', 'DML_LOOPS', 'SOQL_INJECTION', 'SHARING', 'GENERAL'];
            } else if (['.js', '.ts'].includes(fileExtension)) {
                relevantCategories = ['UI_SECURITY'];
            } else if (['.html', '.css'].includes(fileExtension)) {
                relevantCategories = ['UI_SECURITY'];
            }

            for (const category of relevantCategories) {
                const rules = this.securityRules[category];
                for (const rule of rules) {
                    // Use cleaned content for pattern matching to avoid comment false positives
                    const matches = cleanedContent.matchAll(rule.pattern);
                    for (const match of matches) {
                        if (match.index !== undefined) {
                            // Convert position back to original content for accurate line/column
                            const originalPosition = this.mapCleanedPositionToOriginal(content, cleanedContent, match.index);
                            if (originalPosition && !this.isInComment(content, originalPosition.index)) {
                                const position = this.getLineAndColumn(content, originalPosition.index);
                                const codeSnippet = this.extractCodeSnippet(lines, position.line - 1, 3);
                                
                                issues.push({
                                    id: `${category}_${position.line}_${position.column}`,
                                    category: category,
                                    severity: rule.severity,
                                    title: rule.title,
                                    description: rule.description,
                                    file: filePath,
                                    line: position.line,
                                    column: position.column,
                                    code: codeSnippet,
                                    recommendation: rule.recommendation,
                                    ruleSource: rule.ruleSource
                                });
                            }
                        }
                    }
                }
            }

            // Additional context-aware checks
            await this.performContextualAnalysis(filePath, content, issues);

        } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
        }

        return issues;
    }

    public async analyzeWorkspace(): Promise<SecurityReport> {
        const issues: SecurityIssue[] = [];
        const scannedFiles: string[] = [];
        const startTime = new Date();

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folders found');
            }

            // Find all relevant files
            const apexFiles = await vscode.workspace.findFiles('**/*.{cls,trigger}', '**/node_modules/**');
            const jsFiles = await vscode.workspace.findFiles('**/*.{js,ts}', '**/node_modules/**');
            const htmlFiles = await vscode.workspace.findFiles('**/*.{html,css}', '**/node_modules/**');
            
            const allFiles = [...apexFiles, ...jsFiles, ...htmlFiles];

            for (const file of allFiles) {
                const filePath = file.fsPath;
                scannedFiles.push(filePath);
                const fileIssues = await this.analyzeFile(filePath);
                issues.push(...fileIssues);
            }

        } catch (error) {
            console.error('Error during workspace analysis:', error);
        }

        const highSeverityCount = issues.filter(i => i.severity === 'HIGH').length;
        const mediumSeverityCount = issues.filter(i => i.severity === 'MEDIUM').length;
        const lowSeverityCount = issues.filter(i => i.severity === 'LOW').length;

        return {
            totalIssues: issues.length,
            highSeverityCount,
            mediumSeverityCount,
            lowSeverityCount,
            issues,
            scannedFiles,
            scanTime: startTime
        };
    }

    public async analyzeCurrentFile(): Promise<SecurityIssue[]> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('No active file to analyze');
        }

        return await this.analyzeFile(activeEditor.document.uri.fsPath);
    }

    private getLineAndColumn(content: string, index: number): { line: number; column: number } {
        const beforeMatch = content.substring(0, index);
        const lines = beforeMatch.split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        return { line, column };
    }

    private extractCodeSnippet(lines: string[], lineIndex: number, contextLines: number): string {
        const start = Math.max(0, lineIndex - contextLines);
        const end = Math.min(lines.length - 1, lineIndex + contextLines);
        
        const snippet = lines.slice(start, end + 1);
        return snippet.map((line, index) => {
            const actualLineNumber = start + index + 1;
            const marker = (actualLineNumber === lineIndex + 1) ? '>>>' : '   ';
            return `${marker} ${actualLineNumber.toString().padStart(3, ' ')}: ${line}`;
        }).join('\n');
    }

    private async performContextualAnalysis(filePath: string, content: string, issues: SecurityIssue[]): Promise<void> {
        // Check for sharing context in Apex classes
        if (filePath.endsWith('.cls')) {
            const hasWithSharing = /\bwith\s+sharing\b/i.test(content);
            const hasWithoutSharing = /\bwithout\s+sharing\b/i.test(content);
            const hasAuraEnabled = /@AuraEnabled/i.test(content);
            const hasWebService = /@WebService/i.test(content);
            const hasRemoteAction = /@RemoteAction/i.test(content);
            
            if ((hasAuraEnabled || hasWebService || hasRemoteAction) && !hasWithSharing && !hasWithoutSharing) {
                issues.push({
                    id: `SHARING_MISSING_${Date.now()}`,
                    category: 'SHARING',
                    severity: 'HIGH',
                    title: 'Entry Point Class Missing Sharing Declaration',
                    description: 'Class with entry points (@AuraEnabled, @WebService, @RemoteAction) must declare sharing context',
                    file: filePath,
                    line: 1,
                    column: 1,
                    code: 'Class declaration',
                    recommendation: 'Add "with sharing" keyword to class declaration for security compliance',
                    ruleSource: 'Sharing.md'
                });
            }
        }

        // Check for queries without WHERE or LIMIT
        const cleanedContent = this.removeComments(content, path.extname(filePath));
        const soqlMatches = cleanedContent.matchAll(/\[\s*SELECT\s+[^\]]*FROM\s+\w+(?!\s+WHERE)(?!\s+LIMIT)[^\]]*\]/gi);
        for (const match of soqlMatches) {
            if (match.index !== undefined && !match[0].includes('WHERE') && !match[0].includes('LIMIT')) {
                const originalPosition = this.mapCleanedPositionToOriginal(content, cleanedContent, match.index);
                if (originalPosition && !this.isInComment(content, originalPosition.index)) {
                    const position = this.getLineAndColumn(content, originalPosition.index);
                    issues.push({
                        id: `SOQL_NO_LIMIT_${position.line}_${position.column}`,
                        category: 'SOQL_INJECTION',
                        severity: 'MEDIUM',
                        title: 'SOQL Query without WHERE or LIMIT',
                        description: 'SOQL query found without WHERE clause or LIMIT which may cause performance issues',
                        file: filePath,
                        line: position.line,
                        column: position.column,
                        code: match[0],
                        recommendation: 'Add WHERE clause or LIMIT to prevent excessive data retrieval',
                        ruleSource: 'SECURITY_GUIDELINES.md'
                    });
                }
            }
        }
    }

    /**
     * Removes comments from code content to avoid false positives in security analysis
     */
    private removeComments(content: string, fileExtension: string): string {
        let result = content;
        
        if (['.cls', '.trigger', '.js', '.ts'].includes(fileExtension)) {
            // Remove single-line comments (// ...)
            result = result.replace(/\/\/.*$/gm, '');
            
            // Remove multi-line comments (/* ... */)
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        } else if (['.html'].includes(fileExtension)) {
            // Remove HTML comments (<!-- ... -->)
            result = result.replace(/<!--[\s\S]*?-->/g, '');
        } else if (['.css'].includes(fileExtension)) {
            // Remove CSS comments (/* ... */)
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        }
        
        return result;
    }

    /**
     * Maps a position in cleaned content back to the original content
     */
    private mapCleanedPositionToOriginal(originalContent: string, cleanedContent: string, cleanedIndex: number): { index: number } | null {
        // This is a simplified approach - for more accuracy, we'd need to track removals
        // For now, we'll do a best-effort mapping by finding the matching text
        const beforeMatch = cleanedContent.substring(0, cleanedIndex);
        const matchLength = Math.min(20, cleanedContent.length - cleanedIndex);
        const matchText = cleanedContent.substring(cleanedIndex, cleanedIndex + matchLength);
        
        // Try to find the same text in the original content
        let searchStart = 0;
        for (let i = 0; i < beforeMatch.length && searchStart < originalContent.length; i++) {
            if (beforeMatch[i] === originalContent[searchStart]) {
                searchStart++;
            } else {
                // Skip ahead to account for removed comments
                while (searchStart < originalContent.length && 
                       originalContent[searchStart] !== beforeMatch[i]) {
                    searchStart++;
                }
                if (searchStart < originalContent.length) {
                    searchStart++;
                }
            }
        }
        
        const foundIndex = originalContent.indexOf(matchText, searchStart);
        return foundIndex >= 0 ? { index: foundIndex } : null;
    }

    /**
     * Checks if a position in the content is within a comment
     */
    private isInComment(content: string, index: number): boolean {
        const beforeIndex = content.substring(0, index);
        
        // Check if we're in a single-line comment
        const lastNewline = beforeIndex.lastIndexOf('\n');
        const currentLine = content.substring(lastNewline + 1, index);
        const singleLineCommentIndex = currentLine.indexOf('//');
        if (singleLineCommentIndex >= 0) {
            return true;
        }
        
        // Check if we're in a multi-line comment
        const lastMultilineStart = beforeIndex.lastIndexOf('/*');
        const lastMultilineEnd = beforeIndex.lastIndexOf('*/');
        
        if (lastMultilineStart >= 0 && (lastMultilineEnd < 0 || lastMultilineStart > lastMultilineEnd)) {
            return true;
        }
        
        return false;
    }
}
