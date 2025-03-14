# Salesforce REST API Integration

This extension now includes direct integration with the Salesforce REST API, allowing you to interact with your Salesforce org without relying solely on the Salesforce CLI.

## Prerequisites

1. **Salesforce CLI**: The extension still requires the Salesforce CLI to be installed for authentication purposes.
2. **Authenticated Org**: You must be authenticated to a Salesforce org using the Salesforce CLI.

## Features

### 1. Fetch Salesforce Logs via REST API

This command fetches debug logs from your Salesforce org using the REST API instead of the CLI commands. This can be faster and more reliable in some environments.

- **Command**: `Fetch Salesforce Logs via REST API`
- **Location**: Available in the Log Analyzer view title bar
- **Keyboard Shortcut**: None (can be configured in keyboard shortcuts)

### 2. Execute Salesforce Apex REST Endpoint

This command allows you to execute custom Apex REST endpoints in your Salesforce org.

- **Command**: `Execute Salesforce Apex REST Endpoint`
- **Location**: Available in the command palette (Ctrl+Shift+P)
- **Usage**:
  1. Enter the Apex REST endpoint name (e.g., "MyApexClass")
  2. Select the HTTP method (GET, POST, PUT, PATCH, DELETE)
  3. For POST, PUT, and PATCH methods, you can enter JSON data
  4. The response will be displayed in a new editor window

## Using the Salesforce API Service in Your Code

The extension provides a `SalesforceApiService` class that you can use in your own code to interact with the Salesforce REST API.

### Example Usage

```typescript
import { salesforceApi } from './services/salesforceApiService';

// Initialize the API service
await salesforceApi.initialize();

// Execute a SOQL query
const query = "SELECT Id, Name FROM Account LIMIT 10";
const result = await salesforceApi.query(query);

// Get a specific record
const accountId = "001XXXXXXXXXXXXXXX";
const account = await salesforceApi.getRecord("Account", accountId);

// Create a new record
const newContact = {
  LastName: "Smith",
  Email: "smith@example.com"
};
const createResult = await salesforceApi.createRecord("Contact", newContact);

// Update a record
const contactId = createResult.id;
const updateData = {
  FirstName: "John"
};
await salesforceApi.updateRecord("Contact", contactId, updateData);

// Delete a record
await salesforceApi.deleteRecord("Contact", contactId);

// Execute an Apex REST endpoint
const apexResult = await salesforceApi.executeApexRest("MyCustomEndpoint", "GET");
```

## API Reference

### SalesforceApiService Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initializes the API service by getting authentication details from the Salesforce CLI |
| `query(soql, useToolingApi)` | Executes a SOQL query |
| `getRecord(objectType, recordId, fields, useToolingApi)` | Gets a specific record by ID |
| `createRecord(objectType, data, useToolingApi)` | Creates a new record |
| `updateRecord(objectType, recordId, data, useToolingApi)` | Updates an existing record |
| `deleteRecord(objectType, recordId, useToolingApi)` | Deletes a record |
| `executeApexRest(endpoint, method, data)` | Executes an Apex REST endpoint |
| `setApiVersion(version)` | Sets the API version to use |

## Troubleshooting

### Authentication Issues

If you encounter authentication issues, try the following:

1. Ensure you're authenticated to your Salesforce org using the CLI:
   ```
   sf org login web
   ```
   or
   ```
   sfdx force:auth:web:login
   ```

2. Verify your default org:
   ```
   sf org display
   ```
   or
   ```
   sfdx force:org:display
   ```

### API Version Issues

If you encounter API version issues, you can set a different API version:

```typescript
salesforceApi.setApiVersion('v58.0');
```

## Limitations

1. The API service relies on the Salesforce CLI for authentication.
2. Session timeout will require re-authentication via the CLI.
3. Some operations may require specific permissions in your Salesforce org.

## Future Enhancements

1. Direct OAuth authentication without relying on the CLI
2. Bulk API support for large data operations
3. Metadata API integration for deployment operations
4. Streaming API support for real-time notifications 