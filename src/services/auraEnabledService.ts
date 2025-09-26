import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReferenceLocation, SymbolReference } from './referencesService';
import * as OrgUtilsModule from '../utils/orgUtils';
const OrgUtils = OrgUtilsModule.OrgUtils;

/**
 * Represents an @AuraEnabled method found in Apex classes
 */
export interface AuraEnabledMethod {
    className: string;
    methodName: string;
    methodSignature: string;
    filePath: vscode.Uri;
    position: vscode.Position;
    lineText: string;
    isPublic: boolean;
    isStatic: boolean;
    returnType: string;
    parameters: string;
}

/**
 * Cache interface for storing @AuraEnabled results
 */
interface AuraEnabledCache {
    timestamp: number;
    version: string;
    resultsByClass: Record<string, SymbolReference[]>;
}

/**
 * Service for finding @AuraEnabled methods and their LWC references
 */
export class AuraEnabledService {
    private static readonly CACHE_FILE = '.visbal/cache/auraEnabled.json';
    private static readonly CACHE_VERSION = '1.0.0';
    
    /**
     * Gets the cache file path
     */
    private static getCacheFilePath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }
        return path.join(workspaceFolders[0].uri.fsPath, this.CACHE_FILE);
    }

    /**
     * Ensures the cache directory exists
     */
    private static ensureCacheDirectory(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }
        const cacheDir = path.join(workspaceFolders[0].uri.fsPath, '.visbal', 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
    }

    /**
     * Saves results to cache
     */
    private static saveToCache(resultsByClass: Map<string, SymbolReference[]>): void {
        try {
            this.ensureCacheDirectory();
            const cacheFilePath = this.getCacheFilePath();
            
            // Convert Map to plain object for JSON serialization, handling URIs properly
            const resultsObject: Record<string, any[]> = {};
            for (const [className, methods] of resultsByClass) {
                resultsObject[className] = methods.map(method => ({
                    ...method,
                    // Convert URIs in references to string paths for serialization
                    references: method.references.map(ref => ({
                        ...ref,
                        filePath: ref.filePath.fsPath // Store as string path
                    })),
                    // Handle methodDefinition if it exists
                    methodDefinition: (method as any).methodDefinition ? {
                        ...(method as any).methodDefinition,
                        filePath: (method as any).methodDefinition.filePath.fsPath
                    } : undefined
                }));
            }
            
            const cache: AuraEnabledCache = {
                timestamp: Date.now(),
                version: this.CACHE_VERSION,
                resultsByClass: resultsObject
            };
            
            fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Saved cache to: ${cacheFilePath}`);
        } catch (error) {
            console.error('[AuraEnabledService] Error saving cache:', error);
        }
    }

    /**
     * Loads results from cache
     */
    public static loadFromCache(): Map<string, SymbolReference[]> | null {
        try {
            const cacheFilePath = this.getCacheFilePath();
            
            if (!fs.existsSync(cacheFilePath)) {
                OrgUtils.logDebug('[VisbalExt.AuraEnabledService] No cache file found');
                return null;
            }
            
            const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
            const cache: AuraEnabledCache = JSON.parse(cacheContent);
            
            // Check cache version
            if (cache.version !== this.CACHE_VERSION) {
                OrgUtils.logDebug('[VisbalExt.AuraEnabledService] Cache version mismatch, ignoring cache');
                return null;
            }
            
            // Convert plain object back to Map, reconstructing URIs properly
            const resultsByClass = new Map<string, SymbolReference[]>();
            for (const [className, methods] of Object.entries(cache.resultsByClass)) {
                const reconstructedMethods = methods.map((method: any) => ({
                    ...method,
                    // Convert string paths back to vscode.Uri objects
                    references: method.references.map((ref: any) => ({
                        ...ref,
                        filePath: vscode.Uri.file(ref.filePath), // Convert back to URI
                        position: new vscode.Position(ref.position.line, ref.position.character) // Ensure position is a proper Position object
                    })),
                    // Handle methodDefinition if it exists
                    methodDefinition: method.methodDefinition ? {
                        ...method.methodDefinition,
                        filePath: vscode.Uri.file(method.methodDefinition.filePath),
                        position: new vscode.Position(method.methodDefinition.position.line, method.methodDefinition.position.character)
                    } : undefined
                }));
                resultsByClass.set(className, reconstructedMethods);
            }
            
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Loaded cache from: ${cacheFilePath} (${resultsByClass.size} classes)`);
            return resultsByClass;
        } catch (error) {
            console.error('[AuraEnabledService] Error loading cache:', error);
            return null;
        }
    }

    /**
     * Gets cache info (timestamp, size, etc.)
     */
    public static getCacheInfo(): { exists: boolean; timestamp?: number; size?: number; classes?: number } {
        try {
            const cacheFilePath = this.getCacheFilePath();
            
            if (!fs.existsSync(cacheFilePath)) {
                return { exists: false };
            }
            
            const stats = fs.statSync(cacheFilePath);
            const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
            const cache: AuraEnabledCache = JSON.parse(cacheContent);
            
            return {
                exists: true,
                timestamp: cache.timestamp,
                size: stats.size,
                classes: Object.keys(cache.resultsByClass).length
            };
        } catch (error) {
            console.error('[AuraEnabledService] Error getting cache info:', error);
            return { exists: false };
        }
    }

    /**
     * Clears the cache file if it exists
     */
    public static clearCache(): void {
        try {
            const cacheFilePath = this.getCacheFilePath();
            
            if (fs.existsSync(cacheFilePath)) {
                fs.unlinkSync(cacheFilePath);
                OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Cache file deleted: ${cacheFilePath}`);
            } else {
                OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] No cache file found to delete: ${cacheFilePath}`);
            }
        } catch (error) {
            console.error('[AuraEnabledService] Error clearing cache:', error);
            OrgUtils.logError('[VisbalExt.AuraEnabledService] Error clearing cache:', error as Error);
        }
    }

    /**
     * Finds all @AuraEnabled methods in Apex classes and their references in LWC files
     * Returns results grouped by class for hierarchical display
     */
    public static async findAuraEnabledMethods(): Promise<Map<string, SymbolReference[]>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const resultsByClass = new Map<string, SymbolReference[]>();
        
        // Find all @AuraEnabled methods
        const auraEnabledMethods = await this.scanAuraEnabledMethods();
        
        // Group methods by class
        const methodsByClass = new Map<string, AuraEnabledMethod[]>();
        for (const method of auraEnabledMethods) {
            if (!methodsByClass.has(method.className)) {
                methodsByClass.set(method.className, []);
            }
            methodsByClass.get(method.className)!.push(method);
        }
        
        // For each class, find references for all its methods
        for (const [className, methods] of methodsByClass) {
            const classResults: SymbolReference[] = [];
            
            for (const method of methods) {
                const references = await this.findLWCReferences(method);
                
                if (references.length > 0) {
                    const symbolReference: SymbolReference & { methodDefinition?: { filePath: vscode.Uri; position: vscode.Position; lineText: string } } = {
                        symbol: method.methodName,
                        type: '@AuraEnabled Method',
                        className: method.className,
                        contextDescription: `${method.methodName}()`,
                        references: references,
                        methodDefinition: {
                            filePath: method.filePath,
                            position: method.position,
                            lineText: method.lineText
                        }
                    };
                    
                    classResults.push(symbolReference);
                }
            }
            
        // Only add classes that have methods with references
        if (classResults.length > 0) {
            resultsByClass.set(className, classResults);
        }
    }
    
    // Save results to cache
    this.saveToCache(resultsByClass);
    
    return resultsByClass;
    }

    /**
     * Scans all Apex classes for @AuraEnabled methods
     */
    private static async scanAuraEnabledMethods(): Promise<AuraEnabledMethod[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const methods: AuraEnabledMethod[] = [];
        const classesPath = path.join(workspaceFolders[0].uri.fsPath, 'force-app', 'main', 'default', 'classes');
        
        if (!fs.existsSync(classesPath)) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Classes directory not found: ${classesPath}`);
            return [];
        }

        const classFiles = fs.readdirSync(classesPath).filter(file => file.endsWith('.cls'));
        
        for (const classFile of classFiles) {
            const filePath = path.join(classesPath, classFile);
            const fileUri = vscode.Uri.file(filePath);
            const className = path.basename(classFile, '.cls');
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    const previousLine = i > 0 ? lines[i - 1].trim() : '';
                    
                    // Check if previous line has @AuraEnabled annotation
                    if (previousLine.includes('@AuraEnabled') && this.isMethodDeclaration(line)) {
                        const methodInfo = this.parseMethodDeclaration(line);
                        if (methodInfo) {
                            methods.push({
                                className: className,
                                methodName: methodInfo.name,
                                methodSignature: line,
                                filePath: fileUri,
                                position: new vscode.Position(i, line.indexOf(methodInfo.name)),
                                lineText: line,
                                isPublic: line.includes('public'),
                                isStatic: line.includes('static'),
                                returnType: methodInfo.returnType,
                                parameters: methodInfo.parameters
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[VisbalExt.AuraEnabledService] Error reading class file ${filePath}:`, error);
            }
        }
        
        return methods;
    }

    /**
     * Finds references to an @AuraEnabled method in LWC files
     */
    private static async findLWCReferences(method: AuraEnabledMethod): Promise<ReferenceLocation[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const references: ReferenceLocation[] = [];
        const lwcPath = path.join(workspaceFolders[0].uri.fsPath, 'force-app', 'main', 'default', 'lwc');
        
        if (!fs.existsSync(lwcPath)) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] LWC directory not found: ${lwcPath}`);
            return [];
        }

        // Get all LWC component directories
        const lwcDirs = fs.readdirSync(lwcPath).filter(dir => {
            return fs.statSync(path.join(lwcPath, dir)).isDirectory();
        });

        for (const lwcDir of lwcDirs) {
            const componentPath = path.join(lwcPath, lwcDir);
            const jsFiles = fs.readdirSync(componentPath).filter(file => file.endsWith('.js'));
            
            for (const jsFile of jsFiles) {
                const filePath = path.join(componentPath, jsFile);
                const fileUri = vscode.Uri.file(filePath);
                
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n');
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const trimmedLine = line.trim();
                        
                        // Look for method references in various patterns
                        const patterns = [
                            // Import pattern: import methodName from '@salesforce/apex/ClassName.methodName'
                            new RegExp(`import\\s+\\w+\\s+from\\s+['"]@salesforce/apex/${method.className}\\.${method.methodName}['"]`, 'i'),
                            // Direct method call: ClassName.methodName
                            new RegExp(`${method.className}\\.${method.methodName}\\b`, 'i'),
                            // Method name in apex call
                            new RegExp(`['"]${method.methodName}['"]`, 'i'),
                            // Variable assignment or usage
                            new RegExp(`\\b${method.methodName}\\b`, 'i')
                        ];
                        
                        for (const pattern of patterns) {
                            if (pattern.test(line)) {
                                const match = line.match(pattern);
                                if (match) {
                                    const matchIndex = line.indexOf(match[0]);
                                    references.push({
                                        filePath: fileUri,
                                        fileName: jsFile,
                                        position: new vscode.Position(i, matchIndex),
                                        lineText: line,
                                        contextBefore: i > 0 ? lines[i - 1] : '',
                                        contextAfter: i < lines.length - 1 ? lines[i + 1] : ''
                                    });
                                    break; // Only add one reference per line
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[AuraEnabledService] Error reading LWC file ${filePath}:`, error);
                }
            }
        }
        
        return references;
    }

    /**
     * Checks if a line is a method declaration
     */
    private static isMethodDeclaration(line: string): boolean {
        // Look for method patterns: access modifier + optional static + return type + method name + parentheses
        const methodPattern = /\b(public|private|protected|global)\s+(static\s+)?\w+\s+\w+\s*\(/;
        return methodPattern.test(line.trim());
    }

    /**
     * Parses method declaration to extract method information
     */
    private static parseMethodDeclaration(line: string): { name: string; returnType: string; parameters: string } | null {
        // Match method pattern: access modifier + optional static + return type + method name + parameters
        const methodMatch = line.match(/\b(public|private|protected|global)\s+(static\s+)?(\w+)\s+(\w+)\s*\(([^)]*)\)/);
        
        if (methodMatch) {
            return {
                name: methodMatch[4],
                returnType: methodMatch[3],
                parameters: methodMatch[5]
            };
        }
        
        return null;
    }

    /**
     * Creates a summary report of all @AuraEnabled methods and their usage
     */
    public static async generateReport(): Promise<string> {
        const resultsByClass = await this.findAuraEnabledMethods();
        
        // Calculate totals
        let totalMethods = 0;
        let totalReferences = 0;
        for (const [className, methods] of resultsByClass) {
            totalMethods += methods.length;
            totalReferences += methods.reduce((sum, method) => sum + method.references.length, 0);
        }
        
        let report = `# @AuraEnabled Methods Report\n\n`;
        report += `Generated on: ${new Date().toLocaleString()}\n`;
        report += `Total classes: ${resultsByClass.size}\n`;
        report += `Total @AuraEnabled methods with LWC references: ${totalMethods}\n`;
        report += `Total references: ${totalReferences}\n\n`;
        
        if (resultsByClass.size === 0) {
            report += `No @AuraEnabled methods found that are referenced by Lightning Web Components.\n`;
            return report;
        }
        
        // Sort classes by name
        const sortedClasses = Array.from(resultsByClass.entries()).sort(([a], [b]) => a.localeCompare(b));
        
        sortedClasses.forEach(([className, methods], classIndex) => {
            report += `## ${classIndex + 1}. ${className}\n\n`;
            
            // Sort methods by name
            const sortedMethods = methods.sort((a, b) => a.symbol.localeCompare(b.symbol));
            
            sortedMethods.forEach((method, methodIndex) => {
                report += `### ${method.contextDescription}\n\n`;
                report += `**References (${method.references.length}):**\n`;
                
                method.references.forEach(ref => {
                    report += `- ${ref.fileName}:${ref.position.line + 1} - ${ref.lineText.trim()}\n`;
                });
                
                report += `\n`;
            });
            
            report += `\n`;
        });
        
        return report;
    }
}
