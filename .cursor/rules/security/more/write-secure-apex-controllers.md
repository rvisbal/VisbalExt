# Write Secure Apex Controllers

## Learning Objectives

After completing this unit, you'll be able to:

- **Describe why sharing rules are crucial in Apex**
- **Enforce sharing rules** effectively in your code
- **Explain how to protect against CRUD and FLS violations** to maintain data security

## Apex Security and Sharing

When you use Apex, the security of your code is critical. By default, Apex classes execute in **system mode** and have the ability to read and update all data within an organization. 

### Key Security Requirements

Therefore, you must:

1. 🔐 **Enforce sharing rules** to respect user access levels
2. 🛡️ **Set object and field permissions** appropriately  
3. ⚠️ **Protect against CRUD and FLS violations** to prevent unauthorized access

### Execution Mode Decision

You need to determine which code should be run in:

- **System mode** - With access privileges to many resources (system-level operations)
- **User mode** - Where permissions, field-level security, and sharing rules of the current user are enforced

---

## Enforcing Sharing Rules

Developers who use Apex need to ensure they don't inadvertently expose sensitive data that would normally be hidden from users by user permissions, field-level security, or organization-wide defaults.

### System Context Behavior

**Apex generally runs in system context.** In system context, Apex code has access to all objects and fields—object permissions, field-level security, and sharing rules aren't applied for the current user. This strategy ensures that code doesn't fail to run because of hidden fields or objects for a user.

### When Sharing Rules Apply

However, sharing rules aren't always bypassed: The class must be declared using the `without sharing` keyword to ensure that sharing rules are not enforced. Usually, system context provides the correct behavior for system-level operations such as triggers and web services that need access to all data in an organization. However, you can also specify that particular Apex classes should enforce the sharing rules that apply to the current user.

### Three Sharing Keywords

There are **three keywords** to remember for sharing rules:

| Keyword | Purpose |
|---------|---------|
| `with sharing` | Specify that sharing rules must be enforced |
| `without sharing` | Specify that sharing rules are not enforced |  
| `inherited sharing` | Run the class in the sharing mode of the class that called it |

### Exception: executeAnonymous

⚠️ **Important Exception:** The only exception to how Apex runs in system context is Apex code executed with the `executeAnonymous` call and Chatter in Apex. The `executeAnonymous` call always executes using the full permissions of the current user.

### with sharing

The `with sharing` keyword lets you specify that the sharing rules for the current user are enforced for the class. You have to **explicitly opt into** this keyword for the class as a blank sharing clause on a class means that sharing settings are inherited from the caller, which may or may not enforce sharing.

```apex
public with sharing class MySecureController {
    // Sharing rules are enforced for this class
}
```

### without sharing

You use the `without sharing` keywords when declaring a class to ensure that the sharing rules for the current user are **not enforced**. For example, you can explicitly turn off sharing rule enforcement when a class is called from another class that is declared using `with sharing`.

```apex
public without sharing class MySystemController {
    // Sharing rules are NOT enforced for this class
}
```

### inherited sharing

An Apex class without an explicit sharing declaration has an **unknown enforcement** of sharing rules as it depends on the sharing enforcement of the caller. 

🚫 **Security Anti-pattern:** Indeterminate sharing enforcement is a security anti-pattern, and should be avoided if at all possible. 

**Advanced Technique:** Designing Apex classes that can run in either `with sharing` or `without sharing` mode at runtime is an advanced technique. Such a technique can be difficult to distinguish from one where a specific sharing declaration is accidentally omitted. An explicit `inherited sharing` declaration clarifies the intent, avoiding ambiguity arising from an omitted declaration or false positives from security analysis tooling.

```apex
public inherited sharing class MyFlexibleController {
    // Inherits sharing mode from the calling class
}
```

**AppExchange Benefits:** Using `inherited sharing` enables you to pass AppExchange Security Review and ensure that your privileged Apex code is not used unexpectedly or insecurely. 

An Apex class with `inherited sharing` runs as `with sharing` when used as:

