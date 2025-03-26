List<Account> accounts = new List<Account>();
accounts.add(new Account(Id='001Sv000005LpsxIAC', TracHier__Re_Run_Traction_Hierarchies__c=true));
accounts.add(new Account(Id='001Sv000005LpswIAC', TracHier__Re_Run_Traction_Hierarchies__c=true));
accounts.add(new Account(Id='001Sv000005LtqpIAC', TracHier__Re_Run_Traction_Hierarchies__c=true));
//update accounts;


String ExcludeNewRoot = 'Waka Co 5';
String ExcludedNewRoot2 = 'Waka Co 4';
String child = 'Waka Co 2';
String OriginalRoot = 'Waka Root';
List<String> sampleNames = new List<String> { ExcludeNewRoot, ExcludedNewRoot2, OriginalRoot, child};
List<Account> sampleAccounts = [SELECT Id, Name, ParentId, test_dunsnumber__c, Do_Not_Use_test_parent_duns__c, Do_Not_Use_test_parent_primname__c, test_gu_duns__c, test_gu_primname__c FROM Account WHERE NAME IN:sampleNames];
Map<String, Account> accountMap = new Map<String, Account>();
for (Account a : sampleAccounts) {
    System.debug('a.Id:'+a.Id+ ' -- a.Name:'+a.Name+ ' -- a.DUNS:'+a.test_dunsnumber__c+ ' -- a.GU:'+a.test_gu_duns__c+ ' -- a.GU_NAME:'+a.test_gu_primname__c);

    a.put('TracHier__Re_Run_Traction_Hierarchies__c', true);
}


update sampleAccounts;