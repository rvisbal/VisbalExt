// @ts-check

// Get access to the VS Code API from within the webview
/** @type {any} */
const vscode = acquireVsCodeApi();

// Keep track of the current log content
let logContent = '';
/** @type {string[]} */
let activeFilters = [];

// Wait until the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get elements
    /** @type {HTMLElement | null} */
    const filterBar = document.querySelector('.filter-bar');
    /** @type {HTMLElement | null} */
    const filterBarHeader = document.querySelector('.filter-bar-header');
    /** @type {HTMLElement | null} */
    const filterBarContent = document.querySelector('.filter-bar-content');
    /** @type {HTMLElement | null} */
    const toggleIcon = document.querySelector('.toggle-icon');
    /** @type {HTMLElement | null} */
    const applyFiltersButton = document.getElementById('apply-filters');
    /** @type {HTMLElement | null} */
    const clearFiltersButton = document.getElementById('clear-filters');
    /** @type {NodeListOf<HTMLInputElement>} */
    // @ts-ignore
    const filterCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]');
    /** @type {HTMLElement | null} */
    const logContentPre = document.getElementById('log-content-pre');
    
    // Start with filter bar collapsed
    if (filterBarContent) {
        // @ts-ignore
        filterBarContent.style.display = 'none';
        toggleIcon?.classList.add('collapsed');
    }
    
    // Toggle filter bar visibility
    filterBarHeader?.addEventListener('click', () => {
        if (filterBarContent && toggleIcon) {
            // @ts-ignore
            filterBarContent.style.display = filterBarContent.style.display === 'none' ? 'block' : 'none';
            toggleIcon.classList.toggle('collapsed');
        }
    });
    
    // Apply filters
    applyFiltersButton?.addEventListener('click', () => {
        activeFilters = [];
        
        // Collect checked filters
        filterCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                activeFilters.push(checkbox.value);
            }
        });
        
        console.log('Applied filters:', activeFilters);
        
        // Send message to extension to apply filters
        vscode.postMessage({
            type: 'applyFilters',
            filters: activeFilters
        });
    });
    
    // Clear filters
    clearFiltersButton?.addEventListener('click', () => {
        filterCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        activeFilters = [];
        console.log('Cleared filters');
        
        // Send message to extension to apply empty filters (show all)
        vscode.postMessage({
            type: 'applyFilters',
            filters: []
        });
    });
    
    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'update':
                // Update the log content
                logContent = message.text;
                updateLogContent(logContent);
                break;
                
            case 'filtered':
                // Update with filtered content
                updateLogContent(message.text);
                break;
        }
    });
    
    /**
     * Function to update the log content display
     * @param {string} content The log content to display
     */
    function updateLogContent(content) {
        if (!logContentPre) return;
        
        // Convert the content to HTML with line numbers
        const lines = content.split(/\r?\n/);
        let html = '';
        
        lines.forEach((line, index) => {
            // Add line number and content
            html += `<div class="log-line" data-line="${index + 1}">`;
            html += `<span class="line-number">${index + 1}</span>`;
            
            // Highlight USER_DEBUG lines
            if (line.includes('USER_DEBUG')) {
                html += `<span class="user-debug">${escapeHtml(line)}</span>`;
            } else {
                html += escapeHtml(line);
            }
            
            html += '</div>';
        });
        
        logContentPre.innerHTML = html;
    }
    
    /**
     * Helper function to escape HTML
     * @param {string} text The text to escape
     * @returns {string} The escaped HTML
     */
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}); 