const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Archivos de datos
const DHL_DATA_FILE = path.join(__dirname, 'fuel-data.json');
const GLS_DATA_FILE = path.join(__dirname, 'gls-fuel-data.json');

// Nombres de meses en español
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Valores por defecto
const DEFAULT_DHL_RATE = 16.5;
const DEFAULT_GLS_RATE = 10.0;

// ==================== TABLA DE COMBUSTIBLE GLS ====================
// Rangos en €/litro según la tabla oficial de GLS
const GLS_FUEL_TABLE = [
    { min: 0, max: 1.00, percent: 4.0 },
    { min: 1.01, max: 1.40, percent: 6.5 },
    { min: 1.41, max: 1.46, percent: 7.0 },
    { min: 1.47, max: 1.51, percent: 7.5 },
    { min: 1.52, max: 1.56, percent: 8.0 },
    { min: 1.57, max: 1.61, percent: 9.5 },
    { min: 1.62, max: 1.66, percent: 10.0 },
    { min: 1.67, max: 1.71, percent: 10.5 },
    { min: 1.72, max: 1.76, percent: 11.0 },
    { min: 1.77, max: 1.81, percent: 11.5 },
    { min: 1.82, max: 1.86, percent: 12.0 },
    { min: 1.87, max: 1.91, percent: 12.5 },
    { min: 1.92, max: 1.96, percent: 13.0 },
    { min: 1.97, max: 2.01, percent: 13.5 },
    { min: 2.02, max: 2.06, percent: 14.0 },
    { min: 2.07, max: 2.10, percent: 14.5 },
    { min: 2.11, max: 2.15, percent: 15.0 },
    { min: 2.16, max: 2.19, percent: 15.5 },
    { min: 2.20, max: 2.24, percent: 16.0 },
    { min: 2.24, max: 2.28, percent: 16.5 },
    { min: 2.28, max: 2.32, percent: 17.0 },
    { min: 2.32, max: 2.36, percent: 17.5 },
    { min: 2.36, max: 2.40, percent: 18.0 },
    { min: 2.40, max: 2.44, percent: 18.5 },
    { min: 2.44, max: 2.48, percent: 19.0 },
    { min: 2.48, max: 2.52, percent: 19.5 },
    { min: 2.52, max: 2.56, percent: 20.0 },
    { min: 2.56, max: 2.60, percent: 20.5 },
    { min: 2.60, max: 2.64, percent: 21.0 },
    { min: 2.64, max: 2.68, percent: 21.5 }
];

function getGLSFuelPercent(pricePerLiter) {
    console.log(`💰 Precio gasóleo: ${pricePerLiter} €/L`);
    
    for (const range of GLS_FUEL_TABLE) {
        if (pricePerLiter >= range.min && pricePerLiter <= range.max) {
            console.log(`📊 Rango encontrado: ${range.min}€ - ${range.max}€ → ${range.percent}%`);
            return range.percent;
        }
    }
    
    console.log('⚠️ No se encontró rango exacto, usando valor por defecto');
    return DEFAULT_GLS_RATE;
}

