import * as vscode from 'vscode';

/**
 * Represents a log event with timing and category information
 */
export interface LogEvent {
  timestamp: number;
  duration: number;
  category: string;
  message: string;
  details?: string[];
  namespace?: string;
  dmlCount?: number;
  soqlCount?: number;
  rowsCount?: number;
  totalTime?: number;
  selfTime?: number;
  children?: LogEvent[];
  parent?: LogEvent;
  level?: number;
}

/**
 * Represents a tab in the log summary view
 */
export interface Tab {
  id: string;
  label: string;
  icon?: string;
}

/**
 * Represents a category in the log header
 */
export interface LogCategory {
  id: string;
  label: string;
  state: string;
}

/**
 * Interface for view components
 */
export interface ILogView {
  render(events: LogEvent[], container: HTMLElement): void;
}

/**
 * Log parsing result
 */
export interface ParsedLogData {
  events: LogEvent[];
  executionUnits: LogEvent[];
  codeUnits: LogEvent[];
  statistics: {
    totalDuration: number;
    dmlCount: number;
    soqlCount: number;
    rowsCount: number;
  };
  rawLog?: string;
  userDebugLog?: string;
} 