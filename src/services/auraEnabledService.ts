import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReferenceLocation, SymbolReference } from './referencesService';
import * as OrgUtilsModule from '../utils/orgUtils';
const OrgUtils = OrgUtilsModule.OrgUtils;

/**
 * Represents a parameter in an @AuraEnabled method
 */
export interface MethodParameter {
    name: string;
    type: string;
    fullDeclaration: string;
}

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
    parameters: string; // Raw parameter string
    parsedParameters: MethodParameter[]; // Parsed parameter details
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
                        filePath: (method as any).methodDefinition.filePath.fsPath,
                        // parsedParameters are already serializable objects
                        parsedParameters: (method as any).methodDefinition.parsedParameters || []
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
                        position: new vscode.Position(method.methodDefinition.position.line, method.methodDefinition.position.character),
                        // parsedParameters should already be proper objects
                        parsedParameters: method.methodDefinition.parsedParameters || []
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
        
        // Group methods by class and deduplicate
        const methodsByClass = new Map<string, AuraEnabledMethod[]>();
        for (const method of auraEnabledMethods) {
            if (!methodsByClass.has(method.className)) {
                methodsByClass.set(method.className, []);
            }
            
            const classMethods = methodsByClass.get(method.className)!;
            
            // Check for duplicates based on method name and parameters
            const isDuplicate = classMethods.some(existingMethod => 
                existingMethod.methodName === method.methodName &&
                existingMethod.parameters === method.parameters
            );
            
            if (!isDuplicate) {
                classMethods.push(method);
            }
        }
        
        // For each class, find references for all its methods
        for (const [className, methods] of methodsByClass) {
            const classResults: SymbolReference[] = [];
            
            for (const method of methods) {
                const references = await this.findLWCReferences(method);
                
                if (references.length > 0) {
                    // Create parameter summary for context description
                    const paramSummary = method.parsedParameters.length > 0 
                        ? `(${method.parsedParameters.map(p => `${p.type} ${p.name}`).join(', ')})`
                        : '()';
                    
                    const symbolReference: SymbolReference & { 
                        methodDefinition?: { 
                            filePath: vscode.Uri; 
                            position: vscode.Position; 
                            lineText: string;
                            returnType: string;
                            parsedParameters: MethodParameter[];
                        } 
                    } = {
                        symbol: method.methodName,
                        type: '@AuraEnabled Method',
                        className: method.className,
                        contextDescription: `${method.methodName}${paramSummary}`,
                        references: references,
                        methodDefinition: {
                            filePath: method.filePath,
                            position: method.position,
                            lineText: method.lineText,
                            returnType: method.returnType,
                            parsedParameters: method.parsedParameters
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
        
        // Scan all workspace folders for Salesforce projects
        const allClassesPaths: string[] = [];
        
        for (const workspaceFolder of workspaceFolders) {
            const workspacePath = workspaceFolder.uri.fsPath;
            const salesforceClassesPath = path.join(workspacePath, 'force-app', 'main', 'default', 'classes');
            
            // Check if this workspace folder contains a Salesforce project
            if (fs.existsSync(salesforceClassesPath)) {
                allClassesPaths.push(salesforceClassesPath);
                OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Found Salesforce classes directory: ${salesforceClassesPath}`);
            }
        }
        
        // If no Salesforce projects found in workspace folders, return empty
        if (allClassesPaths.length === 0) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] No Salesforce projects found in workspace folders`);
            return [];
        }

        // Scan all found Salesforce projects
        for (const classesPath of allClassesPaths) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Scanning classes directory: ${classesPath}`);
            const classFiles = fs.readdirSync(classesPath).filter(file => file.endsWith('.cls'));
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Found ${classFiles.length} class files in ${classesPath}`);
            
            for (const classFile of classFiles) {
                const filePath = path.join(classesPath, classFile);
                const fileUri = vscode.Uri.file(filePath);
                const className = path.basename(classFile, '.cls');
                
                // Debug logging for specific class
                if (className === 'HierarchyDisplayUtils') {
                    OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Processing HierarchyDisplayUtils: ${filePath}`);
                }
                
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n');
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        const previousLine = i > 0 ? lines[i - 1].trim() : '';
                        
                        // Check for @AuraEnabled annotation either on the previous line or current line
                        const hasAuraEnabledAnnotation = previousLine.includes('@AuraEnabled') || line.includes('@AuraEnabled');
                        
                        if (hasAuraEnabledAnnotation) {
                            // Debug logging for HierarchyDisplayUtils
                            if (className === 'HierarchyDisplayUtils') {
                                OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Found @AuraEnabled in HierarchyDisplayUtils at line ${i}: ${line}`);
                            }
                            // Handle both single-line and multi-line method declarations
                            let fullMethodDeclaration = line;
                            let methodStartIndex = i;
                            
                            // If @AuraEnabled is on the same line, we need to extract just the method part
                            if (line.includes('@AuraEnabled')) {
                                // Find where the method declaration starts after @AuraEnabled
                                const auraEnabledMatch = line.match(/@AuraEnabled(\([^)]*\))?\s*(.*)/);
                                if (auraEnabledMatch && auraEnabledMatch[2]) {
                                    fullMethodDeclaration = auraEnabledMatch[2].trim();
                                }
                            }
                            
                            // If this line doesn't end with a closing parenthesis followed by optional whitespace and {
                            // then it's likely a multi-line method declaration
                            if (!fullMethodDeclaration.match(/\)\s*\{?\s*$/)) {
                                // Look ahead to find the complete method declaration
                                let j = i + 1;
                                while (j < lines.length && !lines[j].trim().match(/\)\s*\{?\s*$/)) {
                                    fullMethodDeclaration += ' ' + lines[j].trim();
                                    j++;
                                }
                                // Include the final line with the closing parenthesis
                                if (j < lines.length) {
                                    fullMethodDeclaration += ' ' + lines[j].trim();
                                }
                            }
                            
                            if (this.isMethodDeclaration(fullMethodDeclaration)) {
                                const methodInfo = this.parseMethodDeclaration(fullMethodDeclaration);
                                if (methodInfo) {
                                    // Debug logging for HierarchyDisplayUtils
                                    if (className === 'HierarchyDisplayUtils') {
                                        OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Successfully parsed method in HierarchyDisplayUtils: ${methodInfo.name}`);
                                    }
                                    
                                    methods.push({
                                        className: className,
                                        methodName: methodInfo.name,
                                        methodSignature: fullMethodDeclaration,
                                        filePath: fileUri,
                                        position: new vscode.Position(methodStartIndex, line.indexOf(methodInfo.name) >= 0 ? line.indexOf(methodInfo.name) : 0),
                                        lineText: fullMethodDeclaration,
                                        isPublic: fullMethodDeclaration.includes('public'),
                                        isStatic: fullMethodDeclaration.includes('static'),
                                        returnType: methodInfo.returnType,
                                        parameters: methodInfo.parameters,
                                        parsedParameters: methodInfo.parsedParameters
                                    });
                                } else {
                                    // Debug logging for failed parsing
                                    if (className === 'HierarchyDisplayUtils') {
                                        OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Failed to parse method in HierarchyDisplayUtils: ${fullMethodDeclaration}`);
                                    }
                                }
                            } else {
                                // Debug logging for failed method declaration detection
                                if (className === 'HierarchyDisplayUtils') {
                                    OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Not recognized as method declaration in HierarchyDisplayUtils: ${fullMethodDeclaration}`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[VisbalExt.AuraEnabledService] Error reading class file ${filePath}:`, error);
                }
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
        
        // Scan all workspace folders for Salesforce LWC directories
        const allLwcPaths: string[] = [];
        
        for (const workspaceFolder of workspaceFolders) {
            const workspacePath = workspaceFolder.uri.fsPath;
            const salesforceLwcPath = path.join(workspacePath, 'force-app', 'main', 'default', 'lwc');
            
            // Check if this workspace folder contains a Salesforce LWC directory
            if (fs.existsSync(salesforceLwcPath)) {
                allLwcPaths.push(salesforceLwcPath);
                OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Found Salesforce LWC directory: ${salesforceLwcPath}`);
            }
        }
        
        // If no Salesforce LWC directories found in workspace folders, return empty
        if (allLwcPaths.length === 0) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] No Salesforce LWC directories found in workspace folders`);
            return [];
        }

        // Scan all found Salesforce LWC directories
        for (const lwcPath of allLwcPaths) {
            OrgUtils.logDebug(`[VisbalExt.AuraEnabledService] Scanning LWC directory: ${lwcPath}`);
            
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
        }
        
        return references;
    }

    /**
     * Checks if a line is a method declaration
     */
    private static isMethodDeclaration(line: string): boolean {
        const trimmed = line.trim();
        
        // Skip constructors - they don't have return types and match ClassName(
        // Constructor pattern: access modifier + ClassName + parentheses (no return type)
        const constructorPattern = /\b(public|private|protected|global)\s+\w+\s*\(/;
        if (constructorPattern.test(trimmed)) {
            // Check if this looks like a constructor (method name matches potential class name)
            const constructorMatch = trimmed.match(/\b(public|private|protected|global)\s+(\w+)\s*\(/);
            if (constructorMatch) {
                const methodName = constructorMatch[2];
                // If method name starts with uppercase, it's likely a constructor
                if (methodName[0] === methodName[0].toUpperCase()) {
                    return false;
                }
            }
        }
        
        // Look for proper method patterns: access modifier + optional static + return type + method name + parentheses
        // Must have a return type (distinguishes from constructors)
        const methodPattern = /\b(public|private|protected|global)\s+(static\s+)?[^(]+\s+\w+\s*\(/;
        const hasReturnType = methodPattern.test(trimmed);
        
        // Additional check: ensure there's actually a return type between access modifier and method name
        if (hasReturnType) {
            const parts = trimmed.split(/\s+/);
            if (parts.length < 3) {
                return false; // Not enough parts for access + return type + method name
            }
            
            // Skip if it looks like: public ClassName( (constructor pattern)
            if (parts.length === 2 && parts[1].includes('(')) {
                return false;
            }
        }
        
        return hasReturnType;
    }

    /**
     * Parses method declaration to extract method information
     */
    private static parseMethodDeclaration(line: string): { name: string; returnType: string; parameters: string; parsedParameters: MethodParameter[] } | null {
        // Match method pattern: access modifier + optional static + return type + method name + parameters
        // Updated to handle complex generic types like Map<String, Map<String, String>>
        const methodMatch = line.match(/\b(public|private|protected|global)\s+(static\s+)?(.+?)\s+(\w+)\s*\(([^)]*)\)/);
        
        if (methodMatch) {
            const methodName = methodMatch[4];
            const returnType = methodMatch[3].trim();
            const parametersString = methodMatch[5];
            
            // Additional constructor check: if method name starts with uppercase and matches return type,
            // it's likely a constructor and shouldn't be included
            if (methodName[0] === methodName[0].toUpperCase() && 
                (returnType === methodName || returnType.endsWith(methodName))) {
                return null;
            }
            
            const parsedParameters = this.parseParameters(parametersString);
            
            return {
                name: methodName,
                returnType: returnType,
                parameters: parametersString,
                parsedParameters: parsedParameters
            };
        }
        
        return null;
    }

    /**
     * Parses parameter string into individual parameter objects
     */
    private static parseParameters(parametersString: string): MethodParameter[] {
        if (!parametersString || parametersString.trim() === '') {
            return [];
        }

        const parameters: MethodParameter[] = [];
        
        // Split by comma, but be careful about nested generics like List<String>
        const paramParts = this.smartSplit(parametersString, ',');
        
        for (const paramPart of paramParts) {
            const trimmed = paramPart.trim();
            if (trimmed) {
                const parameter = this.parseParameter(trimmed);
                if (parameter) {
                    parameters.push(parameter);
                }
            }
        }
        
        return parameters;
    }

    /**
     * Parses a single parameter string into a MethodParameter object
     */
    private static parseParameter(paramString: string): MethodParameter | null {
        // Remove any leading/trailing whitespace
        const cleaned = paramString.trim();
        
        // Match pattern: [final] Type paramName
        // Handle cases like: String name, List<String> items, final Integer count, Map<String, Object> data
        const paramMatch = cleaned.match(/^(?:final\s+)?(.+?)\s+(\w+)$/);
        
        if (paramMatch) {
            const type = paramMatch[1].trim();
            const name = paramMatch[2].trim();
            
            return {
                name: name,
                type: type,
                fullDeclaration: cleaned
            };
        }
        
        // If no match, try to handle edge cases
        const words = cleaned.split(/\s+/);
        if (words.length >= 2) {
            const name = words[words.length - 1];
            const type = words.slice(0, -1).join(' ');
            
            return {
                name: name,
                type: type,
                fullDeclaration: cleaned
            };
        }
        
        return null;
    }

    /**
     * Smart split that respects nested brackets/generics
     */
    private static smartSplit(str: string, delimiter: string): string[] {
        const result: string[] = [];
        let current = '';
        let depth = 0;
        
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            
            if (char === '<' || char === '(' || char === '[') {
                depth++;
            } else if (char === '>' || char === ')' || char === ']') {
                depth--;
            } else if (char === delimiter && depth === 0) {
                result.push(current);
                current = '';
                continue;
            }
            
            current += char;
        }
        
        if (current) {
            result.push(current);
        }
        
        return result;
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
                // Get method definition from the first reference (if available)
                const methodDef = (method as any).methodDefinition;
                
                report += `### ${method.contextDescription}\n\n`;
                
                // Add method signature and parameters if available
                if (methodDef && methodDef.lineText) {
                    report += `**Method Signature:**\n`;
                    report += `\`\`\`apex\n${methodDef.lineText.trim()}\n\`\`\`\n\n`;
                    
                    // Add return type
                    if (methodDef.returnType) {
                        report += `**Return Type:** \`${methodDef.returnType}\`\n\n`;
                    }
                    
                    // Add parameter details if available
                    if (methodDef.parsedParameters && methodDef.parsedParameters.length > 0) {
                        report += `**Parameters:**\n`;
                        methodDef.parsedParameters.forEach((param: MethodParameter, paramIndex: number) => {
                            report += `${paramIndex + 1}. **${param.name}** (\`${param.type}\`)\n`;
                        });
                        report += `\n`;
                    } else {
                        report += `**Parameters:** None\n\n`;
                    }
                }
                
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

    /**
     * Finds ALL @AuraEnabled methods regardless of whether they have LWC references
     */
    public static async findAllAuraEnabledMethods(): Promise<Map<string, AuraEnabledMethod[]>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const methodsByClass = new Map<string, AuraEnabledMethod[]>();
        
        // Find all @AuraEnabled methods
        const auraEnabledMethods = await this.scanAuraEnabledMethods();
        
        // Group methods by class and deduplicate
        for (const method of auraEnabledMethods) {
            if (!methodsByClass.has(method.className)) {
                methodsByClass.set(method.className, []);
            }
            
            const classMethods = methodsByClass.get(method.className)!;
            
            // Check for duplicates based on method name and parameters
            const isDuplicate = classMethods.some(existingMethod => 
                existingMethod.methodName === method.methodName &&
                existingMethod.parameters === method.parameters
            );
            
            if (!isDuplicate) {
                classMethods.push(method);
            }
        }
        
        return methodsByClass;
    }

    /**
     * Exports @AuraEnabled methods list in the format: CLASS.METHOD | Parameters
     * This includes ALL @AuraEnabled methods, not just those with LWC references
     */
    public static async exportMethodsList(): Promise<void> {
        try {
            OrgUtils.logDebug('[VisbalExt.AuraEnabledService] exportMethodsList -- Starting export');
            
            // Get ALL @AuraEnabled methods (not just those with references)
            const allMethodsByClass = await this.findAllAuraEnabledMethods();
            
            if (allMethodsByClass.size === 0) {
                vscode.window.showInformationMessage('No @AuraEnabled methods found to export');
                return;
            }

            // Generate the export content
            let exportContent = '';
            const exportedEntries = new Set<string>(); // Track exported entries to prevent duplicates
            
            // Sort classes by name
            const sortedClasses = Array.from(allMethodsByClass.entries()).sort(([a], [b]) => a.localeCompare(b));
            
            for (const [className, methods] of sortedClasses) {
                // Sort methods by name
                const sortedMethods = methods.sort((a, b) => a.methodName.localeCompare(b.methodName));
                
                for (const method of sortedMethods) {
                    let parametersStr = '';
                    
                    if (method.parsedParameters && method.parsedParameters.length > 0) {
                        parametersStr = method.parsedParameters
                            .map((param: MethodParameter) => `${param.type} ${param.name}`)
                            .join(', ');
                    }
                    
                    const exportLine = `${className}.${method.methodName} | ${parametersStr}`;
                    
                    // Only add if not already exported (final deduplication)
                    if (!exportedEntries.has(exportLine)) {
                        exportedEntries.add(exportLine);
                        exportContent += exportLine + '\n';
                    }
                }
            }
            
            // Get workspace folder path
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }
            
            const workspacePath = workspaceFolders[0].uri.fsPath;
            
            // Create .visbal/logs directory if it doesn't exist
            const visbalLogsDir = path.join(workspacePath, '.visbal', 'logs');
            if (!fs.existsSync(visbalLogsDir)) {
                await fs.promises.mkdir(visbalLogsDir, { recursive: true });
                OrgUtils.logDebug('[VisbalExt.AuraEnabledService] exportMethodsList -- Created .visbal/logs directory');
            }
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
            const dateStr = timestamp[0];
            const timeStr = timestamp[1].split('-').slice(0, 3).join('-'); // HH-MM-SS
            const filename = `aura-enabled-methods-${dateStr}-${timeStr}.txt`;
            const filePath = path.join(visbalLogsDir, filename);
            
            // Write the file
            await fs.promises.writeFile(filePath, exportContent, 'utf8');
            
            // Open the file in Cursor IDE
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
            
            vscode.window.showInformationMessage(`@AuraEnabled methods list exported to .visbal/logs/${filename}`);
            OrgUtils.logDebug('[VisbalExt.AuraEnabledService] exportMethodsList -- Export completed successfully');
            
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            OrgUtils.logError('[VisbalExt.AuraEnabledService] exportMethodsList -- Error exporting methods list:', error);
            vscode.window.showErrorMessage(`Failed to export @AuraEnabled methods list: ${errorMessage}`);
        }
    }
}
