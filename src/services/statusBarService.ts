import * as vscode from 'vscode';

/**
 * Service for managing the status bar at the bottom of VS Code
 */
export class StatusBarService {
    private static _instance: StatusBarService;
    private _statusBarItem: vscode.StatusBarItem;
    
    private constructor() {
        // Create a status bar item that will be shown at the bottom right
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100 // Priority (higher means more to the left)
        );
        this._statusBarItem.name = 'Visbal Extension';
        this._statusBarItem.hide(); // Initially hidden
    }
    
    /**
     * Get the singleton instance of the StatusBarService
     */
    public static getInstance(): StatusBarService {
        if (!StatusBarService._instance) {
            StatusBarService._instance = new StatusBarService();
        }
        return StatusBarService._instance;
    }
    
    /**
     * Show a message in the status bar
     * @param message The message to display
     * @param icon Optional icon to show (codicon)
     */
    public showMessage(message: string, icon?: string): void {
        this._statusBarItem.text = icon ? `$(${icon}) ${message}` : message;
        this._statusBarItem.show();
    }
    
    /**
     * Show a progress message in the status bar
     * @param message The message to display
     */
    public showProgress(message: string): void {
        this.showMessage(message, 'sync~spin');
    }
    
    /**
     * Show a success message in the status bar
     * @param message The message to display
     */
    public showSuccess(message: string): void {
        this.showMessage(message, 'check');
        
        // Automatically hide after 5 seconds
        setTimeout(() => {
            this.hide();
        }, 5000);
    }
    
    /**
     * Show an error message in the status bar
     * @param message The message to display
     */
    public showError(message: string): void {
        this.showMessage(message, 'error');
        
        // Automatically hide after 8 seconds
        setTimeout(() => {
            this.hide();
        }, 8000);
    }
    
    /**
     * Hide the status bar item
     */
    public hide(): void {
        this._statusBarItem.hide();
    }
    
    /**
     * Dispose the status bar item
     */
    public dispose(): void {
        this._statusBarItem.dispose();
    }
}

// Export a singleton instance
export const statusBarService = StatusBarService.getInstance(); 