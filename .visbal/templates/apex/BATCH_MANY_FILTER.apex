String currentHierarchy = '7a84362a1b250a8915b2';//'62050518294e3d93f12b';

//#region HIERARCHIES
List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c  ];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.HIERARCHY.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c );
}
//#endregion HIERARCHIES

//#region LOGS
List<TracHier__History_Log__c> logs = [SELECT Id FROM TracHier__History_Log__c LIMIT 20000];
System.debug('APEX.logs:'+logs.size());
delete logs;
//#endregion LOGS



//#region ABORT_JOBS
Map<Id, AsyncApexJob> jobs = new Map<Id, AsyncApexJob>([
        SELECT Id FROM AsyncApexJob WHERE Status = 'Processing'
]);
System.debug('APEX.CANCELLING JOBS:'+jobs.size());
if(jobs.size() > 0) {
    for(Id jobId : jobs.keySet()) {
        System.abortJob(jobId);
    }
}
//#endregion ABORT_JOBS



//#region RUN
Set<String> duns = new Set<String> {'414955513','594019635','659315150','915104779','800008286','865755961'};
//List<String> duns = new List<String>{ '315369934', '217127290', '371171613','530741082' };
List<TracHier__Filter__c> optionalFilterList = new List<TracHier__Filter__c>();

for (String currentId : duns) {
    TracHier__Filter__c f = new TracHier__Filter__c();
    f.TracHier__Field__c = 'trachier__do_not_use_dnbconnect_dunsnumber__c';//'duns_number__c';
    f.TracHier__Operator__c = 'EQUALS';
    f.TracHier__Order_Number__c = 1;
    f.TracHier__SObjectType__c = 'Account';
    f.TracHier__Set_Number__c = 1;
    f.TracHier__Value__c = currentId;
    optionalFilterList.add(f);
}
for (String currentId : duns) {
    TracHier__Filter__c f = new TracHier__Filter__c();
    f.TracHier__Field__c = 'trachier__do_not_use_dnbconnect_gu_duns__c';//'global_ultimate_duns_number__c';
    f.TracHier__Operator__c = 'EQUALS';
    f.TracHier__Order_Number__c = 1;
    f.TracHier__SObjectType__c = 'Account';
    f.TracHier__Set_Number__c = 1;
    f.TracHier__Value__c = currentId;
    optionalFilterList.add(f);
}


//#region CRITERIA_LOGIC
List<String> indexList = new List<String>();
Integer indexCount = 1;
for (TracHier__Filter__c f : optionalFilterList) {
    indexList.add(String.valueOf(indexCount));
    indexCount++;
}
System.debug('APEX.indexList:'+indexList);
String optionalFilterLogic = String.join(new List<String>(indexList), ' OR ');//'1 OR 2 OR 3';
System.debug('APEX.optionalFilterLogic:'+optionalFilterLogic);
//#endregion CRITERIA_LOGIC


System.debug('APEX.RUN.BATCH.WITH.FILTERS.optionalFilterList:'+optionalFilterList.size());
TracHier.HierarchyLinkerBatch.runSelectedWithFilters(optionalFilterList, optionalFilterLogic,null, new List<String>{currentHierarchy});
//#endregion RUN