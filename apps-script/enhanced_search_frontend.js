/**
 * Enhanced JavaScript for GABRIE frontend
 * Handles multiple search results and better error messages
 */

// Global variables
let currentProject = null;
let allProjects = [];
let sheetHeaders = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

/**
 * Initialize the application
 */
function initializeApp() {
  bindEventListeners();
  loadProjectsList();
  loadSheetHeaders();
  
  // Focus on search input
  document.getElementById('searchInput').focus();
}

/**
 * Bind all event listeners
 */
function bindEventListeners() {
  // Search functionality
  document.getElementById('searchBtn').addEventListener('click', handleSearch);
  document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });
  document.getElementById('searchInput').addEventListener('input', handleSearchInput);
  document.getElementById('clearSearch').addEventListener('click', clearSearch);
  
  // Project actions
  document.getElementById('editBtn').addEventListener('click', editProject);
  document.getElementById('refreshBtn').addEventListener('click', refreshProject);
  document.getElementById('addNewBtn').addEventListener('click', showAddProjectModal);
  document.getElementById('showAllBtn').addEventListener('click', showAllProjects);
  document.getElementById('retryBtn').addEventListener('click', handleSearch);
  
  // Tab functionality
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
}

/**
 * Handle search input changes for suggestions
 */
function handleSearchInput() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const suggestions = document.getElementById('searchSuggestions');
  
  if (input.value.length > 0) {
    clearBtn.style.display = 'block';
    showSuggestions(input.value);
  } else {
    clearBtn.style.display = 'none';
    hideSuggestions();
  }
}

/**
 * Show search suggestions
 */
function showSuggestions(query) {
  const suggestions = document.getElementById('searchSuggestions');
  
  if (!allProjects || allProjects.length === 0) {
    hideSuggestions();
    return;
  }
  
  const filtered = allProjects
    .filter(project => project.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10); // Show more suggestions
  
  if (filtered.length === 0) {
    hideSuggestions();
    return;
  }
  
  suggestions.innerHTML = filtered
    .map(project => `<div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(project)}')">${escapeHtml(project)}</div>`)
    .join('');
  
  suggestions.style.display = 'block';
}

/**
 * Hide search suggestions
 */
function hideSuggestions() {
  document.getElementById('searchSuggestions').style.display = 'none';
}

/**
 * Select a suggestion
 */
function selectSuggestion(project) {
  document.getElementById('searchInput').value = project;
  hideSuggestions();
  handleSearch();
}

/**
 * Clear search input
 */
function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').style.display = 'none';
  hideSuggestions();
  hideAllSections();
  document.getElementById('searchInput').focus();
}

/**
 * Handle search functionality
 */
function handleSearch() {
  const searchTerm = document.getElementById('searchInput').value.trim();
  
  if (!searchTerm) {
    showError('Por favor ingresa un término para buscar (nombre de proyecto, departamento, contratista, etc.)');
    return;
  }
  
  showLoading();
  hideSuggestions();
  
  google.script.run
    .withSuccessHandler(handleSearchSuccess)
    .withFailureHandler(handleSearchError)
    .searchProject(searchTerm);
}

/**
 * Handle successful search
 */
function handleSearchSuccess(result) {
  hideLoading();
  
  if (result.error) {
    showError(result.error);
    return;
  }
  
  if (!result.found) {
    showNoResults(result.message);
    return;
  }
  
  currentProject = result;
  displayProject(result.data, result);
}

/**
 * Handle search error
 */
function handleSearchError(error) {
  hideLoading();
  showError('Error al buscar: ' + error.message);
  console.error('Search error:', error);
}

/**
 * Display project data with enhanced info
 */
function displayProject(data, searchResult) {
  hideAllSections();
  
  // Set project header
  document.getElementById('projectName').textContent = data.PROYECTOS || 'Sin nombre';
  document.getElementById('projectDepartment').textContent = data.DEPARTAMENTO || 'Sin departamento';
  
  // Show match info if available
  if (searchResult && searchResult.matchedIn) {
    const matchInfo = document.createElement('div');
    matchInfo.style.cssText = 'font-size: 0.9rem; color: #28a745; margin-top: 0.5rem; font-weight: 500;';
    matchInfo.innerHTML = `<i class="fas fa-check-circle"></i> Encontrado en: ${searchResult.matchedIn}`;
    
    if (searchResult.totalMatches > 1) {
      matchInfo.innerHTML += ` (${searchResult.totalMatches} coincidencias encontradas)`;
    }
    
    document.getElementById('projectDepartment').appendChild(matchInfo);
  }
  
  // General tab
  setElementText('usuariosIniciales', data['USUARIOS INICIALES']);
  setElementText('usuariosNovedades', data['USUARIOS CON NOVEDADES']);
  setElementText('usuariosAtendidos', data['USUARIOS ATENDIDOS']);
  setElementText('tipoProyecto', data['TIPO DE PROYECTO']);
  setElementText('departamento', data.DEPARTAMENTO);
  setElementText('tipoSostenibilidad', data['TIPO DE SOSTENIBILIDAD']);
  
  // Contractual tab
  setElementText('numeroContrato', data['NUMERO DE CONTRATO DE OBRA']);
  setElementText('contratante', data.CONTRATANTE);
  setElementText('contratista', data.CONTRATISTA);
  setElementText('interventoria', data.INTEVENTORIA);
  setElementText('cepsInicial', data['CEPS INICIAL']);
  setElementText('ceps2024', data['CEPS VIGENCIA 2024']);
  setElementText('ceps2025', data['CEPS VIGENCIA 2025']);
  setElementText('observacionesCeps', data['OBSERVACION CEPS']);
  
  // Technical tab
  setElementText('panel', data.PANEL);
  setElementText('inversor', data.INVERSOR);
  setElementText('controlador', data.CONTROLADOR);
  setElementText('bateria', data.BATERIA);
  
  // Operational tab
  setStatusBadge('estadoOperativo', data['ESTADO OPERATIVO']);
  setStatusBadge('estadoCodificacion', data['ESTADO DE CODIFICACION']);
  setElementText('avanceRecibo', data['AVANCE DE RECIBO']);
  setElementText('fechaInicio', formatDate(data['FECHA DE INICIO DE PRESTACIÓN']));
  setElementText('fechaEstimada', formatDate(data['FECHA ESTIMADA DE INICIO DE PRESTACIÓN']));
  setElementText('observacionesDocumental', data['OBSERVACIONES DOCUMENTAL']);
  setElementText('observacionesOperativas', data['OBSERVACIONES OPERATIVAS']);
  
  document.getElementById('resultsSection').style.display = 'block';
}

