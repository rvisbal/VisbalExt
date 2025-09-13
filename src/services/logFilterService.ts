import * as vscode from 'vscode';
import { 
    LogFilter, 
    FilterCondition, 
    FilterResult, 
    LogLine, 
    FilterPreset, 
    FilterStats,
    BUILT_IN_FILTER_CATEGORIES,
    BuiltInFilterCategory,
    FilterField,
    FilterOperator
} from '../types/logFilter';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Service for managing custom log filters
 */
export class LogFilterService {
    private static instance: LogFilterService;
    private filters: Map<string, LogFilter> = new Map();
    private presets: Map<string, FilterPreset> = new Map();
    private stats: FilterStats;
    private readonly STORAGE_KEY_FILTERS = 'visbal.logFilters';
    private readonly STORAGE_KEY_PRESETS = 'visbal.logFilterPresets';
    private readonly STORAGE_KEY_STATS = 'visbal.logFilterStats';
    private context: vscode.ExtensionContext | undefined;

    constructor(context?: vscode.ExtensionContext) {
        this.context = context;
        this.stats = {
            totalFilters: 0,
            activeFilters: 0,
            avgExecutionTime: 0,
            mostUsedFilter: undefined
        };
        this.loadFiltersFromStorage();
        this.initializeBuiltInFilters();
    }

    public static getInstance(context?: vscode.ExtensionContext): LogFilterService {
        if (!LogFilterService.instance) {
            LogFilterService.instance = new LogFilterService(context);
        }
        return LogFilterService.instance;
    }

    /**
     * Creates a new custom filter
     */
    public createFilter(
        name: string, 
        description: string, 
        conditions: FilterCondition[], 
        logicalOperator: 'AND' | 'OR' = 'AND'
    ): LogFilter {
        const filter: LogFilter = {
            id: this.generateId(),
            name,
            description,
            isActive: true,
            isBuiltIn: false,
            created: new Date(),
            lastModified: new Date(),
            conditions,
            logicalOperator,
            color: this.getRandomColor(),
            icon: 'filter'
        };

        this.filters.set(filter.id, filter);
        this.updateStats();
        this.saveFiltersToStorage();

        OrgUtils.logDebug(`[VisbalExt.LogFilterService] _createFilter -- Created new filter: ${filter.name} (${filter.id})`);
        return filter;
    }

    /**
     * Updates an existing filter
     */
    public updateFilter(filterId: string, updates: Partial<LogFilter>): boolean {
        const filter = this.filters.get(filterId);
        if (!filter) {
            OrgUtils.logError(`[VisbalExt.LogFilterService] _updateFilter -- Filter not found: ${filterId}`, new Error('Filter not found'));
            return false;
        }

        if (filter.isBuiltIn && updates.conditions) {
            OrgUtils.logError(`[VisbalExt.LogFilterService] _updateFilter -- Cannot modify built-in filter conditions: ${filterId}`, new Error('Cannot modify built-in filter'));
            return false;
        }

        Object.assign(filter, updates, { lastModified: new Date() });
        this.filters.set(filterId, filter);
        this.updateStats();
        this.saveFiltersToStorage();

        OrgUtils.logDebug(`[VisbalExt.LogFilterService] _updateFilter -- Updated filter: ${filter.name} (${filterId})`);
        return true;
    }

