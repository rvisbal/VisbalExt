// Jest unit tests for OrgTabView logic.
// These tests verify the behavior of the _flattenOrgGroups method, which flattens OrgGroups into a single array.

import { OrgTabView } from '../../src/views/orgTab';
import { OrgGroups, SalesforceOrg } from '../../src/utils/orgUtils';

describe('OrgTabView', () => {
  // This test checks that _flattenOrgGroups correctly flattens all org group arrays into a single array.
  it('flattens org groups', () => {
    const orgGroups: OrgGroups = {
      devHubs: [{ alias: 'devhub' } as SalesforceOrg],
      sandboxes: [{ alias: 'sandbox' } as SalesforceOrg],
      scratchOrgs: [],
      nonScratchOrgs: [],
      other: []
    };
    // @ts-ignore: private method
    const flat = new OrgTabView({} as any)._flattenOrgGroups(orgGroups);
    expect(flat.length).toBe(2);
    expect(flat[0].alias).toBe('devhub');
    expect(flat[1].alias).toBe('sandbox');
  });
}); 