- ⚡ **Aura component controller**
- 🖥️ **Visualforce controller**  
- 🌐 **Apex REST service**
- 🔄 **Any other entry point to an Apex transaction**

### Important Considerations

📋 **Note:** Be aware that the sharing setting of the class where the method is **defined** is applied, not of the class where the method is **called**. This means that if a method is defined in a class declared with `with sharing` is called by a class declared `without sharing`, the method executes with enforcing sharing rules. Class-level security is always still necessary. 

⚠️ **Pricebook2 Exception:** All SOQL or SOSL queries that use Pricebook2 ignore the `with sharing` keyword. All Pricebook records are returned, regardless of the applied sharing rules.


### Impact of Enforcing Sharing Rules

Enforcing the current user's sharing rules can impact:

- **SOQL and SOSL queries:** A query may return fewer rows than it would operating in system context
- **Data Manipulation Language (DML) operations:** An operation may fail because the current user doesn't have the correct permissions. For example, if the user specifies a foreign key value that exists in the organization but which the current user does not have access to

---

## Enforcing Object and Field Permissions
### User Mode Operations

Data operations (SOQL, DML, and SOSL) in Apex run in **system mode by default** and have full CRUD access to all objects and fields in general. In Spring 2023, Apex introduced new access levels allowing developers to select the mode for executing data operations.

**Available Modes:**
- **User mode** - Respects user permissions
- **System mode** - Bypasses user permissions (default)

💡 **Key Benefit:** Executing data operations in user mode ensures that sharing rules, CRUD, and FLS permissions are respected and enforced.

#### Access Records in User Mode

Access Records in User mode ensures the enforcement of sharing rules, CRUD/FLS, and Restriction Rules. By utilizing SOQL queries with the `USER_MODE` keyword:

```apex
List<Account> acc = [SELECT Id FROM Account WITH USER_MODE];
```

🔄 **How it works:** System mode privileges are temporarily dropped, ensuring retrieval of only the records accessible to the user. System mode resumes after the query execution is complete.

#### Insert Records in User Mode

In User mode, Insert Records ensures that the insert operation executes only if the user has permission for both creating a new record and edit permission on the field `Opportunity.Amount` (FLS check). 

**Example:** The user intends to create an opportunity with a value of $500 in the Amount field. To ensure that the insert operation proceeds only if the user possesses the necessary permissions to create a new record and edit the `Opportunity.Amount` field (Field-Level Security check):

**Method 1: Using `insert as user`**
```apex
Opportunity o = new Opportunity();
// specify other fields
o.Amount = 500;
insert as user o;
```

**Method 2: Using `Database.insert()` with `AccessLevel.USER_MODE`**
```apex
Opportunity o = new Opportunity();
// specify other fields
o.Amount = 500;
Database.insert(o, AccessLevel.USER_MODE);
```

#### Update Records in User Mode

To update Records in User mode:

```apex
Account a = [SELECT Id, Name, Website FROM Account WHERE Id = :recordId];
// specify other fields
a.Website = 'https://example.com';
update as user a;
```

#### SOSL in User Mode

To execute SOSL in User mode:

```apex
String queryString = 'FIND :searchString IN ALL FIELDS RETURNING ';
queryString += 'Lead(Id, Salutation, FirstName, LastName, Name, Email, Company, Phone),';
queryString += 'Contact(Id, Salutation, FirstName, LastName, Name, Email, Phone),';
queryString += 'Account(Id, Name, Phone)';
List<List<SObject>> searchResults = Search.query(queryString, AccessLevel.USER_MODE);
```

✅ **Best Practice:** User mode operation is the **recommended way** to avoid sharing, CRUD and FLS violations.

---

## Using WITH SECURITY_ENFORCED

You can integrate the `WITH SECURITY_ENFORCED` clause into your SOQL SELECT queries within Apex code to validate field- and object-level security permissions automatically. This functionality extends to subqueries and cross-object relationships, streamlining query operations and technical intricacies.

