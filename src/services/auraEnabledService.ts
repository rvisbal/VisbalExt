import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReferenceLocation, SymbolReference } from './referencesService';

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
 * Service for finding @AuraEnabled methods and their LWC references
 */
export class AuraEnabledService {
    
    /**
     * Finds all @AuraEnabled methods in Apex classes and their references in LWC files
     */
    public static async findAuraEnabledMethods(): Promise<SymbolReference[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const results: SymbolReference[] = [];
        
        // Find all @AuraEnabled methods
        const auraEnabledMethods = await this.scanAuraEnabledMethods();
        
        // For each method, find references in LWC files
        for (const method of auraEnabledMethods) {
            const references = await this.findLWCReferences(method);
            
            if (references.length > 0) {
                const symbolReference: SymbolReference = {
                    symbol: method.methodName,
                    type: '@AuraEnabled Method',
                    className: method.className,
                    contextDescription: `${method.className}.${method.methodName}`,
                    references: references
                };
                
                results.push(symbolReference);
            }
        }
        
        return results;
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
            console.log(`[AuraEnabledService] Classes directory not found: ${classesPath}`);
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
                console.error(`[AuraEnabledService] Error reading class file ${filePath}:`, error);
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
            console.log(`[AuraEnabledService] LWC directory not found: ${lwcPath}`);
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
        const symbolReferences = await this.findAuraEnabledMethods();
        
        let report = `# @AuraEnabled Methods Report\n\n`;
        report += `Generated on: ${new Date().toLocaleString()}\n`;
        report += `Total @AuraEnabled methods with LWC references: ${symbolReferences.length}\n\n`;
        
        if (symbolReferences.length === 0) {
            report += `No @AuraEnabled methods found that are referenced by Lightning Web Components.\n`;
            return report;
        }
        
        symbolReferences.forEach((symbolRef, index) => {
            report += `## ${index + 1}. ${symbolRef.contextDescription}\n\n`;
            report += `**References (${symbolRef.references.length}):**\n`;
            
            symbolRef.references.forEach(ref => {
                report += `- ${ref.fileName}:${ref.position.line + 1} - ${ref.lineText.trim()}\n`;
            });
            
            report += `\n`;
        });
        
        return report;
    }
}
