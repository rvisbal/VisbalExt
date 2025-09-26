## SOQL Injection Prevention

## Overview

SQL injection is a common application security flaw that results from insecure construction of database queries with user-supplied data. When queries are built directly with user data inlined or concatenated directly with the query text, instead of using type-safe bind parameters, malicious input may be able to change the structure of the query to bypass or change application logic. SQL injection flaws are extremely serious. A single flaw anywhere in your application may allow an attacker to read, modify or delete your entire database.

Apex does not use SQL, but its own database query language, SOQL. SOQL is much simpler and more limited in functionality than SQL. With SOQL injection, you can add additional conditions to the already existing query but cannot build a new query altogether. Therefore, the risks are much lower for SOQL injection than for SQL injection, but the attacks are nearly identical to traditional SQL injection.

### Risk Description
SOQL injection occurs when user-controlled input is directly concatenated into SOQL queries, potentially allowing unauthorized data access.

### Prevention Measures
1. Use bind variables for user-controlled data in quoted contexts
2. Sanitize input using `String.escapeSingleQuotes()`
3. Use safe data types (integer, Id) for non-quoted data
4. Perform CRUD/FLS checks or whitelist validation for all user data
5. **Always call `SoqlQuerySanitizer.validateWhereClause()` after `getWhereClause()`**

## ✅ Security Status: RESOLVED
**Date:** Current  
**Issue:** Missing `validateWhereClause()` call in `HierarchyBuilderCtlr.doSOSL()`  
**Fix Applied:** Added proper where clause validation on lines 110-113  
**Verification:** Multi-layer security validation confirmed