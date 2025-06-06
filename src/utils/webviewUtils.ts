import { DebugBox } from '../components/DebugBox';

export class WebviewUtils {
    /**
     * Injects the debug box component into a webview's HTML content
     * @param html The original HTML content
     * @returns The HTML content with the debug box injected
     */
    public static injectDebugBox(html: string): string {
        const debugBox = DebugBox.getInstance();
        const debugComponent = debugBox.getFullComponent();
        
        // Insert the debug component right after the opening body tag
        // If no body tag exists, insert at the beginning of the HTML
        if (html.includes('<body>')) {
            return html.replace('<body>', `<body>${debugComponent}`);
        } else {
            return `${debugComponent}${html}`;
        }
    }

    /**
     * Sends a debug message to the debug box in the webview
     * @param webview The webview instance
     * @param message The message to display
     */
    public static sendDebugMessage(webview: any, message: any): void {
        webview.postMessage({
            command: 'debug',
            message: message
        });
    }
} 