/**
 * Google Apps Script Web App for Project Management
 * Connects to Google Sheet "DATOS" for project information
 */

// Configuration - Update these values for your specific setup
const SHEET_NAME = 'DATOS'; // Name of your Google Sheet tab
const SEARCH_COLUMN = 1; // Column index for PROYECTOS (Projects) - 1-based indexing

// IMPORTANT: Replace 'YOUR_SPREADSHEET_ID' with your actual Google Sheet ID
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Replace with your actual spreadsheet ID

/**
 * Main function that serves the web application
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Gestión de Proyectos - GABRIE')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no');
}

/**
 * Include function to load external HTML/CSS/JS files
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Get spreadsheet reference - use specific ID instead of active spreadsheet
 */
function getSpreadsheet() {
  try {
    if (SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
      throw new Error('Please update SPREADSHEET_ID in Code.gs with your actual spreadsheet ID');
    }
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (error) {
    console.error('Error opening spreadsheet:', error);
    // Fallback to active spreadsheet if ID method fails
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * Search for a project by name or ID
 * @param {string} searchTerm - The project name or ID to search for
 * @return {Object} Project data or null if not found
 */
function searchProject(searchTerm) {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found. Make sure the Apps Script is connected to your Google Sheet.');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found. Please check that you have a sheet named "${SHEET_NAME}" in your spreadsheet.`);
    }
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    if (values.length < 2) {
      return { error: 'No data found in sheet. Please add some data to your sheet.' };
    }
    
    // Get headers (first row)
    const headers = values[0];
    
    // Search through data rows (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const projectName = row[1]; // PROYECTOS column (index 1)
      
      if (projectName && projectName.toString().toLowerCase().includes(searchTerm.toLowerCase())) {
        // Create result object with all project data
        const result = {
          found: true,
          rowNumber: i + 1,
          data: {}
        };
        
        // Map each column to its header
        headers.forEach((header, index) => {
          result.data[header] = row[index] || '';
        });
        
        return result;
      }
    }
    
    return { found: false, message: `No project found matching "${searchTerm}"` };
    
  } catch (error) {
    console.error('Error in searchProject:', error);
    return { error: error.toString() };
  }
}

/**
 * Get all projects for dropdown/autocomplete
 * @return {Array} Array of project names
 */
function getAllProjects() {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const range = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1); // PROYECTOS column, skip header
    const values = range.getValues();
    
    return values
      .flat()
      .filter(project => project && project.toString().trim() !== '')
      .sort();
      
  } catch (error) {
    console.error('Error in getAllProjects:', error);
    return [];
  }
}

/**
 * Get sheet headers for dynamic form generation
 * @return {Array} Array of column headers
 */
function getSheetHeaders() {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    return headerRange.getValues()[0];
    
  } catch (error) {
    console.error('Error in getSheetHeaders:', error);
    return [];
  }
}

/**
 * Update project data
 * @param {number} rowNumber - Row number to update
 * @param {Object} projectData - Updated project data
 * @return {Object} Success or error result
 */
function updateProject(rowNumber, projectData) {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const updateRange = sheet.getRange(rowNumber, 1, 1, headers.length);
    const currentValues = updateRange.getValues()[0];
    
    // Update only changed values
    headers.forEach((header, index) => {
      if (projectData.hasOwnProperty(header)) {
        currentValues[index] = projectData[header];
      }
    });
    
    updateRange.setValues([currentValues]);
    
    return { success: true, message: 'Project updated successfully' };
    
  } catch (error) {
    console.error('Error in updateProject:', error);
    return { error: error.toString() };
  }
}

/**
 * Add new project
 * @param {Object} projectData - New project data
 * @return {Object} Success or error result
 */
function addProject(projectData) {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = [];
    
    // Create new row based on headers
    headers.forEach(header => {
      newRow.push(projectData[header] || '');
    });
    
    // Add to the end of the sheet
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, headers.length).setValues([newRow]);
    
    return { success: true, message: 'Project added successfully' };
    
  } catch (error) {
    console.error('Error in addProject:', error);
    return { error: error.toString() };
  }
}

/**
 * Test function to verify spreadsheet connection
 */
function testConnection() {
  try {
    const ss = getSpreadsheet();
    
    if (!ss) {
      return { error: 'No spreadsheet found' };
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return { error: `Sheet "${SHEET_NAME}" not found` };
    }
    
    const sheetInfo = {
      spreadsheetName: ss.getName(),
      sheetName: sheet.getName(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn()
    };
    
    return { success: true, info: sheetInfo };
    
  } catch (error) {
    return { error: error.toString() };
  }
}
