# Salesforce Sharing: Objects and Fields

## Field Permissions

**Field permissions**, or field-level security, lets you specify whether users can view or edit each field for an object.

**Availability:**
- **Interfaces:** Both Salesforce Classic (not available in all orgs) and Lightning Experience
- **Editions:** Professional, Enterprise, Performance, Unlimited, Developer, and Database.com Editions

### Overview

Your Salesforce org contains lots of data, but you probably don't want every field accessible to everyone. For example, your payroll manager probably wants to keep salary fields accessible only to select employees. By setting field permissions, you can restrict user access in:

- **Detail and edit pages**
- **Related lists** 
- **List views**
- **Reports**
- **Connect Offline**
- **Email and mail merge templates**
- **Custom links**
- **Experience Cloud sites and portals**
- **Synchronized data**
- **Imported data**
- **Salesforce APIs**

💡 **Best Practice:** We recommend that you use permission sets and permission set groups to manage your users' permissions. Because you can reuse smaller permission set building blocks, you can avoid creating dozens or even hundreds of profiles for each user and job function.

### Permission Settings Interface Differences

In permission sets and the enhanced profile user interface, the setting labels differ from those in the original profile user interface and in field-level security pages for customizing fields.

| Access Level | Enhanced UI Settings | Original UI Settings |
|--------------|---------------------|---------------------|
| Users can read and edit the field | **Read and Edit** | **Visible** |
| Users can read but not edit the field | **Read** | **Visible and Read-Only** |
| Users can't read or edit the field | **None** | **None** |

### Advanced Field Access Customization

To further customize field access, you can:

1. **Organize fields with page layouts** - Create page layouts to organize fields on detail and edit pages. Page layouts and field-level security settings together determine which fields a user sees. The most restrictive field access settings of the two always applies. 
   
   📝 **Example:** You can have a field that's required in a page layout but is read-only in the field-level security settings. The field-level security overrides the page layout, so the field remains read-only.

2. **Streamline maintenance** - Use field-level security to restrict users' access to fields, and then use page layouts to organize detail and edit pages within tabs. This approach reduces the number of page layouts for you to maintain.

3. **Customize search layouts** - Set the fields that appear in search results, in lookup dialog search results, and in the key lists on tab home pages. To hide a field that's not protected by field-level security, omit it from the layout.

### Important Considerations

⚠️ **Note:** 
- **Roll-up summary and formula fields** are read-only on detail pages and not available on edit pages. They can also be visible to users even though they reference fields that your users can't see
- **Einstein Insights** can also be visible to the user even though the insight references fields that your users can't see
- **Universally required fields** appear on edit pages regardless of field-level security
- **The relationship group wizard** allows you to create and edit relationship groups regardless of field-level security

### Field Permission Management Options

#### Set Field Permissions in Permission Sets and Profiles
Field permissions specify the access level for each field in an object.

#### Set Field-Level Security for a Field on All Permission Sets  
Set field-level security for a field on permission sets. This option is an alternative to setting field-level security for a field on profiles.

#### Classic Encryption for Custom Fields
🔒 **Security Feature:** Restrict other Salesforce users from seeing custom text fields that you want to keep private. Only users with the **View Encrypted Data** permission can see data in encrypted custom text fields.



## Organization-Wide Sharing Defaults

Define the default access that users have to records they don't own with organization-wide sharing settings. Organization-wide sharing settings can be set separately for custom objects and many standard objects. You can set different levels of access for internal and external users.

### Key Features:
- **Granular control** - Set different access levels for custom objects and standard objects
- **User type flexibility** - Configure different access levels for internal and external users
- **Foundation for security** - Forms the baseline security model for your org

---

## Sharing Rules

Use sharing rules to extend sharing access to users in public groups, roles, or territories. Sharing rules give particular users greater access by making automatic exceptions to your org-wide sharing settings.

**Availability:**
- **Interfaces:** Both Salesforce Classic (not available in all orgs) and Lightning Experience  
- **Editions:** Professional, Enterprise, Performance, Unlimited, and Developer Editions

📋 **Note:** See Sharing Rule Considerations for more information on availability.

### Important Principle

🔐 **Security Rule:** Like role hierarchies, a sharing rule can **never be stricter** than your org-wide default settings. It simply allows greater access for particular users.

### How Sharing Rules Work

You can base a sharing rule on **record ownership** or **other criteria**. After you select which records to share, you define which groups or users to extend access to and what level of access they have.

#### Practical Examples:

