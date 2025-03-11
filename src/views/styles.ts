/**
 * Styles for the webview
 */
export const styles = `
    :root {
        --background-color: var(--vscode-editor-background);
        --foreground-color: var(--vscode-editor-foreground);
        --button-background: var(--vscode-button-background);
        --button-foreground: var(--vscode-button-foreground);
        --button-hover-background: var(--vscode-button-hoverBackground);
        --input-background: var(--vscode-input-background);
        --input-foreground: var(--vscode-input-foreground);
        --input-border: var(--vscode-input-border);
        --panel-border: var(--vscode-panel-border);
        --table-header-background: var(--vscode-editor-lineHighlightBackground, rgba(255, 255, 255, 0.1));
        --table-row-hover: var(--vscode-list-hoverBackground);
        --error-color: var(--vscode-errorForeground, #f48771);
    }
    
    body {
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
        padding: 0;
        margin: 0;
        color: var(--foreground-color);
        background-color: var(--background-color);
    }
    
    .container {
        padding: 16px;
        max-width: 100%;
    }
    
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--panel-border);
        padding-bottom: 8px;
    }
    
    .header h1 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 400;
    }
    
    .actions {
        display: flex;
        gap: 8px;
    }
    
    .button {
        background-color: var(--button-background);
        color: var(--button-foreground);
        border: none;
        padding: 4px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 2px;
        font-size: 12px;
    }
    
    .button:hover {
        background-color: var(--button-hover-background);
    }
    
    .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .icon {
        width: 16px;
        height: 16px;
        display: inline-block;
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
    }
    
    .refresh-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-2.941l.302.941a4 4 0 1 1-5.151 1z"/></svg>');
    }
    
    .download-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.75 1H7.25V7.25H3.54l4.46 4.46 4.46-4.46H8.75V1zm-.25 11.38l-5.5-5.5h3V1h5.5v5.88h3l-5.5 5.5zM1 13v1h14v-1H1z"/></svg>');
    }
    
    .check-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"/></svg>');
    }
    
    .error-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="%23f48771"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1ZM7 4.5V8.5H9V4.5H7ZM7 10.5V12.5H9V10.5H7Z"/></svg>');
    }
    
    .loading-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.917 7A6.002 6.002 0 0 0 2.083 7H1.071a7.002 7.002 0 0 1 13.858 0h-1.012z"/></svg>');
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .logs-container {
        margin-top: 16px;
    }
    
    .logs-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }
    
    .logs-table th {
        text-align: left;
        padding: 8px;
        background-color: var(--table-header-background);
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    
    .logs-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--panel-border);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .logs-table tr:hover {
        background-color: var(--table-row-hover);
    }
    
    .no-logs-message {
        text-align: center;
        padding: 24px;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .hidden {
        display: none !important;
    }
    
    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
    }
    
    .loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: var(--button-background);
        animation: spin 1s linear infinite;
        margin-bottom: 8px;
    }
    
    .loading-text {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
    }
    
    .error-container {
        display: flex;
        align-items: flex-start;
        background-color: rgba(244, 135, 113, 0.1);
        border: 1px solid var(--error-color);
        border-radius: 3px;
        padding: 12px;
        margin: 16px 0;
    }
    
    .error-message {
        margin-left: 8px;
        color: var(--error-color);
        font-size: 12px;
        line-height: 1.5;
    }
`; 