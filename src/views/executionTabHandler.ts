import * as vscode from 'vscode';
import { OrgUtils } from '../utils/orgUtils';

/**
 * Class to handle the execution tab functionality
 */
export class ExecutionTabHandler {
    // Mapping between start and end markers for execution units
    private static readonly EXECUTION_MARKERS: Record<string, string> = {
        'EXECUTION_STARTED': 'EXECUTION_FINISHED',
        'CODE_UNIT_STARTED': 'CODE_UNIT_FINISHED',
        'METHOD_ENTRY': 'METHOD_EXIT',
        'FLOW_START': 'FLOW_FINISH',
        'CONSTRUCTOR_ENTRY': 'CONSTRUCTOR_EXIT',
        'TRIGGER_START': 'TRIGGER_END',
        'SOQL_EXECUTE_BEGIN': 'SOQL_EXECUTE_END',
        'DML_BEGIN': 'DML_END',
        'VALIDATION_RULE': 'VALIDATION_PASS',
        'CALLOUT_REQUEST': 'CALLOUT_RESPONSE',
        'SYSTEM_MODE_ENTER': 'SYSTEM_MODE_EXIT'
    };

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
                <div class="filter-controls">
                    <div class="filter-row">
                        <label for="execution-filter-type">Type:</label>
                        <select id="execution-filter-type">
                            <option value="all">All</option>
                            <option value="debug-only">Debug Only</option>
                            <option value="none">None</option>
                        </select>
                    </div>
                    <div class="filter-buttons">
                        <button id="expand-all">Expand</button>
                        <button id="collapse-all">Collapse</button>
                        <label><input type="checkbox" id="show-details"> Details</label>
                        <label><input type="checkbox" id="debug-only"> Debug Only</label>
                    </div>
                </div>
                
                <table class="execution-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-sort="name">Name <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="codeUnit">Code Unit <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="namespace">Namespace <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="dmlCount">DML Count <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="soqlCount">SOQL Count <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="throwsCount">Throws Count <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="rows">Rows <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="totalTime">Total Time (ms) <span class="sort-icon">↕</span></th>
                            <th class="sortable" data-sort="selfTime">Self Time (ms) <span class="sort-icon">↕</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="9">No execution data available</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td>Total</td>
                            <td></td>
                            <td></td>
                            <td id="total-dml-count">0</td>
                            <td id="total-soql-count">0</td>
                            <td id="total-throws-count">0</td>
                            <td id="total-rows">0</td>
                            <td id="total-time">0.000 (100.00%)</td>
                            <td id="total-self-time">0.000 (0.00%)</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <style>
                .filter-controls {
                    margin-bottom: 15px;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .filter-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                    gap: 10px;
                }
                
