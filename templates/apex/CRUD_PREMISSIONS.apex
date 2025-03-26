// Find crud permissions for specific user
String objectName = 'Territory__c'; // Add the object name here
List<String> fieldNames = new List<String>{
        'Name',
        'Full_name__c'
};
String userId = '005VC000006HkWAYA0'; // Add the user Id here
List<String> durIds = new List<String>();
for(UserFieldAccess ufa : [
        SELECT FieldDefinitionId,FieldDefinition.QualifiedApiName FROM UserFieldAccess
        WHERE FieldDefinition.EntityDefinition.QualifiedApiName = :objectName
        AND FieldDefinition.QualifiedApiName IN :fieldNames
        AND User.Id = :userId]) {
    System.debug('-- Field: ' + ufa.FieldDefinition.QualifiedApiName+ ' -- FieldDefinitionId:'+ufa.FieldDefinitionId);
    durIds.add(ufa.FieldDefinitionId + '.' + userId);
}
for(UserFieldAccess ufa : [SELECT Id, DurableId, UserId, User.Name, IsUpdatable, IsCreatable, IsAccessible, EntityDefinitionId, FieldDefinitionId
FROM UserFieldAccess
WHERE DurableId IN :durIds]) {
    System.debug('-- DurableId: ' + ufa.DurableId + ' :createable/updateable/accessible: ' + ufa.IsCreatable + '/' + ufa.IsUpdatable  + '/' + ufa.IsAccessible);
}