📈 **Marketing & Sales Collaboration:** Create a sharing rule that grants read-only access to all leads owned by users in the Marketing Team role with users in the Sales Rep role for easier collaboration.

🚨 **Urgent Case Management:** Create a rule that grants read and write access to any cases labeled as "Urgent" with a public group that contains users with specialized knowledge.

### Object Support & Flexibility

You can create sharing rules for **custom objects** and many **standard objects**, with different types of sharing rules depending on the object. 

**Example - Account Sharing Rules:**
- Based on the account owner 
- Based on other criteria (account record types, field values)
- Set access levels for accounts and their associated:
  - Contracts
  - Opportunities  
  - Cases
  - Contacts (optional)
  - Orders (optional)

### Limits & Availability

📊 **Rule Limits:** You can define up to **300 total sharing rules** for each object, including up to **50 criteria-based or guest user sharing rules** (if available for the object).

💡 **Tip:** The objects available for sharing rules depend on which Salesforce editions and features you have. Check the **Sharing Settings Setup page** to see available objects.

### Sharing Rule Types

#### 1. Owner-Based Sharing Rules
An owner-based sharing rule opens access to records owned by certain users.

#### 2. Criteria-Based Sharing Rules  
A criteria-based sharing rule determines who to share records with based on field values.

#### 3. Guest User Sharing Rules
A guest user sharing rule is a special type of criteria-based sharing rule and the **only way** to grant record access to unauthenticated guest users. Guest user sharing rules can only grant **Read Only** access.

### Management Operations

#### Sharing Rule Categories
When you define a sharing rule, you can choose from various categories in the "owned by members of" and "Share with" dropdown lists. Available categories depend on the type of sharing rule and the features enabled for your organization.

#### Edit Sharing Rules
- **Owner/group-based rules:** You can edit only the sharing access settings
- **Criteria-based rules:** You can edit both the criteria and sharing access settings

#### Sharing Rule Considerations  
📋 Review these considerations before using sharing rules.

#### Recalculate Sharing Rules Manually
When you make changes to sharing settings, groups, roles, and territories, sharing rules are reevaluated to add or remove access as necessary. You can manually recalculate sharing rules if sharing rule updates have failed or aren't working as expected.

#### Automatic Recalculation of Org-Wide Defaults and Sharing Rules
⚙️ **System Process:** When you update organization-wide defaults or sharing rules, automatic sharing recalculation is processed **asynchronously and in parallel**.


---

## User Sharing and Visibility

**User Sharing** enables you to show or hide an internal or external user from another user in your organization.

**Availability:**
- **Interfaces:** Both Salesforce Classic (not available in all orgs) and Lightning Experience
- **Editions:** Enterprise, Performance, Unlimited, and Developer Editions

### User Sharing Capabilities

With User Sharing, you can:

1. **Assign "View All Users" permission** - Grant to users who need to see or interact with all users
   - 🔄 This permission is automatically enabled for users who have the "Manage Users" permission

2. **Set organization-wide defaults** - Configure user records to Private or Public Read Only

3. **Create user sharing rules** - Based on group membership or other criteria

4. **Create manual shares** - Open up access to individual users or groups for specific user records

5. **Control external user visibility** - Manage how external users appear to internal users

6. **Manage personal information visibility** - Control personal user information visibility for external users

### Implementation Guidelines

#### User Sharing Considerations
📋 Review these considerations before you implement user sharing.

#### Set the Org-Wide Sharing Defaults for User Records  
⚙️ **Setup Step:** Set the org-wide sharing defaults for the user object before opening up access.


---

## Public and Personal Groups

A **group** consists of a set of users. A group can contain individual users, other groups, or the users in a particular role or territory. It can also contain the users in a particular role or territory plus all the users below that role or territory in the hierarchy.

**Availability:**
- **Interfaces:** Both Salesforce Classic (not available in all orgs) and Lightning Experience
- **Editions:** Professional, Enterprise, Performance, Unlimited, Developer, and Database.com Editions

### Group Types

#### 1. Public Groups

**Who can create:** Administrators and delegated administrators

**Purpose:** Use public groups to streamline sharing records with users in different parts of your company that aren't aligned with a single role.

**Example Use Case:** 
You want to share the same opportunity records with Sales Reps in different regions, each represented by a separate role, plus a few individual users. Instead of creating separate sharing rules, create one public group with all these roles and individual users.

**Public Group Uses:**
- ✅ Set up default sharing access via sharing rules
- ✅ Manually share records with other users  
- ✅ Give access to report and dashboard folders
- ✅ Share list views
- ✅ Add multiple users to Salesforce CRM Content libraries
- ✅ Assign users to specific actions in Salesforce Knowledge

