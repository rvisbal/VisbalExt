/**
 * Utility functions for parsing log files
 */

/**
 * Extracts debug-related lines from log content
 * @param lines Array of log file lines
 * @param patterns Array of string patterns to match (defaults to common debug patterns)
 * @returns Array of matching debug lines
 */
export function extractDebugLines(
    lines: string[], 
    patterns: string[] = ['USER_DEBUG', 'FATAL_ERROR', 'DML_BEGIN']
): string[] {
    return lines.filter(line => 
        patterns.some(pattern => line.includes(pattern))
    );
}

/**
 * Extracts info-related lines from log content
 * @param lines Array of log file lines
 * @returns Array of matching info lines
 */
export function extractInfoLines(
    lines: string[], 
    patterns: string[] =['USER_DEBUG', 'FATAL_ERROR', 'DML_BEGIN', 'SOQL_EXECUTE_BEGIN']
): string[] {
    return lines.filter(line => 
        patterns.some(pattern => line.includes(pattern))
    );
}



/**
 * Extracts specific category lines from log content
 * @param lines Array of log file lines
 * @param category Category identifier to match (e.g., 'EXECUTION_', 'SOQL_')
 * @returns Array of matching category lines
 */
export function extractCategoryLines(lines: string[], category: string): string[] {
    return lines.filter(line => line.includes(category));
}

/**
 * Colorizes a log line based on its content
 * @param line The log line to colorize
 * @returns HTML string with appropriate CSS classes
 */
export function colorizeLogLine(line: string): string {
    // Define color classes for different log entry types
    if (line.includes('USER_DEBUG')) {
        return `<span class="log-debug">${line}</span>`;
    } else if (line.includes('FATAL_ERROR') || line.includes('ERROR')) {
        return `<span class="log-error">${line}</span>`;
    } else if (line.includes('DML_BEGIN')) {
        return `<span class="log-dml">${line}</span>`;
    } else if (line.includes('EXECUTION_')) {
        return `<span class="log-execution">${line}</span>`;
    } else if (line.includes('SOQL_')) {
        return `<span class="log-soql">${line}</span>`;
    } else if (line.includes('SYSTEM_MODE')) {
        return `<span class="log-system">${line}</span>`;
    } else if (line.includes('CODE_UNIT')) {
        return `<span class="log-code-unit">${line}</span>`;
    } else if (line.includes('|INFO|')) {
        return `<span class="log-info">${line}</span>`;
    } else if (line.includes('|WARNING|')) {
        return `<span class="log-warning">${line}</span>`;
    }
    return `<span class="log-default">${line}</span>`;
}

export function formatLogContentForHtml(content: string): string {
    return content.split('\n')
        .map(line => colorizeLogLine(line))
        .join('\n');
} 