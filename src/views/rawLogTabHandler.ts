import * as vscode from 'vscode';

/**
 * Class to handle the raw log tab functionality
 */
export class RawLogTabHandler {
    private _webview: vscode.Webview;
    private _logLines: string[] = [];
    private _chunkSize: number = 500; // Number of lines to load at once

    /**
     * Constructor for RawLogTabHandler
     * @param webview The webview to communicate with
     */
    constructor(webview: vscode.Webview) {
        this._webview = webview;
    }

    /**
     * Sets the log lines
     * @param logLines The log lines to display
     */
    public setLogLines(logLines: string[]): void {
        this._logLines = logLines || [];
    }

    /**
     * Updates the raw log tab content in the webview
     */
    public updateRawLogTab(): void {
        // Only send the total line count and the first chunk initially
        const initialChunk = this._logLines.slice(0, this._chunkSize);
        
        this._webview.postMessage({
            command: 'updateRawLogTab',
            totalLines: this._logLines.length,
            initialChunk: initialChunk,
            chunkSize: this._chunkSize
        });
    }

    /**
     * Gets a chunk of log lines
     * @param startIndex The starting index
     * @param endIndex The ending index
     * @returns The chunk of log lines
     */
    public getLogChunk(startIndex: number, endIndex: number): string[] {
        return this._logLines.slice(startIndex, endIndex);
    }

    /**
     * Gets the HTML for the raw log tab placeholder
     * @returns HTML string for the raw log tab placeholder
     */
    public static getPlaceholderHtml(): string {
        return `
            <div id="raw-log-tab-placeholder">
                <div class="filter-bar">
                    <div class="filter-bar-header">
                        <button id="toggle-filter-bar" class="toggle-button">
                            <span class="toggle-icon">▼</span> Filters
                        </button>
                    </div>
                    <div class="filter-bar-content">
                        <div class="filter-options">
                            <label><input type="checkbox" id="filter-user-debug" value="USER_DEBUG"> USER_DEBUG</label>
                            <label><input type="checkbox" id="filter-soql" value="SOQL_EXECUTE"> SOQL</label>
                            <label><input type="checkbox" id="filter-dml" value="DML"> DML</label>
                            <label><input type="checkbox" id="filter-code-unit" value="CODE_UNIT"> CODE_UNIT</label>
                            <label><input type="checkbox" id="filter-system" value="SYSTEM"> SYSTEM</label>
                            <label><input type="checkbox" id="filter-exception" value="EXCEPTION"> EXCEPTION</label>
                            <label><input type="checkbox" id="filter-error" value="ERROR"> ERROR</label>
                        </div>
                        <div class="filter-actions">
                            <button id="apply-filters">Apply Filters</button>
                            <button id="clear-filters">Clear Filters</button>
                        </div>
                    </div>
                </div>
                
                <div class="search-controls">
                    <div class="search-row">
                        <input type="text" id="raw-log-search" placeholder="Search in log..." />
                        <button id="search-button">Search</button>
                        <button id="clear-search">Clear</button>
                        <span id="search-results">0 matches</span>
                    </div>
                    <div class="search-options">
                        <label><input type="checkbox" id="case-sensitive"> Case sensitive</label>
                        <label><input type="checkbox" id="whole-word"> Whole word</label>
                        <label><input type="checkbox" id="regex-search"> Regex</label>
                        <button id="prev-match" disabled>Previous</button>
                        <button id="next-match" disabled>Next</button>
                    </div>
                </div>
                
                <div class="raw-log-container">
                    <div id="raw-log-content" class="virtual-scroll-container">
                        <div id="raw-log-viewport" class="virtual-scroll-viewport">
                            <div id="raw-log-content-inner" class="virtual-scroll-content">
                                Loading log content...
                            </div>
                        </div>
                        <div id="raw-log-scrollbar" class="virtual-scroll-scrollbar">
                            <div id="raw-log-scrollbar-thumb" class="virtual-scroll-scrollbar-thumb"></div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .filter-bar {
                    margin-bottom: 15px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                
                .filter-bar-header {
                    padding: 8px 12px;
                    cursor: pointer;
                    user-select: none;
                }
                
                .toggle-button {
                    background: none;
                    border: none;
                    color: var(--vscode-foreground);
                    font-size: 14px;
                    font-weight: 500;
                    padding: 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    width: 100%;
                    text-align: left;
                }
                
                .toggle-icon {
                    margin-right: 8px;
                    transition: transform 0.2s;
                }
                
                .toggle-icon.collapsed {
                    transform: rotate(-90deg);
                }
                
                .filter-bar-content {
                    padding: 10px 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                
                .filter-options {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    margin-bottom: 10px;
                }
                
                .filter-options label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                }
                
                .filter-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }
                
                .filter-actions button {
                    padding: 4px 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                }
                
                .filter-actions button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .search-controls {
                    margin-bottom: 15px;
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .search-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                    gap: 10px;
                }
                
                .search-row input {
                    flex: 1;
                    padding: 5px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                
                .search-options {
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }
                
                .raw-log-container {
                    height: calc(100vh - 280px);
                    overflow: hidden;
                    border: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-editor-background);
                    padding: 0;
                    position: relative;
                }
                
                .virtual-scroll-container {
                    display: flex;
                    height: 100%;
                    width: 100%;
                    position: relative;
                }
                
                .virtual-scroll-viewport {
                    flex: 1;
                    overflow: auto;
                    position: relative;
                }
                
                .virtual-scroll-content {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    font-family: monospace;
                    white-space: pre;
                    padding: 10px;
                }
                
                .virtual-scroll-scrollbar {
                    width: 16px;
                    background-color: var(--vscode-scrollbarSlider-background);
                    position: relative;
                    display: none; /* Hide custom scrollbar for now */
                }
                
                .virtual-scroll-scrollbar-thumb {
                    width: 100%;
                    background-color: var(--vscode-scrollbarSlider-hoverBackground);
                    position: absolute;
                    cursor: pointer;
                }
                
                .highlight {
                    background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
                    color: var(--vscode-editor-findMatchHighlightForeground, inherit);
                }
                
                .current-highlight {
                    background-color: var(--vscode-editor-findMatchBackground, #f8c945);
                    color: var(--vscode-editor-findMatchForeground, inherit);
                }
                
                .line-number {
                    display: inline-block;
                    min-width: 40px;
                    padding-right: 10px;
                    text-align: right;
                    color: var(--vscode-editorLineNumber-foreground);
                    user-select: none;
                }
                
                .log-line {
                    display: block;
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                
                .log-line:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .log-line.filtered {
                    display: none;
                }
                
                .loading-indicator {
                    text-align: center;
                    padding: 10px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        `;
    }

