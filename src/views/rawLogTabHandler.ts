import * as vscode from 'vscode';

/**
 * Class to handle the raw log tab functionality
 */
export class RawLogTabHandler {
    private _webview: vscode.Webview;
    private _logContent: string = '';
    private _chunkSize: number = 500; // Number of lines to load at once

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
        // Only send the total line count and the first chunk initially
        const initialChunk = this._logContent.slice(0, this._chunkSize);
        
        this._webview.postMessage({
            command: 'updateRawLogTab',
            totalLines: this._logContent.length,
            initialChunk: initialChunk,
            chunkSize: this._chunkSize
        });
    }

    /**
     * Gets a chunk of log lines
     * @param startIndex The starting index
     * @param endIndex The ending index
     * @returns The chunk of log lines
     */
    public getLogChunk(startIndex: number, endIndex: number): string {
        return this._logContent.substring(startIndex, endIndex);
    }

    /**
     * Gets the HTML for the raw log tab placeholder
     * @returns HTML string for the raw log tab placeholder
     */
    public static getPlaceholderHtml(): string {
        return `
            <div class="raw-log-container">
                <div class="raw-log-toolbar">
                    <div class="search-container">
                        <input type="text" id="rawLogSearch" placeholder="Search in log...">
                        <label><input type="checkbox" id="caseSensitive"> Case sensitive</label>
                        <label><input type="checkbox" id="wholeWord"> Whole word</label>
                        <label><input type="checkbox" id="useRegex"> Use regex</label>
                        <button id="searchButton">Search</button>
                    </div>
                </div>
                <pre id="rawLogContent" class="raw-log"></pre>
            </div>
        `;
    }

    /**
     * Gets the JavaScript for handling raw log tab updates
     * @returns JavaScript string for handling raw log tab updates
     */
    public static getJavaScript(): string {
        return `
            let currentChunkIndex = 0;
            const chunkSize = 50000;
            
            function loadNextChunk() {
                vscode.postMessage({
                    command: 'getLogChunk',
                    chunkIndex: currentChunkIndex,
                    chunkSize: chunkSize
                });
            }
            
            window.addEventListener('message', event => {
                const message = event.data;
                
                if (message.command === 'logChunk') {
                    const logContent = document.getElementById('rawLogContent');
                    if (message.chunkIndex === currentChunkIndex) {
                        logContent.textContent += message.chunk;
                        currentChunkIndex++;
                        if (message.chunk.length === chunkSize) {
                            loadNextChunk();
                        }
                    }
                }
            });
            
            // Initial load
            //todo: perfomance issue, we need to load the whole log at once
            //loadNextChunk();
            
            // Search functionality
            document.getElementById('searchButton')?.addEventListener('click', () => {
                const searchTerm = document.getElementById('rawLogSearch').value;
                const caseSensitive = document.getElementById('caseSensitive').checked;
                const wholeWord = document.getElementById('wholeWord').checked;
                const useRegex = document.getElementById('useRegex').checked;
                
                vscode.postMessage({
                    command: 'searchRawLog',
                    searchTerm: searchTerm,
                    caseSensitive: caseSensitive,
                    wholeWord: wholeWord,
                    useRegex: useRegex
                });
            });
        `;
    }
} 