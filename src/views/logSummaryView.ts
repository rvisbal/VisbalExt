import * as vscode from 'vscode';
import { LogEvent, Tab, LogCategory, ParsedLogData } from './types';
import { LogParser } from './logParser';
import { TimelineView } from './timelineView';
import { CallTreeView } from './callTreeView';
import { AnalysisView } from './analysisView';
import { DatabaseView } from './databaseView';
import { styles } from './styles';

/**
 * Main LogSummaryView class that integrates all components
 */
export class LogSummaryView {
  private static panel: vscode.WebviewPanel | undefined;
  private static currentTab: string = 'timeline';
  
  // Define available tabs
  private static tabs: Tab[] = [
    { id: 'timeline', label: 'Timeline', icon: '$(timeline)' },
    { id: 'callTree', label: 'Call Tree', icon: '$(list-tree)' },
    { id: 'analysis', label: 'Analysis', icon: '$(graph)' },
    { id: 'database', label: 'Database', icon: '$(database)' }
  ];

  // Define available categories with their display names and colors
  private static categories: LogCategory[] = [
    { id: 'APEX_CODE', label: 'APEX_CODE', state: 'DEBUG' },
    { id: 'APEX_PROFILING', label: 'APEX_PROFILING', state: 'INFO' },
    { id: 'CALLOUT', label: 'CALLOUT', state: 'INFO' },
    { id: 'DATA_ACCESS', label: 'DATA_ACCESS', state: 'INFO' },
    { id: 'DB', label: 'DB', state: 'INFO' },
    { id: 'NBA', label: 'NBA', state: 'INFO' },
    { id: 'SYSTEM', label: 'SYSTEM', state: 'DEBUG' },
    { id: 'VALIDATION', label: 'VALIDATION', state: 'INFO' },
    { id: 'VISUALFORCE', label: 'VISUALFORCE', state: 'INFO' },
    { id: 'WAVE', label: 'WAVE', state: 'INFO' },
    { id: 'WORKFLOW', label: 'WORKFLOW', state: 'INFO' }
  ];
  
  // View components
  private static timelineView = new TimelineView();
  private static callTreeView = new CallTreeView();
  private static analysisView = new AnalysisView();
  private static databaseView = new DatabaseView();

