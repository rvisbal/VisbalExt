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
        
        .dropdown-button-group {
            position: relative;
            display: inline-block;
        }
        
        .dropdown-menu {
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 220px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
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
                    </div>
                </div>
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
            
            
            // Selected org tracking
            let selectedOrg = '';
            
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
                    vscode.postMessage({
                        command: 'terminalAction',
                        action: action
                    });
                    updateStatus(\`Opening \${item.textContent}...\`);
                    terminalMenu.classList.add('hidden');
                });
            });
            
            
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
                }
            });
            
            // Update org list UI with the same logic as other tabs
            function updateOrgListUI(orgs, fromCache = false, backendSelectedOrg = null) {
                console.log('[VisbalExt.TractionTab] updateOrgListUI -- Updating org list UI with data:', orgs);
                console.log('[VisbalExt.TractionTab] updateOrgListUI -- Backend selected org:', backendSelectedOrg);
                
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
                        console.log('[VisbalExt.TractionTab] Set selected org from backend:', backendSelectedOrg);
                        updateStatus('Selected org: ' + backendSelectedOrg, 'success');
                    } else if (!selectedOrg && defaultOrg) {
                        // Auto-select the default org if no org is currently selected
                        orgSelector.value = defaultOrg;
                        selectedOrg = defaultOrg; // Update global selectedOrg variable
                        console.log('[VisbalExt.TractionTab] Auto-selected default org:', defaultOrg);
                        
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