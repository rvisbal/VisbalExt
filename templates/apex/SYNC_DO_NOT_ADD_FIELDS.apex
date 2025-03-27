HierarchyAPI.setTriggerDisabled();

Boolean customDnB = true;
String ACCOUNT_DNB_RECORD_ID_FIELD = 'DNBoptimizer__DnBCompanyRecord__c';
String ACCOUNT_DNB_DUNS_FIELD = 'DNBoptimizer__DNB_D_U_N_S_Number__c';
String DNB_DUNS_FIELD = 'DNBoptimizer__DUNSNumber__c';

List<Account> accounts = [SELECT Id, Name, ParentId
        , DNBoptimizer__DNB_D_U_N_S_Number__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__DUNSNumber__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__ParentDUNSNumber__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__ParentBusinessName__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__GlobalUltimateDUNSNumber__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__GlobalUltimateBusinessName__c
        , DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__LocationType__c
FROM Account WHERE DNBoptimizer__DNB_D_U_N_S_Number__c != null];


Database.DMLOptions dmlOptions = new Database.DMLOptions();
dmlOptions.duplicateRuleHeader.allowSave = true;

Map<String, SObject > accountDnbMap = new Map<String, SObject>();
List<SObject> connectRecords = new List<SObject>();
if (HierarchyMetadataUtils.getHasConnect()) {
    for (Account a : accounts) {
        SObject connectRecord = (SObject) Type.forName('DNBConnect__D_B_Connect_Company_Profile__c').newInstance();
        connectRecord.put('Name', a.Name);
        connectRecord.put('DNBConnect__DUNSNumber__c', a.DNBoptimizer__DNB_D_U_N_S_Number__c);
        accountDnbMap.put(a.Id, connectRecord);
    }
}
List<Database.SaveResult> connectInsertResult = Database.insert(accountDnbMap.values(), dmlOptions);

Map<String, String > parentMap = new Map<String, String>();
for (Account a : accounts) {
    a.put('trachier__test_dunsnumber__c', a.DNBoptimizer__DNB_D_U_N_S_Number__c);
    a.put('trachier__test_parent_duns__c', a.DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__ParentDUNSNumber__c);
    a.put('trachier__test_parent_primname__c', a.DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__ParentBusinessName__c);
    a.put('TracHier__test_gu_duns__c', a.DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__GlobalUltimateDUNSNumber__c);
    a.put('TracHier__test_gu_primname__c', a.DNBoptimizer__DnBCompanyRecord__r.DNBoptimizer__GlobalUltimateBusinessName__c);
    if (String.isNotBlank(a.trachier__test_dunsnumber__c)) {
        parentMap.put(a.trachier__test_dunsnumber__c, a.Id);
    }
    
    if (accountDnbMap.containsKey(a.Id)) {
        a.put('DNBConnect__D_B_Connect_Company_Profile__c', accountDnbMap.get(a.Id).Id);
    }
}
for (Account a : accounts) {
    if (String.isNotBlank(a.ParentId) && parentMap.containsKey(a.trachier__test_parent_duns__c)) {
        a.ParentId = parentMap.get(a.trachier__test_parent_duns__c);
    }
}

update accounts;

HierarchyAPI.setTriggerEnabled();