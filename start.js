// start.js – entry point para producción
// Si la DB está vacía (no hay equipos), corre el seed automáticamente
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'mundial.db');

// Asegurar que el directorio de datos existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Cargar la DB (esto crea las tablas si no existen)
const db = require('./db');

// Si no hay equipos, hacer el seed automáticamente
const count = db.prepare('SELECT COUNT(*) as c FROM equipos').get();
if (!count || count.c === 0) {
  console.log('🌱 Base de datos vacía, ejecutando seed...');
  require('./seed');
}

// Arrancar el servidor
require('./server');
