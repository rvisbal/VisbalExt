import * as vscode from 'vscode';

/**
 * Represents a log event with timing and category information
 */
interface LogEvent {
  timestamp: number;
  duration: number;
  category: string;
  message: string;
  details?: string[];
}

/**
 * Represents a tab in the log summary view
 */
interface Tab {
  id: string;
  label: string;
  icon: string;
}

/**
 * LogSummary class that provides functionality for summarizing log files
 */
export class LogSummary {
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
  private static categories = [
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

    // Check if the active file is a log file
    if (!editor.document.fileName.toLowerCase().endsWith('.log')) {
      vscode.window.showInformationMessage('The active file is not a log file');
      return;
    }

    // Get the log file name
    const logFileName = editor.document.fileName.split(/[\/\\]/).pop() || 'Log';

    // If we already have a panel, show it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(editor.document.getText());
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
    this.updatePanel(editor.document.getText());

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'switchTab':
            this.currentTab = message.tab;
            this.updatePanel(editor.document.getText());
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
   */
  private static updatePanel(logContent: string): void {
    if (!this.panel) {
      return;
    }

    // Parse the log content
    const events = this.parseLogContent(logContent);
    
    // Generate the HTML content
    this.panel.webview.html = this.getWebviewContent(events, logContent);
  }

  /**
   * Parse the log content to extract events
   * @param logContent The log content to parse
   * @returns Array of log events
   */
  private static parseLogContent(logContent: string): LogEvent[] {
    const events: LogEvent[] = [];
    const lines = logContent.split('\n');
    
    let currentTimestamp = 0;
    let startTime = 0;

    // Simple parsing logic - this should be enhanced based on your specific log format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for execution started events
      if (line.includes('EXECUTION_STARTED')) {
        const timestampMatch = /timestamp:\s*(\d+)/.exec(lines[i+2] || '');
        if (timestampMatch) {
          currentTimestamp = parseInt(timestampMatch[1], 10);
          if (startTime === 0) {
            startTime = currentTimestamp;
          }
        }
        
        const durationMatch = /total:\s*([\d.]+)ms/.exec(lines[i+3] || '');
        const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
        
        events.push({
          timestamp: currentTimestamp - startTime,
          duration: duration,
          category: 'Execution',
          message: 'EXECUTION_STARTED',
          details: [
            lines[i+2] || '',
            lines[i+3] || '',
            lines[i+4] || ''
          ]
        });
      }
      
      // Add more parsing logic for other event types
      // This is a simplified example - you'll need to adapt to your specific log format
      
      // Look for DML operations
      if (line.includes('DML_') || line.includes('SOQL_')) {
        const category = line.includes('DML_') ? 'DML' : 'SOQL';
        events.push({
          timestamp: currentTimestamp - startTime,
          duration: 10, // Placeholder duration
          category: category,
          message: line
        });
      }
      
      // Look for method calls
      if (line.includes('METHOD_') || line.includes('FLOW_')) {
        const category = line.includes('METHOD_') ? 'Method' : 'Flow';
        events.push({
          timestamp: currentTimestamp - startTime,
          duration: 5, // Placeholder duration
          category: category,
          message: line
        });
      }
    }
    
    return events;
  }

