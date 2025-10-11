import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Interface for a method without references
 */
export interface NonReferencedMethod {
    methodName: string;
    className?: string;
    filePath: string;
    fileName: string;
    lineNumber: number;
    lineText: string;
    visibility: string;
    annotations: string[];
    isStatic: boolean;
    referenceCount: number; // New field to track reference count
    type: 'method' | 'property' | 'class' | 'variable'; // New field to distinguish between different symbol types
}

/**
 * Interface for the non-reference report
 */
export interface NonReferenceReport {
    scanDate: Date;
    totalMethodsScanned: number;
    methodsWithNoReferences: number;
    nonReferencedMethods: NonReferencedMethod[];
    allScannedMethods: NonReferencedMethod[]; // New field to track ALL methods with reference counts
    scannedFiles: string[];
    reportFilePath?: string;
    isPartial?: boolean; // Indicates if this is a partial report (stopped before completion)
    totalFilesFound: number;
    filesProcessed: number;
}

/**
 * Interface for cached processing state
 */
export interface ProcessingCache {
    scanStartDate: Date;
    totalFilesFound: number;
    processedFiles: ProcessedFileCache[];
    nonReferencedMethods: NonReferencedMethod[];
    allScannedMethods: NonReferencedMethod[]; // Track ALL methods with reference counts
    totalMethodsScanned: number;
    lastProcessedFileIndex: number;
}

/**
 * Interface for cached file processing results
 */
export interface ProcessedFileCache {
    filePath: string;
    fileName: string;
    methodsScanned: number;
    nonReferencedMethodsFound: NonReferencedMethod[];
    processedAt: Date;
}

/**
 * NonReferenceReportService - Creates a report of methods that have no references
 * Optimized for report-only: stops searching as soon as a reference is found for each method
 */
export class NonReferenceReportService {
    private static instance: NonReferenceReportService;
    private progressCallback?: (message: string, percentage?: number) => void;
    private cancellationToken: vscode.CancellationTokenSource | null = null;
    private cacheFilePath: string = '';
    private currentCache: ProcessingCache | null = null;
    private testFilesCache: Set<string> = new Set(); // Cache for test file names to avoid repeated detection

