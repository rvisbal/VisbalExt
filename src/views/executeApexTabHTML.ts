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
            flex-direction: column;
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
        .tabs {
            display: flex;
            padding: 0;
            background: var(--vscode-tab-inactiveBackground);
            border-bottom: 1px solid var(--vscode-tab-border);
        }
        .tab {
            padding: 4px 12px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--vscode-tab-inactiveForeground);
            border-bottom: 2px solid transparent;
            font-size: 12px;
        }
        .tab.active {
            background: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom: 2px solid var(--vscode-focusBorder);
        }
        .tab:hover:not(.active) {
            background: var(--vscode-tab-hoverBackground);
        }
        .content {
            flex: 1;
            display: none;
            height: calc(100vh - 30px);
            overflow: hidden;
        }
        .content.active {
            display: flex;
            flex-direction: column;
        }
        .editor-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            padding: 8px;
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
            height: 100%;
            white-space: pre-wrap;
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
            margin: 10px 0;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            border-radius: 3px;
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
        <div class="tabs">
            <button class="tab active" data-tab="editor">Editor</button>
            <button class="tab" data-tab="results">Results</button>
        </div>
        <div id="editorContent" class="content active">
            <div class="editor-container">
                <div class="editor-header">
                    <div class="toolbar">
                        <div class="toolbar-left" style="display: none">
                            <select id="fileSelector" class="fileSelector" title="Select Apex File">
                                <option value="">Select an Apex file...</option>
                            </select>
                            <button id="saveButton" onclick="saveApexFile()" title="Save Changes" disabled>
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M13.353 1.146l1.5 1.5L15 3v11.5l-.5.5h-13l-.5-.5v-13l.5-.5H13l.353.146zM2 2v12h12V3.208L12.793 2H2zm2 3h8v1H4V5zm6 3H4v1h6V8zM4 11h4v1H4v-1z"/>
                                </svg>
                            </button>
                            <button id="clearButton" onclick="clearEditor()" title="Clear Editor">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M10 12.6l.7.7 1.6-1.6 1.6 1.6.8-.7L13 11l1.7-1.6-.8-.8-1.6 1.7-1.6-1.7-.7.8 1.6 1.6-1.6 1.6zM1 4h14V3H1v1zm0 3h14V6H1v1zm0 3h8V9H1v1zm0 3h8v-1H1v1z"/>
                                </svg>
                            </button>
                            <button id="updateTemplatesButton" onclick="updateTemplates()" title="Update Template Files">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M12.75 8a4.5 4.5 0 0 1-8.61 1.834l-1.391.565A6.001 6.001 0 0 0 14.25 8 6 6 0 0 0 3.5 4.334V2.5H2v4l.75.75h3.5v-1.5H4.352A4.5 4.5 0 0 1 12.75 8z"/>
                                </svg>
                            </button>
                            <div id="statusBar"></div>
                        </div>
                        <div class="toolbar-right">
                            <select id="org-selector" class="org-selector" title="Select Salesforce Org">
                                <option value="">Loading orgs...</option>
                            </select>
                             <button class="icon-button button-primary" id="executeButton"  onclick="executeApex()" title="Execute Apex Code">
                                <span class="icon play"></span>
                            </button>
                        </div>
                    </div>
                </div>
          
                    
        
                <div class="textarea-container">
                    <textarea 
                        id="apexTextarea" 
                        placeholder="Type something here..."
                        aria-label="Apex code editor"
                        spellcheck="false"
                        autocomplete="off"
                    ></textarea>
                    <div class="char-count">0 / 1000 characters</div>
                </div>
            </div>
            <div class="loading-container" id="loadingContainer">
                <div class="loading-spinner"></div>
                <span id="loadingMessage">Loading...</span>
            </div>
        </div>
        <div id="resultsContent" class="content">
            <div id="outputContainer" class="output-container">
                Execute Apex code to see results here
            </div>
        </div>
        <div id="errorContainer" class="error-container">
            <div id="errorMessage" class="error-message"></div>
        </div>
    </div>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
             const statusBar = document.getElementById('statusBar');
            const textarea = document.getElementById('apexTextarea');
            const charCount = document.querySelector('.char-count');
            const executeButton = document.getElementById('executeButton');
            const outputContainer = document.getElementById('outputContainer');
            const tabs = document.querySelectorAll('.tab');
            const contents = document.querySelectorAll('.content');
            const loadingContainer = document.getElementById('loadingContainer');
            const errorContainer = document.getElementById('errorContainer');
            const errorMessage = document.getElementById('errorMessage');
            
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
                    console.log('[VisbalExt.htmlTemplate] handleOrgSelection -- Org selected -- Details:', selectedOrg);
                    // Store the selection
                    orgDropdown.setAttribute('data-last-selection', selectedOrg);
                    vscode.postMessage({
                        command: 'setSelectedOrg',
                        alias: selectedOrg
                    });
                }
            });
            //#endregion LISTBOX
            
            // Tab switching
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabId = tab.getAttribute('data-tab');
                    
                    // Update tab states
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    // Update content states
                    contents.forEach(content => {
                        if (content.id === tabId + 'Content') {
                            content.classList.add('active');
                        } else {
                            content.classList.remove('active');
                        }
                    });
                });
            });

            // Switch to results tab when executing
            function switchToResultsTab() {
                tabs.forEach(tab => {
                    if (tab.getAttribute('data-tab') === 'results') {
                        tab.click();
                    }
                });
            }
            
            // Update character count
            function updateCharCount() {
                const length = textarea.value.length;
                charCount.textContent = \`\${length} characters\`;
            }
            
            // Initialize character count
            updateCharCount();
            
            // Handle textarea input
            textarea.addEventListener('input', (e) => {
                updateCharCount();
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'executionStarted':
                        executeButton.disabled = true;
                        outputContainer.className = 'output-container';
                        outputContainer.innerHTML = '<div class="loading">Executing Apex code...</div>';
                        switchToResultsTab();
                           
                        break;
                        
                    case 'executionResult':
                        stopLoading();
                        executeButton.disabled = false;
                        let output = '';
                        
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
                        statusBar.textContent = message.message;
                        outputContainer.innerHTML = output;
                        break;
                    case 'updateOrgList':
                        updateOrgListUI(message.orgs || {}, message.fromCache, message.selectedOrg);

                        break;
                    case 'refreshComplete':
                        stopLoading();
                        refreshButton.innerHTML = '↻ Refresh Org List';
                        refreshButton.disabled = false;
                        break;
                    case 'error':
                        stopLoading();
                        statusBar.textContent = message.message;
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
                        statusBar.textContent = message.message;
                        // Ensure we switch to results tab
                        switchToResultsTab();
                        break;
                }
            });
            
            
            function startLoading(message) {
                loadingContainer.style.display = 'flex';
                document.getElementById('loadingMessage').textContent = message || 'Loading...';
                statusBar.textContent = message || 'Loading...';
                executeButton.disabled = true;
            }
            
            function stopLoading() {
                // Hide loading state
                loadingContainer.style.display = 'none';
                statusBar.textContent = '';
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
                console.log('[VisbalExt.soqPanel] updateOrgListUI Updating org list UI with data:', orgs);
                console.log('[VisbalExt.soqPanel] updateOrgListUI Selected org:', selectedOrg);
                
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
                }
        
                // If this was a fresh fetch (not from cache), update the cache
                if (!fromCache) {
                    saveOrgCache(orgs);
                }
        
                // Store the selection
                if (selectedOrg) {
                    orgDropdown.setAttribute('data-last-selection', selectedOrg);
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
                    console.log('[VisbalExt.htmlTemplate] handleOrgSelection -- Org selected -- Details:', selectedOrg);
                    // Store the selection
                    orgDropdown.setAttribute('data-last-selection', selectedOrg);
                    vscode.postMessage({
                        command: 'setSelectedOrg',
                        alias: selectedOrg
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
                fileSelector.value = '';
                currentFilePath = '';
                saveButton.disabled = true;
                updateCharCount();
                statusBar.textContent = 'Editor cleared';
                setTimeout(() => {
                    statusBar.textContent = '';
                }, 3000);
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
                        statusBar.textContent = message.message;
                        setTimeout(() => {
                            statusBar.textContent = '';
                        }, 3000);
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
                        statusBar.textContent = message.message;
                        const updateButton = document.getElementById('updateTemplatesButton');
                        updateButton.disabled = false;
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