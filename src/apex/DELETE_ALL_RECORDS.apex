
List<TracHier__Master_Account__c> sampleMasterAccounts = [SELECT Id FROM TracHier__Master_Account__c LIMIT 10000 ];//WHERE CreatedDate = TODAY];
System.debug('sampleMasterAccounts.size():'+ sampleMasterAccounts.size());
delete sampleMasterAccounts;

Integer recordCount = [SELECT COUNT() FROM TracHier__Master_Account__c WHERE IsDeleted=false];
System.debug('CC recordCount:'+ recordCount);



List<Case> sampleCase = [SELECT Id FROM Case  ];//WHERE CreatedDate = TODAY];
System.debug('sampleCase.size():'+ sampleCase.size());
delete sampleCase;

recordCount = [SELECT COUNT() FROM Case WHERE IsDeleted=false];
System.debug('Case recordCount:'+ recordCount);


List<Opportunity> sampleOpportunity = [SELECT Id FROM Opportunity  ];//WHERE CreatedDate = TODAY];
System.debug('sampleOpportunity.size():'+ sampleOpportunity.size());
delete sampleOpportunity;

recordCount = [SELECT COUNT() FROM Opportunity WHERE IsDeleted=false];
System.debug('Opportunity recordCount:'+ recordCount);



List<Entitlement> sampleEntitlement = [SELECT Id FROM Entitlement  ];//WHERE CreatedDate = TODAY];
System.debug('sampleEntitlement.size():'+ sampleEntitlement.size());
delete sampleEntitlement;

recordCount = [SELECT COUNT() FROM Entitlement WHERE IsDeleted=false];
System.debug('Entitlement recordCount:'+ recordCount);



List<Account> sampleAccount = [SELECT Id FROM Account LIMIT 1000 ];//WHERE CreatedDate = TODAY];
System.debug('sampleAccount.size():'+ sampleAccount.size());
delete sampleAccount;

recordCount = [SELECT COUNT() FROM Account WHERE IsDeleted=false];
System.debug('Account recordCount:'+ recordCount);



List<TracHier__History_Log__c> sampleLogs = [SELECT Id FROM TracHier__History_Log__c  ];//WHERE CreatedDate = TODAY];
System.debug('sampleLogs.size():'+ sampleLogs.size());
delete sampleLogs;

recordCount = [SELECT COUNT() FROM TracHier__History_Log__c WHERE IsDeleted=false];
System.debug('TracHier__History_Log__c recordCount:'+ recordCount);
