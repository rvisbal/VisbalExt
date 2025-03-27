string profileName = 'System Administrator';//'Standard User'
Profile profileId = [SELECT Id FROM Profile WHERE Name =: profileName LIMIT 1];
  
User newUser = new User(LastName = 'Visbal',
		FirstName='Ricardo',
		Alias = 'rvisbal',
		Email = 'rvisbal@tractionondemand.com',
		Username = 'rvisbal@tractionondemand.hierarchy.lwc.demo',
		ProfileId = profileId.Id,
		TimeZoneSidKey = 'GMT',
		LanguageLocaleKey = 'en_US',
		EmailEncodingKey = 'UTF-8',
		LocaleSidKey = 'en_US' );
insert newUser;

system.debug('---------------------');
system.debug(newUser);
System.setPassword(newUser.Id, 'developer!@#123');
//Password = 'sample!@#321',
system.debug('---------------------');

PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Traction_Hierarchies_Admin'];

LIST<PermissionSetAssignment> permissions = new List<PermissionSetAssignment>();
permissions.Add(new PermissionSetAssignment(PermissionSetId = ps.Id, AssigneeId = newUser.Id));
insert permissions;