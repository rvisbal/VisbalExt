/**
 * Google Apps Script Web App for Project Management
 * Simple enhanced search - case insensitive, multiple columns
 */

// Configuration
const SHEET_NAME = 'DATOS';

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
 * Enhanced search function - case insensitive, searches multiple columns
 * @param {string} searchTerm - The term to search for
 * @return {Object} Search results
 */
function searchProject(searchTerm) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (!ss) {
      throw new Error('No spreadsheet found. Make sure the Apps Script is connected to your Google Sheet.');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found. Please check that you have a sheet named "${SHEET_NAME}".`);
    }
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    if (values.length < 2) {
      return { error: 'No data found in sheet. Please add some data to your sheet.' };
    }
    
    // Get headers (first row)
    const headers = values[0];
    
    // Convert search term to lowercase for case-insensitive search
    const searchTermLower = searchTerm.toLowerCase().trim();
    
    // Define which columns to search in (by index)
    const searchableColumns = [
      0, // DEPARTAMENTO
      1, // PROYECTOS
      6, // NUMERO DE CONTRATO DE OBRA (if exists)
      7, // CONTRATANTE (if exists)
      8, // CONTRATISTA (if exists)
      9, // INTEVENTORIA (if exists)
    ];
    
    console.log(`Searching for: "${searchTerm}" (case insensitive)`);
    
    // Search through data rows (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      let isMatch = false;
      let matchedColumn = '';
      
      // Search in specified columns
      for (const colIndex of searchableColumns) {
        if (colIndex < row.length) {
          const cellValue = row[colIndex];
          if (cellValue && cellValue.toString().toLowerCase().includes(searchTermLower)) {
            isMatch = true;
            matchedColumn = headers[colIndex] || `Column ${colIndex + 1}`;
            console.log(`Match found in row ${i + 1}, column "${matchedColumn}": "${cellValue}"`);
            break;
          }
        }
      }
      
      if (isMatch) {
        // Create result object with all project data
        const result = {
          found: true,
          rowNumber: i + 1,
          data: {},
          matchedIn: matchedColumn
        };
        
        // Map each column to its header
        headers.forEach((header, index) => {
          result.data[header] = row[index] || '';
        });
        
        console.log('Returning search result:', result);
        return result;
      }
    }
    
    console.log('No matches found');
    return { 
      found: false, 
      message: `No projects found matching "${searchTerm}". Searched in departments, projects, contractors, and contract numbers.` 
    };
    
  } catch (error) {
    console.error('Error in searchProject:', error);
    return { error: error.toString() };
  }
}

/**
 * Get all projects for dropdown/autocomplete
 */
function getAllProjects() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (!ss) {
      return [];
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return [];
    }
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    if (values.length < 2) {
      return [];
    }
    
    const projects = new Set();
    
    // Collect unique values from first few columns
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // Add department (column 0)
      if (row[0]) projects.add(row[0].toString().trim());
      
      // Add project name (column 1)  
      if (row[1]) projects.add(row[1].toString().trim());
      
      // Add contractor (column 7) if exists
      if (row[7]) projects.add(row[7].toString().trim());
    }
    
    return Array.from(projects)
      .filter(item => item && item.length > 0)
      .sort();
      
  } catch (error) {
    console.error('Error in getAllProjects:', error);
    return [];
  }
}

/**
 * Get sheet headers
 */
function getSheetHeaders() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (!ss) {
      return [];
    }
    
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return [];
    }
    
    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    return headerRange.getValues()[0];
    
  } catch (error) {
    console.error('Error in getSheetHeaders:', error);
    return [];
  }
}

/**
 * Test function to debug the search
 */
function testSearch() {
  const result = searchProject('JUAN DE ACOSTA');
  console.log('Test search result:', result);
  return result;
}

/**
 * Test function to see sheet data
 */
function testSheetData() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const range = sheet.getDataRange();
    const values = range.getValues();
    try {
      console.log('Sheet info:', {
        sheetName: sheet.getName(),
        rows: values.length,
        columns: values[0] ? values[0].length : 0,
        headers: values[0] || [],
        firstDataRow: values[1] || []
      });
      
      return {
        success: true,
        sheetName: sheet.getName(),
        rows: values.length,
        columns: values[0] ? values[0].length : 0,
        headers: values[0] || [],
        firstDataRow: values[1] || []
      };
      
    } catch (error) {
      console.error('Error in testSheetData:', error);
      return { error: error.toString() };
    }
}
