# Secure Coding: SQL Injection

Understand how SOQL injection works and how to secure SOQL Queries.

## SQL and SOQL Injection: What is it?

**SQL (Structured Query Language) injection** is a common application security flaw that results from insecure construction of database queries with user-supplied data. Embedding user data in queries instead of using type-safe bind parameters can let malicious input alter the query structure, bypassing or changing application logic. SQL injection flaws are serious. A single flaw anywhere in your application can allow an attacker to read, modify, or delete your entire database.

Apex doesn't use SQL; it uses its own database query language, **SOQL (Salesforce Object Query Language)**. SOQL was designed to give you most of the power of SQL, while also protecting against most attacks. For example, in SOQL you can only use `SELECT` instead of `UPDATE` or `DELETE`. As a result, you can't delete or modify data. SOQL injection is less risky than SQL injection, but the attacks are nearly identical.

📚 **Additional Training:** Before we dig into more details of how SOQL injection works, know that we also have great training on Trailhead about it. See: [Mitigate SOQL Injection](https://trailhead.salesforce.com/content/learn/modules/secure_coding/secure_coding_sql_injection)

## Sample Vulnerability

Consider this code in an Apex controller that constructs a SOQL query to retrieve information about a custom object in Salesforce called 'Personnel'. The `userInputTitle` variable is user input from a web page form, and is concatenated into the query string where clause to form the final request to the database.

**Vulnerable code:**
```apex
public List<Personnel__c> whereclause_records { get; set; }
public String userInputTitle { get; set; }

public PageReference whereclause_search() {
    String query = 'SELECT Name, Role__c, Title__c, Age__c FROM Personnel__c';
    
    if (!Schema.sObjectType.Personnel__c.fields.Name.isAccessible() || 
        !Schema.sObjectType.Personnel__c.fields.Role__c.isAccessible() || 
        !Schema.sObjectType.Personnel__c.fields.Title__c.isAccessible() || 
        !Schema.sObjectType.Personnel__c.fields.Age__c.isAccessible()) {
        return null; // You might want to handle this more gracefully
    }
    
    String whereClause = '';
    
    if (userInputTitle != null && userInputTitle != '') {
        whereClause += 'Title__c LIKE \'%' + userInputTitle + '%\''; // ⚠️ VULNERABLE LINE
        whereclause_records = Database.query(query + ' WHERE ' + whereClause);
    }
    
    return null; // Consider returning a specific PageReference if applicable
}
```

### Attack Example

Consider if someone entered into the `userInputTitle`:
```
'% OR Performance_rating__c < 2 OR Name LIKE '%'
```

After concatenating the components together, the final query string becomes:
```sql
SELECT Name, Role__c, Title__c, Age__c 
FROM Personnel__c 
WHERE Title__c LIKE '%%' 
   OR Performance_rating__c < 2 
   OR Name LIKE '%%'
```

The `%'` finishes up the wildcard matching for `Title__c` and ends the string. The user input appends to the query, adding a filter for the performance rating of the Personnel object. The attacker's string has now changed the way the query is behaving and gives them access to information that the developer didn't intend.

### Impact

SOQL injection can be seen as a bypass of CRUD and FLS checks. Since the only action that is supported is `SELECT`, the worst that can happen is that a user gets access to data that they can't see. Similarly, not checking a user's access levels before returning data can have a significant impact.

## Is My Application Vulnerable?

When you use dynamic queries without enforcing the use of bind variables, also known as parameterized queries, your application becomes vulnerable to security threats. To keep your data safe, it's important to always use parameterized queries when working with dynamic queries.

## How to Secure my SOQL Queries

When designing SOQL (Salesforce Object Query Language) queries, there are three main areas where you can customize the behavior of the query based on user input:

1. **Select fields:** Choose which fields to select from an object
2. **From object:** Specify the object the query is running against  
3. **Where clause:** Modify the behavior of the WHERE clause to filter which subset of objects is returned

### Securing the WHERE Clause

The WHERE clause is the simplest to secure, and, to customize the WHERE clause, use a parameterized query. This feature exists in most query language frameworks. For now, let's look at how it works in Apex. Let's revisit the example from earlier, and see how it can be written securely:

**Secure code:**
```apex
public List<Personnel__c> whereclause_records { get; set; }
public String userInputTitle { get; set; }

public PageReference whereclause_search() {
    if (!Schema.sObjectType.Personnel__c.fields.Name.isAccessible() ||
        !Schema.sObjectType.Personnel__c.fields.Role__c.isAccessible() || 
        !Schema.sObjectType.Personnel__c.fields.Title__c.isAccessible() ||
        !Schema.sObjectType.Personnel__c.fields.Age__c.isAccessible()) {
        return null;
    }
    
    if (userInputTitle != null && userInputTitle != '') {
        String qTitle = '%' + userInputTitle + '%'; 
        whereclause_records = [SELECT Name, Role__c, Title__c, Age__c 
                               FROM Personnel__c   
                               WHERE Title__c LIKE :qTitle]; // ✅ SECURE - Using bind variable
    }

    return null; // Consider returning a meaningful PageReference
}
```

You'll notice there's less code here than in our manual example. In Apex, writing a query inside braces will directly execute the query inside it without calling `database.query()`. The variable prepended with a colon (`:qTitle`) is a **bind variable**. The database layer, which in this case is SOQL, treats everything in that variable as data. This applies even if there are unusual characters in the variable. However, no matter what the user types in, they can't break out of the intended behavior of the query and manipulate the query.

### Limitations of Bind Variables

Parameterized queries are limited to binding a variable inside the WHERE clause of the query. This means that if you want dynamic fields or object names, you can't replace your dynamic query with a parameterized one. So, how can you make sure that your queries are safe? In Apex, you can write a sanitizing function:

### Validating Object Names

```apex
public boolean isSafeObject(String objName) {
    Map<String, Schema.SObjectType> schemaMap = Schema.getGlobalDescribe();
    Schema.SObjectType myObj = schemaMap.get(objName);
    
    return myObj != null && myObj.getDescribe().isAccessible();
}
```

For your actual database query, you could construct it as follows:

```apex
public PageReference doQuery() {
    String myQuery = 'SELECT Name, Address FROM ' + objName + ' WHERE Name LIKE \'%Sir%\'';

    if (!isSafeObject(objName)) {
        return null;
    } else {
        if (!Schema.getGlobalDescribe().get(objName).fields.getMap().get('Name').isAccessible() ||
            !Schema.getGlobalDescribe().get(objName).fields.getMap().get('Address').isAccessible()) {
            return null;
        }
        List<SObject> records = Database.query(myQuery);
        return null; // You should return something meaningful here
    }
}
```

🔐 **Security Check:** Ensure that the object name provided by the user is valid and that the user has the necessary access permissions. Check for any invalid characters that could be used for SOQL injection and confirm that the user has access to the object. This not only protects against SOQL injection but also serves as a CRUD check.

### Validating Field Names

As previously mentioned, SOQL injection can be seen as another form of CRUD/FLS bypass. However, there's one final customization scenario for your SOQL queries to consider. If you know the object and the filtering criteria, but you don't know if you must access the field, then it's similar scenario as this code:

```apex
public boolean isSafeField(String fieldName, String objName) {
    Map<String, Schema.SObjectType> schemaMap = Schema.getGlobalDescribe();
    Schema.SObjectType myObj = schemaMap.get(objName);

    if (myObj != null && myObj.getDescribe().isAccessible()) { 
        Schema.SObjectField myField = myObj.getDescribe().fields.getMap().get(fieldName);
        
        if (myField != null && myField.getDescribe().isAccessible()) {
            return true;
        }
    }
    
    return false;
}
```

And then again, for the query:

```apex
public PageReference doQuery() {
    String objName = 'myObj__c';
    String myQuery = 'SELECT ' + field1 + ', ' + field2 + ' FROM ' + objName + ' WHERE Name LIKE \'%Sir%\'';

    if (!(isSafeField(field1, objName) && isSafeField(field2, objName))) {
        return null;
    } else {
        List<SObject> records = Database.query(myQuery);
        
        // Process records as needed (e.g., set to a property or perform logic)
    }
    
    return null; // Update to return a meaningful PageReference as needed
}
```

✅ **Best Practice:** In this example, we haven't only prevented SOQL injection but also have carried out our CRUD and FLS checks for the object and the associated fields.

Use the methods that we've discussed so far in situations. If you're considering alternative methods to prevent SOQL injection, you're likely to approach the problem correctly, increasing your chances of success with these methods. However, for other languages and frameworks if you don't have the APIs that Salesforce provides, we'll briefly cover other sanitization methods.

## Alternate Methods to Secure SOQL Queries

### 1. Escape Single Quotes

If you have a dynamic query with a variable in a String, such as:

```apex
String query = 'select Name, Title from myObject__c where Name like \'%'+name+'%\'';
```

Here the `name` variable is being concatenated inside two single quotes in the query. One way to stop injection is to avoid single quotes. It's best to use a library made for the language you're using. If Apex, implement the following `String.escapeSingleQuotes()` function call. The result is:

```apex
String query = 'select Name, Title from myObject__c where Name like \'%'+String.escapeSingleQuotes(name)+'%\'';
```

This safeguards your data from query tampering. However, it doesn't prevent users from accessing unauthorized data.

⚠️ **Limitation:** It only applies when a variable is within single quotes. If you have a boolean or otherwise unquoted field with user input, escaping single quotes won't help protect against injection. Thus, it isn't recommended to use this method.

### 2. Typecasting / Whitelisting

Consider using typecasting and/or whitelisting variables as another method. Typecasting involves converting user input to expected types like boolean or integer. If there's an issue converting data types, it means the data is wrong. You can then safely stop the process.

Whitelisting is similar, if you have an input that you know the structure of. For example, you can select fields from an object by verifying user input against a predefined list of field names.

**Typecasting example:**
```apex
String query = 'SELECT Name, Address FROM Object__c WHERE isActive = ' + (input ? 'TRUE' : 'FALSE');
```

**Whitelisting example:**
```apex
Set<String> fields = new Set<String>();
fields.add('myField1');
fields.add('myField2');
fields.add('myField3');

if (!fields.contains(inputField)) { 
    throw new CustomException('Invalid field: ' + inputField);
}
```

⚠️ **Limitation:** These methods are good for preventing injection attacks, but don't guarantee that the user will have access to the objects returned. Hence we also don't recommend using these methods except in edge cases.

## How to Ensure SOQL Query Security with Third-Party Libraries and APIs

There are a number of third-party libraries that can help you write SOQL queries. In general, refactor these libraries before you try to use them. Verifying injection fixes is easiest and safest when you validate fields in the same location that you run your database queries.

Most libraries will expose a SOQL layer that's easy to use, but doesn't provide any validation. If you want to use these libraries, you must modify them so that the framework level is secure. You can now use the library without having to worry about sanitizing every database call in your code.

### API Considerations

The REST and SOAP APIs allow end users to submit arbitrary SOQL strings. However, because the APIs include built-in checks for sharing and CRUD/FLS permissions, it won't result to SOQL injection. This means that end users are only allowed to see or modify records and fields that they already have access to. 

Alternatively, when making SOQL calls in Apex Code, no CRUD/FLS checks are performed (and sharing checks are only performed if the `with sharing` keyword is used). Allowing end users to control the contents of a SOQL query issued in Apex code is a serious security vulnerability, but it's not a vulnerability when end users control the contents of a SOQL query via the API.

## How Do I Protect My Non-Salesforce Application?

Using platform-specific solutions for typed, parameterized queries is the best way to prevent SQL injection. Filtering and sanitizing user input before queries is essential, especially if your platform lacks native support for parameterized queries.

Allowing only "known good" characters (such as with a regular expression, where that's sufficient) is the best defense strategy. For example, a phone number could be validated to only include numerals and a name to include only letters and spaces. Attempting to filter out "known bad" characters or strings (also known as "blacklisting") can be prone to error. Attackers can use alternate encodings, double-up quotes, or other tricks to foil such filters. Remove single-quote, double-quote, hyphen, NULL, and newline characters.

### Additional Resources

For more information on SQL injection attacks and defense see:

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [OWASP Blind SQL Injection](http://www.owasp.org/index.php/Blind_SQL_Injection)
- [Microsoft SQL Injection Prevention](http://technet.microsoft.com/en-us/library/ee391960.aspx)
## Best Practices for Preventing SQL Injection Across Various Technologies

### ASP.NET

**Best Practices:**
- Sanitize input data before querying
- Use type-safe SQL parameters consistently, whether with stored procedures or dynamic SQL
- Use SqlParameterCollection for type checking and length validation

**Reference:** [How To: Protect From SQL Injection in ASP.NET](https://docs.microsoft.com/en-us/previous-versions/msp-n-p/ff648339(v=pandp.10))

### LINQ

**Best Practices:**
- Use Language-Integrated Query (LINQ) to prevent SQL injection attacks in ASP.NET applications
- LINQ technology enables database constructs to be treated as native objects in .NET programming languages
- LINQ to SQL abstracts interactions with the database into an object model that avoids SQL injection by automatically building parameterized queries

**Reference:** [LINQ to SQL: .NET Language-Integrated Query for Relational Data](https://docs.microsoft.com/en-us/dotnet/framework/data/adonet/sql/linq/)

### Java

**Best Practices:**
- Use commercial source code analysis tools (for example, Checkmarx, Coverity, Fortify, Klocwork, Ounce Labs) for large applications and codebases
- For smaller applications, manual review and enforcement of coding standards are sufficient
- Review all JDBC code; using `java.sql.Statement` for queries handling user data poses a risk
- Use `java.sql.CallableStatement` and `java.sql.PreparedStatement` exclusively for user data

**Example:**
```java
PreparedStatement pstmt = con.prepareStatement("UPDATE USERS SET SALARY = ? WHERE ID = ?");
pstmt.setBigDecimal(1, new BigDecimal("30000.00"));
pstmt.setInt(2, 20487);
pstmt.executeUpdate();
```

**Additional Guidelines:**
- Use Hibernate and other ORM frameworks to help prevent SQL injection with prepared statements
- Be cautious when using query languages like HQL directly. Avoid deprecated methods like `session.find` and use overloads that support bind variables instead
- Always validate and sanitize inputs even when using ORMs

**References:** 
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Hibernate Security Guidance](https://owasp.org/www-project-cheat-sheets/cheatsheets/Hibernate_Security_Guidance.html)

### PHP (PDO)

**Best Practices:**
- Use the PHP Data Objects (PDO) extension for parameterized queries and prepared statements
- Note that `PDO::prepare` provides good SQL injection defenses, but this only guarantees protection if the underlying PDO driver and database support parameterized queries natively
- Always sanitize data before passing it to `PDO::prepare` as a defense-in-depth measure
- Use regular expressions to limit input values to expected formats

**Reference:** [PHP Security guidance for Prepared Statements and Stored Procedures](https://www.php.net/manual/en/security.database.sql-injection.php)

### Ruby on Rails

**Best Practices:**
- Active Record objects provide limited automatic protection from SQL injection
- When using `Model.find(id)` or `Model.find_by_X(X)`, an escaping routine is applied automatically to eliminate `'`, `"`, the NULL character and line breaks
- For SQL fragments, such as conditions fragments (`:conditions => "..."`), `connection.execute` or `Model.find_by_sql`, sanitization must be applied manually
- Use conditions as an array or hash form for sanitization

**Example:**
```ruby
Model.find(:first, :conditions => ["login = ? AND password = ?", entered_user_name, entered_password])
```

Note that in other cases, you can call `sanitize_sql_array` or `sanitize_sql_for_conditions` manually (for Rails 2.0) or use the deprecated `sanitize_sql` for earlier versions.

**Reference:** [OWASP Ruby on Rails Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Ruby_on_Rails_Cheat_Sheet.html)
## How Can I Test My Application?

### Black-Box Testing

Some testing for SQL injection can be performed in a black-box manner. Putting characters like single quotes and dashes into form fields and looking for database error messages will find the most obvious SQL injection flaws. Unfortunately, these techniques can't find all SQL injection flaws. Client-side validation, escaping or double-quoting blocks are simple attacks but can be bypassed easily by an attacker.

### Static Code Analysis

The most reliable way to identify SQL injection flaws is through **manual code review** or with a **static code analysis tool**. Code analysis tools (commercial and free) are listed for individual development platforms in the previous sections. 

🔍 **Salesforce Developers:** Developers on the Lightning Platform can use the first on-demand source code analysis tool built solely for Platform as a Service. Visit the [Security Source Code Scanner page](https://security.force.com/) for more details.

### Manual Code Review Guidelines

If performing manual source code review, verify that all queries that include user data are built using **bind variables** instead of string concatenation. A bind variable is a placeholder in a query that allows the database engine to insert dynamic values in a type-safe manner. The exact syntax varies somewhat from platform to platform, but typically these placeholders are question marks (`?`) or a colon-prefixed variable name (`:variable`).

**Example of secure code:**
```java
PreparedStatement query = con.prepareStatement("SELECT * FROM users WHERE userid = ? AND password = ?");
query.setInt(1, Request.form("user").intValue());
query.setString(2, getSaltedHash(Request.form("password")));
query.executeQuery();
```

### Stored Procedures

Stored procedures that only use static SQL text are also acceptable, but beware of stored procedures that use `exec` or similar constructs to build dynamic SQL internally.

## Conclusion

SQL and SOQL injection vulnerabilities remain a critical security concern for applications handling user input in database queries. By following the practices outlined in this document:

1. **Prioritize bind variables** (parameterized queries) as your first line of defense
2. **Validate and sanitize** user input rigorously  
3. **Implement proper CRUD/FLS checks** in Salesforce applications
4. **Use platform-specific security features** and frameworks
5. **Conduct regular security reviews** and testing

Remember: Security is not a one-time implementation but an ongoing practice that requires vigilance and regular updates as your application evolves.

