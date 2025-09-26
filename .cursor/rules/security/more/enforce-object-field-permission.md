# Enforce Object and Field Permissions

Apex generally runs in **system context**, so the current user's permissions and field-level security (FLS) aren't taken into account during code execution. To enforce the FLS and object permissions of the current user, you can use two main approaches:

1. 🔐 **Enforce user mode** for database operations and SOQL queries
2. 🛡️ **Check permissions explicitly** before performing operations

## Enforce User Mode

To enforce field-level security and object permissions of the current user, you can specify **user mode access** for database operations and SOQL queries.

💡 **See Also:** [Enforce User Mode for Database Operations](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_sharing_enforce_user_mode.htm)

---

## Check Field-Level Permissions

You can also enforce object-level and field-level permissions in your code by explicitly calling the access control methods of the `Schema.DescribeSObjectResult` and the `Schema.DescribeFieldResult` classes. These methods check the current user's access permission levels so that you can perform a specific DML operation or a query only if the user has sufficient permissions.

### Available Permission Methods

**Object-Level Methods** (`Schema.DescribeSObjectResult`):
- `isAccessible()` - Verify **read** access to an sObject
- `isCreateable()` - Verify **create** access to an sObject
- `isUpdateable()` - Verify **update** access to an sObject  
- `isDeletable()` - Verify **delete** access to an sObject

**Field-Level Methods** (`Schema.DescribeFieldResult`):
- `isAccessible()` - Verify **read** access for a field
- `isCreateable()` - Verify **create** access for a field
- `isUpdateable()` - Verify **update** access for a field

### Permission Check Examples

The following examples demonstrate how to call the access control methods:

#### Check Field-Level Update Permission

To check the field-level update permission of the contact's email field before updating it:

```apex
if (Schema.sObjectType.Contact.fields.Email.isUpdateable()) {
    // Update contact
    Contact c = [SELECT Id, Email FROM Contact WHERE Id = :contactId];
    c.Email = 'newemail@example.com';
    update c;
}
```

#### Check Field-Level Create Permission

To check the field-level create permission of the contact's email field before creating a new contact:

```apex
if (Schema.sObjectType.Contact.fields.Email.isCreateable()) {
    // Create new contact
    Contact c = new Contact();
    c.Email = 'contact@example.com';
    c.LastName = 'Smith';
    insert c;
}
```

#### Check Field-Level Read Permission

To check the field-level read permission of the contact's email field before querying for this field:

```apex
if (Schema.sObjectType.Contact.fields.Email.isAccessible()) {
    Contact c = [SELECT Email FROM Contact WHERE Id = :contactId];
    System.debug('Contact Email: ' + c.Email);
}
```

#### Check Object-Level Delete Permission

To check the object-level permission for the contact before deleting the contact:

```apex
if (Schema.sObjectType.Contact.isDeletable()) {
    // Delete contact
    Contact c = [SELECT Id FROM Contact WHERE Id = :contactId];
    delete c;
}
```
---

## Important Considerations

### Permissions vs. Sharing Rules

Object-level and field-level permissions are **distinct from sharing rules**, which enforce specific record access. They can coexist and work together:

🔗 **Coexistence:** 
- If sharing rules are defined in Salesforce, you can enforce them at the class level by declaring the class with the `with sharing` keyword
- When you call the `Schema.DescribeSObjectResult` and `Schema.DescribeFieldResult` access control methods, the verification of object and field-level permissions is performed **in addition to** the sharing rules that are in effect

⚖️ **Precedence Rules:** 
Sometimes, the access level granted by a sharing rule can conflict with an object-level or field-level permission. In that case, **object-level and field-level permissions take precedence over sharing rules**.

📚 **See Also:** [Use the with sharing, without sharing, and inherited sharing Keywords](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_sharing_rules.htm)

### Experience Cloud Personal Information

🌐 **Experience Cloud Sites:** Orgs with Experience Cloud sites enabled provide various settings to hide a user's personal information from other users.

⚠️ **Important Limitation:** These settings **aren't enforced in Apex**, even with security features such as:
- `WITH USER_MODE` clause
- `stripInaccessible()` method

🔧 **Workaround:** To hide specific fields on the User object in Apex, follow the example code outlined in [Comply with a User's Personal Information Visibility Settings](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_sharing_personal_info.htm).

📋 **See Also:** 
- [Manage Personal User Information Visibility](https://help.salesforce.com/s/articleView?id=sf.users_personal_info_visibility.htm)
- [Share Personal Contact Information Within Experience Cloud Sites](https://help.salesforce.com/s/articleView?id=sf.networks_personal_info_sharing.htm)

### Automated Process Users

🤖 **Limitation:** Automated Process users **can't perform Object and FLS checks** in custom code unless appropriate permission sets are explicitly applied to those users.

💡 **Solution:** Ensure that Automated Process users have the necessary permission sets assigned if they need to perform security checks in your custom Apex code.