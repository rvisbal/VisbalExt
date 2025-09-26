## CRUD and FLS Enforcement

### Overview
Object (CRUD) and Field Level Security (FLS) are configured on profiles and permission sets to restrict access to standard and custom objects and individual fields. Applications must enforce these settings and gracefully degrade when user access is restricted.

### Implementation Requirements
- All Apex classes must enforce CRUD and FLS checks before performing operations
- Use `isAccessible()`, `isCreateable()`, `isUpdateable()`, and `isDeletable()` methods appropriately
- Implement proper error handling for access violations

### Acceptable Bypass Cases
1. Creating roll-up summaries or aggregates that don't directly expose data
2. Modifying custom objects/fields like logs or system metadata
3. Cases where direct access creates a less secure security model


### Custom Settings Objects

Custom Settings are exempt from CRUD/FLS enforcement as they are application-controlled configuration objects.

#### Hierarchy Type Custom Settings:
- **`Hierarchy_Settings__c`** - Global settings for Traction Hierarchies
- **`Feature_Management_Overrides__c`** - Manually override feature management settings
- **`Hierarchy_Display_Fields__c`** - Account fields to be shown in the Traction Hierarchies UI
- **`Hierarchy_Whitespace_Fields__c`** - Datacloud D&B Company fields to be shown in the Traction Hierarchies Whitespace interface

#### List Type Custom Settings:
- **`User_Usage_Metrics__c`** - Usage metrics collected by Traction Hierarchies per user
- **`Usage_Metrics__c`** - Usage metrics collected by Traction Hierarchies
- **`Excluded_Domain__c`** - Excluded Email Domains
- **`Child_Object_Display_Settings__c`** - Custom setting to store settings for child object display in Hierarchies
- **`Create_Record_Fields__c`** - Create Record Fields
- **`Child_Hierarchy__c`** - Holds data related to child hierarchies
- **`Hierarchy_Child_Object__c`** - Junction custom setting between Hierarchy and Child Object Display
- **`Hierarchy__c`** - Holds hierarchy definitions (defined by admin)
- **`Hierarchy_Per_Profile_Object__c`** - Junction custom setting between Hierarchy and Hierarchy Setting
- **`Hierarchy_Rollup__c`** - Junction custom setting between Hierarchy and Rollup
- **`Hierarchy_Grouping__c`** - Holds hierarchy grouping fields (defined by admin)
- **`Filter__c`** - Filter
- **`FilterSet__c`** - FilterSet

### Code Annotations for Custom Settings

When working with custom settings, use the following annotations:

**For DML operations on custom settings:**
```apex
// DML & FLS Security EXCEPTION: This DML is for a protected custom setting, 
// which is only accessible through our app and not visible to end users 
// except through app functionality.
```

**For scanner violations (ApexCRUDViolation):**
```apex
// sf-scanner-ignore ApexCRUDViolation Security Note: This query calls a custom setting object
```

### Salesforce System Objects

These system objects are managed by Salesforce and don't require CRUD/FLS checks as they operate at the system level:

- **`AsyncApexJob`** - Represents asynchronous Apex jobs (batch, future, queueable)
- **`CronTrigger`** - Represents scheduled Apex jobs and their execution state
- **`ApexClass`** - Represents Apex classes in the organization
- **`ApexTrigger`** - Represents Apex triggers in the organization
- **`User`** - User records (system-managed permissions)
- **`Profile`** - User profiles (system-managed)
- **`PermissionSet`** - Permission sets (system-managed)
- **`PermissionSetAssignment`** - Permission set assignments (system-managed)
- **`Organization`** - Organization-level settings
- **`SetupEntityAccess`** - Setup entity access permissions
- **`ObjectPermissions`** - Object-level permissions
- **`FieldPermissions`** - Field-level permissions
- **`ApexLog`** - Debug logs
- **`EmailMessage`** - Email messages (when used for system notifications)

**For scanner violations (ApexCRUDViolation) on system objects:**
```apex
// sf-scanner-ignore ApexCRUDViolation Security Note: [Object Name] is a system object and is always accessible in Apex code regardless of sharing context
```

if a Custom Object we need to  
```apex
    // Verify CRUD permissions for Account object and fields
    if (!PermissionService.canReadRecords('Account', new List<String>{'Id', 'Name', lookupField})) {
        System.debug(LoggingLevel.ERROR, 'HierarchyLinkerQueueable: User does not have read access to Account object');
        return; // Exit gracefully if no access
    }
 ```       
and the Query we need to add : WITH USER_MODE or SYSTEM_MODE