import { LogEvent, ILogView } from './types';

/**
 * Analysis view component for analyzing log performance
 */
export class AnalysisView implements ILogView {
  /**
   * Render the analysis view
   * @param events Log events to render
   * @param container HTML element to render into
   */
  public render(events: LogEvent[], container: HTMLElement): void {
    // Clear the container
    container.innerHTML = '';
    
    // Create the analysis container
    const analysisContainer = document.createElement('div');
    analysisContainer.className = 'analysis-container';
    
    // Add performance summary section
    const performanceSection = document.createElement('div');
    performanceSection.className = 'analysis-section';
    performanceSection.innerHTML = `
      <h3>Performance Summary</h3>
      <table class="analysis-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total Execution Time</td>
            <td>${this.getTotalExecutionTime(events).toFixed(3)} ms</td>
          </tr>
          <tr>
            <td>DML Operations</td>
            <td>${this.countEventsByCategory(events, 'DML')}</td>
          </tr>
          <tr>
            <td>SOQL Queries</td>
            <td>${this.countEventsByCategory(events, 'SOQL')}</td>
          </tr>
          <tr>
            <td>Code Units</td>
            <td>${this.countEventsByCategory(events, 'CodeUnit')}</td>
          </tr>
        </tbody>
      </table>
    `;
    analysisContainer.appendChild(performanceSection);
    
    // Add top time consumers section
    const timeConsumersSection = document.createElement('div');
    timeConsumersSection.className = 'analysis-section';
    timeConsumersSection.innerHTML = `
      <h3>Top Time Consumers</h3>
      <table class="analysis-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Time (ms)</th>
            <th>% of Total</th>
          </tr>
        </thead>
        <tbody>
          ${this.getTopTimeConsumers(events, 10).map(event => `
            <tr>
              <td>${event.message}</td>
              <td>${event.category}</td>
              <td>${event.duration.toFixed(3)}</td>
              <td>${this.calculatePercentage(event.duration, this.getTotalExecutionTime(events)).toFixed(2)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    analysisContainer.appendChild(timeConsumersSection);
    
    // Add placeholder for future analysis features
    const placeholderSection = document.createElement('div');
    placeholderSection.className = 'analysis-section';
    placeholderSection.innerHTML = `
      <h3>Additional Analysis</h3>
      <p class="placeholder-message">More detailed analysis features will be implemented in future updates.</p>
    `;
    analysisContainer.appendChild(placeholderSection);
    
    container.appendChild(analysisContainer);
  }
  
  /**
   * Get the total execution time from events
   */
  private getTotalExecutionTime(events: LogEvent[]): number {
    const executionEvents = events.filter(e => e.category === 'Execution');
    if (executionEvents.length === 0) {
      return 0;
    }
    
    return executionEvents.reduce((total, event) => total + (event.duration || 0), 0);
  }
  
  /**
   * Count events by category
   */
  private countEventsByCategory(events: LogEvent[], category: string): number {
    return events.filter(e => e.category === category).length;
  }
  
  /**
   * Get top time consumers
   */
  private getTopTimeConsumers(events: LogEvent[], limit: number): LogEvent[] {
    return [...events]
      .filter(e => e.duration && e.duration > 0)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, limit);
  }
  
  /**
   * Calculate percentage
   */
  private calculatePercentage(value: number, total: number): number {
    if (total === 0) {
      return 0;
    }
    
    return (value / total) * 100;
  }
} 