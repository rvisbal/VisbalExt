import * as vscode from 'vscode';
import { OrgUtils } from '../utils/orgUtils';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class LoggingService {
    private static instance: LoggingService;
    private outputChannel: vscode.OutputChannel;
    private debugConsoleView: any; // Will be set by DebugConsoleView
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor(outputChannel?: vscode.OutputChannel) {
        // Reuse existing output channel or create new one
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('Visbal Extension');
    }

    public static getInstance(outputChannel?: vscode.OutputChannel): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService(outputChannel);
        }
        return LoggingService.instance;
    }

    public setDebugConsoleView(view: any) {
        this.debugConsoleView = view;
    }

    public setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private formatMessage(component: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [VisbalExt.${component}] ${message}`;
    }

    public debug(component: string, message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        
        const formattedMessage = this.formatMessage(component, message);
        console.debug(formattedMessage, ...args);
        this.outputChannel.appendLine(formattedMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
        
        if (this.debugConsoleView) {
            this.debugConsoleView.addOutput(formattedMessage, 'debug');
        }
    }

    public info(component: string, message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        
        const formattedMessage = this.formatMessage(component, message);
        OrgUtils.logDebug(formattedMessage, ...args);
        this.outputChannel.appendLine(formattedMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
        
        if (this.debugConsoleView) {
            this.debugConsoleView.addOutput(formattedMessage, 'info');
        }
    }

    public warn(component: string, message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.WARN)) return;
        
        const formattedMessage = this.formatMessage(component, message);
        OrgUtils.logDebug(formattedMessage, ...args);
        this.outputChannel.appendLine(formattedMessage + (args.length ? ' ' + JSON.stringify(args) : ''));
        
        if (this.debugConsoleView) {
            this.debugConsoleView.addOutput(formattedMessage, 'warning');
        }
    }

    public error(component: string, message: string, error?: Error, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        
        const formattedMessage = this.formatMessage(component, message);
        console.error(formattedMessage, error || '', ...args);
        
        // Log the error message and stack trace if available
        this.outputChannel.appendLine(formattedMessage);
        if (error) {
            this.outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(`Stack: ${error.stack}`);
            }
        }
        if (args.length) {
            this.outputChannel.appendLine(`Additional Info: ${JSON.stringify(args)}`);
        }
        
        if (this.debugConsoleView) {
            this.debugConsoleView.addOutput(formattedMessage, 'error');
            if (error) {
                this.debugConsoleView.addOutput(`Error: ${error.message}`, 'error');
            }
        }
    }

    public show(): void {
        // Only show output channel when explicitly requested
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// Export without initializing to allow passing output channel later
export const loggingService = LoggingService; 