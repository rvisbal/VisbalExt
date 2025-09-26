import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OrgUtils } from '../utils/orgUtils';

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
    
    // Custom Settings and System Objects that are exempt from CRUD/FLS checks (from CRUD.md)
    private readonly EXEMPT_CUSTOM_SETTINGS = [
        'Hierarchy_Settings__c', 'Feature_Management_Overrides__c', 'Hierarchy_Display_Fields__c',
        'Hierarchy_Whitespace_Fields__c', 'User_Usage_Metrics__c', 'Usage_Metrics__c',
        'Excluded_Domain__c', 'Child_Object_Display_Settings__c', 'Create_Record_Fields__c',
        'Child_Hierarchy__c', 'Hierarchy_Child_Object__c', 'Hierarchy__c',
        'Hierarchy_Per_Profile_Object__c', 'Hierarchy_Rollup__c', 'Hierarchy_Grouping__c',
        'Filter__c', 'FilterSet__c'
    ];

    private readonly EXEMPT_SYSTEM_OBJECTS = [
        'AsyncApexJob', 'CronTrigger', 'ApexClass', 'ApexTrigger', 'User', 'Profile',
        'PermissionSet', 'PermissionSetAssignment', 'Organization', 'SetupEntityAccess',
        'ObjectPermissions', 'FieldPermissions', 'ApexLog', 'EmailMessage'
    ];

    // Security patterns and rules based on the MD files
    private securityRules = {
        CRUD_FLS: [
            {
                pattern: /\b(?:insert|update|delete|upsert)\s+[a-zA-Z_][a-zA-Z0-9_]*(?:\s*;|\s+[a-zA-Z_][a-zA-Z0-9_]*)/gi,
                severity: 'HIGH' as const,
                title: 'DML Operation without CRUD/FLS Check',
                description: 'DML operation detected without proper CRUD/FLS permission checks',
                recommendation: 'Use isAccessible(), isCreateable(), isUpdateable(), or isDeletable() before DML operations, or add WITH USER_MODE',
                ruleSource: 'CRUD.md'
            },
            {
                pattern: /\[\s*SELECT\s+[\w,\s*]+\s+FROM\s+\w+(?:\s+WHERE.*?)?\s*\](?!.*WITH\s+(?:USER_MODE|SYSTEM_MODE))/gi,
                severity: 'MEDIUM' as const,
                title: 'SOQL Query without FLS Check or User Mode',
                description: 'SOQL query detected without field-level security checks or WITH USER_MODE',
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
                pattern: /\[\s*SELECT\s+[^]]*\+[^]]*\](?!.*String\.escapeSingleQuotes)/gi,
                severity: 'HIGH' as const,
                title: 'Potential SOQL Injection without Sanitization',
                description: 'String concatenation detected in SOQL query without proper sanitization',
                recommendation: 'Use bind variables (:variable) instead of string concatenation, or sanitize with String.escapeSingleQuotes()',
                ruleSource: 'SOQL_Injections.md'
            },
            {
                pattern: /String\.format\s*\([^)]*SELECT[^)]*\)(?!.*String\.escapeSingleQuotes)/gi,
                severity: 'MEDIUM' as const,
                title: 'Dynamic SOQL Query without Sanitization',
                description: 'Dynamic SOQL query construction detected without proper input sanitization',
                recommendation: 'Validate inputs and use String.escapeSingleQuotes() or proper escaping mechanisms',
                ruleSource: 'SOQL_Injections.md'
            },
            {
                pattern: /getWhereClause\s*\([^)]*\)(?!.*validateWhereClause)/gi,
                severity: 'HIGH' as const,
                title: 'Missing validateWhereClause() Call',
                description: 'getWhereClause() called without subsequent validateWhereClause() validation',
                recommendation: 'Always call SoqlQuerySanitizer.validateWhereClause() after getWhereClause()',
                ruleSource: 'SOQL_Injections.md'
            }
        ],
        SHARING: [
            {
                pattern: /(?:global|public)\s+class\s+\w+(?:\s+extends\s+\w+)?\s*\{(?!.*with\s+sharing|without\s+sharing)/gi,
                severity: 'MEDIUM' as const,
                title: 'Global/Public Class Missing Sharing Declaration',
                description: 'Global or public class found without explicit sharing declaration',
                recommendation: 'Add "with sharing" keyword for entry point classes (Controllers, @AuraEnabled, WebService)',
                ruleSource: 'Sharing.md'
            },
            {
                pattern: /@AuraEnabled\s+(?:public|global|static)(?!.*(?:Profile|PermissionSet|hasAccess|canRead|canCreate|canUpdate|canDelete))/gi,
                severity: 'HIGH' as const,
                title: '@AuraEnabled Method without Access Control',
                description: '@AuraEnabled method accessible to all users without proper access control checks',
                recommendation: 'Ensure class uses "with sharing" and implement proper access control checks using Profile, PermissionSet, or permission methods',
                ruleSource: 'Sharing.md'
            },
            {
                pattern: /(?:global|public)\s+(?:with|without)\s+sharing\s+class\s+\w+\s+implements\s+\w*Batch\w*/gi,
                severity: 'MEDIUM' as const,
                title: 'Batch Class Sharing Context',
                description: 'Batch class with sharing declaration - verify if this is the intended behavior',
                recommendation: 'Review if batch class should run with or without sharing based on business requirements',
                ruleSource: 'security.md'
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
                pattern: /System\.debug\s*\([^)]*(?:password|token|secret|key|credential|auth|api[_\s]?key)[^)]*\)/gi,
                severity: 'HIGH' as const,
                title: 'Sensitive Information in Debug',
                description: 'Potential sensitive information exposure in debug statements',
                recommendation: 'Never expose sensitive data in debug statements',
                ruleSource: 'UI_Security_considerations.md'
            },
            {
                pattern: /(?:console\.log|alert)\s*\([^)]*(?:password|token|secret|key|credential)[^)]*\)/gi,
                severity: 'HIGH' as const,
                title: 'Sensitive Information in JavaScript Debug',
                description: 'Potential sensitive information exposure in JavaScript debug/alert statements',
                recommendation: 'Never expose sensitive data in console.log or alert statements',
                ruleSource: 'UI_Security_considerations.md'
            }
        ],
        GENERAL: [
            {
                pattern: /trigger\s+\w+\s+on\s+\w+\s*\([^)]+\)/gi,
                severity: 'LOW' as const,
                title: 'Trigger Detection',
                description: 'Trigger found - ensure single trigger per object pattern and proper sharing context',
                recommendation: 'Use trigger handler pattern, consolidate triggers, and note that triggers run in system context',
                ruleSource: 'security.md'
            },
            {
                pattern: /(?:global|public)\s+class\s+\w+(?!.*(?:Test|Mock)).*implements\s+\w*Schedulable\w*/gi,
                severity: 'MEDIUM' as const,
                title: 'Schedulable Class Security',
                description: 'Schedulable class detected - ensure proper security context and permissions',
                recommendation: 'Review security context and ensure scheduled jobs have appropriate permissions',
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
                    let matchCount = 0;
                    let exemptCount = 0;
                    let permissionCheckCount = 0;
                    
                    for (const match of matches) {
                        if (match.index !== undefined) {
                            matchCount++;
                            // Convert position back to original content for accurate line/column
                            const originalPosition = this.mapCleanedPositionToOriginal(content, cleanedContent, match.index);
                            if (originalPosition && !this.isInComment(content, originalPosition.index)) {
                                // Check if this is an exempt object before flagging CRUD issues
                                if (category === 'CRUD_FLS' && this.isExemptFromCrudChecks(match[0], content, originalPosition.index)) {
                                    exemptCount++;
                                    continue;
                                }
                                
                                // For DML operations, check if there are permission checks nearby
                                if (category === 'CRUD_FLS' && rule.title.includes('DML Operation') && 
                                    this.hasNearbyPermissionChecks(content, originalPosition.index)) {
                                    permissionCheckCount++;
                                    continue;
                                }
                                
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
                    
                    // Debug logging for CRUD_FLS category to understand filtering
                    if (category === 'CRUD_FLS' && matchCount > 0) {
                        OrgUtils.logDebug(`[VisbalExt.SecurityAnalysis] ${rule.title} in ${path.basename(filePath)}: ${matchCount} matches, ${exemptCount} exempted, ${permissionCheckCount} with permission checks, ${matchCount - exemptCount - permissionCheckCount} flagged`);
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

            // Find all relevant files, excluding Salesforce CLI cache and focusing on source directories
            const excludePattern = '{**/node_modules/**,**/.sfdx/**,**/dist/**,**/out/**,**/build/**}';
            
            // Focus on Salesforce project structure - force-app is the standard directory
            let allApexFiles = await vscode.workspace.findFiles('force-app/**/*.{cls,trigger}', excludePattern);
            
            // If no files found in force-app, try other common Salesforce directories
            if (allApexFiles.length === 0) {
                const srcApexFiles = await vscode.workspace.findFiles('src/**/*.{cls,trigger}', excludePattern);
                allApexFiles = srcApexFiles;
            }
            
            // If still no files, fallback to broader search but still exclude .sfdx and cache directories
            if (allApexFiles.length === 0) {
                const fallbackApexFiles = await vscode.workspace.findFiles('**/*.{cls,trigger}', excludePattern);
                allApexFiles = fallbackApexFiles;
            }
            
            console.log(`[SecurityAnalysis] Found ${allApexFiles.length} Apex files to analyze`);
            if (allApexFiles.length > 0) {
                OrgUtils.logDebug(`[VisbalExt.SecurityAnalysis] Sample file paths:`, allApexFiles.slice(0, 3).map(f => f.fsPath));
            }
            
            const jsFiles = await vscode.workspace.findFiles('force-app/**/*.{js,ts}', excludePattern);
            const htmlFiles = await vscode.workspace.findFiles('force-app/**/*.{html,css}', excludePattern);
            
            const allFiles = [...allApexFiles, ...jsFiles, ...htmlFiles];
            
            OrgUtils.logDebug(`[VisbalExt.SecurityAnalysis] Total files to scan: ${allFiles.length} (${allApexFiles.length} Apex, ${jsFiles.length} JS/TS, ${htmlFiles.length} HTML/CSS)`);

            for (const file of allFiles) {
                const filePath = file.fsPath;
                scannedFiles.push(filePath);
                const fileIssues = await this.analyzeFile(filePath);
                issues.push(...fileIssues);
            }
            
            OrgUtils.logDebug(`[VisbalExt.SecurityAnalysis] Scan complete: ${issues.length} issues found across ${scannedFiles.length} files`);

        } catch (error) {
            console.error('[VisbalExt.SecurityAnalysis] Error during workspace analysis:', error);
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
     * Enhanced version that preserves line structure for accurate position mapping
     */
    private removeComments(content: string, fileExtension: string): string {
        if (['.cls', '.trigger', '.js', '.ts'].includes(fileExtension)) {
            return this.removeApexJavaScriptComments(content);
        } else if (['.html'].includes(fileExtension)) {
            // Remove HTML comments (<!-- ... -->) but preserve line breaks
            return content.replace(/<!--[\s\S]*?-->/g, (match) => 
                ' '.repeat(match.length - (match.match(/\n/g) || []).length) + '\n'.repeat((match.match(/\n/g) || []).length)
            );
        } else if (['.css'].includes(fileExtension)) {
            // Remove CSS comments (/* ... */) but preserve line breaks
            return content.replace(/\/\*[\s\S]*?\*\//g, (match) => 
                ' '.repeat(match.length - (match.match(/\n/g) || []).length) + '\n'.repeat((match.match(/\n/g) || []).length)
            );
        }
        
        return content;
    }

    /**
     * Enhanced comment removal for Apex/JavaScript that preserves line structure
     */
    private removeApexJavaScriptComments(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let inMultiLineComment = false;
        
        for (const line of lines) {
            let processedLine = line;
            
            // Handle multi-line comments
            if (inMultiLineComment) {
                const endIndex = line.indexOf('*/');
                if (endIndex >= 0) {
                    // End of multi-line comment found
                    processedLine = ' '.repeat(endIndex + 2) + line.substring(endIndex + 2);
                    inMultiLineComment = false;
                } else {
                    // Still in multi-line comment, replace entire line with spaces
                    processedLine = ' '.repeat(line.length);
                }
            } else {
                // Look for start of multi-line comment
                const startIndex = line.indexOf('/*');
                const singleLineIndex = line.indexOf('//');
                
                if (startIndex >= 0 && (singleLineIndex < 0 || startIndex < singleLineIndex)) {
                    const endIndex = line.indexOf('*/', startIndex + 2);
                    if (endIndex >= 0) {
                        // Single-line multi-line comment
                        processedLine = line.substring(0, startIndex) + 
                                      ' '.repeat(endIndex - startIndex + 2) + 
                                      line.substring(endIndex + 2);
                    } else {
                        // Start of multi-line comment
                        processedLine = line.substring(0, startIndex) + ' '.repeat(line.length - startIndex);
                        inMultiLineComment = true;
                    }
                }
                
                // Handle single-line comments (only if not already processed)
                if (!inMultiLineComment && singleLineIndex >= 0) {
                    processedLine = line.substring(0, singleLineIndex) + ' '.repeat(line.length - singleLineIndex);
                }
            }
            
            result.push(processedLine);
        }
        
        return result.join('\n');
    }

    /**
     * Checks if a DML operation or query involves objects that are exempt from CRUD/FLS checks
     * Made more conservative to avoid over-exempting legitimate issues
     */
    private isExemptFromCrudChecks(matchText: string, content: string, position: number): boolean {
        // First check for explicit security exemption comments - these are definitive
        if (this.hasSecurityExemptionComment(content, position)) {
            return true;
        }
        
        // Only exempt if we can clearly identify the object in the immediate context
        // Look in a smaller, more precise window around the DML operation
        const window = this.getContextWindow(content, position, 100);
        
        // Check if the operation involves custom settings (more restrictive check)
        for (const customSetting of this.EXEMPT_CUSTOM_SETTINGS) {
            // Only exempt if the custom setting is explicitly mentioned in the immediate vicinity
            if (window.includes(customSetting)) {
                return true;
            }
        }
        
        // Check if the operation involves system objects (more restrictive check)
        for (const systemObject of this.EXEMPT_SYSTEM_OBJECTS) {
            // Only exempt if the system object is explicitly mentioned in the immediate vicinity
            if (window.includes(systemObject)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Gets a context window around a position for more precise object detection
     */
    private getContextWindow(content: string, position: number, windowSize: number): string {
        const start = Math.max(0, position - windowSize);
        const end = Math.min(content.length, position + windowSize);
        return content.substring(start, end);
    }
    
    /**
     * Checks if an object name appears near the given position in the content
     */
    private isNearObject(content: string, position: number, objectName: string): boolean {
        // Look in a 200-character window around the position
        const start = Math.max(0, position - 100);
        const end = Math.min(content.length, position + 100);
        const window = content.substring(start, end);
        
        // Look for the object name with word boundaries
        const regex = new RegExp(`\\b${objectName}\\b`, 'i');
        return regex.test(window);
    }
    
    /**
     * Checks if there's a security exemption comment near the position
     */
    private hasSecurityExemptionComment(content: string, position: number): boolean {
        const lines = content.split('\n');
        const positionInfo = this.getLineAndColumn(content, position);
        const lineIndex = positionInfo.line - 1;
        
        // Check current line and 3 lines above for exemption comments
        const startLine = Math.max(0, lineIndex - 3);
        const endLine = Math.min(lines.length - 1, lineIndex + 1);
        
        for (let i = startLine; i <= endLine; i++) {
            const line = lines[i].toLowerCase();
            if (line.includes('sf-scanner-ignore') && line.includes('apexcrudviolation') ||
                line.includes('dml') && line.includes('fls') && line.includes('security') && line.includes('exception') ||
                line.includes('security note:') && (line.includes('custom setting') || line.includes('system object'))) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Checks if there are permission check methods near the DML operation
     */
    private hasNearbyPermissionChecks(content: string, position: number): boolean {
        // Look in a reasonable window around the DML operation (previous 500 chars, next 200 chars)
        const start = Math.max(0, position - 500);
        const end = Math.min(content.length, position + 200);
        const window = content.substring(start, end);
        
        // Check for permission methods
        const permissionPatterns = [
            /\bisAccessible\s*\(\)/gi,
            /\bisCreateable\s*\(\)/gi,
            /\bisUpdateable\s*\(\)/gi,
            /\bisDeletable\s*\(\)/gi,
            /\bstripInaccessible\s*\(/gi,
            /WITH\s+USER_MODE/gi,
            /WITH\s+SYSTEM_MODE/gi,
            // Also check for PermissionService or similar custom permission checking
            /PermissionService\s*\.\s*can\w+/gi,
            /\bcanRead\w*\s*\(/gi,
            /\bcanCreate\w*\s*\(/gi,
            /\bcanUpdate\w*\s*\(/gi,
            /\bcanDelete\w*\s*\(/gi
        ];
        
        for (const pattern of permissionPatterns) {
            if (pattern.test(window)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Maps a position in cleaned content back to the original content
     * Enhanced version that maintains line structure for more accurate mapping
     */
    private mapCleanedPositionToOriginal(originalContent: string, cleanedContent: string, cleanedIndex: number): { index: number } | null {
        // Since we preserve line structure in our enhanced comment removal,
        // we can do a more direct mapping
        const cleanedLines = cleanedContent.split('\n');
        const originalLines = originalContent.split('\n');
        
        if (cleanedLines.length !== originalLines.length) {
            // Fallback to original method if line counts don't match
            return this.mapCleanedPositionToOriginalFallback(originalContent, cleanedContent, cleanedIndex);
        }
        
        // Find which line and column the cleaned index corresponds to
        let currentIndex = 0;
        let lineIndex = 0;
        let columnIndex = 0;
        
        for (let i = 0; i < cleanedLines.length && currentIndex <= cleanedIndex; i++) {
            const lineLength = cleanedLines[i].length;
            if (currentIndex + lineLength >= cleanedIndex) {
                lineIndex = i;
                columnIndex = cleanedIndex - currentIndex;
                break;
            }
            currentIndex += lineLength + 1; // +1 for the newline character
        }
        
        // Map back to original content at the same line and column
        let originalIndex = 0;
        for (let i = 0; i < lineIndex && i < originalLines.length; i++) {
            originalIndex += originalLines[i].length + 1;
        }
        
        if (lineIndex < originalLines.length) {
            originalIndex += Math.min(columnIndex, originalLines[lineIndex].length);
        }
        
        return { index: originalIndex };
    }
    
    /**
     * Fallback method for position mapping when line structure doesn't match
     */
    private mapCleanedPositionToOriginalFallback(originalContent: string, cleanedContent: string, cleanedIndex: number): { index: number } | null {
        const beforeMatch = cleanedContent.substring(0, cleanedIndex);
        const matchLength = Math.min(20, cleanedContent.length - cleanedIndex);
        const matchText = cleanedContent.substring(cleanedIndex, cleanedIndex + matchLength).trim();
        
        if (matchText.length === 0) {
            return null;
        }
        
        // Try to find the same text in the original content
        let searchStart = 0;
        for (let i = 0; i < beforeMatch.length && searchStart < originalContent.length; i++) {
            if (beforeMatch[i] === originalContent[searchStart]) {
                searchStart++;
            } else if (beforeMatch[i] !== ' ' && beforeMatch[i] !== '\t') {
                // Skip ahead to account for removed comments, but only for non-whitespace
                while (searchStart < originalContent.length && 
                       originalContent[searchStart] !== beforeMatch[i]) {
                    searchStart++;
                }
                if (searchStart < originalContent.length) {
                    searchStart++;
                }
            }
        }
        
        const foundIndex = originalContent.indexOf(matchText, Math.max(0, searchStart - 50));
        return foundIndex >= 0 ? { index: foundIndex } : null;
    }

    /**
     * Enhanced check if a position in the content is within a comment
     * More accurate detection that handles edge cases
     */
    private isInComment(content: string, index: number): boolean {
        const beforeIndex = content.substring(0, index + 1);
        
        // Split content into lines to check single-line comments more accurately
        const lines = content.split('\n');
        const position = this.getLineAndColumn(content, index);
        const lineIndex = position.line - 1;
        
        if (lineIndex >= 0 && lineIndex < lines.length) {
            const currentLine = lines[lineIndex];
            const columnIndex = position.column - 1;
            
            // Check if we're in a single-line comment on the current line
            const singleLineCommentIndex = currentLine.indexOf('//');
            if (singleLineCommentIndex >= 0 && columnIndex >= singleLineCommentIndex) {
                return true;
            }
        }
        
        // Check if we're in a multi-line comment using a state machine approach
        let inComment = false;
        let i = 0;
        
        while (i < beforeIndex.length) {
            if (!inComment) {
                // Look for start of multi-line comment
                if (i < beforeIndex.length - 1 && 
                    beforeIndex.charAt(i) === '/' && beforeIndex.charAt(i + 1) === '*') {
                    inComment = true;
                    i += 2;
                    continue;
                }
                
                // Look for single-line comment - skip to end of line
                if (i < beforeIndex.length - 1 && 
                    beforeIndex.charAt(i) === '/' && beforeIndex.charAt(i + 1) === '/') {
                    // Find next newline
                    while (i < beforeIndex.length && beforeIndex.charAt(i) !== '\n') {
                        i++;
                    }
                    continue;
                }
            } else {
                // Look for end of multi-line comment
                if (i < beforeIndex.length - 1 && 
                    beforeIndex.charAt(i) === '*' && beforeIndex.charAt(i + 1) === '/') {
                    inComment = false;
                    i += 2;
                    continue;
                }
            }
            i++;
        }
        
        return inComment;
    }
}
