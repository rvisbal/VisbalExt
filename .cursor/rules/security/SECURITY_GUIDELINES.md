# Salesforce Security Guidelines

## 1. CRUD and FLS Enforcement

### Overview
Object (CRUD) and Field Level Security (FLS) are configured on profiles and permission sets to restrict access to standard and custom objects and individual fields. Applications must enforce these settings and gracefully degrade when user access is restricted.

### Implementation Requirements
- All Apex classes must enforce CRUD and FLS checks before performing operations
- Use `isAccessible()`, `isCreateable()`, `isUpdateable()`, and `isDeletable()` methods appropriately
- Implement proper error handling for access violations

### Acceptable Bypass Cases
1. Creating roll-up summaries or aggregates that don't directly expose data
2. Modifying custom objects/fields like logs or system metadata
3. Cases where direct access creates a less secure security model

## 2. SOQL Injection Prevention

### Risk Description
SOQL injection occurs when user-controlled input is directly concatenated into SOQL queries, potentially allowing unauthorized data access.

### Prevention Measures
1. Use bind variables for user-controlled data in quoted contexts
2. Sanitize input using `String.escapeSingleQuotes()`
3. Use safe data types (integer, Id) for non-quoted data
4. Perform CRUD/FLS checks or whitelist validation for all user data

## 3. Sharing Model Implementation

### Requirements
- All entry points (Global or Controller classes) must use `with sharing`
- Only use `without sharing` for:
  - Non-entry point classes
  - Objects with security managed by code (e.g., wizard state, site fields)

### Best Practices
- Avoid using `with sharing` indiscriminately
- Assess sharing context based on business requirements
- Document any `without sharing` usage with justification

## 4. DML and SOQL Best Practices

### DML Operations
- Never perform DML operations inside loops
- Use collections to process multiple records
- Implement bulkification patterns

### SOQL Queries
- Always include WHERE clauses or LIMIT clauses
- Avoid queries without conditions
- Implement proper error handling for governor limits

## 5. UI Security Considerations

### Clickjacking Prevention
- Avoid using absolute/fixed positioning in CSS
- Implement proper frame-busting techniques
- Use appropriate security headers

### Information Disclosure
- Never expose sensitive data in debug statements
- Implement proper error handling without revealing system details
- Secure sensitive configuration data

## 6. Testing Requirements

### Security Testing
- Implement comprehensive test classes
- Include both positive and negative test scenarios
- Test CRUD/FLS enforcement
- Test sharing model implementation
- Test SOQL injection prevention

## 7. Code Review Checklist

### Security Checks
- [ ] CRUD/FLS checks implemented
- [ ] SOQL injection prevention
- [ ] Proper sharing model
- [ ] No DML in loops
- [ ] Proper SOQL query structure
- [ ] UI security measures
- [ ] Information disclosure prevention
- [ ] Comprehensive test coverage

## 8. Common Vulnerabilities to Avoid

1. Multiple triggers on same sObject
2. DML statements inside loops
3. Queries without WHERE or LIMIT clauses
4. Clickjacking vulnerabilities
5. Information disclosure in debug statements
6. Sharing violations
7. CRUD/FLS bypass without justification

## 9. References

- [Salesforce Security Guide](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/security_intro.htm)
- [CRUD and FLS Documentation](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/security_data_access.htm)
- [Apex Security Best Practices](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_security_best_practices.htm) 