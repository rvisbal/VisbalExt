import * as vscode from 'vscode';

/**
 * SearchLibrary class that provides methods for searching text in the editor
 */
export class SearchLibrary {
  /**
   * Finds text in the active editor
   * @param searchText The text to search for
   * @returns A promise that resolves when the search is complete
   */
  public static async findInEditor(searchText: string): Promise<boolean> {
    // Get the active text editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor found');
      return false;
    }

    // Get the document text
    const document = editor.document;
    const text = document.getText();

    // Find all occurrences of the search text
    const searchResults: vscode.Range[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(this.escapeRegExp(searchText), 'gi');
    
    while ((match = regex.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      searchResults.push(new vscode.Range(startPos, endPos));
    }

    // If no results found, show a message
    if (searchResults.length === 0) {
      vscode.window.showInformationMessage(`No matches found for "${searchText}"`);
      return false;
    }

    // Show the number of matches found
    vscode.window.showInformationMessage(`Found ${searchResults.length} matches for "${searchText}"`);

    // Create a selection for the first match
    editor.selection = new vscode.Selection(
      searchResults[0].start,
      searchResults[0].end
    );

    // Reveal the selection
    editor.revealRange(searchResults[0]);

    // Add decorations to highlight all matches
    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 255, 0, 0.3)',
      border: '1px solid yellow'
    });

    editor.setDecorations(decorationType, searchResults);

    // Remove decorations after a delay
    setTimeout(() => {
      decorationType.dispose();
    }, 3000);

    return true;
  }

  /**
   * Escapes special characters in a string for use in a regular expression
   * @param string The string to escape
   * @returns The escaped string
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
} 