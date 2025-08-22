import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OrgUtils } from './orgUtils';

export interface SalesforceConfig {
    targetOrg?: string;
    targetDevHub?: string;
    [key: string]: any;
}

export interface OrgAuthInfo {
    alias?: string;
    username?: string;
    orgId?: string;
    instanceUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    isDevHub?: boolean;
    expirationDate?: string;
    created?: string;
    connectedStatus?: string;
}

/**
 * Utility class to read Salesforce configuration directly from filesystem
 * without relying on CLI commands
 */
export class SalesforceConfigReader {
    
    /**
     * Gets the Salesforce CLI configuration directory path
     * @param preferProject If true, looks for project-specific config first
     */
    private static getConfigDir(preferProject: boolean = true): string {
        if (preferProject) {
            // First check VS Code workspace directory
            try {
                const vscode = require('vscode');
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    const projectConfigDirs = ['.sf', '.sfdx'];
                    for (const dir of projectConfigDirs) {
                        const projectConfigDir = path.join(workspaceRoot, dir);
                        if (fs.existsSync(projectConfigDir)) {
                            OrgUtils.logDebug(`[SalesforceConfigReader] Using VS Code workspace config: ${projectConfigDir}`);
                            return projectConfigDir;
                        }
                    }
                }
            } catch (error) {
                OrgUtils.logDebug('[SalesforceConfigReader] VS Code not available, trying process.cwd()');
            }
            
            // Fall back to current working directory
            const projectConfigDirs = ['.sf', '.sfdx'];
            for (const dir of projectConfigDirs) {
                const projectConfigDir = path.resolve(process.cwd(), dir);
                if (fs.existsSync(projectConfigDir)) {
                    OrgUtils.logDebug(`[SalesforceConfigReader] Using process.cwd() config: ${projectConfigDir}`);
                    return projectConfigDir;
                }
            }
            
            // Also check if we're in a VS Code workspace (legacy code)
            if (typeof require !== 'undefined') {
                try {
                    const vscode = require('vscode');
                    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
                        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                        for (const dir of projectConfigDirs) {
                            const workspaceConfigDir = path.join(workspaceRoot, dir);
                            if (fs.existsSync(workspaceConfigDir)) {
                                OrgUtils.logDebug(`[SalesforceConfigReader] Using workspace config: ${workspaceConfigDir}`);
                                return workspaceConfigDir;
                            }
                        }
                    }
                } catch (error) {
                    // vscode module not available, continue with global config
                }
            }
        }
        
        // Fall back to global config
        const homeDir = os.homedir();
        // Check for new CLI format first (.sf), then legacy (.sfdx)
        const sfDir = path.join(homeDir, '.sf');
        const sfdxDir = path.join(homeDir, '.sfdx');
        
        if (fs.existsSync(sfDir)) {
            OrgUtils.logDebug(`[SalesforceConfigReader] Using global config: ${sfDir}`);
            return sfDir;
        } else if (fs.existsSync(sfdxDir)) {
            OrgUtils.logDebug(`[SalesforceConfigReader] Using global legacy config: ${sfdxDir}`);
            return sfdxDir;
        }
        
        throw new Error('No Salesforce CLI configuration directory found');
    }

    /**
     * Reads the main Salesforce CLI configuration file
     * @param preferProject If true, looks for project config first, then global
     */
    public static readMainConfig(preferProject: boolean = true): SalesforceConfig | null {
        try {
            const configDir = this.getConfigDir(preferProject);
            const configFile = path.join(configDir, 'config.json');
            
            if (!fs.existsSync(configFile)) {
                OrgUtils.logDebug(`[SalesforceConfigReader] No config.json found in ${configDir}`);
                
                // If we tried project config and failed, try global config
                if (preferProject) {
                    OrgUtils.logDebug('[SalesforceConfigReader] Trying global config as fallback');
                    return this.readMainConfig(false);
                }
                return null;
            }
            
            const configContent = fs.readFileSync(configFile, 'utf8');
            const config = JSON.parse(configContent) as SalesforceConfig;
            
            OrgUtils.logDebug(`[SalesforceConfigReader] Config read from ${configFile}:`, config);
            return config;
        } catch (error: any) {
            OrgUtils.logError('[SalesforceConfigReader] Error reading config:', error);
            
            // If we tried project config and failed, try global config
            if (preferProject) {
                OrgUtils.logDebug('[SalesforceConfigReader] Project config failed, trying global config');
                return this.readMainConfig(false);
            }
            return null;
        }
    }

    /**
     * Gets the default target org from configuration
     * @param preferProject If true, checks project config first, then global
     */
    public static getDefaultTargetOrg(preferProject: boolean = true): string | null {
        try {
            const config = this.readMainConfig(preferProject);
            
            // Check for new format (target-org)
            let targetOrg = config?.targetOrg || config?.['target-org'];
            
            // If not found, check for legacy format (defaultusername)
            if (!targetOrg) {
                targetOrg = config?.defaultusername || config?.['defaultusername'];
            }
            
            OrgUtils.logDebug(`[SalesforceConfigReader] getDefaultTargetOrg (preferProject: ${preferProject}): ${targetOrg}`);
            return targetOrg || null;
        } catch (error: any) {
            OrgUtils.logError('[SalesforceConfigReader] Error getting default target org:', error);
            return null;
        }
    }

    /**
     * Gets the default dev hub from configuration
     * @param preferProject If true, checks project config first, then global
     */
    public static getDefaultDevHub(preferProject: boolean = true): string | null {
        try {
            const config = this.readMainConfig(preferProject);
            const devHub = config?.targetDevHub || config?.['target-dev-hub'] || null;
            OrgUtils.logDebug(`[SalesforceConfigReader] getDefaultDevHub (preferProject: ${preferProject}): ${devHub}`);
            return devHub;
        } catch (error: any) {
            OrgUtils.logError('[SalesforceConfigReader] Error getting default dev hub:', error);
            return null;
        }
    }

    /**
     * Reads org authentication info from the auth files
     */
    public static readOrgAuthInfo(usernameOrAlias: string): OrgAuthInfo | null {
        try {
            const configDir = this.getConfigDir();
            
            // First, try to find by alias
            const aliasFile = path.join(configDir, 'alias.json');
            let actualUsername = usernameOrAlias;
            
            if (fs.existsSync(aliasFile)) {
                const aliasContent = fs.readFileSync(aliasFile, 'utf8');
                const aliases = JSON.parse(aliasContent);
                
                // If input is an alias, get the actual username
                if (aliases[usernameOrAlias]) {
                    actualUsername = aliases[usernameOrAlias];
                }
            }
            
            // Look for auth file by username
            const authFiles = fs.readdirSync(configDir).filter(file => 
                file.endsWith('.json') && 
                file.includes(actualUsername) && 
                !file.includes('alias.json') &&
                !file.includes('config.json')
            );
            
            if (authFiles.length === 0) {
                OrgUtils.logDebug(`[SalesforceConfigReader] No auth file found for: ${usernameOrAlias}`);
                return null;
            }
            
            // Use the first matching auth file
            const authFile = path.join(configDir, authFiles[0]);
            const authContent = fs.readFileSync(authFile, 'utf8');
            const authInfo = JSON.parse(authContent) as OrgAuthInfo;
            
            OrgUtils.logDebug(`[SalesforceConfigReader] Auth info read for ${usernameOrAlias}:`, {
                username: authInfo.username,
                alias: authInfo.alias,
                orgId: authInfo.orgId,
                instanceUrl: authInfo.instanceUrl
            });
            
            return authInfo;
        } catch (error: any) {
            OrgUtils.logError(`[SalesforceConfigReader] Error reading auth info for ${usernameOrAlias}:`, error);
            return null;
        }
    }

    /**
     * Gets complete information about the default org without CLI
     */
    public static getDefaultOrgInfo(): { alias: string | null; authInfo: OrgAuthInfo | null } {
        try {
            const defaultOrg = this.getDefaultTargetOrg();
            if (!defaultOrg) {
                return { alias: null, authInfo: null };
            }
            
            const authInfo = this.readOrgAuthInfo(defaultOrg);
            return { alias: defaultOrg, authInfo };
        } catch (error: any) {
            OrgUtils.logError('[SalesforceConfigReader] Error getting default org info:', error);
            return { alias: null, authInfo: null };
        }
    }

    /**
     * Checks if a default org is configured without CLI
     */
    public static hasDefaultOrg(): boolean {
        try {
            const defaultOrg = this.getDefaultTargetOrg();
            return defaultOrg !== null;
        } catch (error: any) {
            return false;
        }
    }

    /**
     * Gets all available org aliases without CLI
     */
    public static getAllAliases(): { [alias: string]: string } {
        try {
            const configDir = this.getConfigDir();
            const aliasFile = path.join(configDir, 'alias.json');
            
            if (!fs.existsSync(aliasFile)) {
                return {};
            }
            
            const aliasContent = fs.readFileSync(aliasFile, 'utf8');
            return JSON.parse(aliasContent);
        } catch (error: any) {
            OrgUtils.logError('[SalesforceConfigReader] Error reading aliases:', error);
            return {};
        }
    }
}