    /**
     * Gets the JavaScript for handling raw log tab updates
     * @returns JavaScript string for handling raw log tab updates
     */
    public static getJavaScript(): string {
        return `
            // Virtual scrolling variables
            let totalLogLines = 0;
            let loadedChunks = {};
            let chunkSize = 500;
            let lineHeight = 20; // Estimated height of each line in pixels
            let viewportHeight = 0;
            let isScrolling = false;
            let scrollTimeout = null;
            let activeFilters = [];
            
            // Function to update raw log tab content
            function updateRawLogTab(data) {
                console.log('[VisbalLogView:WebView] Updating raw log tab with data:', data);
                const placeholder = document.getElementById('raw-log-tab-placeholder');
                
                if (!placeholder) {
                    console.error('[VisbalLogView:WebView] Raw log tab placeholder not found');
                    return;
                }
                
                // Find the log content container
                const viewport = document.getElementById('raw-log-viewport');
                const content = document.getElementById('raw-log-content-inner');
                
                if (!viewport || !content) {
                    console.error('[VisbalLogView:WebView] Raw log content elements not found');
                    return;
                }
                
                // Store total lines and chunk size
                totalLogLines = data.totalLines || 0;
                chunkSize = data.chunkSize || 500;
                
                // Clear existing content
                content.innerHTML = '';
                loadedChunks = {};
                
                if (totalLogLines === 0) {
                    content.textContent = 'No log content available';
                    return;
                }
                
                // Store the initial chunk
                if (data.initialChunk && data.initialChunk.length > 0) {
                    loadedChunks[0] = data.initialChunk;
                }
                
                // Set the content height based on total lines
                content.style.height = (totalLogLines * lineHeight) + 'px';
                
                // Set up the viewport
                viewportHeight = viewport.clientHeight;
                
                // Render the visible lines
                renderVisibleLines();
                
                // Set up scroll event
                viewport.addEventListener('scroll', handleScroll);
                
                // Setup filter functionality
                setupFilterFunctionality();
                
                // Setup search functionality
                setupSearchFunctionality();
            }
            
            // Function to handle scroll events
            function handleScroll(event) {
                // Render visible lines with debounce
                if (!isScrolling) {
                    isScrolling = true;
                    requestAnimationFrame(renderVisibleLines);
                }
                
                // Clear previous timeout
                if (scrollTimeout) {
                    clearTimeout(scrollTimeout);
                }
                
                // Set a timeout to detect when scrolling stops
                scrollTimeout = setTimeout(() => {
                    isScrolling = false;
                    renderVisibleLines();
                }, 100);
            }
            
            // Function to render visible lines
            function renderVisibleLines() {
                const viewport = document.getElementById('raw-log-viewport');
                const content = document.getElementById('raw-log-content-inner');
                
                if (!viewport || !content) return;
                
                // Calculate visible range
                const scrollTop = viewport.scrollTop;
                const startLine = Math.floor(scrollTop / lineHeight);
                const visibleLines = Math.ceil(viewportHeight / lineHeight);
                const endLine = Math.min(startLine + visibleLines + 20, totalLogLines); // Add buffer
                
                // Calculate which chunks we need
                const startChunk = Math.floor(startLine / chunkSize);
                const endChunk = Math.floor((endLine - 1) / chunkSize);
                
                // Check if we have all the chunks we need
                let allChunksLoaded = true;
                for (let i = startChunk; i <= endChunk; i++) {
                    if (!loadedChunks[i]) {
                        allChunksLoaded = false;
                        requestChunk(i);
                    }
                }
                
                // If we have all chunks, render the visible lines
                if (allChunksLoaded) {
                    // Clear existing content
                    content.innerHTML = '';
                    
                    // Create a document fragment to improve performance
                    const fragment = document.createDocumentFragment();
                    
                    // Add a spacer at the top to position the visible lines correctly
                    const topSpacer = document.createElement('div');
                    topSpacer.style.height = (startLine * lineHeight) + 'px';
                    fragment.appendChild(topSpacer);
                    
                    // Add visible lines
                    for (let i = startLine; i < endLine; i++) {
                        const chunkIndex = Math.floor(i / chunkSize);
                        const lineIndexInChunk = i % chunkSize;
                        const chunk = loadedChunks[chunkIndex];
                        
                        if (chunk && lineIndexInChunk < chunk.length) {
                            const lineText = chunk[lineIndexInChunk];
                            
                            // Skip filtered lines
                            if (shouldFilterLine(lineText)) {
                                continue;
                            }
                            
                            const lineElement = document.createElement('div');
                            lineElement.className = 'log-line';
                            lineElement.setAttribute('data-line', i.toString());
                            
                            const lineNumber = document.createElement('span');
                            lineNumber.className = 'line-number';
                            lineNumber.textContent = (i + 1).toString();
                            
                            const lineContent = document.createElement('span');
                            lineContent.className = 'line-content';
                            lineContent.textContent = lineText;
                            
                            lineElement.appendChild(lineNumber);
                            lineElement.appendChild(lineContent);
                            fragment.appendChild(lineElement);
                        }
                    }
                    
                    // Add a spacer at the bottom to maintain scroll height
                    const bottomSpacer = document.createElement('div');
                    const bottomSpacerHeight = Math.max(0, (totalLogLines - endLine) * lineHeight);
                    bottomSpacer.style.height = bottomSpacerHeight + 'px';
                    fragment.appendChild(bottomSpacer);
                    
                    // Append the fragment to the content
                    content.appendChild(fragment);
                } else {
                    // Show loading indicator if not all chunks are loaded
                    if (content.querySelector('.loading-indicator') === null) {
                        const loadingIndicator = document.createElement('div');
                        loadingIndicator.className = 'loading-indicator';
                        loadingIndicator.textContent = 'Loading more log lines...';
                        content.appendChild(loadingIndicator);
                    }
                }
                
                isScrolling = false;
            }
            
            // Function to check if a line should be filtered out
            function shouldFilterLine(lineText) {
                // If no active filters, show all lines
                if (activeFilters.length === 0) {
                    return false;
                }
                
                // Check if the line contains any of the active filters
                for (const filter of activeFilters) {
                    if (lineText.includes(filter)) {
                        return false; // Don't filter out this line
                    }
                }
                
                // If we have active filters but none match, filter out this line
                return true;
            }
            
            // Function to request a chunk of log lines
            function requestChunk(chunkIndex) {
                console.log('[VisbalLogView:WebView] Requesting chunk:', chunkIndex);
                
                // Send a message to the extension to request the chunk
                vscode.postMessage({
                    command: 'getLogChunk',
                    chunkIndex: chunkIndex,
                    chunkSize: chunkSize
                });
            }
            
            // Function to receive a chunk of log lines
            function receiveLogChunk(chunkIndex, chunk) {
                console.log('[VisbalLogView:WebView] Received chunk:', chunkIndex, 'with', chunk.length, 'lines');
                
                // Store the chunk
                loadedChunks[chunkIndex] = chunk;
                
                // Render visible lines
                renderVisibleLines();
            }
            
            // Setup filter functionality
            function setupFilterFunctionality() {
                const filterBar = document.querySelector('.filter-bar');
                const filterBarHeader = document.querySelector('.filter-bar-header');
                const filterBarContent = document.querySelector('.filter-bar-content');
                const toggleIcon = document.querySelector('.toggle-icon');
                const applyFiltersButton = document.getElementById('apply-filters');
                const clearFiltersButton = document.getElementById('clear-filters');
                const filterCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]');
                
                // Toggle filter bar visibility
                filterBarHeader.addEventListener('click', () => {
                    filterBarContent.style.display = filterBarContent.style.display === 'none' ? 'block' : 'none';
                    toggleIcon.classList.toggle('collapsed');
                });
                
                // Apply filters
                applyFiltersButton.addEventListener('click', () => {
                    activeFilters = [];
                    
                    // Collect checked filters
                    filterCheckboxes.forEach(checkbox => {
                        if (checkbox.checked) {
                            activeFilters.push(checkbox.value);
                        }
                    });
                    
                    console.log('[VisbalLogView:WebView] Applied filters:', activeFilters);
                    
                    // Re-render with filters applied
                    renderVisibleLines();
                });
                
                // Clear filters
                clearFiltersButton.addEventListener('click', () => {
                    filterCheckboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    
                    activeFilters = [];
                    console.log('[VisbalLogView:WebView] Cleared filters');
                    
                    // Re-render with no filters
                    renderVisibleLines();
                });
            }
            
            // Setup search functionality
            function setupSearchFunctionality() {
                const searchInput = document.getElementById('raw-log-search');
                const searchButton = document.getElementById('search-button');
                const clearButton = document.getElementById('clear-search');
                const resultsCounter = document.getElementById('search-results');
                const caseSensitiveCheckbox = document.getElementById('case-sensitive');
                const wholeWordCheckbox = document.getElementById('whole-word');
                const regexCheckbox = document.getElementById('regex-search');
                const prevButton = document.getElementById('prev-match');
                const nextButton = document.getElementById('next-match');
                
                let currentMatches = [];
                let currentMatchIndex = -1;
                
                // Function to perform search
                function performSearch() {
                    const searchTerm = searchInput.value.trim();
                    if (!searchTerm) {
                        clearSearch();
                        return;
                    }
                    
                    // Clear previous highlights
                    clearHighlights();
                    
                    // Get search options
                    const caseSensitive = caseSensitiveCheckbox.checked;
                    const wholeWord = wholeWordCheckbox.checked;
                    const useRegex = regexCheckbox.checked;
                    
                    // Show searching message
                    resultsCounter.textContent = 'Searching...';
                    
                    // Send search request to extension
                    vscode.postMessage({
                        command: 'searchRawLog',
                        searchTerm: searchTerm,
                        caseSensitive: caseSensitive,
                        wholeWord: wholeWord,
                        useRegex: useRegex
                    });
                }
                
                // Function to clear search
                function clearSearch() {
                    searchInput.value = '';
                    clearHighlights();
                    currentMatches = [];
                    currentMatchIndex = -1;
                    resultsCounter.textContent = '0 matches';
                    prevButton.disabled = true;
                    nextButton.disabled = true;
                }
                
                // Function to clear highlights
                function clearHighlights() {
                    document.querySelectorAll('.highlight, .current-highlight').forEach(el => {
                        const parent = el.parentNode;
                        if (parent) {
                            parent.replaceChild(document.createTextNode(el.textContent), el);
                            parent.normalize();
                        }
                    });
                }
                
                // Function to highlight matches in visible lines
                function highlightMatches() {
                    // Get visible line elements
                    const lineElements = document.querySelectorAll('.log-line');
                    
                    lineElements.forEach(lineElement => {
                        const lineNumber = parseInt(lineElement.getAttribute('data-line'), 10);
                        
                        // Find matches for this line
                        const matchesForLine = currentMatches.filter(match => 
                            match.lineNumber === lineNumber
                        );
                        
                        if (matchesForLine.length > 0) {
                            const lineContent = lineElement.querySelector('.line-content');
                            if (!lineContent) return;
                            
                            const text = lineContent.textContent;
                            
                            // Create a new HTML content with highlights
                            let newHtml = text;
                            
                            // Sort matches by start index in descending order to avoid index shifting
                            matchesForLine.sort((a, b) => b.startIndex - a.startIndex);
                            
                            matchesForLine.forEach(match => {
                                const beforeMatch = newHtml.substring(0, match.startIndex);
                                const matchText = newHtml.substring(match.startIndex, match.endIndex);
                                const afterMatch = newHtml.substring(match.endIndex);
                                
                                const isCurrentMatch = currentMatchIndex >= 0 && 
                                    currentMatches[currentMatchIndex].lineNumber === lineNumber && 
                                    currentMatches[currentMatchIndex].startIndex === match.startIndex;
                                
                                newHtml = beforeMatch + 
                                    '<span class="' + (isCurrentMatch ? 'current-highlight' : 'highlight') + '">' + 
                                    matchText + 
                                    '</span>' + 
                                    afterMatch;
                            });
                            
                            lineContent.innerHTML = newHtml;
                        }
                    });
                }
                
                // Function to navigate to a search result
                function navigateToMatch(index) {
                    if (index < 0 || index >= currentMatches.length) return;
                    
                    const match = currentMatches[index];
                    
                    // Scroll to the line
                    const viewport = document.getElementById('raw-log-viewport');
                    viewport.scrollTop = match.lineNumber * lineHeight;
                    
                    // Update results counter
                    resultsCounter.textContent = (index + 1) + ' of ' + currentMatches.length + ' matches';
                    
                    // Wait for rendering and then highlight
                    setTimeout(() => {
                        // Clear current highlights
                        document.querySelectorAll('.current-highlight').forEach(el => {
                            el.classList.remove('current-highlight');
                            el.classList.add('highlight');
                        });
                        
                        // Find the line element
                        const lineElement = document.querySelector('.log-line[data-line="' + match.lineNumber + '"]');
                        if (lineElement) {
                            const lineContent = lineElement.querySelector('.line-content');
                            const highlights = lineContent.querySelectorAll('.highlight');
                            
                            // Find the correct highlight
                            highlights.forEach(highlight => {
                                // Simple heuristic to find the right highlight
                                if (highlight.textContent === match.text) {
                                    highlight.classList.remove('highlight');
                                    highlight.classList.add('current-highlight');
                                }
                            });
                        }
                    }, 100);
                }
                
                // Function to receive search results
                window.receiveSearchResults = function(results) {
                    currentMatches = results;
                    resultsCounter.textContent = results.length + ' matches';
                    
                    // Enable/disable navigation buttons
                    prevButton.disabled = results.length === 0;
                    nextButton.disabled = results.length === 0;
                    
                    // Highlight matches and navigate to first match
                    if (results.length > 0) {
                        currentMatchIndex = 0;
                        navigateToMatch(currentMatchIndex);
                    }
                };
                
                // Event listeners
                searchButton.addEventListener('click', performSearch);
                clearButton.addEventListener('click', clearSearch);
                
                searchInput.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        performSearch();
                    }
                });
                
                prevButton.addEventListener('click', () => {
                    if (currentMatches.length === 0) return;
                    
                    currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
                    navigateToMatch(currentMatchIndex);
                });
                
                nextButton.addEventListener('click', () => {
                    if (currentMatches.length === 0) return;
                    
                    currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
                    navigateToMatch(currentMatchIndex);
                });
                
                // Search options change handlers
                caseSensitiveCheckbox.addEventListener('change', performSearch);
                wholeWordCheckbox.addEventListener('change', performSearch);
                regexCheckbox.addEventListener('change', performSearch);
            }
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateRawLogTab':
                        updateRawLogTab(message);
                        break;
                    case 'logChunk':
                        receiveLogChunk(message.chunkIndex, message.chunk);
                        break;
                    case 'searchResults':
                        window.receiveSearchResults(message.results);
                        break;
                }
            });
            
            // Initialize filter bar
            document.addEventListener('DOMContentLoaded', () => {
                const filterBarContent = document.querySelector('.filter-bar-content');
                if (filterBarContent) {
                    // Start with filter bar collapsed
                    filterBarContent.style.display = 'none';
                    document.querySelector('.toggle-icon').classList.add('collapsed');
                }
            });
        `;
    }
} 