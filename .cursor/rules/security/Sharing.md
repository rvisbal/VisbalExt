## Sharing Model Implementation

## Overview

The Force.com platform makes extensive use of data sharing rules. Each object can have unique permissions for which users and profiles can read, create, edit, and delete. These restrictions are enforced when using all standard controllers. When using a custom Apex class, the built-in profile permissions and field-level security restrictions are not respected during execution. The default behavior is that an apex class has the ability to read and update all data with the organization. Because these rules are not enforced, developers who use Apex must take care that they do not inadvertently expose sensitive data that would normally be hidden from users by profile-based permissions, field-level security, or organization-wide defaults. This is particularly true for Visualforce pages. Classes should explicity declare with sharing when possible.

The Lightning Platform makes extensive use of data sharing rules. Each object has permissions and can have sharing settings that users can read, create, edit, and delete. These settings are enforced when using all standard controllers.

When using an Apex class, the built-in user permissions and field-level security restrictions aren’t respected during execution. The default behavior is that an Apex class can read and update all data. Because these rules aren’t enforced, developers who use Apex must avoid inadvertently exposing sensitive data that’s normally hidden behind user permissions, field-level security, or defaults. For example, consider this Apex pseudo-code.

The with sharing keyword directs the platform to use the security sharing permissions of the user currently logged in, rather than granting full access to all records

### Requirements
- All entry points (Global or Controller classes) must use `with sharing`
- Only use `without sharing` for:
  - Non-entry point classes
  - Objects with security managed by code (e.g., wizard state, site fields)

### Best Practices
- Avoid using `with sharing` indiscriminately
- Assess sharing context based on business requirements
- Document any `without sharing` usage with justification

### Risk
- Method declared with '@AuraEnabled', it is accessible to all users in the organization and allows any user to invoke this function.
- if you've a limitation of declaring class as "with sharing" then the code should perform access control check by checking the profile of the caller,