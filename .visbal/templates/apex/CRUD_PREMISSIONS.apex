// Find crud permissions for specific user
String objectName = 'PartyRoleRelation'; // Add the object name here

String userId = UserInfo.getUserId(); // Add the user Id here

List<String> fieldNames = new List<String>();
Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
if (globalDescribe == null || !globalDescribe.containsKey(objectName)) {
    System.debug('Error: Object ' + objectName + ' not found in schema');
    return;
}

Schema.SObjectType objectType = globalDescribe.get(objectName);
if (objectType == null) {
    System.debug('Error: Could not get SObjectType for ' + objectName);
    return;
}

DescribeSObjectResult theSObjectTypeDescribe = objectType.getDescribe();
System.debug('Object: ' + objectName + ' -- isAccessible: ' + theSObjectTypeDescribe.isAccessible());
System.debug('Object: ' + objectName + ' -- isCreateable: ' + theSObjectTypeDescribe.isCreateable());
System.debug('Object: ' + objectName + ' -- isUpdateable: ' + theSObjectTypeDescribe.isUpdateable());

Map<String, SObjectField> fieldMap = theSObjectTypeDescribe.fields.getMap();
for (String field : fieldMap.keySet()) {
    DescribeFieldResult fieldDescribe = fieldMap.get(field).getDescribe();
    System.debug('Field: ' + fieldDescribe.getName() + ' -- createable: ' + fieldDescribe.isCreateable() + ' -- updatable:' + fieldDescribe.isUpdateable()  + ' -- accessible:' + fieldDescribe.isAccessible() + ' -- fieldtype:' + fieldDescribe.getType());
    fieldNames.add(fieldDescribe.getName());
}

List<String> durIds = new List<String>();
for(UserFieldAccess ufa : [
        SELECT FieldDefinitionId,FieldDefinition.QualifiedApiName FROM UserFieldAccess
        WHERE FieldDefinition.EntityDefinition.QualifiedApiName = :objectName
        AND FieldDefinition.QualifiedApiName IN :fieldNames
        AND User.Id = :userId]) {
    if (ufa.FieldDefinition != null && ufa.FieldDefinition.QualifiedApiName != null) {
        System.debug('UserFieldAccess -- Field: ' + ufa.FieldDefinition.QualifiedApiName + ' -- FieldDefinitionId:' + ufa.FieldDefinitionId);
        if (ufa.DurableId != null) {
            durIds.add(ufa.DurableId);
        }
    }
}

for(UserFieldAccess ufa : [SELECT Id, DurableId, UserId, User.Name, IsUpdatable, IsCreatable, IsAccessible, EntityDefinitionId, FieldDefinitionId
FROM UserFieldAccess
WHERE DurableId IN :durIds]) {
    if (ufa.DurableId != null && ufa.FieldDefinitionId != null) {
        System.debug('UserFieldAccess-- DurableId: ' + ufa.DurableId + ' -- createable: ' + ufa.IsCreatable + ' -- updatable:' + ufa.IsUpdatable  + ' -- accessible:' + ufa.IsAccessible + ' -- FieldDefinitionId: ' + ufa.FieldDefinitionId);
    }
}



