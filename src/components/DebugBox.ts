export class DebugBox {
    private static instance: DebugBox;
    private style: string;
    private script: string;
    private html: string;

    private constructor() {
        this.style = `
            .visbal-debug-box {
                position: fixed;
                top: 0;
                left: 0;
                width: 300px;
                height: 200px;
                background-color: var(--vscode-editor-background);
                color: #fff;
                z-index: 1000;
                font-size: 11px;
                font-family: var(--vscode-font-family);
                border: 1px solid var(--vscode-panel-border);
                box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                padding: 8px;
                display: flex;
                flex-direction: column;
                resize: both;
                min-width: 200px;
                min-height: 100px;
                max-width: 80vw;
                max-height: 80vh;
            }

            .visbal-debug-box-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
                padding-bottom: 4px;
                border-bottom: 1px solid var(--vscode-panel-border);
                cursor: move;
                user-select: none;
                flex-shrink: 0;
            }

            .visbal-debug-box-title {
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .visbal-debug-box-message-count {
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
                background: var(--vscode-badge-background);
                padding: 2px 6px;
                border-radius: 10px;
            }

            .visbal-debug-box-controls {
                display: flex;
                gap: 4px;
            }

            .visbal-debug-box-button {
                background: none;
                border: none;
                color: var(--vscode-icon-foreground);
                cursor: pointer;
                padding: 2px;
                font-size: 12px;
                width: 16px;
                height: 16px;
            }

            .visbal-debug-box-button:hover {
                background-color: var(--vscode-toolbar-hoverBackground);
            }

            .visbal-debug-box-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                display: flex;
                flex-direction: column-reverse;
                gap: 4px;
                padding-right: 4px;
            }

            .visbal-debug-message {
                padding: 4px;
                border-radius: 2px;
                word-break: break-word;
                white-space: pre-wrap;
                font-family: var(--vscode-editor-font-family);
                font-size: 11px;
                line-height: 1.4;
                background: var(--vscode-editor-inactiveSelectionBackground);
                border-left: 2px solid var(--vscode-activityBarBadge-background);
            }

            .visbal-debug-message-time {
                font-size: 9px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 2px;
            }

            .visbal-debug-message-content {
                color: var(--vscode-editor-foreground);
            }

            .visbal-debug-message-object {
                color: var(--vscode-charts-blue);
            }

            .visbal-debug-message-string {
                color: var(--vscode-charts-green);
            }

            .visbal-debug-message-number {
                color: var(--vscode-charts-orange);
            }

            .visbal-debug-message-boolean {
                color: var(--vscode-charts-purple);
            }

            .visbal-debug-message-null {
                color: var(--vscode-charts-red);
            }

            .visbal-debug-box-clear {
                position: absolute;
                right: 8px;
                top: 8px;
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 2px;
            }

            .visbal-debug-box-clear:hover {
                background: var(--vscode-toolbar-hoverBackground);
            }

            /* Scrollbar styling */
            .visbal-debug-box-content::-webkit-scrollbar {
                width: 8px;
            }

            .visbal-debug-box-content::-webkit-scrollbar-track {
                background: var(--vscode-scrollbarSlider-background);
            }

            .visbal-debug-box-content::-webkit-scrollbar-thumb {
                background: var(--vscode-scrollbarSlider-hoverBackground);
                border-radius: 4px;
            }

            .visbal-debug-box-content::-webkit-scrollbar-thumb:hover {
                background: var(--vscode-scrollbarSlider-activeBackground);
            }
        `;

        this.script = `
            let messageHistory = [];
            const MAX_MESSAGES = 1000;

            function formatMessage(message) {
                const timestamp = new Date().toLocaleTimeString();
                let content = message;
                let type = 'string';

                if (typeof message === 'object') {
                    content = JSON.stringify(message, null, 2);
                    type = 'object';
                } else if (typeof message === 'number') {
                    type = 'number';
                } else if (typeof message === 'boolean') {
                    type = 'boolean';
                } else if (message === null) {
                    type = 'null';
                }

                return {
                    timestamp,
                    content,
                    type,
                    raw: message
                };
            }

            function createMessageElement(message) {
                const div = document.createElement('div');
                div.className = 'visbal-debug-message';
                
                const timeDiv = document.createElement('div');
                timeDiv.className = 'visbal-debug-message-time';
                timeDiv.textContent = message.timestamp;
                
                const contentDiv = document.createElement('div');
                contentDiv.className = 'visbal-debug-message-content';
                contentDiv.classList.add('visbal-debug-message-' + message.type);
                contentDiv.textContent = message.content;
                
                div.appendChild(timeDiv);
                div.appendChild(contentDiv);
                return div;
            }

            function updateMessageCount() {
                const countElement = document.querySelector('.visbal-debug-box-message-count');
                if (countElement) {
                    countElement.textContent = messageHistory.length;
                }
            }

            function visbalDebugLog(message) {
             
                const content = document.getElementById('visbal-debug-box-content');
                if (!content) return;

                const formattedMessage = formatMessage(message);
                messageHistory.unshift(formattedMessage);

                // Keep only the last MAX_MESSAGES messages
                if (messageHistory.length > MAX_MESSAGES) {
                    messageHistory = messageHistory.slice(0, MAX_MESSAGES);
                }

                // Clear existing content
                content.innerHTML = '';

                // Add all messages
                messageHistory.forEach(msg => {
                    content.appendChild(createMessageElement(msg));
                });

                updateMessageCount();
           
            }

            function clearDebugLog() {
                messageHistory = [];
                const content = document.getElementById('visbal-debug-box-content');
                if (content) {
                    content.innerHTML = '';
                }
                updateMessageCount();
            }

            function initializeDebugBox() {
           
                const debugBox = document.getElementById('visbal-debug-box');
                if (!debugBox) return;

                // Add clear button
                const clearButton = document.createElement('div');
                clearButton.className = 'visbal-debug-box-clear';
                clearButton.textContent = 'Clear';
                clearButton.title = 'Clear debug messages';
                clearButton.onclick = clearDebugLog;
                debugBox.appendChild(clearButton);

                

                // Add message count to title
                const title = debugBox.querySelector('.visbal-debug-box-title');
                if (title) {
                    const countSpan = document.createElement('span');
                    countSpan.className = 'visbal-debug-box-message-count';
                    countSpan.textContent = '0';
                    title.appendChild(countSpan);
                }

                let isDragging = false;
                let startX, startY, startLeft, startTop;
                
                // Make the debug box draggable
                const header = debugBox.querySelector('.visbal-debug-box-header');
                if (header) {
                    header.addEventListener('mousedown', (e) => {
                        if (e.target.closest('.visbal-debug-box-button') || e.target.closest('.visbal-debug-box-clear')) return;
                        isDragging = true;
                        startX = e.clientX;
                        startY = e.clientY;
                        startLeft = debugBox.offsetLeft;
                        startTop = debugBox.offsetTop;
                        debugBox.style.cursor = 'move';
                    });
                }

                // Handle minimize/maximize
                const minimizeBtn = debugBox.querySelector('.visbal-debug-box-minimize');
                const maximizeBtn = debugBox.querySelector('.visbal-debug-box-maximize');
                const content = debugBox.querySelector('.visbal-debug-box-content');

                if (minimizeBtn) {
                    minimizeBtn.addEventListener('click', () => {
                        if (content.style.display === 'none') {
                            content.style.display = 'flex';
                            minimizeBtn.textContent = '−';
                            debugBox.style.height = '200px';
                        } else {
                            content.style.display = 'none';
                            minimizeBtn.textContent = '+';
                            debugBox.style.height = '25px';
                        }
                    });
                }

                if (maximizeBtn) {
                    maximizeBtn.addEventListener('click', () => {
                        if (debugBox.style.width === '80vw' && debugBox.style.height === '80vh') {
                            debugBox.style.width = '300px';
                            debugBox.style.height = '200px';
                            maximizeBtn.textContent = '□';
                        } else {
                            debugBox.style.width = '80vw';
                            debugBox.style.height = '80vh';
                            maximizeBtn.textContent = '⧉';
                        }
                    });
                }
             

                // Handle mouse move for dragging
                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        debugBox.style.left = Math.max(0, Math.min(window.innerWidth - debugBox.offsetWidth, startLeft + dx)) + 'px';
                        debugBox.style.top = Math.max(0, Math.min(window.innerHeight - debugBox.offsetHeight, startTop + dy)) + 'px';
                    }
                });

                // Handle mouse up to stop dragging
                document.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        debugBox.style.cursor = 'default';
                    }
                });

                // Save state to localStorage
                function saveDebugBoxState() {
                    const state = {
                        left: debugBox.style.left,
                        top: debugBox.style.top,
                        width: debugBox.style.width,
                        height: debugBox.style.height,
                        isMinimized: content.style.display === 'none',
                        messages: messageHistory
                    };
                    localStorage.setItem('visbalDebugBoxState', JSON.stringify(state));
                }
                /*

                // Load saved state
                const savedState = localStorage.getItem('visbalDebugBoxState');
                if (savedState) {
                    const state = JSON.parse(savedState);
                    debugBox.style.left = state.left;
                    debugBox.style.top = state.top;
                    debugBox.style.width = state.width;
                    debugBox.style.height = state.height;
                    if (state.isMinimized) {
                        content.style.display = 'none';
                        minimizeBtn.textContent = '+';
                    }
                    if (state.messages) {
                        messageHistory = state.messages;
                        messageHistory.forEach(msg => {
                            content.appendChild(createMessageElement(msg));
                        });
                        updateMessageCount();
                    }
                }

                // Save state on changes
                const observer = new MutationObserver(saveDebugBoxState);
                observer.observe(debugBox, { 
                    attributes: true, 
                    attributeFilter: ['style'] 
                });
                */
            }

            // Initialize when the DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeDebugBox);
            } else {
                initializeDebugBox();
            }
        `;

        this.html = `
            <div id="visbal-debug-box" class="visbal-debug-box">
                <div class="visbal-debug-box-header">
                    <span class="visbal-debug-box-title">Debug Console</span>
                    <div class="visbal-debug-box-controls">
                        <button class="visbal-debug-box-button visbal-debug-box-minimize" title="Minimize">−</button>
                        <button class="visbal-debug-box-button visbal-debug-box-maximize" title="Maximize">□</button>
                    </div>
                </div>
                <div id="visbal-debug-box-content" class="visbal-debug-box-content">INITIALIZING...</div>
            </div>
        `;
    }

    public static getInstance(): DebugBox {
        if (!DebugBox.instance) {
            DebugBox.instance = new DebugBox();
        }
        return DebugBox.instance;
    }

    public getStyle(): string {
        return this.style;
    }

    public getScript(): string {
        return this.script;
    }

    public getHtml(): string {
        return this.html;
    }

    public getFullComponent(): string {
        return `
            <style>${this.style}</style>
            ${this.html}
            <script>${this.script}</script>
        `;
    }
} 