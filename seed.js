const { prepare, exec } = require('./db');
const bcrypt = require('bcryptjs');

async function run() {
  console.log('🌱 Sembrando base de datos...');

  await exec('DELETE FROM pronosticos');
  await exec('DELETE FROM partidos');
  await exec('DELETE FROM equipos');
  await exec('DELETE FROM usuarios');
  await exec('ALTER SEQUENCE equipos_id_seq RESTART WITH 1');
  await exec('ALTER SEQUENCE partidos_id_seq RESTART WITH 1');
  await exec('ALTER SEQUENCE usuarios_id_seq RESTART WITH 1');

  // ─── ADMIN ────────────────────────────────────────────────────────────────
  const hash = bcrypt.hashSync('admin2026', 10);
  await prepare('INSERT INTO usuarios (username, email, password_hash, es_admin) VALUES ($1,$2,$3,1)')
    .run('admin', 'admin@juga.com', hash);
  console.log('✓ Usuario admin creado (admin / admin2026)');

  // ─── EQUIPOS ──────────────────────────────────────────────────────────────
  const equipos = [
    // Grupo A
    { nombre: 'México',             corto: 'MEX', grupo: 'A', bandera: '🇲🇽', conf: 'CONCACAF' },
    { nombre: 'Corea del Sur',      corto: 'KOR', grupo: 'A', bandera: '🇰🇷', conf: 'AFC' },
    { nombre: 'Sudáfrica',          corto: 'RSA', grupo: 'A', bandera: '🇿🇦', conf: 'CAF' },
    { nombre: 'Chequia',            corto: 'CZE', grupo: 'A', bandera: '🇨🇿', conf: 'UEFA' },
    // Grupo B
    { nombre: 'Canadá',             corto: 'CAN', grupo: 'B', bandera: '🇨🇦', conf: 'CONCACAF' },
    { nombre: 'Suiza',              corto: 'SUI', grupo: 'B', bandera: '🇨🇭', conf: 'UEFA' },
    { nombre: 'Catar',              corto: 'QAT', grupo: 'B', bandera: '🇶🇦', conf: 'AFC' },
    { nombre: 'Bosnia-Herzegovina', corto: 'BIH', grupo: 'B', bandera: '🇧🇦', conf: 'UEFA' },
    // Grupo C
    { nombre: 'Brasil',             corto: 'BRA', grupo: 'C', bandera: '🇧🇷', conf: 'CONMEBOL' },
    { nombre: 'Marruecos',          corto: 'MAR', grupo: 'C', bandera: '🇲🇦', conf: 'CAF' },
    { nombre: 'Haití',              corto: 'HAI', grupo: 'C', bandera: '🇭🇹', conf: 'CONCACAF' },
    { nombre: 'Escocia',            corto: 'SCO', grupo: 'C', bandera: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', conf: 'UEFA' },
    // Grupo D
    { nombre: 'Estados Unidos',     corto: 'USA', grupo: 'D', bandera: '🇺🇸', conf: 'CONCACAF' },
    { nombre: 'Paraguay',           corto: 'PAR', grupo: 'D', bandera: '🇵🇾', conf: 'CONMEBOL' },
    { nombre: 'Australia',          corto: 'AUS', grupo: 'D', bandera: '🇦🇺', conf: 'AFC' },
    { nombre: 'Turquía',            corto: 'TUR', grupo: 'D', bandera: '🇹🇷', conf: 'UEFA' },
    // Grupo E
    { nombre: 'Alemania',           corto: 'GER', grupo: 'E', bandera: '🇩🇪', conf: 'UEFA' },
    { nombre: 'Curazao',            corto: 'CUW', grupo: 'E', bandera: '🇨🇼', conf: 'CONCACAF' },
    { nombre: 'Costa de Marfil',    corto: 'CIV', grupo: 'E', bandera: '🇨🇮', conf: 'CAF' },
    { nombre: 'Ecuador',            corto: 'ECU', grupo: 'E', bandera: '🇪🇨', conf: 'CONMEBOL' },
    // Grupo F
    { nombre: 'Países Bajos',       corto: 'NED', grupo: 'F', bandera: '🇳🇱', conf: 'UEFA' },
    { nombre: 'Japón',              corto: 'JPN', grupo: 'F', bandera: '🇯🇵', conf: 'AFC' },
    { nombre: 'Suecia',             corto: 'SWE', grupo: 'F', bandera: '🇸🇪', conf: 'UEFA' },
    { nombre: 'Túnez',              corto: 'TUN', grupo: 'F', bandera: '🇹🇳', conf: 'CAF' },
    // Grupo G
    { nombre: 'Bélgica',            corto: 'BEL', grupo: 'G', bandera: '🇧🇪', conf: 'UEFA' },
    { nombre: 'Egipto',             corto: 'EGY', grupo: 'G', bandera: '🇪🇬', conf: 'CAF' },
    { nombre: 'Irán',               corto: 'IRN', grupo: 'G', bandera: '🇮🇷', conf: 'AFC' },
    { nombre: 'Nueva Zelanda',      corto: 'NZL', grupo: 'G', bandera: '🇳🇿', conf: 'OFC' },
    // Grupo H
    { nombre: 'España',             corto: 'ESP', grupo: 'H', bandera: '🇪🇸', conf: 'UEFA' },
    { nombre: 'Cabo Verde',         corto: 'CPV', grupo: 'H', bandera: '🇨🇻', conf: 'CAF' },
    { nombre: 'Arabia Saudita',     corto: 'KSA', grupo: 'H', bandera: '🇸🇦', conf: 'AFC' },
    { nombre: 'Uruguay',            corto: 'URU', grupo: 'H', bandera: '🇺🇾', conf: 'CONMEBOL' },
    // Grupo I
    { nombre: 'Francia',            corto: 'FRA', grupo: 'I', bandera: '🇫🇷', conf: 'UEFA' },
    { nombre: 'Senegal',            corto: 'SEN', grupo: 'I', bandera: '🇸🇳', conf: 'CAF' },
    { nombre: 'Irak',               corto: 'IRQ', grupo: 'I', bandera: '🇮🇶', conf: 'AFC' },
    { nombre: 'Noruega',            corto: 'NOR', grupo: 'I', bandera: '🇳🇴', conf: 'UEFA' },
    // Grupo J
    { nombre: 'Argentina',          corto: 'ARG', grupo: 'J', bandera: '🇦🇷', conf: 'CONMEBOL' },
    { nombre: 'Argelia',            corto: 'ALG', grupo: 'J', bandera: '🇩🇿', conf: 'CAF' },
    { nombre: 'Austria',            corto: 'AUT', grupo: 'J', bandera: '🇦🇹', conf: 'UEFA' },
    { nombre: 'Jordania',           corto: 'JOR', grupo: 'J', bandera: '🇯🇴', conf: 'AFC' },
    // Grupo K
    { nombre: 'Portugal',           corto: 'POR', grupo: 'K', bandera: '🇵🇹', conf: 'UEFA' },
    { nombre: 'Rep. Dem. Congo',    corto: 'COD', grupo: 'K', bandera: '🇨🇩', conf: 'CAF' },
    { nombre: 'Uzbekistán',         corto: 'UZB', grupo: 'K', bandera: '🇺🇿', conf: 'AFC' },
    { nombre: 'Colombia',           corto: 'COL', grupo: 'K', bandera: '🇨🇴', conf: 'CONMEBOL' },
    // Grupo L
    { nombre: 'Inglaterra',         corto: 'ENG', grupo: 'L', bandera: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', conf: 'UEFA' },
    { nombre: 'Croacia',            corto: 'CRO', grupo: 'L', bandera: '🇭🇷', conf: 'UEFA' },
    { nombre: 'Ghana',              corto: 'GHA', grupo: 'L', bandera: '🇬🇭', conf: 'CAF' },
    { nombre: 'Panamá',             corto: 'PAN', grupo: 'L', bandera: '🇵🇦', conf: 'CONCACAF' },
  ];

  for (const e of equipos) {
    await prepare('INSERT INTO equipos (nombre, nombre_corto, grupo, bandera, confederacion) VALUES ($1,$2,$3,$4,$5)')
      .run(e.nombre, e.corto, e.grupo, e.bandera, e.conf);
  }
  console.log('✓ 48 equipos insertados');

  // Mapa nombre → id
  const rows = await prepare('SELECT id, nombre FROM equipos').all();
  const tid = {};
  for (const r of rows) tid[r.nombre] = r.id;

  // Horarios en hora Paraguay (UTC-3 fijo, Ley 7354/2024)
  // Regla aplicada: ciudades MX (CDM/GDL/MTY) = local CDT +2h; resto USA/Canadá = ET +1h
  const partidos = [
    // ════════════════════════════════ GRUPO A ════════════════════════════════
    { fecha: '2026-06-11', hora: '16:00', local: 'México',         visit: 'Sudáfrica',          estadio: 'Estadio Azteca',          ciudad: 'Ciudad de México', grupo: 'A' },
    { fecha: '2026-06-11', hora: '23:00', local: 'Corea del Sur',  visit: 'Chequia',             estadio: 'Estadio Akron',           ciudad: 'Guadalajara',      grupo: 'A' },
    { fecha: '2026-06-18', hora: '13:00', local: 'Chequia',        visit: 'Sudáfrica',           estadio: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          grupo: 'A' },
    { fecha: '2026-06-18', hora: '22:00', local: 'México',         visit: 'Corea del Sur',       estadio: 'Estadio Akron',           ciudad: 'Guadalajara',      grupo: 'A' },
    { fecha: '2026-06-24', hora: '22:00', local: 'Chequia',        visit: 'México',              estadio: 'Estadio Azteca',          ciudad: 'Ciudad de México', grupo: 'A' },
    { fecha: '2026-06-24', hora: '22:00', local: 'Sudáfrica',      visit: 'Corea del Sur',       estadio: 'Estadio BBVA',            ciudad: 'Monterrey',        grupo: 'A' },
    // ════════════════════════════════ GRUPO B ════════════════════════════════
    { fecha: '2026-06-12', hora: '16:00', local: 'Canadá',         visit: 'Bosnia-Herzegovina',  estadio: 'BMO Field',               ciudad: 'Toronto',          grupo: 'B' },
    { fecha: '2026-06-13', hora: '19:00', local: 'Suiza',          visit: 'Catar',               estadio: 'Arrowhead Stadium',       ciudad: 'Kansas City',      grupo: 'B' },
    { fecha: '2026-06-18', hora: '16:00', local: 'Suiza',          visit: 'Bosnia-Herzegovina',  estadio: 'SoFi Stadium',            ciudad: 'Los Ángeles',      grupo: 'B' },
    { fecha: '2026-06-18', hora: '19:00', local: 'Canadá',         visit: 'Catar',               estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'B' },
    { fecha: '2026-06-24', hora: '16:00', local: 'Suiza',          visit: 'Canadá',              estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'B' },
    { fecha: '2026-06-24', hora: '16:00', local: 'Bosnia-Herzegovina', visit: 'Catar',           estadio: 'Lumen Field',             ciudad: 'Seattle',          grupo: 'B' },
    // ════════════════════════════════ GRUPO C ════════════════════════════════
    { fecha: '2026-06-13', hora: '19:00', local: 'Brasil',         visit: 'Marruecos',           estadio: 'MetLife Stadium',         ciudad: 'Nueva Jersey',     grupo: 'C' },
    { fecha: '2026-06-13', hora: '22:00', local: 'Haití',          visit: 'Escocia',             estadio: 'Gillette Stadium',        ciudad: 'Boston',           grupo: 'C' },
    { fecha: '2026-06-19', hora: '19:00', local: 'Escocia',        visit: 'Marruecos',           estadio: 'Gillette Stadium',        ciudad: 'Boston',           grupo: 'C' },
    { fecha: '2026-06-19', hora: '21:30', local: 'Brasil',         visit: 'Haití',               estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia',       grupo: 'C' },
    { fecha: '2026-06-24', hora: '19:00', local: 'Escocia',        visit: 'Brasil',              estadio: 'Hard Rock Stadium',       ciudad: 'Miami',            grupo: 'C' },
    { fecha: '2026-06-24', hora: '19:00', local: 'Marruecos',      visit: 'Haití',               estadio: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          grupo: 'C' },
    // ════════════════════════════════ GRUPO D ════════════════════════════════
    { fecha: '2026-06-12', hora: '22:00', local: 'Estados Unidos', visit: 'Paraguay',            estadio: 'SoFi Stadium',            ciudad: 'Los Ángeles',      grupo: 'D' },
    { fecha: '2026-06-13', hora: '22:00', local: 'Australia',      visit: 'Turquía',             estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'D' },
    { fecha: '2026-06-19', hora: '16:00', local: 'Estados Unidos', visit: 'Australia',           estadio: 'Lumen Field',             ciudad: 'Seattle',          grupo: 'D' },
    { fecha: '2026-06-19', hora: '22:00', local: 'Turquía',        visit: 'Paraguay',            estadio: "Levi's Stadium",          ciudad: 'Santa Clara',      grupo: 'D' },
    { fecha: '2026-06-25', hora: '23:00', local: 'Turquía',        visit: 'Estados Unidos',      estadio: 'SoFi Stadium',            ciudad: 'Los Ángeles',      grupo: 'D' },
    { fecha: '2026-06-25', hora: '23:00', local: 'Paraguay',       visit: 'Australia',           estadio: "Levi's Stadium",          ciudad: 'Santa Clara',      grupo: 'D' },
    // ════════════════════════════════ GRUPO E ════════════════════════════════
    { fecha: '2026-06-14', hora: '14:00', local: 'Alemania',       visit: 'Curazao',             estadio: 'NRG Stadium',             ciudad: 'Houston',          grupo: 'E' },
    { fecha: '2026-06-14', hora: '20:00', local: 'Costa de Marfil',visit: 'Ecuador',             estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia',       grupo: 'E' },
    { fecha: '2026-06-20', hora: '17:00', local: 'Alemania',       visit: 'Costa de Marfil',     estadio: 'BMO Field',               ciudad: 'Toronto',          grupo: 'E' },
    { fecha: '2026-06-20', hora: '21:00', local: 'Ecuador',        visit: 'Curazao',             estadio: 'Arrowhead Stadium',       ciudad: 'Kansas City',      grupo: 'E' },
    { fecha: '2026-06-25', hora: '17:00', local: 'Ecuador',        visit: 'Alemania',            estadio: 'MetLife Stadium',         ciudad: 'Nueva Jersey',     grupo: 'E' },
    { fecha: '2026-06-25', hora: '17:00', local: 'Curazao',        visit: 'Costa de Marfil',     estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia',       grupo: 'E' },
    // ════════════════════════════════ GRUPO F ════════════════════════════════
    { fecha: '2026-06-14', hora: '17:00', local: 'Países Bajos',   visit: 'Japón',               estadio: 'AT&T Stadium',            ciudad: 'Dallas',           grupo: 'F' },
    { fecha: '2026-06-14', hora: '23:00', local: 'Suecia',         visit: 'Túnez',               estadio: 'Estadio BBVA',            ciudad: 'Monterrey',        grupo: 'F' },
    { fecha: '2026-06-20', hora: '14:00', local: 'Países Bajos',   visit: 'Suecia',              estadio: 'NRG Stadium',             ciudad: 'Houston',          grupo: 'F' },
    { fecha: '2026-06-21', hora: '01:00', local: 'Túnez',          visit: 'Japón',               estadio: 'Estadio BBVA',            ciudad: 'Monterrey',        grupo: 'F' },
    { fecha: '2026-06-25', hora: '20:00', local: 'Japón',          visit: 'Suecia',              estadio: 'AT&T Stadium',            ciudad: 'Dallas',           grupo: 'F' },
    { fecha: '2026-06-25', hora: '20:00', local: 'Túnez',          visit: 'Países Bajos',        estadio: 'Arrowhead Stadium',       ciudad: 'Kansas City',      grupo: 'F' },
    // ════════════════════════════════ GRUPO G ════════════════════════════════
    { fecha: '2026-06-15', hora: '16:00', local: 'Bélgica',        visit: 'Egipto',              estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'G' },
    { fecha: '2026-06-15', hora: '22:00', local: 'Irán',           visit: 'Nueva Zelanda',       estadio: 'SoFi Stadium',            ciudad: 'Los Ángeles',      grupo: 'G' },
    { fecha: '2026-06-21', hora: '16:00', local: 'Bélgica',        visit: 'Irán',                estadio: 'SoFi Stadium',            ciudad: 'Los Ángeles',      grupo: 'G' },
    { fecha: '2026-06-21', hora: '22:00', local: 'Nueva Zelanda',  visit: 'Egipto',              estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'G' },
    { fecha: '2026-06-26', hora: '21:00', local: 'Egipto',         visit: 'Irán',                estadio: 'Lumen Field',             ciudad: 'Seattle',          grupo: 'G' },
    { fecha: '2026-06-26', hora: '21:00', local: 'Nueva Zelanda',  visit: 'Bélgica',             estadio: 'BC Place',                ciudad: 'Vancouver',        grupo: 'G' },
    // ════════════════════════════════ GRUPO H ════════════════════════════════
    { fecha: '2026-06-15', hora: '13:00', local: 'España',         visit: 'Cabo Verde',          estadio: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          grupo: 'H' },
    { fecha: '2026-06-15', hora: '19:00', local: 'Arabia Saudita', visit: 'Uruguay',             estadio: 'Hard Rock Stadium',       ciudad: 'Miami',            grupo: 'H' },
    { fecha: '2026-06-21', hora: '13:00', local: 'España',         visit: 'Arabia Saudita',      estadio: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          grupo: 'H' },
    { fecha: '2026-06-21', hora: '19:00', local: 'Uruguay',        visit: 'Cabo Verde',          estadio: 'Hard Rock Stadium',       ciudad: 'Miami',            grupo: 'H' },
    { fecha: '2026-06-26', hora: '20:00', local: 'Cabo Verde',     visit: 'Arabia Saudita',      estadio: 'NRG Stadium',             ciudad: 'Houston',          grupo: 'H' },
    { fecha: '2026-06-26', hora: '21:00', local: 'Uruguay',        visit: 'España',              estadio: 'Estadio Akron',           ciudad: 'Guadalajara',      grupo: 'H' },
    // ════════════════════════════════ GRUPO I ════════════════════════════════
    { fecha: '2026-06-16', hora: '16:00', local: 'Francia',        visit: 'Senegal',             estadio: 'MetLife Stadium',         ciudad: 'Nueva Jersey',     grupo: 'I' },
    { fecha: '2026-06-16', hora: '19:00', local: 'Irak',           visit: 'Noruega',             estadio: 'Gillette Stadium',        ciudad: 'Boston',           grupo: 'I' },
    { fecha: '2026-06-22', hora: '18:00', local: 'Francia',        visit: 'Irak',                estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia',       grupo: 'I' },
    { fecha: '2026-06-22', hora: '21:00', local: 'Noruega',        visit: 'Senegal',             estadio: 'MetLife Stadium',         ciudad: 'Nueva Jersey',     grupo: 'I' },
    { fecha: '2026-06-26', hora: '16:00', local: 'Noruega',        visit: 'Francia',             estadio: 'Gillette Stadium',        ciudad: 'Boston',           grupo: 'I' },
    { fecha: '2026-06-26', hora: '16:00', local: 'Senegal',        visit: 'Irak',                estadio: 'BMO Field',               ciudad: 'Toronto',          grupo: 'I' },
    // ════════════════════════════════ GRUPO J ════════════════════════════════
    { fecha: '2026-06-16', hora: '21:00', local: 'Argentina',      visit: 'Argelia',             estadio: 'Arrowhead Stadium',       ciudad: 'Kansas City',      grupo: 'J' },
    { fecha: '2026-06-16', hora: '22:00', local: 'Austria',        visit: 'Jordania',            estadio: "Levi's Stadium",          ciudad: 'Santa Clara',      grupo: 'J' },
    { fecha: '2026-06-22', hora: '14:00', local: 'Argentina',      visit: 'Austria',             estadio: 'AT&T Stadium',            ciudad: 'Dallas',           grupo: 'J' },
    { fecha: '2026-06-22', hora: '22:00', local: 'Jordania',       visit: 'Argelia',             estadio: "Levi's Stadium",          ciudad: 'Santa Clara',      grupo: 'J' },
    { fecha: '2026-06-27', hora: '22:00', local: 'Argelia',        visit: 'Austria',             estadio: 'Arrowhead Stadium',       ciudad: 'Kansas City',      grupo: 'J' },
    { fecha: '2026-06-27', hora: '22:00', local: 'Jordania',       visit: 'Argentina',           estadio: 'AT&T Stadium',            ciudad: 'Dallas',           grupo: 'J' },
    // ════════════════════════════════ GRUPO K ════════════════════════════════
    { fecha: '2026-06-17', hora: '14:00', local: 'Portugal',       visit: 'Rep. Dem. Congo',     estadio: 'NRG Stadium',             ciudad: 'Houston',          grupo: 'K' },
    { fecha: '2026-06-17', hora: '23:00', local: 'Uzbekistán',     visit: 'Colombia',            estadio: 'Estadio Azteca',          ciudad: 'Ciudad de México', grupo: 'K' },
    { fecha: '2026-06-23', hora: '14:00', local: 'Portugal',       visit: 'Uzbekistán',          estadio: 'NRG Stadium',             ciudad: 'Houston',          grupo: 'K' },
    { fecha: '2026-06-23', hora: '22:00', local: 'Colombia',       visit: 'Rep. Dem. Congo',     estadio: 'Estadio Akron',           ciudad: 'Guadalajara',      grupo: 'K' },
    { fecha: '2026-06-27', hora: '20:30', local: 'Colombia',       visit: 'Portugal',            estadio: 'Hard Rock Stadium',       ciudad: 'Miami',            grupo: 'K' },
    { fecha: '2026-06-27', hora: '20:30', local: 'Rep. Dem. Congo',visit: 'Uzbekistán',          estadio: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          grupo: 'K' },
    // ════════════════════════════════ GRUPO L ════════════════════════════════
    { fecha: '2026-06-17', hora: '17:00', local: 'Inglaterra',     visit: 'Croacia',             estadio: 'AT&T Stadium',            ciudad: 'Dallas',           grupo: 'L' },
    { fecha: '2026-06-17', hora: '20:00', local: 'Ghana',          visit: 'Panamá',              estadio: 'BMO Field',               ciudad: 'Toronto',          grupo: 'L' },
    { fecha: '2026-06-23', hora: '17:00', local: 'Inglaterra',     visit: 'Ghana',               estadio: 'Gillette Stadium',        ciudad: 'Boston',           grupo: 'L' },
    { fecha: '2026-06-23', hora: '20:00', local: 'Panamá',         visit: 'Croacia',             estadio: 'BMO Field',               ciudad: 'Toronto',          grupo: 'L' },
    { fecha: '2026-06-27', hora: '18:00', local: 'Panamá',         visit: 'Inglaterra',          estadio: 'MetLife Stadium',         ciudad: 'Nueva Jersey',     grupo: 'L' },
    { fecha: '2026-06-27', hora: '18:00', local: 'Croacia',        visit: 'Ghana',               estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia',       grupo: 'L' },
  ];

  for (const p of partidos) {
    const localId = tid[p.local];
    const visitId = tid[p.visit];
    if (!localId || !visitId) {
      console.error(`❌ Equipo no encontrado: "${p.local}" o "${p.visit}"`);
      continue;
    }
    await prepare(`
      INSERT INTO partidos (fase, grupo, equipo_local_id, equipo_visitante_id, fecha, hora, estadio, ciudad)
      VALUES ('grupos', $1, $2, $3, $4, $5, $6, $7)
    `).run(p.grupo, localId, visitId, p.fecha, p.hora, p.estadio, p.ciudad);
  }
  console.log('✓ 72 partidos insertados');
  console.log('✅ Base de datos lista!');
  console.log('   👤 admin / admin2026');
}

module.exports = { run };
