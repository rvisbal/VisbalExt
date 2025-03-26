String defaultHierarchy = 'ea467eea2f1e81234050'; //DEFAULT SALES to Market
String dataComHierarchy = 'f0dc7c3fa2eb105f5bbd'; //data.com
String optimizerHierarchy = 'f0dc7c3fa2eb105f5xxx'; //Optimizer
String nativeHierarchy = 'p4d7m9xkckqphlx2gyoq';//'90d230ce2cb04cd62132'; 
String currentHierarchy = '7a84362a1b250a8915b2';//nativeHierarchy;//optimizerHierarchy;//defaultHierarchy;

System.debug('APEX.RUN:'+ DateTime.now());

List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.h.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c );
    //
}


///RUN THE BATCH

//Accounts With Hierarchy Data
//TracHier.HierarchyLinkerBatch.runSelected('', null, new List<String>{ currentHierarchy });

//All Accounts
TracHier.HierarchyLinkerBatch.runSelected('All Accounts', null, new List<String>{ currentHierarchy }, 200);


//HierarchyLinkerBatch.linkAccounts.DEFAULT:f0dc7c3fa2eb105f5xxx
//HierarchyLinkerBatch.linkAccounts.NON_DEFAULT:f0dc7c3fa2eb105f5bbd
//HierarchyLinkerBatch.linkAccounts.NON_DEFAULT:f0dc7c3fa2eb105f5xxx