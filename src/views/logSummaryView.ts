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
                    
                    // Log the click event
                    console.log('TAB CLICKED:', tabId);
                    
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
                
                console.log('MESSAGE RECEIVED:', message.command, message.tab);
                
                switch (message.command) {
                    case 'initializeView':
                        console.log('INITIALIZING VIEW:', message.tab);
                        initializeView(message.tab, message.data);
                        break;
                }
            });
            
            // Initialize the current view
            function initializeView(tabId, data) {
                console.log('INIT START:', tabId);
                
                const tabContent = document.getElementById(tabId);
                if (!tabContent) {
                    console.error('Tab content element not found for tab:', tabId);
                    return;
                }
                
                // Clear the tab content
                tabContent.innerHTML = '';
                
                // Check if we have data
                if (!data || !data.events || data.events.length === 0) {
                    console.error('No data available for tab:', tabId);
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'error-message';
                    errorMessage.textContent = 'No log data found. The log file may be empty or in an unsupported format.';
                    tabContent.appendChild(errorMessage);
                    return;
                }
                
                console.log('DATA STATS:', {
                    events: data.events.length,
                    codeUnits: data.codeUnits.length,
                    executionUnits: data.executionUnits.length,
                    dmlCount: data.statistics.dmlCount,
                    soqlCount: data.statistics.soqlCount
                });
                
                // Create loading container
                const loadingContainer = document.createElement('div');
                loadingContainer.className = 'loading-container';
                
                // Create loading indicator
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'loading-indicator';
                
                const spinner = document.createElement('div');
                spinner.className = 'loading-spinner';
                loadingIndicator.appendChild(spinner);
                
                const loadingText = document.createElement('span');
                loadingText.textContent = 'Processing log data...';
                loadingIndicator.appendChild(loadingText);
                
                loadingContainer.appendChild(loadingIndicator);
                
                // Create progress container
                const progressContainer = document.createElement('div');
                progressContainer.className = 'progress-container';
                
                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';
                progressBar.style.width = '0%';
                progressContainer.appendChild(progressBar);
                
                const progressText = document.createElement('div');
                progressText.className = 'progress-text';
                progressText.textContent = 'Initializing...';
                progressContainer.appendChild(progressText);
                
                loadingContainer.appendChild(progressContainer);
                
                // Create debug info container
                const debugInfo = document.createElement('div');
                debugInfo.className = 'debug-info';
                debugInfo.textContent = \`Tab: \${tabId}
Events: \${data.events.length}
Code Units: \${data.codeUnits.length}
Execution Units: \${data.executionUnits.length}
DML Count: \${data.statistics.dmlCount}
SOQL Count: \${data.statistics.soqlCount}\`;
                loadingContainer.appendChild(debugInfo);
                
                tabContent.appendChild(loadingContainer);
                
                console.log('LOADING CONTAINER ADDED');
                
                // Use setTimeout to allow the UI to update before heavy processing
                setTimeout(() => {
                    console.log('PROCESSING START:', tabId);
                    
                    // Update progress to 10%
                    progressBar.style.width = '10%';
                    progressText.textContent = 'Preparing data...';
                    
                    // Use another setTimeout to ensure the progress bar animation is visible
                    setTimeout(() => {
                        try {
                            console.log('RENDERING START:', tabId);
                            
                            // Render the appropriate view based on the tab
                            switch (tabId) {
                                case 'timeline':
                                    renderTimelineView(data.events.slice(0, 200), tabContent, loadingContainer, progressBar, progressText);
                                    break;
                                case 'callTree':
                                    renderCallTreeView(data.codeUnits, tabContent, loadingContainer, progressBar, progressText);
                                    break;
                                case 'analysis':
                                    renderAnalysisView(data.events, tabContent, loadingContainer, progressBar, progressText);
                                    break;
                                case 'database':
                                    renderDatabaseView(data.events, tabContent, loadingContainer, progressBar, progressText);
                                    break;
                            }
                        } catch (error) {
                            console.error('RENDERING ERROR:', error);
                            
                            // Show error message
                            loadingContainer.innerHTML = '';
                            const errorMessage = document.createElement('div');
                            errorMessage.className = 'error-message';
                            errorMessage.textContent = \`Error processing log data: \${error.message}\`;
                            loadingContainer.appendChild(errorMessage);
                            
                            // Add error details
                            const errorDetails = document.createElement('div');
                            errorDetails.className = 'debug-info';
                            errorDetails.textContent = error.stack;
                            loadingContainer.appendChild(errorDetails);
                            
                            console.error('Error processing log data:', error);
                        }
                    }, 100);
                }, 100);
            }
            
            // Render timeline view
            function renderTimelineView(events, container, loadingContainer, progressBar, progressText) {
                console.log('TIMELINE START with', events.length, 'events');
                
                // Update progress
                progressBar.style.width = '20%';
                progressText.textContent = 'Creating timeline view...';
                
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
                
                // Update progress
                progressBar.style.width = '30%';
                progressText.textContent = 'Calculating timeline metrics...';
                
                // Create the timeline container
                const timeline = document.createElement('div');
                timeline.className = 'timeline';
                
                // Create the timeline grid
                const timelineGrid = document.createElement('div');
                timelineGrid.className = 'timeline-grid';
                timeline.appendChild(timelineGrid);
                
                // Calculate timeline metrics
                console.log('TIMELINE: Calculating metrics');
                const timelineData = prepareTimelineData(events);
                
                // Set the width of the timeline grid
                timelineGrid.style.width = \`\${timelineData.totalWidth}px\`;
                
                // Update progress
                progressBar.style.width = '40%';
                progressText.textContent = 'Adding grid lines...';
                
                // Add grid lines
                console.log('TIMELINE: Adding grid lines');
                timelineGrid.innerHTML = generateTimelineGridHTML(timelineData);
                
                // Update progress
                progressBar.style.width = '50%';
                progressText.textContent = 'Rendering events...';
                
                // Add events in batches for better performance
                const batchSize = 50;
                let currentBatch = 0;
                const totalBatches = Math.ceil(events.length / batchSize);
                
                console.log('TIMELINE: Starting batch processing of', events.length, 'events');
                
                function addEventBatch() {
                    const start = currentBatch * batchSize;
                    const end = Math.min(start + batchSize, events.length);
                    const batch = events.slice(start, end);
                    
                    console.log('TIMELINE: Processing batch', currentBatch + 1, 'of', totalBatches, '(', start, '-', end, ')');
                    
                    if (batch.length === 0) return;
                    
                    const fragment = document.createDocumentFragment();
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = generateTimelineEventsHTML(batch, timelineData, start);
                    
                    while (tempDiv.firstChild) {
                        fragment.appendChild(tempDiv.firstChild);
                    }
                    
                    timelineGrid.appendChild(fragment);
                    
                    currentBatch++;
                    
                    // Update progress
                    const progress = 50 + Math.floor((currentBatch / totalBatches) * 40);
                    progressBar.style.width = \`\${progress}%\`;
                    progressText.textContent = \`Rendering events... \${currentBatch * batchSize > events.length ? events.length : currentBatch * batchSize} of \${events.length}\`;
                    
                    if (currentBatch * batchSize < events.length) {
                        setTimeout(addEventBatch, 0);
                    } else {
                        // All events added, now add event listeners
                        progressBar.style.width = '90%';
                        progressText.textContent = 'Adding event listeners...';
                        
                        console.log('TIMELINE: All batches processed, adding event listeners');
                        
                        setTimeout(() => {
                            // Create the execution details section
                            const executionDetails = document.createElement('div');
                            executionDetails.className = 'execution-details';
                            executionDetails.textContent = 'Click on an event to see details';
                            
                            // Add event listeners
                            document.querySelectorAll('.timeline-event').forEach(event => {
                                event.addEventListener('click', (e) => {
                                    console.log('EVENT CLICKED:', e.currentTarget.textContent.trim());
                                    
                                    const element = e.currentTarget;
                                    const details = element.getAttribute('data-details');
                                    if (details) {
                                        executionDetails.textContent = details;
                                    }
                                });
                            });
                            
                            // Update progress
                            progressBar.style.width = '100%';
                            progressText.textContent = 'Complete!';
                            
                            // Remove loading container and add content
                            container.removeChild(loadingContainer);
                            container.appendChild(legend);
                            container.appendChild(timeline);
                            container.appendChild(executionDetails);
                            
                            console.log('TIMELINE COMPLETE');
                        }, 100);
                    }
                }
                
                // Start adding events
                addEventBatch();
            }
            
            // Prepare timeline data for visualization
            function prepareTimelineData(events) {
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
                        label: \`\${(i / 1000).toFixed(1)}s\`
                    });
                }
                
                return {
                    totalWidth,
                    scale,
                    gridLines,
                    maxTimestamp
                };
            }
            
            // Generate HTML for the timeline grid
            function generateTimelineGridHTML(timelineData) {
                return timelineData.gridLines.map(line => \`
                    <div class="timeline-grid-line" style="left: \${line.position}px;"></div>
                    <div class="timeline-grid-label" style="left: \${line.position + 5}px;">\${line.label}</div>
                \`).join('');
            }
            
            // Generate HTML for timeline events with index offset
            function generateTimelineEventsHTML(events, timelineData, startIndex = 0) {
                return events.map((event, index) => {
                    const actualIndex = startIndex + index;
                    const left = event.timestamp * timelineData.scale;
                    const width = Math.max(5, event.duration * timelineData.scale); // Minimum 5px width for visibility
                    const top = 30 + (actualIndex % 10) * 25; // Stagger events vertically
                    
                    const details = event.details ? event.details.join('\\n') : event.message;
                    
                    return \`
                        <div class="timeline-event \${event.category}" 
                            style="left: \${left}px; width: \${width}px; top: \${top}px;"
                            title="\${event.message}"
                            data-details="\${details.replace(/"/g, '&quot;')}">
                            \${event.message.substring(0, 20)}\${event.message.length > 20 ? '...' : ''}
                        </div>
                    \`;
                }).join('');
            }
            
            // Render call tree view
            function renderCallTreeView(codeUnits, container, loadingContainer, progressBar, progressText) {
                console.log('CALL TREE START with', codeUnits.length, 'code units');
                
                // Update progress
                progressBar.style.width = '20%';
                progressText.textContent = 'Creating call tree view...';
                
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
                
                // Update progress
                progressBar.style.width = '30%';
                progressText.textContent = 'Creating table header...';
                
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
                
                // Create the table body
                const tableBody = document.createElement('div');
                tableBody.className = 'call-tree-body';
                
                // Update progress
                progressBar.style.width = '40%';
                progressText.textContent = 'Processing code units...';
                
                // Check if we have any code units
                if (!codeUnits || codeUnits.length === 0) {
                    console.log('CALL TREE: No code units found');
                    
                    progressBar.style.width = '100%';
                    progressText.textContent = 'No code units found';
                    
                    const noData = document.createElement('div');
                    noData.className = 'placeholder-message';
                    noData.textContent = 'No code units found in the log file.';
                    tableBody.appendChild(noData);
                    
                    // Remove loading container and add content
                    container.removeChild(loadingContainer);
                    container.appendChild(filterControls);
                    container.appendChild(tableHeader);
                    container.appendChild(tableBody);
                    return;
                }
                
                // Update progress
                progressBar.style.width = '50%';
                progressText.textContent = 'Rendering code units...';
                
                console.log('CALL TREE: Starting to render code units');
                
                // Render code units with progress updates
                renderCodeUnitsWithProgress(codeUnits, tableBody, 0, () => {
                    // Update progress
                    progressBar.style.width = '90%';
                    progressText.textContent = 'Adding event listeners...';
                    
                    console.log('CALL TREE: Code units rendered, adding event listeners');
                    
                    setTimeout(() => {
                        // Add event listeners
                        // Expand/collapse buttons
                        const expandBtn = filterControls.querySelector('.expand-btn');
                        if (expandBtn) {
                            expandBtn.addEventListener('click', () => {
                                console.log('EXPAND BUTTON CLICKED');
                                
                                document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
                                    row.classList.add('expanded');
                                    const childrenContainer = row.nextElementSibling;
                                    if (childrenContainer && childrenContainer.classList.contains('children-container')) {
                                        childrenContainer.style.display = 'block';
                                    }
                                });
                            });
                        }
                        
                        const collapseBtn = filterControls.querySelector('.collapse-btn');
                        if (collapseBtn) {
                            collapseBtn.addEventListener('click', () => {
                                console.log('COLLAPSE BUTTON CLICKED');
                                
                                document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
                                    row.classList.remove('expanded');
                                    const childrenContainer = row.nextElementSibling;
                                    if (childrenContainer && childrenContainer.classList.contains('children-container')) {
                                        childrenContainer.style.display = 'none';
                                    }
                                });
                            });
                        }
                        
                        // Toggle row expansion
                        document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
                            row.addEventListener('click', (e) => {
                                console.log('ROW CLICKED:', e.currentTarget.textContent.trim().substring(0, 50));
                                
                                const element = e.currentTarget;
                                element.classList.toggle('expanded');
                                const childrenContainer = element.nextElementSibling;
                                if (childrenContainer && childrenContainer.classList.contains('children-container')) {
                                    childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
                                }
                            });
                        });
                        
                        // Update progress
                        progressBar.style.width = '100%';
                        progressText.textContent = 'Complete!';
                        
                        // Remove loading container and add content
                        container.removeChild(loadingContainer);
                        container.appendChild(filterControls);
                        container.appendChild(tableHeader);
                        container.appendChild(tableBody);
                        
                        console.log('CALL TREE COMPLETE');
                    }, 100);
                });
            }
            
            // Render code units recursively with progress updates
            function renderCodeUnitsWithProgress(codeUnits, container, level = 0, onComplete = null) {
                // Filter out units that have parents (they will be rendered by their parents)
                const rootUnits = codeUnits.filter(unit => !unit.parent);
                
                console.log('RENDER CODE UNITS: Found', rootUnits.length, 'root units at level', level);
                
                // Limit to first 100 root units for performance
                const limitedRootUnits = rootUnits.slice(0, 100);
                
                let processedUnits = 0;
                const totalUnits = limitedRootUnits.length;
                
                function processNextUnit() {
                    if (processedUnits >= totalUnits) {
                        console.log('RENDER CODE UNITS: All units processed at level', level);
                        
                        // Show message if there are more units
                        if (rootUnits.length > limitedRootUnits.length) {
                            const moreUnits = document.createElement('div');
                            moreUnits.className = 'call-tree-row';
                            moreUnits.innerHTML = \`<div class="call-tree-cell name" style="color: #888;">... \${rootUnits.length - limitedRootUnits.length} more units not shown for performance reasons</div>\`;
                            container.appendChild(moreUnits);
                        }
                        
                        if (onComplete) onComplete();
                        return;
                    }
                    
                    const unit = limitedRootUnits[processedUnits];
                    renderCodeUnit(unit, container, level);
                    processedUnits++;
                    
                    // Update progress if available
                    const progressBar = document.querySelector('.progress-bar');
                    const progressText = document.querySelector('.progress-text');
                    if (progressBar && progressText) {
                        const progress = 50 + Math.floor((processedUnits / totalUnits) * 40);
                        progressBar.style.width = \`\${progress}%\`;
                        progressText.textContent = \`Rendering code units... \${processedUnits} of \${totalUnits}\`;
                    }
                    
                    // Process next unit with a small delay to keep UI responsive
                    setTimeout(processNextUnit, 0);
                }
                
                // Start processing units
                processNextUnit();
            }
            
            // Render a single code unit and its children
            function renderCodeUnit(unit, container, level) {
                // Create the row
                const row = document.createElement('div');
                row.className = \`call-tree-row \${unit.children && unit.children.length > 0 ? 'expandable expanded' : ''}\`;
                row.style.paddingLeft = \`\${level * 20}px\`;
                
                // Format the name with an expand/collapse icon if it has children
                const hasChildren = unit.children && unit.children.length > 0;
                const nameWithIcon = hasChildren ? 
                    \`<span class="expand-icon">▼</span> \${unit.message}\` : 
                    \`<span class="spacer"></span> \${unit.message}\`;
                
                row.innerHTML = \`
                    <div class="call-tree-cell name">\${nameWithIcon}</div>
                    <div class="call-tree-cell namespace">\${unit.namespace || 'Unknown'}</div>
                    <div class="call-tree-cell dml">\${unit.dmlCount || 0}</div>
                    <div class="call-tree-cell soql">\${unit.soqlCount || 0}</div>
                    <div class="call-tree-cell rows">\${unit.rowsCount || 0}</div>
                    <div class="call-tree-cell total-time">\${formatTime(unit.totalTime || 0)}</div>
                    <div class="call-tree-cell self-time">\${formatTime(unit.selfTime || 0)}</div>
                \`;
                
                container.appendChild(row);
                
                // Render children if any (but limit depth for performance)
                if (hasChildren && level < 10) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'children-container';
                    childrenContainer.style.display = 'block'; // Initially expanded
                    container.appendChild(childrenContainer);
                    
                    // Limit to first 20 children for performance
                    const limitedChildren = unit.children.slice(0, 20);
                    
                    for (const child of limitedChildren) {
                        renderCodeUnit(child, childrenContainer, level + 1);
                    }
                    
                    // Show message if there are more children
                    if (unit.children.length > limitedChildren.length) {
                        const moreChildren = document.createElement('div');
                        moreChildren.className = 'call-tree-row';
                        moreChildren.style.paddingLeft = \`\${(level + 1) * 20}px\`;
                        moreChildren.innerHTML = \`<div class="call-tree-cell name" style="color: #888;">... \${unit.children.length - limitedChildren.length} more children not shown for performance reasons</div>\`;
                        childrenContainer.appendChild(moreChildren);
                    }
                } else if (hasChildren && level >= 10) {
                    // Show message if we've reached max depth
                    const maxDepth = document.createElement('div');
                    maxDepth.className = 'call-tree-row';
                    maxDepth.style.paddingLeft = \`\${(level + 1) * 20}px\`;
                    maxDepth.innerHTML = \`<div class="call-tree-cell name" style="color: #888;">... \${unit.children.length} children not shown (max depth reached)</div>\`;
                    container.appendChild(maxDepth);
                }
            }
            
            // Format time value with proper precision
            function formatTime(time) {
                return time.toFixed(3);
            }
            
            // Render analysis view
            function renderAnalysisView(events, container, loadingContainer, progressBar, progressText) {
                console.log('ANALYSIS START with', events.length, 'events');
                
                // Update progress
                progressBar.style.width = '20%';
                progressText.textContent = 'Creating analysis view...';
                
                // Create the analysis container
                const analysisContainer = document.createElement('div');
                analysisContainer.className = 'analysis-container';
                
                // Update progress
                progressBar.style.width = '40%';
                progressText.textContent = 'Calculating performance metrics...';
                
                console.log('ANALYSIS: Calculating performance metrics');
                
                // Calculate total execution time
                const totalExecutionTime = getTotalExecutionTime(events);
                
                // Update progress
                progressBar.style.width = '60%';
                progressText.textContent = 'Creating performance summary...';
                
                console.log('ANALYSIS: Creating performance summary');
                
                // Add performance summary section
                const performanceSection = document.createElement('div');
                performanceSection.className = 'analysis-section';
                performanceSection.innerHTML = \`
                    <h3>Performance Summary</h3>
                    <table class="analysis-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Total Execution Time</td>
                                <td>\${totalExecutionTime.toFixed(3)} ms</td>
                            </tr>
                            <tr>
                                <td>DML Operations</td>
                                <td>\${countEventsByCategory(events, 'DML')}</td>
                            </tr>
                            <tr>
                                <td>SOQL Queries</td>
                                <td>\${countEventsByCategory(events, 'SOQL')}</td>
                            </tr>
                            <tr>
                                <td>Code Units</td>
                                <td>\${countEventsByCategory(events, 'CodeUnit')}</td>
                            </tr>
                        </tbody>
                    </table>
                \`;
                analysisContainer.appendChild(performanceSection);
                
                // Update progress
                progressBar.style.width = '80%';
                progressText.textContent = 'Finding top time consumers...';
                
                console.log('ANALYSIS: Finding top time consumers');
                
                // Get top time consumers
                const topConsumers = getTopTimeConsumers(events, 10);
                
                // Add top time consumers section
                const timeConsumersSection = document.createElement('div');
                timeConsumersSection.className = 'analysis-section';
                timeConsumersSection.innerHTML = \`
                    <h3>Top Time Consumers</h3>
                    <table class="analysis-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Time (ms)</th>
                                <th>% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${topConsumers.map(event => \`
                                <tr>
                                    <td>\${event.message}</td>
                                    <td>\${event.category}</td>
                                    <td>\${event.duration.toFixed(3)}</td>
                                    <td>\${calculatePercentage(event.duration, totalExecutionTime).toFixed(2)}%</td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                analysisContainer.appendChild(timeConsumersSection);
                
                // Update progress
                progressBar.style.width = '100%';
                progressText.textContent = 'Complete!';
                
                // Remove loading container and add content
                container.removeChild(loadingContainer);
                container.appendChild(analysisContainer);
                
                console.log('ANALYSIS COMPLETE');
            }
            
            // Get the total execution time from events
            function getTotalExecutionTime(events) {
                const executionEvents = events.filter(e => e.category === 'Execution');
                if (executionEvents.length === 0) {
                    return 0;
                }
                
                return executionEvents.reduce((total, event) => total + (event.duration || 0), 0);
            }
            
            // Count events by category
            function countEventsByCategory(events, category) {
                return events.filter(e => e.category === category).length;
            }
            
            // Get top time consumers
            function getTopTimeConsumers(events, limit) {
                return [...events]
                    .filter(e => e.duration && e.duration > 0)
                    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
                    .slice(0, limit);
            }
            
            // Calculate percentage
            function calculatePercentage(value, total) {
                if (total === 0) {
                    return 0;
                }
                
                return (value / total) * 100;
            }
            
            // Render database view
            function renderDatabaseView(events, container, loadingContainer, progressBar, progressText) {
                console.log('DATABASE START with', events.length, 'events');
                
                // Update progress
                progressBar.style.width = '20%';
                progressText.textContent = 'Creating database view...';
                
                // Create the database container
                const databaseContainer = document.createElement('div');
                databaseContainer.className = 'database-container';
                
                // Update progress
                progressBar.style.width = '40%';
                progressText.textContent = 'Filtering database operations...';
                
                console.log('DATABASE: Filtering operations');
                
                // Filter SOQL and DML events
                const soqlEvents = events.filter(e => e.category === 'SOQL');
                const dmlEvents = events.filter(e => e.category === 'DML');
                
                console.log('DATABASE: Found', soqlEvents.length, 'SOQL queries and', dmlEvents.length, 'DML operations');
                
                // Update progress
                progressBar.style.width = '60%';
                progressText.textContent = 'Rendering SOQL queries...';
                
                // Add SOQL queries section
                const soqlSection = document.createElement('div');
                soqlSection.className = 'analysis-section';
                soqlSection.innerHTML = \`
                    <h3>SOQL Queries (\${soqlEvents.length})</h3>
                    \${renderQueryList(soqlEvents)}
                \`;
                databaseContainer.appendChild(soqlSection);
                
                // Update progress
                progressBar.style.width = '80%';
                progressText.textContent = 'Rendering DML operations...';
                
                // Add DML operations section
                const dmlSection = document.createElement('div');
                dmlSection.className = 'analysis-section';
                dmlSection.innerHTML = \`
                    <h3>DML Operations (\${dmlEvents.length})</h3>
                    \${renderQueryList(dmlEvents)}
                \`;
                databaseContainer.appendChild(dmlSection);
                
                // Update progress
                progressBar.style.width = '100%';
                progressText.textContent = 'Complete!';
                
                // Remove loading container and add content
                container.removeChild(loadingContainer);
                container.appendChild(databaseContainer);
                
                console.log('DATABASE COMPLETE');
            }
            
            // Render a list of queries
            function renderQueryList(events) {
                if (events.length === 0) {
                    return '<p class="placeholder-message">No operations found.</p>';
                }
                
                return \`
                    <div class="query-list">
                        \${events.map(event => \`
                            <div class="query-item">
                                <div class="query-header">
                                    <span class="query-type">\${event.category}</span>
                                    <span class="query-time">\${event.duration?.toFixed(3) || 'N/A'} ms</span>
                                </div>
                                <div class="query-text">\${formatQueryText(event.message)}</div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }
            
            // Format query text for display
            function formatQueryText(text) {
                if (!text) {
                    return 'No query text available';
                }
                
                // Escape HTML
                const escaped = text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                
                // Highlight SQL keywords
                return escaped.replace(
                    /\\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|INSERT|UPDATE|DELETE|SET)\\b/gi,
                    '<span style="color: #4a9cd6; font-weight: bold;">$1</span>'
                );
            }
        </script>
    </body>
    </html>`;
  }
} 