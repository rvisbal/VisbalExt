import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as OrgUtilsModule from '../utils/orgUtils';
const OrgUtils = OrgUtilsModule.OrgUtils;

export interface CodeReviewIssue {
    id: string;
    category: 'Performance' | 'Security' | 'Maintainability' | 'Functionality' | 'Cleanup' | 'Constants' | 'Lifecycle' | 'Intent-Verification' | 'Style' | 'Documentation' | 'Conventions';
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    title: string;
    description: string;
    file: string;
    line: number;
    column: number;
    code: string;
    suggestion: string;
    impact: string;
}

export interface CodeReviewReport {
    totalIssues: number;
    criticalSeverityCount: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
    issues: CodeReviewIssue[];
    scannedFiles: string[];
    scanTime: Date;
}

/**
 * Service for performing code reviews based on Salesforce development best practices
 */
export class CodeReviewService {
    private static instance: CodeReviewService;

    private readonly codeReviewRules = {
        // SOQL/SOSL Query Optimization
        BULK_OPERATIONS: {
            patterns: [
                /for\s*\([^{]*\)\s*\{[^}]*(?:Database\.|insert\s|update\s|delete\s|upsert\s|merge\s|\[SELECT)/i,
                /while\s*\([^{]*\)\s*\{[^}]*(?:Database\.|insert\s|update\s|delete\s|upsert\s|merge\s|\[SELECT)/i
            ],
            severity: 'Critical' as const,
            category: 'Performance' as const,
            title: 'SOQL/DML in Loop Detected',
            description: 'SOQL queries or DML operations found inside loops can cause governor limit violations.',
            recommendation: 'Move SOQL queries and DML operations outside loops and use collections for bulk operations.'
        },

        // Debug Statement Cleanup
        DEBUG_STATEMENTS: {
            patterns: [
                /System\.debug\s*\(/gi,
                /console\.log\s*\(/gi,
                /console\.warn\s*\(/gi,
                /console\.error\s*\(/gi,
                /console\.info\s*\(/gi
            ],
            severity: 'Medium' as const,
            category: 'Cleanup' as const,
            title: 'Debug Statements Found',
            description: 'Debug statements should be removed before production deployment.',
            recommendation: 'Remove debug statements and use proper logging frameworks for production code.'
        },

        // Magic Numbers & Constants
        MAGIC_NUMBERS: {
            patterns: [
                /(?<![\w.])\d{2,}(?![\w.])/g,
                /'[^']*\d{3,}[^']*'/g,
                /"[^"]*\d{3,}[^"]*"/g
            ],
            severity: 'Medium' as const,
            category: 'Constants' as const,
            title: 'Magic Numbers Detected',
            description: 'Hardcoded numeric and string literals should be replaced with named constants.',
            recommendation: 'Replace magic numbers with descriptive constants for better maintainability.'
        },

        // Null Pointer Exception Prevention
        NULL_CHECKS: {
            patterns: [
                /\.\w+\s*\([^)]*\)(?!\s*[!=]=\s*null)/,
                /\w+\.\w+(?!\s*[!=]=\s*null)/
            ],
            severity: 'High' as const,
            category: 'Security' as const,
            title: 'Potential Null Pointer Exception',
            description: 'Potential null pointer exception - missing null checks before method calls or property access.',
            recommendation: 'Add null checks before accessing object properties or calling methods.'
        },

        // Complex Nested Logic
        COMPLEX_NESTING: {
            patterns: [
                /if\s*\([^{]*\)\s*\{[^{}]*if\s*\([^{]*\)\s*\{[^{}]*if\s*\([^{]*\)\s*\{/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Complex Nested Logic',
            description: 'Deeply nested conditional statements reduce code readability and maintainability.',
            recommendation: 'Consider using early returns, guard clauses, or extracting methods to reduce nesting.'
        },

        // Exception Handling
        EXCEPTION_HANDLING: {
            patterns: [
                /catch\s*\([^)]*\)\s*\{\s*\}/i,
                /catch\s*\([^)]*\)\s*\{\s*\/\/[^}]*\}/i
            ],
            severity: 'High' as const,
            category: 'Functionality' as const,
            title: 'Empty or Inadequate Exception Handling',
            description: 'Empty catch blocks or inadequate exception handling can hide errors.',
            recommendation: 'Implement proper exception handling with logging and user-friendly error messages.'
        },

        // Test Coverage Patterns
        TEST_METHODS: {
            patterns: [
                /@isTest(?!\s+private)/i,
                /testMethod\s+static\s+void/i
            ],
            severity: 'Low' as const,
            category: 'Maintainability' as const,
            title: 'Test Method Visibility',
            description: 'Test methods should be private to avoid accidental execution.',
            recommendation: 'Make test methods private by adding the private keyword.'
        },

        // SOQL Query Optimization
        INEFFICIENT_SOQL: {
            patterns: [
                /SELECT\s+[^FROM]*\*[^FROM]*FROM/i,
                /SELECT(?![^FROM]*LIMIT)/i
            ],
            severity: 'Medium' as const,
            category: 'Performance' as const,
            title: 'Inefficient SOQL Query',
            description: 'SOQL queries should select only necessary fields and use LIMIT clauses where appropriate.',
            recommendation: 'Select only required fields and add LIMIT clauses to prevent large data retrieval.'
        },

        // Property Initialization
        UNINITIALIZED_PROPERTIES: {
            patterns: [
                /(?:public|private|protected)\s+\w+\s+\w+;(?!\s*=)/i
            ],
            severity: 'Medium' as const,
            category: 'Lifecycle' as const,
            title: 'Uninitialized Properties',
            description: 'Properties should be properly initialized to avoid undefined behavior.',
            recommendation: 'Initialize properties with appropriate default values in constructors or at declaration.'
        },

        // Security - CRUD/FLS Checks
        MISSING_CRUD_FLS: {
            patterns: [
                /insert\s+(?!.*Schema\.sObjectType.*isCreateable)/i,
                /update\s+(?!.*Schema\.sObjectType.*isUpdateable)/i,
                /delete\s+(?!.*Schema\.sObjectType.*isDeletable)/i
            ],
            severity: 'High' as const,
            category: 'Security' as const,
            title: 'Missing CRUD/FLS Checks',
            description: 'DML operations should include CRUD and Field-Level Security checks.',
            recommendation: 'Implement proper CRUD and FLS permission checks before performing DML operations.'
        },

        // Code Style and Formatting
        LONG_LINES: {
            patterns: [
                /.{120,}/g
            ],
            severity: 'Low' as const,
            category: 'Style' as const,
            title: 'Long Lines',
            description: 'Lines longer than 120 characters can reduce code readability.',
            recommendation: 'Break long lines into multiple lines for better readability.'
        },

        // Documentation Issues
        MISSING_CLASS_COMMENTS: {
            patterns: [
                /(?:public|private|global)\s+(?:with\s+sharing\s+|without\s+sharing\s+)?class\s+\w+(?!\s*\/\*\*)/i
            ],
            severity: 'Low' as const,
            category: 'Documentation' as const,
            title: 'Missing Class Documentation',
            description: 'Classes should have proper documentation comments.',
            recommendation: 'Add comprehensive class-level documentation describing purpose and usage.'
        },

        // Naming Conventions
        NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|global)\s+(?:static\s+)?(?:final\s+)?[A-Z][a-zA-Z]*\s+[a-z][a-zA-Z]*_[a-zA-Z_]+\s*[=;]/i
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Naming Convention Issues',
            description: 'Variable names should follow camelCase convention instead of using underscores.',
            recommendation: 'Use camelCase naming convention for variables and methods.'
        }
    };

    public static getInstance(): CodeReviewService {
        if (!CodeReviewService.instance) {
            CodeReviewService.instance = new CodeReviewService();
        }
        return CodeReviewService.instance;
    }

    /**
     * Analyzes the current active file for code review issues
     */
    public async analyzeCurrentFile(): Promise<CodeReviewIssue[]> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('No active file to analyze');
        }

        return await this.analyzeFile(activeEditor.document.uri.fsPath);
    }

    /**
     * Analyzes a specific file for code review issues
     */
    public async analyzeFile(filePath: string): Promise<CodeReviewIssue[]> {
        const issues: CodeReviewIssue[] = [];
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const fileExtension = path.extname(filePath).toLowerCase();
            
            // Only analyze relevant file types
            if (!['.cls', '.trigger', '.js', '.ts', '.html', '.css', '.page', '.component'].includes(fileExtension)) {
                return issues;
            }

            OrgUtils.logDebug(`[VisbalExt.CodeReviewService] analyzeFile -- Analyzing file: ${filePath}`);

            // Apply code review rules based on file type
            for (const [ruleKey, rule] of Object.entries(this.codeReviewRules)) {
                for (const pattern of rule.patterns) {
                    // Search line by line for more accurate line numbers
                    const matches = this.findPatternMatchesLineByLine(lines, pattern);
                    
                    for (const match of matches) {
                        const issue: CodeReviewIssue = {
                            id: `${ruleKey}-${match.line}-${match.column}`,
                            category: rule.category,
                            severity: rule.severity,
                            title: rule.title,
                            description: rule.description,
                            file: filePath,
                            line: match.line,
                            column: match.column,
                            code: match.code.trim(),
                            suggestion: rule.recommendation,
                            impact: this.getImpactDescription(rule.severity)
                        };
                        issues.push(issue);
                    }
                }
            }

            OrgUtils.logDebug(`[VisbalExt.CodeReviewService] analyzeFile -- Found ${issues.length} issues in ${filePath}`);

        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.CodeReviewService] analyzeFile -- Error analyzing file: ${filePath}`, error as Error);
            throw new Error(`Failed to analyze file ${filePath}: ${error.message}`);
        }

        return issues;
    }

    /**
     * Finds pattern matches by searching line by line for more accurate results
     */
    private findPatternMatchesLineByLine(lines: string[], pattern: RegExp): Array<{line: number, column: number, code: string}> {
        const matches: Array<{line: number, column: number, code: string}> = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1; // 1-based line numbers
            
            // Skip empty lines and comments
            if (!line.trim() || this.isLineComment(line)) {
                continue;
            }
            
            if (pattern.global) {
                let match;
                // Reset the pattern to start from beginning of each line
                pattern.lastIndex = 0;
                while ((match = pattern.exec(line)) !== null) {
                    matches.push({
                        line: lineNumber,
                        column: match.index + 1, // 1-based column numbers
                        code: this.getContextualCode(lines, i)
                    });
                }
                pattern.lastIndex = 0; // Reset for next line
            } else {
                const match = pattern.exec(line);
                if (match) {
                    matches.push({
                        line: lineNumber,
                        column: match.index + 1, // 1-based column numbers
                        code: this.getContextualCode(lines, i)
                    });
                }
            }
        }
        
        return matches;
    }

    /**
     * Checks if a line is a comment line
     */
    private isLineComment(line: string): boolean {
        const trimmedLine = line.trim();
        return trimmedLine.startsWith('//') || 
               trimmedLine.startsWith('/*') || 
               trimmedLine.startsWith('*') ||
               trimmedLine.startsWith('<!--');
    }

    /**
     * Finds pattern matches in content (legacy method)
     */
    private findPatternMatches(content: string, pattern: RegExp, lines: string[]): Array<{line: number, column: number, code: string}> {
        const matches: Array<{line: number, column: number, code: string}> = [];
        
        if (pattern.global) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const position = this.getLineAndColumn(content, match.index);
                
                // Skip matches that are in comments
                if (!this.isInComment(lines[position.line - 1], position.column - 1)) {
                    matches.push({
                        line: position.line,
                        column: position.column,
                        code: this.getContextualCode(lines, position.line - 1)
                    });
                }
            }
        } else {
            const match = pattern.exec(content);
            if (match) {
                const position = this.getLineAndColumn(content, match.index);
                
                // Skip matches that are in comments
                if (!this.isInComment(lines[position.line - 1], position.column - 1)) {
                    matches.push({
                        line: position.line,
                        column: position.column,
                        code: this.getContextualCode(lines, position.line - 1)
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Checks if a position is within a comment
     */
    private isInComment(line: string, columnIndex: number): boolean {
        if (!line) return false;
        
        // Check for single-line comments
        const singleLineCommentIndex = line.indexOf('//');
        if (singleLineCommentIndex !== -1 && columnIndex >= singleLineCommentIndex) {
            return true;
        }
        
        // Check for multi-line comment start (basic check)
        const multiLineCommentStart = line.indexOf('/*');
        const multiLineCommentEnd = line.indexOf('*/');
        if (multiLineCommentStart !== -1 && columnIndex >= multiLineCommentStart) {
            if (multiLineCommentEnd === -1 || columnIndex < multiLineCommentEnd) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Gets the line and column from a character index
     */
    private getLineAndColumn(content: string, index: number): { line: number; column: number } {
        const beforeMatch = content.substring(0, index);
        const line = beforeMatch.split('\n').length;
        const column = beforeMatch.split('\n').pop()?.length || 0;
        return { line, column: column + 1 };
    }

    /**
     * Gets contextual code around a specific line
     */
    private getContextualCode(lines: string[], lineIndex: number): string {
        const contextLines = 3;
        const startLine = Math.max(0, lineIndex - contextLines);
        const endLine = Math.min(lines.length - 1, lineIndex + contextLines);
        
        return lines.slice(startLine, endLine + 1).join('\n');
    }

    /**
     * Removes comments from code content for better analysis
     */
    private removeComments(content: string, fileExtension: string): string {
        switch (fileExtension) {
            case '.cls':
            case '.trigger':
            case '.js':
            case '.ts':
                // Remove single-line comments
                content = content.replace(/\/\/.*$/gm, '');
                // Remove multi-line comments
                content = content.replace(/\/\*[\s\S]*?\*\//g, '');
                break;
            case '.html':
            case '.page':
            case '.component':
                // Remove HTML comments
                content = content.replace(/<!--[\s\S]*?-->/g, '');
                break;
            case '.css':
                // Remove CSS comments
                content = content.replace(/\/\*[\s\S]*?\*\//g, '');
                break;
        }
        return content;
    }

    /**
     * Gets impact description based on severity
     */
    private getImpactDescription(severity: string): string {
        switch (severity) {
            case 'Critical':
                return 'This issue could cause system failures, governor limit violations, or security vulnerabilities.';
            case 'High':
                return 'This issue could impact performance, reliability, or create maintenance problems.';
            case 'Medium':
                return 'This issue affects code quality and maintainability.';
            case 'Low':
                return 'This is a minor improvement that enhances code quality.';
            default:
                return 'This issue should be addressed to improve code quality.';
        }
    }

    /**
     * Analyzes all files in the workspace
     */
    public async analyzeWorkspace(): Promise<CodeReviewReport> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const allIssues: CodeReviewIssue[] = [];
        const scannedFiles: string[] = [];

        for (const folder of workspaceFolders) {
            const files = await this.findRelevantFiles(folder.uri.fsPath);
            
            for (const file of files) {
                try {
                    const issues = await this.analyzeFile(file);
                    allIssues.push(...issues);
                    scannedFiles.push(file);
                } catch (error) {
                    OrgUtils.logError(`[VisbalExt.CodeReviewService] analyzeWorkspace -- Error analyzing file: ${file}`, error as Error);
                }
            }
        }

        const report: CodeReviewReport = {
            totalIssues: allIssues.length,
            criticalSeverityCount: allIssues.filter(i => i.severity === 'Critical').length,
            highSeverityCount: allIssues.filter(i => i.severity === 'High').length,
            mediumSeverityCount: allIssues.filter(i => i.severity === 'Medium').length,
            lowSeverityCount: allIssues.filter(i => i.severity === 'Low').length,
            issues: allIssues,
            scannedFiles,
            scanTime: new Date()
        };

        OrgUtils.logDebug(`[VisbalExt.CodeReviewService] analyzeWorkspace -- Completed analysis: ${report.totalIssues} total issues found`);

        return report;
    }

    /**
     * Finds relevant files to analyze in a directory
     */
    private async findRelevantFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        const relevantExtensions = ['.cls', '.trigger', '.js', '.ts', '.html', '.css', '.page', '.component'];

        const processDirectory = async (currentPath: string) => {
            try {
                const entries = fs.readdirSync(currentPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(currentPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Skip common directories that don't contain relevant files
                        if (!['node_modules', '.git', '.sfdx', 'coverage', 'dist', '__tests__'].includes(entry.name)) {
                            await processDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (relevantExtensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                OrgUtils.logError(`[VisbalExt.CodeReviewService] processDirectory -- Error processing directory: ${currentPath}`, error as Error);
            }
        };

        await processDirectory(dirPath);
        return files;
    }
}
