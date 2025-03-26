// Debug presets configuration
export const debugPresets = {
    default: {
        apexCode: 'DEBUG',
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
    },
    detailed: {
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
    },
    developer: {
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
    },
    debugonly: {
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
    }
};

/**
 * Applies a debug preset to the select elements
 * @param {string} preset - The preset name to apply
 * @param {Object} debugSelects - Object containing debug select elements
 */
export function applyPreset(preset, debugSelects) {
    if (preset === 'custom') {
        return; // Don't change anything for custom
    }
    
    const presetValues = debugPresets[preset];
    if (!presetValues) {
        return;
    }
    
    // Apply preset values to selects
    Object.keys(presetValues).forEach(key => {
        const select = debugSelects[key];
        if (select) {
            select.value = presetValues[key];
        }
    });
} 