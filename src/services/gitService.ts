import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OrgUtils } from '../utils/orgUtils';

const execAsync = promisify(exec);

export class GitService {
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
        try {
            let commits = [];
            const useOldGitCommand = false;
            if (useOldGitCommand) {
                commits = await this.processOldGitCommand(filePath, startLine, endLine);
            } else {
                commits = await this.processGitCommand(filePath, startLine, endLine);
            }
            
            return commits;
        } catch (error) {
            console.error('Error getting git history:', error);
            throw error;
        }
    }

    async processOldGitCommand (filePath: string, startLine: number, endLine: number) {
        // Escape the file path to handle spaces and special characters
        const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');

        // git log --full-history -m -p --date=local --pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" -L 1065,1181:c:\\CURSOR\\CURSOR_SAMPLE\\force-app\\main\\default\\classes\\HierarchyFactory.cls
        const command =  `git log --full-history -m -p ` +
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


        OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git command:`, command);
        // Get the git log with line annotations and more detailed format
        const { stdout } = await execAsync(command);
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

    async processGitCommand (filePath: string, startLine: number, endLine: number) {
            // Escape the file path to handle spaces and special characters// Escape the file path to handle spaces and special characters
            const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');
            // Get all commits affecting a specific line range in a class, include  recent changes, older changes and future dates. also include multiple branches
            // apply this command : git log -L 1065,1181:force-app/main/default/classes/HierarchyFactory.cls --pretty=format:"%h - %an, %ad : %s" --date=short
            const command =  `git log -L ${startLine},${endLine}:${escapedPath} --pretty=format:"%h - %an, %ad : %s" --date=short`;
            // --full-history to show all commits
            // -m -p to show the full patch
            // --pretty=format to show commit details in a readable format
            // -L 1065,1181 to focus on the specific line range
            // --reverse to show commits in chronological order
            // --all to include all branches
            // --no-merges to exclude merge commits
            // --date=raw to show timestamps in a consistent format
            // --no-walk to show commits without walking the history


            OrgUtils.logDebug(`[VisbalExt.GitService] getHistoryForSelection -- Git command:`, command);
            // Get the git log with line annotations and more detailed format
            const { stdout } = await execAsync(command);
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
} 