// ==================== FUNCIÓN PARA EXTRAER GLS ====================
async function fetchGLSFuelSurcharge() {
    try {
        console.log('\n⛽ Consultando precio gasóleo A en Cataluña...');
        console.log(`🕐 ${new Date().toLocaleString('es-ES')}`);
        
        const response = await axios.get('https://www.clickgasoil.com/c/precio-gasoleo-a-catalua', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9'
            },
            timeout: 15000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        let pricePerLiter = null;
        
        // Método 1: Buscar en la tabla de precios
        $('table').each((tableIdx, table) => {
            $(table).find('tr').each((rowIdx, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                    const firstCell = $(cells[0]).text().trim();
                    if (firstCell.includes('Precio medio') || firstCell === 'Precio medio') {
                        const priceText = $(cells[1]).text().trim();
                        const match = priceText.match(/(\d+[.,]\d+)/);
                        if (match) {
                            pricePerLiter = parseFloat(match[1].replace(',', '.'));
                            return false;
                        }
                    }
                }
            });
            if (pricePerLiter) return false;
        });
        
        // Método 2: Buscar en la tabla de provincias (Barcelona)
        if (!pricePerLiter) {
            const barcelonaRow = $('table tbody tr').filter((i, row) => {
                return $(row).text().includes('Barcelona');
            }).first();
            
            if (barcelonaRow.length) {
                const cells = $(barcelonaRow).find('td');
                if (cells.length >= 3) {
                    const priceText = $(cells[2]).text().trim();
                    const match = priceText.match(/(\d+[.,]\d+)/);
                    if (match) {
                        pricePerLiter = parseFloat(match[1].replace(',', '.'));
                        console.log(`✅ Precio Barcelona: ${pricePerLiter} €/L`);
                    }
                }
            }
        }
        
        // Método 3: Buscar cualquier precio con EUR/L
        if (!pricePerLiter) {
            const text = $('body').text();
            const match = text.match(/(\d+[.,]\d+)\s*EUR\/L/);
            if (match) {
                pricePerLiter = parseFloat(match[1].replace(',', '.'));
                console.log(`✅ Precio encontrado en texto: ${pricePerLiter} €/L`);
            }
        }
        
        if (!pricePerLiter || isNaN(pricePerLiter)) {
            throw new Error('No se pudo extraer el precio del gasóleo');
        }
        
        const percent = getGLSFuelPercent(pricePerLiter);
        
        const data = {
            rate: percent,
            pricePerLiter: pricePerLiter,
            pricePer1000L: pricePerLiter * 1000,
            lastUpdate: new Date().toISOString(),
            source: 'clickgasoil.com',
            status: 'ok',
            note: `Precio gasóleo A Cataluña: ${pricePerLiter} €/L → ${percent}% combustible GLS`
        };
        
        fs.writeFileSync(GLS_DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ Combustible GLS actualizado: ${percent}% (basado en ${pricePerLiter} €/L)`);
        
        return percent;
        
    } catch (error) {
        console.error('❌ Error al extraer precio GLS:', error.message);
        
        if (fs.existsSync(GLS_DATA_FILE)) {
            try {
                const saved = JSON.parse(fs.readFileSync(GLS_DATA_FILE, 'utf-8'));
                console.log(`📦 Usando valor GLS guardado: ${saved.rate}% (desde ${saved.lastUpdate})`);
                return saved.rate;
            } catch (readError) {
                console.error('Error al leer archivo guardado:', readError.message);
            }
        }
        
        console.log(`⚠️ Usando valor por defecto GLS: ${DEFAULT_GLS_RATE}%`);
        return DEFAULT_GLS_RATE;
    }
}

// ==================== FUNCIÓN PARA EXTRAER DHL ====================
function getTargetMonthYear() {
    const currentDate = new Date();
    let targetMonth = currentDate.getMonth();
    let targetYear = currentDate.getFullYear();
    
    // DHL publica el valor del mes anterior durante los primeros días
    if (currentDate.getDate() < 10) {
        targetMonth = targetMonth - 1;
        if (targetMonth < 0) {
            targetMonth = 11;
            targetYear--;
        }
    }
    
    return {
        month: MONTHS[targetMonth],
        monthIndex: targetMonth,
        year: targetYear
    };
}

async function fetchDHLSurcharge() {
    try {
        console.log('\n📡 Consultando página de DHL...');
        console.log(`🕐 ${new Date().toLocaleString('es-ES')}`);
        
        const response = await axios.get('https://www.dhl.com/es-es/ecommerce/home/business-to-business-shipments/custom-solutions/fuel-surcharge.html', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 30000,
            maxRedirects: 5
        });
        
        console.log('✅ Página cargada, tamaño:', response.data.length, 'bytes');
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        const foundRates = [];
        
        // Buscar patrones en el texto
        const text = $('body').text();
        
        // Buscar todos los meses con porcentajes
        const monthPattern = /(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)[:\s]+(\d{1,2}[,.]?\d{0,2})%/gi;
        let match;
        while ((match = monthPattern.exec(text)) !== null) {
            const month = match[1];
            const rate = parseFloat(match[2].replace(',', '.'));
            if (!isNaN(rate) && rate > 0 && rate < 50) {
                foundRates.push({ month, rate, fullDate: month });
                console.log(`📊 Encontrado: ${month} → ${rate}%`);
            }
        }
        
        // Si no encontró con el patrón anterior, buscar en la tabla de rangos
        if (foundRates.length === 0) {
            console.log('⚠️ Buscando en tabla de rangos...');
            $('table').each((i, table) => {
                const rows = $(table).find('tr');
                rows.each((j, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 3) {
                        const percentText = $(cells[2]).text().trim();
                        if (percentText && percentText.includes('%')) {
                            const percent = parseFloat(percentText.replace('%', '').replace(',', '.'));
                            if (!isNaN(percent) && percent > 0 && percent < 50) {
                                const priceRange = $(cells[0]).text().trim();
                                foundRates.push({ 
                                    month: 'último disponible', 
                                    rate: percent, 
                                    fullDate: `rango ${priceRange}` 
                                });
                                console.log(`📊 Valor en tabla: ${percent}% (${priceRange})`);
                            }
                        }
                    }
                });
            });
        }
        
        // Último recurso: buscar cualquier porcentaje en la página
        if (foundRates.length === 0) {
            console.log('⚠️ Buscando cualquier porcentaje...');
            const allPercentages = text.match(/(\d{1,2}[,.]?\d{0,2})%/g);
            if (allPercentages) {
                const percentages = allPercentages.map(p => parseFloat(p.replace('%', '').replace(',', '.')))
                    .filter(p => !isNaN(p) && p > 0 && p < 50);
                if (percentages.length > 0) {
                    const highest = Math.max(...percentages);
                    foundRates.push({ 
                        month: 'detectado automáticamente', 
                        rate: highest, 
                        fullDate: `valor ${highest}%` 
                    });
                    console.log(`📊 Valor detectado: ${highest}%`);
                }
            }
        }
        
        if (foundRates.length === 0) {
            throw new Error('No se pudo extraer ningún porcentaje de la página');
        }
        
        // Determinar el valor a usar
        const target = getTargetMonthYear();
        console.log(`🎯 Buscando valor para: ${target.month} ${target.year}`);
        
        let selectedRate = null;
        
        // Buscar coincidencia exacta
        selectedRate = foundRates.find(item => item.month === target.month);
        
        if (!selectedRate && target.monthIndex > 0) {
            const prevMonth = MONTHS[target.monthIndex - 1];
            selectedRate = foundRates.find(item => item.month === prevMonth);
            if (selectedRate) {
                console.log(`⚠️ No se encontró ${target.month}, usando ${prevMonth}`);
            }
        }
        
        if (!selectedRate && foundRates.length > 0) {
            selectedRate = foundRates[foundRates.length - 1];
            console.log(`⚠️ Usando el más reciente: ${selectedRate.fullDate} → ${selectedRate.rate}%`);
        }
        
        if (!selectedRate) {
            throw new Error('No se pudo seleccionar un valor');
        }
        
        const data = {
            rate: selectedRate.rate,
            month: selectedRate.month,
            year: target.year,
            fullDate: selectedRate.fullDate,
            lastUpdate: new Date().toISOString(),
            source: 'DHL eCommerce',
            status: 'ok',
            note: `Valor extraído automáticamente (${selectedRate.fullDate})`
        };
        
        fs.writeFileSync(DHL_DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ Combustible DHL actualizado: ${selectedRate.rate}% (${data.fullDate})`);
        
        return selectedRate.rate;
        
    } catch (error) {
        console.error('❌ Error al extraer dato de DHL:', error.message);
        
        if (fs.existsSync(DHL_DATA_FILE)) {
            try {
                const saved = JSON.parse(fs.readFileSync(DHL_DATA_FILE, 'utf-8'));
                console.log(`📦 Usando valor guardado: ${saved.rate}% (${saved.fullDate || saved.lastUpdate})`);
                return saved.rate;
            } catch (readError) {
                console.error('Error al leer archivo guardado:', readError.message);
            }
        }
        
        console.log(`⚠️ Usando valor por defecto DHL: ${DEFAULT_DHL_RATE}%`);
        
        const defaultData = {
            rate: DEFAULT_DHL_RATE,
            month: 'valor manual',
            year: new Date().getFullYear(),
            fullDate: 'configuración por defecto',
            lastUpdate: new Date().toISOString(),
            source: 'default',
            status: 'fallback',
            note: 'Valor por defecto mientras no se puede conectar con DHL'
        };
        
        try {
            fs.writeFileSync(DHL_DATA_FILE, JSON.stringify(defaultData, null, 2));
            console.log('📝 Valor por defecto guardado para futuras consultas');
        } catch (writeError) {
            console.error('No se pudo guardar valor por defecto:', writeError.message);
        }
        
        return DEFAULT_DHL_RATE;
    }
}

