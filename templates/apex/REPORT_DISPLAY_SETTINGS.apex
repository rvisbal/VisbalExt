Map<String, Generic_Criteria_Set__c> criteriaMap = new Map<String, Generic_Criteria_Set__c>();
Map<Id, Generic_Criteria_Set__c> criteriaSets = new Map<Id, Generic_Criteria_Set__c>([SELECT Id, Name, Criteria_Logic__c FROM Generic_Criteria_Set__c] );
Map<Id, Generic_Criterion__c> filters = new Map<Id, Generic_Criterion__c>([SELECT Id, Name, Custom__c, Field__c, Operator__c, Value__c, Generic_Criteria_Set__c FROM Generic_Criterion__c] );
Map<String, List<Generic_Criterion__c>> criterionMap = (Map<String, List<Generic_Criterion__c>>) HierarchyLinkerUtils.collectListFieldMap(Map<String, List<Generic_Criterion__c>>.class, List<Generic_Criterion__c>.class, filters.values(), 'Generic_Criteria_Set__c');
List<Hierarchy__c> hierarchies = [SELECT Id, Name, Label__c,Generic_Criteria_Set__c FROM Hierarchy__c ];
for (Hierarchy__c h : hierarchies) {
    System.debug('Hierarchy:' + h.Name+ ' -- Label:' + h.Label__c + ' -- Criteria Set:' + h.Generic_Criteria_Set__c);
    if (String.isNotBlank(h.Generic_Criteria_Set__c)) {
        criteriaMap.put(h.Name, criteriaSets.get(h.Generic_Criteria_Set__c));
        System.debug('Criteria_Logic__c:' + criteriaSets.get(h.Generic_Criteria_Set__c).Criteria_Logic__c);
        if (criterionMap.containsKey(h.Generic_Criteria_Set__c)) {
            for (Generic_Criterion__c f: criterionMap.get(h.Generic_Criteria_Set__c)) {
                System.debug('Criterion:' + f.Name+ ' -- Field:' + f.Field__c + ' -- Operator:' + f.Operator__c + ' -- Value:' + f.Value__c);
            }
        }
    }
}


Map<Id, Hierarchy_Settings__c> settings = new Map<Id, Hierarchy_Settings__c>([SELECT Id, Name, Allow_null_parent_values__c, Alternative_Hierarchy_ID__c, Asynchronous_Trigger__c, Build_Job_Batch_Size__c, Custom_Create_URL__c, DefaultDisplayHierarchy__c, DefaultHierarchy__c, Default_Whitespace_Object__c, Disable_Domain_Population__c, Disable_Duplicate_Check__c, Disable_Hierarchy_Picker__c, Disable_Per_User_Field_Selection__c, Disable_Trigger__c, Disable_Use_Native_Account_Page__c, Display_Child_Objects__c, DnB_Key__c, DnB_Secret__c, Enable_CSV_Download__c, Enable_Click_to_Merge__c, Enable_Create_Inferred_Account_Button__c, Enable_Debug_Trace_Log__c, Enable_Default_Object_On_Whitespace__c, Enable_DnB__c, Enable_Field_Filters__c, Enable_Hierarchy_Builder__c, Enable_History_Logging__c, Enable_Inline_Account_Record_Creation__c, Enable_Inline_Editing__c, Enable_LWC_For_VFP__c, Enable_Mass_Create_Accounts__c, Enable_Master_Accounts__c, Enable_Notifications__c, Enable_Print_To_PDF__c, Enable_Rerun_Whole_Hierarchy__c, Enable_Rollup_Refresh__c, Enable_Whitespace_Prospecting__c, Large_Hierarchy_Threshold__c, Legacy_Browser__c, Link_Child_Records_Async__c, Load_Records_Page_Size__c, Mass_Create_Accounts_Batch_Size__c, Master_Account_Creation__c, Node_Expansion_Level__c, Override_DnB_Data_Fields__c, Page_Size__c, Parent_Field_Append_Behavior__c, Populate_Native_Parent_Field__c, Show_Children_Nodes_Count__c, Show_Create_Button_for_All_Users__c, Show_Display_Fields_for_All_Users__c, Show_Locked_Filters__c, Show_Overridden_Accounts_in_Whitespace__c, Show_Records_for_All_Users__c, Show_Summary_Footer__c, Skip_Record_Type_Selection_Page__c, Use_Custom_Create_Url__c, Use_Optimizer_Fields__c, domesticduns__c, duns__c, globalduns__c, globalname__c, locstatus__c, parentduns__c, parentname__c
FROM Hierarchy_Settings__c] );

