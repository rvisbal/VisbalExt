## Security

**Triggers**: Apex triggers run in system context, meaning they do not enforce sharing rules. Regardless of whether your trigger is in a class marked as with sharing or not, the trigger itself will have access to all fields and records in the object, bypassing the sharing rules. 
This means that the trigger will be able to modify the field even if it is set to read-only for the user.

**Batch Classes**: When you define a batch class with the with sharing keyword, it enforces sharing rules for the records that the batch processes. However, the execution of the batch class itself (the logic you write in the execute method) still runs in system context, which means it can modify fields regardless of the user's permissions.

**global** access modifier allows the class to be:
   - Used by other namespaces
   - Referenced in managed packages
   - Accessed by external applications
   - Used in Lightning components and flows
**with sharing** ensures that:
   - The class respects the organization's sharing rules
   - Users can only access records they have permission to see
   - Field-level security is enforced
   - The code follows security best practices"

**postinstall**
the PostInstall method in a managed package runs in system context. This means it has full access to all objects and fields, allowing it to modify data regardless of the user's permissions or sharing settings.

**on insert**
Api :
    HierarchyLinkerTriggerHelper.runAfterInsert
QueueableHandler 
    HierarchyLinkerTriggerHelper.UPDATE_MASTER_ACCOUNT -- ACCOUNT_UPDATE > Op:Update|Type:Account|Rows:1
    HierarchyLinkerTriggerHelper.MASTER_ACCOUNT_FOR_EACH_HIERARCHY -- ACCOUNT_UPDATE > Op:Update|Type:Account|Rows:1
