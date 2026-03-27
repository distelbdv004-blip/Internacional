# Documentación Técnica - Comparador Internacional Europa

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Estructura de Archivos](#estructura-de-archivos)
4. [Configuración e Instalación](#configuración-e-instalación)
5. [API Endpoints](#api-endpoints)
6. [Frontend - Interfaz de Usuario](#frontend---interfaz-de-usuario)
7. [Lógica de Cálculo](#lógica-de-cálculo)
8. [Extracción de Datos de Combustible](#extracción-de-datos-de-combustible)
9. [Tareas Programadas](#tareas-programadas)
10. [Mantenimiento y Solución de Problemas](#mantenimiento-y-solución-de-problemas)

---

## Descripción General

**Comparador Internacional Europa** es una aplicación web que permite comparar tarifas de envío entre dos transportistas principales en Europa:
- **GLS EuroBusinessParcel**
- **DHL Parcel ConnectPlus**

La aplicación calcula el coste total del envío incluyendo:
- Tarifa base según país y peso
- Suplemento de combustible (actualizado automáticamente)
- Suplemento CO₂ para GLS
- Suplemento Brexit para envíos a Reino Unido (DHL)

**Autor:** Astepimer S.L. · Sabadell · Exportación

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                      Cliente (Frontend)                      │
│   - HTML/CSS/JS                                              │
│   - Interfaz interactiva                                      │
│   - Cálculos en tiempo real                                   │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ HTTP / API
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   Servidor (Node.js)                         │
│   - Express                                                  │
│   - API RESTful                                              │
│   - Extracción de datos externos                             │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  DHL API      │       │  GLS API      │
│  (Web scrape) │       │  (Web scrape) │
│  dhl.com      │       │ clickgasoil.com│
└───────────────┘       └───────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│ fuel-data.json│       │gls-fuel-data. │
│               │       │    json       │
└───────────────┘       └───────────────┘
```

---

## Estructura de Archivos

```
comparador-transportes/
├── public/
│   └── index.html              # Frontend principal
├── server.js                    # Servidor Node.js principal
├── fuel-data.json               # Datos de combustible DHL
├── gls-fuel-data.json           # Datos de combustible GLS
├── package.json                 # Dependencias del proyecto
├── package-lock.json            # Versiones exactas de dependencias
└── README.md                    # Este archivo
```

---

## Configuración e Instalación

### Requisitos Previos
- Node.js (v14 o superior)
- npm (v6 o superior)

### Pasos de Instalación

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Iniciar el servidor en modo desarrollo**
   ```bash
   npm run dev
   ```

3. **Iniciar el servidor en modo producción**
   ```bash
   npm start
   ```

4. **Acceder a la aplicación**
   - Frontend: http://localhost:3001
   - API: http://localhost:3001/api/

### Variables de Configuración
| Variable | Valor por defecto | Descripción |
|----------|------------------|-------------|
| PORT | 3001 | Puerto del servidor |
| DEFAULT_DHL_RATE | 16.5 | Valor fallback para DHL |
| DEFAULT_GLS_RATE | 10.0 | Valor fallback para GLS |

---

## API Endpoints

### 1. **GET /api/dhl-fuel**
Obtiene el porcentaje de combustible actual de DHL.

**Respuesta:**
```json
{
  "rate": 16.75,
  "month": "Marzo",
  "year": 2026,
  "fullDate": "Marzo",
  "lastUpdate": "2026-03-26T15:26:49.908Z",
  "source": "DHL eCommerce",
  "status": "ok"
}
```

---

### 2. **POST /api/refresh-dhl**
Fuerza la actualización del combustible DHL desde la página oficial.

**Respuesta:**
```json
{
  "rate": 16.75,
  "updated": true,
  "timestamp": "2026-03-26T15:30:00.000Z"
}
```

---

### 3. **GET /api/gls-fuel**
Obtiene el porcentaje de combustible actual de GLS.

**Respuesta:**
```json
{
  "rate": 11,
  "pricePerLiter": 1.76,
  "pricePer1000L": 1760,
  "lastUpdate": "2026-03-26T15:26:50.091Z",
  "source": "clickgasoil.com",
  "status": "ok"
}
```

---

### 4. **POST /api/refresh-gls**
Fuerza la actualización del combustible GLS desde clickgasoil.com.

**Respuesta:**
```json
{
  "rate": 11,
  "updated": true,
  "timestamp": "2026-03-26T15:30:00.000Z"
}
```

---

### 5. **GET /api/health**
Verifica el estado del servidor y los archivos de datos.

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-26T15:30:00.000Z",
  "dhlDataFile": "exists",
  "glsDataFile": "exists"
}
```

---

## Frontend - Interfaz de Usuario

### Componentes Principales

#### 1. **Selector de Envío**
- **País destino**: Dropdown con 33 países europeos
- **Peso real**: Input numérico (0.5 - 1000 kg)

#### 2. **Suplementos de Combustible**
- **GLS**: Porcentaje combustible + CO₂ (1.5%)
- **DHL**: Porcentaje combustible automático
- Botones de actualización manual para ambos

#### 3. **Resultados de Comparación**
- Ranking de precios
- Desglose detallado de tarifas
- Resaltado del transportista más barato
- Información de tránsito

#### 4. **Tablas de Tarifas**
- Tramo por tramo de peso
- Cálculo automático con suplementos
- Resaltado del tramo seleccionado

### Funcionalidades JavaScript

| Función | Descripción |
|---------|-------------|
| `calc()` | Calcula precios con todos los suplementos |
| `glsBase()` | Obtiene tarifa base GLS según país/peso |
| `dhlBase()` | Obtiene tarifa base DHL según país/peso |
| `loadDHLSurcharge()` | Carga datos DHL desde servidor |
| `loadGLSFuelSurcharge()` | Carga datos GLS desde servidor |
| `refreshDHLSurcharge()` | Actualiza manualmente datos DHL |
| `refreshGLSFuelSurcharge()` | Actualiza manualmente datos GLS |
| `toggleDetail()` | Muestra/oculta detalles de tarifa |

---

## Lógica de Cálculo

### Fórmulas de Precio

#### GLS EuroBusinessParcel
```
Precio Total = Base + (Base × %Combustible/100) + (Base × %CO₂/100)
```

Donde:
- **Base**: Tarifa según país y peso (tabla GLS)
- **%Combustible**: Valor actualizado desde clickgasoil.com
- **%CO₂**: Fijo en 1.5%

#### DHL Parcel ConnectPlus
```
Precio Total = Base + (Base × %Combustible/100) + Brexit

Brexit (si aplica) = max(5€, kg × 0.25€)
```

Donde:
- **Base**: Tarifa según país y peso (tabla DHL)
- **%Combustible**: Valor actualizado desde dhl.com
- **Brexit**: Solo para Reino Unido (GB)

### Tablas de Tarifas

#### GLS - Tramo por Peso
| Tramo | Precio Base |
|-------|-------------|
| ≤ 1 kg | Variable por país |
| ≤ 2 kg | Variable por país |
| ... | ... |
| ≤ 40 kg | Variable por país |
| > 40 kg | Base 40kg + (kg-40) × factor |

#### DHL - Tabla Completa
Matriz 52×11 que relaciona:
- **Filas**: Peso en kg (1-500 kg)
- **Columnas**: Zonas (1-10 según país)

---

## Extracción de Datos de Combustible

### DHL - Web Scraping

**URL:** https://www.dhl.com/es-es/ecommerce/home/business-to-business-shipments/custom-solutions/fuel-surcharge.html

**Proceso:**
1. Realizar GET a la página con headers realistas
2. Parsear HTML con Cheerio
3. Buscar patrones de mes y porcentaje:
   ```
   /(Enero|Febrero|...|Diciembre)[:\s]+(\d{1,2}[,.]?\d{0,2})%/gi
   ```
4. Determinar mes objetivo (si es antes del día 10, usar mes anterior)
5. Guardar en `fuel-data.json`

**Mecanismo de Fallback:**
- Buscar en tablas de rangos
- Buscar cualquier porcentaje en la página
- Usar último valor guardado
- Usar valor por defecto (16.5%)

---

### GLS - Web Scraping

**URL:** https://www.clickgasoil.com/c/precio-gasoleo-a-catalua

**Proceso:**
1. Realizar GET a la página
2. Extraer precio del gasóleo A en Cataluña
3. Buscar en tabla de precios:
   - Método 1: Buscar "Precio medio" en tabla general
   - Método 2: Buscar "Barcelona" en tabla de provincias
   - Método 3: Buscar patrón `(\d+[.,]\d+)\s*EUR/L`
4. Convertir precio a porcentaje según tabla GLS
5. Guardar en `gls-fuel-data.json`

**Tabla de Conversión GLS:**
| Rango €/L | % Combustible |
|-----------|---------------|
| 0.00 - 1.00 | 4.0% |
| 1.01 - 1.40 | 6.5% |
| 1.41 - 1.46 | 7.0% |
| 1.47 - 1.51 | 7.5% |
| ... | ... |
| 1.72 - 1.76 | 11.0% |
| 1.77 - 1.81 | 11.5% |
| ... | ... |
| > 2.64 | 21.5% |

---

## Tareas Programadas

### CRON Jobs

| Tarea | Horario | Función |
|-------|---------|---------|
| Actualizar DHL | Todos los días a las 9:00 AM | `fetchDHLSurcharge()` |
| Actualizar GLS | Todos los días a las 9:05 AM | `fetchGLSFuelSurcharge()` |

**Implementación:**
```javascript
cron.schedule('0 9 * * *', async () => {
    await fetchDHLSurcharge();
});

cron.schedule('5 9 * * *', async () => {
    await fetchGLSFuelSurcharge();
});
```

---

## Mantenimiento y Solución de Problemas

### Logs y Monitorización

El servidor genera logs detallados:
```
🚀 Servidor iniciado
⛽ Consultando precio gasóleo A en Cataluña...
✅ Combustible GLS actualizado: 11% (basado en 1.76 €/L)
📡 Consultando página de DHL...
✅ Combustible DHL actualizado: 16.75% (Marzo)
📊 Resumen inicial:
   DHL: 16.75%
   GLS: 11%
```

### Errores Comunes

#### 1. **No se puede conectar con DHL**
- **Síntoma**: Error de timeout o conexión
- **Solución**: El sistema usa último valor guardado o por defecto
- **Verificar**: Conexión a internet, URL accesible

#### 2. **No se puede extraer precio GLS**
- **Síntoma**: No encuentra precio en clickgasoil.com
- **Solución**: Usa valor guardado o por defecto
- **Verificar**: Estructura de la página web no ha cambiado

#### 3. **El frontend no carga datos**
- **Síntoma**: Mensaje "Cargando..." permanente
- **Solución**: Verificar que el servidor esté corriendo
- **Verificar**: Ejecutar `npm start` y revisar puerto 3001

### Mantenimiento Preventivo

1. **Verificar periodicidad**: Los CRON jobs se ejecutan automáticamente
2. **Actualización manual**: Usar botones en interfaz o endpoints API
3. **Backup de datos**: Conservar `fuel-data.json` y `gls-fuel-data.json`
4. **Monitorear cambios**: Revisar si las páginas fuente cambian su estructura

### Actualización de Tablas de Tarifas

Las tablas de tarifas están definidas en el código JavaScript del frontend:
- **GLS**: Objeto `GLS` con datos por país
- **DHL**: Matriz `DHL_TABLE` con precios por peso/zona

Para actualizar:
1. Editar `index.html`
2. Buscar las definiciones de tablas
3. Modificar valores según nuevas tarifas
4. Refrescar página

---

## Seguridad y Buenas Prácticas

### Headers HTTP
Se utilizan headers realistas para evitar bloqueos:
```javascript
headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    'Accept': 'text/html,application/xhtml+xml,...',
    'Accept-Language': 'es-ES,es;q=0.9'
}
```

### Timeouts
- Timeout de 15-30 segundos para peticiones externas
- Evita bloqueos indefinidos

### Fallback Graceful
