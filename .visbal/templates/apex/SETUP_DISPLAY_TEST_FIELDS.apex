

Boolean setDefaultValues = true;
Boolean displayDebugs = false;
Boolean createNewHierarchies = false;
Generic_Display_Fields__c globalDisplayFields = HierarchyMetadataUtils.getGlobalDisplayFields();
if (setDefaultValues == true) {
    //TracHier__Hierarchy_Display_Fields__c fields = TracHier__Hierarchy_Display_Fields__c.getOrgDefaults();
   
    //HierarchyMetadataUtils.getDisplayFieldsForProfile(UserInfo.getProfileId());
    //Generic_Display_Fields__c genericDisplayFields = new Generic_Display_Fields__c();
    globalDisplayFields.TracHier__Field1_Custom__c = false;
    globalDisplayFields.TracHier__Field1_Label__c = 'ParentId';
    globalDisplayFields.TracHier__Field1__c = 'parentid';//	00163000011x9kSAAQ

    globalDisplayFields.TracHier__Field2_Custom__c = true;
    globalDisplayFields.TracHier__Field2_Label__c = 'DUNS';//Docusign, Inc.
    globalDisplayFields.TracHier__Field2__c = 'trachier__test_dunsnumber__c';

    globalDisplayFields.TracHier__Field3_Custom__c = true;
    globalDisplayFields.TracHier__Field3_Label__c = 'Parent DUNS';
    globalDisplayFields.TracHier__Field3__c = 'trachier__test_parent_duns__c';//Docusign, Inc. (135915101)
    globalDisplayFields.TracHier__Field4_Custom__c = true;
    globalDisplayFields.TracHier__Field4_Label__c = 'Parent Name';
    globalDisplayFields.TracHier__Field4__c = 'trachier__test_parent_primname__c';//a0M63000006RBKaEAO
    globalDisplayFields.TracHier__Field5_Custom__c = true;
    globalDisplayFields.TracHier__Field5_Label__c = 'GU';
    globalDisplayFields.TracHier__Field5__c = 'trachier__test_gu_duns__c';
    globalDisplayFields.TracHier__Field6_Custom__c = true;
    globalDisplayFields.TracHier__Field6_Label__c = 'GU Name';
    globalDisplayFields.TracHier__Field6__c = 'trachier__test_gu_primname__c';//00163000011x9kSAAQ
    globalDisplayFields.TracHier__Field7_Custom__c = false;
    globalDisplayFields.TracHier__Field7_Label__c = 'Country';
    globalDisplayFields.TracHier__Field7__c = 'billingcountry';
    globalDisplayFields.TracHier__Field8_Custom__c = true;
    globalDisplayFields.TracHier__Field8_Label__c = 'Overridden';
    globalDisplayFields.TracHier__Field8__c = 'trachier__excluded_from_account_hierarchies__c'; //true | false
    globalDisplayFields.TracHier__Field9_Custom__c = true;
    globalDisplayFields.TracHier__Field9_Label__c = 'Parent Company';
    globalDisplayFields.TracHier__Field9__c = 'trachier__parent_company__c';
    globalDisplayFields.TracHier__Field10_Custom__c = false;
    globalDisplayFields.TracHier__Field10_Label__c = 'Complete Company';
    globalDisplayFields.TracHier__Field10__c = 'trachier__primary_master_account__c';
    globalDisplayFields.TracHier__Field11_Custom__c = false;
    globalDisplayFields.TracHier__Field11_Label__c = 'Complete Company ID';
    globalDisplayFields.TracHier__Field11__c = 'trachier__hierarchy_id__c';
    globalDisplayFields.TracHier__Field12_Custom__c = true;
    globalDisplayFields.TracHier__Field12_Label__c = 'Parent GU';
    globalDisplayFields.TracHier__Field12__c = 'trachier__parent_company__r.trachier__test_gu_duns__c';
    //globalDisplayFields.TracHier__Criteria_Logic__c = null;

    upsert globalDisplayFields;
}

