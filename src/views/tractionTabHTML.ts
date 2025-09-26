import { styles } from "./styles";

export function getTractionHtml(): string {
    // JavaScript/HTML section, type script rule dont apply in this block
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
    <style>${styles}</style>
    <style>
        body {
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            position: relative;
        }
        
        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .filter-section {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .actions-section {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .button-group {
            display: flex;
            align-items: center;
            gap: 2px;
        }
        
        
        .status-message {
            padding: 4px 12px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .status-error {
            color: var(--vscode-errorForeground);
        }
        
        .status-success {
            color: var(--vscode-testing-iconPassed);
        }

        .progress-container {
            position: absolute;
            top: 50px;
            left: 0;
            right: 0;
            bottom: 30px;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 40px 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            z-index: 1000;
            border-radius: 8px;
            margin: 8px;
        }
        
        .progress-container.active {
            display: flex;
        }
        
        .progress-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 20px;
            opacity: 0.8;
        }
        
        .loading-spinner {
            width: 48px;
            height: 48px;
            border: 4px solid var(--vscode-progressBar-background);
            border-top: 4px solid var(--vscode-button-background);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .progress-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
            text-align: center;
        }
        
        .progress-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            line-height: 1.4;
            max-width: 400px;
        }
        
        .progress-bar {
            width: 300px;
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin: 16px 0;
            overflow: hidden;
        }
        
        .progress-bar-fill {
            height: 100%;
            background: var(--vscode-button-background);
            border-radius: 2px;
            width: 0%;
            transition: width 0.3s ease;
            position: relative;
        }
        
        .progress-bar-fill.indeterminate {
            width: 30%;
            animation: progress-slide 2s infinite;
        }
        
        @keyframes progress-slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(1000%); }
        }
        
        .dropdown-button-group {
            position: relative;
            display: inline-block;
        }
        
        .dropdown-menu {
            position: absolute;
            top: 100%;
            right: 0;
            min-width: 220px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 1001;
            margin-top: 2px;
        }
        
        .dropdown-menu.hidden {
            display: none;
        }
        
        .dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            color: var(--vscode-dropdown-foreground);
            font-size: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .dropdown-item:last-child {
            border-bottom: none;
        }
        
        .dropdown-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .dropdown-arrow {
            margin-left: 4px;
            display: flex;
            align-items: center;
        }
        
        /* Security Report Styles */
        .security-report-container {
            position: absolute;
            top: 50px;
            left: 0;
            right: 0;
            bottom: 30px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            margin: 8px;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .security-report-container.hidden {
            display: none;
        }
        
        .security-report-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .security-report-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            color: var(--vscode-titleBar-activeForeground);
            font-size: 13px;
        }
        
        .shield-icon {
            font-size: 14px;
        }
        
        .report-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .export-report-button,
        .close-report-button {
            background: none;
            border: none;
            color: var(--vscode-titleBar-activeForeground);
            cursor: pointer;
            font-size: 14px;
            padding: 4px 8px;
            border-radius: 4px;
            opacity: 0.8;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .export-report-button {
            font-size: 12px;
            border: 1px solid var(--vscode-titleBar-activeForeground);
            opacity: 0.7;
        }
        
        .export-report-button:hover,
        .close-report-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
            opacity: 1;
        }
        
        .close-report-button {
            font-size: 18px;
        }
        
        .export-dropdown {
            position: relative;
            display: inline-block;
        }
        
        .export-dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            top: 100%;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            min-width: 120px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 1001;
        }
        
        .export-dropdown-content.show {
            display: block;
        }
        
        .export-option {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-dropdown-foreground);
            border: none;
            background: none;
            width: 100%;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .export-option:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .security-summary {
            display: flex;
            justify-content: space-between;
            padding: 8px 20px;
            gap: 16px;
            background: var(--vscode-sideBar-background);
        }
        
        .summary-item {
            text-align: center;
            padding: 4px 8px;
            border-radius: 4px;
            min-width: 50px;
        }
        
        .summary-item.high-severity {
            background: rgba(255, 99, 99, 0.1);
            border: 1px solid rgba(255, 99, 99, 0.3);
        }
        
        .summary-item.medium-severity {
            background: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.3);
        }
        
        .summary-item.low-severity {
            background: rgba(40, 167, 69, 0.1);
            border: 1px solid rgba(40, 167, 69, 0.3);
        }
        
        .summary-item.total {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
        }
        
        .severity-count {
            display: block;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 2px;
        }
        
        .severity-label {
            display: block;
            font-size: 10px;
            text-transform: uppercase;
            opacity: 0.8;
        }
        
        .security-filters {
            display: flex;
            gap: 16px;
            padding: 6px 12px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }
        
        .filter-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .filter-group-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-right: 4px;
        }
        
        .security-filters label {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .filter-label.high {
            color: #ff6363;
        }
        
        .filter-label.medium {
            color: #ffc107;
        }
        
        .filter-label.low {
            color: #28a745;
        }
        
        .filter-label.category {
            color: var(--vscode-foreground);
        }
        
        .filter-count {
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
            font-size: 10px;
        }
        
        .security-issues-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px 6px;
        }
        
        .security-issue {
            background: var(--vscode-list-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 6px;
            padding: 8px 10px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }
        
        .security-issue:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .security-issue.hidden {
            display: none;
        }
        
        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 4px;
        }
        
        .issue-title {
            font-weight: 600;
            color: var(--vscode-foreground);
            font-size: 12px;
        }
        
        .issue-severity {
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .issue-severity.high {
            background: #ff6363;
            color: white;
        }
        
        .issue-severity.medium {
            background: #ffc107;
            color: black;
        }
        
        .issue-severity.low {
            background: #28a745;
            color: white;
        }
        
        .issue-location {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 3px;
        }
        
        .issue-description {
            font-size: 11px;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
            line-height: 1.3;
        }
        
        .issue-code {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 6px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 11px;
            color: var(--vscode-editor-foreground);
            white-space: pre-wrap;
            margin-bottom: 4px;
            max-height: 120px;
            overflow-y: auto;
            line-height: 1.4;
        }
        
        .issue-recommendation {
            font-size: 10px;
            color: var(--vscode-textLink-foreground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="top-bar">
            <div class="filter-section">
                <span style="font-weight: 600; color: var(--vscode-foreground);">Traction</span>
            </div>
            <div class="actions-section">
                <div class="org-selector-container">
                    <select id="org-selector" class="org-selector" title="Select Salesforce Org">
                        <option value="">Loading orgs...</option>
                    </select>
                </div>
                <div class="button-group">
                    <button class="icon-button" id="open-org-button" title="Open Org" aria-label="Open Org">
                        <span class="icon globe-icon"></span>
                    </button>
                    <button class="icon-button" id="deploy-org-button" title="Deploy Org" aria-label="Deploy Org">
                        <span class="icon deploy-icon"></span>
                    </button>
                </div>
                
                <div class="dropdown-button-group" id="terminal-dropdown-group">
                    <button class="icon-button" id="terminal-main-button" title="Terminal" aria-label="Terminal"
                        style="width: 75px">
                        <span class="icon terminal-icon"></span>
                        <span class="dropdown-arrow" style="margin-left:4px; display:flex; align-items:center;">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="white" style="display:block;">
                                <path d="M4 6l4 4 4-4" stroke="white" stroke-width="1.5" fill="none"
                                    stroke-linecap="round" />
                            </svg>
                        </span>
                    </button>
                    <div class="dropdown-menu hidden" id="terminal-dropdown-menu">
                        <div class="dropdown-item" data-action="gulp">Create Scratch Org with Gulp</div>
                        <div class="dropdown-item" data-action="terminal">Open Terminal</div>
                        <div class="dropdown-item" data-action="powershell">Open PowerShell</div>
                        <div class="dropdown-item" data-action="cmd">Open Command Prompt</div>
                        <div class="dropdown-item" data-action="auraEnabled">Report @AuraEnabled</div>
                        <div class="dropdown-item" data-action="securityScanWorkspace">Security Report - Workspace</div>
                        <div class="dropdown-item" data-action="securityScanCurrent">Security Report - Current File</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="progress-container" id="progress-container">
            <div class="loading-spinner"></div>
            <div class="progress-title" id="progress-title">Fresh @AuraEnabled Scan</div>
            <div class="progress-description" id="progress-description">
                Running fresh scan for @AuraEnabled methods in Apex classes and their references in Lightning Web Components (cache cleared)...
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill indeterminate" id="progress-bar-fill"></div>
            </div>
        </div>

        <div class="security-report-container hidden" id="security-report-container">
            <div class="security-report-header">
                <div class="security-report-title">
                    <span class="icon shield-icon">🛡️</span>
                    Security Analysis Report
                </div>
                <div class="security-summary">
                    <div class="summary-item high-severity">
                        <span class="severity-count" id="high-count">0</span>
                        <span class="severity-label">High</span>
                    </div>
                    <div class="summary-item medium-severity">
                        <span class="severity-count" id="medium-count">0</span>
                        <span class="severity-label">Medium</span>
                    </div>
                    <div class="summary-item low-severity">
                        <span class="severity-count" id="low-count">0</span>
                        <span class="severity-label">Low</span>
                    </div>
                    <div class="summary-item total">
                        <span class="severity-count" id="total-count">0</span>
                        <span class="severity-label">Total Issues</span>
                    </div>
                </div>
                <div class="report-actions">
                    <div class="export-dropdown">
                        <button class="export-report-button" id="export-security-report" title="Export Report">
                            <span>📥</span> Export
                        </button>
                        <div class="export-dropdown-content" id="export-dropdown-content">
                            <button class="export-option" data-format="csv">
                                <span>📊</span> Export as CSV
                            </button>
                            <button class="export-option" data-format="json">
                                <span>📋</span> Export as JSON
                            </button>
                            <button class="export-option" data-format="html">
                                <span>🌐</span> Export as HTML Report
                            </button>
                        </div>
                    </div>
                    <button class="close-report-button" id="close-security-report" title="Close Report">&times;</button>
                </div>
            </div>
            
            <div class="security-filters">
                <div class="filter-group">
                    <span class="filter-group-title">Severity:</span>
                    <label>
                        <input type="checkbox" id="filter-high" checked>
                        <span class="filter-label high">High</span>
                    </label>
                    <label>
                        <input type="checkbox" id="filter-medium" checked>
                        <span class="filter-label medium">Medium</span>
                    </label>
                    <label>
                        <input type="checkbox" id="filter-low" checked>
                        <span class="filter-label low">Low</span>
                    </label>
                </div>
                <div class="filter-group" id="category-filter-group">
                    <span class="filter-group-title">Category:</span>
                    <label id="filter-crud-fls-label" style="display: none;">
                        <input type="checkbox" id="filter-crud-fls" checked>
                        <span class="filter-label category">CRUD/FLS <span class="filter-count" id="count-crud-fls">(0)</span></span>
                    </label>
                    <label id="filter-dml-loops-label" style="display: none;">
                        <input type="checkbox" id="filter-dml-loops" checked>
                        <span class="filter-label category">DML Loops <span class="filter-count" id="count-dml-loops">(0)</span></span>
                    </label>
                    <label id="filter-soql-injection-label" style="display: none;">
                        <input type="checkbox" id="filter-soql-injection" checked>
                        <span class="filter-label category">SOQL Injection <span class="filter-count" id="count-soql-injection">(0)</span></span>
                    </label>
                    <label id="filter-sharing-label" style="display: none;">
                        <input type="checkbox" id="filter-sharing" checked>
                        <span class="filter-label category">Sharing <span class="filter-count" id="count-sharing">(0)</span></span>
                    </label>
                    <label id="filter-ui-security-label" style="display: none;">
                        <input type="checkbox" id="filter-ui-security" checked>
                        <span class="filter-label category">UI Security <span class="filter-count" id="count-ui-security">(0)</span></span>
                    </label>
                    <label id="filter-general-label" style="display: none;">
                        <input type="checkbox" id="filter-general" checked>
                        <span class="filter-label category">General <span class="filter-count" id="count-general">(0)</span></span>
                    </label>
                </div>
            </div>
            
            <div class="security-issues-list" id="security-issues-list">
                <!-- Security issues will be populated here -->
            </div>
        </div>
        
        <div class="status-message" id="status-bar">
            Ready
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Elements
            const orgSelector = document.getElementById('org-selector');
            const openOrgButton = document.getElementById('open-org-button');
            const deployOrgButton = document.getElementById('deploy-org-button');
            const terminalDropdown = document.getElementById('terminal-dropdown-group');
            const terminalMainButton = document.getElementById('terminal-main-button');
            const terminalMenu = document.getElementById('terminal-dropdown-menu');
            const statusBar = document.getElementById('status-bar');
            const progressContainer = document.getElementById('progress-container');
            const progressTitle = document.getElementById('progress-title');
            const progressDescription = document.getElementById('progress-description');
            const progressBarFill = document.getElementById('progress-bar-fill');
            
            // Security report elements
            const securityReportContainer = document.getElementById('security-report-container');
            const closeSecurityReportButton = document.getElementById('close-security-report');
            const exportSecurityReportButton = document.getElementById('export-security-report');
            const exportDropdownContent = document.getElementById('export-dropdown-content');
            const highCountElement = document.getElementById('high-count');
            const mediumCountElement = document.getElementById('medium-count');
            const lowCountElement = document.getElementById('low-count');
            const totalCountElement = document.getElementById('total-count');
            const securityIssuesList = document.getElementById('security-issues-list');
            const filterHighCheckbox = document.getElementById('filter-high');
            const filterMediumCheckbox = document.getElementById('filter-medium');
            const filterLowCheckbox = document.getElementById('filter-low');
            
            // Category filter elements
            const filterCrudFlsCheckbox = document.getElementById('filter-crud-fls');
            const filterDmlLoopsCheckbox = document.getElementById('filter-dml-loops');
            const filterSoqlInjectionCheckbox = document.getElementById('filter-soql-injection');
            const filterSharingCheckbox = document.getElementById('filter-sharing');
            const filterUiSecurityCheckbox = document.getElementById('filter-ui-security');
            const filterGeneralCheckbox = document.getElementById('filter-general');
            
            // Category filter labels (for showing/hiding)
            const filterCrudFlsLabel = document.getElementById('filter-crud-fls-label');
            const filterDmlLoopsLabel = document.getElementById('filter-dml-loops-label');
            const filterSoqlInjectionLabel = document.getElementById('filter-soql-injection-label');
            const filterSharingLabel = document.getElementById('filter-sharing-label');
            const filterUiSecurityLabel = document.getElementById('filter-ui-security-label');
            const filterGeneralLabel = document.getElementById('filter-general-label');
            const categoryFilterGroup = document.getElementById('category-filter-group');
            
            // Category count elements
            const countCrudFls = document.getElementById('count-crud-fls');
            const countDmlLoops = document.getElementById('count-dml-loops');
            const countSoqlInjection = document.getElementById('count-soql-injection');
            const countSharing = document.getElementById('count-sharing');
            const countUiSecurity = document.getElementById('count-ui-security');
            const countGeneral = document.getElementById('count-general');
            
            
            // Selected org tracking
            let selectedOrg = '';
            
            // Security report state
            let currentSecurityReport = null;
            
            // Update status
            function updateStatus(message, type = 'info') {
                statusBar.textContent = message;
                statusBar.className = 'status-message';
                if (type === 'error') {
                    statusBar.classList.add('status-error');
                } else if (type === 'success') {
                    statusBar.classList.add('status-success');
                }
            }
            
            // Progress functions
            function showProgress(title = 'Processing...', description = '') {
                console.log('[TractionTab] showProgress called:', title, description);
                progressTitle.textContent = title;
                progressDescription.textContent = description;
                progressContainer.classList.add('active');
                progressBarFill.classList.add('indeterminate');
                progressBarFill.style.width = '30%';
                console.log('[TractionTab] Progress container classes:', progressContainer.className);
            }
            
            function updateProgress(title, description, percentage = null) {
                console.log('[TractionTab] updateProgress called:', title, description, percentage);
                if (title) progressTitle.textContent = title;
                if (description) progressDescription.textContent = description;
                
                if (percentage !== null && percentage >= 0 && percentage <= 100) {
                    progressBarFill.classList.remove('indeterminate');
                    progressBarFill.style.width = percentage + '%';
                } else if (!progressBarFill.classList.contains('indeterminate')) {
                    progressBarFill.classList.add('indeterminate');
                    progressBarFill.style.width = '30%';
                }
            }
            
            function hideProgress() {
                console.log('[TractionTab] hideProgress called');
                progressContainer.classList.remove('active');
                progressBarFill.classList.remove('indeterminate');
                progressBarFill.style.width = '0%';
            }
            
            // Security report functions
            function displaySecurityReport(report) {
                console.log('[TractionTab] displaySecurityReport called:', report);
                
                currentSecurityReport = report;
                
                // Update summary counts
                highCountElement.textContent = report.highSeverityCount;
                mediumCountElement.textContent = report.mediumSeverityCount;
                lowCountElement.textContent = report.lowSeverityCount;
                totalCountElement.textContent = report.totalIssues;
                
                // Calculate category counts
                const categoryCounts = {
                    'crud-fls': 0,
                    'dml-loops': 0,
                    'soql-injection': 0,
                    'sharing': 0,
                    'ui-security': 0,
                    'general': 0
                };
                
                if (report.issues && report.issues.length > 0) {
                    report.issues.forEach(issue => {
                        const categoryKey = issue.category.toLowerCase().replace('_', '-');
                        if (categoryCounts.hasOwnProperty(categoryKey)) {
                            categoryCounts[categoryKey]++;
                        }
                    });
                }
                
                // Update category filters visibility and counts
                updateCategoryFilters(categoryCounts);
                
                // Clear existing issues
                securityIssuesList.innerHTML = '';
                
                // Add issues
                if (report.issues && report.issues.length > 0) {
                    report.issues.forEach((issue, index) => {
                        const issueElement = createSecurityIssueElement(issue, index);
                        securityIssuesList.appendChild(issueElement);
                    });
                } else {
                    const noIssuesElement = document.createElement('div');
                    noIssuesElement.className = 'no-issues-message';
                    noIssuesElement.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">🎉 No security issues found!</p>';
                    securityIssuesList.appendChild(noIssuesElement);
                }
                
                // Show the security report container
                securityReportContainer.classList.remove('hidden');
            }
            
            function updateCategoryFilters(categoryCounts) {
                // Category filter mapping
                const categoryFilters = [
                    { key: 'crud-fls', label: filterCrudFlsLabel, count: countCrudFls },
                    { key: 'dml-loops', label: filterDmlLoopsLabel, count: countDmlLoops },
                    { key: 'soql-injection', label: filterSoqlInjectionLabel, count: countSoqlInjection },
                    { key: 'sharing', label: filterSharingLabel, count: countSharing },
                    { key: 'ui-security', label: filterUiSecurityLabel, count: countUiSecurity },
                    { key: 'general', label: filterGeneralLabel, count: countGeneral }
                ];
                
                let hasVisibleCategories = false;
                
                categoryFilters.forEach(filter => {
                    const count = categoryCounts[filter.key] || 0;
                    filter.count.textContent = \`(\${count})\`;
                    
                    if (count > 0) {
                        filter.label.style.display = 'flex';
                        hasVisibleCategories = true;
                    } else {
                        filter.label.style.display = 'none';
                    }
                });
                
                // Show/hide the entire category filter group
                if (hasVisibleCategories) {
                    categoryFilterGroup.style.display = 'flex';
                } else {
                    categoryFilterGroup.style.display = 'none';
                }
            }
            
            function createSecurityIssueElement(issue, index) {
                const issueDiv = document.createElement('div');
                issueDiv.className = \`security-issue severity-\${issue.severity.toLowerCase()}\`;
                issueDiv.dataset.severity = issue.severity.toLowerCase();
                issueDiv.dataset.category = issue.category.toLowerCase().replace('_', '-');
                
                const fileName = issue.file.split(/[\\/]/).pop();
                const relativeFile = issue.file.replace(/.*[\\/]src[\\/]/, 'src/');
                
                issueDiv.innerHTML = \`
                    <div class="issue-header">
                        <div class="issue-title">\${issue.title}</div>
                        <div class="issue-severity \${issue.severity.toLowerCase()}">\${issue.severity}</div>
                    </div>
                    <div class="issue-location">
                        📁 \${relativeFile} • Line \${issue.line}:\${issue.column}
                    </div>
                    <div class="issue-description">\${issue.description}</div>
                    <div class="issue-code">\${issue.code}</div>
                    <div class="issue-recommendation">💡 \${issue.recommendation}</div>
                \`;
                
                // Add click handler to navigate to issue
                issueDiv.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'navigateToIssue',
                        filePath: issue.file,
                        line: issue.line,
                        column: issue.column
                    });
                });
                
                return issueDiv;
            }
            
            function filterSecurityIssues() {
                // Severity filters
                const showHigh = filterHighCheckbox.checked;
                const showMedium = filterMediumCheckbox.checked;
                const showLow = filterLowCheckbox.checked;
                
                // Category filters
                const showCrudFls = filterCrudFlsCheckbox.checked;
                const showDmlLoops = filterDmlLoopsCheckbox.checked;
                const showSoqlInjection = filterSoqlInjectionCheckbox.checked;
                const showSharing = filterSharingCheckbox.checked;
                const showUiSecurity = filterUiSecurityCheckbox.checked;
                const showGeneral = filterGeneralCheckbox.checked;
                
                const issues = securityIssuesList.querySelectorAll('.security-issue');
                issues.forEach(issue => {
                    const severity = issue.dataset.severity;
                    const category = issue.dataset.category;
                    
                    // Check severity
                    const severityMatch = (severity === 'high' && showHigh) ||
                                         (severity === 'medium' && showMedium) ||
                                         (severity === 'low' && showLow);
                    
                    // Check category  
                    const categoryMatch = (category === 'crud-fls' && showCrudFls) ||
                                         (category === 'dml-loops' && showDmlLoops) ||
                                         (category === 'soql-injection' && showSoqlInjection) ||
                                         (category === 'sharing' && showSharing) ||
                                         (category === 'ui-security' && showUiSecurity) ||
                                         (category === 'general' && showGeneral);
                    
                    // Show only if both severity and category match
                    if (severityMatch && categoryMatch) {
                        issue.classList.remove('hidden');
                    } else {
                        issue.classList.add('hidden');
                    }
                });
            }
            
            function closeSecurityReport() {
                securityReportContainer.classList.add('hidden');
                currentSecurityReport = null;
                
                // Reset category filters to hidden state
                const categoryLabels = [
                    filterCrudFlsLabel, filterDmlLoopsLabel, filterSoqlInjectionLabel,
                    filterSharingLabel, filterUiSecurityLabel, filterGeneralLabel
                ];
                
                categoryLabels.forEach(label => {
                    if (label) label.style.display = 'none';
                });
                
                categoryFilterGroup.style.display = 'none';
            }
            
            function exportSecurityReport(format) {
                if (!currentSecurityReport) {
                    console.error('No security report available for export');
                    updateStatus('No security report available for export', 'error');
                    return;
                }
                
                // Get filtered issues (only currently visible ones)
                const filteredIssues = getFilteredSecurityIssues();
                
                // Send export request to extension
                vscode.postMessage({
                    command: 'exportSecurityReport',
                    format: format,
                    data: {
                        ...currentSecurityReport,
                        issues: filteredIssues,
                        exportTimestamp: new Date().toISOString(),
                        totalFilteredIssues: filteredIssues.length
                    }
                });
                
                updateStatus('Exporting security report as ' + format.toUpperCase() + '...', 'info');
            }
            
            function getFilteredSecurityIssues() {
                if (!currentSecurityReport) return [];
                
                const showHigh = filterHighCheckbox.checked;
                const showMedium = filterMediumCheckbox.checked;
                const showLow = filterLowCheckbox.checked;
                const showCrudFls = filterCrudFlsCheckbox.checked;
                const showDmlLoops = filterDmlLoopsCheckbox.checked;
                const showSoqlInjection = filterSoqlInjectionCheckbox.checked;
                const showSharing = filterSharingCheckbox.checked;
                const showUiSecurity = filterUiSecurityCheckbox.checked;
                const showGeneral = filterGeneralCheckbox.checked;
                
                return currentSecurityReport.issues.filter(issue => {
                    // Check severity filter
                    const severityMatch = (issue.severity === 'HIGH' && showHigh) ||
                                        (issue.severity === 'MEDIUM' && showMedium) ||
                                        (issue.severity === 'LOW' && showLow);
                    
                    // Check category filter
                    const categoryMatch = (issue.category === 'CRUD_FLS' && showCrudFls) ||
                                        (issue.category === 'DML_LOOPS' && showDmlLoops) ||
                                        (issue.category === 'SOQL_INJECTION' && showSoqlInjection) ||
                                        (issue.category === 'SHARING' && showSharing) ||
                                        (issue.category === 'UI_SECURITY' && showUiSecurity) ||
                                        (issue.category === 'GENERAL' && showGeneral);
                    
                    return severityMatch && categoryMatch;
                });
            }
            
            // Handle org selection with the same logic as other tabs
            orgSelector.addEventListener('change', () => {
                selectedOrg = orgSelector.value;
                if (selectedOrg === '__refresh__') {
                    // Reset selection to previously selected value
                    orgSelector.value = orgSelector.getAttribute('data-last-selection') || '';
                    selectedOrg = '';
                    vscode.postMessage({ command: 'refreshOrgList' });
                    updateStatus('Refreshing org list...');
                    return;
                }
                
                if (selectedOrg) {
                    updateStatus(\`Selected org: \${selectedOrg}\`, 'success');
                    // Store the selection
                    orgSelector.setAttribute('data-last-selection', selectedOrg);
                                            vscode.postMessage({
                            command: 'setSelectedOrg',
                            alias: selectedOrg,
                            viewId: 'traction'
                        });
                } else {
                    updateStatus('No org selected');
                }
            });
            
            // Open org
            function openOrg() {
                if (!selectedOrg) {
                    updateStatus('Please select an org first', 'error');
                    return;
                }
                vscode.postMessage({
                    command: 'openOrg',
                    alias: selectedOrg
                });
                updateStatus(\`Opening org: \${selectedOrg}\`);
            }
            
            openOrgButton.addEventListener('click', openOrg);
            
            // Deploy
            function deploy() {
                if (!selectedOrg) {
                    updateStatus('Please select an org first', 'error');
                    return;
                }
                vscode.postMessage({
                    command: 'deploy',
                    alias: selectedOrg
                });
                updateStatus(\`Deploying to org: \${selectedOrg}\`);
            }
            
            deployOrgButton.addEventListener('click', deploy);
            
            // Terminal dropdown
            terminalMainButton.addEventListener('click', (e) => {
                e.stopPropagation();
                terminalMenu.classList.toggle('hidden');
            });
            
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                terminalMenu.classList.add('hidden');
            });
            
            // Terminal dropdown items
            document.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = item.dataset.action;
                    
                    // Handle security scan actions
                    if (action === 'securityScanWorkspace') {
                        showProgress(
                            'Security Analysis in Progress',
                            'Scanning all workspace files for security vulnerabilities and compliance issues...'
                        );
                        updateStatus('Starting workspace security analysis...');
                        vscode.postMessage({
                            command: 'runSecurityScan',
                            scanType: 'workspace'
                        });
                    } else if (action === 'securityScanCurrent') {
                        showProgress(
                            'Security Analysis in Progress',
                            'Scanning current file for security vulnerabilities and compliance issues...'
                        );
                        updateStatus('Starting current file security analysis...');
                        vscode.postMessage({
                            command: 'runSecurityScan',
                            scanType: 'current'
                        });
                    } else if (action === 'auraEnabled') {
                        // Show progress for @AuraEnabled report
                        showProgress(
                            'Fresh @AuraEnabled Scan',
                            'Running fresh scan for @AuraEnabled methods in Apex classes and their references in Lightning Web Components (cache cleared)...'
                        );
                        updateStatus('Starting fresh @AuraEnabled report generation (cache cleared)...');
                        vscode.postMessage({
                            command: 'terminalAction',
                            action: action
                        });
                    } else {
                        updateStatus(\`Opening \${item.textContent}...\`);
                        vscode.postMessage({
                            command: 'terminalAction',
                            action: action
                        });
                    }
                    
                    terminalMenu.classList.add('hidden');
                });
            });
            
            // Security report event handlers
            closeSecurityReportButton.addEventListener('click', closeSecurityReport);
            
            // Export functionality
            if (exportSecurityReportButton && exportDropdownContent) {
                exportSecurityReportButton.addEventListener('click', () => {
                    console.log('Export button clicked, toggling dropdown');
                    exportDropdownContent.classList.toggle('show');
                });
                
                // Close dropdown when clicking outside
                document.addEventListener('click', (event) => {
                    if (!exportSecurityReportButton.contains(event.target) && !exportDropdownContent.contains(event.target)) {
                        exportDropdownContent.classList.remove('show');
                    }
                });
                
                // Handle export option clicks
                const exportOptions = document.querySelectorAll('.export-option');
                console.log('Found export options:', exportOptions.length);
                exportOptions.forEach(option => {
                    option.addEventListener('click', (event) => {
                        console.log('Export option clicked:', event.currentTarget.dataset.format);
                        event.preventDefault();
                        event.stopPropagation();
                        const format = event.currentTarget.dataset.format;
                        exportSecurityReport(format);
                        exportDropdownContent.classList.remove('show');
                    });
                });
            } else {
                console.error('Export elements not found:', {
                    exportButton: !!exportSecurityReportButton,
                    exportDropdown: !!exportDropdownContent
                });
            }
            
            // Filter event handlers
            filterHighCheckbox.addEventListener('change', filterSecurityIssues);
            filterMediumCheckbox.addEventListener('change', filterSecurityIssues);
            filterLowCheckbox.addEventListener('change', filterSecurityIssues);
            
            // Category filter event handlers
            filterCrudFlsCheckbox.addEventListener('change', filterSecurityIssues);
            filterDmlLoopsCheckbox.addEventListener('change', filterSecurityIssues);
            filterSoqlInjectionCheckbox.addEventListener('change', filterSecurityIssues);
            filterSharingCheckbox.addEventListener('change', filterSecurityIssues);
            filterUiSecurityCheckbox.addEventListener('change', filterSecurityIssues);
            filterGeneralCheckbox.addEventListener('change', filterSecurityIssues);
            
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateOrgList':
                        updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);
                        break;
                    case 'updateStatus':
                        updateStatus(message.message, message.type);
                        break;
                    case 'setSelectedOrg':
                        selectedOrg = message.alias;
                        orgSelector.value = selectedOrg;
                        orgSelector.setAttribute('data-last-selection', selectedOrg);
                        updateStatus(\`Selected org: \${selectedOrg}\`, 'success');
                        break;
                    case 'showProgress':
                        console.log('[TractionTab] Received showProgress message:', message);
                        showProgress(message.title, message.description);
                        break;
                    case 'updateProgress':
                        console.log('[TractionTab] Received updateProgress message:', message);
                        updateProgress(message.title, message.description, message.percentage);
                        break;
                    case 'hideProgress':
                        console.log('[TractionTab] Received hideProgress message');
                        hideProgress();
                        break;
                    case 'displaySecurityReport':
                        console.log('[TractionTab] Received displaySecurityReport message:', message);
                        displaySecurityReport(message.report);
                        break;
                }
            });
            
            // Update org list UI with the same logic as other tabs
            function updateOrgListUI(orgs, fromCache = false, backendSelectedOrg = null) {
                OrgUtils.logDebug('[VisbalExt.TractionTab] updateOrgListUI -- Updating org list UI with data:', orgs);
                OrgUtils.logDebug('[VisbalExt.TractionTab] updateOrgListUI -- Backend selected org:', backendSelectedOrg);
                
                // Clear existing options
                orgSelector.innerHTML = '';
                
                // Add refresh option at the top
                const refreshOption = document.createElement('option');
                refreshOption.value = '__refresh__';
                refreshOption.textContent = '↻ Refresh Org List';
                refreshOption.style.fontStyle = 'italic';
                refreshOption.style.backgroundColor = 'var(--vscode-dropdown-background)';
                orgSelector.appendChild(refreshOption);
        
                // Add a separator
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '──────────────';
                orgSelector.appendChild(separator);
        
                // Track default org for auto-selection
                let defaultOrg = null;
                
                // Helper function to add section if it has items
                const addSection = (items, sectionName) => {
                    if (items && items.length > 0) {
                        const optgroup = document.createElement('optgroup');
                        optgroup.label = sectionName;
                        
                        items.forEach(org => {
                            const option = document.createElement('option');
                            option.value = org.alias;
                            option.textContent = org.alias || org.username;
                            if (org.isDefault) {
                                option.textContent += ' (Default)';
                                if (!defaultOrg) {
                                    defaultOrg = org.alias; // Remember the first default org we find
                                }
                            }
                            // Select the option if it matches the backend selected org
                            option.selected = backendSelectedOrg && org.alias === backendSelectedOrg;
                            optgroup.appendChild(option);
                        });
                        
                        orgSelector.appendChild(optgroup);
                        return true;
                    }
                    return false;
                };
        
                let hasAnyOrgs = false;
                hasAnyOrgs = addSection(orgs.devHubs, 'Dev Hubs') || hasAnyOrgs;
                hasAnyOrgs = addSection(orgs.nonScratchOrgs, 'Non-Scratch Orgs') || hasAnyOrgs;
                hasAnyOrgs = addSection(orgs.sandboxes, 'Sandboxes') || hasAnyOrgs;
                hasAnyOrgs = addSection(orgs.scratchOrgs, 'Scratch Orgs') || hasAnyOrgs;
                hasAnyOrgs = addSection(orgs.other, 'Other') || hasAnyOrgs;
        
                if (!hasAnyOrgs) {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = 'No orgs found';
                    orgSelector.appendChild(option);
                    selectedOrg = ''; // Clear global selectedOrg
                    updateStatus('No orgs found', 'error');
                } else {
                    if (backendSelectedOrg) {
                        // Use the backend-provided selected org
                        orgSelector.value = backendSelectedOrg;
                        selectedOrg = backendSelectedOrg; // Update global selectedOrg variable
                        OrgUtils.logDebug('[VisbalExt.TractionTab] Set selected org from backend:', backendSelectedOrg);
                        updateStatus('Selected org: ' + backendSelectedOrg, 'success');
                    } else if (!selectedOrg && defaultOrg) {
                        // Auto-select the default org if no org is currently selected
                        orgSelector.value = defaultOrg;
                        selectedOrg = defaultOrg; // Update global selectedOrg variable
                        OrgUtils.logDebug('[VisbalExt.TractionTab] Auto-selected default org:', defaultOrg);
                        
                        // Notify the backend about the auto-selection
                        setTimeout(() => {
                            vscode.postMessage({
                                command: 'setSelectedOrg',
                                alias: defaultOrg,
                                viewId: 'traction'
                            });
                        }, 100);
                        
                        updateStatus('Auto-selected default org: ' + defaultOrg, 'success');
                    } else {
                        updateStatus('Org list updated', 'success');
                    }
                }
        
                // Store the selection (including auto-selected default)
                const currentSelection = orgSelector.value;
                if (currentSelection) {
                    orgSelector.setAttribute('data-last-selection', currentSelection);
                }
            }
            
            // Initialize
            vscode.postMessage({ command: 'loadOrgList' });
            updateStatus('Loading org list...');
            
        })();
    </script>
</body>
</html>`;
}