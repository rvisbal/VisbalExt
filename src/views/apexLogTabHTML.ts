import { styles } from "./styles";
import * as vscode from "vscode";
import { formatLogContentForHtml } from "../utils/logParsingUtils";

export function getNonce() {
    let text = "";
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getHtmlForWebview(
    extensionUri: vscode.Uri,
    webview: vscode.Webview
): string {
    const styleResetUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "main.css")
    );
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "main.js")
    );
    const debugPresetUtilsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "debugPresetUtils.js")
    );
    const orgList = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "orgList.js")
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    // HTML TEMPLATE STRING
    // JavaScript/HTML section, type script rule dont apply in this block
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${styleResetUri}" rel="stylesheet">
      <link href="${styleVSCodeUri}" rel="stylesheet">
      <link href="${styleMainUri}" rel="stylesheet">
      <style>${styles}</style>
      <title>Salesforce Debug Logs</title>
      <style>
        .container {
          display: flex;
          flex-direction: column;
          height: 100vh;
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
        .filter-input {
          width: 200px;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid var(--vscode-input-border);
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
        }
        .icon-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--vscode-button-foreground);
          background-color: #4d4d4d; /* Grey background for all icon buttons */
          border-radius: 4px;
          width: 28px;
          height: 28px;
          margin: 0 2px;
          transition: background-color 0.2s;
        }
        .icon-button:hover {
          background-color: #666666; /* Slightly lighter on hover */
        }
        .icon-button:active {
          background-color: #333333; /* Darker when clicked */
        }
        .icon-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background-color: #4d4d4d;
        }
        .download-icon {
          color: white;
        }
        .open-icon {
          color: white;
        }
        .view-icon {
          color: white;
        }
        .action-cell {
          display: flex;
          gap: 4px;
          justify-content: center;
        }
        .clear-filter-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--vscode-descriptionForeground);
          opacity: 0.7;
          border-radius: 4px;
          width: 28px;
          height: 28px;
        }
        .clear-filter-button:hover {
          opacity: 1;
          background-color: var(--vscode-list-hoverBackground);
        }
        .clear-filter-button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .actions-section, .button-group {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          min-width: 0;
          gap: 8px;
        }
        .button-group > * {
          flex-shrink: 0;
          margin-right: 0;
        }
        .button-group {
          gap: 4px;
        }
        .text-button {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .text-button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .text-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .danger-button {
          background-color: var(--vscode-errorForeground, #f48771);
        }
        .danger-button:hover {
          background-color: var(--vscode-errorForeground, #f48771);
          opacity: 0.8;
        }
        .warning-button {
          background-color: var(--vscode-editorWarning-foreground, #cca700);
        }
        .warning-button:hover {
          background-color: var(--vscode-editorWarning-foreground, #cca700);
          opacity: 0.8;
        }
        .logs-container {
          flex: 1;
          overflow: auto;
        }
        .logs-table {
          width: 100%;
          border-collapse: collapse;
        }
        .logs-table th {
          position: sticky;
          top: 0;
          background-color: var(--vscode-editor-background);
          z-index: 1;
          text-align: left;
          padding: 8px;
          border-bottom: 1px solid var(--vscode-panel-border);
          cursor: pointer;
        }
        .logs-table th:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .logs-table td {
          padding: 8px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .logs-table tbody tr {
          background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
        }
        .logs-table tbody tr:nth-child(even) {
          background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.2));
        }
        .logs-table tr:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .checkbox-cell {
          text-align: center;
        }
        .sort-icon::after {
          content: "↓";
          margin-left: 4px;
        }
        .sort-icon.asc::after {
          content: "↑";
        }
        .sorted-asc::after {
          content: " ▲";
          font-size: 0.8em;
        }
        .sorted-desc::after {
          content: " ▼";
          font-size: 0.8em;
        }
        .download-icon::before {
          content: "⬇️";
        }
        .open-icon::before {
          content: "📄";
        }
        .loading-container {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: var(--vscode-editor-background);
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          z-index: 10;
        }
        .loading-spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top: 4px solid var(--vscode-progressBar-background);
          width: 20px;
          height: 20px;
          animation: spin 1s linear infinite;
          margin-right: 10px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .hidden {
          display: none !important;
        }
        .error-container {
          background-color: var(--vscode-inputValidation-errorBackground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          color: var(--vscode-inputValidation-errorForeground);
          padding: 10px;
          margin: 10px;
          border-radius: 3px;
        }
        .success-container {
          background-color: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.1));
          border: 1px solid var(--vscode-editorInfo-border, #007acc);
          color: var(--vscode-editorInfo-foreground, #007acc);
          padding: 10px;
          margin: 10px;
          border-radius: 3px;
        }
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 100;
        }
        
        /* Debug Configuration Bar Styles */
        .debug-config-bar-wrapper {
          display: flex;
          align-items: center;
          position: relative;
          width: 100%;
          background-color: var(--vscode-editor-inactiveSelectionBackground);
          border-bottom: 1px solid var(--vscode-panel-border);
          padding: 6px 10px;
          gap: 8px;
          overflow: hidden; /* Prevent wrapper from growing beyond container */
        }
        

        
        .debug-option {
          display: flex;
          align-items: center;
          gap: 3px;
          flex-shrink: 0; /* Prevent options from shrinking */
          min-width: fit-content; /* Ensure minimum content width */
        }
        
        .debug-option label {
          font-size: 10px;
          color: var(--vscode-descriptionForeground);
          white-space: nowrap;
          min-width: fit-content; /* Prevent label from shrinking */
        }
        
        .debug-select {
          font-size: 10px;
          padding: 1px 3px;
          background-color: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground);
          border: 1px solid var(--vscode-dropdown-border);
          border-radius: 2px;
          min-width: 70px; /* Changed from max-width to min-width */
          white-space: nowrap;
        }
        
        .debug-actions {
          display: flex;
          align-items: center;
        }
        

        
        /* Responsive adjustments */
        @media (max-width: 1200px) {
          .debug-config-options {
            flex-wrap: wrap;
          }
        }
        
        .modal-content {
          background-color: var(--vscode-editor-background);
          padding: 20px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 100%;
        }
        .modal-title {
          font-size: 18px;
          margin-bottom: 10px;
          color: var(--vscode-errorForeground, #f48771);
        }
        .modal-message {
          margin-bottom: 20px;
        }
        .modal-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        #refresh-button {
          white-space: nowrap;
          font-size: 14px;
          padding: 6px 10px;
          background-color: #4d4d4d; /* Nice contrast grey */
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
  
        #refresh-button:hover {
          background-color: #666666; /* Slightly lighter on hover */
        }
  
        #refresh-button:active {
          background-color: #333333; /* Darker when clicked */
        }

        #soql-button {
          white-space: nowrap;
          font-size: 14px;
          padding: 6px 10px;
          background-color: #4d4d4d; /* Nice contrast grey */
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
  
        #soql-button:hover {
          background-color: #666666; /* Slightly lighter on hover */
        }
  
        #soql-button:active {
          background-color: #333333; /* Darker when clicked */
        }

        .org-selector-container {
          display: flex;
          align-items: center;
          gap: 4px;
          margin: 0 8px;
        }
        
        .org-selector {
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid var(--vscode-dropdown-border);
          background-color: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground);
          font-size: 12px;
          min-width: 200px;
          cursor: pointer;
        }
        
        .org-selector:hover {
          border-color: var(--vscode-focusBorder);
        }
        
        .org-selector:focus {
          outline: none;
          border-color: var(--vscode-focusBorder);
        }
        .dropdown-arrow {
          margin-left: 4px;
          cursor: pointer;
          padding: 0 6px;
          border-radius: 2px;
          transition: background 0.15s;
        }
        .dropdown-arrow:hover {
          background: var(--vscode-list-hoverBackground, #2c2c32);
        }
        .text-button.danger-button#delete-selected-button {
          display: none;
        }
        .text-button.danger-button#delete-selected-button.visible {
          display: flex;
        }
        
        .debug-config-preset-fixed {
          flex-shrink: 0;
          margin-right: 12px;
          display: flex;
          align-items: center;
        }
	</style>
	<style>
        .dropdown-button-group {
          position: relative;
          display: inline-block;
        }

        .dropdown-menu {
          display: block;
          position: absolute;
          right: 0;
          top: 110%; /* Slightly below the button */
          min-width: 260px;
          background: var(--vscode-editorWidget-background, #252526);
          border: 1px solid var(--vscode-panel-border, #333);
          border-radius: 6px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 1.5px 4px rgba(0,0,0,0.15);
          z-index: 9999;
          padding: 4px 0;
          margin-top: 4px;
          animation: fadeIn 0.15s;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px);}
          to   { opacity: 1; transform: translateY(0);}
        }

        .dropdown-menu.hidden {
          display: none;
        }

        .dropdown-item {
          padding: 6px 16px;
          font-size: 12px;
          cursor: pointer;
          color: var(--vscode-button-foreground, #fff);
          background: none;
          border: none;
          text-align: left;
          transition: background 0.15s, color 0.15s;
        }

        .dropdown-item:hover {
          background: var(--vscode-list-hoverBackground, #2c2c32);
          color: var(--vscode-button-foreground, #fff);
        }
      </style>
      <style>
        .scroll-wrapper {
            position: relative;
            width: 100%; /* Fill available width */
            flex: 1; /* Take up remaining space in flex container */
            min-width: 0; /* Allow shrinking below content size */
        }
        
        .scroll-container {
            width: 100%;
            overflow-x: auto; /* Allow horizontal scrolling */
            overflow-y: hidden; /* Hide vertical scrollbar */
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* Internet Explorer 10+ */
        }
        
        .scroll-container::-webkit-scrollbar {
            display: none; /* WebKit browsers */
        }
        
        .scroll-content {
            display: flex; /* Arrange items in a row */
            gap: 8px; /* Add consistent spacing between items */
            padding: 0 4px; /* Add small padding to prevent edge clipping */
        }
        
        .item {
            min-width: 100px; /* Set width for each item */
            padding: 10px;
            background-color: lightgray;
            margin-right: 10px;
            flex-shrink: 0; /* Prevent items from shrinking */
        }
        
        .scroll-arrows {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 100%;
            display: flex;
            justify-content: space-between;
            pointer-events: none; /* Allow clicks to pass through */
        }
        
        .scroll-left,
        .scroll-right {
            background-color: white;
            border: 1px solid #ccc;
            cursor: pointer;
            pointer-events: auto; /* Re-enable clicks on buttons */
            padding: 5px 10px;
            border-radius: 3px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .scroll-left.visible,
        .scroll-right.visible {
            opacity: 1;
        }
    </style>
    </head>
    <body>
    <div class="container">
        <div class="debug-config-bar-wrapper">
            <div class="debug-config-preset-fixed">
                <div class="debug-option">
                    <label>Preset</label>
                    <select id="debug-preset" class="debug-select">
                        <option value="default">Default (Standard)</option>
                        <option value="detailed">Detailed</option>
                        <option value="developer">Developer</option>
                        <option value="custom">Custom</option>
                        <option value="debugonly">DebugOnly</option>
                    </select>
                </div>
            </div>
           
            <div class="scroll-wrapper" id="debug-config-bar">
                <div class="scroll-container">
                    <div class="scroll-content" id="debug-config-options">
                        <div class="debug-option">
                            <label>Apex Code</label>
                            <select id="debug-apex-code" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="ERROR">ERROR</option>
                                <option value="WARN">WARN</option>
                                <option value="INFO">INFO</option>
                                <option value="DEBUG">DEBUG</option>
                                <option value="FINE" selected>FINE</option>
                                <option value="FINER">FINER</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Apex Profiling</label>
                            <select id="debug-apex-profiling" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINE">FINE</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Callout</label>
                            <select id="debug-callout" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="ERROR">ERROR</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINER">FINER</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Data Access</label>
                            <select id="debug-data-access" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="WARN">WARN</option>
                                <option value="INFO">INFO</option>
                                <option value="FINE" selected>FINE</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Database</label>
                            <select id="debug-database" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="WARN">WARN</option>
                                <option value="INFO">INFO</option>
                                <option value="FINE" selected>FINE</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>NBA</label>
                            <select id="debug-nba" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="ERROR">ERROR</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINE">FINE</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>System</label>
                            <select id="debug-system" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="INFO">INFO</option>
                                <option value="DEBUG" selected>DEBUG</option>
                                <option value="FINE">FINE</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Validation</label>
                            <select id="debug-validation" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Visualforce</label>
                            <select id="debug-visualforce" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINE">FINE</option>
                                <option value="FINER">FINER</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Wave</label>
                            <select id="debug-wave" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="ERROR">ERROR</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINE">FINE</option>
                                <option value="FINER">FINER</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                        <div class="debug-option">
                            <label>Workflow</label>
                            <select id="debug-workflow" class="debug-select">
                                <option value="NONE">NONE</option>
                                <option value="ERROR">ERROR</option>
                                <option value="WARN">WARN</option>
                                <option value="INFO" selected>INFO</option>
                                <option value="FINE">FINE</option>
                                <option value="FINER">FINER</option>
                                <option value="FINEST">FINEST</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="scroll-arrows">
                    <button class="scroll-left" onclick="scrollToLeft()">&#9664;</button>
                    <button class="scroll-right" onclick="scrollToRight()">&#9654;</button>
                </div>
            </div>
            <button class="icon-button" id="apply-debug-config-button" title="Apply Debug Configuration and Turn On Debug"
                aria-label="Apply Debug Configuration">
                <span class="icon save-icon"></span>
            </button>
        </div>
    
        <div class="top-bar">
            <div class="filter-section">
                <button class="icon-button" id="filter-search-button" title="Search logs" aria-label="Search logs">
                    <span class="icon search-icon"></span>
                </button>
                <input type="text" class="filter-input" placeholder="Filter logs..." id="filter-input">
                <button class="clear-filter-button" id="clear-filter-button">✕</button>
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
                    <div class="dropdown-button-group" id="refresh-dropdown-group">
                        <button class="icon-button" id="refresh-main-button" title="Refresh Logs using sfdx"
                            aria-label="Refresh Logs" style="width: 75px">
                            <span class="icon refresh-icon"></span>
                            <span class="dropdown-arrow" style="margin-left:4px; display:flex; align-items:center;">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="white" style="display:block;">
                                    <path d="M4 6l4 4 4-4" stroke="white" stroke-width="1.5" fill="none"
                                        stroke-linecap="round" />
                                </svg>
                            </span>
                        </button>
                        <div class="dropdown-menu hidden" id="refresh-dropdown-menu">
                            <div class="dropdown-item" data-action="sfdx">Refresh Logs using sfdx</div>
                            <div class="dropdown-item" data-action="soql">Refresh with SOQL</div>
                        </div>
                    </div>
                </div>
                <button class="icon-button" id="deploy-org-button" title="Deploy Org" aria-label="Deploy Org">
                    <span class="icon deploy-icon"></span>
                </button>
                <button class="icon-button" id="clear-local-button" title="Clear Downloaded Log Files on local machine">
                    <span class="icon flame"></span>
                </button>
                <button class="icon-button" id="delete-selected-button" title="Delete Selected Logs" disabled>
                    <span class="icon trash"></span>
                </button>
    
                <div class="dropdown-button-group" id="delete-dropdown-group">
                    <button class="icon-button" id="delete-main-button" title="Delete Logs from Server"
                        aria-label="Terminal" style="width: 75px">
                        <span class="icon trash"></span>
                        <span class="dropdown-arrow" style="margin-left:4px; display:flex; align-items:center;">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="white" style="display:block;">
                                <path d="M4 6l4 4 4-4" stroke="white" stroke-width="1.5" fill="none"
                                    stroke-linecap="round" />
                            </svg>
                        </span>
                    </button>
    
                    <div class="dropdown-menu hidden" id="delete-dropdown-menu">
                        <div class="dropdown-item" data-action="server">Delete Logs from Server</div>
                        <div class="dropdown-item" data-action="rest">Delete Logs using REST API (Tooling API)</div>
                    </div>
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
                        <div class="dropdown-item" data-action="gulp">Create Scrath Org with Gulp</div>
                    </div>
                </div>
            </div>
        </div>
    
        <div id="error-container" class="error-container hidden">
            <div id="error-message" class="status-message status-error" style="display: none;"></div>
        </div>
    
        <div id="success-container" class="success-container hidden">
            <div id="success-message" class="status-message status-success" style="display: none;"></div>
        </div>
    
        <div id="loading-indicator" class="loading-container hidden">
            <div class="loading-spinner"></div>
            <div id="loading-text">Loading logs...</div>
        </div>
    
        <div id="confirm-modal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-title" id="modal-title">Confirmation</div>
                <div class="modal-message" id="modal-message">Are you sure you want to proceed?</div>
                <div class="modal-buttons">
                    <button class="text-button" id="modal-cancel">Cancel</button>
                    <button class="text-button danger-button" id="modal-confirm">Confirm</button>
                </div>
            </div>
        </div>
        <div class="logs-container">
            <table class="logs-table">
                <thead>
                    <tr>
                        <th class="checkbox-cell">
                            <input type="checkbox" id="select-all-checkbox" title="Select All Visible Logs">
                        </th>
                        <th data-sort="id">ID</th>
                        <th class="checkbox-cell">Downloaded</th>
                        <th data-sort="logUser.name">User</th>
                        <th data-sort="application">Application</th>
                        <th data-sort="operation">Operation</th>
                        <th data-sort="lastModifiedDate">Time</th>
                        <th data-sort="status">Status</th>
                        <th data-sort="logLength">Size (bytes)</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="logs-table-body">
                    <!-- Logs will be inserted here -->
                    <tr>
                        <td colspan="10">No logs found. Click Refresh to fetch logs.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
      <script src="${orgList}"></script>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // Elements
        const openOrgButton = document.getElementById('open-org-button');
        const refreshDropdownGroup = document.getElementById('refresh-dropdown-group');
        const refreshMainButton = document.getElementById('refresh-main-button');
        const refreshDropdownMenu = document.getElementById('refresh-dropdown-menu');
        const clearLocalButton = document.getElementById('clear-local-button');
        
        const deleteDropdownGroup = document.getElementById('delete-dropdown-group');
        const deleteMainButton = document.getElementById('delete-main-button');
        const deleteDropdownMenu = document.getElementById('delete-dropdown-menu');

        const terminalDropdownGroup = document.getElementById('terminal-dropdown-group');
        const terminalMainButton = document.getElementById('terminal-main-button');
        const terminalDropdownMenu = document.getElementById('terminal-dropdown-menu');

        const filterInput = document.getElementById('filter-input');
        const clearFilterButton = document.getElementById('clear-filter-button');
        const logsTableBody = document.getElementById('logs-table-body');
        const loadingIndicator = document.getElementById('loading-indicator');
        const loadingText = document.getElementById('loading-text');
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        const successContainer = document.getElementById('success-container');
        const successMessage = document.getElementById('success-message');
        const confirmModal = document.getElementById('confirm-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const modalCancel = document.getElementById('modal-cancel');
        const modalConfirm = document.getElementById('modal-confirm');
        const debugPreset = document.getElementById('debug-preset');
        const applyDebugConfigButton = document.getElementById('apply-debug-config-button');
        
        // Debug configuration elements
        const debugSelects = {
          apexCode: document.getElementById('debug-apex-code'),
          apexProfiling: document.getElementById('debug-apex-profiling'),
          callout: document.getElementById('debug-callout'),
          dataAccess: document.getElementById('debug-data-access'),
          database: document.getElementById('debug-database'),
          nba: document.getElementById('debug-nba'),
          system: document.getElementById('debug-system'),
          validation: document.getElementById('debug-validation'),
          visualforce: document.getElementById('debug-visualforce'),
          wave: document.getElementById('debug-wave'),
          workflow: document.getElementById('debug-workflow')
        };
        
        // Debug presets
        const debugPresets = {
          default: {
            apexCode: 'FINE',
            apexProfiling: 'INFO',
            callout: 'INFO',
            dataAccess: 'INFO',
            database: 'INFO',
            nba: 'INFO',
            system: 'DEBUG',
            validation: 'INFO',
            visualforce: 'INFO',
            wave: 'INFO',
            workflow: 'INFO'
          },
          detailed: {
            apexCode: 'FINE',
            apexProfiling: 'FINE',
            callout: 'FINER',
            dataAccess: 'FINE',
            database: 'FINE',
            nba: 'FINE',
            system: 'FINE',
            validation: 'INFO',
            visualforce: 'FINE',
            wave: 'FINE',
            workflow: 'FINE'
          },
          developer: {
            apexCode: 'FINEST',
            apexProfiling: 'FINEST',
            callout: 'FINEST',
            dataAccess: 'FINEST',
            database: 'FINEST',
            nba: 'FINE',
            system: 'FINEST',
            validation: 'FINEST',
            visualforce: 'FINEST',
            wave: 'FINEST',
            workflow: 'FINEST'
          },
          debugonly: {
            apexCode: 'DEBUG',
            apexProfiling: 'INFO',
            callout: 'INFO',
            dataAccess: 'FINEST',
            database: 'INFO',
            nba: 'ERROR',
            system: 'INFO',
            validation: 'INFO',
            visualforce: 'INFO',
            wave: 'ERROR',
            workflow: 'ERROR'
          }
        };
        
        // Apply preset
        function applyPreset(preset) {
          if (preset === 'custom') {
            return; // Don't change anything for custom
          }
          
          const presetValues = debugPresets[preset];
          if (!presetValues) {
            return;
          }
          
          // Apply preset values to selects
          Object.keys(presetValues).forEach(key => {
            const select = debugSelects[key];
            if (select) {
              select.value = presetValues[key];
            }
          });
        }
        
        // Get current debug configuration
        function getDebugConfig() {
          const config = {};
          Object.keys(debugSelects).forEach(key => {
            config[key] = debugSelects[key].value;
          });
          return config;
        }
        
        // Initialize preset dropdown
        debugPreset.addEventListener('change', () => {
          const selectedPreset = debugPreset.value;
          console.log('[VisbalExt.htmlTemplate] Preset changed to:', selectedPreset);
          
          // Apply the preset values to the dropdowns
          applyPreset(selectedPreset);
          
          // Show a confirmation message
          showSuccess('Debug preset "' + selectedPreset + '" applied to configuration. Click Apply to save changes.');
          setTimeout(() => hideSuccess(), 5000);
        });
        
        // Apply debug configuration and turn on debug
        applyDebugConfigButton.addEventListener('click', () => {
          const config = getDebugConfig();
          console.log('[VisbalExt.htmlTemplate] Applying debug configuration and turning on debug:', config);
          vscode.postMessage({
            command: 'applyDebugConfig',
            config: config,
            turnOnDebug: true
          });
          showLoading('Applying debug configuration and enabling debug log...');
        });
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          console.log('[VisbalExt.htmlTemplate] Received message:', message);
          
          switch (message.command) {
            case 'updateLogs':
              logs = message.logs || [];
              // Sort logs with current sort settings
              sortLogs(currentSort.column, currentSort.direction);
              // Hide loading state after logs are updated and rendered
              hideLoading();
              break;
            case 'loading':
              if (message.isLoading) {
                showLoading(message.message || 'Loading logs...');
              } else {
                hideLoading();
              }
              break;
            case 'error':
              showError(message.error);
              hideLoading();
              break;
            case 'downloading':
              handleDownloadStatus(message.logId, message.isDownloading);
              break;
            case 'downloadStatus':
              handleDownloadStatus(message.logId, message.status === 'downloading', message.status, message.filePath, message.error);
              break;
            case 'debugStatus':
              if (message.success) {
                showSuccess('Debug log enabled successfully!');
                setTimeout(() => hideSuccess(), 5000);
              } else {
                showError('Error: Failed to enable debug log: ' + message.error);
              }
              hideLoading();
              break;
            case 'clearLocalStatus':
              if (message.success) {
                showSuccess('Local log files cleared successfully!');
                setTimeout(() => hideSuccess(), 5000);
              } else {
                showError('Error: Failed to clear local log files: ' + message.error);
              }
              hideLoading();
              break;
            case 'deleteServerStatus':
              if (message.success) {
                showSuccess('Server logs deleted successfully!');
                setTimeout(() => hideSuccess(), 5000);
                // Refresh logs after deletion
                vscode.postMessage({ command: 'fetchLogs' });
              } else {
                showError('Error: Failed to delete server logs: ' + message.error);
              }
              hideLoading();
              break;
            case 'deleteSelectedStatus':
              if (message.success) {
                showSuccess('Selected logs deleted successfully!');
                setTimeout(() => hideSuccess(), 5000);
                // Refresh logs after deletion
                vscode.postMessage({ command: 'fetchLogs' });
              } else {
                showError('Error: Failed to delete selected logs: ' + message.error);
              }
              hideLoading();
              break;
            case 'applyConfigStatus':
              if (message.success) {
                showSuccess('Debug configuration applied successfully!');
                setTimeout(() => hideSuccess(), 5000);
              } else {
                showError('Error: Failed to apply debug configuration: ' + message.error);
              }
              hideLoading();
              break;
            case 'currentDebugConfig':
              console.log('[VisbalExt.htmlTemplate] Received current debug config:', message.config);
              // Update the debug configuration UI with the received config
              if (message.config) {
                Object.keys(message.config).forEach(key => {
                  if (debugSelects[key] && message.config[key]) {
                    debugSelects[key].value = message.config[key];
                  }
                });
                
                // Try to determine if this matches a preset
                let matchedPreset = 'custom';
                for (const [presetName, presetConfig] of Object.entries(debugPresets)) {
                  let isMatch = true;
                  for (const key of Object.keys(presetConfig)) {
                    if (message.config[key] !== presetConfig[key]) {
                      isMatch = false;
                      break;
                    }
                  }
                  if (isMatch) {
                    matchedPreset = presetName;
                    break;
                  }
                }
                debugPreset.value = matchedPreset;
              }
              break;
            case 'warning':
              showError('Warning: ' + message.message);
              setTimeout(() => hideError(), 5000);
              break;
            case 'info':
              showSuccess(message.message);
              setTimeout(() => hideSuccess(), 5000);
              break;
            case 'updateOrgList':
              updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);
              break;
            case 'orgCacheLoaded':
              if (message.cache) {
                // Check if cache is older than 1 hour
                const cacheAge = new Date().getTime() - message.cache.timestamp;
                if (cacheAge < 3600000) { // 1 hour in milliseconds
                  updateOrgListUI(message.cache.orgs, true, message.selectedOrg);
                } else {
                  // Cache is too old, request fresh data
                  vscode.postMessage({ command: 'refreshOrgList' });
                }
              } else {
                // No cache available, request fresh data
                vscode.postMessage({ command: 'refreshOrgList' });
              }
          }
        });
        
        // Request current debug configuration on load - REMOVED to prevent unnecessary API calls
        // document.addEventListener('DOMContentLoaded', () => {
        //   vscode.postMessage({ command: 'getCurrentDebugConfig' });
        // });
        
        // Sorting state
        let currentSort = {
          column: 'lastModifiedDate',
          direction: 'desc'
        };
        
        // State
        let logs = [];
        let pendingAction = null;
        
        // Selection state
        let selectedLogIds = new Set();
  
        // Update delete selected button state
        function updateDeleteSelectedButton() {
          const deleteSelectedButton = document.getElementById('delete-selected-button');
          if (selectedLogIds.size === 0) {
            deleteSelectedButton.classList.remove('visible');
            deleteSelectedButton.disabled = true;
          } else {
            deleteSelectedButton.classList.add('visible');
            deleteSelectedButton.disabled = false;
          }
        }
        
        // Format file size
        function formatBytes(bytes) {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Show loading state
        function showLoading(message = 'Loading logs...') {
          loadingText.textContent = message;
          loadingIndicator.classList.remove('hidden');
          refreshMainButton.disabled = true;
          clearLocalButton.disabled = true;
          deleteMainButton.disabled = true;
          terminalMainButton.disabled = true;

        }
        
        // Hide loading state
        function hideLoading() {
          loadingIndicator.classList.add('hidden');
          refreshMainButton.disabled = false;
          clearLocalButton.disabled = false;
          deleteMainButton.disabled = false;
          terminalMainButton.disabled = false;
        }
        
        // Show error message
        function showError(message) {
          errorMessage.textContent = message;
          errorMessage.style.display = 'block';
          errorContainer.classList.remove('hidden');
        }
        
        // Hide error message
        function hideError() {
          errorMessage.style.display = 'none';
          errorContainer.classList.add('hidden');
        }
        
        // Show success message
        function showSuccess(message) {
          successMessage.textContent = message;
          successMessage.style.display = 'block';
          successContainer.classList.remove('hidden');
        }
        
        // Hide success message
        function hideSuccess() {
          successMessage.style.display = 'none';
          successContainer.classList.add('hidden');
        }
        
        // Show confirmation modal
        function showConfirmModal(title, message, confirmAction) {
          modalTitle.textContent = title;
          modalMessage.textContent = message;
          pendingAction = confirmAction;
          confirmModal.classList.remove('hidden');
        }
        
        // Hide confirmation modal
        function hideConfirmModal() {
          confirmModal.classList.add('hidden');
          pendingAction = null;
        }

        // Attach event listeners to modal buttons
        modalCancel.addEventListener('click', () => {
          hideConfirmModal();
        });
        modalConfirm.addEventListener('click', () => {
          if (pendingAction) {
            pendingAction();
          }
          hideConfirmModal();
        });
        
        // Sort logs
        function sortLogs(column, direction) {
          console.log('[VisbalExt.htmlTemplate] Sorting logs by ' + column + ' ' + direction);
          
          // Update current sort
          currentSort = {
            column: column,
            direction: direction
          };
          
          // Sort logs
          logs.sort((a, b) => {
            // Handle nested properties (e.g., logUser.name)
            let aValue = column.includes('.') ? 
              column.split('.').reduce((obj, key) => obj && obj[key], a) : 
              a[column];
            let bValue = column.includes('.') ? 
              column.split('.').reduce((obj, key) => obj && obj[key], b) : 
              b[column];
            
            // Handle undefined values
            if (aValue === undefined) aValue = '';
            if (bValue === undefined) bValue = '';
            
            // Handle dates
            if (column === 'lastModifiedDate') {
              aValue = new Date(aValue).getTime();
              bValue = new Date(bValue).getTime();
            }
            
            // Handle numbers
            if (column === 'logLength') {
              aValue = Number(aValue) || 0;
              bValue = Number(bValue) || 0;
            }
            
            // Sort
            if (aValue < bValue) {
              return direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
              return direction === 'asc' ? 1 : -1;
            }
            return 0;
          });
          
          // Update UI
          renderLogs();
          
          // Update sort indicators
          document.querySelectorAll('th').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.getAttribute('data-sort') === column) {
              th.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
          });
        }

        // Filter functionality
        filterInput.addEventListener('input', function() {
          const filterValue = this.value.toLowerCase();
          const rows = document.querySelectorAll('#logs-table-body tr');
          
          rows.forEach(row => {
            // Skip the "No logs found" row
            if (row.cells.length === 1 && row.cells[0].colSpan > 1) {
              return;
            }
            
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filterValue) ? '' : 'none';
          });
          
          // Update select all checkbox state based on visible rows
          updateSelectAllCheckboxState();
        });
        
        // Clear filter
        clearFilterButton.addEventListener('click', () => {
          filterInput.value = '';
          filterInput.dispatchEvent(new Event('input'));
        });
        
        // Update select all checkbox state
        function updateSelectAllCheckboxState() {
          const selectAllCheckbox = document.getElementById('select-all-checkbox');
          const visibleRows = Array.from(document.querySelectorAll('#logs-table-body tr'))
            .filter(row => row.style.display !== 'none' && row.cells.length > 1);
          
          const checkboxes = visibleRows.map(row => 
            row.querySelector('.select-log-checkbox')
          ).filter(Boolean);
          
          if (checkboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.disabled = true;
          } else {
            selectAllCheckbox.disabled = false;
            selectAllCheckbox.checked = checkboxes.every(checkbox => checkbox.checked);
          }
        }
        
        // Open Org button
        openOrgButton.addEventListener('click', () => {
          console.log('[VisbalExt.htmlTemplate] open org button clicked');
          hideError();
          vscode.postMessage({
            command: 'openSelectedOrg'
          });
          showLoading('Open selected Org...');
        });
        
        // Refresh dropdown logic
        let refreshDefaultAction = 'sfdx'; // Default action

        // Add event listener to the arrow for dropdown
        const refreshDropdownArrow = refreshMainButton.querySelector('.dropdown-arrow');
        refreshDropdownArrow.addEventListener('click', (e) => {
          e.stopPropagation();
          refreshDropdownMenu.classList.toggle('hidden');
        });

        // Main button click (excluding the arrow) does the default action
        refreshMainButton.addEventListener('click', (e) => {
          // If the click was on the arrow, do nothing (handled above)
          if (e.target.classList.contains('dropdown-arrow')) return;
          handleRefreshAction(refreshDefaultAction);
        });

        // Add event listeners to dropdown menu items
        refreshDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const action = item.getAttribute('data-action');
            handleRefreshAction(action);
            refreshDropdownMenu.classList.add('hidden'); // Hide the menu after click
          });
        });

        // Hide dropdown if clicking outside
        document.addEventListener('click', (e) => {
          if (!refreshDropdownGroup.contains(e.target)) {
            refreshDropdownMenu.classList.add('hidden');
          }
        });

        function handleRefreshAction(action) {
          if (action === 'sfdx') {
            console.log('[VisbalExt.htmlTemplate] handleRefresh -- Refresh Logs using sfdx');
            hideError();
            vscode.postMessage({
              command: 'fetchLogs'
            });
            showLoading('Refreshing logs...');
          } else if (action === 'soql') {
            console.log('[VisbalExt.htmlTemplate] handleSoql -- Refresh with SOQL');
            hideError();
            vscode.postMessage({
              command: 'fetchLogsSoql'
            });
            showLoading('Refreshing logs via SOQL...');
          }
        }
        
        // Clear Local button
        clearLocalButton.addEventListener('click', () => {
          console.log('[VisbalExt.htmlTemplate] handleClearLocal -- Clear local button clicked');
          showConfirmModal(
            'Clear Local Log Files',
            'Are you sure you want to delete all downloaded log files from your local directory? This action cannot be undone.',
            () => {
              hideError();
              vscode.postMessage({
                command: 'clearLocalLogs'
              });
              showLoading('Clearing local log files...');
            }
          );
        });
        
        // Dropdown logic for delete button
        let deleteDefaultAction = 'server'; // Default action

        // Add event listener to the arrow for dropdown
        const dropdownArrow = deleteMainButton.querySelector('.dropdown-arrow');
        dropdownArrow.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteDropdownMenu.classList.toggle('hidden');
        });

        // Main button click (excluding the arrow) does the default action
        deleteMainButton.addEventListener('click', (e) => {
          console.log('[VisbalExt.htmlTemplate] deleteMainButton clicked');
          // If the click was on the arrow, do nothing (handled above)
          if (e.target.classList.contains('dropdown-arrow')) return;
          handleDeleteAction(deleteDefaultAction);
        });

        // Add event listeners to dropdown menu items
        deleteDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const action = item.getAttribute('data-action');
            handleDeleteAction(action);
            deleteDropdownMenu.classList.add('hidden'); // Hide the menu after click
          });
        });

        // Hide dropdown if clicking outside
        document.addEventListener('click', (e) => {
          if (!deleteDropdownGroup.contains(e.target)) {
            deleteDropdownMenu.classList.add('hidden');
          }
        });

        function handleDeleteAction(action) {
          console.log('[VisbalExt.htmlTemplate] handleDeleteAction -- Action:', action);
          if (action === 'server') {
            showConfirmModal(
              'Delete Server Logs',
              'Are you sure you want to delete all logs from the Salesforce server? This action cannot be undone.',
              () => {
                hideError();
                vscode.postMessage({ command: 'deleteServerLogs' });
                showLoading('Deleting server logs...');
              }
            );
          } else if (action === 'rest') {
            showConfirmModal(
              'Delete Logs using REST API',
              'Are you sure you want to delete all logs using the Salesforce REST API? This action cannot be undone.',
              () => {
                hideError();
                vscode.postMessage({ command: 'deleteViaSoql' });
                showLoading('Deleting logs using REST API...');
              }
            );
          }
        }
        
        function renderLogs() {
          hideError();
          logsTableBody.innerHTML = '';
          
          // Reset selection state
          selectedLogIds.clear();
          updateDeleteSelectedButton();
          
          if (!logs || logs.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="10">No logs found. Click Refresh to fetch logs.</td>';
            logsTableBody.appendChild(row);
            document.getElementById('select-all-checkbox').disabled = true;
            return;
          }
          
          document.getElementById('select-all-checkbox').disabled = false;
          document.getElementById('select-all-checkbox').checked = false;
          
          logs.forEach(log => {
            if (!log || !log.id) {
              console.error('[VisbalExt.htmlTemplate] Invalid log entry:', log);
              return;
            }
            
            // Format date if available
            let formattedDate = 'Unknown';
            if (log.lastModifiedDate) {
              const date = new Date(log.lastModifiedDate);
              // Format as YYYY/MM/DD, HH:MM:SS
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              const seconds = String(date.getSeconds()).padStart(2, '0');
              formattedDate = year + '/' + month + '/' + day + ', ' + hours + ':' + minutes + ':' + seconds;
            } else if (log.startTime) {
              // Try to parse and format startTime if it's a valid date
              try {
                const date = new Date(log.startTime);
                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const hours = String(date.getHours()).padStart(2, '0');
                  const minutes = String(date.getMinutes()).padStart(2, '0');
                  const seconds = String(date.getSeconds()).padStart(2, '0');
                  formattedDate = year + '/' + month + '/' + day + ', ' + hours + ':' + minutes + ':' + seconds;
                } else {
                  formattedDate = log.startTime;
                }
              } catch (e) {
                formattedDate = log.startTime;
              }
            }
            
            // Format size
            const formattedSize = formatBytes(log.logLength || 0);
            
            const row = document.createElement('tr');
            
            // Use string concatenation instead of template literals
            row.innerHTML = 
              '<td class="checkbox-cell">' +
              '  <input type="checkbox" class="select-log-checkbox" data-id="' + log.id + '">' +
              '</td>' +
              '<td>' + log.id + '</td>' +
              '<td class="checkbox-cell">' + (log.downloaded ? '✓' : '') + '</td>' +
              '<td>' + (log.logUser?.name || 'Unknown') + '</td>' +
              '<td>' + (log.application || 'Unknown') + '</td>' +
              '<td>' + (log.operation || 'Unknown') + '</td>' +
              '<td>' + formattedDate + '</td>' +
              '<td>' + (log.status || 'Unknown') + '</td>' +
              '<td>' + formattedSize + '</td>' +
              '<td class="action-cell">' +
              '  <button class="icon-button download-icon" data-id="' + log.id + '" title="Download"></button>' +
              '  <button class="icon-button open-icon" data-id="' + log.id + '" title="Open" ' + (!log.downloaded ? 'disabled' : '') + '></button>' +
              '</td>';
            
            logsTableBody.appendChild(row);
          });
          
          // Add event listeners to buttons
          document.querySelectorAll('.download-icon').forEach(button => {
            button.addEventListener('click', () => {
              const logId = button.getAttribute('data-id');
              console.log('[VisbalExt.htmlTemplate] handleDownloadStatus -- Download button clicked -- LogId:', logId);
              
              vscode.postMessage({
                command: 'downloadLog',
                logId: logId
              });
              
              button.disabled = true;
              button.title = 'Downloading...';
            });
          });
          
          document.querySelectorAll('.open-icon').forEach(button => {
            button.addEventListener('click', () => {
              const logId = button.getAttribute('data-id');
              console.log('[VisbalExt.htmlTemplate] handleOpenButton -- Open button clicked -- LogId:', logId);
              
              vscode.postMessage({
                command: 'openLog',
                logId: logId
              });
              
              button.disabled = true;
              button.title = 'Opening...';
            });
          });
          
          // Add event listeners for view buttons
          document.querySelectorAll('.view-icon').forEach(button => {
            button.addEventListener('click', () => {
              const logId = button.getAttribute('data-id');
              console.log('[VisbalExt.htmlTemplate] handleViewButton -- View button clicked -- LogId:', logId);
              
              vscode.postMessage({
                command: 'viewLog',
                logId: logId
              });
              
              button.disabled = true;
              button.title = 'Viewing...';
            });
          });
          
          // Remove the event listeners for downloaded checkboxes since they're now just text indicators
          
          // Add event listeners to select checkboxes
          document.querySelectorAll('.select-log-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
              const logId = checkbox.getAttribute('data-id');
              
              // Update selected log IDs
              if (checkbox.checked) {
                selectedLogIds.add(logId);
              } else {
                selectedLogIds.delete(logId);
                
                // Uncheck select all if any checkbox is unchecked
                document.getElementById('select-all-checkbox').checked = false;
              }
              
              // Update delete selected button
              updateDeleteSelectedButton();
            });
          });
          
          // Update select all checkbox state
          updateSelectAllCheckboxState();
        }
        
        // Add event listeners to table headers for sorting
        document.querySelectorAll('th[data-sort]').forEach(th => {
          th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (!column) return;
            
            // Toggle direction if clicking the same column
            const direction = (currentSort.column === column && currentSort.direction === 'asc') ? 'desc' : 'asc';
            
            // Sort logs
            sortLogs(column, direction);
          });
        });
        
        // Select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        selectAllCheckbox.addEventListener('change', () => {
          console.log('[VisbalExt.htmlTemplate] handleSelectAll -- Select all checkbox changed -- State:', selectAllCheckbox.checked);
          
          // Get all visible checkboxes
          const visibleRows = Array.from(document.querySelectorAll('#logs-table-body tr'))
            .filter(row => row.style.display !== 'none' && row.cells.length > 1);
          
          const checkboxes = visibleRows.map(row => 
            row.querySelector('.select-log-checkbox')
          ).filter(Boolean);
          
          // Update all visible checkboxes
          checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
            
            // Update selected log IDs
            const logId = checkbox.getAttribute('data-id');
            if (selectAllCheckbox.checked) {
              selectedLogIds.add(logId);
            } else {
              selectedLogIds.delete(logId);
            }
          });
          
          // Update delete selected button
          updateDeleteSelectedButton();
        });
        
        // Delete selected button
        const deleteSelectedButton = document.getElementById('delete-selected-button');
        deleteSelectedButton.addEventListener('click', () => {
          console.log('[VisbalExt.htmlTemplate] handleDeleteSelected -- Delete selected button clicked -- Count:', selectedLogIds.size);
          
          if (selectedLogIds.size === 0) {
            return;
          }
          
          showConfirmModal(
            'Delete Selected Logs',
            'Are you sure you want to delete ' + selectedLogIds.size + ' selected logs from the Salesforce server? This action cannot be undone.',
            () => {
              hideError();
              vscode.postMessage({
                command: 'deleteSelectedLogs',
                logIds: Array.from(selectedLogIds)
              });
              showLoading('Deleting selected logs...');
            }
          );
        });
        
        // Initialize by requesting logs
        document.addEventListener('DOMContentLoaded', () => {
          console.log('[VisbalExt.htmlTemplate] DOMContentLoaded initialize -- DOM content loaded -- Manual refresh required');
          // Request initial org list
          vscode.postMessage({ command: 'loadOrgList' });
          orgSelector.innerHTML = '<option value="">Loading orgs...</option>';
          
          // Update the message to inform users they need to click refresh
          const noLogsRow = document.querySelector('#logs-table-body tr');
          if (noLogsRow && noLogsRow.cells.length === 1) {
            noLogsRow.cells[0].textContent = 'No logs loaded. Click Refresh to fetch logs. No automatic fetching to prevent API errors.';
          }
        });
        
        // Org selector functionality
        const orgSelector = document.getElementById('org-selector');
        
        // Cache handling functions
        const CACHE_KEY = 'visbal-org-cache';
        
        async function saveOrgCache(orgs) {
          try {
            vscode.postMessage({
              command: 'saveOrgCache',
              data: {
                orgs,
                timestamp: new Date().getTime()
              }
            });
          } catch (error) {
            console.error('[VisbalExt.htmlTemplate] Failed to save org cache:', error);
          }
        }
  
        async function loadOrgCache() {
          try {
            vscode.postMessage({
              command: 'loadOrgCache'
            });
          } catch (error) {
            console.error('[VisbalExt.htmlTemplate] Failed to load org cache:', error);
            return null;
          }
        }
        
        // Function to update org list UI
        function updateOrgListUI(orgs, fromCache = false, selectedOrg = null) {
         // _updateOrgListUI(orgSelector, orgs, fromCache , selectedOrg);
          console.log('[VisbalExt.htmlTemplate] updateOrgListUI Updating org list UI with data:', orgs);
          console.log('[VisbalExt.htmlTemplate] updateOrgListUI Selected org:', selectedOrg);
          
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
                }
                // Select the option if it matches the selected org
                option.selected = selectedOrg && org.alias === selectedOrg;
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
          }
  
          // If this was a fresh fetch (not from cache), update the cache
          if (!fromCache) {
            saveOrgCache(orgs);
          }
  
          // Store the selection
          if (selectedOrg) {
            orgSelector.setAttribute('data-last-selection', selectedOrg);
          }
        }
  
        
  
        // Initialize by loading cache or requesting fresh data
        document.addEventListener('DOMContentLoaded', () => {
          console.log('[VisbalExt.htmlTemplate] DOMContentLoaded initialize');
          orgSelector.innerHTML = '<option value="">Loading orgs...</option>';
          
          // Try to load from cache first
          loadOrgCache();
        });
  
        
        // Handle org selection
        orgSelector.addEventListener('change', () => {
          const selectedOrg = orgSelector.value;
          if (selectedOrg === '__refresh__') {
            // Reset selection to previously selected value
            orgSelector.value = orgSelector.getAttribute('data-last-selection') || '';
            // Request org list refresh
            vscode.postMessage({ command: 'refreshOrgList' });
            return;
          }
          
          if (selectedOrg) {
            console.log('[VisbalExt.htmlTemplate] handleOrgSelection -- Org selected -- Details:', selectedOrg);
            // Store the selection
            orgSelector.setAttribute('data-last-selection', selectedOrg);
            vscode.postMessage({
              command: 'setSelectedOrg',
              alias: selectedOrg
            });
          }
        });
        
        /*
        // Debug config bar scroll arrows
        const debugConfigOptions = document.getElementById('debug-config-options');
        const scrollLeftBtn = document.getElementById('debug-scroll-left');
        const scrollRightBtn = document.getElementById('debug-scroll-right');
        function updateScrollArrows() {
          if (!debugConfigOptions) return;
          scrollLeftBtn.classList.toggle('hidden', debugConfigOptions.scrollLeft <= 0);
          scrollRightBtn.classList.toggle('hidden', debugConfigOptions.scrollLeft + debugConfigOptions.clientWidth >= debugConfigOptions.scrollWidth - 1);
        }
        scrollLeftBtn.addEventListener('click', () => {
          debugConfigOptions.scrollBy({ left: -120, behavior: 'smooth' });
        });
        scrollRightBtn.addEventListener('click', () => {
          debugConfigOptions.scrollBy({ left: 120, behavior: 'smooth' });
        });
        debugConfigOptions.addEventListener('scroll', updateScrollArrows);
        window.addEventListener('resize', updateScrollArrows);
        setTimeout(updateScrollArrows, 300);
		*/
		
        // Deploy Org button
        const deployOrgButton = document.getElementById('deploy-org-button');
        if (deployOrgButton) {
          deployOrgButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'deployOrg' });
          });
        }
       </script>
       <script>
            function scrollToLeft() {
                const scrollContainer = document.querySelector('.scroll-container');
                scrollContainer.scrollBy({
                    left: -100, // Adjust the scroll amount as needed
                    behavior: 'smooth'
                });
            }

            function scrollToRight() {
                const scrollContainer = document.querySelector('.scroll-container');
                scrollContainer.scrollBy({
                    left: 100, // Adjust the scroll amount as needed
                    behavior: 'smooth'
                });
            }

            function updateArrowVisibility() {
                const scrollContainer = document.querySelector('.scroll-container');
                const leftArrow = document.querySelector('.scroll-left');
                const rightArrow = document.querySelector('.scroll-right');

                const scrollLeft = scrollContainer.scrollLeft;
                const scrollWidth = scrollContainer.scrollWidth;
                const clientWidth = scrollContainer.clientWidth;

                // Show left arrow if we can scroll left
                if (scrollLeft > 0) {
                    leftArrow.classList.add('visible');
                } else {
                    leftArrow.classList.remove('visible');
                }

                // Show right arrow if we can scroll right
                if (scrollLeft < scrollWidth - clientWidth) {
                    rightArrow.classList.add('visible');
                } else {
                    rightArrow.classList.remove('visible');
                }
            }

            // Check arrow visibility when page loads
            document.addEventListener('DOMContentLoaded', function () {
                updateArrowVisibility();

                // Update arrow visibility when scrolling
                const scrollContainer = document.querySelector('.scroll-container');
                scrollContainer.addEventListener('scroll', updateArrowVisibility);
            });
        </script>
       <script>
        // terminalDropdownGroup = document.getElementById('terminal-dropdown-group');
        // terminalMainButton = document.getElementById('terminal-main-button');
        // terminalDropdownMenu = document.getElementById('terminal-dropdown-menu');
        //use this already declared variables to show the terminal dropdown menu, when terminal-dropdown-group is clicked
        terminalDropdownGroup.addEventListener('click', () => {
          terminalDropdownMenu.classList.toggle('hidden');
        });

        //when any of the options are clicked, run the corresponding function
        terminalDropdownMenu.addEventListener('click', (e) => {
          const action = e.target.getAttribute('data-action');
          if (action === 'gulp') {
            vscode.postMessage({ command: 'runGulp' });

            

          }
        });
       
      </script>
    
      <script type="module" src="${debugPresetUtilsUri}"></script>
    </body>
    </html>`;
}
