import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as OrgUtilsModule from '../utils/orgUtils';
const OrgUtils = OrgUtilsModule.OrgUtils;

export interface CodeReviewIssue {
    id: string;
    category: 'Performance' | 'Security' | 'Maintainability' | 'Functionality' | 'Cleanup' | 'Constants' | 'Lifecycle' | 'Intent-Verification' | 'Style' | 'Documentation' | 'Conventions' | 'Null Safety';
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
            recommendation: 'Move SOQL queries and DML operations outside loops and use collections for bulk operations.',
            fileTypes: ['.cls', '.trigger']
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
            recommendation: 'Remove debug statements and use proper logging frameworks for production code.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
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
            recommendation: 'Replace magic numbers with descriptive constants for better maintainability.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Null Pointer Exception Prevention
        NULL_CHECKS: {
            patterns: [
                // Match method calls on variables that might be null (more specific patterns)
                /(?:^|\s|=|\()\s*(\w+)\s*\.\s*\w+\s*\([^)]*\)(?!\s*[;&\}\n]*\s*(?:if\s*\(.*\1.*[!=]=.*null|\/\/.*null.*check))/m,
                // Match property access that could be null (more targeted)
                /(?:^|\s|=|\()\s*(\w+)\s*\.\s*\w+(?!\s*[;&\}\n]*\s*(?:if\s*\(.*\1.*[!=]=.*null|\/\/.*null.*check))(?=\s*[;&\}\n])/m
            ],
            severity: 'High' as const,
            category: 'Null Safety' as const,
            title: 'Potential Null Pointer Exception',
            description: 'Potential null pointer exception - missing null checks before method calls or property access.',
            recommendation: 'Add null checks before accessing object properties or calling methods.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
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
            recommendation: 'Consider using early returns, guard clauses, or extracting methods to reduce nesting.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
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
            recommendation: 'Implement proper exception handling with logging and user-friendly error messages.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
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
            recommendation: 'Make test methods private by adding the private keyword.',
            fileTypes: ['.cls']
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
            recommendation: 'Select only required fields and add LIMIT clauses to prevent large data retrieval.',
            fileTypes: ['.cls', '.trigger']
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
            recommendation: 'Initialize properties with appropriate default values in constructors or at declaration.',
            fileTypes: ['.cls', '.trigger']
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
            recommendation: 'Implement proper CRUD and FLS permission checks before performing DML operations.',
            fileTypes: ['.cls', '.trigger']
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
            recommendation: 'Break long lines into multiple lines for better readability.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts', '.html', '.css', '.page', '.component']
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
            recommendation: 'Add comprehensive class-level documentation describing purpose and usage.',
            fileTypes: ['.cls', '.trigger']
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
            recommendation: 'Use camelCase naming convention for variables and methods.',
            fileTypes: ['.cls', '.trigger']
        },

        // Apex Assertions Should Include Message
        APEX_ASSERTIONS_SHOULD_INCLUDE_MESSAGE: {
            patterns: [
                /System\.assert\s*\(\s*[^,)]+\s*\)/gi,
                /System\.assertEquals\s*\(\s*[^,]+,\s*[^,)]+\s*\)/gi,
                /System\.assertNotEquals\s*\(\s*[^,]+,\s*[^,)]+\s*\)/gi
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Apex Assertions Should Include Message',
            description: 'Assert methods should include descriptive messages to help with debugging test failures.',
            recommendation: 'Add a descriptive message as the third parameter to assert methods for better debugging.',
            fileTypes: ['.cls']
        },

        // Apex Unit Test Class Should Have Asserts
        APEX_UNIT_TEST_CLASS_SHOULD_HAVE_ASSERTS: {
            patterns: [
                /@isTest(?![^{]*(?:System\.assert|System\.assertEquals|System\.assertNotEquals))/i
            ],
            severity: 'High' as const,
            category: 'Functionality' as const,
            title: 'Apex Unit Test Should Have Assertions',
            description: 'Test methods should contain assertions to validate expected behavior.',
            recommendation: 'Add System.assert, System.assertEquals, or System.assertNotEquals statements to validate test results.',
            fileTypes: ['.cls']
        },

        // Apex Unit Test Should Have RunAs
        APEX_UNIT_TEST_SHOULD_HAVE_RUNAS: {
            patterns: [
                /@isTest(?![^{]*System\.runAs)/i
            ],
            severity: 'Medium' as const,
            category: 'Security' as const,
            title: 'Apex Unit Test Should Use System.runAs',
            description: 'Test methods should use System.runAs() to test with specific user context and permissions.',
            recommendation: 'Use System.runAs() to test functionality with appropriate user permissions and data visibility.',
            fileTypes: ['.cls']
        },

        // Apex Unit Test Method Should Have IsTest Annotation
        APEX_UNIT_TEST_METHOD_SHOULD_HAVE_ISTEST: {
            patterns: [
                /(?:public|private|global)\s+(?:static\s+)?(?:testMethod\s+)?void\s+test\w*\s*\([^)]*\)(?!\s*{[^}]*@isTest)/i,
                /testMethod\s+(?:public|private|global)?\s*(?:static\s+)?void(?!\s+@isTest)/i
            ],
            severity: 'High' as const,
            category: 'Functionality' as const,
            title: 'Test Methods Should Use @isTest Annotation',
            description: 'Test methods should use @isTest annotation instead of the deprecated testMethod keyword.',
            recommendation: 'Replace testMethod with @isTest annotation for better test organization and execution.',
            fileTypes: ['.cls']
        },

        // Apex Unit Test Should Not Use SeeAllData True
        APEX_UNIT_TEST_SHOULD_NOT_USE_SEEALLDATA_TRUE: {
            patterns: [
                /@isTest\s*\(\s*seeAllData\s*=\s*true\s*\)/i,
                /testMethod\s+seeAllData\s*=\s*true/i
            ],
            severity: 'High' as const,
            category: 'Functionality' as const,
            title: 'Avoid seeAllData=true in Tests',
            description: 'Tests should not use seeAllData=true as it makes tests dependent on org data and less reliable.',
            recommendation: 'Create test data within the test method or use @TestSetup methods instead of relying on org data.',
            fileTypes: ['.cls']
        },

        // Avoid Global Modifier
        AVOID_GLOBAL_MODIFIER: {
            patterns: [
                /global\s+(?:class|interface|enum)/i,
                /global\s+(?:static\s+)?(?:void|[A-Z]\w*)\s+\w+\s*\(/i
            ],
            severity: 'Medium' as const,
            category: 'Security' as const,
            title: 'Avoid Global Modifier',
            description: 'Global modifier should be avoided unless creating managed package components or web services.',
            recommendation: 'Use public modifier instead of global unless specifically required for managed packages or web services.',
            fileTypes: ['.cls', '.trigger']
        },

        // Avoid Logic in Trigger
        AVOID_LOGIC_IN_TRIGGER: {
            patterns: [
                /trigger\s+\w+\s+on\s+\w+\s*\([^)]*\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*(?:if\s*\(|for\s*\(|while\s*\(|switch\s+on|Database\.|System\.)/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'Avoid Business Logic in Triggers',
            description: 'Triggers should delegate to handler classes instead of containing business logic directly.',
            recommendation: 'Move business logic to dedicated handler classes and call them from triggers for better maintainability and testing.',
            fileTypes: ['.trigger']
        },

        // Debug Statements Should Use Logging Level
        DEBUGS_SHOULD_USE_LOGGING_LEVEL: {
            patterns: [
                /System\.debug\s*\(\s*[^,)]+\s*\)/gi
            ],
            severity: 'Low' as const,
            category: 'Cleanup' as const,
            title: 'Debug Should Specify Logging Level',
            description: 'System.debug should specify a logging level for better log management and performance.',
            recommendation: 'Use System.debug(LoggingLevel.DEBUG, message) or appropriate logging level instead of System.debug(message).',
            fileTypes: ['.cls', '.trigger']
        },

        // Queueable Without Finalizer
        QUEUEABLE_WITHOUT_FINALIZER: {
            patterns: [
                /class\s+\w+\s+implements\s+(?:[^{]*,\s*)?Queueable(?!\s*,\s*Database\.Finalizer)(?![^{]*implements[^{]*Database\.Finalizer)/i
            ],
            severity: 'Medium' as const,
            category: 'Functionality' as const,
            title: 'Queueable Should Implement Finalizer',
            description: 'Queueable classes should implement Database.Finalizer to handle job completion and error scenarios.',
            recommendation: 'Implement Database.Finalizer interface and add execute(FinalizerContext) method for proper error handling.',
            fileTypes: ['.cls']
        },

        // Unused Local Variable
        UNUSED_LOCAL_VARIABLE: {
            patterns: [
                /(?:public|private)\s+(?:static\s+)?(?:final\s+)?(\w+)\s+(\w+)\s*[=;][^}]*?(?!\2)/i
            ],
            severity: 'Low' as const,
            category: 'Cleanup' as const,
            title: 'Unused Local Variable',
            description: 'Local variables that are declared but never used should be removed.',
            recommendation: 'Remove unused local variables to improve code cleanliness and reduce memory usage.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Annotations Naming Conventions
        ANNOTATIONS_NAMING_CONVENTIONS: {
            patterns: [
                /@[a-z][a-zA-Z]*/g,
                /@[A-Z]+[a-z]*[A-Z][a-z]*/g
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Annotation Naming Convention Issues',
            description: 'Annotations should follow proper naming conventions (PascalCase).',
            recommendation: 'Use PascalCase for custom annotation names (e.g., @CustomAnnotation).',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Class Naming Conventions
        CLASS_NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|global)\s+(?:abstract\s+)?(?:virtual\s+)?class\s+[a-z]\w*/i,
                /(?:public|private|global)\s+(?:abstract\s+)?(?:virtual\s+)?class\s+\w*[a-z]\w*[A-Z]\w*[a-z]/i
            ],
            severity: 'Medium' as const,
            category: 'Conventions' as const,
            title: 'Class Naming Convention Issues',
            description: 'Class names should follow PascalCase convention and be descriptive.',
            recommendation: 'Use PascalCase for class names (e.g., AccountController, not accountController or account_controller).',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Field Declarations Should Be At Start
        FIELD_DECLARATIONS_SHOULD_BE_AT_START: {
            patterns: [
                /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Z]\w*\s+\w+\s*[=;][^}]*(?:public|private|protected)\s+(?:static\s+)?(?!\w*\s+\w+\s*\()/i
            ],
            severity: 'Medium' as const,
            category: 'Conventions' as const,
            title: 'Field Declarations Should Be At Class Start',
            description: 'Field declarations should be placed at the beginning of the class before methods.',
            recommendation: 'Move field declarations to the top of the class definition for better code organization.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Field Naming Conventions
        FIELD_NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Z]\w*\s+[A-Z]\w*/i,
                /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Z]\w*\s+\w*_\w*/i
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Field Naming Convention Issues',
            description: 'Field names should follow camelCase convention.',
            recommendation: 'Use camelCase for field names (e.g., accountName, not AccountName or account_name).',
            fileTypes: ['.cls', '.trigger']
        },

        // For Loops Must Use Braces
        FOR_LOOPS_MUST_USE_BRACES: {
            patterns: [
                /for\s*\([^)]*\)\s*(?![\s\n]*\{)[^;]*;/i
            ],
            severity: 'Medium' as const,
            category: 'Style' as const,
            title: 'For Loops Must Use Braces',
            description: 'For loops should always use braces even for single statements to improve readability and prevent errors.',
            recommendation: 'Add braces around for loop body statements for consistency and safety.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Formal Parameter Naming Conventions
        FORMAL_PARAMETER_NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*[A-Z]\w*[^)]*\)/i,
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*\w*_\w*[^)]*\)/i
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Parameter Naming Convention Issues',
            description: 'Method parameters should follow camelCase naming convention.',
            recommendation: 'Use camelCase for method parameter names (e.g., accountId, not AccountId or account_id).',
            fileTypes: ['.cls', '.trigger']
        },

        // If-Else Statements Must Use Braces
        IF_ELSE_STMTS_MUST_USE_BRACES: {
            patterns: [
                /if\s*\([^)]*\)\s*(?![\s\n]*\{)[^;]*;\s*else\s*(?![\s\n]*\{)[^;]*;/i,
                /if\s*\([^)]*\)\s*(?![\s\n]*\{)[^;]*;\s*else\s+if/i
            ],
            severity: 'Medium' as const,
            category: 'Style' as const,
            title: 'If-Else Statements Must Use Braces',
            description: 'If-else statements should always use braces to improve readability and prevent errors.',
            recommendation: 'Add braces around if-else statement bodies for consistency and safety.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // If Statements Must Use Braces
        IF_STMTS_MUST_USE_BRACES: {
            patterns: [
                /if\s*\([^)]*\)\s*(?![\s\n]*\{)[^;]*;(?!\s*else)/i
            ],
            severity: 'Medium' as const,
            category: 'Style' as const,
            title: 'If Statements Must Use Braces',
            description: 'If statements should always use braces even for single statements to improve readability and prevent errors.',
            recommendation: 'Add braces around if statement body for consistency and safety.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Local Variable Naming Conventions
        LOCAL_VARIABLE_NAMING_CONVENTIONS: {
            patterns: [
                /(?:for\s*\(|{\s*)[A-Z]\w*\s+[A-Z]\w*\s*[=;]/i,
                /(?:for\s*\(|{\s*)[A-Z]\w*\s+\w*_\w*\s*[=;]/i
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Local Variable Naming Convention Issues',
            description: 'Local variable names should follow camelCase convention.',
            recommendation: 'Use camelCase for local variable names (e.g., accountList, not AccountList or account_list).',
            fileTypes: ['.cls', '.trigger']
        },

        // Method Naming Conventions
        METHOD_NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+[A-Z]\w*\s*\(/i,
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w*_\w*\s*\(/i
            ],
            severity: 'Medium' as const,
            category: 'Conventions' as const,
            title: 'Method Naming Convention Issues',
            description: 'Method names should follow camelCase convention.',
            recommendation: 'Use camelCase for method names (e.g., getAccountName, not GetAccountName or get_account_name).',
            fileTypes: ['.cls', '.trigger']
        },

        // One Declaration Per Line
        ONE_DECLARATION_PER_LINE: {
            patterns: [
                /[A-Z]\w*\s+\w+\s*,\s*\w+/i,
                /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Z]\w*\s+\w+\s*,\s*\w+/i
            ],
            severity: 'Low' as const,
            category: 'Style' as const,
            title: 'One Declaration Per Line',
            description: 'Variable declarations should be placed on separate lines for better readability.',
            recommendation: 'Declare each variable on a separate line for improved code clarity.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Property Naming Conventions
        PROPERTY_NAMING_CONVENTIONS: {
            patterns: [
                /(?:public|private|protected)\s+[A-Z]\w*\s+[A-Z]\w*\s*\{\s*get/i,
                /(?:public|private|protected)\s+[A-Z]\w*\s+\w*_\w*\s*\{\s*get/i
            ],
            severity: 'Low' as const,
            category: 'Conventions' as const,
            title: 'Property Naming Convention Issues',
            description: 'Property names should follow camelCase convention.',
            recommendation: 'Use camelCase for property names (e.g., accountName, not AccountName or account_name).',
            fileTypes: ['.cls', '.trigger']
        },

        // While Loops Must Use Braces
        WHILE_LOOPS_MUST_USE_BRACES: {
            patterns: [
                /while\s*\([^)]*\)\s*(?![\s\n]*\{)[^;]*;/i
            ],
            severity: 'Medium' as const,
            category: 'Style' as const,
            title: 'While Loops Must Use Braces',
            description: 'While loops should always use braces even for single statements to improve readability and prevent errors.',
            recommendation: 'Add braces around while loop body statements for consistency and safety.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Avoid Boolean Method Parameters
        AVOID_BOOLEAN_METHOD_PARAMETERS: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*Boolean\s+\w+[^)]*\)/i,
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*boolean\s+\w+[^)]*\)/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Avoid Boolean Method Parameters',
            description: 'Methods with boolean parameters can be confusing and hard to understand at call sites.',
            recommendation: 'Consider using enums, separate methods, or builder pattern instead of boolean parameters for better readability.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Avoid Deeply Nested If Statements
        AVOID_DEEPLY_NESTED_IF_STMTS: {
            patterns: [
                /if\s*\([^{]*\)\s*\{[^{}]*if\s*\([^{]*\)\s*\{[^{}]*if\s*\([^{]*\)\s*\{[^{}]*if\s*\([^{]*\)\s*\{/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'Avoid Deeply Nested If Statements',
            description: 'Deeply nested if statements (4+ levels) reduce code readability and increase complexity.',
            recommendation: 'Refactor using early returns, guard clauses, or extract methods to reduce nesting levels.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Cognitive Complexity
        COGNITIVE_COMPLEXITY: {
            patterns: [
                /(?:if|else\s+if|for|while|switch|case|catch|\?\s*:|&&|\|\|)\s*[^{]*\{[^}]*(?:if|else\s+if|for|while|switch|case|catch|\?\s*:|&&|\|\|)[^}]*(?:if|else\s+if|for|while|switch|case|catch|\?\s*:|&&|\|\|)/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'High Cognitive Complexity',
            description: 'High cognitive complexity makes code difficult to understand and maintain.',
            recommendation: 'Break down complex methods into smaller, more focused methods to improve readability.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Cyclomatic Complexity
        CYCLOMATIC_COMPLEXITY: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*\)\s*\{[^}]*(?:if|else|for|while|switch|case|catch|\?\s*:|&&|\|\|)[^}]*(?:if|else|for|while|switch|case|catch|\?\s*:|&&|\|\|)[^}]*(?:if|else|for|while|switch|case|catch|\?\s*:|&&|\|\|)/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'High Cyclomatic Complexity',
            description: 'Methods with high cyclomatic complexity are harder to test and maintain.',
            recommendation: 'Reduce complexity by extracting methods, using polymorphism, or simplifying conditional logic.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Excessive Class Length
        EXCESSIVE_CLASS_LENGTH: {
            patterns: [
                /class\s+\w+[^}]{2000,}/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Excessive Class Length',
            description: 'Classes that are too long become difficult to understand and maintain.',
            recommendation: 'Consider breaking large classes into smaller, more focused classes following Single Responsibility Principle.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Excessive Parameter List
        EXCESSIVE_PARAMETER_LIST: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*\)/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Excessive Parameter List',
            description: 'Methods with too many parameters (6+) are difficult to use and understand.',
            recommendation: 'Use parameter objects, builder pattern, or method overloading to reduce parameter count.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Excessive Public Count
        EXCESSIVE_PUBLIC_COUNT: {
            patterns: [
                /class\s+\w+[^}]*(?:public\s+[^}]*){15,}/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Excessive Public Methods/Fields',
            description: 'Classes with too many public members may violate encapsulation principles.',
            recommendation: 'Review public interface and consider making some members private or protected, or split the class.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // NCSS Constructor Count
        NCSS_CONSTRUCTOR_COUNT: {
            patterns: [
                /(?:public|private|global)\s+\w+\s*\([^)]*\)\s*\{[^}]{500,}/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Constructor Too Complex',
            description: 'Constructors should be simple and focused on object initialization.',
            recommendation: 'Move complex logic from constructors to factory methods or initialization methods.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // NCSS Method Count
        NCSS_METHOD_COUNT: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*\)\s*\{[^}]{400,}/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'Method Too Long',
            description: 'Long methods are harder to understand, test, and maintain.',
            recommendation: 'Break down large methods into smaller, more focused methods with clear responsibilities.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // NCSS Type Count
        NCSS_TYPE_COUNT: {
            patterns: [
                /(?:class|interface|enum)\s+\w+[^}]{3000,}/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Type Too Large',
            description: 'Very large types become difficult to understand and maintain.',
            recommendation: 'Consider decomposing large types into smaller, more cohesive components.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Standard Cyclomatic Complexity
        STD_CYCLOMATIC_COMPLEXITY: {
            patterns: [
                /(?:public|private|protected|global)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+\w+\s*\([^)]*\)\s*\{[^}]*(?:if|else|for|while|do|switch|case|catch|\?\s*:)[^}]*(?:if|else|for|while|do|switch|case|catch|\?\s*:)[^}]*(?:if|else|for|while|do|switch|case|catch|\?\s*:)[^}]*(?:if|else|for|while|do|switch|case|catch|\?\s*:)/i
            ],
            severity: 'High' as const,
            category: 'Maintainability' as const,
            title: 'Standard Cyclomatic Complexity Violation',
            description: 'Methods exceeding standard cyclomatic complexity thresholds are harder to test and maintain.',
            recommendation: 'Refactor complex methods by extracting logic into separate methods or using design patterns.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Too Many Fields
        TOO_MANY_FIELDS: {
            patterns: [
                /class\s+\w+[^}]*(?:(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[A-Z]\w*\s+\w+[^}]*){12,}/i
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Too Many Fields',
            description: 'Classes with excessive fields may have too many responsibilities.',
            recommendation: 'Consider grouping related fields into separate classes or using composition to reduce field count.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // Unused Method
        UNUSED_METHOD: {
            patterns: [
                /(?:private|protected)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?\w+\s+(\w+)\s*\([^)]*\)\s*\{(?![^}]*\1\s*\()/i
            ],
            severity: 'Low' as const,
            category: 'Cleanup' as const,
            title: 'Unused Method',
            description: 'Private and protected methods that are never called should be removed.',
            recommendation: 'Remove unused methods to reduce code complexity and maintenance overhead.',
            fileTypes: ['.cls', '.trigger', '.js', '.ts']
        },

        // JavaScript: Avoid With Statement
        AVOID_WITH_STATEMENT: {
            patterns: [
                /with\s*\(/gi
            ],
            severity: 'High' as const,
            category: 'Security' as const,
            title: 'Avoid With Statement',
            description: 'The "with" statement creates ambiguous scope and should be avoided in JavaScript.',
            recommendation: 'Use explicit object property access instead of "with" statements for better code clarity and performance.',
            fileTypes: ['.js', '.ts']
        },

        // JavaScript: Consistent Return
        CONSISTENT_RETURN: {
            patterns: [
                /function\s+\w*\s*\([^)]*\)\s*\{[^}]*return\s+[^;]+;[^}]*return\s*;[^}]*\}/gi,
                /function\s+\w*\s*\([^)]*\)\s*\{[^}]*return\s*;[^}]*return\s+[^;]+;[^}]*\}/gi
            ],
            severity: 'Medium' as const,
            category: 'Functionality' as const,
            title: 'Inconsistent Return Statement',
            description: 'Functions should either always return a value or never return a value for consistency.',
            recommendation: 'Ensure all return paths in a function are consistent - either all return values or all return undefined/nothing.',
            fileTypes: ['.js', '.ts']
        },

        // JavaScript: Global Variable
        GLOBAL_VARIABLE: {
            patterns: [
                /^(?:var\s+|let\s+|const\s+)\w+\s*=/gm,
                /^\w+\s*=(?!=)/gm
            ],
            severity: 'Medium' as const,
            category: 'Maintainability' as const,
            title: 'Global Variable Declaration',
            description: 'Global variables can lead to naming conflicts and make code harder to maintain.',
            recommendation: 'Wrap code in modules, use namespaces, or encapsulate variables within functions to avoid global scope pollution.',
            fileTypes: ['.js', '.ts']
        },

        // JavaScript: Scope For-In Variable
        SCOPE_FOR_IN_VARIABLE: {
            patterns: [
                /for\s*\(\s*(\w+)\s+in\s+[^)]+\)\s*\{[^}]*\}/gi
            ],
            severity: 'Medium' as const,
            category: 'Functionality' as const,
            title: 'For-In Variable Scope Issue',
            description: 'For-in loop variables should be properly declared to avoid accidental global variable creation.',
            recommendation: 'Always declare for-in loop variables with var, let, or const (e.g., "for (var key in obj)" not "for (key in obj)").',
            fileTypes: ['.js', '.ts']
        },

        // JavaScript: Use Base With ParseInt
        USE_BASE_WITH_PARSEINT: {
            patterns: [
                /parseInt\s*\(\s*[^,)]+\s*\)/gi
            ],
            severity: 'High' as const,
            category: 'Functionality' as const,
            title: 'Missing Radix in parseInt',
            description: 'parseInt() should always specify a radix parameter to avoid unexpected behavior with different number formats.',
            recommendation: 'Always provide the radix parameter: parseInt(value, 10) for decimal, parseInt(value, 16) for hexadecimal, etc.',
            fileTypes: ['.js', '.ts']
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
                // Skip rules that don't apply to this file type
                if (rule.fileTypes && !rule.fileTypes.includes(fileExtension)) {
                    continue;
                }
                
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
