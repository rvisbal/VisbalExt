import { LogEvent, ILogView } from './types';

/**
 * Database view component for visualizing database operations
 */
export class DatabaseView implements ILogView {
  /**
   * Render the database view
   * @param events Log events to render
   * @param container HTML element to render into
   */
  public render(events: LogEvent[], container: HTMLElement): void {
    // Clear the container
    container.innerHTML = '';
    
    // Create the database container
    const databaseContainer = document.createElement('div');
    databaseContainer.className = 'database-container';
    
    // Filter SOQL and DML events
    const soqlEvents = events.filter(e => e.category === 'SOQL');
    const dmlEvents = events.filter(e => e.category === 'DML');
    
    // Add SOQL queries section
    const soqlSection = document.createElement('div');
    soqlSection.className = 'analysis-section';
    soqlSection.innerHTML = `
      <h3>SOQL Queries (${soqlEvents.length})</h3>
      ${this.renderQueryList(soqlEvents)}
    `;
    databaseContainer.appendChild(soqlSection);
    
    // Add DML operations section
    const dmlSection = document.createElement('div');
    dmlSection.className = 'analysis-section';
    dmlSection.innerHTML = `
      <h3>DML Operations (${dmlEvents.length})</h3>
      ${this.renderQueryList(dmlEvents)}
    `;
    databaseContainer.appendChild(dmlSection);
    
    // Add placeholder for future database features
    const placeholderSection = document.createElement('div');
    placeholderSection.className = 'analysis-section';
    placeholderSection.innerHTML = `
      <h3>Database Statistics</h3>
      <p class="placeholder-message">More detailed database analysis features will be implemented in future updates.</p>
    `;
    databaseContainer.appendChild(placeholderSection);
    
    container.appendChild(databaseContainer);
  }
  
  /**
   * Render a list of queries
   */
  private renderQueryList(events: LogEvent[]): string {
    if (events.length === 0) {
      return '<p class="placeholder-message">No operations found.</p>';
    }
    
    return `
      <div class="query-list">
        ${events.map(event => `
          <div class="query-item">
            <div class="query-header">
              <span class="query-type">${event.category}</span>
              <span class="query-time">${event.duration?.toFixed(3) || 'N/A'} ms</span>
            </div>
            <div class="query-text">${this.formatQueryText(event.message)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  /**
   * Format query text for display
   */
  private formatQueryText(text: string): string {
    if (!text) {
      return 'No query text available';
    }
    
    // Escape HTML
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Highlight SQL keywords
    return escaped.replace(
      /\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|INSERT|UPDATE|DELETE|SET)\b/gi,
      '<span style="color: #4a9cd6; font-weight: bold;">$1</span>'
    );
  }
} 