#### 2. Personal Groups

**Who can create:** Each individual user

**Purpose:** Users create groups for their personal use in manual shares, unlike public groups, which require setup from users with the appropriate permissions.

**Example Use Case:** A user can create a personal group to share records with a subgroup of their team that's tasked with a specific project.

📋 **Note:** Personal groups are available **only in Salesforce Classic**.

### External User Integration

You can include **external Experience Cloud site users** in your public groups. 

**Example Scenario:** You need to share certain records with partner users associated with different accounts. Create a public group with all needed partner users, then create a single sharing rule targeting this public group. This eliminates the need for multiple sharing rules targeting individual partner user roles.

### Related Concepts

💡 **Tip:** **Permission set groups** consist of permission sets rather than users. Permission set groups bundle permission sets based on job functions or tasks. To learn more about permission set groups and why you use them, see [Permission Set Groups](https://help.salesforce.com).

### Group Management

#### Create and Edit Public Groups
Create public groups to help configure your users' access to records and other features. **Only administrators and delegated administrators** can create and edit public groups.

#### Group Member Types  
Many types of groups are available for various internal and external users.


---

## Manual Sharing

**Manual sharing** allows users to share individual records with other users, public groups, and roles.

**Availability:**
- **Interfaces:** Both Salesforce Classic and Lightning Experience
- **Editions:** Professional, Enterprise, Performance, Unlimited, and Developer Editions

### Purpose & Use Cases

Manual shares are used for **one-off access exceptions**, when sharing rules or other features can't be used to grant the intended access.

**Example Scenarios:**
- 🤝 **Single Opportunity Collaboration:** Share a specific opportunity with a coworker without sharing other opportunities owned by you or your role
- 🏖️ **Coverage During Absence:** Share records for special projects or coverage while coworkers are away

### Record Relationship Considerations

⚠️ **Important:** Sometimes, granting access to one record includes access to all its associated records. 

**Example:** If you grant another user access to an account, the user automatically has access to all the opportunities and cases associated with that account.

### Who Can Create Manual Shares

To grant access to a record using manual sharing, you must be one of the following users:

1. **The record owner**
2. **A user in a role above the owner** in the hierarchy (if your organization's sharing settings control access through hierarchies)
3. **A user with the Modify All Records permission** for the object
4. **A Salesforce admin**

### Complex Sharing Scenarios

#### Opportunity, Contact, or Case Sharing

📋 **Requirements:** 
- Users you share with must have at least **Read access** to the associated parent account via sharing features OR
- You must have the ability to also share the account

**You can share the account if you are:**
- The account owner
- A Salesforce admin  
- Above the account owner in the role hierarchy
- Have the Modify All Records permission on accounts

✅ **Automatic Access:** If you have the ability to share the account itself, users you share the opportunity, contact, or case with are automatically given Read access to the parent account.

#### Account Sharing Limitations

When sharing an account, the access level for its child opportunities, cases, and contacts **cannot be greater** than the account owner's default access from organization-wide defaults and the owner's role.

**Exceptions:** You can only grant a greater level of access if you're:
- A Salesforce admin
- Have the Modify All Records permission on Account  
- Have the Modify All Data user permission

### Deletion of Manual Shares

🚨 **Important:** If a user transfers ownership of a record, Salesforce deletes any manual shares created by the original record owner, which can cause users to lose access.

#### Automatic Deletion Scenarios:

1. **Account ownership transfer:** Manual shares created by the original account owner on child opportunity, case, and contact records are also deleted

2. **Parent account changes for opportunities/cases:** Manual shares are deleted if the user making the change isn't allowed to share the new parent account
   - **Exceptions:** Manual shares aren't deleted when:
     - New parent account owner makes the change
     - Someone above them in role hierarchy makes the change  
     - A Salesforce admin makes the change
     - The recipient already has access to the parent account

3. **Portal/community user parent account changes:** Manual shares for custom object records shared with the portal or community user are deleted

4. **Closed opportunity with account ownership change:** Manual shares for the opportunity are deleted even when opportunity splits are enabled

### Implementation Methods

#### Grant Access in Lightning Experience
Give specific users access to an individual record with manual sharing.

#### Grant Access in Salesforce Classic  
Use manual sharing to give specific other users access to an individual record.

### Manual Sharing Considerations
📋 When you grant access to records with manual sharing, there are some considerations to keep in mind.
