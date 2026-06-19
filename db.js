// db.js – wrapper sobre pg (PostgreSQL) con API similar a better-sqlite3 pero async
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// Ejecutar sin resultado (DDL, DELETE sin retorno, etc.)
async function exec(sql) {
  await pool.query(sql);
}

// Preparar: devuelve objeto con .run(), .get(), .all() async
function prepare(sql) {
  // Convertir ? placeholders de SQLite a $1,$2,... de PostgreSQL
  function pgSql(s, params) {
    let i = 0;
    return s.replace(/\?/g, () => `$${++i}`);
  }

  return {
    async run(...args) {
      const flat = flatParams(args);
      const converted = pgSql(sql, flat);
      const res = await pool.query(converted + (converted.trim().toUpperCase().startsWith('INSERT') ? ' RETURNING *' : ''), flat.length ? flat : undefined);
      return {
        lastInsertRowid: res.rows[0]?.id ?? null,
        changes: res.rowCount
      };
    },
    async get(...args) {
      const flat = flatParams(args);
      const res = await pool.query(pgSql(sql, flat), flat.length ? flat : undefined);
      return res.rows[0];
    },
    async all(...args) {
      const flat = flatParams(args);
      const res = await pool.query(pgSql(sql, flat), flat.length ? flat : undefined);
      return res.rows;
    }
  };
}

function flatParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

// Inicializar schema
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      es_admin INTEGER DEFAULT 0,
      puntos_total INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS equipos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      nombre_corto TEXT,
      grupo TEXT NOT NULL,
      bandera TEXT DEFAULT '',
      confederacion TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS partidos (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      partido_id INTEGER REFERENCES partidos(id),
      goles_local INTEGER NOT NULL,
      goles_visitante INTEGER NOT NULL,
      puntos_obtenidos INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(usuario_id, partido_id)
    );
    CREATE TABLE IF NOT EXISTS pronosticos_especiales (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      tipo TEXT NOT NULL,
      valor TEXT NOT NULL,
      puntos_obtenidos INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(usuario_id, tipo)
    );
    CREATE TABLE IF NOT EXISTS resultados_especiales (
      tipo TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE pronosticos_especiales ADD COLUMN IF NOT EXISTS puntos_obtenidos INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS trivia_preguntas (
      id SERIAL PRIMARY KEY,
      orden INTEGER NOT NULL UNIQUE,
      pregunta TEXT NOT NULL,
      opcion_a TEXT NOT NULL,
      opcion_b TEXT NOT NULL,
      opcion_c TEXT NOT NULL,
      opcion_d TEXT NOT NULL,
      correcta TEXT NOT NULL,
      mundial TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS trivia_respuestas (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      pregunta_id INTEGER REFERENCES trivia_preguntas(id),
      respuesta TEXT,
      correcta BOOLEAN NOT NULL DEFAULT false,
      segundos_empleados NUMERIC(5,2),
      puntos INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(usuario_id, pregunta_id)
    );
    CREATE TABLE IF NOT EXISTS ranking_snapshots (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      posicion INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      UNIQUE(usuario_id, fecha)
    );
  `);
}

module.exports = { pool, prepare, exec, initSchema };
