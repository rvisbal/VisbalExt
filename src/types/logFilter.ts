/**
 * Types and interfaces for log filtering system
 */

export interface LogFilter {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    isBuiltIn: boolean;
    created: Date;
    lastModified: Date;
    conditions: FilterCondition[];
    logicalOperator: 'AND' | 'OR';
    color?: string;
    icon?: string;
}

export interface FilterCondition {
    id: string;
    field: FilterField;
    operator: FilterOperator;
    value: string;
    caseSensitive: boolean;
    useRegex: boolean;
    negated: boolean;
}

export type FilterField = 
    | 'content'           // Full line content
    | 'timestamp'         // Time portion
    | 'category'          // Log category (USER_DEBUG, SOQL_, etc.)
    | 'message'           // Message portion after category
    | 'lineNumber'        // Line number in file
    | 'logLevel'          // Log level (INFO, ERROR, WARNING, etc.)
    | 'duration'          // Duration for execution events
    | 'objectType'        // For DML/SOQL operations
    | 'stackTrace';       // Stack trace content

export type FilterOperator = 
    | 'contains'
    | 'equals'
    | 'startsWith'
    | 'endsWith'
    | 'regex'
    | 'greaterThan'
    | 'lessThan'
    | 'between'
    | 'isEmpty'
    | 'isNotEmpty';

export interface FilterResult {
    filteredLines: LogLine[];
    totalMatches: number;
    appliedFilters: LogFilter[];
    executionTime: number;
}

export interface LogLine {
    lineNumber: number;
    content: string;
    timestamp?: string;
    category?: string;
    logLevel?: string;
    message?: string;
    duration?: number;
    objectType?: string;
    matched: boolean;
    matchedConditions?: string[];
}

export interface FilterPreset {
    id: string;
    name: string;
    description: string;
    filters: LogFilter[];
    isBuiltIn: boolean;
}

export interface FilterStats {
    totalFilters: number;
    activeFilters: number;
    lastApplied?: Date;
    avgExecutionTime: number;
    mostUsedFilter?: string;
}

/**
 * Built-in filter categories for common log patterns
 */
export const BUILT_IN_FILTER_CATEGORIES = {
    ERRORS: 'errors',
    PERFORMANCE: 'performance', 
    DATABASE: 'database',
    EXECUTION: 'execution',
    DEBUG: 'debug',
    SYSTEM: 'system'
} as const;

export type BuiltInFilterCategory = typeof BUILT_IN_FILTER_CATEGORIES[keyof typeof BUILT_IN_FILTER_CATEGORIES];
