# Writing Apex

Apex is like Java for Salesforce. It enables you to add and interact with data in the Lightning Platform persistence layer. It uses classes, data types, variables, and if-else statements. You can make it execute based on a condition, or have a block of code execute repeatedly.

## Data Types and Variables

Apex uses data types, variables, and related language constructs such as:

- **Enums** - Named constants for better code readability
- **Constants** - Immutable values defined at compile time  
- **Expressions** - Combinations of variables, operators, and method calls
- **Operators** - Mathematical, logical, and comparison operators
- **Assignment statements** - Operations that assign values to variables

## Control Flow Statements

Apex provides several control flow mechanisms to control the execution of your code:

- **If-else statements** - Conditional execution based on boolean expressions
- **Switch statements** - Multi-way branching based on expression values
- **Loops** - Repetitive execution of code blocks (for, while, do-while)

Statements are generally executed line by line, in the order they appear. With control flow statements, you can make Apex code execute based on a certain condition, or have a block of code execute repeatedly.

## Working with Data in Apex

You can add and interact with data in the Lightning Platform persistence layer through several key concepts:

- **sObject data type** - The main data type that holds data objects
- **Data Manipulation Language (DML)** - Used to insert, update, delete, and undelete records
- **Query languages** - SOQL (Salesforce Object Query Language) and SOSL (Salesforce Object Search Language) to retrieve data

### Key Data Operations:
- `insert` - Create new records
- `update` - Modify existing records  
- `delete` - Remove records
- `undelete` - Restore deleted records
- `upsert` - Insert or update records based on external ID

## Document Your Apex Code

**ApexDoc** is a standardized comment format that makes it easier for humans, documentation generators, and AI agents to understand your codebase. We recommend using ApexDoc comments to facilitate code collaboration and increase long-term code maintainability.

### ApexDoc Features:
- **Based on JavaDoc standard** - Familiar syntax for Java developers
- **Specialized tags** - Salesforce-specific documentation tags
- **Guidelines** - Best practices tailored to Apex and the Salesforce ecosystem
- **Tool integration** - Compatible with documentation generators and AI assistants

### Example ApexDoc Comment:
```apex
/**
 * @description Handles account management operations
 * @author Your Name
 * @date 2024-01-01
 */
public class AccountManager {
    
    /**
     * @description Creates a new account with validation
     * @param accountName The name of the account to create
     * @param accountType The type of account (Customer, Partner, etc.)
     * @return Account The newly created account record
     * @throws DmlException When account creation fails
     */
    public static Account createAccount(String accountName, String accountType) {
        // Implementation here
    }
}
```

💡 **Best Practice:** Always document your public methods, classes, and complex business logic using ApexDoc comments to improve code maintainability and team collaboration.