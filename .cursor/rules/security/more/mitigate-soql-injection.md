# Mitigate SOQL Injection

## Learning Objectives
After completing this unit, you'll be able to:

- Define how SOQL differs from SQL
- Explain SOQL vulnerabilities
- Learn to prevent SOQL injection attacks

## Salesforce Object Query Language Versus Structured Query Language

As a Salesforce developer, you know that on the Lightning Platform we use SOQL not SQL. While the languages are similar in many respects, SOQL is essentially a customized version of SQL developed specifically for the Salesforce platform.

Let's dig into the ways that SOQL differs from SQL. For starters, SOQL is a language exclusively for querying the database rather than modifying data like in traditional SQL. Here is a list of what SOQL does not have:

- **INSERT, UPDATE, or DELETE statements** - It only has SELECT statements
- **Command execution**
- **JOIN statement** - However, you can include information from parent or other related objects (of up to 5 levels higher or lower on the relationship graph) such as `SELECT Name, Phone, Account.Name, Child.Field FROM Contact`
- **UNION operator**
- **Ability to chain queries together**
## Is SOQL Vulnerable to Injection Attacks?

With all these limitations enforced by the platform, you might wonder if executing an injection attack is even possible. Unfortunately, a developer can still trust user input incorrectly, leading to an exposure of information via what is referred to as a SOQL injection attack.

Imagine that we have a developer org called School District Management that we use to manage and defend our School District Platform. Let's walk through an example in our imaginary School District developer org to see how this can be exploited.

In this org we've developed a custom page that enables users to search through their districts to get an overview of the personnel. This list is filterable by providing a title or an age filter in the search box.

Typing in a title filter like "teacher" returns a list of people with the title "teacher".

Let's take a look at the underlying SOQL query that's being used by the application:

```apex
String query = 'SELECT Id, Name, Title__c FROM Books';
String whereClause = 'Title__c like \'%'+textualTitle+'%\' ';
List<Books> whereclause_records = database.query(query+' where '+whereClause);
```

The application takes in the `textualTitle` parameter submitted by the user and inserts it directly into the SOQL query. This behavior can open a vulnerability to SOQL injection! Remember, SOQL injection occurs when an attacker modifies the structure of the query.

A more complicated filter can change the behavior of the underlying query. For instance, we can enter a filter in the title search to have the database identify personnel with low-performance ratings: 

```
%' and Performance_rating__c<2 and name like '%
```

This works because the user input is concatenated into the SOQL query without any validation, enabling the attacker to close the single quote for the title parameter and add another condition to the query. This results in a syntactically valid query.

**Before:**
```apex
Title__c like '%'+textualTitle+'%'
```

**After:**
```apex
Title__c like '%%' and Performance_rating__c<2 and name like '%%';
```
## SOQL Injection Prevention

As you learned in the previous unit, a SOQL injection attack can be used by attackers to access otherwise restricted data in your org. So how do you prevent this?

You can use several techniques to prevent SOQL injection, but how you use them depends on what you're trying to accomplish with your query. We cover the following techniques in this unit:

1. **Static queries with bind variables**
2. **String.escapeSingleQuotes()**
3. **Type casting**
4. **Replacing characters**
5. **Allowlisting**
### Static Query and Bind Variables

The first and most recommended method to prevent SOQL injection is to use static queries with bind variables. Consider the following query:

**Vulnerable code:**
```apex
String query = 'select id from contact where firstname =\''+var+'\'';
queryResult = Database.execute(query);
```

As you've learned, using user input (the `var` variable) directly in a SOQL query opens the application up to SOQL injection. To mitigate the risk, translate the query into a static query like this:

**Secure code:**
```apex
queryResult = [SELECT id FROM contact WHERE firstname = :var];
```

This step ensures that the user input is treated as a variable, not as an executable element of the query. If a user types a value like `test' LIMIT 1` when the database performs the query, it looks for any first names that are "test' LIMIT 1" in the database. With a bind variable, the attacker can't break out and control the SOQL query.

#### Bind Variable Limitations

While using bind variables is recommended, there are some limitations. They can only be used in the following types of clauses:

- The search string in **FIND** clauses
- The filter literals in **WHERE** clauses
- The value of the **IN** or **NOT IN** operator in WHERE clauses, enabling filtering on a dynamic set of values. Note that this is of particular use with a list of IDs or strings, though it works with lists of any type
- The division names in **WITH DIVISION** clauses
- The numeric value in **LIMIT** clauses
- The numeric value in **OFFSET** clauses

However, you can use other mitigation techniques if bind variables aren't possible in your code.

### Typecasting

Another strategy to prevent SOQL injection is to use typecasting. By casting all variables as strings, user input can drift outside of expectation. By typecasting variables as integers or Booleans, when applicable, erroneous user input is not permitted. The variable can then be transformed back to a string for insertion into the query using `string.valueOf()` (remember with dynamic queries, the `database.query()` method accepts only a string).

Once again, we would use our imaginary School District developer org to search personnel by providing an age filter value.

If we enter a simple SOQL injection payload "1 limit 1" and search, the query returns only one result, because our input is treated as code.

**Vulnerable code:**
```apex
public String textualAge {get; set;}
[...]
whereClause += 'Age__c >' + textualAge + '';
whereclause_records = database.query(query + ' where ' + whereClause);
```

You can see that variable `textualAge` is placed directly into the query, allowing our input to be treated as code. You can also see no single quotes around `textualAge` in the query.

If you were to test out `string.escapeSingleQuotes()`, you would edit the controller and wrap `textualAge` in `string.escapeSingleQuotes()`.

