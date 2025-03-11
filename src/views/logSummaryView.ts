import * as vscode from 'vscode';
import { LogEvent, Tab, LogCategory, ParsedLogData } from './types';
import { LogParser } from './logParser';
import { TimelineView } from './timelineView';
import { CallTreeView } from './callTreeView';
import { AnalysisView } from './analysisView';
import { DatabaseView } from './databaseView';
import { styles } from './styles';
import { getHtmlTemplate } from './htmlTemplate';

/**
 * Main LogSummaryView class that integrates all components
 */
export class LogSummaryView {
  private static panel: vscode.WebviewPanel | undefined;
  private static currentTab: string = 'overview';
  
  // Define available tabs
  private static tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: '$(home)' },
    { id: 'timeline', label: 'Timeline', icon: '$(timeline)' },
    { id: 'callTree', label: 'Call Tree', icon: '$(list-tree)' },
    { id: 'analysis', label: 'Analysis', icon: '$(graph)' },
    { id: 'database', label: 'Database', icon: '$(database)' }
  ];

  // Define available categories with their display names and colors
  private static categories: LogCategory[] = [
    { id: 'APEX_CODE', label: 'APEX_CODE', state: 'DEBUG' },
    { id: 'APEX_PROFILING', label: 'APEX_PROFILING', state: 'INFO' },
    { id: 'CALLOUT', label: 'CALLOUT', state: 'INFO' },
    { id: 'DATA_ACCESS', label: 'DATA_ACCESS', state: 'INFO' },
    { id: 'DB', label: 'DB', state: 'INFO' },
    { id: 'NBA', label: 'NBA', state: 'INFO' },
    { id: 'SYSTEM', label: 'SYSTEM', state: 'DEBUG' },
    { id: 'VALIDATION', label: 'VALIDATION', state: 'INFO' },
    { id: 'VISUALFORCE', label: 'VISUALFORCE', state: 'INFO' },
    { id: 'WAVE', label: 'WAVE', state: 'INFO' },
    { id: 'WORKFLOW', label: 'WORKFLOW', state: 'INFO' }
  ];
  
  // View components
  private static timelineView = new TimelineView();
  private static callTreeView = new CallTreeView();
  private static analysisView = new AnalysisView();
  private static databaseView = new DatabaseView();

  /**
   * Shows the log summary panel for the current log file
   * @param context The extension context
   */
  public static show(context: vscode.ExtensionContext): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor found');
      return;
    }

    // Get the log file name
    const logFileName = editor.document.fileName.split(/[\/\\]/).pop() || 'Log';
    const fileSize = (editor.document.getText().length / 1024).toFixed(2);

    // If we already have a panel, show it
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(editor.document.getText(), logFileName, fileSize);
      return;
    }

    // Create a new panel
    this.panel = vscode.window.createWebviewPanel(
      'logSummary',
      `Summary: ${logFileName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set the webview's initial HTML content
    this.updatePanel(editor.document.getText(), logFileName, fileSize);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'switchTab':
            this.currentTab = message.tab;
            this.updatePanel(editor.document.getText(), logFileName, fileSize);
            return;
        }
      },
      undefined,
      context.subscriptions
    );

    // Reset when the panel is closed
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      context.subscriptions
    );
  }

  /**
   * Updates the panel with the log content
   * @param logContent The log content to display
   * @param logFileName The log file name
   * @param fileSize The file size in KB
   */
  private static updatePanel(logContent: string, logFileName: string, fileSize: string): void {
    if (!this.panel) {
      return;
    }

    // Parse the log content
    const parsedData = LogParser.parseLogContent(logContent);
    
    console.log('RV:UPDATING PANEL with data:', {
      events: parsedData.events.length,
      codeUnits: parsedData.codeUnits.length,
      executionUnits: parsedData.executionUnits.length,
      statistics: parsedData.statistics
    });
    
    // Generate the HTML content
    this.panel.webview.html = this.getWebviewContent(parsedData, logFileName, fileSize);
    
    // Create a safe version of the data for serialization
    const safeData = this.createSerializableCopy(parsedData);
    
    // After the HTML is set, send a message to initialize the view
    setTimeout(() => {
      console.log('RV:SENDING INITIALIZE MESSAGE for tab:', this.currentTab);
      
      try {
        this.panel?.webview.postMessage({
          command: 'initializeView',
          tab: this.currentTab,
          data: safeData
        });
        console.log('RV:Message sent successfully');
      } catch (error) {
        console.error('RV:Error sending message:', error);
      }
    }, 100);
  }

  /**
   * Creates a serializable copy of the data without circular references
   * @param data The data to process
   * @returns A serializable copy of the data
   */
  private static createSerializableCopy(data: ParsedLogData): any {
    // Create a new object with only the necessary properties
    const safeData = {
        events: this.simplifyEvents(data.events),
        codeUnits: this.simplifyCodeUnits(data.codeUnits),
        executionUnits: this.simplifyCodeUnits(data.executionUnits),
        statistics: { ...data.statistics }
    };
    
    // Test that it can be serialized
    try {
        JSON.stringify(safeData);
        console.log('RV:Data can be serialized successfully');
    } catch (error) {
        console.error('RV:Error serializing data:', error);
        // Fallback to a minimal safe object
        return {
            events: [],
            codeUnits: [],
            executionUnits: [],
            statistics: data.statistics
        };
    }
    
    return safeData;
  }

  /**
   * Simplifies events for serialization
   */
  private static simplifyEvents(events: LogEvent[]): any[] {
    return events.map(event => ({
        timestamp: event.timestamp,
        duration: event.duration,
        category: event.category,
        message: event.message,
        details: event.details,
        namespace: event.namespace,
        dmlCount: event.dmlCount,
        soqlCount: event.soqlCount,
        rowsCount: event.rowsCount,
        totalTime: event.totalTime,
        selfTime: event.selfTime,
        level: event.level
        // Explicitly omit parent and children to avoid circular references
    }));
  }

  /**
   * Simplifies code units for serialization, preserving hierarchy without circular references
   */
  private static simplifyCodeUnits(units: LogEvent[]): any[] {
    // First pass: create simplified units without children
    const simplifiedUnits = units.map(unit => ({
        id: unit.timestamp.toString() + '-' + (unit.message || '').substring(0, 20).replace(/\s+/g, '_'),
        timestamp: unit.timestamp,
        duration: unit.duration,
        category: unit.category,
        message: unit.message,
        namespace: unit.namespace,
        dmlCount: unit.dmlCount,
        soqlCount: unit.soqlCount,
        rowsCount: unit.rowsCount,
        totalTime: unit.totalTime,
        selfTime: unit.selfTime,
        level: unit.level,
        childIds: [] as string[],
        parentId: null as string | null
    }));
    
    // Create a map for quick lookup
    const unitMap = new Map<string, any>();
    simplifiedUnits.forEach(unit => unitMap.set(unit.id, unit));
    
    // Second pass: establish parent-child relationships using IDs
    units.forEach((unit, index) => {
        const simplifiedUnit = simplifiedUnits[index];
        
        if (unit.parent) {
            const parentId = unit.parent.timestamp.toString() + '-' + (unit.parent.message || '').substring(0, 20).replace(/\s+/g, '_');
            simplifiedUnit.parentId = parentId;
            
            // Add this unit's ID to parent's childIds
            const parentUnit = unitMap.get(parentId);
            if (parentUnit) {
                parentUnit.childIds.push(simplifiedUnit.id);
            }
        }
    });
    
    // Filter to only include root units (those without parents)
    return simplifiedUnits.filter(unit => !unit.parentId);
  }

  /**
   * Returns the HTML content for the webview
   * @param parsedData The parsed log data
   * @param logFileName The log file name
   * @param fileSize The file size in KB
   */
  private static getWebviewContent(parsedData: ParsedLogData, logFileName: string, fileSize: string): string {
    return getHtmlTemplate(
      parsedData,
      logFileName,
      fileSize,
      this.currentTab,
      this.tabs,
      this.categories
    );
  }
} 