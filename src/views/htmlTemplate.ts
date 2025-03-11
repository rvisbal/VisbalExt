import { ParsedLogData, Tab, LogCategory } from './types';
import { styles } from './styles';

/**
 * Returns the HTML template for the webview
 * @param parsedData The parsed log data
 * @param logFileName The log file name
 * @param fileSize The file size in KB
 * @param currentTab The current active tab
 * @param tabs The available tabs
 * @param categories The available categories
 * @returns The HTML template
 */
export function getHtmlTemplate(
    parsedData: ParsedLogData, 
    logFileName: string, 
    fileSize: string,
    currentTab: string,
    tabs: Tab[],
    categories: LogCategory[]
): string {
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
                ${categories.map(cat => `
                    <div class="category">
                        <span class="category-name">${cat.label}:</span>
                        <span class="category-state ${cat.state.toLowerCase()}">${cat.state}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="tabs">
            ${tabs.map(tab => `
                <div class="tab ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                    <span class="tab-icon">${tab.icon}</span>
                    <span class="tab-label">${tab.label}</span>
                </div>
            `).join('')}
        </div>
        
        <div id="overview" class="tab-content ${currentTab === 'overview' ? 'active' : ''}"></div>
        <div id="timeline" class="tab-content ${currentTab === 'timeline' ? 'active' : ''}"></div>
        <div id="callTree" class="tab-content ${currentTab === 'callTree' ? 'active' : ''}"></div>
        <div id="analysis" class="tab-content ${currentTab === 'analysis' ? 'active' : ''}"></div>
        <div id="database" class="tab-content ${currentTab === 'database' ? 'active' : ''}"></div>
        
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
                    console.log('RV:TAB CLICKED:', tabId);
                    
                    // Update active tab UI immediately
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Update tab content visibility immediately
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    const tabContent = document.getElementById(tabId);
                    if (tabContent) {
                        tabContent.classList.add('active');
                    }
                    
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
                
                console.log('RV:MESSAGE RECEIVED:', message.command, message.tab);
                
                switch (message.command) {
                    case 'initializeView':
                        console.log('RV:INITIALIZING VIEW:', message.tab);
                        initializeView(message.tab, message.data);
                        break;
                }
            });
            
            // Initialize the current view
            function initializeView(tabId, data) {
                console.log('RV:INIT START:', tabId);
                console.log('RV:INIT DATA STRUCTURE:', {
                    hasEvents: !!data?.events,
                    eventCount: data?.events?.length || 0,
                    hasCodeUnits: !!data?.codeUnits,
                    codeUnitCount: data?.codeUnits?.length || 0,
                    hasExecutionUnits: !!data?.executionUnits,
                    executionUnitCount: data?.executionUnits?.length || 0,
                    hasStatistics: !!data?.statistics,
                    dmlCount: data?.statistics?.dmlCount || 0,
                    soqlCount: data?.statistics?.soqlCount || 0
                });
                
                // Make sure the correct tab is active in the UI
                document.querySelectorAll('.tab').forEach(tab => {
                    if (tab.getAttribute('data-tab') === tabId) {
                        tab.classList.add('active');
                    } else {
                        tab.classList.remove('active');
                    }
                });
                
                // Make sure the correct tab content is visible
                document.querySelectorAll('.tab-content').forEach(content => {
                    if (content.id === tabId) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
                
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
                
                console.log('RV:DATA STATS:', {
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
                
                console.log('RV:LOADING CONTAINER ADDED');
                
                // Use setTimeout to allow the UI to update before heavy processing
                setTimeout(() => {
                    console.log('RV:PROCESSING START:', tabId);
                    
                    // Update progress to 10%
                    progressBar.style.width = '10%';
                    progressText.textContent = 'Preparing data...';
                    
                    // Use another setTimeout to ensure the progress bar animation is visible
                    setTimeout(() => {
                        try {
                            console.log('RV:RENDERING START:', tabId);
                            
                            // Render the appropriate view based on the tab
                            switch (tabId) {
                                case 'overview':
                                    renderOverviewView(data, tabContent, loadingContainer, progressBar, progressText);
                                    break;
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
            
            // Render overview view
            function renderOverviewView(data, container, loadingContainer, progressBar, progressText) {
                console.log('RV:OVERVIEW START');
                
                // Update progress
                progressBar.style.width = '50%';
                progressText.textContent = 'Creating overview...';
                
                // Create the overview container
                const overviewContainer = document.createElement('div');
                overviewContainer.className = 'overview-container';
                
                // Add a welcome message
                const welcomeMessage = document.createElement('h2');
                welcomeMessage.textContent = 'Hello! Welcome to the Log Summary View';
                overviewContainer.appendChild(welcomeMessage);
                
                // Add a description
                const description = document.createElement('p');
                description.textContent = 'This extension helps you analyze Salesforce debug logs. Use the tabs above to explore different aspects of your log file.';
                overviewContainer.appendChild(description);
                
                // Add log statistics
                const statsSection = document.createElement('div');
                statsSection.className = 'overview-section';
                statsSection.innerHTML = \`
                    <h3>Log Statistics</h3>
                    <table class="overview-table">
                        <tr>
                            <td>Total Events:</td>
                            <td>\${data.events.length}</td>
                        </tr>
                        <tr>
                            <td>Code Units:</td>
                            <td>\${data.codeUnits.length}</td>
                        </tr>
                        <tr>
                            <td>DML Operations:</td>
                            <td>\${data.statistics.dmlCount}</td>
                        </tr>
                        <tr>
                            <td>SOQL Queries:</td>
                            <td>\${data.statistics.soqlCount}</td>
                        </tr>
                    </table>
                \`;
                overviewContainer.appendChild(statsSection);
                
                // Add tab descriptions
                const tabsSection = document.createElement('div');
                tabsSection.className = 'overview-section';
                tabsSection.innerHTML = \`
                    <h3>Available Views</h3>
                    <ul class="tab-descriptions">
                        <li><strong>Timeline</strong> - Visualize events over time</li>
                        <li><strong>Call Tree</strong> - Explore the hierarchy of code execution</li>
                        <li><strong>Analysis</strong> - Performance metrics and statistics</li>
                        <li><strong>Database</strong> - SOQL queries and DML operations</li>
                    </ul>
                \`;
                overviewContainer.appendChild(tabsSection);
                
                // Update progress
                progressBar.style.width = '100%';
                progressText.textContent = 'Complete!';
                
                // Remove loading container and add content
                container.removeChild(loadingContainer);
                container.appendChild(overviewContainer);
                
                console.log('RV:OVERVIEW COMPLETE');
            }
            
            // Render timeline view
            function renderTimelineView(events, container, loadingContainer, progressBar, progressText) {
                // ... existing code ...
            }
            
            // ... other render functions ...
        </script>
    </body>
    </html>`;
} 