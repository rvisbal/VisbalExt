/**
 * Constants for Salesforce API and debugging operations
 */

/**
 * Salesforce TraceFlag LogType values
 * 
 * @see https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_traceflag.htm
 */
export const TRACE_FLAG_TYPES = {
    /**
     * Automatically set when you open the Developer Console to log your activities.
     * This is the most common type for general debugging purposes.
     */
    DEVELOPER_LOG: 'DEVELOPER_LOG',
    
    /**
     * Used to log an individual user's activities.
     * Useful for debugging specific user interactions or issues.
     */
    USER_DEBUG: 'USER_DEBUG',
    
    /**
     * Overrides logging levels for specific Apex classes and triggers but doesn't generate logs.
     * Used for class-specific tracing configurations.
     */
    CLASS_TRACING: 'CLASS_TRACING'
} as const;

/**
 * Type definition for Salesforce TraceFlag LogType values
 */
export type TraceFlagType = typeof TRACE_FLAG_TYPES[keyof typeof TRACE_FLAG_TYPES];

/**
 * Default LogType for most debugging scenarios
 */
export const DEFAULT_LOG_TYPE: TraceFlagType = TRACE_FLAG_TYPES.DEVELOPER_LOG;
