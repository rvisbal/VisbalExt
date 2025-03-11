import { LogEvent, ILogView } from './types';

/**
 * Call Tree view component for visualizing the call hierarchy
 */
export class CallTreeView implements ILogView {
  /**
   * Render the call tree view
   * @param events Log events to render
   * @param container HTML element to render into
   */
  public render(events: LogEvent[], container: HTMLElement): void {
    // Clear the container
    container.innerHTML = '';
    
    // Create filter controls
    const filterControls = document.createElement('div');
    filterControls.className = 'filter-controls';
    filterControls.innerHTML = `
      <div class="filter">
        <button class="expand-btn">Expand</button>
        <button class="collapse-btn">Collapse</button>
        <label>
          <input type="checkbox" class="details-checkbox" />
          Details
        </label>
        <label>
          <input type="checkbox" class="debug-only-checkbox" />
          Debug Only
        </label>
      </div>
    `;
    container.appendChild(filterControls);
    
    // Create the table header
    const tableHeader = document.createElement('div');
    tableHeader.className = 'call-tree-header';
    tableHeader.innerHTML = `
      <div class="call-tree-row header">
        <div class="call-tree-cell name">Name</div>
        <div class="call-tree-cell namespace">Namespace</div>
        <div class="call-tree-cell dml">DML Count</div>
        <div class="call-tree-cell soql">SOQL Count</div>
        <div class="call-tree-cell rows">Rows Count</div>
        <div class="call-tree-cell total-time">Total Time (ms)</div>
        <div class="call-tree-cell self-time">Self Time (ms)</div>
      </div>
    `;
    container.appendChild(tableHeader);
    
    // Create the table body
    const tableBody = document.createElement('div');
    tableBody.className = 'call-tree-body';
    container.appendChild(tableBody);
    
    // Get code units and sort them by timestamp
    const codeUnits = events.filter(e => e.category === 'CodeUnit' || e.category === 'Execution')
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Build the tree
    this.renderCodeUnits(codeUnits, tableBody);
    
    // Add event listeners
    setTimeout(() => {
      // Expand/collapse buttons
      document.querySelector('.expand-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
          row.classList.add('expanded');
          const childrenContainer = row.nextElementSibling as HTMLElement;
          if (childrenContainer && childrenContainer.classList.contains('children-container')) {
            childrenContainer.style.display = 'block';
          }
        });
      });
      
      document.querySelector('.collapse-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
          row.classList.remove('expanded');
          const childrenContainer = row.nextElementSibling as HTMLElement;
          if (childrenContainer && childrenContainer.classList.contains('children-container')) {
            childrenContainer.style.display = 'none';
          }
        });
      });
      
      // Toggle row expansion
      document.querySelectorAll('.call-tree-row.expandable').forEach(row => {
        row.addEventListener('click', (e) => {
          const element = e.currentTarget as HTMLElement;
          element.classList.toggle('expanded');
          const childrenContainer = element.nextElementSibling as HTMLElement;
          if (childrenContainer && childrenContainer.classList.contains('children-container')) {
            childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
          }
        });
      });
    }, 0);
  }
  
  /**
   * Render code units recursively
   */
  private renderCodeUnits(codeUnits: LogEvent[], container: HTMLElement, level: number = 0): void {
    // Filter out units that have parents (they will be rendered by their parents)
    const rootUnits = codeUnits.filter(unit => !unit.parent);
    
    for (const unit of rootUnits) {
      this.renderCodeUnit(unit, container, level);
    }
  }
  
  /**
   * Render a single code unit and its children
   */
  private renderCodeUnit(unit: LogEvent, container: HTMLElement, level: number): void {
    // Create the row
    const row = document.createElement('div');
    row.className = `call-tree-row ${unit.children && unit.children.length > 0 ? 'expandable expanded' : ''}`;
    row.style.paddingLeft = `${level * 20}px`;
    
    // Format the name with an expand/collapse icon if it has children
    const hasChildren = unit.children && unit.children.length > 0;
    const nameWithIcon = hasChildren ? 
      `<span class="expand-icon">▼</span> ${unit.message}` : 
      `<span class="spacer"></span> ${unit.message}`;
    
    row.innerHTML = `
      <div class="call-tree-cell name">${nameWithIcon}</div>
      <div class="call-tree-cell namespace">${unit.namespace || 'Unknown'}</div>
      <div class="call-tree-cell dml">${unit.dmlCount || 0}</div>
      <div class="call-tree-cell soql">${unit.soqlCount || 0}</div>
      <div class="call-tree-cell rows">${unit.rowsCount || 0}</div>
      <div class="call-tree-cell total-time">${this.formatTime(unit.totalTime || 0)}</div>
      <div class="call-tree-cell self-time">${this.formatTime(unit.selfTime || 0)}</div>
    `;
    
    container.appendChild(row);
    
    // Render children if any
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'children-container';
      childrenContainer.style.display = 'block'; // Initially expanded
      container.appendChild(childrenContainer);
      
      for (const child of unit.children!) {
        this.renderCodeUnit(child, childrenContainer, level + 1);
      }
    }
  }
  
  /**
   * Format time value with proper precision
   */
  private formatTime(time: number): string {
    return time.toFixed(3);
  }
} 