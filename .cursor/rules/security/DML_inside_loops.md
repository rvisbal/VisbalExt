## DML and SOQL Best Practices

### DML Operations
- Never perform DML operations inside loops
- Use collections to process multiple records
- Implement bulkification patterns

### SOQL Queries
- Always include WHERE clauses or LIMIT clauses
- Avoid queries without conditions
- Implement proper error handling for governor limits