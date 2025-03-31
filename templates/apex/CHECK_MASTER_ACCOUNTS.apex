Id sampleId = '0018I00000dgrgFQAQ';//'0010500000aSpWmAAK'
Id qaUser = '00505000004IHWcAAO';
Id ownerUser = '00505000004IH8kAAG';
String listHierarchy = '622812e257792a3f4d55';//'171cf444979315bf993d';
String currentHierarchyType = 'List';


//#region HIERARCHIES
List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c, TracHier__Identifier__c, TracHier__Global_Ultimate_Identifier__c FROM TracHier__Hierarchy__c  ];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.HIERARCHY.NAME:'+ h.Name+ ' LABEL:'+ h.TracHier__Label__c + ' TYPE:'+ h.TracHier__Type__c  + ' IDENTIFIER:'+ h.TracHier__Identifier__c+ ' GLOBAL:'+ h.TracHier__Global_Ultimate_Identifier__c);
}
//#endregion HIERARCHIES

//#region CONFIGURATIONS
HierarchyFactory myHierarchyFactory = new HierarchyFactory(HierarchyMetadataUtils.getCustomHierarchies().get(listHierarchy));
System.debug('APEX.myHierarchyFactory.getCompleteCompanyLookupField():'+myHierarchyFactory.getCompleteCompanyLookupField());
//#endregion CONFIGURATIONS

//#region CHECK
Account a = [SELECT Id, Name, OwnerId, Owner.Name FROM Account WHERE Id =:sampleId];

System.debug('APEX.ACCOUNT.OwnerId:'+a.OwnerId+' Owner.Name:'+a.Owner.Name );

List<TracHier__Master_Account__c> masterAccounts = [SELECT Id, TracHier__HierarchyType__c, TracHier__Member_Count__c,TracHier__HierarchyLabel__c, TracHier__Master_Account_ID__c
FROM TracHier__Master_Account__c
WHERE TracHier__HierarchyType__c=:currentHierarchyType ];
System.debug('masterAccounts.size():'+ masterAccounts.size());
for (TracHier__Master_Account__c ma :masterAccounts) {
    System.debug('APEX.MASTER_ACCOUNT.Id:'+ma.Id+' HierarchyType__c:'+ma.TracHier__HierarchyType__c +' HierarchyLabel__c:'+ma.TracHier__HierarchyLabel__c+' MEMBER_COUNT:'+ma.TracHier__Member_Count__c+' KEY:'+ma.TracHier__Master_Account_ID__c);
}

List<TracHier__Master_Account_Member__c> members = [SELECT Id, TracHier__Account__r.Name, TracHier__Account__r.ParentId
        ,TracHier__Overridden__c , TracHier__Parent_Company__c, TracHier__Master_Account__r.TracHier__HierarchyType__c
FROM TracHier__Master_Account_Member__c
WHERE TracHier__Master_Account__r.TracHier__HierarchyType__c=:currentHierarchyType
AND TracHier__Master_Account__r.TracHier__Master_Account_ID__c LIKE 'User User%'];
System.debug('members.size():'+ members.size());



for (AggregateResult aggregate : [
        SELECT COUNT(Id) AccountCount, TracHier__Master_Account__c
        FROM TracHier__Master_Account_Member__c
        WHERE TracHier__Master_Account__r.TracHier__HierarchyType__c=:currentHierarchyType
        GROUP BY TracHier__Master_Account__c
]) {
    System.debug('MASTER_ACCOUNT:'+ (String) aggregate.get('TracHier__Master_Account__c') + ' members:'+ (Integer) aggregate.get('AccountCount'));
}
//#endregion CHECK


