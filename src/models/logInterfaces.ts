/**
 * Interfaces for log data structures
 */

/**
 * Represents a tab in the log detail view
 */
export interface LogTab {
    id: string;
    label: string;
}

/**
 * Represents a category in the log summary
 */
export interface LogCategory {
    name: string;
    count: number;
    description?: string;
}

/**
 * Represents a summary of log data
 */
export interface LogSummary {
    totalLines: number;
    executionCount: number;
    soqlCount: number;
    dmlCount: number;
    heapCount: number;
    limitCount: number;
    userDebugCount: number;
}

/**
 * Represents a timeline event in the log
 */
export interface LogTimelineEvent {
    time: number;
    formattedTime: string;
    lineNumber: number;
    eventType: string;
    content: string;
}

/**
 * Represents parsed log data
 */
export interface ParsedLogData {
    rawLog: string;
    userDebugLog: string;
    summary: LogSummary;
    categories: LogCategory[];
    timeline: LogTimelineEvent[];
    error?: string;
}

/**
 * Debug log level options
 */
export type DebugLogLevel = 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST';

/**
 * Debug configuration for Salesforce logs
 */
export interface DebugConfig {
    apexCode: DebugLogLevel;
    apexProfiling: DebugLogLevel;
    callout: DebugLogLevel;
    dataAccess: DebugLogLevel;
    database: DebugLogLevel;
    nba: DebugLogLevel;
    system: DebugLogLevel;
    validation: DebugLogLevel;
    visualforce: DebugLogLevel;
    wave: DebugLogLevel;
    workflow: DebugLogLevel;
} 