  /**
   * Returns the HTML content for the webview
   * @param events The parsed log events
   * @param logContent The original log content
   */
  private static getWebviewContent(events: LogEvent[], logContent: string): string {
    // Calculate timeline metrics
    const timelineData = this.prepareTimelineData(events);
    
    // Get the active editor to extract file name
    const editor = vscode.window.activeTextEditor;
    const logFileName = editor ? editor.document.fileName.split(/[\/\\]/).pop() || 'Log' : 'Log';
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Log Summary</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 0;
                margin: 0;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                height: 100vh;
                display: flex;
                flex-direction: column;
            }
            .header {
                background-color: #1e1e1e;
                padding: 10px;
                border-bottom: 1px solid #333;
            }
            .file-info {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .file-name {
                color: #4a9cd6;
                font-weight: bold;
            }
            .file-stats {
                display: flex;
                gap: 10px;
                font-size: 12px;
            }
            .file-size {
                color: #888;
            }
            .file-status {
                color: #888;
            }
            .file-issues {
                background-color: #6c2022;
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
            }
            .categories {
                display: flex;
                gap: 10px;
                margin-top: 10px;
                overflow-x: auto;
                padding-bottom: 5px;
            }
            .category {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 12px;
            }
            .category-name {
                color: #888;
            }
            .category-state {
                color: #888;
                font-weight: bold;
            }
            .category-state.debug {
                color: #4a9cd6;
            }
            .category-state.info {
                color: #888;
            }
            .tabs {
                display: flex;
                gap: 5px;
                margin-top: 10px;
                border-bottom: 1px solid #333;
                padding: 0 10px;
            }
            .tab {
                padding: 8px 15px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                color: #888;
                border-bottom: 2px solid transparent;
            }
            .tab.active {
                color: #fff;
                border-bottom: 2px solid #4a9cd6;
            }
            .tab-content {
                display: none;
                flex: 1;
                overflow: auto;
            }
            .tab-content.active {
                display: block;
            }
            .timeline {
                position: relative;
                height: 500px;
                width: 100%;
                overflow-x: auto;
                background-color: #1e1e1e;
            }
            .timeline-grid {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                width: ${timelineData.totalWidth}px;
            }
            .timeline-grid-line {
                position: absolute;
                top: 0;
                height: 100%;
                width: 1px;
                background-color: #444;
            }
            .timeline-grid-label {
                position: absolute;
                top: 5px;
                color: #888;
                font-size: 10px;
            }
            .timeline-event {
                position: absolute;
                height: 20px;
                background-color: #2a6;
                border-radius: 2px;
                font-size: 10px;
                color: white;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding: 2px 4px;
                box-sizing: border-box;
                cursor: pointer;
            }
            .timeline-event.Execution { background-color: #2a6; }
            .timeline-event.DML { background-color: #a26; }
            .timeline-event.SOQL { background-color: #26a; }
            .timeline-event.Method { background-color: #62a; }
            .timeline-event.Flow { background-color: #a62; }
            
            .category-legend {
                display: flex;
                gap: 10px;
                margin: 10px;
                padding: 5px;
                background-color: #333;
            }
            .category-item {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .category-color {
                width: 15px;
                height: 15px;
                border-radius: 2px;
            }
            .execution-details {
                font-family: monospace;
                white-space: pre;
                padding: 10px;
                background-color: #1e1e1e;
                border: 1px solid #333;
                color: #ddd;
                margin: 15px;
            }
            .call-tree, .analysis, .database {
                padding: 20px;
                color: #ddd;
            }
            .placeholder-message {
                padding: 20px;
                color: #888;
                font-style: italic;
            }
            .bottom-legend {
                display: flex;
                gap: 0;
                margin-top: auto;
                background-color: #333;
                padding: 0;
            }
            .bottom-category {
                padding: 5px 10px;
                font-size: 12px;
                color: white;
                cursor: pointer;
            }
            .bottom-category.Code { background-color: #8a9a5b; }
            .bottom-category.Workflow { background-color: #5b8a9a; }
            .bottom-category.Method { background-color: #9a5b8a; }
            .bottom-category.Flow { background-color: #5b9a8a; }
            .bottom-category.DML { background-color: #9a8a5b; }
            .bottom-category.SOQL { background-color: #5b9a8a; }
            .bottom-category.System { background-color: #8a5b9a; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="file-info">
                <span class="file-name">${logFileName}</span>
                <div class="file-stats">
                    <span class="file-size">${logContent.length} bytes</span>
                    <span class="file-status">Ready</span>
                    <span class="file-issues">${events.length} issues</span>
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
        
        <div id="timeline" class="tab-content ${this.currentTab === 'timeline' ? 'active' : ''}">
            <div class="category-legend">
                <div class="category-item">
                    <div class="category-color" style="background-color: #2a6;"></div>
                    <span>Execution</span>
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
                    <div class="category-color" style="background-color: #62a;"></div>
                    <span>Method</span>
                </div>
                <div class="category-item">
                    <div class="category-color" style="background-color: #a62;"></div>
                    <span>Flow</span>
                </div>
            </div>
            
            <div class="timeline">
                <div class="timeline-grid">
                    ${this.generateTimelineGridHTML(timelineData)}
                    ${this.generateTimelineEventsHTML(events, timelineData)}
                </div>
            </div>
            
            <div class="execution-details">
                ${this.formatExecutionDetails(events)}
            </div>
        </div>
        
        <div id="callTree" class="tab-content ${this.currentTab === 'callTree' ? 'active' : ''}">
            <div class="placeholder-message">
                Call Tree view will be implemented in a future update.
            </div>
        </div>
        
        <div id="analysis" class="tab-content ${this.currentTab === 'analysis' ? 'active' : ''}">
            <div class="placeholder-message">
                Analysis view will be implemented in a future update.
            </div>
        </div>
        
        <div id="database" class="tab-content ${this.currentTab === 'database' ? 'active' : ''}">
            <div class="placeholder-message">
                Database view will be implemented in a future update.
            </div>
        </div>
        
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
            
            // Add interactivity for timeline events
            document.querySelectorAll('.timeline-event').forEach(event => {
                event.addEventListener('click', function() {
                    const details = this.getAttribute('data-details');
                    if (details) {
                        document.querySelector('.execution-details').textContent = details;
                    }
                });
            });
            
            // Get vscode API
            const vscode = acquireVsCodeApi();
        </script>
    </body>
    </html>`;
  }
  
  /**
   * Prepare timeline data for visualization
   */
  private static prepareTimelineData(events: LogEvent[]) {
    // Find the total duration to set the timeline width
    let maxTimestamp = 0;
    for (const event of events) {
      const endTime = event.timestamp + event.duration;
      if (endTime > maxTimestamp) {
        maxTimestamp = endTime;
      }
    }
    
    // Add some padding
    maxTimestamp = Math.ceil(maxTimestamp * 1.1);
    
    // Calculate pixels per millisecond (scale)
    const totalWidth = Math.max(1000, maxTimestamp / 10); // At least 1000px wide
    const scale = totalWidth / maxTimestamp;
    
    // Calculate grid lines (one every second or so)
    const gridInterval = Math.max(100, Math.ceil(maxTimestamp / 20)); // ms between grid lines
    const gridLines = [];
    
    for (let i = 0; i <= maxTimestamp; i += gridInterval) {
      gridLines.push({
        position: i * scale,
        label: `${(i / 1000).toFixed(1)}s`
      });
    }
    
    return {
      totalWidth,
      scale,
      gridLines,
      maxTimestamp
    };
  }
  
  /**
   * Generate HTML for the timeline grid
   */
  private static generateTimelineGridHTML(timelineData: any) {
    return timelineData.gridLines.map((line: any) => `
      <div class="timeline-grid-line" style="left: ${line.position}px;"></div>
      <div class="timeline-grid-label" style="left: ${line.position + 5}px;">${line.label}</div>
    `).join('');
  }
  
  /**
   * Generate HTML for timeline events
   */
  private static generateTimelineEventsHTML(events: LogEvent[], timelineData: any) {
    return events.map((event, index) => {
      const left = event.timestamp * timelineData.scale;
      const width = Math.max(5, event.duration * timelineData.scale); // Minimum 5px width for visibility
      const top = 30 + (index % 10) * 25; // Stagger events vertically
      
      const details = event.details ? event.details.join('\n') : event.message;
      
      return `
        <div class="timeline-event ${event.category}" 
             style="left: ${left}px; width: ${width}px; top: ${top}px;"
             title="${event.message}"
             data-details="${details.replace(/"/g, '&quot;')}">
          ${event.message.substring(0, 20)}${event.message.length > 20 ? '...' : ''}
        </div>
      `;
    }).join('');
  }
  
  /**
   * Format execution details for display
   */
  private static formatExecutionDetails(events: LogEvent[]) {
    // Find execution events with details
    const executionEvents = events.filter(e => e.category === 'Execution' && e.details);
    
    if (executionEvents.length === 0) {
      return 'Click on an event to see details';
    }
    
    // Display the first execution event details
    return executionEvents[0].details?.join('\n') || 'No details available';
  }
} 