    /**
     * Deletes a filter
     */
    public deleteFilter(filterId: string): boolean {
        console.log('[VisbalExt.LogFilterService] _deleteFilter ENTRY - filterId:', filterId);
        console.log('[VisbalExt.LogFilterService] _deleteFilter ENTRY - typeof filterId:', typeof filterId);
        console.log('[VisbalExt.LogFilterService] _deleteFilter ENTRY - filters map size:', this.filters.size);
        console.log('[VisbalExt.LogFilterService] _deleteFilter ENTRY - filters map keys:', Array.from(this.filters.keys()));
        
        const filter = this.filters.get(filterId);
        console.log('[VisbalExt.LogFilterService] _deleteFilter - found filter:', filter);
        
        if (!filter) {
            console.log('[VisbalExt.LogFilterService] _deleteFilter - filter not found, returning false');
            return false;
        }

        if (filter.isBuiltIn) {
            console.log('[VisbalExt.LogFilterService] _deleteFilter - cannot delete built-in filter');
            OrgUtils.logError(`[VisbalExt.LogFilterService] _deleteFilter -- Cannot delete built-in filter: ${filterId}`, new Error('Cannot delete built-in filter'));
            return false;
        }

        console.log('[VisbalExt.LogFilterService] _deleteFilter - deleting filter from map');
        this.filters.delete(filterId);
        
        console.log('[VisbalExt.LogFilterService] _deleteFilter - updating stats');
        this.updateStats();
        
        console.log('[VisbalExt.LogFilterService] _deleteFilter - saving to storage');
        this.saveFiltersToStorage();

        console.log('[VisbalExt.LogFilterService] _deleteFilter - operation successful');
        OrgUtils.logDebug(`[VisbalExt.LogFilterService] _deleteFilter -- Deleted filter: ${filter.name} (${filterId})`);
        return true;
    }

    /**
     * Gets all filters
     */
    public getAllFilters(): LogFilter[] {
        return Array.from(this.filters.values());
    }

    /**
     * Gets active filters
     */
    public getActiveFilters(): LogFilter[] {
        return Array.from(this.filters.values()).filter(f => f.isActive);
    }

    /**
     * Gets a specific filter
     */
    public getFilter(filterId: string): LogFilter | undefined {
        return this.filters.get(filterId);
    }

    /**
     * Toggles filter active state
     */
    public toggleFilter(filterId: string): boolean {
        const filter = this.filters.get(filterId);
        if (!filter) {
            return false;
        }

        filter.isActive = !filter.isActive;
        filter.lastModified = new Date();
        this.filters.set(filterId, filter);
        this.updateStats();
        this.saveFiltersToStorage();

        OrgUtils.logDebug(`[VisbalExt.LogFilterService] _toggleFilter -- Toggled filter: ${filter.name} (${filterId}) - Active: ${filter.isActive}`);
        return true;
    }

    /**
     * Applies filters to log content
     */
    public applyFilters(logContent: string, filterIds?: string[]): FilterResult {
        const startTime = performance.now();
        
        const filtersToApply = filterIds 
            ? filterIds.map(id => this.filters.get(id)).filter(Boolean) as LogFilter[]
            : this.getActiveFilters();

        if (filtersToApply.length === 0) {
            const lines = this.parseLogLines(logContent);
            return {
                filteredLines: lines,
                totalMatches: lines.length,
                appliedFilters: [],
                executionTime: performance.now() - startTime
            };
        }

        const logLines = this.parseLogLines(logContent);
        const filteredLines: LogLine[] = [];

        for (const line of logLines) {
            let shouldInclude = false;
            const matchedConditions: string[] = [];

            for (const filter of filtersToApply) {
                const filterMatches = this.evaluateFilter(line, filter);
                if (filterMatches.matches) {
                    shouldInclude = true;
                    matchedConditions.push(...filterMatches.conditionIds);
                }
            }

            if (shouldInclude) {
                line.matched = true;
                line.matchedConditions = matchedConditions;
                filteredLines.push(line);
            }
        }

        const executionTime = performance.now() - startTime;
        this.updateExecutionTimeStats(executionTime);

        OrgUtils.logDebug(`[VisbalExt.LogFilterService] _applyFilters -- Applied ${filtersToApply.length} filters, found ${filteredLines.length} matches in ${executionTime.toFixed(2)}ms`);

        return {
            filteredLines,
            totalMatches: filteredLines.length,
            appliedFilters: filtersToApply,
            executionTime
        };
    }

