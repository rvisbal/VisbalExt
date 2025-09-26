# Field-Level Security (FLS) in Salesforce Apex

## Overview

This document outlines how to properly implement Field-Level Security (FLS) checks in Salesforce Apex code. The scanner looks for data modification operations that are performed without checking for `isUpdateable()`. 

### Potential False Positives

This may be a false positive if:
- Your code accesses only objects whose security is managed by your app and not the admin (e.g., OAuth states)
- Checks are performed outside of the dataflow (automatically in a Visualforce inputField tag or manually in a constructor)
- This is an enterprise object or other object whose permissions are not set by the admin

## Enforce Object and Field Permissions

Apex generally runs in system context, so the current user's permissions and field-level security (FLS) aren't taken into account during code execution. To enforce the FLS and object permissions of the current user, you can:

1. Enforce user mode for database operations and SOQL queries
2. Check the current user's permissions for an object or field, then perform operations only if the user has sufficient permissions

### Enforce User Mode

To enforce field-level security and object permissions of the current user, you can specify user mode access for database operations and SOQL queries. See [Enforce User Mode for Database Operations](https://help.salesforce.com/s/articleView?id=sf.apex_classes_enforce_usermode.htm).

### Check Field-Level Permissions

You can enforce object-level and field-level permissions in your code by explicitly calling the access control methods of the `Schema.DescribeSObjectResult` and `Schema.DescribeFieldResult` classes. These methods check the current user's access permission levels so that you can perform a specific DML operation or query only if the user has sufficient permissions.

#### Available Methods

- **isAccessible()**: Check read access to an sObject or field
- **isCreateable()**: Check create access to an sObject or field
- **isUpdateable()**: Check update access to an sObject or field
- **isDeletable()**: Check delete access to an sObject (object level only)

## Code Examples

### Check Field-Level Update Permission

```apex
if (Schema.sObjectType.Contact.fields.Email.isUpdateable()) {
    // Update contact
}
```

### Check Field-Level Create Permission

```apex
if (Schema.sObjectType.Contact.fields.Email.isCreateable()) {
    // Create new contact
}
```

### Check Field-Level Read Permission

```apex
if (Schema.sObjectType.Contact.fields.Email.isAccessible()) {
    Contact c = [SELECT Email FROM Contact WHERE Id = :contactId];
}
```

### Check Object-Level Delete Permission

```apex
if (Schema.sObjectType.Contact.isDeletable()) {
    // Delete contact
}
```

## Important Considerations

### Sharing Rules vs. Permissions

- Object-level and field-level permissions are distinct from sharing rules
- They can coexist but object-level and field-level permissions take precedence over sharing rules
- If sharing rules are defined, enforce them at the class level using the `with sharing` keyword

### Experience Cloud Sites

- Orgs with Experience Cloud sites have settings to hide personal information
- These settings aren't enforced in Apex, even with security features like `WITH USER_MODE` or `stripInaccessible` method
- To hide specific fields on the User object in Apex, follow the example code in [Comply with a User's Personal Information Visibility Settings](https://help.salesforce.com/s/articleView?id=sf.networks_site_settings_user_personal_info.htm)

### Automated Process Users

Automated Process users can't perform Object and FLS checks in custom code unless appropriate permission sets are explicitly applied to those users.