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
    patterns: string[] = ['USER_DEBUG', 'FATAL_ERROR', 'DML_BEGIN', 'SOQL_EXECUTE_BEGIN']
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
 * Formats log content for safe HTML display
 * @param content Log content to format
 * @returns HTML-safe string with proper escaping
 */
export function formatLogContentForHtml(content: string | undefined): string {
    if (!content) {
        return '';
    }
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
} 