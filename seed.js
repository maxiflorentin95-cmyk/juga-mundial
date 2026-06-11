const db = require('./db');
const bcrypt = require('bcryptjs');

console.log('🌱 Sembrando base de datos...');

// Limpiar tablas
db.exec('DELETE FROM pronosticos');
db.exec('DELETE FROM partidos');
db.exec('DELETE FROM equipos');
db.exec('DELETE FROM usuarios');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('pronosticos','partidos','equipos','usuarios')");

// ─── USUARIOS ────────────────────────────────────────────────────────────────
const hash = bcrypt.hashSync('admin2026', 10);
db.prepare(`INSERT INTO usuarios (username, email, password_hash, es_admin) VALUES (?,?,?,1)`)
  .run('admin', 'admin@juga.com', hash);
console.log('✓ Usuario admin creado (admin / admin2026)');

// ─── EQUIPOS ─────────────────────────────────────────────────────────────────
const equipos = [
  // Grupo A
  { nombre: 'Argentina',      corto: 'ARG', grupo: 'A', bandera: '🇦🇷', conf: 'CONMEBOL' },
  { nombre: 'Estados Unidos', corto: 'USA', grupo: 'A', bandera: '🇺🇸', conf: 'CONCACAF' },
  { nombre: 'Marruecos',      corto: 'MAR', grupo: 'A', bandera: '🇲🇦', conf: 'CAF' },
  { nombre: 'Japón',          corto: 'JPN', grupo: 'A', bandera: '🇯🇵', conf: 'AFC' },
  // Grupo B
  { nombre: 'México',         corto: 'MEX', grupo: 'B', bandera: '🇲🇽', conf: 'CONCACAF' },
  { nombre: 'Francia',        corto: 'FRA', grupo: 'B', bandera: '🇫🇷', conf: 'UEFA' },
  { nombre: 'Senegal',        corto: 'SEN', grupo: 'B', bandera: '🇸🇳', conf: 'CAF' },
  { nombre: 'Corea del Sur',  corto: 'KOR', grupo: 'B', bandera: '🇰🇷', conf: 'AFC' },
  // Grupo C
  { nombre: 'Canadá',         corto: 'CAN', grupo: 'C', bandera: '🇨🇦', conf: 'CONCACAF' },
  { nombre: 'Inglaterra',     corto: 'ENG', grupo: 'C', bandera: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', conf: 'UEFA' },
  { nombre: 'Brasil',         corto: 'BRA', grupo: 'C', bandera: '🇧🇷', conf: 'CONMEBOL' },
  { nombre: 'Australia',      corto: 'AUS', grupo: 'C', bandera: '🇦🇺', conf: 'AFC' },
  // Grupo D
  { nombre: 'Alemania',       corto: 'GER', grupo: 'D', bandera: '🇩🇪', conf: 'UEFA' },
  { nombre: 'Colombia',       corto: 'COL', grupo: 'D', bandera: '🇨🇴', conf: 'CONMEBOL' },
  { nombre: 'Egipto',         corto: 'EGY', grupo: 'D', bandera: '🇪🇬', conf: 'CAF' },
  { nombre: 'Arabia Saudita', corto: 'KSA', grupo: 'D', bandera: '🇸🇦', conf: 'AFC' },
  // Grupo E
  { nombre: 'España',         corto: 'ESP', grupo: 'E', bandera: '🇪🇸', conf: 'UEFA' },
  { nombre: 'Uruguay',        corto: 'URU', grupo: 'E', bandera: '🇺🇾', conf: 'CONMEBOL' },
  { nombre: 'Irán',           corto: 'IRN', grupo: 'E', bandera: '🇮🇷', conf: 'AFC' },
  { nombre: 'Nigeria',        corto: 'NGA', grupo: 'E', bandera: '🇳🇬', conf: 'CAF' },
  // Grupo F
  { nombre: 'Portugal',       corto: 'POR', grupo: 'F', bandera: '🇵🇹', conf: 'UEFA' },
  { nombre: 'Países Bajos',   corto: 'NED', grupo: 'F', bandera: '🇳🇱', conf: 'UEFA' },
  { nombre: 'Serbia',         corto: 'SRB', grupo: 'F', bandera: '🇷🇸', conf: 'UEFA' },
  { nombre: 'Camerún',        corto: 'CMR', grupo: 'F', bandera: '🇨🇲', conf: 'CAF' },
  // Grupo G
  { nombre: 'Italia',         corto: 'ITA', grupo: 'G', bandera: '🇮🇹', conf: 'UEFA' },
  { nombre: 'Bélgica',        corto: 'BEL', grupo: 'G', bandera: '🇧🇪', conf: 'UEFA' },
  { nombre: 'Túnez',          corto: 'TUN', grupo: 'G', bandera: '🇹🇳', conf: 'CAF' },
  { nombre: 'Honduras',       corto: 'HON', grupo: 'G', bandera: '🇭🇳', conf: 'CONCACAF' },
  // Grupo H
  { nombre: 'Croacia',        corto: 'CRO', grupo: 'H', bandera: '🇭🇷', conf: 'UEFA' },
  { nombre: 'Dinamarca',      corto: 'DEN', grupo: 'H', bandera: '🇩🇰', conf: 'UEFA' },
  { nombre: 'Ecuador',        corto: 'ECU', grupo: 'H', bandera: '🇪🇨', conf: 'CONMEBOL' },
  { nombre: 'Jordania',       corto: 'JOR', grupo: 'H', bandera: '🇯🇴', conf: 'AFC' },
  // Grupo I
  { nombre: 'Austria',        corto: 'AUT', grupo: 'I', bandera: '🇦🇹', conf: 'UEFA' },
  { nombre: 'Venezuela',      corto: 'VEN', grupo: 'I', bandera: '🇻🇪', conf: 'CONMEBOL' },
  { nombre: 'Sudáfrica',      corto: 'RSA', grupo: 'I', bandera: '🇿🇦', conf: 'CAF' },
  { nombre: 'Nueva Zelanda',  corto: 'NZL', grupo: 'I', bandera: '🇳🇿', conf: 'OFC' },
  // Grupo J
  { nombre: 'Turquía',        corto: 'TUR', grupo: 'J', bandera: '🇹🇷', conf: 'UEFA' },
  { nombre: 'Costa Rica',     corto: 'CRC', grupo: 'J', bandera: '🇨🇷', conf: 'CONCACAF' },
  { nombre: 'Argelia',        corto: 'ALG', grupo: 'J', bandera: '🇩🇿', conf: 'CAF' },
  { nombre: 'Uzbekistán',     corto: 'UZB', grupo: 'J', bandera: '🇺🇿', conf: 'AFC' },
  // Grupo K
  { nombre: 'Escocia',        corto: 'SCO', grupo: 'K', bandera: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', conf: 'UEFA' },
  { nombre: 'Rumanía',        corto: 'ROU', grupo: 'K', bandera: '🇷🇴', conf: 'UEFA' },
  { nombre: 'Panamá',         corto: 'PAN', grupo: 'K', bandera: '🇵🇦', conf: 'CONCACAF' },
  { nombre: 'Rep. Dem. Congo',corto: 'COD', grupo: 'K', bandera: '🇨🇩', conf: 'CAF' },
  // Grupo L
  { nombre: 'Rep. Checa',     corto: 'CZE', grupo: 'L', bandera: '🇨🇿', conf: 'UEFA' },
  { nombre: 'Paraguay',       corto: 'PAR', grupo: 'L', bandera: '🇵🇾', conf: 'CONMEBOL' },
  { nombre: 'Jamaica',        corto: 'JAM', grupo: 'L', bandera: '🇯🇲', conf: 'CONCACAF' },
  { nombre: 'Irak',           corto: 'IRQ', grupo: 'L', bandera: '🇮🇶', conf: 'AFC' },
];

const insertEquipo = db.prepare(
  'INSERT INTO equipos (nombre, nombre_corto, grupo, bandera, confederacion) VALUES (?,?,?,?,?)'
);
equipos.forEach(e => insertEquipo.run(e.nombre, e.corto, e.grupo, e.bandera, e.conf));
console.log(`✓ ${equipos.length} equipos insertados`);

// ─── HELPER: obtener id de equipo ─────────────────────────────────────────────
const eid = (nombre) => db.prepare('SELECT id FROM equipos WHERE nombre=?').get(nombre).id;

// ─── ESTADIOS ────────────────────────────────────────────────────────────────
const estadios = [
  { s: 'Estadio Azteca',              c: 'Ciudad de México' },
  { s: 'Estadio BBVA',                c: 'Monterrey' },
  { s: 'Estadio Akron',               c: 'Guadalajara' },
  { s: 'MetLife Stadium',             c: 'Nueva York/NJ' },
  { s: 'AT&T Stadium',                c: 'Dallas' },
  { s: 'SoFi Stadium',                c: 'Los Ángeles' },
  { s: 'Levi\'s Stadium',             c: 'San Francisco' },
  { s: 'Allegiant Stadium',           c: 'Las Vegas' },
  { s: 'Hard Rock Stadium',           c: 'Miami' },
  { s: 'Lumen Field',                 c: 'Seattle' },
  { s: 'Arrowhead Stadium',           c: 'Kansas City' },
  { s: 'Gillette Stadium',            c: 'Boston' },
  { s: 'Lincoln Financial Field',     c: 'Filadelfia' },
  { s: 'BC Place',                    c: 'Vancouver' },
  { s: 'BMO Field',                   c: 'Toronto' },
];

// ─── PARTIDOS ────────────────────────────────────────────────────────────────
// Formato: [local, visitante, fecha, hora, estadioIdx]
// Matchday 1: Jun 11-16 | Matchday 2: Jun 18-23 | Matchday 3: Jun 25-30

const fixtures = [
  // ── GRUPO A ──
  ['Argentina',      'Estados Unidos', '2026-06-11', '21:00', 3],
  ['Marruecos',      'Japón',          '2026-06-11', '18:00', 4],
  ['Argentina',      'Marruecos',      '2026-06-18', '18:00', 5],
  ['Japón',          'Estados Unidos', '2026-06-18', '21:00', 6],
  ['Argentina',      'Japón',          '2026-06-25', '22:00', 7],
  ['Estados Unidos', 'Marruecos',      '2026-06-25', '22:00', 8],
  // ── GRUPO B ──
  ['México',         'Francia',        '2026-06-11', '21:00', 0],
  ['Senegal',        'Corea del Sur',  '2026-06-11', '18:00', 1],
  ['México',         'Senegal',        '2026-06-18', '18:00', 2],
  ['Corea del Sur',  'Francia',        '2026-06-18', '21:00', 0],
  ['México',         'Corea del Sur',  '2026-06-25', '22:00', 1],
  ['Francia',        'Senegal',        '2026-06-25', '22:00', 2],
  // ── GRUPO C ──
  ['Canadá',         'Inglaterra',     '2026-06-12', '21:00', 13],
  ['Brasil',         'Australia',      '2026-06-12', '18:00', 4],
  ['Canadá',         'Brasil',         '2026-06-19', '18:00', 14],
  ['Australia',      'Inglaterra',     '2026-06-19', '21:00', 9],
  ['Canadá',         'Australia',      '2026-06-26', '22:00', 13],
  ['Inglaterra',     'Brasil',         '2026-06-26', '22:00', 3],
  // ── GRUPO D ──
  ['Alemania',       'Colombia',       '2026-06-12', '21:00', 5],
  ['Egipto',         'Arabia Saudita', '2026-06-12', '18:00', 6],
  ['Alemania',       'Egipto',         '2026-06-19', '18:00', 7],
  ['Arabia Saudita', 'Colombia',       '2026-06-19', '21:00', 8],
  ['Alemania',       'Arabia Saudita', '2026-06-26', '22:00', 5],
  ['Colombia',       'Egipto',         '2026-06-26', '22:00', 6],
  // ── GRUPO E ──
  ['España',         'Uruguay',        '2026-06-13', '21:00', 7],
  ['Irán',           'Nigeria',        '2026-06-13', '18:00', 10],
  ['España',         'Irán',           '2026-06-20', '18:00', 11],
  ['Nigeria',        'Uruguay',        '2026-06-20', '21:00', 12],
  ['España',         'Nigeria',        '2026-06-27', '22:00', 7],
  ['Uruguay',        'Irán',           '2026-06-27', '22:00', 10],
  // ── GRUPO F ──
  ['Portugal',       'Países Bajos',   '2026-06-13', '21:00', 8],
  ['Serbia',         'Camerún',        '2026-06-13', '18:00', 9],
  ['Portugal',       'Serbia',         '2026-06-20', '18:00', 4],
  ['Camerún',        'Países Bajos',   '2026-06-20', '21:00', 3],
  ['Portugal',       'Camerún',        '2026-06-27', '22:00', 8],
  ['Países Bajos',   'Serbia',         '2026-06-27', '22:00', 9],
  // ── GRUPO G ──
  ['Italia',         'Bélgica',        '2026-06-14', '21:00', 5],
  ['Túnez',          'Honduras',       '2026-06-14', '18:00', 0],
  ['Italia',         'Túnez',          '2026-06-21', '18:00', 1],
  ['Honduras',       'Bélgica',        '2026-06-21', '21:00', 2],
  ['Italia',         'Honduras',       '2026-06-28', '22:00', 5],
  ['Bélgica',        'Túnez',          '2026-06-28', '22:00', 0],
  // ── GRUPO H ──
  ['Croacia',        'Dinamarca',      '2026-06-14', '21:00', 6],
  ['Ecuador',        'Jordania',       '2026-06-14', '18:00', 11],
  ['Croacia',        'Ecuador',        '2026-06-21', '18:00', 12],
  ['Jordania',       'Dinamarca',      '2026-06-21', '21:00', 13],
  ['Croacia',        'Jordania',       '2026-06-28', '22:00', 6],
  ['Dinamarca',      'Ecuador',        '2026-06-28', '22:00', 11],
  // ── GRUPO I ──
  ['Austria',        'Venezuela',      '2026-06-15', '21:00', 3],
  ['Sudáfrica',      'Nueva Zelanda',  '2026-06-15', '18:00', 4],
  ['Austria',        'Sudáfrica',      '2026-06-22', '18:00', 7],
  ['Nueva Zelanda',  'Venezuela',      '2026-06-22', '21:00', 8],
  ['Austria',        'Nueva Zelanda',  '2026-06-29', '22:00', 3],
  ['Venezuela',      'Sudáfrica',      '2026-06-29', '22:00', 4],
  // ── GRUPO J ──
  ['Turquía',        'Costa Rica',     '2026-06-15', '21:00', 10],
  ['Argelia',        'Uzbekistán',     '2026-06-15', '18:00', 9],
  ['Turquía',        'Argelia',        '2026-06-22', '18:00', 5],
  ['Uzbekistán',     'Costa Rica',     '2026-06-22', '21:00', 6],
  ['Turquía',        'Uzbekistán',     '2026-06-29', '22:00', 10],
  ['Costa Rica',     'Argelia',        '2026-06-29', '22:00', 9],
  // ── GRUPO K ──
  ['Escocia',        'Rumanía',        '2026-06-16', '21:00', 11],
  ['Panamá',         'Rep. Dem. Congo','2026-06-16', '18:00', 12],
  ['Escocia',        'Panamá',         '2026-06-23', '18:00', 13],
  ['Rep. Dem. Congo','Rumanía',        '2026-06-23', '21:00', 14],
  ['Escocia',        'Rep. Dem. Congo','2026-06-30', '22:00', 11],
  ['Rumanía',        'Panamá',         '2026-06-30', '22:00', 12],
  // ── GRUPO L ──
  ['Rep. Checa',     'Paraguay',       '2026-06-16', '21:00', 0],
  ['Jamaica',        'Irak',           '2026-06-16', '18:00', 1],
  ['Rep. Checa',     'Jamaica',        '2026-06-23', '18:00', 2],
  ['Irak',           'Paraguay',       '2026-06-23', '21:00', 3],
  ['Rep. Checa',     'Irak',           '2026-06-30', '22:00', 0],
  ['Paraguay',       'Jamaica',        '2026-06-30', '22:00', 1],
];

const insertPartido = db.prepare(
  'INSERT INTO partidos (fase, grupo, equipo_local_id, equipo_visitante_id, fecha, hora, estadio, ciudad) VALUES (?,?,?,?,?,?,?,?)'
);

const grupoDeEquipo = (nombre) => db.prepare('SELECT grupo FROM equipos WHERE nombre=?').get(nombre).grupo;

fixtures.forEach(([local, visit, fecha, hora, estIdx]) => {
  const grupo = grupoDeEquipo(local);
  const est = estadios[estIdx];
  insertPartido.run('grupos', grupo, eid(local), eid(visit), fecha, hora, est.s, est.c);
});

console.log(`✓ ${fixtures.length} partidos insertados`);
console.log('✅ Base de datos lista!');
console.log('');
console.log('   👤 admin / admin2026');
console.log('   🌐 http://localhost:3000');
