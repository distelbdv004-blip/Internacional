const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Asegurar que los archivos de datos existen
const dataFiles = ['fuel-data.json', 'gls-fuel-data.json'];
dataFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.log(`📝 Creando archivo ${file}...`);
        fs.writeFileSync(filePath, JSON.stringify({ status: 'pending' }, null, 2));
    }
});

// Iniciar el servidor
console.log('🚀 Iniciando Comparador Internacional Europa...');
console.log('📁 Directorio de trabajo:', __dirname);
console.log('🌐 Abriendo navegador en http://localhost:3001\n');

// Ejecutar el servidor principal
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true
});

server.on('error', (err) => {
    console.error('❌ Error al iniciar el servidor:', err);
});

server.on('close', (code) => {
    console.log(`Servidor finalizado con código ${code}`);
});