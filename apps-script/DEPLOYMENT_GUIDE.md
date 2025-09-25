# 🚀 Guía de Implementación Rápida
## GABRIE - Sistema de Gestión de Proyectos

Esta guía te ayudará a implementar la aplicación paso a paso en **15 minutos**.

## ⚡ Implementación Rápida

### 1️⃣ Configurar Google Sheet (3 minutos)

1. **Crear/Abrir Google Sheet**:
   ```
   👉 Ve a sheets.google.com
   👉 Crea nuevo sheet o abre uno existente
   ```

2. **Configurar Pestaña**:
   ```
   👉 Renombra la pestaña a "DATOS" (exacto)
   👉 En la fila 1, agrega estos headers (copia y pega):
   ```

3. **Headers de columnas** (copia esta línea completa):
   ```
   DEPARTAMENTO	PROYECTOS	USUARIOS INICIALES	USUARIOS CON NOVEDADES	USUARIOS ATENDIDOS	TIPO DE PROYECTO	NUMERO DE CONTRATO DE OBRA	CONTRATANTE	CONTRATISTA	INTEVENTORIA	TIPO DE SOSTENIBILIDAD	AVAL	ACTA	CEPS INICIAL	CEPS VIGENCIA 2024	CEPS VIGENCIA 2025	OBSERVACION CEPS	FECHA DE INICIO DE PRESTACIÓN	OBSERVACIONES DOCUMENTAL	CARTAS DE ADHESIÓN	ESTADO OPERATIVO	ESTADO DE CODIFICACION	AVANCE DE RECIBO	FECHA ESTIMADA DE INICIO DE PRESTACIÓN	PANEL	INVERSOR	CONTROLADOR	BATERIA	OBSERVACIONES OPERATIVAS
   ```

### 2️⃣ Crear Apps Script (5 minutos)

1. **Abrir Apps Script**:
   ```
   👉 En tu Google Sheet: Extensiones > Apps Script
   👉 Se abrirá una nueva pestaña
   ```

2. **Configurar Code.gs**:
   ```
   👉 Borra todo el código existente
   👉 Copia y pega el contenido completo de "Code.gs"
   👉 Ctrl+S para guardar
   ```

3. **Crear archivos HTML**:
   ```
   👉 Clic en + > Archivo HTML
   👉 Nombrar: "index"
   👉 Pegar contenido de "index.html"
   👉 Repetir para "styles" y "scripts"
   ```

### 3️⃣ Implementar Aplicación (4 minutos)

1. **Probar funcionamiento**:
   ```
   👉 Selecciona función "doGet"
   👉 Clic en ▶ Ejecutar
   👉 Autoriza permisos (primera vez)
   ```

2. **Crear implementación**:
   ```
   👉 Clic en "Implementar" > "Nueva implementación"
   👉 Tipo: "Aplicación web"
   👉 Ejecutar como: "Yo"
   👉 Acceso: Elige según necesidad
   👉 Clic "Implementar"
   ```

3. **Obtener URL**:
   ```
   👉 Copia la "URL de aplicación web"
   👉 ¡Esta es tu aplicación!
   ```

### 4️⃣ Verificar Funcionalidad (3 minutos)

1. **Probar la aplicación**:
   ```
   👉 Abre la URL en tu navegador
   👉 Debería ver la interfaz de GABRIE
   ```

2. **Agregar datos de prueba**:
   ```
   👉 En tu Google Sheet, agrega una fila de ejemplo:
   👉 Columna A: "ANTIOQUIA"
   👉 Columna B: "Proyecto Prueba 001"
   👉 Llenar otros campos según necesites
   ```

3. **Probar búsqueda**:
   ```
   👉 En la app, busca "Proyecto Prueba"
   👉 Debería aparecer el resultado
   ```

## 🎯 Opciones de Acceso

### Opción 1: Público
```
Acceso: "Cualquiera"
👍 Pros: Fácil acceso
👎 Contras: Menos seguro
```

### Opción 2: Solo tu organización
```
Acceso: "Cualquiera en [tu-organización]"
👍 Pros: Seguro para empresas
👎 Contras: Solo usuarios de la organización
```

### Opción 3: Solo tú
```
Acceso: "Solo yo"
👍 Pros: Máxima seguridad
👎 Contras: Solo puedes acceder tú
```

## 🔧 Configuraciones Adicionales

### Cambiar nombre del sheet:
En `Code.gs`, línea 6:
```javascript
const SHEET_NAME = 'DATOS'; // Cambia 'DATOS' por tu nombre
```

### Cambiar columna de búsqueda:
En `Code.gs`, línea 7:
```javascript
const SEARCH_COLUMN = 1; // 1 = columna B (PROYECTOS)
```

## 📱 URLs de Acceso

Después de implementar, tendrás:

```
URL de desarrollo: 
https://script.google.com/macros/d/{SCRIPT_ID}/exec

URL de producción:
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

## ⚠️ Checklist Final

- [ ] Google Sheet configurado con headers correctos
- [ ] Pestaña nombrada "DATOS"
- [ ] Code.gs copiado y guardado
- [ ] Archivos HTML creados (index, styles, scripts)
- [ ] Aplicación implementada
- [ ] URL copiada y probada
- [ ] Datos de prueba agregados
- [ ] Búsqueda funcionando

## 🚨 Problemas Comunes

### "No se puede acceder a la aplicación"
```
✅ Verifica permisos de implementación
✅ Usa navegador en modo incógnito
✅ Revisa autorización en Apps Script
```

### "Sheet not found"
```
✅ Verifica nombre exacto: "DATOS"
✅ Revisa variable SHEET_NAME en Code.gs
```

### "No aparecen sugerencias"
```
✅ Agrega datos en columna B (PROYECTOS)
✅ Verifica que hay al menos una fila de datos
```

## 🎉 ¡Listo!

Tu aplicación GABRIE está funcionando. Ahora puedes:
- Buscar proyectos existentes
- Agregar nuevos proyectos
- Editar información
- Acceder desde cualquier dispositivo

**URL de tu aplicación**: [Guarda tu URL aquí]

---

*¿Necesitas ayuda? Revisa el archivo README.md para más detalles técnicos.*
