HierarchyAPI.setTriggerEnabled();
String PREFIX = 'Sample';//'Pilot';//'Sample';
String POST_NUMBER = '1';
Boolean disableTrigger = true;

Database.DMLOptions dmlOptions = new Database.DMLOptions();
dmlOptions.duplicateRuleHeader.allowSave = true;


if (disableTrigger) TracHier.HierarchyAPI.setTriggerDisabled();

List<DNBoptimizer__DnBCompanyRecord__c> dnBRecords = new List<DNBoptimizer__DnBCompanyRecord__c>();
if (PREFIX == 'Sample') {
    POST_NUMBER = '0';
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Standalone Co'
            , DNBoptimizer__DUNSNumber__c = '100000000'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '100000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Standalone Co'
            , DNBoptimizer__LocationType__c = '0'));
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Ultimate Parent Co'
            , DNBoptimizer__DUNSNumber__c = '110000000'
            , DNBoptimizer__ParentDUNSNumber__c = '110000000'
            , DNBoptimizer__ParentBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '110000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__LocationType__c = '1'));
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Parent Co'
            , DNBoptimizer__DUNSNumber__c = '120000000'
            , DNBoptimizer__ParentDUNSNumber__c = '110000000'
            , DNBoptimizer__ParentBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '110000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__LocationType__c = '1'));
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Branch Co'
            , DNBoptimizer__DUNSNumber__c = '130000000'
            , DNBoptimizer__ParentDUNSNumber__c = '120000000'
            , DNBoptimizer__ParentBusinessName__c = 'Parent Co'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '110000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__LocationType__c = '2'));
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Parent Missing Parent'
            , DNBoptimizer__DUNSNumber__c = '140000000'
            , DNBoptimizer__ParentDUNSNumber__c = '290000000'
            , DNBoptimizer__ParentBusinessName__c = 'Some Other Parent Co'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '110000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__LocationType__c = '1'));
    dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name = 'Child of 4 Co'
            , DNBoptimizer__DUNSNumber__c = '150000000'
            , DNBoptimizer__ParentDUNSNumber__c = '140000000'
            , DNBoptimizer__ParentBusinessName__c = 'Parent Missing Parent'
            , DNBoptimizer__GlobalUltimateDUNSNumber__c = '110000000'
            , DNBoptimizer__GlobalUltimateBusinessName__c = 'Ultimate Parent Co'
            , DNBoptimizer__LocationType__c = '1'));
}

dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Root'
        , DNBoptimizer__DUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='1'));
dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Co 2'
        , DNBoptimizer__DUNSNumber__c='22000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c= PREFIX +' Root'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='2'));
dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Co 3'
        , DNBoptimizer__DUNSNumber__c='23000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='22000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c=PREFIX +' Co 2'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='2'));
dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Co 4'
        , DNBoptimizer__DUNSNumber__c='24000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='23000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c=PREFIX +' Co 3'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='2'));
dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Co 5'
        , DNBoptimizer__DUNSNumber__c='25000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='24000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c=PREFIX +' Co 4'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='2'));
dnBRecords.add(new DNBoptimizer__DnBCompanyRecord__c(Name=PREFIX +' Co 6'
        , DNBoptimizer__DUNSNumber__c='26000000'+ POST_NUMBER
        , DNBoptimizer__ParentDUNSNumber__c='25000000'+ POST_NUMBER
        , DNBoptimizer__ParentBusinessName__c=PREFIX +' Co 5'
        , DNBoptimizer__GlobalUltimateDUNSNumber__c='21000000'+ POST_NUMBER
        , DNBoptimizer__GlobalUltimateBusinessName__c=PREFIX +' Root'
        , DNBoptimizer__LocationType__c='2'));
for(DNBoptimizer__DnBCompanyRecord__c r : dnBRecords) {
    r.DNBoptimizer__BusinessName__c = r.Name;
}
List<Database.SaveResult> saveResults = Database.insert(dnBRecords, dmlOptions);
for (Database.SaveResult sr : saveResults) {
    System.debug('RESULT.DNB.isSuccess:'+sr.isSuccess());
}

