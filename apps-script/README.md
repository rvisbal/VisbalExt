# GABRIE - Sistema de Gestión de Proyectos
## Google Apps Script Web Application

Esta aplicación web está diseñada para gestionar proyectos utilizando Google Sheets como base de datos y Google Apps Script como motor de la aplicación.

## 🚀 Características

- **Búsqueda inteligente**: Encuentra proyectos por nombre con sugerencias en tiempo real
- **Interfaz móvil**: Optimizada para dispositivos móviles y tablets
- **Vista detallada**: Información organizada en pestañas (General, Contractual, Técnico, Operativo)
- **CRUD completo**: Crear, leer, actualizar proyectos
- **Diseño moderno**: Interfaz intuitiva con Material Design

## 📋 Requisitos Previos

1. **Google Account** con acceso a Google Sheets y Google Apps Script
2. **Google Sheet** configurado con las columnas especificadas (ver estructura abajo)
3. Permisos de edición en el Google Sheet

## 🛠️ Instalación y Configuración

### Paso 1: Preparar Google Sheet

1. Crea un nuevo Google Sheet o usa uno existente
2. Renombra la primera pestaña a `DATOS`
3. Configura las siguientes columnas en la **fila 1** (exactamente como aparecen):

```
DEPARTAMENTO
PROYECTOS
USUARIOS INICIALES
USUARIOS CON NOVEDADES
USUARIOS ATENDIDOS
TIPO DE PROYECTO
NUMERO DE CONTRATO DE OBRA
CONTRATANTE
CONTRATISTA
INTEVENTORIA
TIPO DE SOSTENIBILIDAD
AVAL
ACTA
CEPS INICIAL
CEPS VIGENCIA 2024
CEPS VIGENCIA 2025
OBSERVACION CEPS
FECHA DE INICIO DE PRESTACIÓN
OBSERVACIONES DOCUMENTAL
CARTAS DE ADHESIÓN
ESTADO OPERATIVO
ESTADO DE CODIFICACION
AVANCE DE RECIBO
FECHA ESTIMADA DE INICIO DE PRESTACIÓN
PANEL
INVERSOR
CONTROLADOR
BATERIA
OBSERVACIONES OPERATIVAS
```

### Paso 2: Crear el Proyecto de Apps Script

1. Abre tu Google Sheet
2. Ve a **Extensiones** > **Apps Script**
3. Elimina el código por defecto en `Code.gs`
4. Copia y pega el contenido de `Code.gs` de este proyecto

### Paso 3: Agregar Archivos HTML

1. En el editor de Apps Script, haz clic en **+** > **Archivo HTML**
2. Crea los siguientes archivos:
   - `index.html` - Copia el contenido de `index.html`
   - `styles.html` - Copia el contenido de `styles.html`  
   - `scripts.html` - Copia el contenido de `scripts.html`

### Paso 4: Configurar y Desplegar

1. **Configurar variables**:
   - En `Code.gs`, verifica que `SHEET_NAME = 'DATOS'` coincida con el nombre de tu pestaña
   - Ajusta `SEARCH_COLUMN` si es necesario (por defecto busca en la columna 2: PROYECTOS)

2. **Probar la aplicación**:
   - Haz clic en **▶ Ejecutar** en la función `doGet`
   - Autoriza los permisos necesarios

3. **Desplegar la aplicación web**:
   - Ve a **Implementar** > **Nueva implementación**
   - Selecciona tipo: **Aplicación web**
   - **Ejecutar como**: Tu cuenta
   - **Quién puede acceder**: Según tus necesidades
   - Haz clic en **Implementar**
   - Copia la **URL de la aplicación web**

## 🎯 Uso de la Aplicación

### Búsqueda de Proyectos
1. Ingresa el nombre del proyecto en el campo de búsqueda
2. Usa las sugerencias automáticas o presiona Enter/Buscar
3. Ve la información detallada en las pestañas organizadas

### Agregar Nuevo Proyecto
1. Haz clic en el botón **"Nuevo"**
2. Completa los campos del formulario
3. Haz clic en **"Guardar"**

### Editar Proyecto Existente
1. Busca y selecciona un proyecto
2. Haz clic en el ícono de **editar** (✏️)
3. Modifica los campos necesarios
4. Guarda los cambios

## 🔧 Personalización

### Modificar Campos
Para agregar o quitar campos:
1. Actualiza las columnas en tu Google Sheet
2. La aplicación generará automáticamente los campos del formulario

### Cambiar Estilos
Modifica `styles.html` para personalizar:
- Colores y tema
- Tipografías
- Layout responsive
- Animaciones

### Agregar Funcionalidades
En `scripts.html` puedes agregar:
- Validaciones de formulario
- Nuevas funciones de búsqueda
- Exportación de datos
- Notificaciones

## 🔒 Seguridad y Permisos

- La aplicación requiere permisos para leer/escribir en Google Sheets
- Solo usuarios autorizados pueden acceder según la configuración de despliegue
- Los datos se mantienen en tu Google Sheet privado

## 📱 Compatibilidad

- **Navegadores**: Chrome, Firefox, Safari, Edge (versiones recientes)
- **Dispositivos**: Escritorio, tablet y móvil
- **Responsive**: Diseño adaptable a diferentes tamaños de pantalla

## 🐛 Solución de Problemas

### Error: "Sheet 'DATOS' not found"
- Verifica que la pestaña se llame exactamente `DATOS`
- Revisa la variable `SHEET_NAME` en `Code.gs`

### No aparecen sugerencias de búsqueda
- Asegúrate de tener datos en la columna `PROYECTOS`
- Verifica que `SEARCH_COLUMN` apunte a la columna correcta

### Formulario no carga campos
- Confirma que la primera fila contenga los headers correctos
- Revisa la función `getSheetHeaders()` en la consola de Apps Script

### Errores de permisos
- Re-autoriza la aplicación: **Implementar** > **Administrar implementaciones** > **Autorizar de nuevo**

## 🔄 Actualizaciones

Para actualizar la aplicación:
1. Modifica los archivos necesarios
2. **Implementar** > **Nueva implementación**
3. Usa la nueva URL generada

## 📞 Soporte

Para reportar problemas o solicitar funcionalidades:
1. Revisa este README
2. Verifica la consola de errores del navegador
3. Consulta los logs en Apps Script: **Ejecuciones**

## 📄 Licencia

Este proyecto está bajo licencia MIT. Puedes usarlo, modificarlo y distribuirlo libremente.

---

**Desarrollado para GABRIE - Sistema de Gestión de Proyectos**
*Optimizado para la gestión eficiente de proyectos con Google Sheets*


New deployment
Deployment successfully updated.
Version 1 on Sep 23, 2025, 11:39 AM
Deployment ID
AKfycbx5mqVGrKdiSXhIE91yGc0YuPWLar_KryPiK9Awrx2d5axWsXq9cyLNaUwZ5rvUalqE
Web app
URL
https://script.google.com/macros/s/AKfycbx5mqVGrKdiSXhIE91yGc0YuPWLar_KryPiK9Awrx2d5axWsXq9cyLNaUwZ5rvUalqE/exec
