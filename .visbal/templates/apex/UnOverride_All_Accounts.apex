system.debug('START:');

Set<String> accountIds = new Set<String>{'0017i00001KvCWEAA3', '0017i00001KvCWFAA3', '0017i00001KvCWGAA3', '0017i00001KvCWHAA3', '0017i00001KvCWCAA3', '0017i00001KvCW9AAN', '0017i00001KvCWAAA3','0017i00001KvCWDAA3', '0017i00001KvCWCAA3' };

List<Account> accts = [SELECT Id, Name, Description, ParentId
        ,TracHier__Excluded_From_Account_Hierarchies__c
        ,TracHier__Parent_Company__c
        ,DNBoptimizer__DNB_D_U_N_S_Number__c
        ,TracHier__Primary_Master_Account__c
        , TracHIer__Hierarchy_Id__c
        ,TracHier__DUNS_Global_Ultimate_Parent__c
        ,LastModifiedDate
        , LastModifiedBy.Name
        ,BillingStreet
FROM Account
WHERE Id IN:accountIds
ORDER BY LastModifiedDate desc
LIMIT 2000];
//WHERE TracHIer__Hierarchy_Id__c != null
//WHERE TracHier__Excluded_From_Account_Hierarchies__c = true
system.debug('accts.size():'+accts.size());
for(Account a : accts ){
    a.TracHier__Excluded_From_Account_Hierarchies__c = false;
    a.TracHier__Parent_Company__c = null;
    a.ParentId = null;
    a.TracHIer__Hierarchy_Id__c = null;
    a.TracHier__Primary_Master_Account__c = null;
    a.TracHier__DUNS_Global_Ultimate_Parent__c = null;
}
HierarchyLinkerTriggerHelper.disable = true;
update accts;
HierarchyLinkerTriggerHelper.disable = false;
system.debug('UPDATE.accts.size():'+accts.size());
