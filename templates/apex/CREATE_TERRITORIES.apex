String hierarchyName = '';////'5b3dac9140408557ae97';

List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c];
for (TracHier__Hierarchy__c h : hierarchies) {
    System.debug('APEX.h.Name:'+ h.Name+ ' Label:'+ h.TracHier__Label__c + ' Type:'+ h.TracHier__Type__c );
    if (h.TracHier__Type__c == 'Territory' &&  h.TracHier__Label__c=='TERRITORY 2') {
        hierarchyName = h.Name;
    }
}

if (String.isNotBlank(hierarchyName)) {
    List<TracHier__Hierarchy__c> hierarchies = [SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, TracHier__Enable_Master_Accounts__c FROM TracHier__Hierarchy__c];
    for (TracHier__Hierarchy__c h : hierarchies) {
        System.debug('APEX.h.Name:' + h.Name + ' Label:' + h.TracHier__Label__c + ' Type:' + h.TracHier__Type__c);
        //
    }
    String hierarchyName = 'c0e0829fc7f5be001a0c';
    String objectName = 'Account';
//TracHier.HierarchyFactory currentFactory =  TracHier.HierarchyMetadataUtils.getSpecificHierarchyFactory(hierarchyName);

    List<Territory_Segment__c> segments = new List<Territory_Segment__c>();
    segments.add(new Territory_Segment__c(Name = 'NORAM', Hierarchy_Name__c = hierarchyName, Priority__c = 1));
    segments.add(new Territory_Segment__c(Name = 'EMEA', Hierarchy_Name__c = hierarchyName, Priority__c = 2));
    segments.add(new Territory_Segment__c(Name = 'LATAM', Hierarchy_Name__c = hierarchyName, Priority__c = 3));
    segments.add(new Territory_Segment__c(Name = 'APAC', Hierarchy_Name__c = hierarchyName, Priority__c = 4));
    insert segments;

    Map<String, Territory_Segment__c> segmentsMap = (Map<String, Territory_Segment__c>) HierarchyLinkerUtils.collectFieldMap(Map<String, Territory_Segment__c>.class, segments, 'Name');

//#region NORAM
    Generic_Criteria_Set__c noramSet = new Generic_Criteria_Set__c(Name = 'Test', SObjectType__c = 'TracHier__Territory_Segment__c', Criteria_Logic__c = '1 OR 2 OR 3 OR 4');
    insert noramSet;

    List<Generic_Criterion__c> criterionList = new List<Generic_Criterion__c>();
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'CA', Generic_Criteria_Set__c = noramSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'Canada', Generic_Criteria_Set__c = noramSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'US', Generic_Criteria_Set__c = noramSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'United States', Generic_Criteria_Set__c = noramSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    insert criterionList;

    segmentsMap.get('NORAM').Generic_Criteria_Set__c = noramSet.Id;
//#endregion NORAM

//#region EMEA
    Generic_Criteria_Set__c emeaSet = new Generic_Criteria_Set__c(Name = 'Test', SObjectType__c = 'TracHier__Territory_Segment__c', Criteria_Logic__c = '1 OR 2 OR 3 OR 4');
    insert emeaSet;

    criterionList = new List<Generic_Criterion__c>();
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'DE', Generic_Criteria_Set__c = emeaSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'GB', Generic_Criteria_Set__c = emeaSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'IT', Generic_Criteria_Set__c = emeaSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'FR', Generic_Criteria_Set__c = emeaSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    insert criterionList;

    segmentsMap.get('EMEA').Generic_Criteria_Set__c = emeaSet.Id;
//#endregion EMEA

//#region APAC
    Generic_Criteria_Set__c apacSet = new Generic_Criteria_Set__c(Name = 'Test', SObjectType__c = 'TracHier__Territory_Segment__c', Criteria_Logic__c = '1 OR 2 OR 3');
    insert apacSet;

    criterionList = new List<Generic_Criterion__c>();
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'JP', Generic_Criteria_Set__c = apacSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'AU', Generic_Criteria_Set__c = apacSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'CH', Generic_Criteria_Set__c = apacSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    insert criterionList;

    segmentsMap.get('APAC').Generic_Criteria_Set__c = apacSet.Id;
//#endregion APAC

//#region LATAM
    Generic_Criteria_Set__c latamSet = new Generic_Criteria_Set__c(Name = 'Test', SObjectType__c = 'TracHier__Territory_Segment__c', Criteria_Logic__c = '1 OR 2 OR 3 OR 4');
    insert latamSet;

    criterionList = new List<Generic_Criterion__c>();
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'MX', Generic_Criteria_Set__c = latamSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'Mexico', Generic_Criteria_Set__c = latamSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'BR', Generic_Criteria_Set__c = latamSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    criterionList.add(new Generic_Criterion__c(Name = 'Test' + criterionList.size(), SObjectType__c = objectName, Field__c = 'BillingCountry', Operator__c = String.valueOf(CriteriaEvaluator.Operator.EQUALS), Value__c = 'CO', Generic_Criteria_Set__c = latamSet.Id, Order_Number__c = criterionList.size() + 1, Custom__c = false));
    insert criterionList;

    segmentsMap.get('LATAM').Generic_Criteria_Set__c = latamSet.Id;
//#endregion LATAM


    update segmentsMap.values();
}
/*
String query = 'SELECT Id, Name, TracHier__Priority__c FROM TracHier__Territory_Segment__c';
Map<Id, TracHier__Territory_Segment__c> resultMap = new Map<Id, TracHier__Territory_Segment__c>((List<TracHier__Territory_Segment__c>) database.query(query));
Map<String, TracHier__Territory_Segment__c> resultNameMap = (Map<String, TracHier__Territory_Segment__c>) HierarchyLinkerUtils.collectFieldMap(Map<String, TracHier__Territory_Segment__c>.class, resultMap.values(), 'Name');

resultNameMap.get('NORAM').put('Priority__c', 1);
resultNameMap.get('EMEA').put('Priority__c', 2);
resultNameMap.get('LATAM').put('Priority__c', 3);
resultNameMap.get('APAC').put('Priority__c', 4);
update resultNameMap.values(); 


SELECT BillingCountry, COUNT(Id)
        FROM Account
        GROUP BY BillingCountry
HAVING  COUNT(Id) > 3
LIMIT 1000
 */
/*
JP	4
AU	13
DE	35
SE	6
LU	10
US	370
NL	13
IT	6
GB	86
CH	6
United States	66
MX	10
CA	14
IN	4
FR	32
 */