/**
 * Utility functions for handling debug configurations
 */

import { DebugConfig, DebugLogLevel } from '../models/logInterfaces';

/**
 * Default debug configuration
 */
export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
    apexCode: 'INFO',
    apexProfiling: 'INFO',
    callout: 'INFO',
    dataAccess: 'INFO',
    database: 'INFO',
    nba: 'INFO',
    system: 'DEBUG',
    validation: 'INFO',
    visualforce: 'INFO',
    wave: 'INFO',
    workflow: 'INFO'
};

/**
 * Detailed debug configuration
 */
export const DETAILED_DEBUG_CONFIG: DebugConfig = {
    apexCode: 'FINE',
    apexProfiling: 'FINE',
    callout: 'FINER',
    dataAccess: 'FINE',
    database: 'FINE',
    nba: 'FINE',
    system: 'FINE',
    validation: 'INFO',
    visualforce: 'FINE',
    wave: 'FINE',
    workflow: 'FINE'
};

/**
 * Developer debug configuration
 */
export const DEVELOPER_DEBUG_CONFIG: DebugConfig = {
    apexCode: 'FINEST',
    apexProfiling: 'FINEST',
    callout: 'FINEST',
    dataAccess: 'FINEST',
    database: 'FINEST',
    nba: 'FINE',
    system: 'FINEST',
    validation: 'FINEST',
    visualforce: 'FINEST',
    wave: 'FINEST',
    workflow: 'FINEST'
};

export const DEBUG_CONFIG: DebugConfig = {
    apexCode: 'DEBUG',
    apexProfiling: 'INFO',
    callout: 'INFO',
    dataAccess: 'FINEST',
    database: 'INFO',
    nba: 'ERROR',
    system: 'INFO',
    validation: 'INFO',
    visualforce: 'INFO',
    wave: 'ERROR',
    workflow: 'ERROR'
};

/**
 * Converts a debug configuration to a TraceFlag categories string
 * @param config Debug configuration
 * @returns TraceFlag categories string
 */
export function configToTraceFlagCategories(config: DebugConfig): string {
    return `ApexCode=${config.apexCode};ApexProfiling=${config.apexProfiling};Callout=${config.callout};Database=${config.database};NBA=${config.nba};System=${config.system};Validation=${config.validation};Visualforce=${config.visualforce};Workflow=${config.workflow};Wave=${config.wave}`;
}

/**
 * Parses a TraceFlag categories string into a debug configuration
 * @param categories TraceFlag categories string
 * @returns Debug configuration
 */
export function parseCategoriesString(categories: string): DebugConfig {
    const config: Partial<DebugConfig> = {};
    
    // Default to standard config
    const result = { ...DEFAULT_DEBUG_CONFIG };
    
    if (!categories) {
        return result;
    }
    
    // Parse categories string
    const parts = categories.split(';');
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key && value) {
            const configKey = key.charAt(0).toLowerCase() + key.slice(1);
            if (configKey in result) {
                result[configKey as keyof DebugConfig] = value as DebugLogLevel;
            }
        }
    });
    
    return result;
}

/**
 * Gets a preset name based on a debug configuration
 * @param config Debug configuration
 * @returns Preset name or 'custom'
 */
export function getPresetName(config: DebugConfig): string {
    // Check if config matches any preset
    if (configsEqual(config, DEFAULT_DEBUG_CONFIG)) {
        return 'default';
    }
    
    if (configsEqual(config, DETAILED_DEBUG_CONFIG)) {
        return 'detailed';
    }
    
    if (configsEqual(config, DEVELOPER_DEBUG_CONFIG)) {
        return 'developer';
    }


    if (configsEqual(config, DEBUG_CONFIG)) {
        return 'debugonly';
    }
    
    return 'custom';
}

/**
 * Checks if two debug configurations are equal
 * @param config1 First debug configuration
 * @param config2 Second debug configuration
 * @returns True if configurations are equal
 */
function configsEqual(config1: DebugConfig, config2: DebugConfig): boolean {
    return Object.keys(config1).every(key => 
        config1[key as keyof DebugConfig] === config2[key as keyof DebugConfig]
    );
} 