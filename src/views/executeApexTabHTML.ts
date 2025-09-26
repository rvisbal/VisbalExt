import { styles } from "./styles";

export function getHtmlForWebview(): string {
//JavaScript/HTML section, type script rule dont apply in this block
return `<!DOCTYPE html>
<html >
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
        .apex-container {
            display: flex;
            flex-direction: row;
            height: 100vh;
            overflow: hidden;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: var(--vscode-editor-background);
        }
        .editor-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
        }
        .left-panel {
            display: flex;
            flex-direction: column;
            width: 50%;
            min-width: 300px;
            height: 100vh;
            overflow: hidden;
        }
        .right-panel {
            display: flex;
            flex-direction: column;
            width: 50%;
            min-width: 300px;
            height: 100vh;
            overflow: hidden;
            background: var(--vscode-editor-background);
        }
        .resizer {
            width: 4px;
            background: var(--vscode-panel-border);
            cursor: col-resize;
            transition: background-color 0.2s ease;
            position: relative;
        }
        .resizer:hover {
            background: var(--vscode-focusBorder);
        }
        .resizer::before {
            content: '';
            position: absolute;
            top: 0;
            left: -2px;
            right: -2px;
            bottom: 0;
        }
        .editor-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            padding: 8px;
        }
        .results-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            padding: 8px;
        }
        .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .textarea-container {
            display: flex;
            flex-direction: column;
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        .textarea-label {
            color: var(--vscode-foreground);
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        textarea {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            /*font-family: var(--vscode-editor-font-family, monospace);*/
            font-size: var(--vscode-editor-font-size, 14px);
            line-height: 1.4;
            resize: none;
            flex: 1;
            min-height: 0;
            border-radius: 2px;
            overflow-y: auto;
            white-space: pre;
            tab-size: 4;
            -webkit-text-fill-color: var(--vscode-input-foreground);
            opacity: 1;
            cursor: text;
            user-select: text;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        textarea:read-write {
            -webkit-user-modify: read-write !important;
            -moz-user-modify: read-write !important;
            -ms-user-modify: read-write !important;
            user-modify: read-write !important;
        }
        .char-count {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: var(--vscode-input-background);
            padding: 2px 4px;
            border-radius: 2px;
            opacity: 0.8;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 2px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            height: 24px;
            margin-right: 1px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        button:last-child {
            margin-right: 0;
        }
        .toolbar-right button {
            margin-left: 1px;
        }

        #statusBar {
            padding: 2px 5px;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .output-container {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            /*font-family: var(--vscode-editor-font-family);*/
            font-size: var(--vscode-editor-font-size);
            overflow-y: auto;
            flex: 1;
            white-space: pre-wrap;
            border-radius: 2px;
        }
        .success {
            color: var(--vscode-testing-iconPassed);
        }
        .error {
            color: var(--vscode-testing-iconFailed);
        }
        .loading {
            color: var(--vscode-foreground);
            font-style: italic;
        }
        .codicon {
            /*font-family: codicon;*/
            font-size: 16px;
            line-height: 16px;
        }
        .code-editor {
            display: flex;
            flex: 1;
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            overflow: hidden;
            position: relative;
        }
        .line-numbers {
            background: var(--vscode-editorLineNumber-background, var(--vscode-editor-background));
            color: var(--vscode-editorLineNumber-foreground);
            padding: 8px 4px;
            text-align: right;
            font-size: var(--vscode-editor-font-size, 14px);
            line-height: 1.4;
            white-space: pre;
            user-select: none;
            border-right: 1px solid var(--vscode-input-border);
            overflow: hidden;
            width: 40px;
            min-width: 40px;
        }
    </style>
     <style>
     .loading-container {
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--vscode-foreground);
        }
        .loading-spinner {
            width: 18px;
            height: 18px;
            border: 2px solid var(--vscode-foreground);
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        @keyframes spin {
            to {transform: rotate(360deg);}
        }
    </style>
     <style>
        .toolbar {
                padding: 3px 3px;
                display: flex;
                align-items: center;
                background: var(--vscode-editor-background);
                height: 20px;
                width: 100%;
            }
            .toolbar-left {
                display: flex;
                align-items: center;
            }
            .toolbar-right {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-left: auto;
            }
    </style>
    <style>
     
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
    </style>
    <style>
        .fileSelector-container {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 0 8px;
        }
        
        .fileSelector {
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            font-size: 12px;
            min-width: 200px;
            cursor: pointer;
        }
        
        .fileSelector:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .fileSelector:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
    </style>
    <style>
        .error-container {
            display: none;
            padding: 10px;
            margin: 10px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            border-radius: 3px;
            position: absolute;
            top: 50px;
            left: 10px;
            right: 10px;
            z-index: 1000;
        }
        .error-message {
            /*font-family: var(--vscode-font-family);*/
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .error-container.show {
            display: block;
        }
    </style>
</head>
<body>
    <div class="apex-container">
        <!-- Left Panel - Editor -->
        <div class="left-panel">
            <div class="panel-header">
                <span>Apex Editor</span>
                <div class="toolbar-right">
                    <select id="org-selector" class="org-selector" title="Select Salesforce Org">
                        <option value="">Loading orgs...</option>
                    </select>
                    <button class="icon-button button-primary" id="executeButton" onclick="executeApex()" title="Execute Apex Code">
                        <span class="icon play"></span>
                    </button>
                </div>
            </div>
            <div class="editor-container">
                <div class="textarea-container">
                    <div class="code-editor">
                        <div class="line-numbers" id="lineNumbers">1</div>
                        <textarea 
                            id="apexTextarea" 
                            placeholder="Type something here..."
                            aria-label="Apex code editor"
                            spellcheck="false"
                            autocomplete="off"
                        ></textarea>
                    </div>
                    <div class="char-count">0 / 1000 characters</div>
                </div>
            </div>
            <div class="loading-container" id="loadingContainer">
                <div class="loading-spinner"></div>
                <span id="loadingMessage">Loading...</span>
            </div>
        </div>
        
        <!-- Resizable Divider -->
        <div class="resizer" id="resizer"></div>
        
        <!-- Right Panel - Results -->
        <div class="right-panel">
            <div class="panel-header">
                <span>Execution Results</span>
                <div class="toolbar-right">
                    <button class="icon-button tab-download-button" id="downloadButton" onclick="downloadResults()" title="Download Execution Results">
                        <span class="icon download-icon"></span>
                    </button>
                </div>
            </div>
            <div class="results-container">
                <div id="outputContainer" class="output-container">
                    Execute Apex code to see results here
                </div>
            </div>
        </div>
        
        <div id="errorContainer" class="error-container">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div id="errorMessage" class="error-message" style="flex: 1;"></div>
                <button onclick="document.getElementById('errorContainer').classList.remove('show')" style="background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 10px;">✕</button>
            </div>
        </div>
    </div>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const textarea = document.getElementById('apexTextarea');
            const charCount = document.querySelector('.char-count');
            const executeButton = document.getElementById('executeButton');
            const downloadButton = document.getElementById('downloadButton');
            const outputContainer = document.getElementById('outputContainer');
            const loadingContainer = document.getElementById('loadingContainer');
            const errorContainer = document.getElementById('errorContainer');
            const errorMessage = document.getElementById('errorMessage');
            
            // Resizer functionality
            const resizer = document.getElementById('resizer');
            const leftPanel = document.querySelector('.left-panel');
            const rightPanel = document.querySelector('.right-panel');
            let isResizing = false;
            
            // Resizer event handlers
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                
                const containerRect = document.querySelector('.apex-container').getBoundingClientRect();
                const newLeftWidth = e.clientX - containerRect.left;
                const containerWidth = containerRect.width;
                const resizerWidth = resizer.offsetWidth;
                
                // Calculate percentages with constraints
                const minWidth = 300;
                const maxLeftWidth = containerWidth - minWidth - resizerWidth;
                const constrainedLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, maxLeftWidth));
                const leftPercent = (constrainedLeftWidth / containerWidth) * 100;
                const rightPercent = ((containerWidth - constrainedLeftWidth - resizerWidth) / containerWidth) * 100;
                
                leftPanel.style.width = leftPercent + '%';
                rightPanel.style.width = rightPercent + '%';
            });
            
            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                }
            });
            
            //#region LISTBOX
            // Dropdown functionality
            const orgDropdown = document.getElementById('org-selector');

            // Toggle dropdown
            orgDropdown.addEventListener('click', () => {
                orgDropdown.classList.toggle('show');
            });

            
            // Handle org selection
            orgDropdown.addEventListener('change', () => {
                const selectedOrg = orgDropdown.value;
                if (selectedOrg === '__refresh__') {
                    // Reset selection to previously selected value
                    orgDropdown.value = orgDropdown.getAttribute('data-last-selection') || '';
                    // Request org list refresh
                    vscode.postMessage({ command: 'refreshOrgList' });
                    return;
                }
                
                if (selectedOrg) {
                    // Store the selection
                    orgDropdown.setAttribute('data-last-selection', selectedOrg);
                    vscode.postMessage({
                        command: 'setSelectedOrg',
                        alias: selectedOrg,
                        viewId: 'executeApex'
                    });
                }
            });
            //#endregion LISTBOX
            
            // Update character count
            function updateCharCount() {
                const length = textarea.value.length;
                charCount.textContent = \`\${length} characters\`;
            }
            
            // Update line numbers
            function updateLineNumbers() {
                const lines = textarea.value.split('\\n');
                const lineCount = lines.length;
                const lineNumbers = document.getElementById('lineNumbers');
                
                // Generate line numbers
                let lineNumbersText = '';
                for (let i = 1; i <= lineCount; i++) {
                    lineNumbersText += i + (i < lineCount ? '\\n' : '');
                }
                lineNumbers.textContent = lineNumbersText;
            }
            
            // Sync scroll position between textarea and line numbers
            function syncScroll() {
                const lineNumbers = document.getElementById('lineNumbers');
                lineNumbers.scrollTop = textarea.scrollTop;
            }
            
            // Store execution results for download
            let lastExecutionResult = null;
            
            // Download execution results
            function downloadResults() {
                if (!lastExecutionResult) {
                    vscode.postMessage({
                        command: 'showError',
                        message: 'No execution results available to download'
                    });
                    return;
                }
                
                vscode.postMessage({
                    command: 'downloadExecutionResults',
                    data: lastExecutionResult
                });
            }
            
            // Make downloadResults available globally
            window.downloadResults = downloadResults;
            
            // Initialize
            updateCharCount();
            updateLineNumbers();
            
            // Request initial org list
            console.log('[VisbalExt.ExecuteApexTab] Initializing - requesting org list');
            vscode.postMessage({ command: 'loadOrgList' });
            
            // Handle textarea input
            textarea.addEventListener('input', (e) => {
                updateCharCount();
                updateLineNumbers();
            });
            
            // Handle textarea scroll
            textarea.addEventListener('scroll', (e) => {
                syncScroll();
            });
            
            // Ensure clipboard operations work properly
            textarea.addEventListener('paste', (e) => {
                // Allow default paste behavior
                setTimeout(() => {
                    updateCharCount();
                    updateLineNumbers();
                }, 0);
            });
            
            // Handle keyboard shortcuts for copy/paste
            textarea.addEventListener('keydown', (e) => {
                // Allow Ctrl+V (paste), Ctrl+C (copy), Ctrl+X (cut)
                if (e.ctrlKey && (e.key === 'v' || e.key === 'c' || e.key === 'x')) {
                    // Let the default behavior happen
                    if (e.key === 'v') {
                        // Update line numbers after paste
                        setTimeout(() => {
                            updateCharCount();
                            updateLineNumbers();
                        }, 0);
                    }
                }
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'executionStarted':
                        executeButton.disabled = true;
                        outputContainer.className = 'output-container';
                        outputContainer.innerHTML = '<div class="loading">Executing Apex code...</div>';
                        break;
                        
                    case 'executionResult':
                        stopLoading();
                        executeButton.disabled = false;
                        let output = '';
                        
                        // Store execution result for download
                        lastExecutionResult = {
                            timestamp: new Date().toISOString(),
                            success: message.success,
                            logs: message.logs,
                            compileProblem: message.compileProblem,
                            exceptionMessage: message.exceptionMessage,
                            exceptionStackTrace: message.exceptionStackTrace,
                            message: message.message,
                            apexCode: textarea.value
                        };
                        
                        if (message.success) {
                            output += '<div class="success">? Execution successful</div>\\n';
                            if (message.logs) {
                                output += '\\nLogs:\\n' + message.logs;
                            }
                        } else {
                            output += '<div class="error">? Execution failed</div>\\n';
                            if (message.compileProblem) {
                                output += '\\nCompile Error:\\n' + message.compileProblem;
                            }
                            if (message.exceptionMessage) {
                                output += '\\nException:\\n' + message.exceptionMessage;
                            }
                            if (message.exceptionStackTrace) {
                                output += '\\nStack Trace:\\n' + message.exceptionStackTrace;
                            }
                            if (message.message) {
                                output += '\\nError:\\n' + message.message;
                            }
                        }
                        outputContainer.innerHTML = output;
                        break;
                    case 'updateOrgList':
                        updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);
                        break;
                    case 'updateStatus':
                        console.log('[VisbalExt.ExecuteApexTab] Status update:', message.message, message.type);
                        // Show status message to user - you could display this in the UI if needed
                        break;
                    case 'refreshComplete':
                        stopLoading();
                        break;
                    case 'error':
                        stopLoading();
                        console.error('[VisbalExt.htmlTemplate] Error:', message.message);
                        errorMessage.textContent = message.message;
                        errorContainer.classList.add('show');
                        break;
                    case 'startLoading':
                        startLoading(message.message);
                        break;
                     case 'stopLoading':
                        stopLoading();
                        break;
                    case 'success':
                        break;
                }
            });
            
            
            function startLoading(message) {
                loadingContainer.style.display = 'flex';
                document.getElementById('loadingMessage').textContent = message || 'Loading...';
                executeButton.disabled = true;
            }
            
            function stopLoading() {
                // Hide loading state
                loadingContainer.style.display = 'none';
                executeButton.disabled = false;
                document.getElementById('loadingMessage').textContent = '';
            }
            
            // Execute Apex code
            window.executeApex = function() {
                errorContainer.classList.remove('show');
                // Show loading state
                startLoading('Executing apex...');
       
                
                executeButton.disabled = true;
                
                
                const code = textarea.value;
                vscode.postMessage({
                    command: 'executeApex',
                    code: code
                });
            };
            
            
            
            //#region CACHE
                    
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
            //#endregion CACHE
            
             //#region LISTBOX

            function updateOrgListUI(orgs, fromCache = false, selectedOrg = null) {
               // _updateOrgListUI(orgDropdown, orgs, fromCache , selectedOrg);

                
                // Clear existing options
                orgDropdown.innerHTML = '';
                // Add refresh option at the top
                const refreshOption = document.createElement('option');
                refreshOption.value = '__refresh__';
                refreshOption.textContent = '↻ Refresh Org List';
                refreshOption.style.fontStyle = 'italic';
                refreshOption.style.backgroundColor = 'var(--vscode-dropdown-background)';
                orgDropdown.appendChild(refreshOption);
        
                // Add a separator
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '--------------';
                orgDropdown.appendChild(separator);
        
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
                        // Select the option if it matches the selected org
                        option.selected = selectedOrg && org.alias === selectedOrg;
                        optgroup.appendChild(option);
                    });
                    
                    orgDropdown.appendChild(optgroup);
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
                    orgDropdown.appendChild(option);
                } else if (!selectedOrg && defaultOrg) {
                    // Auto-select the default org if no org is currently selected
                    orgDropdown.value = defaultOrg;
                    
                    // Notify the backend about the auto-selection
                    setTimeout(() => {
                        vscode.postMessage({
                            command: 'setSelectedOrg',
                            alias: defaultOrg,
                            viewId: 'executeApex'
                        });
                    }, 100);
                }
        
                // If this was a fresh fetch (not from cache), update the cache
                if (!fromCache) {
                    saveOrgCache(orgs);
                }
        
                // Store the selection (including auto-selected default)
                const currentSelection = orgDropdown.value;
                if (currentSelection) {
                    orgDropdown.setAttribute('data-last-selection', currentSelection);
                }

            }
        

            // Handle org selection
            orgDropdown.addEventListener('change', () => {
                const selectedOrg = orgDropdown.value;
                if (selectedOrg === '__refresh__') {
                    startLoading('Refreshing org list...');
                    // Reset selection to previously selected value
                    orgDropdown.value = orgDropdown.getAttribute('data-last-selection') || '';
                    // Request org list refresh
                    vscode.postMessage({ command: 'refreshOrgList' });
                    return;
                }
                
                if (selectedOrg) {
                    startLoading('Setting selected org...');
                    // Store the selection
                    orgDropdown.setAttribute('data-last-selection', selectedOrg);
                    vscode.postMessage({
                        command: 'setSelectedOrg',
                        alias: selectedOrg,
                        viewId: 'executeApex'
                    });
                }
            });
            //#endregion LISTBOX
            
            // File selector functionality
            const fileSelector = document.getElementById('fileSelector');

            let currentFilePath = '';
            const saveButton = document.getElementById('saveButton');
            const clearButton = document.getElementById('clearButton');


            // File selector change handler
            fileSelector.addEventListener('change', () => {
                const selectedFile = fileSelector.value;
                currentFilePath = selectedFile;
                saveButton.disabled = !selectedFile; 
                if (selectedFile) {
                    startLoading('Loading file content...');
                    vscode.postMessage({
                        command: 'loadApexFile',
                        filePath: selectedFile
                    });
                } else {
                    textarea.value = '';
                    updateCharCount();
                }
            });
            
            // Clear editor function
            window.clearEditor = function() {
                textarea.value = '';
                const fileSelector = document.getElementById('fileSelector');
                const saveButton = document.getElementById('saveButton');
                if (fileSelector) fileSelector.value = '';
                currentFilePath = '';
                if (saveButton) saveButton.disabled = true;
                updateCharCount();
            };

            // Save file function
            window.saveApexFile = function() {
                if (!currentFilePath) {
                    vscode.postMessage({
                        command: 'error',
                        message: 'No file selected'
                    });
                    return;
                }

                const content = document.getElementById('apexTextarea').value;
                startLoading('Saving file...');
                document.getElementById('saveButton').disabled = true;
                
                vscode.postMessage({
                    command: 'saveApexFile',
                    filePath: currentFilePath,
                    content: content
                });
            };


            // Handle textarea changes
            textarea.addEventListener('input', function() {
                saveButton.disabled = !currentFilePath;
                updateCharCount();
            });

            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateApexFileList':
                        updateFileListUI(message.files);
                        break;
                    case 'apexFileContent':
                        const textarea = document.getElementById('apexTextarea');
                        if (textarea) {
                            textarea.value = message.content;
                            textarea.focus();
                            document.getElementById('saveButton').disabled = false;
                            updateCharCount();
                        }
                        stopLoading();
                        break;
                    case 'fileSaved':
                        stopLoading();
                        document.getElementById('saveButton').disabled = false;
                        break;
                }
            });

            // Update Templates
            window.updateTemplates = function() {
                startLoading('Updating templates...');
                const updateButton = document.getElementById('updateTemplatesButton');
                updateButton.disabled = true;
                
                vscode.postMessage({
                    command: 'updateTemplates'
                });
            };

            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'templatesUpdated':
                        stopLoading();
                        const updateButton = document.getElementById('updateTemplatesButton');
                        if (updateButton) updateButton.disabled = false;
                        break;
                }
            });

        })();

        
       

        
        function updateFileListUI(files) {
            fileSelector.innerHTML = '<option value="">Select an Apex file...</option>';
            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.path;
                option.textContent = file.name;
                fileSelector.appendChild(option);
            });
        }
    </script>
</body>
</html>`;
} 