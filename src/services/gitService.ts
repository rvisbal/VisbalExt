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
            // Get the git log with line annotations
            const { stdout } = await execAsync(
                `git log -L ${startLine},${endLine}:${filePath} --pretty=format:"%H|%an|%ad|%s"`
            );

            const commits = [];
            const lines = stdout.split('\n');
            let currentCommit: any = {};

            for (const line of lines) {
                if (line.includes('|')) {
                    // This is a commit header
                    if (currentCommit.hash) {
                        commits.push(currentCommit);
                    }
                    const [hash, author, date, message] = line.split('|');
                    currentCommit = { hash, author, date, message, diff: '' };
                } else if (line.startsWith('@@') || line.startsWith('+') || line.startsWith('-')) {
                    // This is part of the diff
                    currentCommit.diff += line + '\n';
                }
            }

            if (currentCommit.hash) {
                commits.push(currentCommit);
            }

            return commits;
        } catch (error) {
            console.error('Error getting git history:', error);
            throw error;
        }
    }
} 