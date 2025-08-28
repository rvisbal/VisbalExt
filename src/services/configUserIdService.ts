import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Service to extract user ID from Salesforce configuration files without CLI calls
 * Implements the file-based resolution chain: .sf/config.json → alias.json → username.json
 */
export class ConfigUserIdService {

    /**
     * Gets the user ID from VS Code/Salesforce CLI settings for a given alias
     * Returns null if nothing is found - NO CLI calls made
     * 
     * @param alias The org alias to lookup
     * @returns Promise<string | null> The user ID or null if not found
     */
    public static async getUserIdFromConfig(alias: string): Promise<string | null> {
        try {
            OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromConfig', `Looking up user ID for alias: ${alias}`);

            // Step 1: Get the actual username from the alias
            const username = await this.resolveAliasToUsername(alias);
            if (!username) {
                OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromConfig', `No username found for alias: ${alias}`);
                return null;
            }

            OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromConfig', `Resolved alias ${alias} to username: ${username}`);

            // Step 2: Get the user ID from the username auth file
            const userId = this.getUserIdFromUsername(username);
            if (!userId) {
                OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromConfig', `No user ID found for username: ${username}`);
                return null;
            }

            OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromConfig', `Found user ID for ${alias}: ${userId}`);
            return userId;

        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.ConfigUserIdService] getUserIdFromConfig -- Error getting user ID for alias ${alias}:`, error);
            return null;
        }
    }

    /**
     * Step 1: Resolve alias to username using the configuration chain
     * 1. Check if alias is the default target-org in .sf/config.json
     * 2. Look up the alias in alias.json to get the actual username
     */
    private static async resolveAliasToUsername(alias: string): Promise<string | null> {
        try {
            // First, check if this alias is the current default target-org
            const defaultTargetOrg = this.getDefaultTargetOrg();
            if (defaultTargetOrg === alias) {
                // The alias is the default, now resolve it to username
                const username = this.lookupAliasInFile(alias);
                if (username) {
                    return username;
                }
                // If alias lookup fails, the alias might actually be a username
                return alias;
            }

            // If not the default, still try to resolve the alias
            const username = this.lookupAliasInFile(alias);
            if (username) {
                return username;
            }

            // If no alias mapping found, treat the input as a username
            return alias;

        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.ConfigUserIdService] resolveAliasToUsername -- Error resolving alias ${alias}:`, error);
            return null;
        }
    }

    /**
     * Gets the default target org from .sf/config.json
     */
    private static getDefaultTargetOrg(): string | null {
        try {
            const configDirs = this.getConfigDirectories();
            
            for (const configDir of configDirs) {
                const configFile = path.join(configDir, 'config.json');
                if (fs.existsSync(configFile)) {
                    const configContent = fs.readFileSync(configFile, 'utf8');
                    const config = JSON.parse(configContent);
                    
                    // Check for new format (target-org) or legacy format (defaultusername)
                    const targetOrg = config?.['target-org'] || config?.targetOrg || 
                                     config?.defaultusername || config?.['defaultusername'];
                    
                    if (targetOrg) {
                        OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getDefaultTargetOrg', `Found in ${configFile}: ${targetOrg}`);
                        return targetOrg;
                    }
                }
            }
            
            return null;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ConfigUserIdService] getDefaultTargetOrg -- Error:', error);
            return null;
        }
    }

    /**
     * Look up alias in alias.json to get the actual username
     */
    private static lookupAliasInFile(alias: string): string | null {
        try {
            const configDirs = this.getConfigDirectories();
            
            for (const configDir of configDirs) {
                const aliasFile = path.join(configDir, 'alias.json');
                if (fs.existsSync(aliasFile)) {
                    const aliasContent = fs.readFileSync(aliasFile, 'utf8');
                    const aliases = JSON.parse(aliasContent);
                    
                    if (aliases[alias]) {
                        OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] lookupAliasInFile', `Found alias ${alias} -> ${aliases[alias]}`);
                        return aliases[alias];
                    }
                }
            }
            
            return null;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.ConfigUserIdService] lookupAliasInFile -- Error looking up alias ${alias}:`, error);
            return null;
        }
    }

    /**
     * Step 3: Extract user ID from the username auth file
     */
    private static getUserIdFromUsername(username: string): string | null {
        try {
            const configDirs = this.getConfigDirectories();
            
            for (const configDir of configDirs) {
                // Look for auth file containing the username
                if (!fs.existsSync(configDir)) {
                    continue;
                }
                
                const files = fs.readdirSync(configDir);
                const authFiles = files.filter(file => 
                    file.endsWith('.json') && 
                    file.includes(username) && 
                    !file.includes('alias.json') &&
                    !file.includes('config.json')
                );
                
                for (const authFile of authFiles) {
                    try {
                        const authFilePath = path.join(configDir, authFile);
                        const authContent = fs.readFileSync(authFilePath, 'utf8');
                        const authData = JSON.parse(authContent);
                        
                        // Look for user ID in various possible fields
                        const userId = authData.userId || authData['user.id'] || authData.id;
                        if (userId) {
                            OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromUsername', `Found user ID in ${authFile}: ${userId}`);
                            return userId;
                        }
                    } catch (fileError) {
                        OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getUserIdFromUsername', `Error reading ${authFile}:`, fileError);
                        continue;
                    }
                }
            }
            
            return null;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.ConfigUserIdService] getUserIdFromUsername -- Error getting user ID for username ${username}:`, error);
            return null;
        }
    }

    /**
     * Gets the ordered list of configuration directories to check
     * Priority: project .sf, project .sfdx, global .sf, global .sfdx
     */
    private static getConfigDirectories(): string[] {
        const configDirs: string[] = [];
        
        try {
            // Project-level configuration (VS Code workspace)
            try {
                const vscode = require('vscode');
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    configDirs.push(
                        path.join(workspaceRoot, '.sf'),
                        path.join(workspaceRoot, '.sfdx')
                    );
                }
            } catch (error) {
                // VS Code not available, try process.cwd()
                configDirs.push(
                    path.join(process.cwd(), '.sf'),
                    path.join(process.cwd(), '.sfdx')
                );
            }
            
            // Global configuration
            const homeDir = os.homedir();
            configDirs.push(
                path.join(homeDir, '.sf'),
                path.join(homeDir, '.sfdx')
            );
            
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.ConfigUserIdService] getConfigDirectories -- Error building config directories:', error);
        }
        
        // Filter to only existing directories
        return configDirs.filter(dir => fs.existsSync(dir));
    }

    /**
     * Gets the org ID from configuration files for the given alias
     * Used for validation purposes
     */
    public static async getOrgIdFromConfig(alias: string): Promise<string | null> {
        try {
            const username = await this.resolveAliasToUsername(alias);
            if (!username) {
                return null;
            }

            const configDirs = this.getConfigDirectories();
            
            for (const configDir of configDirs) {
                if (!fs.existsSync(configDir)) {
                    continue;
                }
                
                const files = fs.readdirSync(configDir);
                const authFiles = files.filter(file => 
                    file.endsWith('.json') && 
                    file.includes(username) && 
                    !file.includes('alias.json') &&
                    !file.includes('config.json')
                );
                
                for (const authFile of authFiles) {
                    try {
                        const authFilePath = path.join(configDir, authFile);
                        const authContent = fs.readFileSync(authFilePath, 'utf8');
                        const authData = JSON.parse(authContent);
                        
                        const orgId = authData.orgId || authData['org.id'] || authData.id;
                        if (orgId) {
                            OrgUtils.logDebug('[VisbalExt.ConfigUserIdService] getOrgIdFromConfig', `Found org ID for ${alias}: ${orgId}`);
                            return orgId;
                        }
                    } catch (fileError) {
                        continue;
                    }
                }
            }
            
            return null;
        } catch (error: any) {
            OrgUtils.logError(`[VisbalExt.ConfigUserIdService] getOrgIdFromConfig -- Error getting org ID for alias ${alias}:`, error);
            return null;
        }
    }
}
