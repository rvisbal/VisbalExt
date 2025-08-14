import { LogFilter, FilterCondition } from '../types/logFilter';

/**
 * Predefined filter templates for common log analysis scenarios
 */
export class PredefinedFilters {
    
    /**
     * Gets all predefined filter templates
     */
    public static getAllTemplates(): LogFilter[] {
        return [
            this.createSlowSOQLFilter(),
            this.createLimitUsageFilter(),
            this.createErrorsAndWarningsFilter(),
            this.createApexTestFilter(),
            this.createCustomFieldFilter(),
            this.createWorkflowRulesFilter(),
            this.createAsyncApexFilter(),
            this.createLWCFilter(),
            this.createTriggerFilter(),
            this.createCalloutFilter()
        ];
    }

    /**
     * Filter for slow SOQL queries (>100ms)
     */
    private static createSlowSOQLFilter(): LogFilter {
        return {
            id: 'template-slow-soql',
            name: 'Slow SOQL Queries',
            description: 'Shows SOQL queries that take longer than 100ms to execute',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'slow-soql-1',
                    field: 'content',
                    operator: 'contains',
                    value: 'SOQL_EXECUTE_',
                    caseSensitive: false,
                    useRegex: false,
                    negated: false
                },
                {
                    id: 'slow-soql-2',
                    field: 'duration',
                    operator: 'greaterThan',
                    value: '100',
                    caseSensitive: false,
                    useRegex: false,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#ff6b35',
            icon: 'clock'
        };
    }

    /**
     * Filter for governor limit usage above 80%
     */
    private static createLimitUsageFilter(): LogFilter {
        return {
            id: 'template-limit-usage',
            name: 'High Governor Limit Usage',
            description: 'Shows governor limits that are above 80% usage',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'limit-1',
                    field: 'content',
                    operator: 'regex',
                    value: 'LIMIT_USAGE.*?([8-9][0-9]|100)\\s+of\\s+100',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#ff4757',
            icon: 'gauge'
        };
    }

    /**
     * Filter for errors and warnings
     */
    private static createErrorsAndWarningsFilter(): LogFilter {
        return {
            id: 'template-errors-warnings',
            name: 'Errors & Warnings',
            description: 'Shows all error messages, exceptions, and warnings',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'error-warning-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(ERROR|Exception|FATAL|WARNING|WARN)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#ff3838',
            icon: 'error'
        };
    }

    /**
     * Filter for Apex test execution
     */
    private static createApexTestFilter(): LogFilter {
        return {
            id: 'template-apex-tests',
            name: 'Apex Test Execution',
            description: 'Shows Apex test method executions and results',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'test-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(TEST_CODE_UNIT|TESTING_LIMITS|TestMethod)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#2ed573',
            icon: 'beaker'
        };
    }

    /**
     * Filter for custom field operations
     */
    private static createCustomFieldFilter(): LogFilter {
        return {
            id: 'template-custom-fields',
            name: 'Custom Field Operations',
            description: 'Shows operations involving custom fields (ending with __c)',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'custom-field-1',
                    field: 'content',
                    operator: 'regex',
                    value: '\\w+__c',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#1e90ff',
            icon: 'symbol-field'
        };
    }

    /**
     * Filter for workflow rules
     */
    private static createWorkflowRulesFilter(): LogFilter {
        return {
            id: 'template-workflow-rules',
            name: 'Workflow Rules',
            description: 'Shows workflow rule evaluations and actions',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'workflow-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(WF_|WORKFLOW|WF_RULE_|WF_ACTIONS_)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#ffa502',
            icon: 'workflow'
        };
    }

    /**
     * Filter for asynchronous Apex
     */
    private static createAsyncApexFilter(): LogFilter {
        return {
            id: 'template-async-apex',
            name: 'Asynchronous Apex',
            description: 'Shows @future, Batch, Queueable, and Scheduled Apex execution',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'async-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(FUTURE|BATCH|QUEUEABLE|SCHEDULED)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#7bed9f',
            icon: 'clock'
        };
    }

    /**
     * Filter for Lightning Web Components
     */
    private static createLWCFilter(): LogFilter {
        return {
            id: 'template-lwc',
            name: 'Lightning Web Components',
            description: 'Shows Lightning Web Component related operations',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'lwc-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(LWC|Lightning|@wire|@api|@track)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#70a1ff',
            icon: 'symbol-class'
        };
    }

    /**
     * Filter for trigger execution
     */
    private static createTriggerFilter(): LogFilter {
        return {
            id: 'template-triggers',
            name: 'Trigger Execution',
            description: 'Shows trigger execution events and context',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'trigger-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(TRIGGER|Trigger\\.|isInsert|isUpdate|isDelete|isBefore|isAfter)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#ff6348',
            icon: 'symbol-event'
        };
    }

    /**
     * Filter for HTTP callouts
     */
    private static createCalloutFilter(): LogFilter {
        return {
            id: 'template-callouts',
            name: 'HTTP Callouts',
            description: 'Shows HTTP callout requests and responses',
            isActive: false,
            isBuiltIn: true,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'callout-1',
                    field: 'content',
                    operator: 'regex',
                    value: '(CALLOUT|HttpRequest|HttpResponse|Http\\.|REST_API)',
                    caseSensitive: false,
                    useRegex: true,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#5352ed',
            icon: 'globe'
        };
    }

    /**
     * Creates a filter for specific object operations
     */
    public static createObjectFilter(objectName: string): LogFilter {
        return {
            id: `template-object-${objectName.toLowerCase()}`,
            name: `${objectName} Operations`,
            description: `Shows all operations involving the ${objectName} object`,
            isActive: false,
            isBuiltIn: false,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: `object-${objectName.toLowerCase()}-1`,
                    field: 'content',
                    operator: 'contains',
                    value: objectName,
                    caseSensitive: true,
                    useRegex: false,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#3742fa',
            icon: 'database'
        };
    }

    /**
     * Creates a filter for specific user debug messages
     */
    public static createUserDebugFilter(debugPattern: string): LogFilter {
        return {
            id: `template-debug-${Date.now()}`,
            name: 'Custom Debug Filter',
            description: `Shows debug messages containing: ${debugPattern}`,
            isActive: false,
            isBuiltIn: false,
            created: new Date(),
            lastModified: new Date(),
            conditions: [
                {
                    id: 'custom-debug-1',
                    field: 'category',
                    operator: 'equals',
                    value: 'USER_DEBUG',
                    caseSensitive: false,
                    useRegex: false,
                    negated: false
                },
                {
                    id: 'custom-debug-2',
                    field: 'message',
                    operator: 'contains',
                    value: debugPattern,
                    caseSensitive: false,
                    useRegex: false,
                    negated: false
                }
            ],
            logicalOperator: 'AND',
            color: '#00d2d3',
            icon: 'bug'
        };
    }
}
