import { LogEvent, ILogView } from './types';

/**
 * Timeline view component for visualizing log events on a timeline
 */
export class TimelineView implements ILogView {
  /**
   * Render the timeline view
   * @param events Log events to render
   * @param container HTML element to render into
   */
  public render(events: LogEvent[], container: HTMLElement): void {
    // Clear the container
    container.innerHTML = '';
    
    // Create the legend
    const legend = document.createElement('div');
    legend.className = 'category-legend';
    legend.innerHTML = `
      <div class="category-item">
        <div class="category-color" style="background-color: #2a6;"></div>
        <span>Execution</span>
      </div>
      <div class="category-item">
        <div class="category-color" style="background-color: #a26;"></div>
        <span>DML</span>
      </div>
      <div class="category-item">
        <div class="category-color" style="background-color: #26a;"></div>
        <span>SOQL</span>
      </div>
      <div class="category-item">
        <div class="category-color" style="background-color: #62a;"></div>
        <span>Method</span>
      </div>
      <div class="category-item">
        <div class="category-color" style="background-color: #a62;"></div>
        <span>Flow</span>
      </div>
    `;
    container.appendChild(legend);
    
    // Create the timeline container
    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    container.appendChild(timeline);
    
    // Create the timeline grid
    const timelineGrid = document.createElement('div');
    timelineGrid.className = 'timeline-grid';
    timeline.appendChild(timelineGrid);
    
    // Calculate timeline metrics
    const timelineData = this.prepareTimelineData(events);
    
    // Set the width of the timeline grid
    timelineGrid.style.width = `${timelineData.totalWidth}px`;
    
    // Add grid lines
    timelineGrid.innerHTML = this.generateTimelineGridHTML(timelineData);
    
    // Add events to the timeline
    timelineGrid.innerHTML += this.generateTimelineEventsHTML(events, timelineData);
    
    // Create the execution details section
    const executionDetails = document.createElement('div');
    executionDetails.className = 'execution-details';
    executionDetails.textContent = this.formatExecutionDetails(events);
    container.appendChild(executionDetails);
    
    // Add event listeners
    setTimeout(() => {
      document.querySelectorAll('.timeline-event').forEach(event => {
        event.addEventListener('click', (e) => {
          const element = e.currentTarget as HTMLElement;
          const details = element.getAttribute('data-details');
          if (details) {
            document.querySelector('.execution-details')!.textContent = details;
          }
        });
      });
    }, 0);
  }
  
  /**
   * Prepare timeline data for visualization
   */
  private prepareTimelineData(events: LogEvent[]) {
    // Find the total duration to set the timeline width
    let maxTimestamp = 0;
    for (const event of events) {
      const endTime = event.timestamp + event.duration;
      if (endTime > maxTimestamp) {
        maxTimestamp = endTime;
      }
    }
    
    // Add some padding
    maxTimestamp = Math.ceil(maxTimestamp * 1.1);
    
    // Calculate pixels per millisecond (scale)
    const totalWidth = Math.max(1000, maxTimestamp / 10); // At least 1000px wide
    const scale = totalWidth / maxTimestamp;
    
    // Calculate grid lines (one every second or so)
    const gridInterval = Math.max(100, Math.ceil(maxTimestamp / 20)); // ms between grid lines
    const gridLines = [];
    
    for (let i = 0; i <= maxTimestamp; i += gridInterval) {
      gridLines.push({
        position: i * scale,
        label: `${(i / 1000).toFixed(1)}s`
      });
    }
    
    return {
      totalWidth,
      scale,
      gridLines,
      maxTimestamp
    };
  }
  
  /**
   * Generate HTML for the timeline grid
   */
  private generateTimelineGridHTML(timelineData: any) {
    return timelineData.gridLines.map((line: any) => `
      <div class="timeline-grid-line" style="left: ${line.position}px;"></div>
      <div class="timeline-grid-label" style="left: ${line.position + 5}px;">${line.label}</div>
    `).join('');
  }
  
  /**
   * Generate HTML for timeline events
   */
  private generateTimelineEventsHTML(events: LogEvent[], timelineData: any) {
    return events.map((event, index) => {
      const left = event.timestamp * timelineData.scale;
      const width = Math.max(5, event.duration * timelineData.scale); // Minimum 5px width for visibility
      const top = 30 + (index % 10) * 25; // Stagger events vertically
      
      const details = event.details ? event.details.join('\n') : event.message;
      
      return `
        <div class="timeline-event ${event.category}" 
             style="left: ${left}px; width: ${width}px; top: ${top}px;"
             title="${event.message}"
             data-details="${details.replace(/"/g, '&quot;')}">
          ${event.message.substring(0, 20)}${event.message.length > 20 ? '...' : ''}
        </div>
      `;
    }).join('');
  }
  
  /**
   * Format execution details for display
   */
  private formatExecutionDetails(events: LogEvent[]) {
    // Find execution events with details
    const executionEvents = events.filter(e => e.category === 'Execution' && e.details);
    
    if (executionEvents.length === 0) {
      return 'Click on an event to see details';
    }
    
    // Display the first execution event details
    return executionEvents[0].details?.join('\n') || 'No details available';
  }
} 