If you apply the same SOQL injection payload of "1 limit 1" to your search, you see that the SOQL injection still functions.

The actual query with your SOQL injection would look like:

```sql
SELECT Name, Role__c, Title__c, Age__c FROM Personnel__c WHERE Age__c > 1 LIMIT 1
```

There are no single quotes within this query, so `string.escapeSingleQuotes()` has no effect. You need another solution to prevent SOQL injection.

**Secure code:**
You would want to edit the controller again and remove `string.escapeSingleQuotes()`. Then you'd want to find the variable declaration for `textualAge` and change it from `String` to `Integer` (age is an integer, so this typecasting is appropriate). Because the query is expecting a string but `textualAge` is now an integer, you need to wrap `textualAge` in `string.valueOf()` as follows:

```apex
whereClause += 'Age__c >' + string.valueOf(textualAge) + '';
```

If you submitted your SOQL injection payload "1 limit 1" in the search area again, you would see an error rather than a SOQL injection. "1 limit 1" is not considered an integer, so the SOQL injection is prevented.

Typecasting can be used to prevent many kinds of SOQL injection where the user is not entering text.

### Escaping Single Quotes

Another cross-site scripting (XSS) mitigation option that is commonly used by developers who include user-controlled strings in their queries is the platform-provided escape function `string.escapeSingleQuotes()`.

This function escapes any instance that it finds of a single quote mark (') in the string using the backslash (\) escape character. This prevents an attacker's input from being treated as code by constraining them to the boundary of the string.

Let's walk through an example. Similar to the previous SOQL injection example, but in this case, you search for personnel by title. Let's see if our previous payload would work in this case to leak information about low performers in the school district.

Our previous payload `%' and Performance_rating__c<2 and name like '%` returns a single result as before. However, through SOQL injection we've learned a piece of information we were not supposed to know!

**Vulnerable code:**
```apex
String query = 'SELECT Id, Name, Title__c FROM Books';
String whereClause = 'Title__c like \'%'+textualTitle+'%\' ';
List<Books> whereclause_records = database.query(query+' where '+whereClause);
```

The search string `textualTitle` is placed directly into the query string, allowing user input to be treated as code and enabling this SOQL injection. Because the variable is wrapped in single quotes in the final query, we can fix this SOQL injection through `string.escapeSingleQuotes()`.

**Secure code:**
Replacing the where clause with the following code wrapping `textualTitle` with `String.escapeSingleQuotes()` will prevent an attacker from using SOQL injection to modify the query behavior:

```apex
String whereClause = 'Title__c like \'%'+String.escapeSingleQuotes(textualTitle)+'%\' ';
```

This time we're using `string.escapeSingleQuotes()` to make sure the user-provided single quote is escaped to appear as data rather than as a query control character. Thus, the application is no longer vulnerable.

**Important Note:** This solution applies only to strings. Not all variables are strings, and not all SOQL injection attacks require using a single quote character. Other solutions are required to prevent SOQL injections in these types of code.

### Replacing Characters

What if you have a scenario in your code where `string.escapeSingleQuotes`, typecasting, and allowlisting are not valid defenses against SOQL injection? A final tool in your tool belt is character replacement, also known as blocklisting. This approach removes "bad characters" from user input.

In security, blocklisting will never be as strong as allowlisting, because it is far easier to predict a few good inputs than to predict all possible bad inputs. That said, blocklisting through character replacement can often effectively mitigate simple problems.

**Vulnerable code:**
```apex
String query = 'select id from user where isActive='+var;
```

While typecasting or allowlisting would be effective here, removing all spaces from the supplied input would be an equally effective approach. In that way, a SOQL injection payload of:

```
true AND ReceivesAdminInfoEmails=true
```

becomes:

```
trueANDRecievesAdminInfoEmails=true
```

**Secure code:**
The code to remove all spaces from a string can be written as follows:

```apex
String query = 'select id from user where isActive='+var.replaceAll('[^\\w]','');
```

⚠️ **Note:** While it should not be considered the first line of defense, development is about flexible solutions to varied problems, and this solution is a valid one to keep in mind.

### Allowlisting

We just learned that we can't use `string.escapeSingleQuotes()` to prevent all forms of SOQL injection.

The previous solution of typecasting was effective only against non-string input. What if user-controlled values need to be text but don't have any single quotes? This often occurs when other query portions are put under a user's control, like the SELECT fields or the FROM object.

Another way to prevent SOQL injection without `string.escapeSingleQuotes()` is allowlisting. Create a list of all "known good" values that the user is allowed to supply. If the user enters anything else, you reject the response.

**Example:**
```apex
// Define allowlist of safe field names
Set<String> allowedFields = new Set<String>{'Name', 'Email', 'Phone', 'Id'};

// Validate user input against allowlist
if (!allowedFields.contains(userSelectedField)) {
    throw new InvalidParameterValueException('Invalid field specified');
}

// Use validated input in query
String query = 'SELECT ' + userSelectedField + ' FROM Account LIMIT 10';
List<Account> results = Database.query(query);
```

## Conclusion

Now that you know how attackers can use a SOQL injection attack to access otherwise restricted data in your org, you can prevent it by using the techniques we've discussed. The key mitigation strategies are:

1. **Preferred:** Use static queries with bind variables whenever possible
2. Use `String.escapeSingleQuotes()` for string inputs
3. Apply typecasting for non-string inputs
4. Implement allowlisting for known good values
5. Use character replacement as a last resort

Always prioritize security-first development practices to protect your Salesforce org from injection attacks.