if (displayDebugs == true) {
    System.debug('TracHier__Field1_Custom__c:' + globalDisplayFields.TracHier__Field1_Custom__c);
    System.debug('TracHier__Field1_Label__c:' + globalDisplayFields.TracHier__Field1_Label__c);
    System.debug('TracHier__Field1__c:' + globalDisplayFields.TracHier__Field1__c);
    System.debug('TracHier__Field2_Custom__c:' + globalDisplayFields.TracHier__Field2_Custom__c);
    System.debug('TracHier__Field2_Label__c:' + globalDisplayFields.TracHier__Field2_Label__c);
    System.debug('TracHier__Field2__c:' + globalDisplayFields.TracHier__Field2__c);
    System.debug('TracHier__Field3_Custom__c:' + globalDisplayFields.TracHier__Field3_Custom__c);
    System.debug('TracHier__Field3_Label__c:' + globalDisplayFields.TracHier__Field3_Label__c);
    System.debug('TracHier__Field3__c:' + globalDisplayFields.TracHier__Field3__c);
    System.debug('TracHier__Field4_Custom__c:' + globalDisplayFields.TracHier__Field4_Custom__c);
    System.debug('TracHier__Field4_Label__c:' + globalDisplayFields.TracHier__Field4_Label__c);
    System.debug('TracHier__Field4__c:' + globalDisplayFields.TracHier__Field4__c);
    System.debug('TracHier__Field5_Custom__c:' + globalDisplayFields.TracHier__Field5_Custom__c);
    System.debug('TracHier__Field5_Label__c:' + globalDisplayFields.TracHier__Field5_Label__c);
    System.debug('TracHier__Field5__c:' + globalDisplayFields.TracHier__Field5__c);
    System.debug('TracHier__Field6_Custom__c:' + globalDisplayFields.TracHier__Field6_Custom__c);
    System.debug('TracHier__Field6_Label__c:' + globalDisplayFields.TracHier__Field6_Label__c);
    System.debug('TracHier__Field6__c:' + globalDisplayFields.TracHier__Field6__c);
    System.debug('TracHier__Field7_Custom__c:' + globalDisplayFields.TracHier__Field7_Custom__c);
    System.debug('TracHier__Field7_Label__c:' + globalDisplayFields.TracHier__Field7_Label__c);
    System.debug('TracHier__Field7__c:' + globalDisplayFields.TracHier__Field7__c);
    System.debug('TracHier__Field8_Custom__c:' + globalDisplayFields.TracHier__Field8_Custom__c);
    System.debug('TracHier__Field8_Label__c:' + globalDisplayFields.TracHier__Field8_Label__c);
    System.debug('TracHier__Field8__c:' + globalDisplayFields.TracHier__Field8__c);
    System.debug('TracHier__Field9_Custom__c:' + globalDisplayFields.TracHier__Field9_Custom__c);
    System.debug('TracHier__Field9_Label__c:' + globalDisplayFields.TracHier__Field9_Label__c);
    System.debug('TracHier__Field9__c' + globalDisplayFields.TracHier__Field9__c);
    System.debug('TracHier__Field10_Custom__c:' + globalDisplayFields.TracHier__Field10_Custom__c);
    System.debug('TracHier__Field10_Label__c:' + globalDisplayFields.TracHier__Field10_Label__c);
    System.debug('TracHier__Field10__c:' + globalDisplayFields.TracHier__Field10__c);
    System.debug('TracHier__Field11_Custom__c:' + globalDisplayFields.TracHier__Field11_Custom__c);
    System.debug('TracHier__Field11_Label__c:' + globalDisplayFields.TracHier__Field11_Label__c);
    System.debug('TracHier__Field11__c:' + globalDisplayFields.TracHier__Field11__c);
    System.debug('TracHier__Field12_Custom__c:' + globalDisplayFields.TracHier__Field12_Custom__c);
    System.debug('TracHier__Field12_Label__c:' + globalDisplayFields.TracHier__Field12_Label__c);
    System.debug('TracHier__Field12__c:' + globalDisplayFields.TracHier__Field12__c);
    //System.debug('TracHier__Criteria_Logic__c:' + globalDisplayFields.TracHier__Criteria_Logic__c);
}

