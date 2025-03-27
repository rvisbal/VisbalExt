Integer leadCount = [SELECT COUNT() FROM Lead];
System.debug('LEAD Count:'+ leadCount);

Integer convertedCount = [SELECT COUNT() FROM Lead WHERE IsConverted=true];
System.debug('LEAD Converted Count:'+ convertedCount);

Integer accountCount = [SELECT COUNT() FROM Account];
System.debug('Account Count:'+ accountCount);

Integer ccCount = [SELECT COUNT() FROM TracHier__Master_Account__c ];
System.debug('CC Count:'+ ccCount);

Integer memberCount = [SELECT COUNT() FROM TracHier__Master_Account_Member__c ];
System.debug('Members Count:'+ memberCount);

Integer hierLogsCount = [SELECT COUNT() FROM TracHier__History_Log__c];
System.debug('HIERARCHY LOGS Count:'+ hierLogsCount);

Integer completeLogsCount = [SELECT COUNT() FROM TracRTC__History_Log__c];
System.debug('COMPLETE LOGS Count:'+ completeLogsCount);

List<AggregateResult> topGroups = [
        SELECT Name, Count(Id) total
        FROM TracRTC__History_Log__c

        GROUP BY Name
        ORDER BY Count(Id) DESC
];

// Display the results
List<String> dunsSamples = new List<String>();
for(AggregateResult ar : topGroups) {
    System.debug('TracRTC__History_Log__c: ' + ar.get('Name') + ' -- TOTAL: ' + ar.get('total'));
}