    /**
     * Parses log content into structured lines
     */
    private parseLogLines(logContent: string): LogLine[] {
        const lines = logContent.split('\n');
        const logLines: LogLine[] = [];

        for (let i = 0; i < lines.length; i++) {
            const content = lines[i];
            if (!content.trim()) continue;

            const logLine: LogLine = {
                lineNumber: i + 1,
                content,
                matched: false
            };

            // Parse timestamp
            const timestampMatch = content.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})/);
            if (timestampMatch) {
                logLine.timestamp = timestampMatch[1];
            }

            // Parse category and log level
            const categoryMatch = content.match(/\|([A-Z_]+)\|/);
            if (categoryMatch) {
                logLine.category = categoryMatch[1];
                
                // Determine log level
                if (content.includes('ERROR') || content.includes('FATAL')) {
                    logLine.logLevel = 'ERROR';
                } else if (content.includes('WARNING') || content.includes('WARN')) {
                    logLine.logLevel = 'WARNING';
                } else if (content.includes('INFO')) {
                    logLine.logLevel = 'INFO';
                } else if (content.includes('DEBUG')) {
                    logLine.logLevel = 'DEBUG';
                }
            }

            // Parse duration for execution events
            const durationMatch = content.match(/(\d+)\s*ms/);
            if (durationMatch) {
                logLine.duration = parseInt(durationMatch[1], 10);
            }

            // Extract message (content after category)
            const messageMatch = content.match(/\|[A-Z_]+\|(.*)/);
            if (messageMatch) {
                logLine.message = messageMatch[1].trim();
            }

            // Parse object type for DML/SOQL
            const objectMatch = content.match(/\b([A-Z][a-zA-Z_]*__?[cr]?)\b/);
            if (objectMatch && (content.includes('DML') || content.includes('SOQL'))) {
                logLine.objectType = objectMatch[1];
            }

            logLines.push(logLine);
        }

        return logLines;
    }

    /**
     * Evaluates a filter against a log line
     */
    private evaluateFilter(line: LogLine, filter: LogFilter): { matches: boolean; conditionIds: string[] } {
        const matchedConditions: string[] = [];
        const conditionResults: boolean[] = [];

        for (const condition of filter.conditions) {
            const result = this.evaluateCondition(line, condition);
            conditionResults.push(result);
            if (result) {
                matchedConditions.push(condition.id);
            }
        }

        let matches: boolean;
        if (filter.logicalOperator === 'AND') {
            matches = conditionResults.every(result => result);
        } else {
            matches = conditionResults.some(result => result);
        }

        return { matches, conditionIds: matchedConditions };
    }

    /**
     * Evaluates a single condition against a log line
     */
    private evaluateCondition(line: LogLine, condition: FilterCondition): boolean {
        const fieldValue = this.getFieldValue(line, condition.field);
        if (fieldValue === undefined) {
            return condition.operator === 'isEmpty';
        }

        let result = false;
        const value = condition.value;
        const compareValue = condition.caseSensitive ? fieldValue : fieldValue.toLowerCase();
        const conditionValue = condition.caseSensitive ? value : value.toLowerCase();

        switch (condition.operator) {
            case 'contains':
                result = compareValue.includes(conditionValue);
                break;
            case 'equals':
                result = compareValue === conditionValue;
                break;
            case 'startsWith':
                result = compareValue.startsWith(conditionValue);
                break;
            case 'endsWith':
                result = compareValue.endsWith(conditionValue);
                break;
            case 'regex':
                try {
                    const flags = condition.caseSensitive ? 'g' : 'gi';
                    const regex = new RegExp(value, flags);
                    result = regex.test(fieldValue);
                } catch (e) {
                    OrgUtils.logError(`[VisbalExt.LogFilterService] _evaluateCondition -- Invalid regex in condition ${condition.id}: ${value}`, e);
                    result = false;
                }
                break;
            case 'greaterThan':
                const numValue = parseFloat(fieldValue);
                const numCondition = parseFloat(value);
                result = !isNaN(numValue) && !isNaN(numCondition) && numValue > numCondition;
                break;
            case 'lessThan':
                const numValue2 = parseFloat(fieldValue);
                const numCondition2 = parseFloat(value);
                result = !isNaN(numValue2) && !isNaN(numCondition2) && numValue2 < numCondition2;
                break;
            case 'isEmpty':
                result = !fieldValue || fieldValue.trim() === '';
                break;
            case 'isNotEmpty':
                result = Boolean(fieldValue && fieldValue.trim() !== '');
                break;
            case 'between':
                const [min, max] = value.split(',').map(v => parseFloat(v.trim()));
                const numVal = parseFloat(fieldValue);
                result = !isNaN(numVal) && !isNaN(min) && !isNaN(max) && numVal >= min && numVal <= max;
                break;
        }

        return condition.negated ? !result : result;
    }

    /**
     * Gets the value of a specific field from a log line
     */
    private getFieldValue(line: LogLine, field: FilterField): string {
        switch (field) {
            case 'content':
                return line.content;
            case 'timestamp':
                return line.timestamp || '';
            case 'category':
                return line.category || '';
            case 'message':
                return line.message || '';
            case 'lineNumber':
                return line.lineNumber.toString();
            case 'logLevel':
                return line.logLevel || '';
            case 'duration':
                return line.duration?.toString() || '';
            case 'objectType':
                return line.objectType || '';
            case 'stackTrace':
                return line.content.includes('at ') ? line.content : '';
            default:
                return '';
        }
    }

    /**
     * Initialize built-in filters
     */
    private initializeBuiltInFilters(): void {
        const builtInFilters: LogFilter[] = [
            {
                id: 'builtin-common',
                name: 'Common ',
                description: 'Shows all common log statements & errors',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'error-1',
                        field: 'logLevel',
                        operator: 'equals',
                        value: 'ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'error-2',
                        field: 'content',
                        operator: 'contains',
                        value: 'Exception',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'perf-1',
                        field: 'duration',
                        operator: 'greaterThan',
                        value: '1000',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'db-1',
                        field: 'category',
                        operator: 'regex',
                        value: '^(SOQL|DML)_',
                        caseSensitive: false,
                        useRegex: true,
                        negated: false
                    },
                    {
                        id: 'debug-1',
                        field: 'category',
                        operator: 'equals',
                        value: 'USER_DEBUG',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'limits-1',
                        field: 'category',
                        operator: 'startsWith',
                        value: 'LIMIT_',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#ff4444',
                icon: 'gauge'
            },
            {
                id: 'builtin-user-debug',
                name: 'User Debug Messages',
                description: 'Shows System.debug() statements & errors',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'error-1',
                        field: 'logLevel',
                        operator: 'equals',
                        value: 'ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'error-2',
                        field: 'content',
                        operator: 'contains',
                        value: 'Exception',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-1',
                        field: 'category',
                        operator: 'equals',
                        value: 'USER_DEBUG',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-2',
                        field: 'category',
                        operator: 'equals',
                        value: 'FATAL_ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#00aa00',
                icon: 'bug'
            },
            {
                id: 'builtin-user-debug-only',
                name: 'User Debug Only',
                description: 'Shows System.debug() statements only',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'debug-1',
                        field: 'category',
                        operator: 'equals',
                        value: 'USER_DEBUG',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-2',
                        field: 'category',
                        operator: 'equals',
                        value: 'FATAL_ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#00aa00',
                icon: 'bug'
            },
            {
                id: 'builtin-user-debug-with-dml',
                name: 'User Debug with DML',
                description: 'Shows System.debug() statements with DML',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'error-1',
                        field: 'logLevel',
                        operator: 'equals',
                        value: 'ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'error-2',
                        field: 'content',
                        operator: 'contains',
                        value: 'Exception',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-1',
                        field: 'category',
                        operator: 'equals',
                        value: 'USER_DEBUG',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-2',
                        field: 'category',
                        operator: 'equals',
                        value: 'FATAL_ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-3',
                        field: 'category',
                        operator: 'equals',
                        value: 'DML_BEGIN',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#00aa00',
                icon: 'bug'
            },
            {
                id: 'builtin-user-debug-with-dml-soql',
                name: 'User Debug with DML & soql',
                description: 'Shows System.debug() statements with DML & soql',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'error-1',
                        field: 'logLevel',
                        operator: 'equals',
                        value: 'ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'error-2',
                        field: 'content',
                        operator: 'contains',
                        value: 'Exception',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-1',
                        field: 'category',
                        operator: 'equals',
                        value: 'USER_DEBUG',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-2',
                        field: 'category',
                        operator: 'equals',
                        value: 'FATAL_ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-3',
                        field: 'category',
                        operator: 'equals',
                        value: 'DML_BEGIN',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-4',
                        field: 'category',
                        operator: 'equals',
                        value: 'SOQL_EXECUTE_BEGIN',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#00aa00',
                icon: 'bug'
            },
            {
                id: 'builtin-database-only',
                name: 'Database Only',
                description: 'Shows Database statements',
                isActive: false,
                isBuiltIn: true,
                created: new Date(),
                lastModified: new Date(),
                conditions: [
                    {
                        id: 'error-1',
                        field: 'logLevel',
                        operator: 'equals',
                        value: 'ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'error-2',
                        field: 'content',
                        operator: 'contains',
                        value: 'Exception',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-2',
                        field: 'category',
                        operator: 'equals',
                        value: 'FATAL_ERROR',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-3',
                        field: 'category',
                        operator: 'equals',
                        value: 'DML_BEGIN',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    },
                    {
                        id: 'debug-4',
                        field: 'category',
                        operator: 'equals',
                        value: 'SOQL_EXECUTE_BEGIN',
                        caseSensitive: false,
                        useRegex: false,
                        negated: false
                    }
                ],
                logicalOperator: 'OR',
                color: '#00aa00',
                icon: 'bug'
            }
        ];

        for (const filter of builtInFilters) {
            if (!this.filters.has(filter.id)) {
                this.filters.set(filter.id, filter);
            }
        }

        this.updateStats();
        this.saveFiltersToStorage();
    }

    /**
     * Loads filters from storage
     */
    private loadFiltersFromStorage(): void {
        try {
            if (!this.context) {
                return;
            }

            const filtersData = this.context.globalState.get(this.STORAGE_KEY_FILTERS);
            if (filtersData) {
                const filters = JSON.parse(filtersData as string) as LogFilter[];
                for (const filter of filters) {
                    // Convert date strings back to Date objects
                    filter.created = new Date(filter.created);
                    filter.lastModified = new Date(filter.lastModified);
                    this.filters.set(filter.id, filter);
                }
            }

            const statsData = this.context.globalState.get(this.STORAGE_KEY_STATS);
            if (statsData) {
                this.stats = JSON.parse(statsData as string);
                if (this.stats.lastApplied) {
                    this.stats.lastApplied = new Date(this.stats.lastApplied);
                }
            }
        } catch (error) {
            OrgUtils.logError('[VisbalExt.LogFilterService] _loadFiltersFromStorage -- Error loading filters from storage:', error);
        }
    }

    /**
     * Saves filters to storage
     */
    private saveFiltersToStorage(): void {
        try {
            if (!this.context) {
                return;
            }

            const filters = Array.from(this.filters.values());
            this.context.globalState.update(this.STORAGE_KEY_FILTERS, JSON.stringify(filters));
            this.context.globalState.update(this.STORAGE_KEY_STATS, JSON.stringify(this.stats));
        } catch (error) {
            OrgUtils.logError('[VisbalExt.LogFilterService] _saveFiltersToStorage -- Error saving filters to storage:', error);
        }
    }

    /**
     * Updates filter statistics
     */
    private updateStats(): void {
        this.stats.totalFilters = this.filters.size;
        this.stats.activeFilters = this.getActiveFilters().length;
    }

    /**
     * Updates execution time statistics
     */
    private updateExecutionTimeStats(executionTime: number): void {
        this.stats.avgExecutionTime = (this.stats.avgExecutionTime + executionTime) / 2;
        this.stats.lastApplied = new Date();
    }

    /**
     * Generates a unique ID
     */
    private generateId(): string {
        return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Gets a random color for filters
     */
    private getRandomColor(): string {
        const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffaa00', '#aa00ff', '#00aaff', '#ff00aa'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Gets filter statistics
     */
    public getStats(): FilterStats {
        return { ...this.stats };
    }

    /**
     * Creates a condition
     */
    public createCondition(
        field: FilterField,
        operator: FilterOperator,
        value: string,
        options: {
            caseSensitive?: boolean;
            useRegex?: boolean;
            negated?: boolean;
        } = {}
    ): FilterCondition {
        return {
            id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            field,
            operator,
            value,
            caseSensitive: options.caseSensitive || false,
            useRegex: options.useRegex || false,
            negated: options.negated || false
        };
    }
}

// Export a function to get the initialized service instance
export function getLogFilterService(): LogFilterService {
    return LogFilterService.getInstance();
}

// Backward compatibility export
export const logFilterService = LogFilterService.getInstance();
