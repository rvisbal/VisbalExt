/**
 * CSS styles for the log summary view
 */
export const styles = `
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

/* Loading Indicator */
.loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    margin: 20px;
    background-color: #252525;
    border: 1px solid #333;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #e0e0e0;
    font-size: 16px;
    font-weight: bold;
    position: relative;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(74, 156, 214, 0.3);
    border-radius: 50%;
    border-top-color: #4a9cd6;
    margin-right: 15px;
    animation: spin 1s linear infinite;
}

.loading-message {
    margin-top: 10px;
    color: #888;
}

.progress-container {
    width: 100%;
    max-width: 400px;
    margin-top: 20px;
    background-color: #333;
    border-radius: 4px;
    overflow: hidden;
}

.progress-bar {
    height: 8px;
    background-color: #4a9cd6;
    width: 0%;
    transition: width 0.3s ease;
}

.progress-text {
    text-align: center;
    margin-top: 5px;
    font-size: 12px;
    color: #888;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Debug Info */
.debug-info {
    margin-top: 10px;
    padding: 10px;
    background-color: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    color: #888;
    max-height: 100px;
    overflow: auto;
}

/* Timeline View Styles */
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
    width: 100%;
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
.timeline-event.CodeUnit { background-color: #62a; }
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
    max-height: 200px;
    overflow: auto;
}

/* Call Tree View Styles */
.filter-controls {
    padding: 10px;
    background-color: #252525;
    border-bottom: 1px solid #333;
}
.filter {
    display: flex;
    gap: 15px;
    align-items: center;
}
.filter button {
    background-color: #0e639c;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 2px;
    cursor: pointer;
}
.filter button:hover {
    background-color: #1177bb;
}
.filter label {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #ccc;
}

.call-tree-header {
    position: sticky;
    top: 0;
    background-color: #252525;
    z-index: 10;
}
.call-tree-row {
    display: flex;
    border-bottom: 1px solid #333;
    cursor: default;
}
.call-tree-row.header {
    font-weight: bold;
    background-color: #2d2d2d;
}
.call-tree-row.expandable {
    cursor: pointer;
}
.call-tree-row.expandable:hover {
    background-color: #2a2a2a;
}
.call-tree-cell {
    padding: 6px 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.call-tree-cell.name {
    flex: 3;
    min-width: 200px;
}
.call-tree-cell.namespace {
    flex: 1;
    min-width: 100px;
}
.call-tree-cell.dml, .call-tree-cell.soql, .call-tree-cell.rows {
    flex: 1;
    min-width: 80px;
    text-align: right;
}
.call-tree-cell.total-time, .call-tree-cell.self-time {
    flex: 1;
    min-width: 100px;
    text-align: right;
}
.expand-icon {
    display: inline-block;
    width: 12px;
    transition: transform 0.2s;
}
.call-tree-row.expanded .expand-icon {
    transform: rotate(0deg);
}
.call-tree-row:not(.expanded) .expand-icon {
    transform: rotate(-90deg);
}
.spacer {
    display: inline-block;
    width: 12px;
}
.children-container {
    display: none;
}

/* Analysis View Styles */
.analysis-container {
    padding: 20px;
}
.analysis-section {
    margin-bottom: 20px;
}
.analysis-section h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: #e0e0e0;
}
.analysis-table {
    width: 100%;
    border-collapse: collapse;
}
.analysis-table th, .analysis-table td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid #333;
}
.analysis-table th {
    background-color: #2d2d2d;
    color: #e0e0e0;
}
.analysis-table tr:hover {
    background-color: #2a2a2a;
}

/* Database View Styles */
.database-container {
    padding: 20px;
}
.query-list {
    margin-bottom: 20px;
}
.query-item {
    margin-bottom: 10px;
    padding: 10px;
    background-color: #252525;
    border: 1px solid #333;
    border-radius: 4px;
}
.query-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
}
.query-type {
    font-weight: bold;
    color: #e0e0e0;
}
.query-time {
    color: #888;
}
.query-text {
    font-family: monospace;
    white-space: pre-wrap;
    padding: 8px;
    background-color: #1e1e1e;
    border-radius: 2px;
    overflow-x: auto;
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

.placeholder-message {
    padding: 20px;
    color: #888;
    font-style: italic;
}

/* Error Message */
.error-message {
    padding: 20px;
    margin: 20px;
    background-color: #6c2022;
    color: white;
    border-radius: 4px;
    font-weight: bold;
}

/* Overview styles */
.overview-container {
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
}

.overview-container h2 {
    color: #4a9cd6;
    margin-bottom: 20px;
}

.overview-container p {
    margin-bottom: 20px;
    line-height: 1.5;
}

.overview-section {
    margin-bottom: 30px;
    background-color: #1e1e1e;
    border-radius: 5px;
    padding: 15px;
    border: 1px solid #333;
}

.overview-section h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: #ddd;
    border-bottom: 1px solid #333;
    padding-bottom: 8px;
}

.overview-table {
    width: 100%;
    border-collapse: collapse;
}

.overview-table td {
    padding: 8px;
    border-bottom: 1px solid #333;
}

.overview-table td:first-child {
    font-weight: bold;
    width: 40%;
}

.tab-descriptions {
    list-style-type: none;
    padding: 0;
    margin: 0;
}

.tab-descriptions li {
    padding: 8px 0;
    border-bottom: 1px solid #333;
}

.tab-descriptions li:last-child {
    border-bottom: none;
}
`; 