String hierarchyName = '0jc34cnf2mqzezvqvdgl';
String query = '';
List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.h.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c );
    if (h.Type__c == 'Custom') {
        hierarchyName = h.Name;
    }
}

Boolean createAccounts = true;
Boolean deleteAccounts = false;
Boolean runBatch = false;
Boolean changeHierarchyConfiguration = false;
Boolean reportResults = true;
System.debug('createAccounts:'+createAccounts + ' -- deleteAccounts:' + deleteAccounts + ' -- runBatch:' + runBatch);

TracHier.HierarchyFactory factoryInstance = TracHier.HierarchyMetadataUtils.getSpecificHierarchyFactory(hierarchyName);
System.debug('factoryInstance:'+factoryInstance.getHierarchyName()
        + ' -- IsDefault: ' + factoryInstance.IsDefault
        + ' -- EnforceKeyUniquenessWithUppercase: ' + factoryInstance.EnforceKeyUniquenessWithUppercase
        + ' -- KeepUniqueAccountsCompleteCompany: ' + factoryInstance.KeepUniqueAccountsCompleteCompany);

if (createAccounts) {

    List<Account> accounts = new List<Account>();
    Account account1 = new Account(
            Name = 'Disney Sample Inc',
            BillingCity = 'Orlando',
            Phone = '7783182280',
            Type = 'Customer',
            AnnualRevenue = 2500000
    );
    account1.put(factoryInstance.getDunsField(), '12345679A');

    Account account2 = new Account(
            Name = 'Disney Sample inc',
            BillingCity = 'Orlando',
            Phone = '7783182280',
            Type = 'Customer',
            AnnualRevenue = 2500000
    );
    account2.put(factoryInstance.getDunsField(), '12345679a');

    accounts.add(account1);
    accounts.add(account2);
    insert accounts;
    System.debug('accounts:'+accounts.size()+ ' : ' + accounts);
}
if (deleteAccounts) {
    query = 'SELECT ' + String.join(new List<String>(factoryInstance.getHierarchyFieldsForQuery()), ', ') + ' FROM Account WHERE Name LIKE ' + '\'%Disney Sample%\' ';
    //System.debug('APEX.testTerritoryTrigger.QUERY: ' + query);
    Map<Id, Account> accountsToDelete =  new Map<Id, Account>((List<Account>) Database.query(query));
    delete accountsToDelete.values();
    System.debug('accountsToDelete:'+accountsToDelete.size());

    List<TracHier__Master_Account__c> sampleMasterAccounts = [SELECT Id FROM TracHier__Master_Account__c LIMIT 10000 ];//WHERE CreatedDate = TODAY];
    System.debug('sampleMasterAccounts.size():'+ sampleMasterAccounts.size());
    delete sampleMasterAccounts;

    Integer recordCount = [SELECT COUNT() FROM TracHier__Master_Account__c WHERE IsDeleted=false];
    System.debug('recordCount:'+ recordCount);
}
if (runBatch) {
    String query = 'SELECT ' + String.join(new List<String>(factoryInstance.getHierarchyFieldsForQuery()), ', ') + ' FROM Account WHERE Name LIKE ' + '\'%Disney Sample%\' ';
    //System.debug('APEX.testTerritoryTrigger.QUERY: ' + query);
    Map<Id, Account> existingAccounts =  new Map<Id, Account>((List<Account>) Database.query(query));
    List<TracHier__Filter__c> optionalFilterList = new List<TracHier__Filter__c>();
    for (Account a : existingAccounts.values()) {
        TracHier__Filter__c f = new TracHier__Filter__c();
        f.Field__c = 'Id';
        f.Operator__c = 'EQUALS';
        f.Order_Number__c = 1;
        f.SObjectType__c = 'Account';
        f.Set_Number__c = 1;
        f.Value__c = a.Id;
        optionalFilterList.add(f);
    }
    System.debug('optionalFilterList:'+ optionalFilterList.size() + ' : '+ optionalFilterList);
    List<String> indexList = new List<String>();
    Integer indexCount = 1;
    for (TracHier__Filter__c f : optionalFilterList) {
        indexList.add(String.valueOf(indexCount));
        indexCount++;
    }
    String optionalFilterLogic = String.join(new List<String>(indexList), ' OR ');
    System.debug('optionalFilterLogic:'+ optionalFilterLogic);
    TracHier.HierarchyLinkerBatch.runSelectedWithFilters(optionalFilterList, optionalFilterLogic, null, new List<String>{factoryInstance.getHierarchyName()}, 200);
}
if (changeHierarchyConfiguration) {
    Boolean enableUniqueKey = true;
    TracHier__Hierarchy__c hierarchy = TracHier.HierarchyMetadataUtils.getCustomHierarchies().get(hierarchyName);
    //hierarchy.Master_Account_Creation__c = 'always';
    hierarchy.TracHier__Case_Sensitive__c = enableUniqueKey;
    hierarchy.TracHier__Enforce_Key_Uniqueness_With_Uppercase__c = enableUniqueKey;
    hierarchy.TracHier__Keep_Unique_Accounts_Complete_Company__c = false;
    update hierarchy;
}
if (reportResults) {
    Boolean showRecordsWithCompleteCompany = true;

    Map<String, List<String>> customMap = new Map<String, List<String>>();
    List<String> fieldList = TracHier.MasterAccountsSelector.getMasterAccountFieldList();
    query = 'SELECT ' + String.join(fieldList, ', ') + ' FROM TracHier__Master_Account__c';
    Map<Id, TracHier__Master_Account__c> masterAccountResults = new Map<Id, TracHier__Master_Account__c>((List<TracHier__Master_Account__c>) Database.query(query));
    for (TracHier__Master_Account__c ma : masterAccountResults.values()) {
        if (hierarchyName == ma.TracHier__Hierarchy__c ) {
            //TracHier.Logger.displaySetRecords(ma);
            System.debug('MASTER_ACCOUNT Id:' + ma.Id + ' -- Name:' + ma.Name + ' -- Hierarchy__c:' + ma.TracHier__Hierarchy__c + ' -- Master_Account_ID__c:' + ma.TracHier__Master_Account_ID__c + ' -- Global__c ' + ma.TracHier__Global__c);
        }

        if (!customMap.containsKey(ma.TracHier__Hierarchy__c)) {
            customMap.put(ma.TracHier__Hierarchy__c, new List<String>());
        }
        customMap.get(ma.TracHier__Hierarchy__c).add(ma.TracHier__Master_Account_ID__c);
    }

    for (String hierarchyKey : customMap.keySet()) {
        System.debug('APEX.testTerritoryTrigger.customMap.get(' + hierarchyKey + ').size(): ' + customMap.get(hierarchyKey).size() + ' values: ' + customMap.get(hierarchyKey));
    }


    fieldList = TracHier.MasterAccountsSelector.getMemberFieldList();
    //System.debug('fieldList:'+ fieldList);
    query = 'SELECT ' + String.join(fieldList, ', ') + ' FROM TracHier__Master_Account_Member__c';
    //System.debug('query:'+ query);
    Map<Id, TracHier__Master_Account_Member__c> memberResults = new Map<Id, TracHier__Master_Account_Member__c>((List<TracHier__Master_Account_Member__c>) Database.query(query));
    for (TracHier__Master_Account_Member__c m : memberResults.values()) {
        if (hierarchyName == m.TracHier__Master_Account__r.TracHier__Hierarchy__c ) {
            System.debug('MEMBER Id:' + m.Id + ' -- Name:' + m.Name + ' -- Account__c:' + m.TracHier__Account__c + ' : ' + +m.TracHier__Account__r.Name + ' -- Master_Account__c:' + m.TracHier__Master_Account__c + ' : ' + m.TracHier__Master_Account__r.TracHier__Master_Account_ID__c);
            //TracHier.Logger.displaySetRecords(m);
        }
    }

    query = 'SELECT ' + factoryInstance.getFieldListForQuery() + ' FROM Account';
    //System.debug('APEX.testTerritoryTrigger.QUERY: ' + query);
    Map<Id, Account> accountResults = new Map<Id, Account>((List<Account>) Database.query(query));
    for (Account a : accountResults.values()) {
        if (!showRecordsWithCompleteCompany || (showRecordsWithCompleteCompany && a.TracHier__Primary_Master_Account__c != null)) {
            //TracHier.Logger.displaySetRecords(a);
            System.debug('ACCOUNT Id:'+ a.Id+ ' -- Name:'+ a.Name + ' -- Primary_Master_Account__c:'+ a.TracHier__Primary_Master_Account__c + ' -- Hierarchy_ID__c:'+ a.TracHier__Primary_Master_Account__c);
        }
    }
}
System.debug('factoryInstance:'+factoryInstance.getHierarchyName()
        + ' -- IsDefault: ' + factoryInstance.IsDefault
        + ' -- EnforceKeyUniquenessWithUppercase: ' + factoryInstance.EnforceKeyUniquenessWithUppercase
        + ' -- KeepUniqueAccountsCompleteCompany: ' + factoryInstance.KeepUniqueAccountsCompleteCompany);
