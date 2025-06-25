/**
 * Styles for the webview
 * Organized with SVG icons in their own section
 */
export const styles = `
    /* ===== CSS VARIABLES ===== */
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

    /* ===== ANIMATIONS ===== */
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    /* ===== BASE STYLES ===== */
    body {
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
        padding: 0;
        margin: 0;
        color: var(--foreground-color);
        background-color: var(--background-color);
    }

    /* ===== LAYOUT COMPONENTS ===== */
    .actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .button {
        height: 36px;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    .button:hover {
        background-color: var(--button-hover-background);
    }
    
    .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .button-primary {
        background-color: rgb(20, 96, 163)!important;
        cursor: pointer;
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

    .container {
        padding: 16px;
        max-width: 100%;
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

    .filter-container {
        display: flex;
        align-items: center;
    }

    .filter-input {
        height: 28px;
        font-size: 13px;
        border-radius: 6px;
        border: 1px solid var(--input-border);
        background: var(--input-background);
        color: var(--input-foreground);
        padding: 0 8px;
        min-width: 120px;
        margin: 0 2px;
    }

    .filter-select {
        height: 32px;
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

    .hidden {
        display: none !important;
    }

    .icon {
        width: 16px;
        height: 16px;
        display: inline-block;
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
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
        background-color: #4d4d4d;
        border-radius: 4px;
        width: 28px;
        height: 28px;
        margin: 0 2px;
        transition: background-color 0.2s;
    }
    .icon-button:hover {
        background-color: #666666;
    }
    .icon-button:active {
        background-color: #333333;
    }
    .icon-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background-color: #4d4d4d;
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

    .org-selector {
        height: 28px;
        font-size: 13px;
        border-radius: 6px;
        border: 1px solid var(--input-border);
        background: var(--input-background);
        color: var(--input-foreground);
        padding: 0 8px;
        min-width: 120px;
        margin: 0 2px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s, background 0.2s;
        display: flex;
        align-items: center;
    }
    .org-selector:focus {
        border-color: var(--vscode-focusBorder, #0078d4);
        background: var(--input-background);
    }

    .search-container {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    /* ===== SVG ICONS ===== */
    .arrow-down {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M3.147 9l5 5h.707l5-5-.707-.707L9 12.439V2H8v10.44L3.854 8.292 3.147 9z'/%3E%3C/svg%3E");    
    }
        
    .arrow-down-circle {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M5.36891 8.08074L7.50833 10.2202V4.46802H8.50833V10.1473L10.5749 8.08074L11.282 8.78784L8.32545 11.7444H7.61835L4.6618 8.78784L5.36891 8.08074Z'/%3E%3Cpath d='M14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8ZM13 8C13 10.7614 10.7614 13 8 13C5.23858 13 3 10.7614 3 8C3 5.23858 5.23858 3 8 3C10.7614 3 13 5.23858 13 8Z'/%3E%3C/svg%3E");
    }

    .arrow-up {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M13.854 7l-5-5h-.707l-5 5 .707.707L8 3.561V14h1V3.56l4.146 4.147.708-.707z'/%3E%3C/svg%3E");   
    }
        
    .arrow-left {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7 3.093l-5 5V8.8l5 5 .707-.707-4.146-4.147H14v-1H3.56L7.708 3.8 7 3.093z'/%3E%3C/svg%3E");
    }

     .arrow-right {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9 13.887l5-5V8.18l-5-5-.707.707 4.146 4.147H2v1h10.44L8.292 13.18l.707.707z'/%3E%3C/svg%3E"); 
    }
        
    .arrow-up-circle {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M5.36891 7.91926L7.50833 5.77984V11.532H8.50833V5.85271L10.5749 7.91926L11.282 7.21216L8.32545 4.25562H7.61835L4.6618 7.21216L5.36891 7.91926Z'/%3E%3Cpath d='M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8ZM13 8C13 5.23858 10.7614 3 8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13C10.7614 13 13 10.7614 13 8Z'/%3E%3C/svg%3E");
    }

    .arrow-circle-left {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M7.91926 10.6311L5.77984 8.49167L11.532 8.49167L11.532 7.49167L5.85271 7.49167L7.91926 5.42511L7.21216 4.718L4.25561 7.67455L4.25561 8.38165L7.21216 11.3382L7.91926 10.6311Z'/%3E%3Cpath d='M8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2ZM8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3Z'/%3E%3C/svg%3E");
    }

    .arrow-circle-right {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M8.08074 5.36891L10.2202 7.50833L4.46802 7.50833L4.46802 8.50833L10.1473 8.50833L8.08073 10.5749L8.78784 11.282L11.7444 8.32545L11.7444 7.61835L8.78784 4.6618L8.08074 5.36891Z'/%3E%3Cpath d='M8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14ZM8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13Z'/%3E%3C/svg%3E");
    }


    .check-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z'/%3E%3C/svg%3E");
    }

    .configuration-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z'/%3E%3C/svg%3E");
    }

    .deploy-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M14.491 1c-3.598.004-6.654 1.983-8.835 4H1.5l-.5.5v3l.147.354.991.991.001.009 4 4 .009.001.999.999L7.5 15h3l.5-.5v-4.154c2.019-2.178 3.996-5.233 3.992-8.846l-.501-.5zM2 6h2.643a23.828 23.828 0 0 0-2.225 2.71L2 8.294V6zm5.7 8l-.42-.423a23.59 23.59 0 0 0 2.715-2.216V14H7.7zm-1.143-1.144L3.136 9.437C4.128 8 8.379 2.355 13.978 2.016c-.326 5.612-5.987 9.853-7.421 10.84zM4 15v-1H2v-2H1v3h3zm6.748-7.667a1.5 1.5 0 1 0-2.496-1.666 1.5 1.5 0 0 0 2.495 1.666z'/%3E%3C/svg%3E");
    }

    .download-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.957 6h.05a2.99 2.99 0 0 1 2.116.879 3.003 3.003 0 0 1 0 4.242 2.99 2.99 0 0 1-2.117.879v-1a2.002 2.002 0 0 0 0-4h-.914l-.123-.857a2.49 2.49 0 0 0-2.126-2.122A2.478 2.478 0 0 0 6.231 5.5l-.333.762-.809-.189A2.49 2.49 0 0 0 4.523 6c-.662 0-1.297.263-1.764.732A2.503 2.503 0 0 0 4.523 11h.498v1h-.498a3.486 3.486 0 0 1-2.628-1.16 3.502 3.502 0 0 1-.4-4.137A3.497 3.497 0 0 1 3.853 5.06c.486-.09.987-.077 1.468.041a3.486 3.486 0 0 1 3.657-2.06A3.479 3.479 0 0 1 11.957 6zm-5.25 5.121l1.314 1.314V7h.994v5.4l1.278-1.279.707.707-2.146 2.147h-.708L6 11.829l.707-.708z'/%3E%3C/svg%3E");
    }

    .edit {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M13.353 1.146l1.5 1.5L15 3v11.5l-.5.5h-13l-.5-.5v-13l.5-.5H13l.353.146zM2 2v12h12V3.208L12.793 2H11v4H4V2H2zm6 0v3h2V2H8z'/%3E%3C/svg%3E");
    }

    .error-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="%23f48771"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1ZM7 4.5V8.5H9V4.5H7ZM7 10.5V12.5H9V10.5H7Z"/></svg>');
    }

    .file-binary {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.57 1.14l3.28 3.3.15.36v9.7l-.5.5h-11l-.5-.5v-13l.5-.5h7.72l.35.14zM3 2v12h10V5l-3-3H3zm1.46 4.052c0 1.287.458 1.93 1.374 1.93.457 0 .807-.173 1.05-.52.246-.348.368-.847.368-1.499C7.252 4.654 6.805 4 5.91 4c-.471 0-.831.175-1.08.526-.247.35-.37.858-.37 1.526zm.862-.022c0-.922.183-1.383.55-1.383.344 0 .516.448.516 1.343s-.176 1.343-.527 1.343c-.36 0-.54-.434-.54-1.303zm3.187 1.886h2.435v-.672h-.792V4l-1.665.336v.687l.82-.177v2.398h-.798v.672zm-1.337 5H4.736v-.672h.798V9.846l-.82.177v-.687L6.38 9v3.244h.792v.671zm1.035-1.931c0 1.287.458 1.93 1.375 1.93.457 0 .807-.173 1.05-.52.245-.348.368-.847.368-1.499 0-1.309-.448-1.963-1.343-1.963-.47 0-.83.175-1.08.526-.246.35-.37.858-.37 1.526zm.862-.022c0-.922.184-1.383.55-1.383.344 0 .516.448.516 1.343s-.175 1.343-.526 1.343c-.36 0-.54-.434-.54-1.303z'/%3E%3C/svg%3E");
    }

    .filter {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M15 2v1.67l-5 4.759V14H6V8.429l-5-4.76V2h14zM7 8v5h2V8l5-4.76V3H2v.24L7 8z'/%3E%3C/svg%3E");
    }

    .flame {
      background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M9.13 15l-.53-.77a1.85 1.85 0 0 0-.28-2.54 3.51 3.51 0 0 1-1.19-2c-1.56 2.23-.75 3.46 0 4.55l-.55.76A4.4 4.4 0 0 1 3 10.46S2.79 8.3 5.28 6.19c0 0 2.82-2.61 1.84-4.54L7.83 1a6.57 6.57 0 0 1 2.61 6.94 2.57 2.57 0 0 0 .56-.81l.87-.07c.07.12 1.84 2.93.89 5.3A4.72 4.72 0 0 1 9.13 15zm-2-6.95l.87.39a3 3 0 0 0 .92 2.48 2.64 2.64 0 0 1 1 2.8A3.241 3.241 0 0 0 11.8 12a4.87 4.87 0 0 0-.41-3.63 1.85 1.85 0 0 1-1.84.86l-.35-.68a5.31 5.31 0 0 0-.89-5.8C8.17 4.87 6 6.83 5.93 6.94 3.86 8.7 4 10.33 4 10.4a3.47 3.47 0 0 0 1.59 3.14C5 12.14 5 10.46 7.16 8.05h-.03z'/%3E%3C/svg%3E");
    }


    .globe-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M8.5 1a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm4.894 4a5.527 5.527 0 0 0-3.053-2.676c.444.84.765 1.74.953 2.676h2.1zm.582 2.995A5.11 5.11 0 0 0 14 7.5a5.464 5.464 0 0 0-.213-1.5h-2.342c.032.331.055.664.055 1a10.114 10.114 0 0 1-.206 2h2.493c.095-.329.158-.665.19-1.005zm-3.535 0l.006-.051A9.04 9.04 0 0 0 10.5 7a8.994 8.994 0 0 0-.076-1H6.576A8.82 8.82 0 0 0 6.5 7a8.98 8.98 0 0 0 .233 2h3.534c.077-.332.135-.667.174-1.005zM10.249 5a8.974 8.974 0 0 0-1.255-2.97C8.83 2.016 8.666 2 8.5 2a3.62 3.62 0 0 0-.312.015l-.182.015L8 2.04A8.97 8.97 0 0 0 6.751 5h3.498zM5.706 5a9.959 9.959 0 0 1 .966-2.681A5.527 5.527 0 0 0 3.606 5h2.1zM3.213 6A5.48 5.48 0 0 0 3 7.5 5.48 5.48 0 0 0 3.213 9h2.493A10.016 10.016 0 0 1 5.5 7c0-.336.023-.669.055-1H3.213zm2.754 4h-2.36a5.515 5.515 0 0 0 3.819 2.893A10.023 10.023 0 0 1 5.967 10zM8.5 12.644A8.942 8.942 0 0 0 9.978 10H7.022A8.943 8.943 0 0 0 8.5 12.644zM11.033 10a10.024 10.024 0 0 1-1.459 2.893A5.517 5.517 0 0 0 13.393 10h-2.36z'/%3E%3C/svg%3E");
    }

    .loading-icon {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.917 7A6.002 6.002 0 0 0 2.083 7H1.071a7.002 7.002 0 0 1 13.858 0h-1.012z"/></svg>');
        animation: spin 1s linear infinite;
    }

    .play {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M3.78 2L3 2.41v12l.78.42 9-6V8l-9-6zM4 13.48V3.35l7.6 5.07L4 13.48z'/%3E%3C/svg%3E");             
    }

    .play-all {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M2.78 2L2 2.41v12l.78.42 9-6V8l-9-6zM3 13.48V3.35l7.6 5.07L3 13.48z'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M6 14.683l8.78-5.853V8L6 2.147V3.35l7.6 5.07L6 13.48v1.203z'/%3E%3C/svg%3E");
    }

    .preview {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M7.99993 6.00316C9.47266 6.00316 10.6666 7.19708 10.6666 8.66981C10.6666 10.1426 9.47266 11.3365 7.99993 11.3365C6.52715 11.3365 5.33324 10.1426 5.33324 8.66981C5.33324 7.19708 6.52715 6.00316 7.99993 6.00316ZM7.99993 7.00315C7.07946 7.00315 6.33324 7.74935 6.33324 8.66981C6.33324 9.59028 7.07946 10.3365 7.99993 10.3365C8.9204 10.3365 9.6666 9.59028 9.6666 8.66981C9.6666 7.74935 8.9204 7.00315 7.99993 7.00315ZM7.99993 3.66675C11.0756 3.66675 13.7307 5.76675 14.4673 8.70968C14.5344 8.97755 14.3716 9.24908 14.1037 9.31615C13.8358 9.38315 13.5643 9.22041 13.4973 8.95248C12.8713 6.45205 10.6141 4.66675 7.99993 4.66675C5.38454 4.66675 3.12664 6.45359 2.50182 8.95555C2.43491 9.22341 2.16348 9.38635 1.89557 9.31948C1.62766 9.25255 1.46471 8.98115 1.53162 8.71321C2.26701 5.76856 4.9229 3.66675 7.99993 3.66675Z'/%3E%3C/svg%3E");   
    }

    .refresh-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z'/%3E%3C/svg%3E");
    }

    .save-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M13.353 1.146l1.5 1.5L15 3v11.5l-.5.5h-13l-.5-.5v-13l.5-.5H13l.353.146zM2 2v12h12V3.208L12.793 2H11v4H4V2H2zm6 0v3h2V2H8z'/%3E%3C/svg%3E");
    }

    .search-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 22.88l1.12 1 8.05-9.12A8.251 8.251 0 1 0 15.25.01V0zm0 15a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z'/%3E%3C/svg%3E");
    }

    .source-control {
        background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.4a3.737 3.737 0 1 0-1.494 0v9.117a3.776 3.776 0 1 0 1.816.099 2.99 2.99 0 0 1 2.668-1.667h2.99a4.484 4.484 0 0 0 4.223-3.039 3.736 3.736 0 0 0 3.25-3.687zM4.565 3.738a2.242 2.242 0 1 1 4.484 0 2.242 2.242 0 0 1-4.484 0zm4.484 16.441a2.242 2.242 0 1 1-4.484 0 2.242 2.242 0 0 1 4.484 0zm8.221-9.715a2.242 2.242 0 1 1 0-4.485 2.242 2.242 0 0 1 0 4.485z'/%3E%3C/svg%3E");   
    }

    .sync-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M2.006 8.267L.78 9.5 0 8.73l2.09-2.07.76.01 2.09 2.12-.76.76-1.167-1.18a5 5 0 0 0 9.4 1.983l.813.597a6 6 0 0 1-11.22-2.683zm10.99-.466L11.76 6.55l-.76.76 2.09 2.11.76.01 2.09-2.07-.75-.76-1.194 1.18a6 6 0 0 0-11.11-2.92l.81.594a5 5 0 0 1 9.3 2.346z'/%3E%3C/svg%3E");    
    }

    .terminal-icon {
        background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M1.5 3L3 1.5H21L22.5 3V21L21 22.5H3L1.5 21V3ZM3 3V21H21V3H3Z'/%3E%3Cpath d='M7.06078 7.49988L6.00012 8.56054L10.2427 12.8032L6 17.0459L7.06066 18.1066L12 13.1673V12.4391L7.06078 7.49988Z'/%3E%3Crect x='12' y='16.5' width='6' height='1.5'/%3E%3C/svg%3E");
    }

    .trash {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z'/%3E%3C/svg%3E");   
    }

    .upload {
        background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.956 6h.05a2.99 2.99 0 0 1 2.117.879 3.003 3.003 0 0 1 0 4.242 2.99 2.99 0 0 1-2.117.879h-1.995v-1h1.995a2.002 2.002 0 0 0 0-4h-.914l-.123-.857a2.49 2.49 0 0 0-2.126-2.122A2.478 2.478 0 0 0 6.23 5.5l-.333.762-.809-.189A2.49 2.49 0 0 0 4.523 6c-.662 0-1.297.263-1.764.732A2.503 2.503 0 0 0 4.523 11h2.494v1H4.523a3.486 3.486 0 0 1-2.628-1.16 3.502 3.502 0 0 1-.4-4.137A3.497 3.497 0 0 1 3.853 5.06c.486-.09.987-.077 1.468.041a3.486 3.486 0 0 1 3.657-2.06A3.479 3.479 0 0 1 11.956 6zm-1.663 3.853L8.979 8.54v5.436h-.994v-5.4L6.707 9.854 6 9.146 8.146 7h.708L11 9.146l-.707.707z'/%3E%3C/svg%3E");
    }
`; 