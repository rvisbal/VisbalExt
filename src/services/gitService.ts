import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OrgUtils } from '../utils/orgUtils';
import { StatusBarService } from './statusBarService';

const execAsync = promisify(exec);

export class GitService {
    private static readonly MAX_EXEC_BUFFER = 10 * 1024 * 1024; // 10MB
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Gets the git history for a specific line range in a file
     */
    async getHistoryForSelection(
        filePath: string,
        startLine: number,
        endLine: number
    ): Promise<Array<{
        hash: string,
        author: string,
        date: string,
        message: string,
        diff: string
    }>> {
        const statusBarService = StatusBarService.getInstance();
        try {
            statusBarService.showProgress('Loading git history...');
            let commits = [];
            const useCurrentGitCommand = true;
            if (useCurrentGitCommand) {
                commits = await this.processGitCommand(filePath, startLine, endLine);
            } else {
                commits = await this.processTestGitCommand(filePath, startLine, endLine);
            }
            statusBarService.showSuccess('Git history loaded');
            return commits;
        } catch (error) {
            statusBarService.showError('Failed to load git history');
            console.error('Error getting git history:', error);
            throw error;
        } finally {
            statusBarService.hide();
        }
    }

    /**
     * Gets the git history for an entire file
     */
    async getHistoryForFile(
        filePath: string
    ): Promise<Array<{
        hash: string,
        author: string,
        date: string,
        message: string,
        diff: string
    }>> {
        const statusBarService = StatusBarService.getInstance();
        try {
            statusBarService.showProgress('Loading git history...');
            
            // First check if the file is tracked by Git
            await this.checkIfFileIsTracked(filePath);
            
            // Escape the file path to handle spaces and special characters
            const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');

            // Command to get git history for the entire file with context lines
            const command = `git log ` +
                `--full-history ` +
                `-m -p ` +
                `--date=local ` +
                `--pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" ` +
                `-L 1,999999:${escapedPath}`;

            OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForFile -- Git command:`, command);
            
            // Get the git log with detailed format
            const { stdout } = await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
            OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForFile -- Git output:`, stdout);
            
            const commits = [];
            let currentCommit: any = {};
            let diffContent = '';
            
            // Split the output into commits and their corresponding diffs
            // Using a more precise regex to handle merge commits and their parents
            const parts = stdout.split(/(?=^commit\s[a-f0-9]{40}(?:\s\([^)]*\))?\n)/m);
            
            for (const part of parts) {
                OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForFile -- Part:`, part);
                if (!part.trim()) continue;
                
                // Enhanced regex to better handle merge commit messages
                const commitMatch = part.match(/^commit\s([a-f0-9]+)(?:\s\([^)]*\))?\nAuthor:\s(.*?)\nDate:\s(.*?)\n\n([\s\S]*?)(?=\n(?:diff|$))/);
                if (commitMatch) {
                    if (currentCommit.hash) {
                        currentCommit.diff = diffContent.trim();
                        commits.push(currentCommit);
                        diffContent = '';
                    }
                    
                    currentCommit = {
                        hash: commitMatch[1],
                        author: commitMatch[2],
                        date: commitMatch[3],
                        message: commitMatch[4].trim(),
                        diff: ''
                    };
                    
                    // Extract diff content after the commit header
                    const diffStart = part.indexOf('\ndiff ');
                    if (diffStart !== -1) {
                        diffContent = part.slice(diffStart).trim();
                    }
                } else {
                    // If no commit match, this must be diff content
                    diffContent += '\n' + part.trim();
                }
            }

            // Don't forget to add the last commit
            if (currentCommit.hash) {
                currentCommit.diff = diffContent.trim();
                commits.push(currentCommit);
            }
            statusBarService.showSuccess('Git history loaded');
            return commits;
        } catch (error) {
            statusBarService.showError('Failed to load git history');
            console.error('Error getting git history for file:', error);
            throw error;
        } finally {
            statusBarService.hide();
        }
    }

    async processGitCommand (filePath: string, startLine: number, endLine: number) {
        // First check if the file is tracked by Git
        await this.checkIfFileIsTracked(filePath);
        
        // Escape the file path to handle spaces and special characters
        const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');

        // git log --full-history -m -p --date=local --pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" -L 1065,1181:c:\\CURSOR\\CURSOR_SAMPLE\\force-app\\main\\default\\classes\\HierarchyFactory.cls 
        const command =  `git log ` +
        `--full-history ` +
        `-m -p ` +
        `--date=local ` +
        `--pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" ` +
        `-L ${startLine},${endLine}:${escapedPath}`;

        // --full-history to show all commits
        // -m -p to show the full patch
        // --pretty=format to show commit details in a readable format
        // -L 1065,1181 to focus on the specific line range
        // --reverse to show commits in chronological order
        // --all to include all branches
        // --no-merges to exclude merge commits
        // --date=raw to show timestamps in a consistent format
        // --no-walk to show commits without walking the history
        // --all to include all branches


        OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git command:`, command);
        // Get the git log with line annotations and more detailed format
        const { stdout } = await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
        OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git output:`, stdout);
        const commits = [];
        let currentCommit: any = {};
        let diffContent = '';
        
