# Cache Management Rules

## Overview
The cache system manages user IDs, organization IDs, and view-specific organization selections for the active project where the extension is loaded.



### Cache Management Architecture
- **Centralized Service**: All cache operations MUST be handled through a single service layer
- **Primary Services**: Use either `src\services\cacheService.ts` OR `src\services\storageService.ts` (choose ONE as the single source of truth)
- **Design Principle**: Avoid creating multiple methods that perform the same cache operations
- **Rationale**: Multiple cache management methods lead to:
  - Inconsistent data states
  - Difficult maintenance
  - Higher error rates
  - Loss of data integrity
- **Best Practice**: All other components should use the centralized cache service methods rather than implementing their own cache logic

## 1. User ID Cache (`cache.user-id`)

### Purpose
Retrieve user and organization IDs, and manage tab-specific aliases.

### Configuration
- **Source of Truth**: User IDs and Org IDs are stored in `.visbal/cache/user-ids.json`
- **File Structure**: The `user-ids.json` file should follow this structure:

```json
{
  "versionId": "1.1.0",
  "CODE_REVIEW": {
    "userId": "005Sv00000CNwPNIA1",
    "orgId": "00DSv000006evCDMAY"
  },
  "SECURITY_REVIEW": {
    "userId": "005As00000FlRIgIAN",
    "orgId": "00DAs00000qHlCfMAK"
  }
}
```

## 2. View Organization Selections (`cache.view-org-selections`)

### Purpose
Manage selected organization aliases per view. If a specific view does not have a selection in this cache, the org-selector value for that view (TAB) should be used.

### Configuration
- **File Structure**: The `view-org-selections.json` file should follow this structure:

```json
{
  "versionId": "1.1.0",
  "testExplorer": {
    "alias": "CODE_REVIEW",
    "timestamp": "2025-09-02T07:54:14.652Z"
  }
}
```

### 2.1 If there is nothing on  cache.view-org-selections the org-selector should intialize on the CURSOR IDE project default on getDefaultTargetOrgFromConfig  

### View Identifiers
The system uses specific `ViewId` enumerations to identify different tabs/views:

```typescript
export enum ViewId {
    APEX_LOG = 'apexLog',
    EXECUTE_APEX = 'executeApex',
    TEST_EXPLORER = 'testExplorer',
    SOQL = 'soql',
    TRACTION = 'traction'
}
```

### Alias Usage Rules
1. **Primary Rule**: Each tab must use its selected ALIAS, which is dictated by the org-selector dropdown list
2. **Retrieval Method**: For any tab, the alias can be retrieved using `OrgUtils.getSelectedOrgForView(ViewId.{TAB_NAME})`
   - Example: For the Apex Log tab, use `OrgUtils.getSelectedOrgForView(ViewId.APEX_LOG)`
3. **Fallback Behavior**: If the view-specific alias does not exist, use `getDefaultTargetOrgFromConfig()` and store it in the cache. This value should already be used by the org-selector dropdown in that view.

## Implementation Notes
- Each tab has its own view identifier from the `ViewId` enum
- Cache entries should include version tracking for compatibility
- Timestamps should be stored for selection tracking and potential cache invalidation