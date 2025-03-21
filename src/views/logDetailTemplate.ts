export class LogDetailTemplate {
    private parsedData: any;
    private logFileName: string;
    private fileSize: string;
    private currentTab: string;

    constructor(parsedData: any, logFileName: string, fileSize: string, currentTab: string = 'overview') {
        this.parsedData = parsedData;
        this.logFileName = logFileName;
        this.fileSize = fileSize;
        this.currentTab = currentTab;
    }

    public getHeader(): string {
        return `
            <div class="header">
                <div class="header-content">
                    <div class="header-info">
                        <span class="header-title">Log Detail View</span>
                        <span class="header-separator">|</span>
                        <span class="header-detail">File: ${this.logFileName}</span>
                        <span class="header-separator">|</span>
                        <span class="header-detail">Size: ${this.fileSize}</span>
                        <span class="header-separator">|</span>
                        <span class="header-detail">Date: ${new Date().toLocaleString()}</span>
                    </div>
                    <div class="header-buttons">
                        <button id="downloadButton" class="button">Download</button>
                    </div>
                </div>
            </div>
        `;
    }

    public getStyles(): string {
        return `
            <style>
                .header {
                    padding: 8px 12px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    height: 32px;
                    display: flex;
                    align-items: center;
                }
                .header-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    color: var(--vscode-foreground);
                }
                .header-title {
                    font-weight: 500;
                }
                .header-separator {
                    color: var(--vscode-descriptionForeground);
                    opacity: 0.8;
                }
                .header-detail {
                    color: var(--vscode-descriptionForeground);
                }
                .header-buttons {
                    display: flex;
                    gap: 8px;
                }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 13px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .button:active {
                    background: var(--vscode-button-background);
                    opacity: 0.8;
                }
            </style>
        `;
    }

    public getRawLogSection(rawLogHtml: string): string {
        return `
            <div id="raw" class="tab-content ${this.currentTab === 'raw' ? 'active' : ''}">
                <div class="raw-log-container">
                    <div class="raw-log-toolbar">
                        <div class="highlight-options">
                            <label class="highlight-label">Highlight:</label>
                            <div class="highlight-buttons">
                                <button class="highlight-button" data-type="EXECUTION">EXECUTION</button>
                                <button class="highlight-button" data-type="DML">DML</button>
                                <button class="highlight-button" data-type="SOQL">SOQL</button>
                                <button class="highlight-button" data-type="VALIDATION">VALIDATION</button>
                                <button class="highlight-button" data-type="CALLOUT">CALLOUT</button>
                                <button class="highlight-button" data-type="SYSTEM">SYSTEM</button>
                                <button class="highlight-button" data-type="DEBUG">DEBUG</button>
                            </div>
                        </div>
                    </div>
                    <div class="raw-log-content">
                        <pre class="raw-log-text">${rawLogHtml}</pre>
                    </div>
                </div>
            </div>
        `;
    }

    public getHeaderStyles(): string {
        return `
            <style>
                .header {
                    padding: 8px 12px;
                    background: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    height: 32px;
                    display: flex;
                    align-items: center;
                }
                .header-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    color: var(--vscode-foreground);
                }
                .header-title {
                    font-weight: 500;
                }
                .header-separator {
                    color: var(--vscode-descriptionForeground);
                    opacity: 0.8;
                }
                .header-detail {
                    color: var(--vscode-descriptionForeground);
                }
                .header-buttons {
                    display: flex;
                    gap: 8px;
                }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 13px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .button:active {
                    background: var(--vscode-button-background);
                    opacity: 0.8;
                }
            </style>
        `;
    }

    public getRawLogStyles(): string {
        return `
            .raw-log-container {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            .raw-log-toolbar {
                padding: 8px;
                background: var(--vscode-editor-background);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .highlight-options {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .highlight-label {
                font-size: 12px;
                color: var(--vscode-foreground);
            }
            
            .highlight-buttons {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
            }
            
            .highlight-button {
                padding: 2px 8px;
                font-size: 11px;
                border: 1px solid var(--vscode-button-background);
                background: transparent;
                color: var(--vscode-button-foreground);
                cursor: pointer;
                border-radius: 2px;
                height: 20px;
                display: flex;
                align-items: center;
            }
            
            .highlight-button:hover {
                background: var(--vscode-button-background);
                opacity: 0.8;
            }
            
            .highlight-button.active {
                background: var(--vscode-button-background);
            }
            
            .raw-log-content {
                flex: 1;
                overflow: auto;
                padding: 8px;
            }
            
            .raw-log-text {
                font-family: monospace;
                font-size: 12px;
                line-height: 1.4;
                white-space: pre-wrap;
                margin: 0;
            }
            
            /* Highlight colors for different log types */
            .highlight-EXECUTION {
                background-color: rgba(86, 156, 214, 0.2);
            }
            
            .highlight-DML {
                background-color: rgba(181, 206, 168, 0.2);
            }
            
            .highlight-SOQL {
                background-color: rgba(220, 220, 170, 0.2);
            }
            
            .highlight-VALIDATION {
                background-color: rgba(206, 145, 120, 0.2);
            }
            
            .highlight-CALLOUT {
                background-color: rgba(197, 134, 192, 0.2);
            }
            
            .highlight-SYSTEM {
                background-color: rgba(106, 153, 85, 0.2);
            }
            
            .highlight-DEBUG {
                background-color: rgba(255, 215, 0, 0.2);
            }
        `;
    }

    public getCustomScript(): string {
        return `
            // Highlight functionality
            document.querySelectorAll('.highlight-button').forEach(button => {
                button.addEventListener('click', () => {
                    const type = button.getAttribute('data-type');
                    button.classList.toggle('active');
                    
                    // Find all lines that match this type
                    const logContent = document.querySelector('.raw-log-text');
                    const lines = logContent.innerHTML.split('\\n');
                    
                    const highlightedLines = lines.map(line => {
                        if (button.classList.contains('active') && line.includes(type)) {
                            return \`<span class="highlight-\${type}">\${line}</span>\`;
                        }
                        return line;
                    });
                    
                    logContent.innerHTML = highlightedLines.join('\\n');
                });
            });
        `;
    }
} 