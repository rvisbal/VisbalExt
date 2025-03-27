// Function to update org list UI
function _updateOrgListUI(_orgSelector, orgs, fromCache = false, selectedOrg = null) {
    console.log('[VisbalExt.htmlTemplate] updateOrgListUI Updating org list UI with data:', orgs);
    console.log('[VisbalExt.htmlTemplate] updateOrgListUI Selected org:', selectedOrg);
    
    // Clear existing options
    _orgSelector.innerHTML = '';

    // Add refresh option at the top
    const refreshOption = document.createElement('option');
    refreshOption.value = '__refresh__';
    refreshOption.textContent = '↻ Refresh Org List';
    refreshOption.style.fontStyle = 'italic';
    refreshOption.style.backgroundColor = 'var(--vscode-dropdown-background)';
    _orgSelector.appendChild(refreshOption);

    // Add a separator
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '──────────────';
    _orgSelector.appendChild(separator);

    // Helper function to add section if it has items
    const addSection = (items, sectionName) => {
      if (items && items.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = sectionName;
        
        items.forEach(org => {
          const option = document.createElement('option');
          option.value = org.alias;
          option.textContent = org.alias || org.username;
          if (org.isDefault) {
            option.textContent += ' (Default)';
          }
          // Select the option if it matches the selected org
          option.selected = selectedOrg && org.alias === selectedOrg;
          optgroup.appendChild(option);
        });
        
        _orgSelector.appendChild(optgroup);
        return true;
      }
      return false;
    };

    let hasAnyOrgs = false;
    hasAnyOrgs = addSection(orgs.devHubs, 'Dev Hubs') || hasAnyOrgs;
    hasAnyOrgs = addSection(orgs.nonScratchOrgs, 'Non-Scratch Orgs') || hasAnyOrgs;
    hasAnyOrgs = addSection(orgs.sandboxes, 'Sandboxes') || hasAnyOrgs;
    hasAnyOrgs = addSection(orgs.scratchOrgs, 'Scratch Orgs') || hasAnyOrgs;
    hasAnyOrgs = addSection(orgs.other, 'Other') || hasAnyOrgs;

    if (!hasAnyOrgs) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No orgs found';
      _orgSelector.appendChild(option);
    }

    // If this was a fresh fetch (not from cache), update the cache
    if (!fromCache) {
      saveOrgCache(orgs);
    }

    // Store the selection
    if (selectedOrg) {
      _orgSelector.setAttribute('data-last-selection', selectedOrg);
    }
  }