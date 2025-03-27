//simulate the scheduler Rollup
List<TracHier.RollupService.JobType> jobTypes = new List<TracHier.RollupService.JobType>();
jobTypes.add(TracHier.RollupService.JobType.ROLLUP );
TracHier.RollupService sample = new TracHier.RollupService(jobTypes);
Integer kpisInterval= 1;//SCHEDULLER
//RollupService.rollupBatch();
//Totals are always calculated for the current month 
RollupService.rollupBatch(jobTypes, kpisInterval, HierarchyMetadataUtils.getDefaultHierarchyFactory());


/*
    RollupService.getIntervalDateField(bridge); //filter by Created date if not given    
    private static String getIntervalDateField(Bridge__c bridge) {
        if (bridge.Interval_Date_Field__c != null) return bridge.Interval_Date_Field__c;
        return 'CreatedDate';
    }
 */