🎯 **Target Audience:** Created for Apex developers, especially those less experienced in security development, it's a valuable tool for applications where permission errors can be avoided.

### How to Use WITH SECURITY_ENFORCED

#### Strategic Placement

📍 **Clause Position Rules:**
- Insert the clause **after the WHERE clause** (if present) or **after the FROM clause** if no WHERE clause exists
- Place it **before ORDER BY, LIMIT, OFFSET,** or aggregate function clauses

**Example:**
```apex
List<Account> act1 = [SELECT Id, (SELECT LastName FROM Contacts) 
                      FROM Account 
                      WHERE Name LIKE 'Acme' 
                      WITH SECURITY_ENFORCED];
```

This returns `Id` and `LastName` for the Acme account entry if the user has field access for `LastName`.

### Limitations and Requirements

#### Polymorphic Lookup Fields
⚠️ **Limitation:** Traversal of a polymorphic field's relationship is **not supported**, except for:
- `Owner`
- `CreatedBy` 
- `LastModifiedBy` fields

#### Avoid TYPEOF Expressions
🚫 **Not Supported:** TYPEOF expressions with an ELSE clause in queries with `WITH SECURITY_ENFORCED`

#### API Version Requirement  
📋 **AppExchange Security Review:** Use API version 48.0 or later when implementing `WITH SECURITY_ENFORCED`.

### Security Behavior

🛡️ **Exception Handling:** If referenced fields or objects are inaccessible to the user, `WITH SECURITY_ENFORCED` throws a `System.QueryException`, ensuring data security.

---

## Using CRUD/FLS Check Methods

You can also enforce object-level and field-level permissions in your code by explicitly calling the sObject describe result methods (of `Schema.DescribeSObjectResult`) and the field describe result methods (of `Schema.DescribeFieldResult`) that check the current user's access permission levels. In this way, you can verify if the current user has the necessary permission and only if they do, can you perform a specific DML operation or query.

### Available Check Methods

**Object-level methods** (`Schema.DescribeSObjectResult`):
- `isAccessible()` - Verify read access to an sObject
- `isCreateable()` - Verify create access to an sObject  
- `isUpdateable()` - Verify update access to an sObject
- `isDeletable()` - Verify delete access to an sObject

**Field-level methods** (`Schema.DescribeFieldResult`):
- `isAccessible()` - Verify read access for a field
- `isCreateable()` - Verify create access for a field
- `isUpdateable()` - Verify update access for a field

### Security Risk

⚠️ **Important:** Depending on how your custom applications render and process data, unauthorized users can access and modify data that they shouldn't if the code is running in a System context. Luckily, the platform makes it easy to prevent unauthorized access.

### CRUD/FLS Helper Functions

Let's walk through the `DescribeSObjectResult` class helper functions that you can use to verify a user's level of access:
#### isCreateable()

Before your code inserts a record in the database, you have to check that the logged-in user has both **Edit permission on the field** and **Create permission on the object**. You can check both permissions by using the `isCreateable()` method on the particular object.

**Example Scenario:** The user needs to create an opportunity with $500 in the Amount field. To ensure that the user calling the function has the authorization to create opportunities and opportunity amounts, your Apex code should perform a check to see if the user has the create permission on `Opportunity.Amount`.

```apex
if (!Schema.sObjectType.Opportunity.isCreateable() || 
    !Schema.sObjectType.Opportunity.fields.Amount.isCreateable()) {
    ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR,
        'Error: Insufficient Access'));
    return null;
}
Opportunity o = new Opportunity();
o.Amount = 500;
Database.insert(o);
```
#### isAccessible()

Before your code retrieves a field from an object, you want to verify that the logged-in user has permission to access the field by using the `isAccessible()` method on the particular object.

**Example Scenario:** The user wants to access the Expected Revenue field in an opportunity. Your Apex code should check if the user has read permission on `Opportunity.ExpectedRevenue`.

