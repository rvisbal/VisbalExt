//#region HIERARCHIES
List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c  ];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.HIERARCHY.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c );
}
//#endregion HIERARCHIES
// Next Scheduled Run : 1/1/2025, 11:09 AM > CRON: 40 09 11 1 1 ? *
// Next Scheduled Run : 9/1/2024, 11:09 AM > CRON: 40 09 11 1 9 ? *
// Next Scheduled Run : 9/1/2024, 11:37 AM > CRON: 0 37 11 1 9 ? *
// Next Scheduled Run : 9/1/2024, 11:37 AM > CRON: 10 37 11 1 9 ? * 
// Next Scheduled Run : 9/1/2024, 7:38 AM > CRON: 10 38 7 1 9 ? * > CRON:  Submited : 1/9/2024, 7:36 AM
// Next Scheduled Run : 1/9/2024, 7:42 AM > CRON: 10 42 7 9 1 ? * >  Submited : 1/9/2024, 7:40 AM >	Next Scheduled Run: 1/9/2025, 7:42 AM
// Next Scheduled Run : 1/9/2024, 1:04 PM > CRON: 30 04 13 9 1 ? * >  Submited : 1/9/2024, 1:02 PM >	Next Scheduled Run:
//TracHier.HierarchyAPI.scheduleBuildHierarchiesJob('10 42 7 9 1 ? *', 'ParentId = \'0016t00000sSqF7AAK\'', 'CUSTOM DUNS');
TracHier.HierarchyAPI.scheduleBuildHierarchiesJob('30 52 13 9 1 ? *', 'ParentId = \'0016t00000sSqF7AAK\'', 'CUSTOM DUNS');


/*
SELECT ParentId, Count(Id) total
FROM Account
WHERE ParentId !=null
GROUP BY ParentId
ORDER BY Count(Id) DESC
LIMIT 9


0016t00000sSqF7AAK	2500
0016t00000sSrulAAC	1900
0016t00000sSz6dAAC	1500
0016t00000sT479AAC	1000
 */