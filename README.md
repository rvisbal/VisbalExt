# Visbal - Salesforce Debug Logs Extension for VS Code

## Overview

Visbal is a VS Code extension that provides a streamlined interface for viewing, downloading, and managing Salesforce debug logs directly within your development environment. It eliminates the need to switch between VS Code and the Salesforce UI when working with debug logs.

## Features

- **Log Listing**: View all available debug logs from your connected Salesforce org
- **Log Details**: See comprehensive information about each log including user, operation, application, and size
- **Download Logs**: Download logs directly to your workspace with a single click
- **Open Logs**: Open downloaded logs directly in the VS Code editor
- **Large Log Support**: Handles logs of virtually any size through direct file output
- **Multiple CLI Format Support**: Works with both new (`sf`) and legacy (`sfdx`) CLI formats
- **SOQL Query Support**: Fetch logs using SOQL queries for more advanced filtering
- **Informative Filenames**: Log files are saved with descriptive names that include ID, operation, status, size, and timestamp

## Requirements

- Visual Studio Code 1.60.0 or higher
- Salesforce CLI (either the new `sf` format or the legacy `sfdx` format)
- An authenticated Salesforce org connection

## Installation

1. Install the extension from the VS Code Marketplace
2. Ensure you have the Salesforce CLI installed:
   - New format: `npm install -g @salesforce/cli`
   - Legacy format: `npm install -g sfdx-cli`
3. Authenticate with your Salesforce org:
   - New format: `sf org login web`
   - Legacy format: `sfdx force:auth:web:login --setdefaultusername`

## Usage

### Viewing Logs

1. Open the Salesforce Debug Logs view from the Activity Bar or Explorer
2. Click "Refresh" to fetch the latest logs from your org
3. View log details including user, operation, size, and timestamp

### Downloading Logs

1. Click the "Download" button next to any log
2. The log will be downloaded to your workspace's `.sfdx/tools/debug/logs` directory
3. The log will automatically open in the editor once downloaded
4. Log files are saved with descriptive filenames in the format: `id_operation_status_size_timestamp.log`
   - Example: `07LAq00000NWz3MMAT_aura_success_2420000_2023-03-12T00-26-18.905Z.log`

### Opening Previously Downloaded Logs

1. Click the "Open" button next to any previously downloaded log
2. The log will open in the VS Code editor

### Using SOQL Queries

1. Click the "SOQL" button to fetch logs using a SOQL query
2. This allows for more advanced filtering of logs

## Troubleshooting

### Common Issues

#### "SFDX CLI is not installed"
- Install the Salesforce CLI using one of these commands:
  - `npm install -g @salesforce/cli`
  - `npm install -g sfdx-cli`

#### "No default Salesforce org found"
- Set a default org using one of these commands:
  - `sf org login web`
  - `sfdx force:auth:web:login --setdefaultusername`

#### "Failed to download log: maxBuffer length exceeded"
- For very large logs, the extension will attempt to use direct file output
- If this still fails, use the Salesforce CLI directly:
  - `sf apex get log -i <LOG_ID> > log_file.log`
  - `sfdx force:apex:log:get --logid <LOG_ID> > log_file.log`

### Viewing Logs

- Server-side logs can be viewed in the VS Code Developer Tools (Help > Toggle Developer Tools)
- Client-side logs can be viewed in the Webview Developer Tools (right-click in the extension view and select "Inspect Element")

## Extension Settings

This extension contributes the following settings:

* `visbal.maxLogLimit`: Maximum number of logs to fetch (default: 200)
* `visbal.autoRefresh`: Automatically refresh logs when the view becomes visible (default: true)

## Release Notes

### 0.0.1

- Initial release
- Support for viewing, downloading, and opening Salesforce debug logs
- Support for both new (`sf`) and legacy (`sfdx`) CLI formats
- Large log handling with direct file output
- Descriptive log filenames with operation, status, and size information

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.