// ==================== ENDPOINTS ====================

// Endpoint DHL
app.get('/api/dhl-fuel', (req, res) => {
    try {
        if (fs.existsSync(DHL_DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DHL_DATA_FILE, 'utf-8'));
            res.json(data);
        } else {
            res.json({ rate: DEFAULT_DHL_RATE, status: 'pending', note: 'Valor pendiente de actualización' });
        }
    } catch (error) {
        console.error('Error en endpoint /api/dhl-fuel:', error.message);
        res.status(500).json({ error: 'Error al leer datos', rate: DEFAULT_DHL_RATE });
    }
});

app.post('/api/refresh-dhl', async (req, res) => {
    console.log('\n🔄 Actualización manual DHL solicitada');
    try {
        const rate = await fetchDHLSurcharge();
        res.json({ rate, updated: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Error en actualización manual DHL:', error.message);
        res.status(500).json({ error: 'Error al actualizar DHL', rate: DEFAULT_DHL_RATE });
    }
});

// Endpoint GLS
app.get('/api/gls-fuel', (req, res) => {
    try {
        if (fs.existsSync(GLS_DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(GLS_DATA_FILE, 'utf-8'));
            res.json(data);
        } else {
            res.json({ rate: DEFAULT_GLS_RATE, status: 'pending', note: 'Valor pendiente de actualización' });
        }
    } catch (error) {
        console.error('Error en endpoint /api/gls-fuel:', error.message);
        res.status(500).json({ error: 'Error al leer datos GLS', rate: DEFAULT_GLS_RATE });
    }
});

app.post('/api/refresh-gls', async (req, res) => {
    console.log('\n🔄 Actualización manual GLS solicitada');
    try {
        const rate = await fetchGLSFuelSurcharge();
        res.json({ rate, updated: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Error en actualización manual GLS:', error.message);
        res.status(500).json({ error: 'Error al actualizar GLS', rate: DEFAULT_GLS_RATE });
    }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        dhlDataFile: fs.existsSync(DHL_DATA_FILE) ? 'exists' : 'not found',
        glsDataFile: fs.existsSync(GLS_DATA_FILE) ? 'exists' : 'not found'
    });
});

// ==================== CRON JOBS ====================
// Actualizar DHL todos los días a las 9:00 AM
cron.schedule('0 9 * * *', async () => {
    console.log('\n🔄 Ejecutando actualización programada DHL...');
    await fetchDHLSurcharge();
});

// Actualizar GLS todos los días a las 9:05 AM
cron.schedule('5 9 * * *', async () => {
    console.log('\n🔄 Ejecutando actualización programada GLS...');
    await fetchGLSFuelSurcharge();
});

// ==================== INICIALIZACIÓN ====================
(async () => {
    console.log('🚀 Servidor iniciado');
    console.log(`📁 Archivo de datos DHL: ${DHL_DATA_FILE}`);
    console.log(`📁 Archivo de datos GLS: ${GLS_DATA_FILE}`);
    console.log(`🌐 Servidor escuchando en http://localhost:${PORT}`);
    
    // Cargar valores iniciales
    const dhlRate = await fetchDHLSurcharge();
    const glsRate = await fetchGLSFuelSurcharge();
    
    console.log('\n📊 Resumen inicial:');
    console.log(`   DHL: ${dhlRate}%`);
    console.log(`   GLS: ${glsRate}%`);
    
    console.log('\n📌 Endpoints disponibles:');
    console.log(`   GET  http://localhost:${PORT}/api/dhl-fuel  - Obtener valor DHL`);
    console.log(`   POST http://localhost:${PORT}/api/refresh-dhl - Forzar actualización DHL`);
    console.log(`   GET  http://localhost:${PORT}/api/gls-fuel   - Obtener valor GLS`);
    console.log(`   POST http://localhost:${PORT}/api/refresh-gls  - Forzar actualización GLS`);
    console.log(`   GET  http://localhost:${PORT}/api/health     - Verificar estado`);
    console.log(`   GET  http://localhost:${PORT}                - Frontend\n`);
})();

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});