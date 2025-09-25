# 📊 Datos de Ejemplo
## GABRIE - Sistema de Gestión de Proyectos

Estos datos de ejemplo te ayudarán a probar tu aplicación.

## 🎯 Datos de Prueba

Copia y pega estos datos directamente en tu Google Sheet (a partir de la fila 2):

### Proyecto 1: Fonseca 560
```
ANTIOQUIA	Fonseca 560	150	25	140	SOLAR FOTOVOLTAICO	CON-2024-001	ALCALDÍA DE FONSECA	ENERGÍA SOLAR SAS	INTERVENTORÍA TÉCNICA LTDA	SOSTENIBILIDAD AMBIENTAL	APROBADO	FIRMADA	25000000	30000000	35000000	Vigente sin observaciones	2024-01-15	Documentación completa y aprobada	5	ACTIVO	CODIFICADO	85%	2024-02-01	PANEL 450W MONOCRISTALINO	INVERSOR 20KW TRIFÁSICO	CONTROLADOR MPPT 80A	BATERÍA LITIO 100AH	Sistema funcionando correctamente
```

### Proyecto 2: Ricky Bisbal Energy
```
BOGOTÁ	Ricky Bisbal Energy	200	15	185	HÍBRIDO SOLAR-EÓLICO	CON-2024-002	MINISTERIO DE ENERGÍA	BISBAL ENERGÍAS LTDA	CONTROL Y SEGUIMIENTO SAS	SOSTENIBILIDAD INTEGRAL	PENDIENTE	EN PROCESO	40000000	45000000	50000000	Requiere revisión técnica	2024-03-01	Faltan certificados técnicos	8	EN PROCESO	EN CODIFICACIÓN	60%	2024-04-01	PANEL 540W BIFACIAL	INVERSOR HÍBRIDO 25KW	CONTROLADOR INTELIGENTE 100A	SISTEMA DE BATERÍAS 200AH	Instalación en progreso
```

### Proyecto 3: Valle Solar
```
VALLE DEL CAUCA	Valle Solar	75	10	70	SOLAR RESIDENCIAL	CON-2024-003	GOBERNACIÓN DEL VALLE	SOLAR VALLE SAS	SUPERVISIÓN TÉCNICA	SOSTENIBILIDAD SOCIAL	APROBADO	FIRMADA	15000000	18000000	20000000	Proyecto piloto aprobado	2024-02-15	Documentación completa	3	ACTIVO	CODIFICADO	90%	2024-03-15	PANEL 400W POLICRISTALINO	MICROINVERSOR 300W	CONTROLADOR PWM 60A	BATERÍA GEL 80AH	Funcionando según especificaciones
```

## 📋 Formato de Columnas

Si prefieres agregar manualmente, aquí están las columnas en orden:

| # | Columna | Ejemplo |
|---|---------|---------|
| A | DEPARTAMENTO | ANTIOQUIA |
| B | PROYECTOS | Fonseca 560 |
| C | USUARIOS INICIALES | 150 |
| D | USUARIOS CON NOVEDADES | 25 |
| E | USUARIOS ATENDIDOS | 140 |
| F | TIPO DE PROYECTO | SOLAR FOTOVOLTAICO |
| G | NUMERO DE CONTRATO DE OBRA | CON-2024-001 |
| H | CONTRATANTE | ALCALDÍA DE FONSECA |
| I | CONTRATISTA | ENERGÍA SOLAR SAS |
| J | INTEVENTORIA | INTERVENTORÍA TÉCNICA LTDA |
| K | TIPO DE SOSTENIBILIDAD | SOSTENIBILIDAD AMBIENTAL |
| L | AVAL | APROBADO |
| M | ACTA | FIRMADA |
| N | CEPS INICIAL | 25000000 |
| O | CEPS VIGENCIA 2024 | 30000000 |
| P | CEPS VIGENCIA 2025 | 35000000 |
| Q | OBSERVACION CEPS | Vigente sin observaciones |
| R | FECHA DE INICIO DE PRESTACIÓN | 2024-01-15 |
| S | OBSERVACIONES DOCUMENTAL | Documentación completa y aprobada |
| T | CARTAS DE ADHESIÓN | 5 |
| U | ESTADO OPERATIVO | ACTIVO |
| V | ESTADO DE CODIFICACION | CODIFICADO |
| W | AVANCE DE RECIBO | 85% |
| X | FECHA ESTIMADA DE INICIO DE PRESTACIÓN | 2024-02-01 |
| Y | PANEL | PANEL 450W MONOCRISTALINO |
| Z | INVERSOR | INVERSOR 20KW TRIFÁSICO |
| AA | CONTROLADOR | CONTROLADOR MPPT 80A |
| BB | BATERIA | BATERÍA LITIO 100AH |
| CC | OBSERVACIONES OPERATIVAS | Sistema funcionando correctamente |

## 🔍 Probando la Búsqueda

Después de agregar los datos, prueba buscar:

- **"Fonseca"** → Debería encontrar "Fonseca 560"
- **"Ricky"** → Debería encontrar "Ricky Bisbal Energy"  
- **"Valle"** → Debería encontrar "Valle Solar"
- **"Solar"** → Debería mostrar sugerencias de múltiples proyectos

## 📊 Valores de Estado Sugeridos

### Estados Operativos:
- ACTIVO
- INACTIVO
- EN PROCESO
- COMPLETADO
- SUSPENDIDO
- CANCELADO

### Estados de Codificación:
- CODIFICADO
- EN CODIFICACIÓN
- PENDIENTE CODIFICACIÓN
- REVISIÓN TÉCNICA
- APROBADO
- RECHAZADO

### Tipos de Proyecto:
- SOLAR FOTOVOLTAICO
- SOLAR TÉRMICO
- EÓLICO
- HÍBRIDO SOLAR-EÓLICO
- BIOMASA
- HIDROELÉCTRICO
- GEOTÉRMICO

### Tipos de Sostenibilidad:
- SOSTENIBILIDAD AMBIENTAL
- SOSTENIBILIDAD SOCIAL
- SOSTENIBILIDAD ECONÓMICA
- SOSTENIBILIDAD INTEGRAL

## 💡 Tips para Datos Reales

1. **Fechas**: Usa formato YYYY-MM-DD o DD/MM/YYYY
2. **Números**: Para valores monetarios usa números sin separadores de miles
3. **Porcentajes**: Incluye el símbolo % o solo el número
4. **Estados**: Usa valores consistentes para filtros automáticos
5. **Nombres**: Sé consistente con mayúsculas y minúsculas

## 🎨 Personalización de Estados

La aplicación colorea automáticamente los estados:

- 🟢 **Verde**: APROBADO, ACTIVO, COMPLETADO
- 🟡 **Amarillo**: PENDIENTE, EN PROCESO  
- 🔴 **Rojo**: RECHAZADO, CANCELADO, INACTIVO

---

*Con estos datos de ejemplo, tu aplicación GABRIE estará lista para usar y demostrar.*
