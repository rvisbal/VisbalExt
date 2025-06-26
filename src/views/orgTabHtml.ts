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
            OrgUtils.logDebug(`Delete scratch org requested: alias=${message.alias}, username=${message.username}`);
            // Example of how to send status updates:
            // sendDeleteStatus(webview, true, 'Scratch org deleted successfully!');
            // or
            // sendDeleteStatus(webview, false, 'Failed to delete scratch org: error message');
            break;
    }
} 