```apex
// Check if the user has read access on the Opportunity.ExpectedRevenue field
if (!Schema.sObjectType.Opportunity.isAccessible() || 
    !Schema.sObjectType.Opportunity.fields.ExpectedRevenue.isAccessible()) {
    ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR,
        'Error: Insufficient Access'));
    return null;
}
List<Opportunity> myList = [SELECT ExpectedRevenue FROM Opportunity LIMIT 1000];
```
#### isUpdateable()

Similarly, before your code updates a record, you have to check if the logged-in user has **Edit permission for the field and the object**. You can check for both permissions by using the `isUpdateable()` method on the particular object.

**Example Scenario:** The user wants to update an opportunity to mark the stage as Closed Won. Your Apex code should then check if the user has the update permission on `Opportunity.StageName`.

```apex
// Let's assume we have fetched opportunity "o" from a SOQL query
if (!Schema.sObjectType.Opportunity.isUpdateable() || 
    !Schema.sObjectType.Opportunity.fields.StageName.isUpdateable()) {
    ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR,
        'Error: Insufficient Access'));
    return null;
}
o.StageName = 'Closed Won';
update o;
```
#### isDeleteable()

Lastly, to enforce "delete" access restrictions, use the `isDeleteable()` function before your code performs a delete database operation.

**Example:**
```apex
if (Lead.sObjectType.getDescribe().isDeleteable()) {
    delete l;
} else {
    // Handle insufficient permissions
    ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR,
        'Error: Insufficient Delete Access'));
    return null;
}
```

🔍 **Important Difference:** Notice that unlike update, create, and access, with delete we explicitly perform **only a CRUD check**, verifying that the user can delete the object. Since you delete entire records in SOQL and don't delete fields, you need to check only the user's CRUD access to the object.

---

## Using stripInaccessible()

You use the `stripInaccessible()` method to enforce field- and object-level data protection. This method can be used to strip the fields and relationship fields from query and subquery results that the user can't access. The method can also be used to remove inaccessible sObject fields before DML operations to avoid exceptions and to sanitize sObjects that have been deserialized from an untrusted source.

### How stripInaccessible() Works

You access field- and object-level data protection through the `Security` and `SObjectAccessDecision` classes. The access check is based on the field-level permission of the current user in the context of the specified operation: **create, read, update, or delete**.

#### Functionality:

1. **Field Security Checks:** The `stripInaccessible` method checks the source records for fields that don't meet field-level security checks for the current user

2. **Relationship Field Checks:** The method also checks the source records for look-up or master-detail relationship fields to which the current user doesn't have access

3. **Return List Creation:** The method creates a return list of sObjects that is identical to the source records, except that the fields that are inaccessible to the current user are removed

4. **Preserved Order:** The sObjects returned by the `getRecords()` method contain records in the same order as the sObjects in the `sourceRecords` parameter of the `stripInaccessible` method

5. **Null Handling:** Fields that aren't queried are null in the return list, without causing an exception

### Important Considerations

📋 **Note:** The **ID field is never stripped** by the `stripInaccessible()` method to avoid issues when performing DML on the result.

### Detecting Removed Fields

To identify inaccessible fields that were removed, you can use the `isSet` method. 

**Example:** The return list contains the Contact object and the custom field `social_security_number__c` is inaccessible to the user. Because this custom field fails the field-level access check, the field is not set and `isSet` returns false.

```apex
SObjectAccessDecision securityDecision = Security.stripInaccessible(AccessType.READABLE, sourceRecords);
Contact c = securityDecision.getRecords()[0];
System.debug(c.isSet('social_security_number__c')); // prints "false"
```

### Limitations

⚠️ **Note:** The `stripInaccessible` method doesn't support `AggregateResult` SObject. If the source records are of `AggregateResult` SObject type, an exception is thrown.

---

## Conclusion

Now that you understand how to:
- ✅ Run Apex in user mode
- ✅ Enforce sharing rules  
- ✅ Protect against CRUD and FLS violations

You can secure your Apex code effectively. The next step is to learn how to protect against injection vulnerabilities to create a comprehensive security strategy.