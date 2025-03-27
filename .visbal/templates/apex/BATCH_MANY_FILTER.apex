/**
 * Anonymous Apex Script: Batch Filter Processing for Hierarchies
 * Purpose: Process multiple DUNS numbers through hierarchy batch processing
 * 
 * Script performs the following steps:
 * 1. Display current hierarchies
 * 2. Clean up history logs
 * 3. Abort any running jobs
 * 4. Create and run filters for DUNS numbers
 */

//#region CONFIGURATION
final String HIERARCHY_ID = '7a84362a1b250a8915b2';
final Set<String> DUNS_NUMBERS = new Set<String>{
    '414955513', '594019635', '659315150',
    '915104779', '800008286', '865755961'
};
//#endregion

try {
    //#region HIERARCHIES
    System.debug('--- Step 1: Retrieving Hierarchies ---');
    List<TracHier__Hierarchy__c> hierarchies = [
        SELECT Id, Name, TracHier__Label__c, TracHier__Type__c, 
               TracHier__Enable_Master_Accounts__c 
        FROM TracHier__Hierarchy__c
    ];
    
    for (TracHier__Hierarchy__c h : hierarchies) {
        System.debug(LoggingLevel.INFO, String.format(
            'Hierarchy Found - Name: {0}, Label: {1}, Type: {2}',
            new List<String>{ h.Name, h.TracHier__Label__c, h.TracHier__Type__c }
        ));
    }
    //#endregion

    //#region LOGS
    System.debug('--- Step 2: Cleaning History Logs ---');
    List<TracHier__History_Log__c> logs = [
        SELECT Id 
        FROM TracHier__History_Log__c 
        LIMIT 20000
    ];
    if (!logs.isEmpty()) {
        System.debug(LoggingLevel.INFO, 'Deleting ' + logs.size() + ' history logs');
        delete logs;
    }
    //#endregion LOGS

    //#region ABORT_JOBS
    System.debug('--- Step 3: Checking Running Jobs ---');
    Map<Id, AsyncApexJob> runningJobs = new Map<Id, AsyncApexJob>([
        SELECT Id 
        FROM AsyncApexJob 
        WHERE Status = 'Processing'
    ]);
    
    if (!runningJobs.isEmpty()) {
        System.debug(LoggingLevel.INFO, 'Aborting ' + runningJobs.size() + ' running jobs');
        for (Id jobId : runningJobs.keySet()) {
            System.abortJob(jobId);
        }
    }
    //#endregion ABORT_JOBS

    //#region FILTERS
    System.debug('--- Step 4: Creating and Executing Filters ---');
    List<TracHier__Filter__c> filters = new List<TracHier__Filter__c>();

    // Create filters for DUNS number field
    for (String dunsNumber : DUNS_NUMBERS) {
        filters.add(new TracHier__Filter__c(
            TracHier__Field__c = 'trachier__do_not_use_dnbconnect_dunsnumber__c',
            TracHier__Operator__c = 'EQUALS',
            TracHier__Order_Number__c = 1,
            TracHier__SObjectType__c = 'Account',
            TracHier__Set_Number__c = 1,
            TracHier__Value__c = dunsNumber
        ));
    }

    // Create filters for Global Ultimate DUNS field
    for (String dunsNumber : DUNS_NUMBERS) {
        filters.add(new TracHier__Filter__c(
            TracHier__Field__c = 'trachier__do_not_use_dnbconnect_gu_duns__c',
            TracHier__Operator__c = 'EQUALS',
            TracHier__Order_Number__c = 1,
            TracHier__SObjectType__c = 'Account',
            TracHier__Set_Number__c = 1,
            TracHier__Value__c = dunsNumber
        ));
    }
    //#endregion FILTERS

    //#region FILTER_LOGIC
    List<String> filterIndices = new List<String>();
    for (Integer i = 1; i <= filters.size(); i++) {
        filterIndices.add(String.valueOf(i));
    }
    String filterLogic = String.join(filterIndices, ' OR ');
    
    System.debug(LoggingLevel.INFO, 'Executing batch with ' + filters.size() + 
        ' filters for ' + DUNS_NUMBERS.size() + ' DUNS numbers');
    System.debug(LoggingLevel.INFO, 'Filter Logic: ' + filterLogic);
    //#endregion FILTER_LOGIC

    //#region EXECUTE_BATCH
    TracHier.HierarchyLinkerBatch.runSelectedWithFilters(
        filters,
        filterLogic,
        null,
        new List<String>{ HIERARCHY_ID }
    );

    System.debug('--- Batch Processing Initiated Successfully ---');
    //#endregion EXECUTE_BATCH

} catch (Exception e) {
    //#region ERROR_HANDLING
    System.debug(LoggingLevel.ERROR, 'Error in batch processing: ' + 
        e.getMessage() + '\n' + e.getStackTraceString());
    throw e;
    //#endregion ERROR_HANDLING
}