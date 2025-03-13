import * as vscode from 'vscode';

/**
 * Class to handle the execution tab functionality
 */
export class ExecutionTabHandler {
    private _webview: vscode.Webview;
    private _executionData: any[] = [];

    /**
     * Constructor for ExecutionTabHandler
     * @param webview The webview to communicate with
     */
    constructor(webview: vscode.Webview) {
        this._webview = webview;
    }

    /**
     * Sets the execution data
     * @param executionData The execution data to display
     */
    public setExecutionData(executionData: any[]): void {
        this._executionData = executionData || [];
    }

    /**
     * Updates the execution tab content in the webview
     */
    public updateExecutionTab(): void {
        this._webview.postMessage({
            command: 'updateExecutionTab',
            executionData: this._executionData
        });
    }

    /**
     * Gets the HTML for the execution tab placeholder
     * @returns HTML string for the execution tab placeholder
     */
    public static getPlaceholderHtml(): string {
        return `
            <div id="execution-tab-placeholder">
                <table>
                    <thead>
                        <tr>
                            <th>Line</th>
                            <th>Time (ms)</th>
                            <th>Code</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="3">No execution path data available</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Gets the JavaScript for handling execution tab updates
     * @returns JavaScript string for handling execution tab updates
     */
    public static getJavaScript(): string {
        return `
            // Function to update execution tab content
            function updateExecutionTab(executionData) {
                console.log('[VisbalLogView:WebView] Updating execution tab with data:', executionData);
                const placeholder = document.getElementById('execution-tab-placeholder');
                
                if (!placeholder) {
                    console.error('[VisbalLogView:WebView] Execution tab placeholder not found');
                    return;
                }
                
                if (!executionData || executionData.length === 0) {
                    placeholder.innerHTML = '<table>' +
                        '<thead>' +
                            '<tr>' +
                                '<th>Line</th>' +
                                '<th>Time (ms)</th>' +
                                '<th>Code</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>' +
                            '<tr>' +
                                '<td colspan="3">No execution path data available</td>' +
                            '</tr>' +
                        '</tbody>' +
                    '</table>';
                    return;
                }
                
                let tableHtml = '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Line</th>' +
                            '<th>Time (ms)</th>' +
                            '<th>Code</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';
                
                executionData.forEach(function(item) {
                    tableHtml += '<tr>' +
                        '<td>' + (item.lineNumber || '') + '</td>' +
                        '<td>' + (item.time || '') + '</td>' +
                        '<td>' + (item.code || '') + '</td>' +
                    '</tr>';
                });
                
                tableHtml += '</tbody></table>';
                
                placeholder.innerHTML = tableHtml;
            }
        `;
    }

    /**
     * Extracts execution path data from execution lines
     * @param executionLines The execution lines from the log
     * @returns Array of execution path entries
     */
    public static extractExecutionPath(executionLines: string[]): any[] {
        console.log('[ExecutionTabHandler] extractExecutionPath -- Extracting execution path data');
        
        const executionPath: any[] = [];
        
        executionLines.forEach((line, index) => {
            // Simple extraction - in a real implementation, this would be more sophisticated
            const parts = line.split('|');
            if (parts.length >= 2) {
                const lineNumber = index + 1;
                let time = '';
                let code = parts[1].trim();
                
                // Try to extract time information if available
                const timeMatch = code.match(/(\d+\.\d+)/);
                if (timeMatch) {
                    time = timeMatch[1];
                }
                
                executionPath.push({
                    lineNumber,
                    time,
                    code
                });
            }
        });
        
        console.log(`[ExecutionTabHandler] extractExecutionPath -- Extracted ${executionPath.length} execution path entries`);
        
        return executionPath;
    }
} 