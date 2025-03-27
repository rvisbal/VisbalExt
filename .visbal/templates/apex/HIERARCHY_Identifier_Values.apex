String recordId = '0010400001b7IewAAE';
//#region HIERARCHIES
HierarchyFactory defaultHierarchy = TracHier.HierarchyMetadataUtils.getDefaultHierarchyFactory();

List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c  ];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('-------------------------------------------------------------------------------');
    Boolean isDefault = (defaultHierarchy.getHierarchyName() == h.Name);
    System.debug('APEX.HIERARCHY.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c + ' DEFAULT:'+isDefault );
    
    TracHier.HierarchyFactory currentFactory =  TracHier.HierarchyMetadataUtils.getSpecificHierarchyFactory(h.Name);
    
 
    Account a = Database.query('SELECT ' + currentFactory.getFieldListForQuery() + ' FROM Account WHERE Id = \'' + recordId + '\'');
    System.debug('APEX.Account.Name:'+ a.Name+ ' Id:'+ a.Id + ' getDunsField:' + currentFactory.getDunsField() + ' getGlobalDunsField:' + currentFactory.getGlobalDunsField());
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getDunsValue:'+currentFactory.getDunsValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getGlobalDunsValue:'+currentFactory.getGlobalDunsValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getRecordGlobalDunsValue:'+currentFactory.getRecordGlobalDunsValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getGlobalNameValue:'+currentFactory.getGlobalNameValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getRecordGlobalNameValue:'+currentFactory.getRecordGlobalNameValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getParentDunsValue:'+currentFactory.getParentDunsValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getRecordParentDunsValue:'+currentFactory.getRecordParentDunsValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getParentNameValue:'+currentFactory.getParentNameValue(a));
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getRecordParentNameValue:'+currentFactory.getRecordParentNameValue(a));

    System.debug('APEX.'+ h.TracHier__Label__c+ '.getDunsField():'+currentFactory.getDunsField());
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getParentDunsField():'+currentFactory.getParentDunsField());
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getGlobalDunsField():'+currentFactory.getGlobalDunsField());
    System.debug('APEX.'+ h.TracHier__Label__c+ '.getRecordParentNameValue:'+currentFactory.getField(String.valueOf(TracHier.HierarchyMetadataUtils.FIELD_KEY.globalduns)));
}
//#endregion HIERARCHIES

