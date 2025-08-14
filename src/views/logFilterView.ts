import * as vscode from 'vscode';
import { logFilterService } from '../services/logFilterService';
import { LogFilter, FilterCondition, FilterField, FilterOperator } from '../types/logFilter';
import { OrgUtils } from '../utils/orgUtils';
import { statusBarService } from '../services/statusBarService';

/**
 * Webview for managing log filters
 */
export class LogFilterView {
    public static currentPanel: LogFilterView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri): LogFilterView {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LogFilterView.currentPanel) {
            LogFilterView.currentPanel._panel.reveal(column);
            return LogFilterView.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'logFilterView',
            'Log Filter Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        LogFilterView.currentPanel = new LogFilterView(panel, extensionUri);
        return LogFilterView.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                console.log('[LogFilterView-Extension] Received message:', message);
                console.log('[LogFilterView-Extension] Message command:', message.command);
                console.log('[LogFilterView-Extension] Message filterId:', message.filterId);
                switch (message.command) {
                    case 'createFilter':
                        this._createFilter(message.data);
                        break;
                    case 'updateFilter':
                        this._updateFilter(message.filterId, message.data);
                        break;
                    case 'deleteFilter':
                        console.log('[LogFilterView-Extension] DELETE FILTER case triggered');
                        console.log('[LogFilterView-Extension] About to call _deleteFilter with:', message.filterId);
                        this._deleteFilter(message.filterId);
                        break;
                    case 'toggleFilter':
                        this._toggleFilter(message.filterId);
                        break;
                    case 'testFilter':
                        this._testFilter(message.filter, message.sampleLog);
                        break;
                    case 'duplicateFilter':
                        this._duplicateFilter(message.filterId);
                        break;
                    case 'exportFilters':
                        this._exportFilters();
                        break;
                    case 'importFilters':
                        this._importFilters();
                        break;
                    case 'refresh':
                        this._update();
                        break;
                    case 'getFilter':
                        this._getFilterData(message.filterId);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private _createFilter(data: any): void {
        try {
            const conditions = data.conditions.map((c: any) => ({
                id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                field: c.field,
                operator: c.operator,
                value: c.value,
                caseSensitive: c.caseSensitive || false,
                useRegex: c.useRegex || false,
                negated: c.negated || false
            }));

            const filter = logFilterService.createFilter(
                data.name,
                data.description,
                conditions,
                data.logicalOperator
            );

            statusBarService.showSuccess(`Filter "${filter.name}" created successfully`);
            this._update();
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error creating filter:', error);
            statusBarService.showError(`Error creating filter: ${error.message}`);
        }
    }

    private _updateFilter(filterId: string, data: any): void {
        try {
            const success = logFilterService.updateFilter(filterId, data);
            if (success) {
                statusBarService.showSuccess('Filter updated successfully');
                this._update();
            } else {
                statusBarService.showError('Failed to update filter');
            }
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error updating filter:', error);
            statusBarService.showError(`Error updating filter: ${error.message}`);
        }
    }

    private _deleteFilter(filterId: string): void {
        console.log('[LogFilterView-Extension] _deleteFilter ENTRY - filterId:', filterId);
        console.log('[LogFilterView-Extension] _deleteFilter ENTRY - typeof filterId:', typeof filterId);
        console.log('[LogFilterView-Extension] _deleteFilter ENTRY - logFilterService:', logFilterService);
        
        try {
            console.log('[LogFilterView-Extension] Getting filter from service...');
            const filter = logFilterService.getFilter(filterId);
            console.log('[LogFilterView-Extension] Found filter:', filter);
            
            if (!filter) {
                console.log('[LogFilterView-Extension] Filter not found - showing error');
                statusBarService.showError('Filter not found');
                return;
            }

            console.log('[LogFilterView-Extension] Filter found, checking if built-in:', filter.isBuiltIn);
            console.log('[LogFilterView-Extension] Attempting to delete filter:', filter.name);
            
            const success = logFilterService.deleteFilter(filterId);
            console.log('[LogFilterView-Extension] Delete operation result:', success);
            
            if (success) {
                console.log('[LogFilterView-Extension] Delete successful, showing success message');
                statusBarService.showSuccess(`Filter "${filter.name}" deleted successfully`);
                console.log('[LogFilterView-Extension] Calling _update to refresh UI');
                this._update();
                console.log('[LogFilterView-Extension] UI update complete');
            } else {
                console.log('[LogFilterView-Extension] Delete failed, showing error message');
                statusBarService.showError('Failed to delete filter (built-in filters cannot be deleted)');
            }
        } catch (error: any) {
            console.error('[LogFilterView-Extension] EXCEPTION in _deleteFilter:', error);
            console.error('[LogFilterView-Extension] Error stack:', error.stack);
            OrgUtils.logError('[LogFilterView] Error deleting filter:', error);
            statusBarService.showError(`Error deleting filter: ${error.message}`);
        }
        
        console.log('[LogFilterView-Extension] _deleteFilter EXIT');
    }

    private _toggleFilter(filterId: string): void {
        try {
            const success = logFilterService.toggleFilter(filterId);
            if (success) {
                const filter = logFilterService.getFilter(filterId);
                const status = filter?.isActive ? 'enabled' : 'disabled';
                statusBarService.showSuccess(`Filter "${filter?.name}" ${status}`);
                this._update();
            } else {
                statusBarService.showError('Failed to toggle filter');
            }
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error toggling filter:', error);
            statusBarService.showError(`Error toggling filter: ${error.message}`);
        }
    }

    private _testFilter(filterData: any, sampleLog: string): void {
        try {
            // Create a temporary filter for testing
            const tempFilter: LogFilter = {
                id: 'temp-test',
                name: 'Test Filter',
                description: '',
                isActive: true,
                isBuiltIn: false,
                created: new Date(),
                lastModified: new Date(),
                conditions: filterData.conditions,
                logicalOperator: filterData.logicalOperator
            };

            const result = logFilterService.applyFilters(sampleLog, ['temp-test']);

            // Send test results back to webview
            this._panel.webview.postMessage({
                command: 'testResult',
                result: {
                    totalLines: sampleLog.split('\n').length,
                    matchedLines: result.totalMatches,
                    executionTime: result.executionTime,
                    filteredLines: result.filteredLines.slice(0, 10) // Show first 10 matches
                }
            });

            statusBarService.showSuccess(`Filter test completed: ${result.totalMatches} matches found`);
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error testing filter:', error);
            statusBarService.showError(`Error testing filter: ${error.message}`);
        }
    }

    private _duplicateFilter(filterId: string): void {
        try {
            const originalFilter = logFilterService.getFilter(filterId);
            if (!originalFilter) {
                statusBarService.showError('Filter not found');
                return;
            }

            const duplicatedFilter = logFilterService.createFilter(
                `${originalFilter.name} (Copy)`,
                originalFilter.description || '',
                originalFilter.conditions.map(c => ({ ...c, id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` })),
                originalFilter.logicalOperator
            );

            statusBarService.showSuccess(`Filter "${duplicatedFilter.name}" created as copy`);
            this._update();
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error duplicating filter:', error);
            statusBarService.showError(`Error duplicating filter: ${error.message}`);
        }
    }

    private async _exportFilters(): Promise<void> {
        try {
            const filters = logFilterService.getAllFilters().filter(f => !f.isBuiltIn);
            const exportData = {
                version: '1.0',
                exported: new Date().toISOString(),
                filters: filters
            };

            const content = JSON.stringify(exportData, null, 2);
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('log-filters.json'),
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                statusBarService.showSuccess(`Filters exported to ${uri.fsPath}`);
            }
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error exporting filters:', error);
            statusBarService.showError(`Error exporting filters: ${error.message}`);
        }
    }

    private async _importFilters(): Promise<void> {
        try {
            const files = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (files && files.length > 0) {
                const content = await vscode.workspace.fs.readFile(files[0]);
                const importData = JSON.parse(content.toString());

                if (importData.filters && Array.isArray(importData.filters)) {
                    let importedCount = 0;
                    for (const filterData of importData.filters) {
                        try {
                            logFilterService.createFilter(
                                filterData.name,
                                filterData.description,
                                filterData.conditions,
                                filterData.logicalOperator
                            );
                            importedCount++;
                        } catch (error) {
                            OrgUtils.logError(`[LogFilterView] Error importing filter ${filterData.name}:`, error);
                        }
                    }

                    statusBarService.showSuccess(`Imported ${importedCount} filters successfully`);
                    this._update();
                } else {
                    statusBarService.showError('Invalid filter file format');
                }
            }
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error importing filters:', error);
            statusBarService.showError(`Error importing filters: ${error.message}`);
        }
    }

    private _getFilterData(filterId: string): void {
        try {
            const filter = logFilterService.getFilter(filterId);
            this._panel.webview.postMessage({
                command: 'filterData',
                filter: filter
            });
        } catch (error: any) {
            OrgUtils.logError('[LogFilterView] Error getting filter data:', error);
            this._panel.webview.postMessage({
                command: 'filterData',
                filter: null
            });
        }
    }

    private _update(): void {
        const webview = this._panel.webview;
        const filters = logFilterService.getAllFilters();
        const stats = logFilterService.getStats();

        webview.html = this._getHtmlForWebview(filters, stats);
    }

    private _getHtmlForWebview(filters: LogFilter[], stats: any): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Log Filter Manager</title>
    <style>
                    body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                margin: 0;
                padding: 12px;
                font-size: 13px;
            }
            
            .header {
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 12px;
                margin-bottom: 15px;
            }
            
            .header h1 {
                margin: 0 0 10px 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            .stats {
                display: flex;
                gap: 12px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .stat-card {
                background: var(--vscode-editor-inactiveSelectionBackground);
                padding: 8px 12px;
                border-radius: 4px;
                border: 1px solid var(--vscode-panel-border);
                min-width: 80px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 16px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                line-height: 1.2;
            }
            
            .stat-label {
                color: var(--vscode-descriptionForeground);
                font-size: 10px;
                margin-top: 2px;
            }
        
                    .toolbar {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .btn {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
                    .filter-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 12px;
            }
            
            .filter-card {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 12px;
                position: relative;
                height: fit-content;
                min-height: 140px;
                display: flex;
                flex-direction: column;
            }
            
            .filter-card.active {
                border-left: 3px solid var(--vscode-textLink-foreground);
            }
            
            .filter-card.builtin {
                background: var(--vscode-editor-inactiveSelectionBackground);
            }
            
            .filter-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;
            }
            
            .filter-name {
                font-weight: 600;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .filter-badge {
                font-size: 9px;
                padding: 1px 4px;
                border-radius: 2px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
            }
            
            .filter-actions {
                display: flex;
                gap: 4px;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .filter-description {
                color: var(--vscode-descriptionForeground);
                margin-bottom: 8px;
                font-size: 11px;
                line-height: 1.3;
            }
            
            .filter-conditions {
                background: var(--vscode-textCodeBlock-background);
                padding: 6px 8px;
                border-radius: 3px;
                /*font-family: var(--vscode-editor-font-family);*/
                font-size: 10px;
                margin-bottom: 6px;
                max-height: 80px;
                overflow-y: auto;
                flex-grow: 1;
            }
            
            .condition-item {
                margin-bottom: 3px;
                padding: 2px 4px;
                border-left: 2px solid var(--vscode-textLink-foreground);
                padding-left: 6px;
                font-size: 10px;
            }
            
            .filter-meta {
                display: flex;
                justify-content: space-between;
                font-size: 9px;
                color: var(--vscode-descriptionForeground);
                margin-top: 4px;
            }
        
                    .toggle-switch {
                position: relative;
                display: inline-block;
                width: 32px;
                height: 16px;
            }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-input-background);
            transition: .4s;
            border-radius: 20px;
            border: 1px solid var(--vscode-input-border);
        }
        
                    .slider:before {
                position: absolute;
                content: "";
                height: 12px;
                width: 12px;
                left: 2px;
                bottom: 2px;
                background-color: var(--vscode-foreground);
                transition: .3s;
                border-radius: 50%;
            }
            
            input:checked + .slider {
                background-color: var(--vscode-button-background);
            }
            
            input:checked + .slider:before {
                transform: translateX(14px);
            }
        
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        
                    .modal-content {
                background-color: var(--vscode-editor-background);
                margin: 3% auto;
                padding: 16px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                width: 85%;
                max-width: 700px;
                max-height: 85vh;
                overflow-y: auto;
            }
            
            .form-group {
                margin-bottom: 12px;
            }
        
        .form-label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        
        .form-input, .form-select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        
        .conditions-builder {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        
        .condition-row {
            display: grid;
            grid-template-columns: 1fr 1fr 2fr auto auto auto auto;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
        }
        
        .checkbox-group {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        
                    .icon {
                width: 16px;
                height: 16px;
                margin-right: 4px;
            }
            
            /* Responsive grid adjustments */
            @media (max-width: 1000px) {
                .filter-grid {
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                }
            }
            
            @media (max-width: 600px) {
                .filter-grid {
                    grid-template-columns: 1fr;
                }
                
                .filter-actions {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 2px;
                }
                
                .filter-actions button {
                    font-size: 10px !important;
                    padding: 3px 6px !important;
                }
            }
    </style>
</head>
<body>
    <div class="header">
        <h1>Log Filter Manager</h1>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${stats.totalFilters}</div>
                <div class="stat-label">Total Filters</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.activeFilters}</div>
                <div class="stat-label">Active Filters</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.avgExecutionTime.toFixed(2)}ms</div>
                <div class="stat-label">Avg Execution Time</div>
            </div>
        </div>
    </div>
    
    <div class="toolbar">
        <button class="btn" onclick="showCreateModal()">
            ➕ Create Filter
        </button>
        <button class="btn btn-secondary" onclick="exportFilters()">
            📤 Export
        </button>
        <button class="btn btn-secondary" onclick="importFilters()">
            📥 Import
        </button>
        <button class="btn btn-secondary" onclick="refreshView()">
            🔄 Refresh
        </button>
    </div>
    
    <div class="filter-grid">
        ${filters.map(filter => `
            <div class="filter-card ${filter.isActive ? 'active' : ''} ${filter.isBuiltIn ? 'builtin' : ''}">
                <div class="filter-header">
                    <div class="filter-name">
                        <span style="color: ${filter.color || '#666'}">${this._getFilterIcon(filter.icon || 'filter')}</span>
                        ${filter.name}
                        ${filter.isBuiltIn ? '<span class="filter-badge">Built-in</span>' : ''}
                    </div>
                    <div class="filter-actions">
                        <label class="toggle-switch">
                            <input type="checkbox" ${filter.isActive ? 'checked' : ''} 
                                   onchange="toggleFilter('${filter.id}')">
                            <span class="slider"></span>
                        </label>
                        ${!filter.isBuiltIn ? `
                            <button class="btn btn-secondary" onclick="editFilter('${filter.id}')" style="padding: 4px 8px; font-size: 11px;">Edit</button>
                            <button class="btn btn-secondary" onclick="duplicateFilter('${filter.id}')" style="padding: 4px 8px; font-size: 11px;">Copy</button>
                            <button class="btn btn-secondary" onclick="deleteFilter('${filter.id}')" style="padding: 4px 8px; font-size: 11px;">Delete</button>
                        ` : `
                            <button class="btn btn-secondary" onclick="duplicateFilter('${filter.id}')" style="padding: 4px 8px; font-size: 11px;">Copy</button>
                        `}
                    </div>
                </div>
                <div class="filter-description">${filter.description || 'No description'}</div>
                <div class="filter-conditions">
                    <strong>Conditions (${filter.logicalOperator}):</strong>
                    ${filter.conditions.map(condition => `
                        <div class="condition-item">
                            ${condition.negated ? 'NOT ' : ''}${condition.field} ${condition.operator} "${condition.value}"
                            ${condition.caseSensitive ? ' (case sensitive)' : ''}
                            ${condition.useRegex ? ' (regex)' : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="filter-meta">
                    <span>Created: ${new Date(filter.created).toLocaleDateString()}</span>
                    <span>Modified: ${new Date(filter.lastModified).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('')}
    </div>
    
    <!-- Create/Edit Filter Modal -->
    <div id="filterModal" class="modal">
        <div class="modal-content">
            <h2 id="modalTitle">Create New Filter</h2>
            <form id="filterForm">
                <div class="form-group">
                    <label class="form-label">Filter Name:</label>
                    <input type="text" id="filterName" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Description:</label>
                    <input type="text" id="filterDescription" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label">Logical Operator:</label>
                    <select id="logicalOperator" class="form-select">
                        <option value="AND">AND (all conditions must match)</option>
                        <option value="OR">OR (any condition can match)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Conditions:</label>
                    <div class="conditions-builder">
                        <div id="conditionsContainer"></div>
                        <button type="button" class="btn btn-secondary" onclick="addCondition()">Add Condition</button>
                    </div>
                </div>
                <div class="form-group">
                    <button type="submit" class="btn">Save Filter</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="button" class="btn btn-secondary" onclick="testFilter()">Test Filter</button>
                </div>
            </form>
        </div>
    </div>
        <script>
        // Global variables
        const vscode = acquireVsCodeApi();
        let editingFilterId = null;
        
       
        

        console.log('deleteFilter function defined globally');
        
        function showCreateModal() {
            console.log('showCreateModal called');
            try {
                document.getElementById('modalTitle').textContent = 'Create New Filter';
                document.getElementById('filterForm').reset();
                document.getElementById('conditionsContainer').innerHTML = '';
                editingFilterId = null;
                console.log('Adding initial condition...');
                addCondition();
                document.getElementById('filterModal').style.display = 'block';
                console.log('Modal should now be visible');
            } catch (error) {
                console.error('Error in showCreateModal:', error);
                alert('Error opening create modal: ' + error.message);
            }
        }
        
        function editFilter(filterId) {
            // Request filter data from extension
            vscode.postMessage({
                command: 'getFilter',
                filterId: filterId
            });
        }
        
        // Handle filter data response
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'filterData') {
                const filter = message.filter;
                
                if (!filter) {
                    alert('Filter not found');
                    return;
                }
                
                // Show modal
                showCreateModal();
                editingFilterId = filter.id;
                document.getElementById('modalTitle').textContent = 'Edit Filter';
                
                // Populate form with existing data
                document.getElementById('filterName').value = filter.name || '';
                document.getElementById('filterDescription').value = filter.description || '';
                document.getElementById('logicalOperator').value = filter.logicalOperator || 'AND';
                
                // Clear existing conditions
                document.getElementById('conditionsContainer').innerHTML = '';
                
                // Add existing conditions
                if (filter.conditions && filter.conditions.length > 0) {
                    filter.conditions.forEach(condition => {
                        addConditionWithData(condition);
                    });
                } else {
                    // Add at least one empty condition
                    addCondition();
                }
            }
        });
        
        function closeModal() {
            document.getElementById('filterModal').style.display = 'none';
            editingFilterId = null;
        }
        
        function addCondition() {
            addConditionWithData({});
        }
        
        function addConditionWithData(conditionData = {}) {
            console.log('addConditionWithData called with:', conditionData);
            try {
                const container = document.getElementById('conditionsContainer');
                if (!container) {
                    throw new Error('conditionsContainer not found');
                }
                
                const conditionRow = document.createElement('div');
                conditionRow.className = 'condition-row';
                conditionRow.innerHTML = \`
                    <select class="form-select condition-field">
                        <option value="content" \${conditionData.field === 'content' ? 'selected' : ''}>Content</option>
                        <option value="category" \${conditionData.field === 'category' ? 'selected' : ''}>Category</option>
                        <option value="message" \${conditionData.field === 'message' ? 'selected' : ''}>Message</option>
                        <option value="logLevel" \${conditionData.field === 'logLevel' ? 'selected' : ''}>Log Level</option>
                        <option value="duration" \${conditionData.field === 'duration' ? 'selected' : ''}>Duration</option>
                        <option value="timestamp" \${conditionData.field === 'timestamp' ? 'selected' : ''}>Timestamp</option>
                        <option value="objectType" \${conditionData.field === 'objectType' ? 'selected' : ''}>Object Type</option>
                    </select>
                    <select class="form-select condition-operator">
                        <option value="contains" \${conditionData.operator === 'contains' ? 'selected' : ''}>Contains</option>
                        <option value="equals" \${conditionData.operator === 'equals' ? 'selected' : ''}>Equals</option>
                        <option value="startsWith" \${conditionData.operator === 'startsWith' ? 'selected' : ''}>Starts With</option>
                        <option value="endsWith" \${conditionData.operator === 'endsWith' ? 'selected' : ''}>Ends With</option>
                        <option value="regex" \${conditionData.operator === 'regex' ? 'selected' : ''}>Regex</option>
                        <option value="greaterThan" \${conditionData.operator === 'greaterThan' ? 'selected' : ''}>Greater Than</option>
                        <option value="lessThan" \${conditionData.operator === 'lessThan' ? 'selected' : ''}>Less Than</option>
                    </select>
                    <input type="text" class="form-input condition-value" placeholder="Value" value="\${conditionData.value || ''}">
                    <div class="checkbox-group">
                        <label><input type="checkbox" class="condition-case-sensitive" \${conditionData.caseSensitive ? 'checked' : ''}> Case</label>
                    </div>
                    <div class="checkbox-group">
                        <label><input type="checkbox" class="condition-regex" \${conditionData.useRegex ? 'checked' : ''}> Regex</label>
                    </div>
                    <div class="checkbox-group">
                        <label><input type="checkbox" class="condition-negated" \${conditionData.negated ? 'checked' : ''}> NOT</label>
                    </div>
                    <button type="button" class="btn btn-secondary" onclick="removeCondition(this)">Remove</button>
                \`;
                container.appendChild(conditionRow);
                console.log('Condition row added successfully');
            } catch (error) {
                console.error('Error in addConditionWithData:', error);
                alert('Error adding condition: ' + error.message);
            }
        }
        
        function removeCondition(button) {
            button.parentElement.remove();
        }
        
        function toggleFilter(filterId) {
            vscode.postMessage({
                command: 'toggleFilter',
                filterId: filterId
            });
        }
        
        

        
        
        function duplicateFilter(filterId) {
            vscode.postMessage({
                command: 'duplicateFilter',
                filterId: filterId
            });
        }

         function deleteFilter(filterId) {
             vscode.postMessage({
                command: 'deleteFilter',
                filterId: filterId
            });
        }
        
        function exportFilters() {
            vscode.postMessage({
                command: 'exportFilters'
            });
        }
        
        function importFilters() {
            vscode.postMessage({
                command: 'importFilters'
            });
        }
        
        function refreshView() {
            vscode.postMessage({
                command: 'refresh'
            });
        }
        
        function testFilter() {
            const conditions = Array.from(document.querySelectorAll('.condition-row')).map(row => ({
                field: row.querySelector('.condition-field').value,
                operator: row.querySelector('.condition-operator').value,
                value: row.querySelector('.condition-value').value,
                caseSensitive: row.querySelector('.condition-case-sensitive').checked,
                useRegex: row.querySelector('.condition-regex').checked,
                negated: row.querySelector('.condition-negated').checked
            }));
            
            vscode.postMessage({
                command: 'testFilter',
                filter: {
                    conditions: conditions,
                    logicalOperator: document.getElementById('logicalOperator').value
                },
                sampleLog: 'Sample log content for testing...' // Would be replaced with actual sample
            });
        }
        
        document.getElementById('filterForm').addEventListener('submit', function(e) {
            console.log('Form submit event triggered');
            e.preventDefault();
            
            try {
                console.log('Processing form data...');
                const conditions = Array.from(document.querySelectorAll('.condition-row')).map(row => ({
                    field: row.querySelector('.condition-field').value,
                    operator: row.querySelector('.condition-operator').value,
                    value: row.querySelector('.condition-value').value,
                    caseSensitive: row.querySelector('.condition-case-sensitive').checked,
                    useRegex: row.querySelector('.condition-regex').checked,
                    negated: row.querySelector('.condition-negated').checked
                }));
                
                console.log('Conditions:', conditions);
                
                const filterData = {
                    name: document.getElementById('filterName').value,
                    description: document.getElementById('filterDescription').value,
                    logicalOperator: document.getElementById('logicalOperator').value,
                    conditions: conditions
                };
                
                console.log('Filter data:', filterData);
                console.log('Editing filter ID:', editingFilterId);
                
                if (editingFilterId) {
                    console.log('Sending updateFilter message');
                    vscode.postMessage({
                        command: 'updateFilter',
                        filterId: editingFilterId,
                        data: filterData
                    });
                } else {
                    console.log('Sending createFilter message');
                    vscode.postMessage({
                        command: 'createFilter',
                        data: filterData
                    });
                }
                
                console.log('Closing modal');
                closeModal();
            } catch (error) {
                console.error('Error in form submit:', error);
                alert('Error creating/updating filter: ' + error.message);
            }
        });
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('filterModal');
            if (event.target === modal) {
                closeModal();
            }
        };
    </script>
</body>
</html>`;
    }

    private _getFilterIcon(icon: string): string {
        const icons: { [key: string]: string } = {
            'filter': '🔍',
            'error': '❌',
            'clock': '⏱️',
            'database': '🗄️',
            'bug': '🐛',
            'gauge': '⚡'
        };
        return icons[icon] || '🔍';
    }

    public dispose(): void {
        LogFilterView.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
