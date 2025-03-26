String targetId = '001As00000Rq4XSIAZ';// Accenture plc
String parentId = '001As00000Rq4pbIAB';// AbleVets purchasing on behalf of Dept of Veterans Affairs

//Hierarchy_Settings__c settings = Hierarchy_Settings__c.getOrgDefaults();
//settings.Asynchronous_Trigger__c = true;
//upsert settings;

HierarchyFactory defaultFactory = HierarchyMetadataUtils.getDefaultHierarchyFactory();
HierarchyFactory currentFactory = HierarchyMetadataUtils.getUserDefaultViewHierarchyFactory();
System.debug('TRIGGER ASYNC:'+HierarchyMetadataUtils.isTriggerAsync()
        + ' -- DEFAULT HIERARCHY:'+ defaultFactory.Hierarchy.Label__c
        + ' -- PopulateNativeParent:'+ defaultFactory.PopulateNativeParent
        + ' -- CURRENT VIEW HIERARCHY:'+ currentFactory.Hierarchy.Label__c);

Account a = [SELECT Id, Name, ParentId, Parent_Company__c, Excluded_From_Account_Hierarchies__c FROM Account WHERE Id=:targetId];
System.debug('ACCOUNT.BEFORE a.Id:'+a.Id 
        + ' -- Name:'+ a.Name
        + ' -- OVERRIDDEN:'+ a.Excluded_From_Account_Hierarchies__c
        + ' -- Parent_Company__c:'+ a.Parent_Company__c
        + ' -- ParentId:'+ a.ParentId);
if (a.Excluded_From_Account_Hierarchies__c == true) {
    a.ParentId = null;
    a.Excluded_From_Account_Hierarchies__c = false;
    a.Parent_Company__c = null;
}
else {
    a.Excluded_From_Account_Hierarchies__c = true;
    a.Parent_Company__c = parentId;
    //a.ParentId = null;
}
System.debug('ACCOUNT.AFTER a.Id:'+a.Id
        + ' -- Name:'+ a.Name
        + ' -- OVERRIDDEN:'+ a.Excluded_From_Account_Hierarchies__c
        + ' -- Parent_Company__c:'+ a.Parent_Company__c);
update a;