System.debug('INSERT.dnBRecords:'+dnBRecords);
Integer i = 0;
for(DNBoptimizer__DnBCompanyRecord__c r : dnBRecords) {
    System.debug('INSERT.Index:'+i+ ' dnBRecord.Id:' +r.Id+' Name:'+ r.Name);
    i++;
}


//HierarchyAPI.setTriggerDisabled();
Boolean customDnB = true;
String ACCOUNT_DNB_RECORD_ID_FIELD = 'DNBoptimizer__DnBCompanyRecord__c';
String ACCOUNT_DNB_DUNS_FIELD = 'DNBoptimizer__DNB_D_U_N_S_Number__c';
String DNB_DUNS_FIELD = 'DNBoptimizer__DUNSNumber__c';

Boolean useNewFields = true;
String DUNS_FIELD = 'trachier__test_dunsnumber__c';// DUNS__c
String PARENT_DUNS_FIELD = 'trachier__test_parent_duns__c';// PARENT_DUNS__c
String GU_FIELD = 'trachier__test_gu_duns__c';// '+@SOURCE_GU_FIELD+'
String PARENT_DUNS_NAME_FIELD = 'trachier__test_parent_primname__c';// 'trachier__test_parent_primname__c';// PARENT_DUNS_NAME__c
String GU_NAME_FIELD = 'trachier__test_gu_primname__c';// GU_Name__c
String DU_FIELD = 'trachier__test_headquarters_duns__c';// 'test_headquarters_duns__c';// GU_Name__c
if (useNewFields) {
    DUNS_FIELD = 'trachier__test_dunsnumber__c';
    PARENT_DUNS_FIELD = 'trachier__test_parent_duns__c';
    GU_FIELD = 'trachier__test_gu_duns__c';
    PARENT_DUNS_NAME_FIELD = 'trachier__test_parent_primname__c';
    GU_NAME_FIELD = 'trachier__test_gu_primname__c';
    DU_FIELD = 'trachier__test_headquarters_duns__c';
}