/**
 * Set element text with fallback
 */
function setElementText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value || 'N/A';
  }
}

/**
 * Set status badge with appropriate styling
 */
function setStatusBadge(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value || 'N/A';
    
    // Add appropriate CSS class based on status
    element.className = 'status-badge';
    if (value) {
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('aprobado') || lowerValue.includes('activo') || lowerValue.includes('completado') || lowerValue.includes('firmada')) {
        element.style.background = '#d4edda';
        element.style.color = '#155724';
        element.style.border = '1px solid #c3e6cb';
      } else if (lowerValue.includes('pendiente') || lowerValue.includes('proceso') || lowerValue.includes('revision')) {
        element.style.background = '#fff3cd';
        element.style.color = '#856404';
        element.style.border = '1px solid #ffeaa7';
      } else if (lowerValue.includes('rechazado') || lowerValue.includes('cancelado') || lowerValue.includes('inactivo')) {
        element.style.background = '#f8d7da';
        element.style.color = '#721c24';
        element.style.border = '1px solid #f5c6cb';
      } else {
        element.style.background = '#e2e3e5';
        element.style.color = '#383d41';
        element.style.border = '1px solid #d6d8db';
      }
    }
  }
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName).classList.add('active');
}

/**
 * Edit current project
 */
function editProject() {
  alert('Función de edición próximamente disponible.\n\nPor ahora puedes editar directamente en la hoja de Google Sheets.');
}

/**
 * Refresh current project
 */
function refreshProject() {
  if (!currentProject) return;
  
  const projectName = currentProject.data.PROYECTOS;
  if (projectName) {
    document.getElementById('searchInput').value = projectName;
    handleSearch();
  }
}

/**
 * Show add new project modal
 */
function showAddProjectModal() {
  alert('Función de agregar proyecto próximamente disponible.\n\nPor ahora puedes agregar proyectos directamente en la hoja de Google Sheets.');
}

/**
 * Show all projects
 */
function showAllProjects() {
  if (allProjects && allProjects.length > 0) {
    const suggestions = document.getElementById('searchSuggestions');
    suggestions.innerHTML = `
      <div style="padding: 1rem; background: #f8f9fa; font-weight: 500; border-bottom: 1px solid #e9ecef;">
        <i class="fas fa-list"></i> Todos los elementos disponibles (${allProjects.length}):
      </div>
    ` + allProjects
      .slice(0, 50) // Show first 50 items
      .map(project => `<div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(project)}')">${escapeHtml(project)}</div>`)
      .join('');
    
    if (allProjects.length > 50) {
      suggestions.innerHTML += `<div style="padding: 1rem; text-align: center; color: #6c757d; font-size: 0.9rem;">... y ${allProjects.length - 50} elementos más</div>`;
    }
    
    suggestions.style.display = 'block';
  } else {
    showError('No hay datos disponibles. Por favor verifica que tu hoja de Google Sheets tenga información.');
  }
}

/**
 * Load projects list for suggestions
 */
function loadProjectsList() {
  google.script.run
    .withSuccessHandler(function(projects) {
      allProjects = projects || [];
      console.log('Loaded', allProjects.length, 'project identifiers');
    })
    .withFailureHandler(function(error) {
      console.error('Error loading projects:', error);
    })
    .getAllProjects();
}

/**
 * Load sheet headers for dynamic form
 */
function loadSheetHeaders() {
  google.script.run
    .withSuccessHandler(function(headers) {
      sheetHeaders = headers || [];
      console.log('Loaded', sheetHeaders.length, 'column headers');
    })
    .withFailureHandler(function(error) {
      console.error('Error loading headers:', error);
    })
    .getSheetHeaders();
}

/**
 * Show loading indicator
 */
function showLoading() {
  hideAllSections();
  document.getElementById('loadingIndicator').style.display = 'block';
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  document.getElementById('loadingIndicator').style.display = 'none';
}

/**
 * Show no results with custom message
 */
function showNoResults(message) {
  hideAllSections();
  const noResultsEl = document.getElementById('noResults');
  const messageEl = noResultsEl.querySelector('p');
  if (messageEl && message) {
    messageEl.textContent = message;
  }
  noResultsEl.style.display = 'block';
}

/**
 * Show error message
 */
function showError(message) {
  hideAllSections();
  document.getElementById('errorText').textContent = message;
  document.getElementById('errorMessage').style.display = 'block';
}

/**
 * Show success message
 */
function showSuccess(message) {
  const notification = document.createElement('div');
  notification.className = 'success-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 3000;
      animation: slideInRight 0.3s ease;
      max-width: 300px;
    ">
      <i class="fas fa-check-circle"></i> ${escapeHtml(message)}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 4000);
}

/**
 * Hide all sections
 */
function hideAllSections() {
  document.getElementById('loadingIndicator').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
