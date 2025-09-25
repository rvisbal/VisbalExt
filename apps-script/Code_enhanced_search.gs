/**
 * Google Apps Script Web App for Project Management
 * Enhanced search functionality - searches multiple columns, case insensitive, partial matching
 */

// Configuration
const SHEET_NAME = 'DATOS';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Replace with your actual spreadsheet ID if needed

// Columns to search in (by name) - add or remove as needed
const SEARCHABLE_COLUMNS = [
  'DEPARTAMENTO',
  'PROYECTOS', 
  'CONTRATANTE',
  'CONTRATISTA',
  'INTEVENTORIA',
  'NUMERO DE CONTRATO DE OBRA',
  'TIPO DE PROYECTO',
  'ESTADO OPERATIVO',
  'ESTADO DE CODIFICACION'
];

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
 * Get spreadsheet reference
 */
function getSpreadsheet() {
  try {
    // Try to get the active spreadsheet (works when script is container-bound)
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (error) {
    // Fallback: try to open by ID if specified
    if (SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID') {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    throw error;
  }
}

/**
 * Enhanced search function - searches multiple columns with case insensitive partial matching
 * @param {string} searchTerm - The term to search for
 * @return {Object} Search results
 */
function searchProject(searchTerm) {
  try {
    const ss = getSpreadsheet();
    
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
    
    // Create a map of column names to their indices for faster lookup
    const columnMap = {};
    headers.forEach((header, index) => {
      columnMap[header] = index;
    });
    
    // Get indices of searchable columns
    const searchableIndices = [];
    SEARCHABLE_COLUMNS.forEach(colName => {
      if (columnMap.hasOwnProperty(colName)) {
        searchableIndices.push(columnMap[colName]);
      }
    });
    
    // Convert search term to lowercase for case-insensitive search
    const searchTermLower = searchTerm.toLowerCase();
    
    // Search through data rows (skip header)
    const matchingRows = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      let isMatch = false;
      let matchedColumn = '';
      
      // Search in specified columns
      for (const colIndex of searchableIndices) {
        const cellValue = row[colIndex];
        if (cellValue && cellValue.toString().toLowerCase().includes(searchTermLower)) {
          isMatch = true;
          matchedColumn = headers[colIndex];
          break;
        }
      }
      
      if (isMatch) {
        // Create result object with all project data
        const projectData = {};
        headers.forEach((header, index) => {
          projectData[header] = row[index] || '';
        });
        
        matchingRows.push({
          rowNumber: i + 1,
          data: projectData,
          matchedIn: matchedColumn
        });
      }
    }
    
    if (matchingRows.length === 0) {
      return { 
        found: false, 
        message: `No projects found matching "${searchTerm}". Searched in: ${SEARCHABLE_COLUMNS.join(', ')}` 
      };
    }
    
    // Return the first match (or you could return all matches)
    const firstMatch = matchingRows[0];
    
    return {
      found: true,
      rowNumber: firstMatch.rowNumber,
      data: firstMatch.data,
      matchedIn: firstMatch.matchedIn,
      totalMatches: matchingRows.length,
      allMatches: matchingRows // Include all matches for potential future use
    };
    
  } catch (error) {
    console.error('Error in searchProject:', error);
    return { error: error.toString() };
  }
}

/**
 * Search for all projects matching a term (returns multiple results)
 * @param {string} searchTerm - The term to search for
 * @return {Array} Array of matching projects
 */
function searchAllProjects(searchTerm) {
  try {
    const result = searchProject(searchTerm);
    
    if (result.error) {
      return { error: result.error };
    }
    
    if (!result.found) {
      return { found: false, message: result.message };
    }
    
    // Return all matches
    return {
      found: true,
      matches: result.allMatches,
      totalMatches: result.totalMatches
    };
    
  } catch (error) {
    console.error('Error in searchAllProjects:', error);
    return { error: error.toString() };
  }
}

/**
 * Get all projects for dropdown/autocomplete - enhanced to search multiple columns
 * @return {Array} Array of project identifiers
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
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    if (values.length < 2) {
      return [];
    }
    
    const headers = values[0];
    const projectsSet = new Set(); // Use Set to avoid duplicates
    
    // Get indices for project identification columns
    const projectCol = headers.indexOf('PROYECTOS');
    const departmentCol = headers.indexOf('DEPARTAMENTO');
    const contractorCol = headers.indexOf('CONTRATANTE');
    
    // Collect unique identifiers from multiple columns
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // Add project name if exists
      if (projectCol >= 0 && row[projectCol]) {
        projectsSet.add(row[projectCol].toString().trim());
      }
      
      // Add department if exists
      if (departmentCol >= 0 && row[departmentCol]) {
        projectsSet.add(row[departmentCol].toString().trim());
      }
      
      // Add contractor if exists
      if (contractorCol >= 0 && row[contractorCol]) {
        projectsSet.add(row[contractorCol].toString().trim());
      }
    }
    
    return Array.from(projectsSet)
      .filter(item => item && item.length > 0)
      .sort();
      
  } catch (error) {
    console.error('Error in getAllProjects:', error);
    return [];
  }
}

/**
 * Get sheet headers for dynamic form generation
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
 * Test function to verify spreadsheet connection and show sample data
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
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    const sheetInfo = {
      spreadsheetName: ss.getName(),
      sheetName: sheet.getName(),
      lastRow: sheet.getLastRow(),
      lastColumn: sheet.getLastColumn(),
      headers: values.length > 0 ? values[0] : [],
      sampleData: values.length > 1 ? values[1] : [],
      searchableColumns: SEARCHABLE_COLUMNS
    };
    
    return { success: true, info: sheetInfo };
    
  } catch (error) {
    return { error: error.toString() };
  }
}
