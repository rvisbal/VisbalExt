import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

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
            // Escape the file path to handle spaces and special characters
            const escapedPath = filePath.replace(/(["\s'$`\\])/g,'\\$1');
            
            // Get the git log with line annotations and more detailed format
            const { stdout } = await execAsync(
                `git log --full-history -m -p ` +
                `--date=local ` +
                `--pretty=format:"commit %H%nAuthor: %an%nDate: %ad%n%n%s%n%n" ` +
                `-L ${startLine},${endLine}:${escapedPath}`
            );

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
        } catch (error) {
            console.error('Error getting git history:', error);
            throw error;
        }
    }
} 