        // Split the output into commits and their corresponding diffs
        // Using a more precise regex to handle merge commits and their parents
        const parts = stdout.split(/(?=^commit\s[a-f0-9]{40}(?:\s\([^)]*\))?\n)/m);

        for (const part of parts) {
            if (!part.trim()) continue;
            
            // Enhanced regex to better handle merge commit messages
            const commitMatch = part.match(/^commit\s([a-f0-9]+)(?:\s\([^)]*\))?\nAuthor:\s(.*?)\nDate:\s(.*?)\n\n([\s\S]*?)(?=\n(?:diff|$))/);
            if (commitMatch) {
                if (currentCommit.hash) {
                    currentCommit.diff = diffContent.trim();
                    commits.push(currentCommit);
                    diffContent = '';
                }
                
                currentCommit = {
                    hash: commitMatch[1],
                    author: commitMatch[2],
                    date: commitMatch[3],
                    message: commitMatch[4].trim(),
                    diff: ''
                };
                
                // Extract diff content after the commit header
                const diffStart = part.indexOf('\ndiff ');
                if (diffStart !== -1) {
                    diffContent = part.slice(diffStart).trim();
                }
            } else {
                // If no commit match, this must be diff content
                diffContent += '\n' + part.trim();
            }
        }

        // Don't forget to add the last commit
        if (currentCommit.hash) {
            currentCommit.diff = diffContent.trim();
            commits.push(currentCommit);
        }

        return commits;
    }


    async processTestGitCommand(filePath: string, startLine: number, endLine: number) {
        // Escape the file path to handle spaces and special characters
        const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');

        // git log --full-history -m -p --date=local --pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" -L 1065,1181:c:\\CURSOR\\CURSOR_SAMPLE\\force-app\\main\\default\\classes\\HierarchyFactory.cls 
        const command =  `git log ` +
        `--full-history ` +
        `-m -p ` +
        `--date=local ` +
        `--pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" ` +
        `-L ${startLine},${endLine}:${escapedPath}`;

        // --full-history to show all commits
        // -m -p to show the full patch
        // --pretty=format to show commit details in a readable format
        // -L 1065,1181 to focus on the specific line range
        // --reverse to show commits in chronological order
        // --all to include all branches
        // --no-merges to exclude merge commits
        // --date=raw to show timestamps in a consistent format
        // --no-walk to show commits without walking the history
        // --all to include all branches


        OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git command:`, command);
        // Get the git log with line annotations and more detailed format
        const { stdout } = await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
        OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git output:`, stdout);
        const commits = [];
        let currentCommit: any = {};
        let diffContent = '';
        
        // Split the output into commits and their corresponding diffs
        // Using a more precise regex to handle merge commits and their parents
        const parts = stdout.split(/(?=^commit\s[a-f0-9]{40}(?:\s\([^)]*\))?\n)/m);

        for (const part of parts) {
            if (!part.trim()) continue;
            
            // Enhanced regex to better handle merge commit messages
            const commitMatch = part.match(/^commit\s([a-f0-9]+)(?:\s\([^)]*\))?\nAuthor:\s(.*?)\nDate:\s(.*?)\n\n([\s\S]*?)(?=\n(?:diff|$))/);
            if (commitMatch) {
                if (currentCommit.hash) {
                    currentCommit.diff = diffContent.trim();
                    commits.push(currentCommit);
                    diffContent = '';
                }
                
                currentCommit = {
                    hash: commitMatch[1],
                    author: commitMatch[2],
                    date: commitMatch[3],
                    message: commitMatch[4].trim(),
                    diff: ''
                };
                
                // Extract diff content after the commit header
                const diffStart = part.indexOf('\ndiff ');
                if (diffStart !== -1) {
                    diffContent = part.slice(diffStart).trim();
                }
            } else {
                // If no commit match, this must be diff content
                diffContent += '\n' + part.trim();
            }
        }

        // Don't forget to add the last commit
        if (currentCommit.hash) {
            currentCommit.diff = diffContent.trim();
            commits.push(currentCommit);
        }

        return commits; 
    }

    async processGitEachBranchCommand(filePath: string, startLine: number, endLine: number) {
        const escapedPath = filePath.replace(/(["\s'$`\\])/g, '\\$1');
        OrgUtils.logDebug(`[VisbalExt.GitService] processGitCommand -- Escaped path: ${escapedPath}`);
        // 1. Get all local branch names
        const { stdout: branchStdout } = await execAsync('git for-each-ref --format="%(refname:short)" refs/heads/');
        const branches = branchStdout.trim().split('\n').filter(Boolean);
        const allCommitsMap = new Map();

        for (const branch of branches) {
            const command = `git log --date=short --pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" -L ${startLine},${endLine}:${escapedPath} ${branch}`;
            try {
                OrgUtils.logDebug(`[VisbalExt.GitService] processGitCommand -- Git command for branch: ${branch}`, command);
                const { stdout } = await execAsync(command);
                OrgUtils.logDebug(`[VisbalExt.GitService] processGitCommand -- Git output for branch: ${branch}`, stdout);
                let currentCommit: any = {};
                let diffContent = '';
                const parts = stdout.split(/(?=^commit\s[a-f0-9]{40}(?:\s\([^)]*\))?\n)/m);
                for (const part of parts) {
                    if (!part.trim()) continue;
                    const commitMatch = part.match(/^commit\s([a-f0-9]+)(?:\s\([^)]*\))?\nAuthor:\s(.*?)\nDate:\s(.*?)\n\n([\s\S]*?)(?=\n(?:diff|$))/);
                    if (commitMatch) {
                        if (currentCommit.hash) {
                            currentCommit.diff = diffContent.trim();
                            if (!allCommitsMap.has(currentCommit.hash)) {
                                allCommitsMap.set(currentCommit.hash, { ...currentCommit });
                            }
                            diffContent = '';
                        }
                        currentCommit = {
                            hash: commitMatch[1],
                            author: commitMatch[2],
                            date: commitMatch[3],
                            message: commitMatch[4].trim(),
                            diff: ''
                        };
                        const diffStart = part.indexOf('\ndiff ');
                        if (diffStart !== -1) {
                            diffContent = part.slice(diffStart).trim();
                        }
                    } else {
                        diffContent += '\n' + part.trim();
                    }
                }
                if (currentCommit.hash) {
                    currentCommit.diff = diffContent.trim();
                    if (!allCommitsMap.has(currentCommit.hash)) {
                        allCommitsMap.set(currentCommit.hash, { ...currentCommit });
                    }
                }
            } catch (error: any) {
                // Ignore errors for branches where the line range does not exist
                OrgUtils.logDebug(`[VisbalExt.GitService] processGitCommand -- Skipping branch due to error: ${branch}`, error.message);
            }
        }
        // Return unique commits as an array
        return Array.from(allCommitsMap.values());
    }

    /**
     * Gets the content of a file from a specific commit
     */
    async getFileContentFromCommit(commitHash: string, filePath: string): Promise<string> {
        const statusBarService = StatusBarService.getInstance();
        try {
            statusBarService.showProgress('Loading file content from commit...');
            
            // Convert absolute path to relative path from git root
            const relativePath = await this.getRelativePathFromGitRoot(filePath);
            
            // Escape the file path to handle spaces and special characters
            const escapedPath = relativePath.replace(/(["\s'$`\\])/g,'\\$1');
            
            // Command to get file content from specific commit
            const command = `git show ${commitHash}:${escapedPath}`;
            
            OrgUtils.logDebug(`[VisbalExt.GitService] getFileContentFromCommit -- Git command:`, command);
            
            const { stdout } = await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
            
            return stdout;
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitService] getFileContentFromCommit -- Error:', error);
            if (error.code === 128) {
                // Git error - file might not exist in that commit
                throw new Error(`File does not exist in commit ${commitHash.substring(0, 8)}`);
            }
            throw error;
        } finally {
            statusBarService.hide();
        }
    }

    /**
     * Gets the relative path of a file from the git root directory
     */
    private async getRelativePathFromGitRoot(filePath: string): Promise<string> {
        try {
            // Get git root directory
            const { stdout: gitRoot } = await execAsync('git rev-parse --show-toplevel');
            const gitRootPath = gitRoot.trim();
            
            // Convert to relative path
            const path = require('path');
            const relativePath = path.relative(gitRootPath, filePath);
            
            // Normalize path separators for git (always use forward slashes)
            return relativePath.replace(/\\/g, '/');
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitService] getRelativePathFromGitRoot -- Error:', error);
            // Fallback to using the original file path
            return filePath;
        }
    }

    /**
     * Gets the parent commit hash for a given commit
     */
    async getParentCommitHash(commitHash: string): Promise<string | null> {
        try {
            const command = `git rev-parse ${commitHash}^`;
            OrgUtils.logDebug(`[VisbalExt.GitService] getParentCommitHash -- Git command:`, command);
            
            const { stdout } = await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
            const parentHash = stdout.trim();
            
            OrgUtils.logDebug(`[VisbalExt.GitService] getParentCommitHash -- Parent hash:`, parentHash);
            return parentHash;
        } catch (error: any) {
            OrgUtils.logDebug(`[VisbalExt.GitService] getParentCommitHash -- No parent found for commit ${commitHash}:`, error.message);
            // Return null if no parent exists (initial commit)
            return null;
        }
    }

    /**
     * Checks if a file is tracked by Git
     */
    private async checkIfFileIsTracked(filePath: string): Promise<void> {
        try {
            // Convert to relative path for git commands
            const relativePath = await this.getRelativePathFromGitRoot(filePath);
            const escapedPath = relativePath.replace(/(["\s'$`\\])/g,'\\$1');
            
            // Check if file is tracked by Git using git ls-files
            const command = `git ls-files --error-unmatch ${escapedPath}`;
            
            OrgUtils.logDebug(`[VisbalExt.GitService] checkIfFileIsTracked -- Git command:`, command);
            
            await execAsync(command, { maxBuffer: GitService.MAX_EXEC_BUFFER });
            
            // If we reach here, the file is tracked
        } catch (error: any) {
            OrgUtils.logError('[VisbalExt.GitService] checkIfFileIsTracked -- Error:', error);
            if (error.code === 128) {
                // Git error - file is not tracked
                throw new Error(`The file "${require('path').basename(filePath)}" is not tracked by Git. Please add it to the repository first.`);
            }
            throw error;
        }
    }
} 