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

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Visbal Extension');
    }

    public static getInstance(): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService();
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
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}

export const loggingService = LoggingService.getInstance(); 