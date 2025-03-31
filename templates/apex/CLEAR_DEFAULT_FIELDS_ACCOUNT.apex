TracHier.HierarchyLinkerTriggerHelper.disable = true;
List<Account> sampleAccounts = [SELECT Id, TracHier__Hierarchy_ID__c
        , TracHier__Primary_Master_Account__c
        , TracHier__Last_Build_Hierarchy_Date__c
        , TracHier__Parent_Company__c
        , TracHier__DUNS_Global_Ultimate_Parent__c
        , Re_Run_Traction_Hierarchies__c
        , Excluded_From_Account_Hierarchies__c
        , Test_List_Hierarchy_ID__c, Test_CC_Lookup_Group_1__c
FROM Account
WHERE TracHier__Hierarchy_ID__c != null
        OR TracHier__Primary_Master_Account__c != null
        OR TracHier__Last_Build_Hierarchy_Date__c != null
        OR TracHier__DUNS_Global_Ultimate_Parent__c != null
        OR TracHier__Parent_Company__c != null
        OR Test_List_Hierarchy_ID__c != null
        OR Test_CC_Lookup_Group_1__c != null

LIMIT 1000];
for (Account a :sampleAccounts) {
    a.TracHier__Hierarchy_ID__c = null;
    a.TracHier__Primary_Master_Account__c = null;
    a.TracHier__Last_Build_Hierarchy_Date__c = null;
    a.TracHier__DUNS_Global_Ultimate_Parent__c = null;
    a.Re_Run_Traction_Hierarchies__c = false;
    a.Test_List_Hierarchy_ID__c = null;
    a.Test_CC_Lookup_Group_1__c = null;
    if (a.Excluded_From_Account_Hierarchies__c == false) {
        a.TracHier__Parent_Company__c = null;
    }
}
System.debug('APEX.Accounts:'+sampleAccounts.size());
update sampleAccounts;
TracHier.HierarchyLinkerTriggerHelper.disable = false;



