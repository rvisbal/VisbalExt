
List<TracHier__Master_Account__c> sampleMasterAccounts = [SELECT Id FROM TracHier__Master_Account__c LIMIT 10000 ];//WHERE CreatedDate = TODAY];
System.debug('sampleMasterAccounts.size():'+ sampleMasterAccounts.size());
delete sampleMasterAccounts;

Integer recordCount = [SELECT COUNT() FROM TracHier__Master_Account__c WHERE IsDeleted=false];
System.debug('recordCount:'+ recordCount);
//List<TracHier__Master_Account_Member__c> sampleMembers = [SELECT Id FROM TracHier__Master_Account_Member__c ];
//WHERE CreatedDate = TODAY];
//System.debug('sampleMembers.size():'+ sampleMembers.size());
//delete sampleMembers;


//Id jobId = System.enqueueJob(new TracHier.MasterAccountDeletion('TracHier__Hierarchy__c != NULL ','Master_Account_Member__c'));
//System.debug('jobId:'+ jobId);