  /**
   * Shows the log summary panel for the current log file
   * @param context The extension context
   */
  public static show(context: vscode.ExtensionContext): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor found');
      return;
    }

    // Get the log file name
    const logFileName = editor.document.fileName.split(/[\/\\]/).pop() || 'Log';
    const fileSize = (editor.document.getText().length / 1024).toFixed(2);

    // If we already have a panel, show it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(editor.document.getText(), logFileName, fileSize);
      return;
    }

    // Create a new panel
    this.panel = vscode.window.createWebviewPanel(
      'logSummary',
      `Summary: ${logFileName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set the webview's initial HTML content
    this.updatePanel(editor.document.getText(), logFileName, fileSize);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'switchTab':
            this.currentTab = message.tab;
            this.updatePanel(editor.document.getText(), logFileName, fileSize);
            return;
        }
      },
      undefined,
      context.subscriptions
    );

    // Reset when the panel is closed
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      context.subscriptions
    );
  }

  /**
   * Updates the panel with the log content
   * @param logContent The log content to display
   * @param logFileName The log file name
   * @param fileSize The file size in KB
   */
  private static updatePanel(logContent: string, logFileName: string, fileSize: string): void {
    if (!this.panel) {
      return;
    }

    // Parse the log content
    const parsedData = LogParser.parseLogContent(logContent);
    
    // Generate the HTML content
    this.panel.webview.html = this.getWebviewContent(parsedData, logFileName, fileSize);
    
    // After the HTML is set, send a message to initialize the view
    setTimeout(() => {
      this.panel?.webview.postMessage({
        command: 'initializeView',
        tab: this.currentTab,
        data: parsedData
      });
    }, 100);
  }

  /**
   * Returns the HTML content for the webview
   * @param parsedData The parsed log data
   * @param logFileName The log file name
   * @param fileSize The file size in KB
   */
  private static getWebviewContent(parsedData: ParsedLogData, logFileName: string, fileSize: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Log Summary</title>
        <style>
            ${styles}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="file-info">
                <span class="file-name">${logFileName}</span>
                <div class="file-stats">
                    <span class="file-size">${fileSize} KB</span>
                    <span class="file-status">Ready</span>
                    <span class="file-issues">${parsedData.events.length} events</span>
                </div>
            </div>
            
            <div class="categories">
                ${this.categories.map(cat => `
                    <div class="category">
                        <span class="category-name">${cat.label}:</span>
                        <span class="category-state ${cat.state.toLowerCase()}">${cat.state}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="tabs">
            ${this.tabs.map(tab => `
                <div class="tab ${this.currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                    <span class="tab-icon">${tab.icon}</span>
                    <span class="tab-label">${tab.label}</span>
                </div>
            `).join('')}
        </div>
        
        <div id="timeline" class="tab-content ${this.currentTab === 'timeline' ? 'active' : ''}"></div>
        <div id="callTree" class="tab-content ${this.currentTab === 'callTree' ? 'active' : ''}"></div>
        <div id="analysis" class="tab-content ${this.currentTab === 'analysis' ? 'active' : ''}"></div>
        <div id="database" class="tab-content ${this.currentTab === 'database' ? 'active' : ''}"></div>
        
        <div class="bottom-legend">
            <div class="bottom-category Code">Code Unit</div>
            <div class="bottom-category Workflow">Workflow</div>
            <div class="bottom-category Method">Method</div>
            <div class="bottom-category Flow">Flow</div>
            <div class="bottom-category DML">DML</div>
            <div class="bottom-category SOQL">SOQL</div>
            <div class="bottom-category System">System Method</div>
        </div>
        
        <script>
            // Get vscode API
            const vscode = acquireVsCodeApi();
            
            // Tab switching functionality
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabId = this.getAttribute('data-tab');
                    
                    // Send message to extension
                    vscode.postMessage({
                        command: 'switchTab',
                        tab: tabId
                    });
                });
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'initializeView':
                        initializeView(message.tab, message.data);
                        break;
                }
            });
            
            // Initialize the current view
            function initializeView(tabId, data) {
                const tabContent = document.getElementById(tabId);
                if (!tabContent) return;
                
                // Clear the tab content
                tabContent.innerHTML = '';
                
                // Render the appropriate view based on the tab
                switch (tabId) {
                    case 'timeline':
                        renderTimelineView(data.events, tabContent);
                        break;
                    case 'callTree':
                        renderCallTreeView(data.events, tabContent);
                        break;
                    case 'analysis':
                        renderAnalysisView(data.events, tabContent);
                        break;
                    case 'database':
                        renderDatabaseView(data.events, tabContent);
                        break;
                }
            }
            
            // Render timeline view
            function renderTimelineView(events, container) {
                // Create the legend
                const legend = document.createElement('div');
                legend.className = 'category-legend';
                legend.innerHTML = \`
                    <div class="category-item">
                        <div class="category-color" style="background-color: #2a6;"></div>
                        <span>Execution</span>
                    </div>
                    <div class="category-item">
                        <div class="category-color" style="background-color: #62a;"></div>
                        <span>Code Unit</span>
                    </div>
                    <div class="category-item">
                        <div class="category-color" style="background-color: #a26;"></div>
                        <span>DML</span>
                    </div>
                    <div class="category-item">
                        <div class="category-color" style="background-color: #26a;"></div>
                        <span>SOQL</span>
                    </div>
                    <div class="category-item">
                        <div class="category-color" style="background-color: #a62;"></div>
                        <span>Flow</span>
                    </div>
                \`;
                container.appendChild(legend);
                
                // Create the timeline container
                const timeline = document.createElement('div');
                timeline.className = 'timeline';
                container.appendChild(timeline);
                
                // Create the execution details section
                const executionDetails = document.createElement('div');
                executionDetails.className = 'execution-details';
                executionDetails.textContent = 'Click on an event to see details';
                container.appendChild(executionDetails);
                
                // Render timeline events (simplified for now)
                const timelineContent = document.createElement('div');
                timelineContent.className = 'placeholder-message';
                timelineContent.textContent = 'Timeline view is rendered client-side in the actual implementation';
                timeline.appendChild(timelineContent);
            }
            
            // Render call tree view
            function renderCallTreeView(events, container) {
                // Create filter controls
                const filterControls = document.createElement('div');
                filterControls.className = 'filter-controls';
                filterControls.innerHTML = \`
                    <div class="filter">
                        <button class="expand-btn">Expand</button>
                        <button class="collapse-btn">Collapse</button>
                        <label>
                            <input type="checkbox" class="details-checkbox" />
                            Details
                        </label>
                        <label>
                            <input type="checkbox" class="debug-only-checkbox" />
                            Debug Only
                        </label>
                    </div>
                \`;
                container.appendChild(filterControls);
                
                // Create the table header
                const tableHeader = document.createElement('div');
                tableHeader.className = 'call-tree-header';
                tableHeader.innerHTML = \`
                    <div class="call-tree-row header">
                        <div class="call-tree-cell name">Name</div>
                        <div class="call-tree-cell namespace">Namespace</div>
                        <div class="call-tree-cell dml">DML Count</div>
                        <div class="call-tree-cell soql">SOQL Count</div>
                        <div class="call-tree-cell rows">Rows Count</div>
                        <div class="call-tree-cell total-time">Total Time (ms)</div>
                        <div class="call-tree-cell self-time">Self Time (ms)</div>
                    </div>
                \`;
                container.appendChild(tableHeader);
                
                // Create the table body
                const tableBody = document.createElement('div');
                tableBody.className = 'call-tree-body';
                container.appendChild(tableBody);
                
                // Placeholder for call tree content
                const placeholder = document.createElement('div');
                placeholder.className = 'placeholder-message';
                placeholder.textContent = 'Call Tree view is rendered client-side in the actual implementation';
                tableBody.appendChild(placeholder);
            }
            
            // Render analysis view
            function renderAnalysisView(events, container) {
                const placeholder = document.createElement('div');
                placeholder.className = 'placeholder-message';
                placeholder.textContent = 'Analysis view is rendered client-side in the actual implementation';
                container.appendChild(placeholder);
            }
            
            // Render database view
            function renderDatabaseView(events, container) {
                const placeholder = document.createElement('div');
                placeholder.className = 'placeholder-message';
                placeholder.textContent = 'Database view is rendered client-side in the actual implementation';
                container.appendChild(placeholder);
            }
        </script>
    </body>
    </html>`;
  }
} 