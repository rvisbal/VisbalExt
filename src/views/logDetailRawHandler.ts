import * as vscode from 'vscode';
import { formatLogContentForHtml } from '../utils/logParsingUtils';

/**
 * Class to handle the raw log tab functionality
 */
export class RawLogTabHandler {
    private _webview: vscode.Webview;
    private _logContent: string = '';

    /**
     * Constructor for RawLogTabHandler
     * @param webview The webview to communicate with
     */
    constructor(webview: vscode.Webview) {
        this._webview = webview;
    }

    /**
     * Sets the log content
     * @param content The log content to display
     */
    public setLogContent(content: string): void {
        this._logContent = content;
    }

    /**
     * Updates the raw log tab content in the webview
     */
    public updateRawLogTab(): void {
        // Send initial chunk of the log
        const initialChunk = this.getLogChunk(0, 1000);
        this._webview.postMessage({
            command: 'logChunk',
            chunk: initialChunk
        });
    }

    /**
     * Gets a chunk of log lines
     * @param startIndex The starting index
     * @param endIndex The ending index
     * @returns The chunk of log lines
     */
    public getLogChunk(startIndex: number, endIndex: number): string {
        const lines = this._logContent.split('\n');
        return lines.slice(startIndex, endIndex)
            .map((line, index) => {
                const lineNumber = startIndex + index + 1;
                const colorizedLine = formatLogContentForHtml(line);
                return `<div class="log-line">
                    <span class="line-number">${lineNumber}</span>
                    <span class="line-content">${colorizedLine}</span>
                </div>`;
            })
            .join('\n');
    }

    /**
     * Gets the HTML for the raw log tab placeholder
     * @returns HTML string for the raw log tab placeholder
     */
    public static getPlaceholderHtml(): string {
        return `<div id="raw-log-container" class="tab-content">
            <div id="raw-log-toolbar">
                <input type="text" id="raw-log-search" placeholder="Search log...">
                <label><input type="checkbox" id="case-sensitive"> Case sensitive</label>
                <label><input type="checkbox" id="whole-word"> Whole word</label>
                <label><input type="checkbox" id="use-regex"> Use regex</label>
            </div>
            <pre id="raw-log-content"></pre>
        </div>`;
    }

    /**
     * Gets the JavaScript for handling raw log tab updates
     * @returns JavaScript string for handling raw log tab updates
     */
    public static getJavaScript(): string {
        return `
            let rawLogContent = '';
            let currentChunkIndex = 0;
            const chunkSize = 1000;

            function loadNextChunk() {
                vscode.postMessage({
                    command: 'getLogChunk',
                    chunkIndex: currentChunkIndex,
                    chunkSize: chunkSize
                });
                currentChunkIndex++;
            }

            // Load initial chunk
            loadNextChunk();

            // Handle search in raw log
            document.getElementById('raw-log-search').addEventListener('input', (e) => {
                const searchTerm = e.target.value;
                const caseSensitive = document.getElementById('case-sensitive').checked;
                const wholeWord = document.getElementById('whole-word').checked;
                const useRegex = document.getElementById('use-regex').checked;

                if (searchTerm) {
                    vscode.postMessage({
                        command: 'searchRawLog',
                        searchTerm: searchTerm,
                        caseSensitive: caseSensitive,
                        wholeWord: wholeWord,
                        useRegex: useRegex
                    });
                }
            });

            // Handle log chunk messages
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'logChunk':
                        const logContent = document.getElementById('raw-log-content');
                        logContent.innerHTML += message.chunk;
                        break;
                }
            });
        `;
    }
} 