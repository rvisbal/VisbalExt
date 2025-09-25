// Simple, working JavaScript for GABRIE search
let allProjects = [];
let currentProject = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

function initializeApp() {
  // Bind event listeners
  document.getElementById('searchBtn').addEventListener('click', handleSearch);
  document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });
  document.getElementById('clearSearch').addEventListener('click', clearSearch);
  document.getElementById('retryBtn').addEventListener('click', handleSearch);
  
  // Tab functionality
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
  
  // Load projects list
  loadProjectsList();
  
  // Focus on search input
  document.getElementById('searchInput').focus();
}

function handleSearch() {
  const searchTerm = document.getElementById('searchInput').value.trim();
  
  if (!searchTerm) {
    showError('Por favor ingresa un término para buscar');
    return;
  }
  
  showLoading();
  
  // Call the Google Apps Script function
  google.script.run
    .withSuccessHandler(handleSearchSuccess)
    .withFailureHandler(handleSearchError)
    .searchProject(searchTerm);
}

function handleSearchSuccess(result) {
  console.log('Search result received:', result);
  hideLoading();
  
  // Check if result exists and handle different cases
  if (!result) {
    showError('No se recibió respuesta del servidor');
    return;
  }
  
  if (result.error) {
    showError('Error: ' + result.error);
    return;
  }
  
  if (!result.found || result.found === false) {
    showNoResults(result.message || 'No se encontró el proyecto');
    return;
  }
  
  // Success - display the project
  if (result.data) {
    currentProject = result;
    displayProject(result.data);
  } else {
    showError('No se encontraron datos del proyecto');
  }
}

function handleSearchError(error) {
  console.error('Search error:', error);
  hideLoading();
  showError('Error al buscar: ' + (error.message || error.toString()));
}

function displayProject(data) {
  hideAllSections();
  
  // Set project header
  setElementText('projectName', data.PROYECTOS || 'Sin nombre');
  setElementText('projectDepartment', data.DEPARTAMENTO || 'Sin departamento');
  
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
  setElementText('fechaInicio', data['FECHA DE INICIO DE PRESTACIÓN']);
  setElementText('fechaEstimada', data['FECHA ESTIMADA DE INICIO DE PRESTACIÓN']);
  setElementText('observacionesDocumental', data['OBSERVACIONES DOCUMENTAL']);
  setElementText('observacionesOperativas', data['OBSERVACIONES OPERATIVAS']);
  
  // Show results section
  document.getElementById('resultsSection').style.display = 'block';
}

function setElementText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value || 'N/A';
  }
}

function setStatusBadge(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value || 'N/A';
    element.className = 'status-badge';
    
    if (value) {
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('activo') || lowerValue.includes('aprobado') || lowerValue.includes('completado')) {
        element.style.background = '#d4edda';
        element.style.color = '#155724';
      } else if (lowerValue.includes('pendiente') || lowerValue.includes('proceso')) {
        element.style.background = '#fff3cd';
        element.style.color = '#856404';
      } else if (lowerValue.includes('inactivo') || lowerValue.includes('cancelado')) {
        element.style.background = '#f8d7da';
        element.style.color = '#721c24';
      }
    }
  }
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  const activeContent = document.getElementById(tabName);
  if (activeContent) activeContent.classList.add('active');
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').style.display = 'none';
  hideAllSections();
  document.getElementById('searchInput').focus();
}

function loadProjectsList() {
  google.script.run
    .withSuccessHandler(function(projects) {
      allProjects = projects || [];
      console.log('Loaded projects for suggestions:', allProjects.length);
    })
    .withFailureHandler(function(error) {
      console.error('Error loading projects:', error);
    })
    .getAllProjects();
}

function showLoading() {
  hideAllSections();
  document.getElementById('loadingIndicator').style.display = 'block';
}

function hideLoading() {
  document.getElementById('loadingIndicator').style.display = 'none';
}

function showNoResults(message) {
  hideAllSections();
  const noResults = document.getElementById('noResults');
  if (noResults) {
    const messageEl = noResults.querySelector('p');
    if (messageEl) messageEl.textContent = message || 'No se encontró el proyecto';
    noResults.style.display = 'block';
  }
}

function showError(message) {
  hideAllSections();
  const errorDiv = document.getElementById('errorMessage');
  if (errorDiv) {
    const errorText = document.getElementById('errorText');
    if (errorText) errorText.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function hideAllSections() {
  const sections = ['loadingIndicator', 'resultsSection', 'noResults', 'errorMessage'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