                .filter-buttons {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                
                .execution-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                .execution-table th, .execution-table td {
                    padding: 6px 8px;
                    border: 1px solid var(--vscode-panel-border);
                    text-align: left;
                }
                
                .execution-table th {
                    background-color: var(--vscode-editor-background);
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    cursor: pointer;
                }
                
                .execution-table th.sortable:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .execution-table tbody tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .execution-table .parent-row {
                    font-weight: bold;
                }
                
                .execution-table .child-row {
                    font-weight: normal;
                }
                
                .execution-table .child-row.collapsed {
                    display: none;
                }
                
                .execution-table .child-cell {
                    padding-left: 30px;
                }
                
                .execution-table .expand-collapse {
                    display: inline-block;
                    width: 16px;
                    cursor: pointer;
                    user-select: none;
                }
                
                .execution-table .total-row {
                    font-weight: bold;
                    background-color: var(--vscode-editor-background);
                }
                
                .execution-table .debug-row {
                    color: var(--vscode-debugIcon-startForeground, #89d185);
                }
                
                .execution-table .hidden {
                    display: none;
                }
            </style>
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
                console.log('[VisbalExt.VisbalLogView:WebView] Updating execution tab with data:', executionData);
                const placeholder = document.getElementById('execution-tab-placeholder');
                
                if (!placeholder) {
                    console.error('[VisbalExt.VisbalLogView:WebView] Execution tab placeholder not found');
                    return;
                }
                
                // Find the table body
                const tbody = placeholder.querySelector('tbody');
                if (!tbody) {
                    console.error('[VisbalExt.VisbalLogView:WebView] Execution table body not found');
                    return;
                }
                
                // Clear existing rows
                tbody.innerHTML = '';
                
                if (!executionData || executionData.length === 0) {
                    const row = document.createElement('tr');
                    row.innerHTML = '<td colspan="9">No execution data available</td>';
                    tbody.appendChild(row);
                    return;
                }
                
                // Process execution data to create a hierarchical structure
                const processedData = processExecutionData(executionData);
                
                // Add rows to the table
                let rowCounter = 0;
                processedData.forEach(unit => {
                    addExecutionRow(tbody, unit, null, rowCounter++);
                });
                
                // Setup event handlers
                setupExecutionTabHandlers();
                
                // Update totals
                updateTotals();
            }
            
            // Process execution data to create a hierarchical structure
            function processExecutionData(executionData) {
                // The data is already in a hierarchical structure from extractExecutionPath
                // Just need to ensure it has all the properties needed for display
                
                // Calculate the total execution time for percentage calculations
                let totalExecutionTime = 0;
                executionData.forEach(unit => {
                    if (unit.totalTime > totalExecutionTime) {
                        totalExecutionTime = unit.totalTime;
                    }
                });
                
                // Set the total execution time for percentage calculations
                window.totalExecutionTime = totalExecutionTime;
                
                return executionData;
            }
            
            // Add an execution row to the table
            function addExecutionRow(tbody, unit, parentId, rowId) {
                const isDebug = unit.type === 'USER_DEBUG' || (unit.name && unit.name.includes('DEBUG'));
                const rowIdStr = 'row-' + rowId;
                
                // Create parent row
                const row = document.createElement('tr');
                row.className = 'parent-row' + (isDebug ? ' debug-row' : '');
                row.setAttribute('data-id', rowIdStr);
                row.setAttribute('data-expanded', 'false');
                row.setAttribute('data-name', unit.name || '');
                row.setAttribute('data-code-unit', unit.codeUnit || '');
                row.setAttribute('data-namespace', unit.namespace || 'default');
                row.setAttribute('data-dml-count', unit.dmlCount || 0);
                row.setAttribute('data-soql-count', unit.soqlCount || 0);
                row.setAttribute('data-throws-count', unit.throwsCount || 0);
                row.setAttribute('data-rows', unit.rows || 0);
                row.setAttribute('data-total-time', unit.totalTime || 0);
                row.setAttribute('data-self-time', unit.selfTime || 0);
                
                if (parentId) {
                    row.className += ' child-row collapsed';
                    row.setAttribute('data-parent', parentId);
                }
                
                // Format the display name
                let displayName = unit.name || 'Unknown';
                
                // Add type prefix for certain types to make them more identifiable
                if (unit.type && !displayName.includes(unit.type)) {
                    if (unit.type === 'DML') {
                        displayName = 'DML: ' + displayName;
                    } else if (unit.type === 'SOQL') {
                        displayName = 'SOQL: ' + displayName;
                    } else if (unit.type === 'FLOW') {
                        displayName = 'Flow: ' + displayName;
                    } else if (unit.type === 'TRIGGER') {
                        displayName = 'Trigger: ' + displayName;
                    } else if (unit.type === 'VALIDATION') {
                        displayName = 'Validation: ' + displayName;
                    } else if (unit.type === 'CALLOUT') {
                        displayName = 'Callout: ' + displayName;
                    }
                }
                
                // Calculate percentages for time columns
                const totalTime = unit.totalTime || 0;
                const selfTime = unit.selfTime || 0;
                const totalTimePercentage = ((totalTime / getTotalTime()) * 100).toFixed(2);
                const selfTimePercentage = totalTime > 0 ? ((selfTime / totalTime) * 100).toFixed(2) : '0.00';
                
                row.innerHTML = 
                    '<td>' + 
                        '<span class="expand-collapse">▶</span> ' + 
                        displayName + 
                    '</td>' +
                    '<td>' + (unit.codeUnit || '') + '</td>' +
                    '<td>' + (unit.namespace || 'default') + '</td>' +
                    '<td>' + (unit.dmlCount || 0) + '</td>' +
                    '<td>' + (unit.soqlCount || 0) + '</td>' +
                    '<td>' + (unit.throwsCount || 0) + '</td>' +
                    '<td>' + (unit.rows || 0) + '</td>' +
                    '<td>' + totalTime.toFixed(3) + ' (' + totalTimePercentage + '%)</td>' +
                    '<td>' + selfTime.toFixed(3) + ' (' + selfTimePercentage + '%)</td>';
                
                tbody.appendChild(row);
                
                // Add child rows for details if available
                if (unit.details && unit.details.length > 0) {
                    // Only add the first and last detail as they're usually the most important
                    if (unit.details.length > 1) {
                        const firstDetail = unit.details[0];
                        const lastDetail = unit.details[unit.details.length - 1];
                        
                        // Add first detail
                        const firstDetailRow = document.createElement('tr');
                        firstDetailRow.className = 'child-row collapsed';
                        firstDetailRow.setAttribute('data-parent', rowIdStr);
                        firstDetailRow.innerHTML = '<td colspan="9" class="detail-cell">Start: ' + firstDetail + '</td>';
                        tbody.appendChild(firstDetailRow);
                        
                        // Add last detail if different from first
                        if (firstDetail !== lastDetail) {
                            const lastDetailRow = document.createElement('tr');
                            lastDetailRow.className = 'child-row collapsed';
                            lastDetailRow.setAttribute('data-parent', rowIdStr);
                            lastDetailRow.innerHTML = '<td colspan="9" class="detail-cell">End: ' + lastDetail + '</td>';
                            tbody.appendChild(lastDetailRow);
                        }
                    } else {
                        // Just add the single detail
                        const detailRow = document.createElement('tr');
                        detailRow.className = 'child-row collapsed';
                        detailRow.setAttribute('data-parent', rowIdStr);
                        detailRow.innerHTML = '<td colspan="9" class="detail-cell">' + unit.details[0] + '</td>';
                        tbody.appendChild(detailRow);
                    }
                }
                
                // Add child rows for children if available
                if (unit.children && unit.children.length > 0) {
                    unit.children.forEach((child, index) => {
                        addExecutionRow(tbody, child, rowIdStr, rowId + '-' + index);
                    });
                }
            }
            
            // Get the total execution time
            function getTotalTime() {
                return window.totalExecutionTime || 100; // Default to 100 if not set
            }
            
            // Update totals in the footer
            function updateTotals() {
                const visibleRows = Array.from(document.querySelectorAll('.execution-table tbody tr.parent-row:not(.hidden)'));
                
                let totalDml = 0;
                let totalSoql = 0;
                let totalThrows = 0;
                let totalRows = 0;
                let totalTime = 0;
                let totalSelfTime = 0;
                
                visibleRows.forEach(row => {
                    totalDml += parseInt(row.getAttribute('data-dml-count') || '0');
                    totalSoql += parseInt(row.getAttribute('data-soql-count') || '0');
                    totalThrows += parseInt(row.getAttribute('data-throws-count') || '0');
                    totalRows += parseInt(row.getAttribute('data-rows') || '0');
                    totalTime += parseFloat(row.getAttribute('data-total-time') || '0');
                    totalSelfTime += parseFloat(row.getAttribute('data-self-time') || '0');
                });
                
                document.getElementById('total-dml-count').textContent = totalDml;
                document.getElementById('total-soql-count').textContent = totalSoql;
                document.getElementById('total-throws-count').textContent = totalThrows;
                document.getElementById('total-rows').textContent = totalRows;
                document.getElementById('total-time').textContent = 
                    totalTime.toFixed(3) + ' (100.00%)';
                document.getElementById('total-self-time').textContent = 
                    totalSelfTime.toFixed(3) + ' (' + ((totalSelfTime / totalTime) * 100).toFixed(2) + '%)';
            }
            
            // Setup event handlers for the execution tab
            function setupExecutionTabHandlers() {
                // Setup sorting
                document.querySelectorAll('.execution-table th.sortable').forEach(header => {
                    header.addEventListener('click', () => {
                        const sortBy = header.getAttribute('data-sort');
                        const currentDirection = header.getAttribute('data-direction') || 'asc';
                        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
                        
                        // Reset all headers
                        document.querySelectorAll('.execution-table th.sortable').forEach(h => {
                            h.setAttribute('data-direction', '');
                        });
                        
                        // Set new direction
                        header.setAttribute('data-direction', newDirection);
                        
                        sortTable(sortBy, newDirection);
                    });
                });
                
                // Setup expand/collapse
                document.querySelectorAll('.execution-table .expand-collapse').forEach(button => {
                    button.addEventListener('click', event => {
                        const row = event.target.closest('tr');
                        const rowId = row.getAttribute('data-id');
                        const isExpanded = row.getAttribute('data-expanded') === 'true';
                        
                        // Toggle expanded state
                        row.setAttribute('data-expanded', !isExpanded);
                        event.target.textContent = isExpanded ? '▶' : '▼';
                        
                        // Toggle child rows
                        document.querySelectorAll('tr[data-parent="' + rowId + '"]').forEach(childRow => {
                            childRow.classList.toggle('collapsed', isExpanded);
                        });
                    });
                });
                
                // Setup expand all button
                document.getElementById('expand-all').addEventListener('click', () => {
                    document.querySelectorAll('.execution-table .child-row').forEach(row => {
                        row.classList.remove('collapsed');
                    });
                    
                    document.querySelectorAll('.execution-table .parent-row').forEach(row => {
                        row.setAttribute('data-expanded', 'true');
                        const expandButton = row.querySelector('.expand-collapse');
                        if (expandButton) {
                            expandButton.textContent = '▼';
                        }
                    });
                });
                
                // Setup collapse all button
                document.getElementById('collapse-all').addEventListener('click', () => {
                    document.querySelectorAll('.execution-table .child-row').forEach(row => {
                        row.classList.add('collapsed');
                    });
                    
                    document.querySelectorAll('.execution-table .parent-row').forEach(row => {
                        row.setAttribute('data-expanded', 'false');
                        const expandButton = row.querySelector('.expand-collapse');
                        if (expandButton) {
                            expandButton.textContent = '▶';
                        }
                    });
                });
                
                // Setup debug only checkbox
                document.getElementById('debug-only').addEventListener('change', event => {
                    const debugOnly = event.target.checked;
                    
                    document.querySelectorAll('.execution-table tbody tr').forEach(row => {
                        if (row.classList.contains('parent-row')) {
                            const isDebug = row.classList.contains('debug-row');
                            const isVisible = !debugOnly || isDebug;
                            row.classList.toggle('hidden', !isVisible);
                            
                            // If parent is hidden, hide children too
                            if (!isVisible) {
                                const rowId = row.getAttribute('data-id');
                                document.querySelectorAll('tr[data-parent="' + rowId + '"]').forEach(childRow => {
                                    childRow.classList.add('hidden');
                                });
                            }
                        }
                    });
                    
                    updateTotals();
                });
                
                // Setup filter type dropdown
                document.getElementById('execution-filter-type').addEventListener('change', event => {
                    const filterType = event.target.value;
                    
                    if (filterType === 'none') {
                        document.querySelectorAll('.execution-table tbody tr').forEach(row => {
                            row.classList.add('hidden');
                        });
                    } else if (filterType === 'debug-only') {
                        document.querySelectorAll('.execution-table tbody tr').forEach(row => {
                            if (row.classList.contains('parent-row')) {
                                const isDebug = row.classList.contains('debug-row');
                                row.classList.toggle('hidden', !isDebug);
                                
                                // If parent is hidden, hide children too
                                if (!isDebug) {
                                    const rowId = row.getAttribute('data-id');
                                    document.querySelectorAll('tr[data-parent="' + rowId + '"]').forEach(childRow => {
                                        childRow.classList.add('hidden');
                                    });
                                }
                            }
                        });
                    } else { // all
                        document.querySelectorAll('.execution-table tbody tr.parent-row').forEach(row => {
                            row.classList.remove('hidden');
                        });
                    }
                    
                    updateTotals();
                });
            }
            
            // Sort the table
            function sortTable(sortBy, direction) {
                const tbody = document.querySelector('.execution-table tbody');
                const rows = Array.from(tbody.querySelectorAll('tr.parent-row'));
                
                const sortedRows = rows.sort((a, b) => {
                    let aValue = a.getAttribute('data-' + sortBy);
                    let bValue = b.getAttribute('data-' + sortBy);
                    
                    // Handle numeric values
                    if (['dmlCount', 'soqlCount', 'throwsCount', 'rows', 'totalTime', 'selfTime'].includes(sortBy)) {
                        aValue = parseFloat(aValue || '0');
                        bValue = parseFloat(bValue || '0');
                    }
                    
                    if (aValue < bValue) {
                        return direction === 'asc' ? -1 : 1;
                    }
                    if (aValue > bValue) {
                        return direction === 'asc' ? 1 : -1;
                    }
                    return 0;
                });
                
                // Reorder rows
                sortedRows.forEach(row => {
                    tbody.appendChild(row);
                    
                    // Move child rows after their parent
                    const rowId = row.getAttribute('data-id');
                    const childRows = Array.from(tbody.querySelectorAll('tr[data-parent="' + rowId + '"]'));
                    childRows.forEach(childRow => {
                        tbody.appendChild(childRow);
                    });
                });
            }
        `;
    }

    /**
     * Extracts execution path data from execution lines
     * @param executionLines The execution lines from the log
     * @returns Array of execution path entries
     */
    public static extractExecutionPath(executionLines: string[]): any[] {
        OrgUtils.logDebug('[VisbalExt.ExecutionTabHandler] extractExecutionPath -- Extracting execution path data');
        
        // Stack to keep track of open execution units
        const stack: any[] = [];
        // Root execution units
        const rootUnits: any[] = [];
        // Map to store execution units by ID for quick lookup
        const unitsById: Map<string, any> = new Map();
        
        // First pass: identify all execution units and their relationships
        executionLines.forEach((line, index) => {
            const parts = line.split('|');
            if (parts.length < 2) return;
            
            const content = parts[1].trim();
            
            // Extract timestamp if available
            let timestamp = 0;
            const timeMatch = parts[0].match(/(\d+):(\d+):(\d+)\.(\d+)/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseInt(timeMatch[3]);
                const milliseconds = parseInt(timeMatch[4]);
                
                timestamp = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
            }
            
            // Check if this is a start marker
            if (content.includes('_STARTED') || content.includes('_BEGIN') || content.includes('_ENTRY') || content.includes('SYSTEM_MODE_ENTER')) {
                // Extract the unit type and name
                let unitType = '';
                let unitName = content;
                let namespace = 'default';
                let codeUnit = '';
                
                if (content.includes('EXECUTION_STARTED')) {
                    unitType = 'EXECUTION';
                    unitName = 'Execution';
                } else if (content.includes('CODE_UNIT_STARTED')) {
                    unitType = 'CODE_UNIT';
                    const match = content.match(/CODE_UNIT_STARTED: (.*)/);
                    if (match && match[1]) {
                        const fullName = match[1].trim();
                        // Extract namespace and code unit (format: Namespace:ClassName.MethodName)
                        const nameParts = fullName.split(':');
                        if (nameParts.length > 1) {
                            namespace = nameParts[0].trim();
                            codeUnit = nameParts[1].trim();
                            unitName = fullName; // Keep the full name for reference
                        } else {
                            unitName = fullName;
                            codeUnit = fullName;
                        }
                    } else {
                        unitName = 'Code Unit';
                    }
                } else if (content.includes('SYSTEM_MODE_ENTER')) {
                    unitType = 'SYSTEM_MODE';
                    const match = content.match(/SYSTEM_MODE_ENTER: (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'System Mode';
                    }
                } else if (content.includes('DML_BEGIN')) {
                    unitType = 'DML';
                    const match = content.match(/DML_BEGIN (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'DML Operation';
                    }
                } else if (content.includes('SOQL_EXECUTE_BEGIN')) {
                    unitType = 'SOQL';
                    const match = content.match(/SOQL_EXECUTE_BEGIN (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'SOQL Query';
                    }
                } else if (content.includes('FLOW_START')) {
                    unitType = 'FLOW';
                    const match = content.match(/FLOW_START (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'Flow';
                    }
                } else if (content.includes('VALIDATION_RULE')) {
                    unitType = 'VALIDATION';
                    const match = content.match(/VALIDATION_RULE (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'Validation Rule';
                    }
                } else if (content.includes('CALLOUT_REQUEST')) {
                    unitType = 'CALLOUT';
                    const match = content.match(/CALLOUT_REQUEST (.*)/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'Callout Request';
                    }
                } else if (content.includes('TRIGGER_')) {
                    unitType = 'TRIGGER';
                    const match = content.match(/TRIGGER_(.*?):/);
                    if (match && match[1]) {
                        unitName = match[1].trim();
                    } else {
                        unitName = 'Trigger';
                    }
                } else {
                    // Extract type from the content
                    const typeParts = content.split('_');
                    if (typeParts.length > 1) {
                        unitType = typeParts[0];
                        // Try to extract a meaningful name from the content
                        const nameMatch = content.match(/_[A-Z]+: (.*)/);
                        if (nameMatch && nameMatch[1]) {
                            unitName = nameMatch[1].trim();
                        } else {
                            unitName = `${unitType} Operation`;
                        }
                    }
                }
                
                // Create a new execution unit
                const unit = {
                    id: `unit-${index}`,
                    lineNumber: index + 1,
                    startTime: timestamp,
                    endTime: 0,
                    totalTime: 0,
                    selfTime: 0,
                    type: unitType,
                    name: unitName,
                    codeUnit: codeUnit,
                    code: content,
                    namespace: namespace,
                    dmlCount: 0,
                    soqlCount: 0,
                    throwsCount: 0,
                    rows: 0,
                    children: [],
                    details: [content],
                    parent: null
                };
                
                // Store the unit for quick lookup
                unitsById.set(unit.id, unit);
                
                // If there's a parent unit on the stack, add this unit as its child
                if (stack.length > 0) {
                    const parent = stack[stack.length - 1];
                    unit.parent = parent;
                    parent.children.push(unit);
                    
                    // Update parent's counts
                    if (unitType === 'DML') parent.dmlCount++;
                    if (unitType === 'SOQL') parent.soqlCount++;
                    if (content.includes('THROWN')) parent.throwsCount++;
                } else {
                    // This is a root unit
                    rootUnits.push(unit);
                }
                
                // Push this unit onto the stack
                stack.push(unit);
            }
            // Check if this is an end marker
            else if (content.includes('_FINISHED') || content.includes('_END') || content.includes('_EXIT') || content.includes('SYSTEM_MODE_EXIT')) {
                if (stack.length === 0) return;
                
                // Pop the last unit from the stack
                const unit = stack.pop();
                
                // Set the end time and calculate the total time
                unit.endTime = timestamp;
                unit.totalTime = unit.endTime - unit.startTime;
                
                // Add this line to the unit's details
                unit.details.push(content);
                
                // Extract row count for SOQL queries
                if (content.includes('SOQL_EXECUTE_END')) {
                    const rowMatch = content.match(/Rows:(\d+)/);
                    if (rowMatch) {
                        unit.rows = parseInt(rowMatch[1]);
                        
                        // Update parent's row count
                        if (unit.parent) {
                            unit.parent.rows += unit.rows;
                        }
                    }
                }
            }
            // For other lines, add them as details to the current unit
            else if (stack.length > 0) {
                const unit = stack[stack.length - 1];
                unit.details.push(content);
            }
        });
        
        // Second pass: calculate self time for each unit
        function calculateSelfTime(unit: any) {
            // Self time is total time minus the time spent in children
            let childrenTime = 0;
            unit.children.forEach((child: any) => {
                calculateSelfTime(child);
                childrenTime += child.totalTime;
            });
            
            unit.selfTime = Math.max(0, unit.totalTime - childrenTime);
            
            // Only update namespace if it's still the default and we can extract a better one
            if (unit.namespace === 'default' && unit.type === 'CODE_UNIT' && unit.name && unit.name.includes(':')) {
                const nameParts = unit.name.split(':');
                unit.namespace = nameParts[0];
                // Don't modify the name if we're just extracting the namespace
                // unit.name = nameParts.slice(1).join(':');
                
                // Set code unit if not already set
                if (!unit.codeUnit && nameParts.length > 1) {
                    unit.codeUnit = nameParts[1];
                }
            }
        }
        
        // Calculate self time for all root units
        rootUnits.forEach(unit => calculateSelfTime(unit));
        
        OrgUtils.logDebug(`[VisbalExt.ExecutionTabHandler] extractExecutionPath -- Extracted ${rootUnits.length} root execution units`);
        
        return rootUnits;
    }
} 