import { styles } from './styles';
import { WebviewUtils } from '../utils/webviewUtils';
import { OrgTable, Org } from '../components/OrgTable';
import { Webview } from 'vscode';
import { OrgUtils } from '../utils/orgUtils';

export function getOrgTabHtml(webview: Webview, orgs: Org[] = [], isLoading = false, error = ''): string {
    const orgTable = new OrgTable(webview, orgs);
    // HTML TEMPLATE STRING
    // JavaScript/HTML section, type script rule dont apply in this block
    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Salesforce Orgs</title>
        <style>${styles}</style>
    </head>
    <body>
        ${isLoading ? 
            `<div class="loading-container"><span class="loading-spinner"></span> Loading orgs...</div>` : 
            error ? 
            `<div class="error-message">${error}</div>` : 
            orgTable.render()
        }
    </body>
    </html>`;

    return html;// WebviewUtils.injectDebugBox(html);
}

// Send status update to webview
export function sendDeleteStatus(webview: Webview, success: boolean, message?: string) {
    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] sendDeleteStatus -- success: ${success}, message: ${message}`);
    webview.postMessage({
        command: 'deleteStatus',
        success,
        message
    });
}



// Handle webview messages in your extension.ts
export function handleWebviewMessage(webview: Webview, message: any, orgTable: OrgTable) {
    OrgUtils.logDebug('handleWebviewMessage.message.command: ' + message.command);
    switch (message.command) {
        case 'getFilteredOrgs':
            const html = orgTable.getFilteredHtml(message.filterType, message.searchTerm);
            webview.postMessage({
                command: 'updateOrgsHtml',
                html
            });
            break;
        case 'refreshOrgList':
            // Handle refresh in your extension
            break;
        case 'openOrg':
            // Handle org opening in your extension
            break;
        case 'deleteOrg':
            // Handle org deletion in your extension
            OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] deleteOrg -- START: alias=${message.alias}, username=${message.username}`);
            
            // Attempt to delete the scratch org
            handleOrgDeletion(webview, message.alias, message.username);
            break;
    }


    // Handle actual org deletion
    async function handleOrgDeletion(webview: Webview, alias: string, username: string) {
        try {
            OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- Starting deletion process for alias: ${alias}, username: ${username}`);
            
            // Validate inputs
            if (!alias && !username) {
                OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- ERROR: Both alias and username are empty`);
                sendDeleteStatus(webview, false, 'No org identifier provided for deletion');
                return;
            }

            // Determine which identifier to use
            const orgIdentifier = alias || username;
            OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- Using identifier: ${orgIdentifier}`);

            // Execute the deletion command
            const deleteCommand = `sf org delete scratch --target-org "${orgIdentifier}" --no-prompt`;
            OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- Executing command: ${deleteCommand}`);
            
            // Import the exec function for command execution
            const { exec } = require('child_process');
            
            exec(deleteCommand, { timeout: 120000 }, (error: any, stdout: string, stderr: string) => {
                OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- Command completed`);
                OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- stdout: ${stdout}`);
                OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- stderr: ${stderr}`);
                OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- error: ${error}`);

                if (error) {
                    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- DELETION FAILED: ${error.message}`);
                    
                    // Check for specific error patterns
                    if (error.message.includes('ENOENT') || error.message.includes('sf: command not found')) {
                        sendDeleteStatus(webview, false, 'Salesforce CLI (sf) not found. Please install Salesforce CLI.');
                    } else if (error.message.includes('timeout')) {
                        sendDeleteStatus(webview, false, 'Deletion timed out. The org might still be deleting in the background.');
                    } else if (error.message.includes('No org found')) {
                        sendDeleteStatus(webview, false, `Org "${orgIdentifier}" not found or already deleted.`);
                    } else {
                        sendDeleteStatus(webview, false, `Failed to delete scratch org: ${error.message}`);
                    }
                    return;
                }

                // Check stdout for success indicators
                if (stdout.includes('Successfully deleted') || stdout.includes('deleted scratch org')) {
                    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- DELETION SUCCESSFUL`);
                    sendDeleteStatus(webview, true, `Scratch org "${orgIdentifier}" deleted successfully!`);
                    
                    // Trigger org list refresh
                    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- Triggering org list refresh`);
                    webview.postMessage({ command: 'refreshOrgList' });
                } else if (stderr.includes('warning') && !stderr.includes('error')) {
                    // Sometimes there are warnings but deletion succeeds
                    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- DELETION COMPLETED WITH WARNINGS`);
                    sendDeleteStatus(webview, true, `Scratch org "${orgIdentifier}" deleted with warnings.`);
                    webview.postMessage({ command: 'refreshOrgList' });
                } else {
                    OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- DELETION RESULT UNCLEAR`);
                    sendDeleteStatus(webview, false, `Deletion result unclear. Check output: ${stdout || stderr}`);
                }
            });

        } catch (error: any) {
            OrgUtils.logDebug(`[VisbalExt.OrgTabHtml] handleOrgDeletion -- EXCEPTION: ${error.message}`);
            sendDeleteStatus(webview, false, `Unexpected error during deletion: ${error.message}`);
        }
    }
} 