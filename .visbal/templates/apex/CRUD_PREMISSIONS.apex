// Find crud permissions for specific user
String objectName = 'PartyRoleRelation'; // Add the object name here



String userId = UserInfo.getUserId(); 
String userProfileId = UserInfo.getProfileId();
List<String> identities = new List<String>{userId, userProfileId};
Boolean queryIdentity = true;

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
System.debug('Object: ' + objectName + ' -- isQueryable: ' + theSObjectTypeDescribe.isQueryable());
System.debug('Object: ' + objectName + ' -- isCustomSetting: ' + theSObjectTypeDescribe.isCustomSetting());
System.debug('Object: ' + objectName + ' -- isCustom: ' + theSObjectTypeDescribe.isCustom());
System.debug('Object: ' + objectName + ' -- getKeyPrefix: ' + theSObjectTypeDescribe.getKeyPrefix());


Map<String, SObjectField> fieldMap = theSObjectTypeDescribe.fields.getMap();
for (String field : fieldMap.keySet()) {
    DescribeFieldResult fieldDescribe = fieldMap.get(field).getDescribe();
    System.debug('Field: ' + fieldDescribe.getName() + ' -- createable: ' + fieldDescribe.isCreateable() + ' -- updatable:' + fieldDescribe.isUpdateable()  + ' -- accessible:' + fieldDescribe.isAccessible() + ' -- fieldtype:' + fieldDescribe.getType());
    fieldNames.add(fieldDescribe.getName());
}


for(ObjectPermissions op : [Select SobjectType ,ParentId, PermissionsEdit, PermissionsRead 
                                FROM ObjectPermissions
                                WHERE parentId IN :identities AND sObjectType=:objectName
                                ORDER BY ParentID, SobjectType ASC]) {
    System.debug('ObjectPermissions -- SobjectType: ' + op.SobjectType + ' -- ParentId: ' + op.ParentId + ' -- PermissionsEdit: ' + op.PermissionsEdit + ' -- PermissionsRead: ' + op.PermissionsRead);
}

fieldNames = new List<String>{'RoleName'};

if (queryIdentity) {

    for (FieldDefinition fd : [SELECT Id, DurableId, QualifiedApiName, EntityDefinitionId, NamespacePrefix, DeveloperName
                                FROM FieldDefinition 
                                WHERE EntityDefinitionId = :objectName]) {  
        System.debug('FieldDefinition -- DurableId: ' + fd.DurableId + ' -- QualifiedApiName: ' + fd.QualifiedApiName + ' -- EntityDefinitionId: ' + fd.EntityDefinitionId + ' -- NamespacePrefix: ' + fd.NamespacePrefix + ' -- DeveloperName: ' + fd.DeveloperName);


        List<String> durIds = new List<String>();
        for(UserFieldAccess ufa : [
                SELECT FieldDefinitionId, FieldDefinition.QualifiedApiName , DurableId, UserId, IsUpdatable, IsCreatable, IsAccessible, EntityDefinitionId
                FROM UserFieldAccess
                WHERE DurableId = :fd.DurableId
                AND User.Id = :userId ]) {
            if (ufa.FieldDefinition != null && ufa.FieldDefinition.QualifiedApiName != null) {
                System.debug('UserFieldAccess -- Field: ' + ufa.FieldDefinition.QualifiedApiName + ' -- FieldDefinitionId:' + ufa.FieldDefinitionId + ' -- DurableId: ' + ufa.DurableId + ' -- UserId: ' + ufa.UserId + ' -- IsUpdatable: ' + ufa.IsUpdatable + ' -- IsCreatable: ' + ufa.IsCreatable + ' -- IsAccessible: ' + ufa.IsAccessible + ' -- EntityDefinitionId: ' + ufa.EntityDefinitionId + ' -- FieldDefinitionId: ' + ufa.FieldDefinitionId);
                if (ufa.DurableId != null) {
                    durIds.add(ufa.DurableId);
                }
            }
        }
    
    }   

    String query = 'SELECT Count() FROM '+ objectName;
    System.debug('countQuery: ' + Database.countQuery(query));

    List<String> durIds = new List<String>();
    for(UserFieldAccess ufa : [
            SELECT FieldDefinitionId,FieldDefinition.QualifiedApiName FROM UserFieldAccess
            WHERE FieldDefinition.EntityDefinition.QualifiedApiName = :objectName
                AND DurableId IN :durIds
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
}