if (createNewHierarchies == true) {
    List<TracHier__Hierarchy__c> hierarchies = new List<TracHier__Hierarchy__c>();

    TracHier__Hierarchy__c customHierarchy = new TracHier__Hierarchy__c();
    customHierarchy.Name = 'd6d0a0917aaa8e5c8cff';
    customHierarchy.TracHier__Type__c = 'Custom';
    customHierarchy.TracHier__Label__c = 'CUSTOM DUNS';
    customHierarchy.TracHier__Hierarchy_ID_Type__c = 'DnB';
    customHierarchy.TracHier__Domestic_Ultimate_Identifier__c = 'TracHier__DU_duns__c';
    customHierarchy.TracHier__Enable_Master_Accounts__c = true;
    customHierarchy.TracHier__Global_Ultimate_Identifier_Custom__c = true;
    customHierarchy.TracHier__Global_Ultimate_Identifier__c = 'TracHier__GU_duns__c';
    customHierarchy.TracHier__Global_Ultimate_Name_Custom__c = true;
    customHierarchy.TracHier__Global_Ultimate_Name__c = 'TracHier__GU_PrimName__c';
    customHierarchy.TracHier__Identifier_Custom__c = true;
    customHierarchy.TracHier__Identifier__c = 'TracHier__UFS_DUNS_Number__c';
    customHierarchy.TracHier__Keep_Unique_Accounts_Complete_Company__c = false;
    customHierarchy.TracHier__Location_Status_Custom__c = false;
    customHierarchy.TracHier__Location_Status__c = '';
    customHierarchy.TracHier__Master_Account_Creation__c = 'always';
    customHierarchy.TracHier__Parent_Identifier_Custom__c = true;
    customHierarchy.TracHier__Parent_Identifier__c = 'TracHier__parent_duns__c';
    customHierarchy.TracHier__Parent_Name_Custom__c = true;
    customHierarchy.TracHier__Parent_Name__c = 'TracHier__parent_PrimName__c';
    customHierarchy.TracHier__Populate_Native_Parent_Field__c = false;
    customHierarchy.TracHier__Record_Hierarchy_ID__c = '';
    hierarchies.add(customHierarchy);

    TracHier__Hierarchy__c customDefaultHierarchy = new TracHier__Hierarchy__c();
    customDefaultHierarchy.Name = '704a91cc70a73cd294e6';
    customDefaultHierarchy.TracHier__Type__c = 'Custom';
    customDefaultHierarchy.TracHier__Label__c = 'CUSTOM DUNS DEFAULT';
    customDefaultHierarchy.TracHier__Hierarchy_ID_Type__c = 'DnB';
    customDefaultHierarchy.TracHier__Domestic_Ultimate_Identifier__c = 'TracHier__DU_duns__c';
    customDefaultHierarchy.TracHier__Enable_Master_Accounts__c = true;
    customDefaultHierarchy.TracHier__Global_Ultimate_Identifier_Custom__c = true;
    customDefaultHierarchy.TracHier__Global_Ultimate_Identifier__c = 'TracHier__GU_duns__c';
    customDefaultHierarchy.TracHier__Global_Ultimate_Name_Custom__c = true;
    customDefaultHierarchy.TracHier__Global_Ultimate_Name__c = 'TracHier__GU_PrimName__c';
    customDefaultHierarchy.TracHier__Identifier_Custom__c = true;
    customDefaultHierarchy.TracHier__Identifier__c = 'TracHier__UFS_DUNS_Number__c';
    customDefaultHierarchy.TracHier__Keep_Unique_Accounts_Complete_Company__c = false;
    customDefaultHierarchy.TracHier__Location_Status_Custom__c = false;
    customDefaultHierarchy.TracHier__Location_Status__c = '';
    customDefaultHierarchy.TracHier__Master_Account_Creation__c = 'always';
    customDefaultHierarchy.TracHier__Parent_Identifier_Custom__c = true;
    customDefaultHierarchy.TracHier__Parent_Identifier__c = 'TracHier__parent_duns__c';
    customDefaultHierarchy.TracHier__Parent_Name_Custom__c = true;
    customDefaultHierarchy.TracHier__Parent_Name__c = 'TracHier__parent_PrimName__c';
    customDefaultHierarchy.TracHier__Populate_Native_Parent_Field__c = false;
    customDefaultHierarchy.TracHier__Record_Hierarchy_ID__c = '';
    hierarchies.add(customDefaultHierarchy);

    TracHier__Hierarchy__c algoliaListHierarchy = new TracHier__Hierarchy__c();
    algoliaListHierarchy.Name = '1704a760027089cd0562';
    algoliaListHierarchy.TracHier__Type__c = 'List';
    algoliaListHierarchy.TracHier__Label__c = 'ALGOLIA LIST';
    algoliaListHierarchy.TracHier__Hierarchy_ID_Type__c = 'DnB';
    algoliaListHierarchy.TracHier__Domestic_Ultimate_Identifier__c = null;
    algoliaListHierarchy.TracHier__Enable_Master_Accounts__c = true;
    algoliaListHierarchy.TracHier__Global_Ultimate_Identifier_Custom__c = true;
    algoliaListHierarchy.TracHier__Global_Ultimate_Identifier__c = 'trachier__territory__c';
    algoliaListHierarchy.TracHier__Global_Ultimate_Name_Custom__c = true;
    algoliaListHierarchy.TracHier__Global_Ultimate_Name__c = 'trachier__territory__c';
    algoliaListHierarchy.TracHier__Identifier_Custom__c = true;
    algoliaListHierarchy.TracHier__Identifier__c = 'id';
    algoliaListHierarchy.TracHier__Keep_Unique_Accounts_Complete_Company__c = false;
    algoliaListHierarchy.TracHier__Location_Status_Custom__c = false;
    algoliaListHierarchy.TracHier__Location_Status__c = '';
    algoliaListHierarchy.TracHier__Master_Account_Creation__c = 'always';
    algoliaListHierarchy.TracHier__Parent_Identifier_Custom__c = true;
    algoliaListHierarchy.TracHier__Parent_Identifier__c = null;
    algoliaListHierarchy.TracHier__Parent_Name_Custom__c = true;
    algoliaListHierarchy.TracHier__Parent_Name__c = null;
    algoliaListHierarchy.TracHier__Populate_Native_Parent_Field__c = false;
    algoliaListHierarchy.TracHier__Record_Hierarchy_ID__c = '';
    hierarchies.add(algoliaListHierarchy);


    insert hierarchies;
}
