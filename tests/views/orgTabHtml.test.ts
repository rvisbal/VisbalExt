// Jest unit tests for getOrgTabHtml function.
// These tests verify that the HTML rendering logic for the orgs tab works as expected for different states.

import { getOrgTabHtml } from '../../src/views/orgTabHtml';

describe('getOrgTabHtml', () => {
  // This test checks that the loading state renders the loading message in the HTML.
  it('renders loading state', () => {
    const html = getOrgTabHtml([], true, '');
    expect(html).toContain('Loading orgs...');
  });

  // This test checks that the error state renders the error message in the HTML.
  it('renders error state', () => {
    const html = getOrgTabHtml([], false, 'Some error');
    expect(html).toContain('Some error');
  });

  // This test checks that a table with org data renders the org alias and username in the HTML.
  it('renders orgs table', () => {
    const orgs = [
      { alias: 'DevHub', username: 'devhub@example.com', type: 'Dev Hub' }
    ];
    const html = getOrgTabHtml(orgs, false, '');
    expect(html).toContain('DevHub');
    expect(html).toContain('devhub@example.com');
  });

  // check the type listbox filter functionality
  it('filters orgs by type', () => {
    const orgs = [
      { alias: 'DevHub', username: 'devhub@example.com', type: 'Dev Hub' },
      { alias: 'Sandbox', username: 'sandbox@example.com', type: 'Sandbox' }
    ];
    const html = getOrgTabHtml(orgs, false, '');
    expect(html).toContain('Dev Hub');
    expect(html).toContain('Sandbox');
  });


  // check the search input functionality
  it('searches orgs by alias', () => {
    const orgs = [
      { alias: 'DevHub', username: 'devhub@example.com', type: 'Dev Hub' },
      { alias: 'Sandbox', username: 'sandbox@example.com', type: 'Sandbox' }
    ];
    const html = getOrgTabHtml(orgs, false, '');
    expect(html).toContain('DevHub');
    expect(html).toContain('Sandbox');
  });


}); 