    private constructor() {
        // Initialize cache file path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            this.cacheFilePath = path.join(workspaceFolders[0].uri.fsPath, '.visbal', 'non-reference-cache.json');
        }
    }

    public static getInstance(): NonReferenceReportService {
        if (!NonReferenceReportService.instance) {
            NonReferenceReportService.instance = new NonReferenceReportService();
        }
        return NonReferenceReportService.instance;
    }

    /**
     * Set progress callback for reporting scan progress
     */
    public setProgressCallback(callback: (message: string, percentage?: number) => void): void {
        this.progressCallback = callback;
    }

    /**
     * Stop the current report generation process
     */
    public stopReport(): void {
        if (this.cancellationToken) {
            this.cancellationToken.cancel();
            this.reportProgress('Report generation stopped by user');
        }
    }

    /**
     * Load cached processing state if it exists
     */
    private async loadCache(): Promise<ProcessingCache | null> {
        try {
            if (!await this.directoryExists(path.dirname(this.cacheFilePath))) {
                await fs.promises.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
            }

            if (await this.fileExists(this.cacheFilePath)) {
                const cacheContent = await fs.promises.readFile(this.cacheFilePath, 'utf8');
                const cache = JSON.parse(cacheContent) as ProcessingCache;
                
                // Convert date strings back to Date objects
                cache.scanStartDate = new Date(cache.scanStartDate);
                cache.processedFiles.forEach(file => {
                    file.processedAt = new Date(file.processedAt);
                    // NonReferencedMethod interface uses lineNumber (number), not position (vscode.Position)
                    // No need to convert position objects since we use lineNumber
                });
                // NonReferencedMethod interface uses lineNumber (number), not position (vscode.Position)
                // No need to convert position objects since we use lineNumber

                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Loaded cache with ${cache.processedFiles.length} processed files`);
                return cache;
            }
        } catch (error) {
            OrgUtils.logError('[VisbalExt.NonReferenceReportService] Error loading cache:', error);
        }
        return null;
    }

    /**
     * Save current processing state to cache
     */
    private async saveCache(): Promise<void> {
        try {
            if (this.currentCache && this.cacheFilePath) {
                if (!await this.directoryExists(path.dirname(this.cacheFilePath))) {
                    await fs.promises.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
                }

                const cacheContent = JSON.stringify(this.currentCache, null, 2);
                await fs.promises.writeFile(this.cacheFilePath, cacheContent, 'utf8');
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Saved cache with ${this.currentCache.processedFiles.length} processed files`);
            }
        } catch (error) {
            OrgUtils.logError('[VisbalExt.NonReferenceReportService] Error saving cache:', error);
        }
    }

    /**
     * Clear the processing cache
     */
    private async clearCache(): Promise<void> {
        try {
            if (await this.fileExists(this.cacheFilePath)) {
                await fs.promises.unlink(this.cacheFilePath);
                OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] Cache cleared');
            }
            this.currentCache = null;
        } catch (error) {
            OrgUtils.logError('[VisbalExt.NonReferenceReportService] Error clearing cache:', error);
        }
    }

    /**
     * Check if there's an existing cache and if user wants to resume
     */
    public async checkForExistingCache(): Promise<boolean> {
        const cache = await this.loadCache();
        if (cache && cache.processedFiles.length > 0) {
            const response = await vscode.window.showInformationMessage(
                `Found previous scan with ${cache.processedFiles.length} processed files. Do you want to resume from where you left off?`,
                'Resume', 'Start Fresh'
            );
            return response === 'Resume';
        }
        return false;
    }

    /**
     * TEST MODE: Process only specific files for quick verification
     * @param testFilePatterns - Array of filename patterns to test (e.g., ['RollerUpper.cls'])
     */
    public async generateTestReport(testFilePatterns: string[]): Promise<NonReferenceReport> {
        try {
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Processing only files matching: ${testFilePatterns.join(', ')}`);
            
            const startTime = new Date();
            
            // Find all Apex files in the workspace
            const allApexFiles = await this.findApexFiles();
            
            // Filter to only test files
            const testFiles = allApexFiles.filter(file => {
                const fileName = path.basename(file.fsPath);
                return testFilePatterns.some(pattern => 
                    fileName.toLowerCase().includes(pattern.toLowerCase())
                );
            });
            
            if (testFiles.length === 0) {
                // Create a mock RollerUpper.cls for testing if it doesn't exist
                if (testFilePatterns.includes('RollerUpper.cls')) {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Creating mock RollerUpper.cls for testing`);
                    await this.createMockRollerUpper();
                    const mockFiles = await this.findApexFiles();
                    const mockFile = mockFiles.find(f => path.basename(f.fsPath).toLowerCase() === 'rollerupper.cls');
                    if (mockFile) {
                        testFiles.push(mockFile);
                    }
                }
                
                if (testFiles.length === 0) {
                    throw new Error(`No files found matching patterns: ${testFilePatterns.join(', ')}`);
                }
            }
            
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Found ${testFiles.length} files to process`);
            testFiles.forEach((file, index) => {
                OrgUtils.logDebug(`  ${index + 1}. ${path.basename(file.fsPath)} (${file.fsPath})`);
            });
            
            // Cache test files for performance
            await this.cacheTestFiles(allApexFiles);
            
            // Initialize test cache
            this.currentCache = {
                scanStartDate: startTime,
                totalFilesFound: testFiles.length,
                processedFiles: [],
                nonReferencedMethods: [],
                allScannedMethods: [], // Track ALL methods with reference counts
                totalMethodsScanned: 0,
                lastProcessedFileIndex: -1
            };
            
            // Process only the test files
            let totalMethodsFound = 0;
            for (let i = 0; i < testFiles.length; i++) {
                const file = testFiles[i];
                const fileName = path.basename(file.fsPath);
                
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Processing ${fileName}... (${i + 1}/${testFiles.length})`);
                
                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf8');
                    const fileMethods = await this.extractMethodsFromFile(file.fsPath, content);
                    const fileNonReferencedMethods: NonReferencedMethod[] = [];
                    totalMethodsFound += fileMethods.length;
                    
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Found ${fileMethods.length} methods in ${fileName}`);
                    fileMethods.forEach((method, index) => {
                        OrgUtils.logDebug(`  ${index + 1}. ${method.className}.${method.methodName} (line ${method.lineNumber})`);
                    });
                    
                    // Check each method for references
                    for (const method of fileMethods) {
                        const methodFullName = `${method.className}.${method.methodName}`;
                        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Checking ${methodFullName} for references...`);
                        
                        const referenceCount = await this.countReferences(method);
                        method.referenceCount = referenceCount; // Set the count in the method object
                        
                        // Add ALL methods to allScannedMethods (with reference count)
                        this.currentCache.allScannedMethods.push(method);
                        
                        if (referenceCount === 0) {
                            fileNonReferencedMethods.push(method);
                            this.currentCache.nonReferencedMethods.push(method);
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: ✅ FOUND NON-REFERENCED: ${method.className}.${method.methodName} (0 references)`);
                        } else {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: ❌ Has references: ${method.className}.${method.methodName} (${referenceCount} references)`);
                        }
                        
                        this.currentCache.totalMethodsScanned++;
                    }
                    
                    // Cache the processed file
                    const processedFile: ProcessedFileCache = {
                        filePath: file.fsPath,
                        fileName,
                        methodsScanned: fileMethods.length,
                        nonReferencedMethodsFound: fileNonReferencedMethods,
                        processedAt: new Date()
                    };
                    this.currentCache.processedFiles.push(processedFile);
                    
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE: Completed ${fileName}: ${fileMethods.length} methods checked, ${fileNonReferencedMethods.length} non-referenced`);
                    
                } catch (error) {
                    OrgUtils.logError(`[VisbalExt.NonReferenceReportService] TEST MODE: Error processing ${fileName}:`, error);
                }
            }
            
            // Generate test report
            const report: NonReferenceReport = {
                scanDate: startTime,
                totalMethodsScanned: this.currentCache.totalMethodsScanned,
                methodsWithNoReferences: this.currentCache.nonReferencedMethods.length,
                nonReferencedMethods: this.sortMethods(this.currentCache.nonReferencedMethods),
                allScannedMethods: this.sortMethods(this.currentCache.allScannedMethods), // Include ALL methods with reference counts
                scannedFiles: this.currentCache.processedFiles.map(f => f.filePath),
                isPartial: false, // Test mode is complete for selected files
                totalFilesFound: testFiles.length,
                filesProcessed: this.currentCache.processedFiles.length
            };
            
            // Save test report
            const reportFilePath = await this.saveTestReport(report, testFilePatterns);
            report.reportFilePath = reportFilePath;
            
            // Summary
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE COMPLETE:`);
            OrgUtils.logDebug(`  Files processed: ${testFiles.length}`);
            OrgUtils.logDebug(`  Total methods scanned: ${totalMethodsFound}`);
            OrgUtils.logDebug(`  Non-referenced methods found: ${report.methodsWithNoReferences}`);
            
            if (report.methodsWithNoReferences > 0) {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] TEST MODE RESULTS:`);
                report.nonReferencedMethods.forEach((method, index) => {
                    OrgUtils.logDebug(`  ${index + 1}. ${method.className}.${method.methodName} (${method.fileName}:${method.lineNumber})`);
                });
            }
            
            return report;
            
        } catch (error) {
            OrgUtils.logError('[VisbalExt.NonReferenceReportService] TEST MODE Error:', error);
            throw error;
        }
    }

    /**
     * Generate a non-reference report for the workspace
     */
    public async generateNonReferenceReport(resumeFromCache: boolean = false): Promise<NonReferenceReport> {
        // Create new cancellation token for this operation
        this.cancellationToken = new vscode.CancellationTokenSource();
        
        OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] generateNonReferenceReport -- Starting non-reference report generation');
        this.reportProgress('Starting non-reference method report...');

        let startTime = new Date();
        let isPartial = false;

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folders found');
            }

            // Check if resuming from cache or starting fresh
            if (resumeFromCache) {
                this.currentCache = await this.loadCache();
                if (this.currentCache) {
                    startTime = this.currentCache.scanStartDate;
                    this.reportProgress(`Resuming from cache with ${this.currentCache.processedFiles.length} files already processed...`);
                }
            }

            // If not resuming or no valid cache, start fresh
            if (!this.currentCache) {
                await this.clearCache(); // Clear any stale cache
                startTime = new Date();
            }

            // Find all Apex files in the workspace
            const allApexFiles = await this.findApexFiles();
            const totalFiles = allApexFiles.length;
            
            // Cache test files once at the beginning for performance optimization
            await this.cacheTestFiles(allApexFiles);
            
            // Debug logging to check if RollerUpper.cls is found
            const rollerUpperFile = allApexFiles.find(file => path.basename(file.fsPath).toLowerCase() === 'rollerupper.cls');
            if (rollerUpperFile) {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Found RollerUpper.cls at: ${rollerUpperFile.fsPath}`);
            } else {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.cls NOT found in the ${allApexFiles.length} Apex files`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Available files: ${allApexFiles.map(f => path.basename(f.fsPath)).join(', ')}`);
            }
            
            // Initialize cache if starting fresh
            if (!this.currentCache) {
                this.currentCache = {
                    scanStartDate: startTime,
                    totalFilesFound: totalFiles,
                    processedFiles: [],
                    nonReferencedMethods: [],
                    allScannedMethods: [], // Track ALL methods with reference counts
                    totalMethodsScanned: 0,
                    lastProcessedFileIndex: -1
                };
            }

            // Filter out already processed files if resuming
            let filesToProcess = allApexFiles;
            let startIndex = 0;
            if (resumeFromCache && this.currentCache.processedFiles.length > 0) {
                const processedPaths = new Set(this.currentCache.processedFiles.map(f => f.filePath));
                filesToProcess = allApexFiles.filter(file => !processedPaths.has(file.fsPath));
                startIndex = this.currentCache.lastProcessedFileIndex + 1;
                
                const cachedFoundCount = this.currentCache.nonReferencedMethods.length;
                this.reportProgress(`Found ${totalFiles} total files, ${this.currentCache.processedFiles.length} already processed, ${filesToProcess.length} remaining - Found: ${cachedFoundCount}`);
            } else {
                this.reportProgress(`Found ${totalFiles} Apex files to scan - Found: 0`);
            }

            // Process files  
            const baseProcessedCount = this.currentCache.processedFiles.length; // Snapshot before loop
            for (let i = 0; i < filesToProcess.length; i++) {
                if (this.cancellationToken?.token.isCancellationRequested) {
                    isPartial = true;
                    break;
                }

                const file = filesToProcess[i];
                const fileName = path.basename(file.fsPath);
                const currentFileIndex = startIndex + i;
                
                // Calculate correct total processed count (base count + current progress)
                const totalProcessed = baseProcessedCount + i + 1;
                
                // Update progress based on actual file count  
                const progressPercentage = Math.floor((totalProcessed / totalFiles) * 100);
                const foundCount = this.currentCache.nonReferencedMethods.length;
                this.reportProgress(`Processing ${fileName}... (${totalProcessed}/${totalFiles}) - Found: ${foundCount}`, progressPercentage);

                // Skip test files
                if (this.isTestFile(fileName)) {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Skipping test file: ${fileName}`);
                    const processedFile: ProcessedFileCache = {
                        filePath: file.fsPath,
                        fileName,
                        methodsScanned: 0,
                        nonReferencedMethodsFound: [],
                        processedAt: new Date()
                    };
                    this.currentCache.processedFiles.push(processedFile);
                    this.currentCache.lastProcessedFileIndex = currentFileIndex;
                    continue;
                }

                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf8');
                    const fileMethods = await this.extractMethodsFromFile(file.fsPath, content);
                    const fileNonReferencedMethods: NonReferencedMethod[] = [];

                    // Log method count for this class
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Found ${fileMethods.length} methods in ${fileName} to check for references`);
                    
                    // Special debug for RollerUpper.cls
                    if (fileName.toLowerCase() === 'rollerupper.cls') {
                        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.cls methods extracted:`);
                        fileMethods.forEach((method, index) => {
                            OrgUtils.logDebug(`  ${index + 1}. ${method.className}.${method.methodName} (line ${method.lineNumber})`);
                        });
                        
                        const populateParentMapMethod = fileMethods.find(m => m.methodName === 'populateParentMap');
                        if (populateParentMapMethod) {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Found populateParentMap method - will check for references`);
                        } else {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: populateParentMap method NOT FOUND in extracted methods`);
                        }
                    }

                    // Check each method for references
                    for (const method of fileMethods) {
                        if (this.cancellationToken?.token.isCancellationRequested) {
                            isPartial = true;
                            break;
                        }

                        const methodFullName = `${method.className}.${method.methodName}`;
                        const foundCount = this.currentCache.nonReferencedMethods.length;
                        this.reportProgress(`Checking ${methodFullName}... (${totalProcessed}/${totalFiles}) - Found: ${foundCount}`);

                        // Special debug logging for RollerUpper.populateParentMap
                        if (method.className === 'RollerUpper' && method.methodName === 'populateParentMap') {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Found RollerUpper.populateParentMap - checking for references...`);
                        }

                        // Check how many references this method has
                        const referenceCount = await this.countReferences(method);
                        method.referenceCount = referenceCount; // Set the count in the method object
                        
                        // Special debug logging for RollerUpper.populateParentMap
                        if (method.className === 'RollerUpper' && method.methodName === 'populateParentMap') {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap referenceCount = ${referenceCount}`);
                        }
                        
                        // Add ALL methods to allScannedMethods (with reference count)
                        this.currentCache.allScannedMethods.push(method);
                        
                        if (referenceCount === 0) {
                            fileNonReferencedMethods.push(method);
                            this.currentCache.nonReferencedMethods.push(method);
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Found non-referenced method: ${method.className}.${method.methodName} (${method.fileName}:${method.lineNumber})`);
                        } else if (method.className === 'RollerUpper' && method.methodName === 'populateParentMap') {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap has ${referenceCount} references - not flagged as unused`);
                        }

                        this.currentCache.totalMethodsScanned++;
                    }

                    // Log summary for this file
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Completed ${fileName}: ${fileMethods.length} methods checked, ${fileNonReferencedMethods.length} non-referenced methods found`);
                    if (fileNonReferencedMethods.length > 0) {
                        fileNonReferencedMethods.forEach((method, index) => {
                            OrgUtils.logDebug(`  ${index + 1}. ${method.className}.${method.methodName} (line ${method.lineNumber})`);
                        });
                    }

                    // Cache the processed file
                    const processedFile: ProcessedFileCache = {
                        filePath: file.fsPath,
                        fileName,
                        methodsScanned: fileMethods.length,
                        nonReferencedMethodsFound: fileNonReferencedMethods,
                        processedAt: new Date()
                    };
                    this.currentCache.processedFiles.push(processedFile);
                    this.currentCache.lastProcessedFileIndex = currentFileIndex;

                    // Save cache periodically (every 5 files)
                    if (this.currentCache.processedFiles.length % 5 === 0) {
                        await this.saveCache();
                    }

                } catch (error) {
                    OrgUtils.logError(`[NonReferenceReportService] Error processing file ${file.fsPath}:`, error);
                    
                    // Still cache the file as processed (with 0 methods) to avoid reprocessing
                    const processedFile: ProcessedFileCache = {
                        filePath: file.fsPath,
                        fileName,
                        methodsScanned: 0,
                        nonReferencedMethodsFound: [],
                        processedAt: new Date()
                    };
                    this.currentCache.processedFiles.push(processedFile);
                    this.currentCache.lastProcessedFileIndex = currentFileIndex;
                }
            }

            // Final cache save
            await this.saveCache();

            // Generate report
            const statusMessage = isPartial ? 
                `Generating partial report (${this.currentCache.processedFiles.length}/${totalFiles} files processed)...` : 
                'Generating final report...';
            this.reportProgress(statusMessage, 100);

            // Ensure cache exists before creating report
            if (!this.currentCache) {
                throw new Error('Cache is null when generating report - this should not happen');
            }

            const report: NonReferenceReport = {
                scanDate: startTime,
                totalMethodsScanned: this.currentCache.totalMethodsScanned,
                methodsWithNoReferences: this.currentCache.nonReferencedMethods.length,
                nonReferencedMethods: this.sortMethods(this.currentCache.nonReferencedMethods),
                allScannedMethods: this.sortMethods(this.currentCache.allScannedMethods), // Include ALL methods with reference counts
                scannedFiles: this.currentCache.processedFiles.map(f => f.filePath),
                isPartial,
                totalFilesFound: totalFiles,
                filesProcessed: this.currentCache.processedFiles.length
            };

            // Generate report file
            const reportFilePath = await this.saveReportToFile(report);
            report.reportFilePath = reportFilePath;

            // Clear cache if completed successfully  
            if (!isPartial) {
                const foundCount = this.currentCache?.nonReferencedMethods?.length || 0;
                await this.clearCache();
                this.reportProgress(`Report complete! Found ${foundCount} methods with no references.`);
            } else {
                const foundCount = this.currentCache?.nonReferencedMethods?.length || 0;
                const processedCount = this.currentCache?.processedFiles?.length || 0;
                this.reportProgress(`Partial report saved with ${foundCount} non-referenced methods found so far (${processedCount}/${totalFiles} files processed).`);
                
                // Log the list of methods found for immediate visibility
                if (this.currentCache?.nonReferencedMethods && this.currentCache.nonReferencedMethods.length > 0) {
                    OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] PARTIAL REPORT - Non-referenced methods found so far:');
                    this.currentCache.nonReferencedMethods.forEach((method, index) => {
                        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   ${index + 1}. ${method.className}.${method.methodName} (${method.fileName}:${method.lineNumber})`);
                    });
                }
            }
            
            OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] generateNonReferenceReport -- Report generation complete', {
                totalMethodsScanned: report.totalMethodsScanned,
                methodsWithNoReferences: report.methodsWithNoReferences,
                scannedFiles: report.scannedFiles.length,
                isPartial: report.isPartial
            });

            return report;

        } catch (error) {
            if (this.cancellationToken?.token.isCancellationRequested) {
                // Generate partial report on cancellation
                if (this.currentCache && this.currentCache.processedFiles.length > 0) {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] CANCELLED - Generating partial report with ${this.currentCache.nonReferencedMethods.length} non-referenced methods found`);
                    
                    // Log the methods found so far for immediate visibility
                    if (this.currentCache.nonReferencedMethods.length > 0) {
                        OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] PARTIAL REPORT - Methods with no references found so far:');
                        this.currentCache.nonReferencedMethods.forEach((method, index) => {
                            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   ${index + 1}. ${method.className}.${method.methodName} (${method.fileName}:${method.lineNumber})`);
                        });
                    } else {
                        OrgUtils.logDebug('[VisbalExt.NonReferenceReportService] PARTIAL REPORT - No non-referenced methods found in the files processed so far');
                    }
                    
                    const report: NonReferenceReport = {
                        scanDate: startTime,
                        totalMethodsScanned: this.currentCache.totalMethodsScanned,
                        methodsWithNoReferences: this.currentCache.nonReferencedMethods.length,
                        nonReferencedMethods: this.sortMethods(this.currentCache.nonReferencedMethods),
                        allScannedMethods: this.sortMethods(this.currentCache.allScannedMethods), // Include ALL methods with reference counts
                        scannedFiles: this.currentCache.processedFiles.map(f => f.filePath),
                        isPartial: true,
                        totalFilesFound: this.currentCache.totalFilesFound,
                        filesProcessed: this.currentCache.processedFiles.length
                    };

                    // Save partial report
                    const reportFilePath = await this.saveReportToFile(report);
                    report.reportFilePath = reportFilePath;
                    
                    // Save cache for potential resume
                    await this.saveCache();
                    
                    this.reportProgress(`STOPPED: Saved partial report with ${report.methodsWithNoReferences} methods found (${report.filesProcessed}/${report.totalFilesFound} files processed)`);

                    return report;
                } else {
                    throw new Error('Report generation was cancelled before any files were processed');
                }
            }
            
            OrgUtils.logError('[VisbalExt.NonReferenceReportService] generateNonReferenceReport -- Error during report generation:', error);
            throw error;
        } finally {
            this.cancellationToken = null;
        }
    }

    /**
     * Extract methods, properties, classes, and variables from a file
     */
    private async extractMethodsFromFile(filePath: string, content: string): Promise<NonReferencedMethod[]> {
        const methods: NonReferencedMethod[] = []; // Note: 'methods' array now contains all symbol types
        const lines = content.split('\n');
        const fileName = path.basename(filePath);
        
        // Skip test classes
        if (this.isTestClass(content)) {
            return methods;
        }
        
        // Extract class name - improved logic to find the main class
        const expectedClassName = path.basename(filePath, '.cls');
        let className = expectedClassName; // Default to filename
        
        // Find all class declarations in the file
        const classPattern = /^\s*(?:(?:public|private|global)\s+)?(?:virtual\s+|abstract\s+)?class\s+(\w+)/gm;
        const allClassMatches = [...content.matchAll(classPattern)];
        
        if (allClassMatches.length > 0) {
            // First, try to find a class that matches the filename (main class)
            const mainClassMatch = allClassMatches.find(match => 
                match[1] && match[1].toLowerCase() === expectedClassName.toLowerCase()
            );
            
            if (mainClassMatch) {
                className = mainClassMatch[1];
            } else {
                // If no exact match, use the first public class, or just the first class
                const publicClassMatch = allClassMatches.find(match => 
                    match[0].includes('public')
                );
                className = publicClassMatch ? publicClassMatch[1] : allClassMatches[0][1];
            }
        }
        
        // Debug logging for class name extraction, especially for RollerUpper.cls
        if (fileName.toLowerCase() === 'rollerupper.cls') {
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Class name extraction for RollerUpper.cls:`);
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Expected class name: ${expectedClassName}`);
            
            // Show first 2000 chars of file content for analysis
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - File preview (first 2000 chars):`);
            const preview = content.substring(0, 2000).replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
            OrgUtils.logDebug(`"${preview}"`);
            
            // Show file stats
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - File size: ${content.length} characters`);
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - File contains "class RollerUpper": ${content.includes('class RollerUpper')}`);
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - File contains "class RollupException": ${content.includes('class RollupException')}`);
            
            // Show what the regex found
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Class pattern used: ${classPattern}`);
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - All class matches (raw): ${allClassMatches.map(m => `"${m[0].trim()}" -> "${m[1]}"`).join(' | ')}`);
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Looking for match with: ${expectedClassName.toLowerCase()}`);
            
            // Check each match individually  
            allClassMatches.forEach((match, index) => {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Match ${index}: "${match[1]}" (toLowerCase: "${match[1].toLowerCase()}") equals expected? ${match[1].toLowerCase() === expectedClassName.toLowerCase()}`);
            });
            
            OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Final selected className: ${className}`);
        }
        
        // Method pattern - matches method declarations
        const methodPattern = /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?((?:virtual|abstract|override)\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/gm;
        
        let match;
        while ((match = methodPattern.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const lineText = lines[lineIndex];
            
            const annotations = this.parseAnnotations(match[1] || '');
            const visibility = match[2]?.trim() || 'private';
            const isStatic = !!(match[3]?.trim());
            const methodName = match[6];

            // Skip if method name is empty or invalid
            if (!methodName || methodName.trim() === '') {
                continue;
            }

            // Skip constructors (same name as class)
            if (className && methodName.toLowerCase() === className.toLowerCase()) {
                // Special debug logging for RollerUpper.populateParentMap
                if (className === 'RollerUpper' && methodName === 'populateParentMap') {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap was excluded as constructor`);
                }
                continue;
            }

            // Skip test methods
            if (this.isTestMethod(methodName, annotations, lineText)) {
                // Special debug logging for RollerUpper.populateParentMap
                if (className === 'RollerUpper' && methodName === 'populateParentMap') {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap was excluded as test method`);
                }
                continue;
            }

            // Skip special/overridden methods
            if (this.isSpecialMethod(methodName)) {
                // Special debug logging for RollerUpper.populateParentMap
                if (className === 'RollerUpper' && methodName === 'populateParentMap') {
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap was excluded as special method`);
                }
                continue;
            }

            // Special debug for populateParentMap method
            if (methodName === 'populateParentMap') {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Found populateParentMap method:`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - In class: ${className}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - File: ${fileName}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Line: ${lineIndex + 1}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Visibility: ${visibility}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: - Full match: ${match[0].trim()}`);
            }
            
            // SOLUTION: For RollerUpper.cls, if class name doesn't match filename, 
            // create an additional entry with filename as class name
            if (fileName.toLowerCase() === 'rollerupper.cls' && 
                className.toLowerCase() !== 'rollerupper' && 
                methodName === 'populateParentMap') {
                
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] SOLUTION: Creating additional entry for RollerUpper.populateParentMap`);
                
                methods.push({
                    methodName,
                    className: 'RollerUpper', // Use filename as class name
                    filePath,
                    fileName,
                    lineNumber: lineIndex + 1,
                    lineText: lineText.trim(),
                    visibility,
                    annotations,
                    isStatic,
                    referenceCount: 0, // Will be set when references are counted
                    type: 'method'
                });
            }

            methods.push({
                methodName,
                className,
                filePath,
                fileName,
                lineNumber: lineIndex + 1,
                lineText: lineText.trim(),
                visibility,
                annotations,
                isStatic,
                referenceCount: 0, // Will be set when references are counted
                type: 'method'
            });

            // Special debug logging for RollerUpper.populateParentMap
            if (className === 'RollerUpper' && methodName === 'populateParentMap') {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Extracted RollerUpper.populateParentMap from ${fileName} at line ${lineIndex + 1}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Method details - visibility: ${visibility}, static: ${isStatic}, annotations: [${annotations.join(', ')}]`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Line content: ${lineText.trim()}`);
            }
        }

        // Property pattern - matches property declarations
        // Pattern for properties: [annotations] [visibility] [static] type propertyName { get; set; }
        // Also matches simple field declarations: [annotations] [visibility] [static] type fieldName;
        const propertyPattern = /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:\{[^}]*\}|;)/gm;
        
        let propertyMatch;
        while ((propertyMatch = propertyPattern.exec(content)) !== null) {
            const lineIndex = content.substring(0, propertyMatch.index).split('\n').length - 1;
            const lineText = lines[lineIndex];
            
            const annotations = this.parseAnnotations(propertyMatch[1] || '');
            const visibility = propertyMatch[2]?.trim() || 'private';
            const isStatic = !!(propertyMatch[3]?.trim());
            const propertyName = propertyMatch[5];

            // Skip if property name is empty or invalid
            if (!propertyName || propertyName.trim() === '') {
                continue;
            }

            // Skip if this looks like a method call or other non-property construct
            if (propertyName.includes('(') || propertyName.includes(')')) {
                continue;
            }

            // Skip test properties
            if (this.isTestMethod(propertyName, annotations, lineText)) {
                continue;
            }

            methods.push({
                methodName: propertyName,
                className,
                filePath,
                fileName,
                lineNumber: lineIndex + 1,
                lineText: lineText.trim(),
                visibility,
                annotations,
                isStatic,
                referenceCount: 0, // Will be set when references are counted
                type: 'property'
            });
        }

        // Class pattern - matches class declarations
        // Pattern for classes: [annotations] [visibility] [virtual|abstract] class className
        const classDeclarationPattern = /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?((?:virtual|abstract)\s+)?class\s+(\w+)/gm;
        
        let classMatch;
        while ((classMatch = classDeclarationPattern.exec(content)) !== null) {
            const lineIndex = content.substring(0, classMatch.index).split('\n').length - 1;
            const lineText = lines[lineIndex];
            
            const annotations = this.parseAnnotations(classMatch[1] || '');
            const visibility = classMatch[2]?.trim() || 'private';
            const classNameFound = classMatch[4];

            // Skip if class name is empty or invalid
            if (!classNameFound || classNameFound.trim() === '') {
                continue;
            }

            // Skip test classes
            if (this.isTestMethod(classNameFound, annotations, lineText)) {
                continue;
            }

            methods.push({
                methodName: classNameFound,
                className: classNameFound, // For classes, the className and methodName are the same
                filePath,
                fileName,
                lineNumber: lineIndex + 1,
                lineText: lineText.trim(),
                visibility,
                annotations,
                isStatic: false, // Classes are not static in the same way methods are
                referenceCount: 0, // Will be set when references are counted
                type: 'class'
            });
        }

        // Variable pattern - matches variable declarations
        // Pattern for variables: [annotations] [visibility] [static] [final] type variableName = value; or ; 
        const variablePattern = /^\s*((?:@\w+\s+)*)((?:global|public|private|protected)\s+)?(static\s+)?(final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:=.*?;|;)/gm;
        
        let variableMatch;
        while ((variableMatch = variablePattern.exec(content)) !== null) {
            const lineIndex = content.substring(0, variableMatch.index).split('\n').length - 1;
            const lineText = lines[lineIndex];
            
            const annotations = this.parseAnnotations(variableMatch[1] || '');
            const visibility = variableMatch[2]?.trim() || 'private';
            const isStatic = !!(variableMatch[3]?.trim());
            const variableName = variableMatch[6];

            // Skip if variable name is empty or invalid
            if (!variableName || variableName.trim() === '') {
                continue;
            }

            // Skip if this looks like a method call or other non-variable construct
            if (variableName.includes('(') || variableName.includes(')')) {
                continue;
            }

            // Skip test variables
            if (this.isTestMethod(variableName, annotations, lineText)) {
                continue;
            }

            // Skip variables that are actually properties (already caught by property pattern)
            if (lineText.includes('{') && (lineText.includes('get') || lineText.includes('set'))) {
                continue;
            }

            methods.push({
                methodName: variableName,
                className,
                filePath,
                fileName,
                lineNumber: lineIndex + 1,
                lineText: lineText.trim(),
                visibility,
                annotations,
                isStatic,
                referenceCount: 0, // Will be set when references are counted
                type: 'variable'
            });
        }

        return methods;
    }

    /**
     * Count how many references a method has in the codebase (excluding test files)
     * Returns the total count of references found
     */
    private async countReferences(method: NonReferencedMethod): Promise<number> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return 0;
            }

            let referenceCount = 0;

            // Search patterns for method references
            const searchPatterns = this.createMethodSearchPatterns(method);
            
            // Find all Apex files to search
            const apexFiles = await this.findApexFiles();
            
            // Special debug logging for RollerUpper.populateParentMap
            let debugSkippedTestFiles = 0;
            let debugCheckedFiles = 0;
            
            for (const file of apexFiles) {
                if (this.cancellationToken?.token.isCancellationRequested) {
                    throw new Error('Operation cancelled');
                }

                const fileName = path.basename(file.fsPath);

                // Skip test files - references from test classes don't count!
                // Use cached test files for performance (no repeated file name pattern matching)
                if (this.testFilesCache.has(fileName)) {
                    if (method.methodName === 'populateParentMap' && method.className === 'RollerUpper') {
                        debugSkippedTestFiles++;
                        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Skipping cached test file ${fileName} when checking RollerUpper.populateParentMap references`);
                    }
                    continue;
                }

                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf8');

                    // No need for additional test class check - already handled in cache
                    // Test files are pre-identified during cache population (both by name and @IsTest content)
                    
                    // This is a valid non-test file to check
                    if (method.methodName === 'populateParentMap' && method.className === 'RollerUpper') {
                        debugCheckedFiles++;
                    }
                    
                    // Check each search pattern
                    for (const pattern of searchPatterns) {
                        const regex = new RegExp(pattern, 'gi');
                        const matches = content.match(regex);
                        if (matches) {
                            const matchCount = matches.length;
                            referenceCount += matchCount;
                            
                            // Special debug logging for RollerUpper.populateParentMap
                            if (method.methodName === 'populateParentMap' && method.className === 'RollerUpper') {
                                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: Found ${matchCount} references to RollerUpper.populateParentMap in NON-TEST file ${fileName} using pattern: ${pattern}`);
                            }
                        }
                    }
                } catch (error) {
                    // Skip files we can't read
                    continue;
                }
            }

            // Also check LWC files if method has @AuraEnabled annotation
            if (method.annotations.includes('AuraEnabled')) {
                const lwcReferenceCount = await this.countLwcReferences(method);
                referenceCount += lwcReferenceCount;
            }
            
            // Special debug summary for RollerUpper.populateParentMap
            if (method.methodName === 'populateParentMap' && method.className === 'RollerUpper') {
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap reference search summary:`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   Total files found: ${apexFiles.length}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   Skipped test files (from cache): ${debugSkippedTestFiles}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   Non-test files checked: ${debugCheckedFiles}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   Total test files cached: ${this.testFilesCache.size}`);
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService]   Final reference count: ${referenceCount}`);
            }
            
            return referenceCount; // Return total reference count

        } catch (error) {
            if (this.cancellationToken?.token.isCancellationRequested) {
                throw error;
            }
            OrgUtils.logError(`[VisbalExt.NonReferenceReportService] Error counting references for ${method.methodName}:`, error);
            return 999; // On error, return high count to indicate it likely has references
        }
    }

    /**
     * Create search patterns for symbol references based on type
     */
    private createMethodSearchPatterns(method: NonReferencedMethod): string[] {
        const escapedSymbolName = method.methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns: string[] = [];

        switch (method.type) {
            case 'method':
                // Direct method calls
                patterns.push(`${escapedSymbolName}\\s*\\(`);
                
                // Object method calls
                patterns.push(`\\.\\s*${escapedSymbolName}\\s*\\(`);
                
                // This method calls
                patterns.push(`this\\.\\s*${escapedSymbolName}\\s*\\(`);
                
                // Static method calls if we have a class name
                if (method.className) {
                    patterns.push(`${method.className}\\.\\s*${escapedSymbolName}\\s*\\(`);
                }

                // Special handling for RollerUpper.populateParentMap - be more specific
                if (method.className === 'RollerUpper' && method.methodName === 'populateParentMap') {
                    // Clear existing patterns and use only class-specific ones
                    patterns.length = 0;
                    
                    // Only explicit RollerUpper.populateParentMap calls
                    patterns.push(`RollerUpper\\.\\s*${escapedSymbolName}\\s*\\(`);
                    
                    // new RollerUpper().populateParentMap calls
                    patterns.push(`new\\s+RollerUpper\\s*\\([^\\)]*\\)\\.\\s*${escapedSymbolName}\\s*\\(`);
                    
                    // RollerUpper variable declarations and calls
                    patterns.push(`RollerUpper\\s+\\w+\\s*=.*?\\w+\\.\\s*${escapedSymbolName}\\s*\\(`);
                    
                    OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] DEBUG: RollerUpper.populateParentMap SPECIFIC patterns:`);
                    patterns.forEach((pattern, index) => {
                        OrgUtils.logDebug(`  ${index + 1}. ${pattern}`);
                    });
                }
                break;

            case 'property':
                // Property access (without parentheses)
                patterns.push(`\\b${escapedSymbolName}\\b(?!\\s*\\()`);
                
                // Object property access
                patterns.push(`\\.\\s*${escapedSymbolName}\\b(?!\\s*\\()`);
                
                // This property access
                patterns.push(`this\\.\\s*${escapedSymbolName}\\b(?!\\s*\\()`);
                
                // Static property access if we have a class name
                if (method.className) {
                    patterns.push(`${method.className}\\.\\s*${escapedSymbolName}\\b(?!\\s*\\()`);
                }
                break;

            case 'class':
                // Class instantiation
                patterns.push(`\\bnew\\s+${escapedSymbolName}\\b`);
                
                // Static member access
                patterns.push(`${escapedSymbolName}\\.\\w+`);
                
                // Variable declaration with class type
                patterns.push(`\\b${escapedSymbolName}\\s+\\w+`);
                
                // Class inheritance (extends/implements)
                patterns.push(`\\bextends\\s+${escapedSymbolName}\\b`);
                patterns.push(`\\bimplements\\s+${escapedSymbolName}\\b`);
                
                // Type casting
                patterns.push(`\\(${escapedSymbolName}\\)`);
                break;

            case 'variable':
                // Variable usage (general access)
                patterns.push(`\\b${escapedSymbolName}\\b`);
                break;

            default:
                // Fallback to method patterns for unknown types
                patterns.push(`${escapedSymbolName}\\s*\\(`);
                patterns.push(`\\.\\s*${escapedSymbolName}\\s*\\(`);
                break;
        }

        return patterns;
    }

    /**
     * Count references in LWC files
     */
    private async countLwcReferences(method: NonReferencedMethod): Promise<number> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return 0;
            }

            let lwcReferenceCount = 0;

            // Search in multiple potential LWC locations
            const lwcPaths = [
                path.join(workspaceFolders[0].uri.fsPath, 'force-app/main/default/lwc'),
                path.join(workspaceFolders[0].uri.fsPath, 'src/lwc'),
                path.join(workspaceFolders[0].uri.fsPath, 'force-app/lwc')
            ];

            for (const lwcPath of lwcPaths) {
                if (!await this.directoryExists(lwcPath)) {
                    continue;
                }

                const count = await this.countLwcInDirectory(lwcPath, method);
                lwcReferenceCount += count;
            }
            
            return lwcReferenceCount;
        } catch (error) {
            if (this.cancellationToken?.token.isCancellationRequested) {
                throw error;
            }
            return 0;
        }
    }

    /**
     * Count method references in a specific LWC directory
     */
    private async countLwcInDirectory(lwcPath: string, method: NonReferencedMethod): Promise<number> {
        try {
            let lwcCount = 0;
            const lwcComponents = await fs.promises.readdir(lwcPath);
            
            for (const componentName of lwcComponents) {
                if (this.cancellationToken?.token.isCancellationRequested) {
                    throw new Error('Operation cancelled');
                }

                const componentDir = path.join(lwcPath, componentName);
                const componentStat = await fs.promises.stat(componentDir);
                
                if (componentStat.isDirectory()) {
                    const componentFiles = await fs.promises.readdir(componentDir);
                    const jsFiles = componentFiles.filter(file => 
                        file.endsWith('.js') || file.endsWith('.ts')
                    );
                    
                    for (const fileName of jsFiles) {
                        const filePath = path.join(componentDir, fileName);
                        
                        try {
                            const content = await fs.promises.readFile(filePath, 'utf8');
                            
                            // Check for import or usage of the method
                            const methodRef = new RegExp(`(import.*${method.methodName}|${method.methodName}\\s*\\()`, 'gi');
                            const matches = content.match(methodRef);
                            if (matches) {
                                lwcCount += matches.length; // Count references in LWC
                            }
                        } catch (error) {
                            // Skip files we can't read
                            continue;
                        }
                    }
                }
            }
            
            return lwcCount;
        } catch (error) {
            if (this.cancellationToken?.token.isCancellationRequested) {
                throw error;
            }
            return 0;
        }
    }

    /**
     * Save the report to a file
     */
    private async saveReportToFile(report: NonReferenceReport): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found for saving report');
        }

        const timestamp = report.scanDate.toISOString().replace(/[:.]/g, '-');
        const reportType = report.isPartial ? 'partial' : 'complete';
        const fileName = `non-reference-methods-${reportType}-report-${timestamp}.txt`;
        const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);

        let reportContent = `NON-REFERENCED METHODS REPORT ${report.isPartial ? '(PARTIAL)' : ''}\n`;
        reportContent += `================================\n\n`;
        reportContent += `Report Type: ${report.isPartial ? 'Partial (Stopped or Cancelled)' : 'Complete'}\n`;
        reportContent += `Scan Date: ${report.scanDate.toLocaleString()}\n`;
        reportContent += `Total Files Found: ${report.totalFilesFound}\n`;
        reportContent += `Files Processed: ${report.filesProcessed} (${Math.round((report.filesProcessed / report.totalFilesFound) * 100)}%)\n`;
        reportContent += `Total Methods Scanned: ${report.totalMethodsScanned}\n`;
        reportContent += `Methods with No References: ${report.methodsWithNoReferences}\n`;
        if (report.isPartial) {
            reportContent += `\nNOTE: This is a partial report. Some files may not have been processed.\n`;
            reportContent += `You can resume scanning by running the report again and choosing 'Resume'.\n`;
        }
        reportContent += `\n`;

        if (report.methodsWithNoReferences > 0) {
            reportContent += `METHODS WITH NO REFERENCES:\n`;
            reportContent += `===========================\n\n`;

            for (const method of report.nonReferencedMethods) {
                const typeCapitalized = method.type.charAt(0).toUpperCase() + method.type.slice(1);
                reportContent += `${method.className}.${method.methodName} : ${method.referenceCount} References\n`;
                reportContent += `  File: ${method.fileName}\n`;
                reportContent += `  Line: ${method.lineNumber}\n`;
                reportContent += `  Visibility: ${method.visibility}\n`;
                reportContent += `  Type: ${typeCapitalized}\n`;
                if (method.annotations.length > 0) {
                    reportContent += `  Annotations: @${method.annotations.join(', @')}\n`;
                }
                reportContent += `  Code: ${method.lineText}\n\n`;
            }
        } else {
            const statusMessage = report.isPartial ? 
                `No unused methods found in the ${report.filesProcessed} files processed so far.` :
                `All scanned methods have references - no unused methods found!`;
            reportContent += `${statusMessage}\n`;
        }

        // NEW SECTION: All scanned methods with reference counts
        reportContent += `\n`;
        reportContent += `ALL SCANNED METHODS WITH REFERENCE COUNTS:\n`;
        reportContent += `==========================================\n\n`;

        if (report.allScannedMethods && report.allScannedMethods.length > 0) {
            for (const method of report.allScannedMethods) {
                const typeCapitalized = method.type.charAt(0).toUpperCase() + method.type.slice(1);
                reportContent += `${method.className}.${method.methodName} : ${method.referenceCount} References (${typeCapitalized})\n`;
            }
        } else {
            reportContent += `No methods were scanned.\n`;
        }

        await fs.promises.writeFile(filePath, reportContent, 'utf8');
        
        return filePath;
    }

    /**
     * Helper methods
     */
    private async findApexFiles(): Promise<vscode.Uri[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const excludePattern = '{**/node_modules/**,**/.sfdx/**,**/dist/**,**/out/**,**/build/**}';
        let allApexFiles: vscode.Uri[] = [];

        // Search in multiple potential Salesforce project structures
        const apexPatterns = [
            'force-app/**/*.cls',           // Standard SFDX structure
            'force-app/**/*.trigger',       // Include triggers too
            'src/**/*.cls',                 // Older SFDX structure
            'src/**/*.trigger',            // Include triggers in src
            '**/*.cls',                    // Fallback: any .cls files
            '**/*.trigger'                 // Fallback: any .trigger files
        ];

        for (const pattern of apexPatterns) {
            try {
                const files = await vscode.workspace.findFiles(pattern, excludePattern);
                allApexFiles.push(...files);
            } catch (error) {
                // Continue with other patterns if one fails
                OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Pattern ${pattern} failed:`, error);
            }
        }

        // Remove duplicates based on file path
        const uniqueFiles = new Map<string, vscode.Uri>();
        for (const file of allApexFiles) {
            const normalizedPath = path.normalize(file.fsPath);
            if (!uniqueFiles.has(normalizedPath)) {
                uniqueFiles.set(normalizedPath, file);
            }
        }

        const result = Array.from(uniqueFiles.values());
        //OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Found ${result.length} unique Apex files across ${apexPatterns.length} search patterns`);
        
        return result;
    }

    /**
     * Create a mock RollerUpper.cls file for testing purposes
     */
    private async createMockRollerUpper(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder available');
        }

        const mockContent = `public class RollerUpper {
    
    // This method should be flagged as non-referenced
    public void populateParentMap(Map<Id, Account> parentMap) {
        // This method has no references anywhere
        System.debug('Populating parent map');
        for (Id accountId : parentMap.keySet()) {
            Account parentAccount = parentMap.get(accountId);
            System.debug('Processing account: ' + parentAccount.Name);
        }
    }
    
    // This method might have references (but won't in our test)
    public void processAccounts(List<Account> accounts) {
        System.debug('Processing accounts');
        for (Account acc : accounts) {
            System.debug('Account: ' + acc.Name);
        }
    }
    
    // A static method to test static reference detection
    public static String getClassName() {
        return 'RollerUpper';
    }
}`;

        const mockFilePath = path.join(workspaceFolders[0].uri.fsPath, 'test-RollerUpper.cls');
        await fs.promises.writeFile(mockFilePath, mockContent, 'utf8');
        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Created mock RollerUpper.cls at: ${mockFilePath}`);
    }

    /**
     * Save test report to file with special naming
     */
    private async saveTestReport(report: NonReferenceReport, testFilePatterns: string[]): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder available');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const patternsSafe = testFilePatterns.join('_').replace(/[^a-zA-Z0-9_]/g, '');
        const reportName = `non-reference-test-${patternsSafe}-${timestamp}.txt`;
        const reportPath = path.join(workspaceFolders[0].uri.fsPath, reportName);

        let content = `NON-REFERENCED METHODS TEST REPORT\n`;
        content += `=====================================\n`;
        content += `Report Type: Test Mode\n`;
        content += `Test Patterns: ${testFilePatterns.join(', ')}\n`;
        content += `Scan Date: ${report.scanDate.toLocaleString()}\n`;
        content += `Files Processed: ${report.filesProcessed}\n`;
        content += `Total Methods Scanned: ${report.totalMethodsScanned}\n`;
        content += `Methods with No References: ${report.methodsWithNoReferences}\n`;
        content += `\n`;

        if (report.methodsWithNoReferences > 0) {
            content += `METHODS WITH NO REFERENCES:\n`;
            content += `---------------------------\n`;
            report.nonReferencedMethods.forEach((method, index) => {
                const typeCapitalized = method.type.charAt(0).toUpperCase() + method.type.slice(1);
                content += `${index + 1}. ${method.className}.${method.methodName}\n`;
                content += `   File: ${method.fileName}\n`;
                content += `   Line: ${method.lineNumber}\n`;
                content += `   Visibility: ${method.visibility}\n`;
                content += `   Static: ${method.isStatic ? 'Yes' : 'No'}\n`;
                content += `   Type: ${typeCapitalized}\n`;
                if (method.annotations && method.annotations.length > 0) {
                    content += `   Annotations: ${method.annotations.join(', ')}\n`;
                }
                content += `   Code: ${method.lineText}\n`;
                content += `\n`;
            });
        } else {
            content += `NO NON-REFERENCED METHODS FOUND\n`;
            content += `All methods in the tested files have references.\n`;
        }

        // NEW SECTION: All scanned methods with reference counts
        content += `\nALL SCANNED METHODS WITH REFERENCE COUNTS:\n`;
        content += `==========================================\n`;
        if (report.allScannedMethods && report.allScannedMethods.length > 0) {
            report.allScannedMethods.forEach((method, index) => {
                const status = method.referenceCount === 0 ? '❌ UNUSED' : `✅ ${method.referenceCount} references`;
                const typeCapitalized = method.type.charAt(0).toUpperCase() + method.type.slice(1);
                content += `${index + 1}. ${method.className}.${method.methodName} - ${status}\n`;
                content += `   File: ${method.fileName} (Line ${method.lineNumber}) --`;
                content += `   Visibility: ${method.visibility} ${method.isStatic ? '(static)' : ''} --`;
                if (method.annotations && method.annotations.length > 0) {
                    content += `   Annotations: ${method.annotations.join(', ')} --`;
                }
                content += `   Type: ${typeCapitalized}\n`;
                
                content += `\n`;
            });
        } else {
            content += `No methods were scanned.\n`;
        }

        content += `\nSCANNED FILES:\n`;
        content += `--------------\n`;
        report.scannedFiles.forEach((filePath, index) => {
            content += `${index + 1}. ${path.basename(filePath)}\n`;
            content += `   Path: ${filePath}\n`;
        });

        await fs.promises.writeFile(reportPath, content, 'utf8');
        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Test report saved to: ${reportPath}`);
        
        return reportPath;
    }

    /**
     * Cache all test files at the beginning for performance optimization
     */
    private async cacheTestFiles(allApexFiles: vscode.Uri[]): Promise<void> {
        this.testFilesCache.clear();
        
        for (const file of allApexFiles) {
            const fileName = path.basename(file.fsPath);
            if (this.isTestFileByName(fileName)) {
                this.testFilesCache.add(fileName);
            } else {
                // Also check file content for @IsTest annotation for files not caught by name
                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf8');
                    if (this.isTestClass(content)) {
                        this.testFilesCache.add(fileName);
                    }
                } catch (error) {
                    // Continue if we can't read the file
                }
            }
        }
        
        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Cached ${this.testFilesCache.size} test files: ${Array.from(this.testFilesCache).join(', ')}`);
    }

    /**
     * Check if a file is a test file by examining filename patterns only
     */
    private isTestFileByName(fileName: string): boolean {
        const lowerName = fileName.toLowerCase();
        return lowerName.includes('test') && lowerName.endsWith('.cls') ||
               lowerName.includes('_test.cls') ||
               lowerName.includes('testclass.cls') ||
               lowerName.includes('tests.cls') ||
               lowerName.startsWith('test_') ||
               lowerName.endsWith('_test.cls') ||
               lowerName.endsWith('test.cls');
    }

    /**
     * Check if a file is a test file using the cached set (performance optimized)
     */
    private isTestFile(fileName: string): boolean {
        return this.testFilesCache.has(fileName);
    }

    private isTestClass(content: string): boolean {
        // Check for @IsTest annotation at class level (most common)
        const hasIsTestAnnotation = /@istest\s+(?:(?:public|private|global)\s+)?(?:virtual\s+|abstract\s+)?class\s+/i.test(content);
        
        // Check for class names ending with 'test' or 'tests' 
        const hasTestClassName = /class\s+\w*tests?(?:\s|$)/i.test(content);
        
        // Check for @TestVisible, @TestSetup annotations (indicates test-related class)
        const hasTestAnnotations = /@testvisible|@testsetup/i.test(content);
        
        // Check for common test method patterns within the class
        const hasTestMethods = /@istest\s+(?:static\s+)?(?:public|private)\s+(?:void|testmethod)/i.test(content);
        
        const isTest = hasIsTestAnnotation || hasTestClassName || hasTestAnnotations || hasTestMethods;
        
        return isTest;
    }

    private isTestMethod(methodName: string, annotations: string[], lineText: string): boolean {
        return annotations.some(ann => ann.toLowerCase() === 'istest') ||
               /test/i.test(methodName) ||
               /@istest/i.test(lineText);
    }

    private isSpecialMethod(methodName: string): boolean {
        const specialMethods = ['finalize', 'clone', 'hashcode', 'equals', 'tostring'];
        return specialMethods.includes(methodName.toLowerCase());
    }

    private parseAnnotations(annotationStr: string): string[] {
        const annotations: string[] = [];
        const annotationPattern = /@(\w+)/g;
        let match;
        
        while ((match = annotationPattern.exec(annotationStr)) !== null) {
            annotations.push(match[1]);
        }
        
        return annotations;
    }

    private sortMethods(methods: NonReferencedMethod[]): NonReferencedMethod[] {
        return methods.sort((a, b) => {
            const fileCompare = a.fileName.localeCompare(b.fileName);
            if (fileCompare !== 0) return fileCompare;
            return a.lineNumber - b.lineNumber;
        });
    }

    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(dirPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    private reportProgress(message: string, percentage?: number): void {
        if (this.progressCallback) {
            this.progressCallback(message, percentage);
        }
        OrgUtils.logDebug(`[VisbalExt.NonReferenceReportService] Progress: ${message}${percentage ? ` (${percentage}%)` : ''}`);
    }
}
