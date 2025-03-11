import { LogEvent, ParsedLogData } from './types';

/**
 * Utility class for parsing log files
 */
export class LogParser {
  /**
   * Parse the log content to extract events
   * @param logContent The log content to parse
   * @returns Parsed log data
   */
  public static parseLogContent(logContent: string): ParsedLogData {
    const events: LogEvent[] = [];
    const executionUnits: LogEvent[] = [];
    const codeUnits: LogEvent[] = [];
    const lines = logContent.split('\n');
    
    let currentTimestamp = 0;
    let startTime = 0;
    let executionStack: LogEvent[] = [];
    let codeUnitStack: LogEvent[] = [];

    // Statistics
    let totalDuration = 0;
    let dmlCount = 0;
    let soqlCount = 0;
    let rowsCount = 0;

    // Simple parsing logic - this should be enhanced based on your specific log format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for execution started events
      if (line.includes('EXECUTION_STARTED')) {
        const timestampMatch = /timestamp:\s*(\d+)/.exec(lines[i+2] || '');
        if (timestampMatch) {
          currentTimestamp = parseInt(timestampMatch[1], 10);
          if (startTime === 0) {
            startTime = currentTimestamp;
          }
        }
        
        const durationMatch = /total:\s*([\d.]+)ms/.exec(lines[i+3] || '');
        const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
        
        const rowsMatch = /rows:\s*(\d+)/.exec(lines[i+4] || '');
        const rows = rowsMatch ? parseInt(rowsMatch[1], 10) : 0;
        
        const executionEvent: LogEvent = {
          timestamp: currentTimestamp - startTime,
          duration: duration,
          category: 'Execution',
          message: 'EXECUTION_STARTED',
          details: [
            lines[i] || '',
            lines[i+1] || '',
            lines[i+2] || '',
            lines[i+3] || '',
            lines[i+4] || ''
          ],
          namespace: 'System',
          dmlCount: 0,
          soqlCount: 0,
          rowsCount: rows,
          totalTime: duration,
          selfTime: duration,
          children: [],
          level: 0
        };
        
        events.push(executionEvent);
        executionUnits.push(executionEvent);
        executionStack.push(executionEvent);
        
        totalDuration += duration;
        rowsCount += rows;
      }
      
      // Look for execution finished events
      if (line.includes('EXECUTION_FINISHED') && executionStack.length > 0) {
        executionStack.pop();
      }
      
      // Look for code unit started events
      if (line.includes('CODE_UNIT_STARTED')) {
        const message = line.substring(line.indexOf('CODE_UNIT_STARTED:') + 'CODE_UNIT_STARTED:'.length).trim();
        const namespace = this.extractNamespace(message);
        
        const codeUnitEvent: LogEvent = {
          timestamp: currentTimestamp - startTime,
          duration: 0, // Will be calculated when CODE_UNIT_FINISHED is found
          category: 'CodeUnit',
          message: message,
          namespace: namespace,
          dmlCount: 0,
          soqlCount: 0,
          rowsCount: 0,
          totalTime: 0,
          selfTime: 0,
          children: [],
          level: codeUnitStack.length
        };
        
        // Add to parent if available
        if (codeUnitStack.length > 0) {
          const parent = codeUnitStack[codeUnitStack.length - 1];
          codeUnitEvent.parent = parent;
          parent.children?.push(codeUnitEvent);
        } else if (executionStack.length > 0) {
          const parent = executionStack[executionStack.length - 1];
          codeUnitEvent.parent = parent;
          parent.children?.push(codeUnitEvent);
        }
        
        events.push(codeUnitEvent);
        codeUnits.push(codeUnitEvent);
        codeUnitStack.push(codeUnitEvent);
      }
      
      // Look for code unit finished events
      if (line.includes('CODE_UNIT_FINISHED') && codeUnitStack.length > 0) {
        const codeUnitEvent = codeUnitStack.pop();
        if (codeUnitEvent) {
          // Calculate duration based on next event timestamp or use a default
          const nextEventIndex = events.indexOf(codeUnitEvent) + 1;
          if (nextEventIndex < events.length) {
            codeUnitEvent.duration = events[nextEventIndex].timestamp - codeUnitEvent.timestamp;
          } else {
            codeUnitEvent.duration = 10; // Default duration if we can't calculate
          }
          
          codeUnitEvent.totalTime = codeUnitEvent.duration;
          codeUnitEvent.selfTime = codeUnitEvent.duration;
          
          // Adjust parent's self time
          if (codeUnitEvent.parent) {
            codeUnitEvent.parent.selfTime = (codeUnitEvent.parent.selfTime || 0) - codeUnitEvent.duration;
          }
        }
      }
      
      // Look for DML operations
      if (line.includes('DML_') || line.includes('SOQL_')) {
        const category = line.includes('DML_') ? 'DML' : 'SOQL';
        const event: LogEvent = {
          timestamp: currentTimestamp - startTime,
          duration: 10, // Placeholder duration
          category: category,
          message: line,
          namespace: codeUnitStack.length > 0 ? codeUnitStack[codeUnitStack.length - 1].namespace : 'Unknown'
        };
        
        events.push(event);
        
        // Update counts
        if (category === 'DML') {
          dmlCount++;
          if (codeUnitStack.length > 0) {
            codeUnitStack[codeUnitStack.length - 1].dmlCount = (codeUnitStack[codeUnitStack.length - 1].dmlCount || 0) + 1;
          }
        } else if (category === 'SOQL') {
          soqlCount++;
          if (codeUnitStack.length > 0) {
            codeUnitStack[codeUnitStack.length - 1].soqlCount = (codeUnitStack[codeUnitStack.length - 1].soqlCount || 0) + 1;
          }
        }
      }
      
      // Look for method calls
      if (line.includes('METHOD_') || line.includes('FLOW_')) {
        const category = line.includes('METHOD_') ? 'Method' : 'Flow';
        const event: LogEvent = {
          timestamp: currentTimestamp - startTime,
          duration: 5, // Placeholder duration
          category: category,
          message: line,
          namespace: codeUnitStack.length > 0 ? codeUnitStack[codeUnitStack.length - 1].namespace : 'Unknown'
        };
        
        events.push(event);
      }
    }
    
    return {
      events,
      executionUnits,
      codeUnits,
      statistics: {
        totalDuration,
        dmlCount,
        soqlCount,
        rowsCount
      }
    };
  }
  
  /**
   * Extract namespace from a code unit message
   */
  private static extractNamespace(message: string): string {
    if (!message) {
      return 'Unknown';
    }
    
    // Extract namespace from patterns like Validation:Account, Workflow:Account, etc.
    const parts = message.split(':');
    if (parts.length > 0) {
      return parts[0].trim();
    }
    
    // If we can't determine, return default
    return 'default';
  }
} 