Database.SaveResult saveResult;
Integer currentIndex = 1;//Ultimate Parent Co : TestUtils.TEST_DATA_DnB_Ultimate_Parent_Index
if (PREFIX == 'Sample') {
    Account globalAccount = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
    globalAccount.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
    globalAccount.put(ACCOUNT_DNB_DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    if (customDnB) {
        globalAccount.put(DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
        globalAccount.put(PARENT_DUNS_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
        globalAccount.put(PARENT_DUNS_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
        globalAccount.put(GU_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
        globalAccount.put(GU_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
    }
    saveResult = Database.insert(globalAccount, dmlOptions);
    System.debug('RESULT.globalAccount:'+saveResult.success);

    System.debug('INSERT.globalAccount:' + globalAccount.Id + ' Name:' + globalAccount.Name);


    currentIndex = 2;//Parent Co : TestUtils.TEST_DATA_DnB_Parent_Index
    Account parentAccount = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
    parentAccount.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
    parentAccount.put(ACCOUNT_DNB_DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    parentAccount.put('ParentId', globalAccount.Id);
    if (customDnB) {
        parentAccount.put(DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
        parentAccount.put(PARENT_DUNS_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
        parentAccount.put(PARENT_DUNS_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
        parentAccount.put(GU_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
        parentAccount.put(GU_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
    }
    saveResult = Database.insert(parentAccount, dmlOptions);
    System.debug('RESULT.parentAccount:'+saveResult.success);

    System.debug('INSERT.parentAccount:' + parentAccount.Id + ' Name:' + parentAccount.Name);


    currentIndex = 0;//Standalone Co : TestUtils.TEST_DATA_DnB_Standalone_Index
    Account standAloneAcct = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
    standAloneAcct.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
    standAloneAcct.put(ACCOUNT_DNB_DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    if (customDnB) {
        currentIndex = currentIndex;
        standAloneAcct.put(DUNS_FIELD, (String) dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
        standAloneAcct.put(PARENT_DUNS_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
        standAloneAcct.put(PARENT_DUNS_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
        standAloneAcct.put(GU_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
        standAloneAcct.put(GU_NAME_FIELD, (String) dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
    }
    saveResult = Database.insert(standAloneAcct, dmlOptions);
    System.debug('RESULT.standAloneAcct:'+saveResult.success);

    System.debug('INSERT.standAloneAcct:' + standAloneAcct.Id + ' Name:' + standAloneAcct.Name);
    currentIndex = 6;//Sample Root : TestUtils.TEST_DATA_DnB_SampleRoot_Index
}
else {
    currentIndex = 0;
}


Account accountLevel0 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel0.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel0.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel0.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel0.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel0.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel0.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel0.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel0.put('BillingCountry','Canada');
accountLevel0.put('BillingState','British Columbia');
accountLevel0.put('BillingCity', 'Vancouver');
accountLevel0.put('BillingPostalCode', '000001');
System.debug('accountLevel0:'+accountLevel0);
saveResult = Database.insert(accountLevel0, dmlOptions);
System.debug('RESULT.accountLevel0:'+saveResult.isSuccess());

System.debug('INSERT.accountLevel0:'+accountLevel0.Id+' Name:'+ accountLevel0.Name);


currentIndex++;// = 7;//Sample Co 2 : TestUtils.TEST_DATA_DnB_Sample2_Index
Account accountLevel1 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel1.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel1.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel1.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel1.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel1.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel1.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel1.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel1.put('ParentId' , accountLevel0.Id);
accountLevel1.put('BillingCountry','Canada');
accountLevel1.put('BillingState','Alberta');
accountLevel1.put('BillingCity', 'Calgary');
accountLevel1.put('BillingPostalCode', '000002');
System.debug('accountLevel1:'+accountLevel1);
saveResult = Database.insert(accountLevel1, dmlOptions);
System.debug('RESULT.accountLevel1:'+saveResult.isSuccess());

System.debug('INSERT.accountLevel1:'+accountLevel1.Id+' Name:'+ accountLevel1.Name);


currentIndex++;// = 8;//Sample Co 3 : TestUtils.TEST_DATA_DnB_Sample3_Index
Account accountLevel2 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel2.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel2.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel2.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel2.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel2.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel2.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel2.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel2.put('ParentId' , accountLevel1.Id);
accountLevel2.put('BillingCountry','Canada');
accountLevel2.put('BillingState','Ontario');
accountLevel2.put('BillingCity', 'Toronto');
accountLevel2.put('BillingPostalCode', '000003');
System.debug('accountLevel2:'+accountLevel2);
saveResult = Database.insert(accountLevel2, dmlOptions);
System.debug('RESULT.accountLevel2:'+saveResult.isSuccess());

System.debug('INSERT.accountLevel2:'+accountLevel2.Id+' Name:'+ accountLevel2.Name);

currentIndex++;// = 9;//Sample Co 4 : TestUtils.TEST_DATA_DnB_Sample4_Index
Account accountLevel3 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel3.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel3.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel3.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel3.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel3.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel3.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel3.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel3.put('ParentId' , accountLevel2.Id);
accountLevel3.put('BillingCountry','Canada');
accountLevel3.put('BillingState','Ontario');
accountLevel3.put('BillingCity', 'Mississauga');
accountLevel3.put('BillingPostalCode', '000003');
System.debug('accountLevel3:'+accountLevel3);
saveResult = Database.insert(accountLevel3, dmlOptions);
System.debug('RESULT.accountLevel3:'+saveResult.isSuccess());
System.debug('INSERT.accountLevel3:'+accountLevel3.Id+' Name:'+ accountLevel3.Name);

currentIndex++;// = 10;
Account accountLevel4 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel4.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel4.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel4.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel4.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel4.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel4.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel4.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel4.put('ParentId' , accountLevel3.Id);
accountLevel4.put('BillingCountry','Canada');
accountLevel4.put('BillingState','British Columbia');
accountLevel4.put('BillingCity', 'Burnaby');
accountLevel4.put('BillingPostalCode', '000001');
System.debug('accountLevel4:'+accountLevel4);
saveResult = Database.insert(accountLevel4, dmlOptions);
System.debug('RESULT.accountLevel4:'+saveResult.isSuccess());
System.debug('INSERT.accountLevel4:'+accountLevel4.Id+' Name:'+ accountLevel4.Name);


currentIndex++;// = 11;
Account accountLevel5 = new Account(name = dnBRecords[currentIndex].Name, phone = TestUtils.PHONE, type = TestUtils.TYPE, AnnualRevenue = 2500000);
accountLevel5.put(ACCOUNT_DNB_RECORD_ID_FIELD, dnBRecords[currentIndex].Id);
accountLevel5.put(ACCOUNT_DNB_DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
if (customDnB) {
    accountLevel5.put(DUNS_FIELD, (String)dnBRecords[currentIndex].get(DNB_DUNS_FIELD));
    accountLevel5.put(PARENT_DUNS_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentDUNSNumber__c'));
    accountLevel5.put(PARENT_DUNS_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__ParentBusinessName__c'));
    accountLevel5.put(GU_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateDUNSNumber__c'));
    accountLevel5.put(GU_NAME_FIELD, (String)dnBRecords[currentIndex].get('DNBoptimizer__GlobalUltimateBusinessName__c'));
}
accountLevel5.put('ParentId' , accountLevel4.Id);
accountLevel5.put('BillingCountry','Canada');
accountLevel5.put('BillingState','British Columbia');
accountLevel5.put('BillingCity', 'Coquitlam');
accountLevel4.put('BillingPostalCode', '000001');
System.debug('accountLevel5:'+accountLevel5);

saveResult = Database.insert(accountLevel5, dmlOptions);
System.debug('RESULT.accountLevel5:'+saveResult.isSuccess());

System.debug('INSERT.accountLevel5:'+accountLevel5.Id+' Name:'+ accountLevel5.Name);

//HierarchyAPI.setTriggerEnabled();
if (disableTrigger) TracHier.HierarchyAPI.setTriggerEnabled();
/*


List<Account> accounts = [SELECT Id FROM Account WHERE
        DNBoptimizer__DNB_D_U_N_S_Number__c IN ('100000000', '110000000', '120000000', '130000000', '140000000', '150000000', '210000000', '220000000', '230000000', '240000000', '250000000', '260000000')
 OR  Id IN ('0018F00000PnnCaQAJ', '0018F00000PnnCbQAJ','0018F00000PnnCcQAJ', '0018F00000PnnCdQAJ', '0018F00000PnnCeQAJ', '0018F00000PnnCfQAJ')];
System.debug('accounts.size:'+accounts.size());
delete accounts;

List<DNBoptimizer__DnBCompanyRecord__c> dnBRecords = [SELECT Id FROM DNBoptimizer__DnBCompanyRecord__c 
WHERE DNBoptimizer__DUNSNumber__c IN ('100000000', '110000000', '120000000', '130000000', '140000000', '150000000', '210000000', '220000000', '230000000', '240000000', '250000000', '260000000')
OR DNBoptimizer__GlobalUltimateDUNSNumber__c IN ('100000000', '110000000', '120000000', '130000000', '140000000', '150000000', '210000000', '220000000', '230000000', '240000000', '250000000', '260000000')];
System.debug('dnBRecords.size:'+dnBRecords.size());
delete dnBRecords;




 */


/*
List<Account> accounts = [SELECT Id, Name, trachier__test_gu_duns__c FROM Account WHERE trachier__test_gu_duns__c='210000000'];

delete accounts;
 */