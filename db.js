const Database = require('better-sqlite3');
const path = require('path');

const dataDir = process.env.DATA_DIR || __dirname;
const db = new Database(path.join(dataDir, 'mundial.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    es_admin INTEGER DEFAULT 0,
    puntos_total INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS equipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    nombre_corto TEXT,
    grupo TEXT NOT NULL,
    bandera TEXT DEFAULT '',
    confederacion TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS partidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fase TEXT DEFAULT 'grupos',
    grupo TEXT,
    equipo_local_id INTEGER REFERENCES equipos(id),
    equipo_visitante_id INTEGER REFERENCES equipos(id),
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estadio TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    goles_local INTEGER,
    goles_visitante INTEGER,
    estado TEXT DEFAULT 'pendiente'
  );
  CREATE TABLE IF NOT EXISTS pronosticos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    partido_id INTEGER REFERENCES partidos(id),
    goles_local INTEGER NOT NULL,
    goles_visitante INTEGER NOT NULL,
    puntos_obtenidos INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(usuario_id, partido_id)
  );
`);

module.exports = db;
