# Apex Transactions and Governor Limits

Apex Transactions ensure the integrity of data. Apex code runs as part of atomic transactions. Governor execution limits ensure the efficient use of resources on the Lightning Platform multitenant platform.

## Overview

🔄 **Transaction Scope:** Most of the governor limits are **per transaction**, and some aren't, such as 24-hour limits.

💡 **Best Practice:** To make sure Apex adheres to governor limits, certain design patterns should be used, such as:
- **Bulk calls** for processing multiple records
- **Foreign key relationships** in queries for efficiency

---

## Apex Transactions

An **Apex transaction** represents a set of operations that are executed as a single unit. All DML operations in a transaction must complete successfully. If an error occurs in one operation, the entire transaction is rolled back and no data is committed to the database.

### Transaction Boundaries

🔲 **Transaction Boundary Examples:**
- **Trigger** execution
- **Class method** invocation
- **Anonymous block of code**
- **Visualforce page** processing
- **Custom Web service method** call

### Key Characteristics

- ⚛️ **Atomic Operations:** All operations succeed or all fail
- 🔄 **Rollback on Error:** Any error rolls back the entire transaction
- 🛡️ **Data Integrity:** Ensures consistent data state

---

## Execution Governors and Limits

Because Apex runs in a **multitenant environment**, the Apex runtime engine strictly enforces limits so that runaway Apex code or processes don't monopolize shared resources.

⚠️ **Critical:** If some Apex code exceeds a limit, the associated governor issues a **runtime exception that can't be handled**.

### Governor Limit Types

| Limit Type | Description |
|------------|-------------|
| **Per-Request** | Limits applied to each individual request/transaction |
| **Per-Org** | Daily/organizational limits (e.g., 24-hour limits) |
| **Concurrent** | Limits on simultaneous operations |

---

## Set Up Governor Limit Email Warnings

You can specify users in your organization to receive an email notification when they invoke Apex code that surpasses **50% of allocated governor limits**.

### Important Notes

📧 **Email Scope:** 
- Only **per-request limits** are checked for sending email warnings
- **Per-org limits** like concurrent long-running requests are **not checked**

✅ **Email Limit Exemption:** These email notifications **do not count** against the daily single email limit.

---

## Running Apex within Governor Execution Limits

When you develop software in a **multitenant cloud environment** such as the Lightning platform, you don't have to scale your code, because the Lightning platform does it for you.

### Multitenant Environment Benefits

🏢 **Platform Scaling:** The Lightning Platform handles scaling automatically
🔒 **Resource Protection:** Because resources are shared in a multitenant platform, the Apex runtime engine enforces limits to ensure that **no one transaction monopolizes shared resources**

### Development Best Practices

1. **Design for Bulk Operations** - Process multiple records efficiently
2. **Monitor Governor Limits** - Stay aware of limit consumption  
3. **Implement Efficient Queries** - Use selective queries with proper indexing
4. **Handle Large Data Sets** - Use batch processing for large volumes
5. **Test with Realistic Data** - Validate performance with production-like data volumes

💡 **Remember:** Governor limits are not obstacles but guidelines to help you write efficient, scalable code in the shared Salesforce environment.