List<Hierarchy_Display_Settings__c> displaySettings = [SELECT Id, Name, DefaultDisplayHierarchy__c, Disable_Duplicate_Check__c, Disable_Hierarchy_Picker__c, Disable_Per_User_Field_Selection__c, Display_Child_Objects__c, Enable_CSV_Download__c, Enable_Click_to_Merge__c, Enable_Create_Inferred_Account_Button__c, Enable_Field_Filters__c, Enable_Hierarchy_Builder__c, Enable_Inline_Account_Record_Creation__c, Enable_Inline_Editing__c, Enable_LWC_For_VFP__c, Enable_Mass_Create_Accounts__c, Enable_Notifications__c, Enable_Print_To_PDF__c, Enable_Rerun_Whole_Hierarchy__c, Enable_Rollup_Refresh__c, Enable_Whitespace_Prospecting__c, Node_Expansion_Level__c, Show_Display_Fields_for_All_Users__c, Show_Locked_Filters__c, Show_Overridden_Accounts_in_Whitespace__c, Show_Records_for_All_Users__c, Show_Summary_Footer__c, Skip_Record_Type_Selection_Page__c, UserOrGroupId__c
FROM Hierarchy_Display_Settings__c];
Map<String, List<Hierarchy_Display_Settings__c>> displaySettingsMap = (Map<String, List<Hierarchy_Display_Settings__c>>) HierarchyLinkerUtils.collectListFieldMap(Map<String, List<Hierarchy_Display_Settings__c>>.class, List<Hierarchy_Display_Settings__c>.class, displaySettings, 'UserOrGroupId__c');

Map<Id, Child_Object_Display_Settings__c> displayFieldChildObjectDisplaySettings = new Map<Id, Child_Object_Display_Settings__c>([SELECT Id, Name, User_or_Profile_Id__c FROM Child_Object_Display_Settings__c]);
Map<String, List<Child_Object_Display_Settings__c>> displayFieldChildObjectDisplaySettingsMap = (Map<String, List<Child_Object_Display_Settings__c>>) HierarchyLinkerUtils.collectListFieldMap(Map<String, List<Child_Object_Display_Settings__c>>.class, List<Child_Object_Display_Settings__c>.class, displayFieldChildObjectDisplaySettings.values(), 'User_or_Profile_Id__c');

Map<Id, Hierarchy_Per_Profile_Object__c> hierarchyPerProfiles = new Map<Id, Hierarchy_Per_Profile_Object__c>([SELECT Id, Name, Hierarchy_Name__c, SetupOwnerId__c  FROM Hierarchy_Per_Profile_Object__c]);
Map<String, List<Hierarchy_Per_Profile_Object__c>> hierarchyPerProfilesMap = (Map<String, List<Hierarchy_Per_Profile_Object__c>>) HierarchyLinkerUtils.collectListFieldMap(Map<String, List<Hierarchy_Per_Profile_Object__c>>.class, List<Hierarchy_Per_Profile_Object__c>.class, hierarchyPerProfiles.values(), 'SetupOwnerId__c');

for (Hierarchy_Settings__c s : settings.values()) {
    System.debug('Setting:' + s.Name + ' -- Value:' + s.getPopulatedFieldsAsMap().get('Enable_Hierarchy_Builder__c'));

    if (displaySettingsMap.containsKey(s.Name)) {
        for (Hierarchy_Display_Settings__c d : displaySettingsMap.get(s.Name)) {
            System.debug('Display_Settings: DefaultDisplayHierarchy__c: ' + d.DefaultDisplayHierarchy__c
                    + ' -- Disable_Duplicate_Check__c:' + d.Disable_Duplicate_Check__c
                    + ' -- Disable_Hierarchy_Picker__c:' + d.Disable_Hierarchy_Picker__c
                    + ' -- Disable_Per_User_Field_Selection__c:' + d.Disable_Per_User_Field_Selection__c
                    + ' -- Display_Child_Objects__c:' + d.Display_Child_Objects__c
                    + ' -- Enable_CSV_Download__c:' + d.Enable_CSV_Download__c
                    + ' -- Enable_Click_to_Merge__c:' + d.Enable_Click_to_Merge__c
                    + ' -- Enable_Create_Inferred_Account_Button__c:' + d.Enable_Create_Inferred_Account_Button__c
                    + ' -- Enable_Field_Filters__c:' + d.Enable_Field_Filters__c
                    + ' -- Enable_Hierarchy_Builder__c:' + d.Enable_Hierarchy_Builder__c
                    + ' -- Enable_Inline_Account_Record_Creation__c:' + d.Enable_Inline_Account_Record_Creation__c
                    + ' -- Enable_Inline_Editing__c:' + d.Enable_Inline_Editing__c);
        }
    }

    if (displayFieldChildObjectDisplaySettingsMap.containsKey(s.Name)) {
        for (Child_Object_Display_Settings__c c : displayFieldChildObjectDisplaySettingsMap.get(s.Name)) {
            System.debug('Child_Object_Display_Settings: User_or_Profile_Id__c: ' + c.User_or_Profile_Id__c);
        }
    }

    if (hierarchyPerProfilesMap.containsKey(s.Name)) {
        for (Hierarchy_Per_Profile_Object__c h : hierarchyPerProfilesMap.get(s.Name)) {
            System.debug('Hierarchy_Per_Profile_Object: Hierarchy_Name__c: ' + h.Hierarchy_Name__c);
        }
    }



}