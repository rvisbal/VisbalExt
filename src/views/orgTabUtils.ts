// Utility function to filter orgs by type and search term
export interface Org {
  alias?: string;
  username?: string;
  type?: string;
  orgId?: string;
  [key: string]: any;
}

export function filterOrgs(orgs: Org[], selectedType: string = 'ALL', searchTerm: string = ''): Org[] {
  let filteredOrgs = selectedType === 'ALL' ? orgs : orgs.filter((org: Org) => {
    switch (selectedType) {
      case 'DEV_HUB':
        return org.type && org.type.toLowerCase().includes('dev hub');
      case 'NON_SCRATCH':
        return org.type && org.type.toLowerCase().includes('sandbox');
      case 'SCRATCH':
        return org.type && org.type.toLowerCase().includes('scratch');
      case 'OTHER':
        return !org.type;
      default:
        return true;
    }
  });

  if (searchTerm && searchTerm.trim() !== '') {
    const term = searchTerm.trim().toLowerCase();
    filteredOrgs = filteredOrgs.filter((org: Org) =>
      (org.alias && org.alias.toLowerCase().includes(term)) ||
      (org.username && org.username.toLowerCase().includes(term)) ||
      (org.type && org.type.toLowerCase().includes(term)) ||
      (org.orgId && org.orgId.toLowerCase().includes(term))
    );
  }

  return filteredOrgs;
} 