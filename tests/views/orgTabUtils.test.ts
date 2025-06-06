// Jest unit tests for filterOrgs utility function in orgTabUtils.ts
// These tests verify that the org filtering and search logic works for all filter types and search scenarios.

import { filterOrgs } from '../../src/views/orgTabUtils';

describe('filterOrgs', () => {
  const orgs = [
    { alias: 'DevHub', username: 'devhub@example.com', type: 'Dev Hub' },
    { alias: 'Sandbox', username: 'sandbox@example.com', type: 'Sandbox' },
    { alias: 'Scratch1', username: 'scratch1@example.com', type: 'Scratch' },
    { alias: 'Other', username: 'other@example.com', type: '' }
  ];

  // This test checks that all orgs are returned when no filter or search is applied.
  it('returns all orgs for ALL type and empty search', () => {
    expect(filterOrgs(orgs, 'ALL', '').length).toBe(4);
  });

  // This test checks that only Dev Hub orgs are returned when DEV_HUB filter is applied.
  it('filters by DEV_HUB type', () => {
    const filtered = filterOrgs(orgs, 'DEV_HUB', '');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('DevHub');
  });

  // This test checks that only Sandbox orgs are returned when NON_SCRATCH filter is applied.
  it('filters by NON_SCRATCH type', () => {
    const filtered = filterOrgs(orgs, 'NON_SCRATCH', '');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Sandbox');
  });

  // This test checks that only Scratch orgs are returned when SCRATCH filter is applied.
  it('filters by SCRATCH type', () => {
    const filtered = filterOrgs(orgs, 'SCRATCH', '');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Scratch1');
  });

  // This test checks that only orgs with no type are returned when OTHER filter is applied.
  it('filters by OTHER type', () => {
    const filtered = filterOrgs(orgs, 'OTHER', '');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Other');
  });

  // This test checks that searching by alias returns the correct org.
  it('searches by alias', () => {
    const filtered = filterOrgs(orgs, 'ALL', 'devhub');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('DevHub');
  });

  // This test checks that searching by username returns the correct org.
  it('searches by username', () => {
    const filtered = filterOrgs(orgs, 'ALL', 'sandbox@example.com');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Sandbox');
  });

  // This test checks that searching by type returns the correct org.
  it('searches by type', () => {
    const filtered = filterOrgs(orgs, 'ALL', 'scratch');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Scratch1');
  });

  // This test simulates a user typing in the search box and checks that filtering updates as expected.
  it('simulates user typing and applies search filter', () => {
    // Simulate typing 'dev'
    let filtered = filterOrgs(orgs, 'ALL', 'dev');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('DevHub');

    // Simulate typing 'sand'
    filtered = filterOrgs(orgs, 'ALL', 'sand');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Sandbox');

    // Simulate typing 'scr'
    filtered = filterOrgs(orgs, 'ALL', 'scr');
    expect(filtered.length).toBe(1);
    expect(filtered[0].alias).toBe('Scratch1');

    // Simulate typing 'example'
    filtered = filterOrgs(orgs, 'ALL', 'example');
    expect(filtered.length).toBe(4);

    // Simulate typing 'notfound'
    filtered = filterOrgs(orgs, 'ALL', 'notfound');
    expect(filtered.length).toBe(0);
  });
}); 