/**
 * Sincronización con football-data.org v4
 * - Convierte utcDate a hora Paraguay (UTC-3 fijo, Ley 7354/2024)
 * - Actualiza fecha/hora de partidos pendientes
 * - Calcula resultados y puntos cuando status === 'FINISHED'
 *
 * Variable de entorno requerida:
 *   FOOTBALL_DATA_KEY  – token de football-data.org (gratis en football-data.org/client/register)
 */

const { prepare, pool } = require('../db');

const API_KEY  = process.env.FOOTBALL_DATA_KEY;
const API_BASE = 'https://api.football-data.org/v4';

// Paraguay se mantiene en UTC-3 permanente (Ley 7354/2024)
const PY_OFFSET_MS = -3 * 60 * 60 * 1000;

function toParaguayTime(utcIso) {
  const py = new Date(new Date(utcIso).getTime() + PY_OFFSET_MS);
  return {
    fecha: py.toISOString().slice(0, 10),
    hora:  py.toISOString().slice(11, 16),
  };
}

// Mapeo nombres football-data.org (inglés) → nombres en nuestra DB (español)
const TEAM_MAP = {
  'Mexico':                         'México',
  'South Korea':                    'Corea del Sur',
  'Korea Republic':                 'Corea del Sur',
  'South Africa':                   'Sudáfrica',
  'Czech Republic':                 'Chequia',
  'Czechia':                        'Chequia',
  'Canada':                         'Canadá',
  'Switzerland':                    'Suiza',
  'Qatar':                          'Catar',
  'Bosnia and Herzegovina':         'Bosnia-Herzegovina',
  'Bosnia':                         'Bosnia-Herzegovina',
  'Brazil':                         'Brasil',
  'Morocco':                        'Marruecos',
  'Haiti':                          'Haití',
  'Scotland':                       'Escocia',
  'United States':                  'Estados Unidos',
  'USA':                            'Estados Unidos',
  'Australia':                      'Australia',
  'Turkey':                         'Turquía',
  'Türkiye':                        'Turquía',
  'Germany':                        'Alemania',
  'Curaçao':                        'Curazao',
  'Curacao':                        'Curazao',
  "Côte d'Ivoire":                  'Costa de Marfil',
  "Cote d'Ivoire":                  'Costa de Marfil',
  'Ivory Coast':                    'Costa de Marfil',
  'Netherlands':                    'Países Bajos',
  'Japan':                          'Japón',
  'Sweden':                         'Suecia',
  'Tunisia':                        'Túnez',
  'Belgium':                        'Bélgica',
  'Egypt':                          'Egipto',
  'Iran':                           'Irán',
  'New Zealand':                    'Nueva Zelanda',
  'Spain':                          'España',
  'Cape Verde':                     'Cabo Verde',
  'Saudi Arabia':                   'Arabia Saudita',
  'France':                         'Francia',
  'Iraq':                           'Irak',
  'Norway':                         'Noruega',
  'Algeria':                        'Argelia',
  'Jordan':                         'Jordania',
  'DR Congo':                       'Rep. Dem. Congo',
  'Democratic Republic of Congo':   'Rep. Dem. Congo',
  'Uzbekistan':                     'Uzbekistán',
  'England':                        'Inglaterra',
  'Croatia':                        'Croacia',
  'Panama':                         'Panamá',
  'Ghana':                          'Ghana',
  // CONMEBOL
  'Argentina':                      'Argentina',
  'Uruguay':                        'Uruguay',
  'Colombia':                       'Colombia',
  'Ecuador':                        'Ecuador',
  'Venezuela':                      'Venezuela',
  'Chile':                          'Chile',
  'Peru':                           'Perú',
  'Bolivia':                        'Bolivia',
  'Paraguay':                       'Paraguay',
  // UEFA
  'Portugal':                       'Portugal',
  'Italy':                          'Italia',
  'Serbia':                         'Serbia',
  'Denmark':                        'Dinamarca',
  'Poland':                         'Polonia',
  'Austria':                        'Austria',
  'Ukraine':                        'Ucrania',
  'Romania':                        'Rumanía',
  'Hungary':                        'Hungría',
  'Slovakia':                       'Eslovaquia',
  'Slovenia':                       'Eslovenia',
  'Wales':                          'Gales',
  'Albania':                        'Albania',
  'Greece':                         'Grecia',
  'Turkey':                         'Turquía',
  'Turkiye':                        'Turquía',
  'Finland':                        'Finlandia',
  'Iceland':                        'Islandia',
  'Russia':                         'Rusia',
  'Ireland':                        'Irlanda',
  'Northern Ireland':               'Irlanda del Norte',
  'Montenegro':                     'Montenegro',
  'North Macedonia':                'Macedonia del Norte',
  'Georgia':                        'Georgia',
  // CAF
  'Senegal':                        'Senegal',
  'Nigeria':                        'Nigeria',
  'Cameroon':                       'Camerún',
  'Mali':                           'Malí',
  'Guinea':                         'Guinea',
  'Tanzania':                       'Tanzania',
  'Zambia':                         'Zambia',
  'Angola':                         'Angola',
  'Kenya':                          'Kenia',
  'Uganda':                         'Uganda',
  'Benin':                          'Benín',
  'Burkina Faso':                   'Burkina Faso',
  'Comoros':                        'Comoras',
  'Congo':                          'Rep. del Congo',
  'Republic of Congo':              'Rep. del Congo',
  // AFC
  'Indonesia':                      'Indonesia',
  'China PR':                       'China',
  'China':                          'China',
  "China PR":                       'China',
  'India':                          'India',
  'Oman':                           'Omán',
  'Bahrain':                        'Baréin',
  'Kuwait':                         'Kuwait',
  'Vietnam':                        'Vietnam',
  'Thailand':                       'Tailandia',
  'Myanmar':                        'Myanmar',
  'Kyrgyzstan':                     'Kirguistán',
  'Tajikistan':                     'Tayikistán',
  'North Korea':                    'Corea del Norte',
  'Korea DPR':                      'Corea del Norte',
  // CONCACAF
  'Honduras':                       'Honduras',
  'Costa Rica':                     'Costa Rica',
  'Jamaica':                        'Jamaica',
  'Cuba':                           'Cuba',
  'Trinidad and Tobago':            'Trinidad y Tobago',
  'Guatemala':                      'Guatemala',
  'El Salvador':                    'El Salvador',
  'Nicaragua':                      'Nicaragua',
  // OFC
  'Fiji':                           'Fiyi',
  'Papua New Guinea':               'Papúa Nueva Guinea',
  'Solomon Islands':                'Islas Salomón',
};

const mapTeam = (n) => TEAM_MAP[n] || n;

// Mapeo de stages de la API → fases en nuestra DB
const STAGE_MAP = {
  'LAST_32':       'dieciseisavos',
  'LAST_16':       'octavos',
  'QUARTER_FINALS':'cuartos',
  'SEMI_FINALS':   'semifinal',
  'THIRD_PLACE':   'tercer_puesto',
  'FINAL':         'final',
};

function calcularPuntos(pL, pV, rL, rV) {
  if (pL === rL && pV === rV)                         return 5;
  if ((pL - pV) === (rL - rV))                       return 3;
  if (Math.sign(pL - pV) === Math.sign(rL - rV))     return 2;
  return 0;
}

async function fetchMatches() {
  const url = `${API_BASE}/competitions/WC/matches?season=2026`;
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': API_KEY }
  });

  if (resp.status === 403) {
    const e = new Error('Token inválido o sin acceso al Mundial 2026. Verificá tu token de football-data.org.');
    e.authError = true;
    throw e;
  }
  if (resp.status === 429) {
    throw new Error('Límite de requests alcanzado (free tier: 10 req/min). Intentá en un momento.');
  }
  if (!resp.ok) {
    throw new Error(`football-data.org HTTP ${resp.status}`);
  }

  const json = await resp.json();
  if (!json.matches) {
    throw new Error(`Respuesta inesperada: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.matches;
}

async function sync() {
  if (!API_KEY) throw new Error('Falta la variable de entorno FOOTBALL_DATA_KEY');

  console.log('[sync] Consultando football-data.org WC 2026...');
  const matches = await fetchMatches();
  console.log(`[sync] ${matches.length} partidos recibidos`);

  const dbPartidos = await prepare(`
    SELECT p.id, p.estado, p.fase, p.goles_local, p.goles_visitante, p.fecha, p.hora,
           p.equipo_local_id AS local_id, p.equipo_visitante_id AS visit_id,
           el.nombre AS local_nombre, ev.nombre AS visit_nombre
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
  `).all();

  const dbIdx = {};
  for (const p of dbPartidos) {
    dbIdx[`${p.local_nombre}|${p.visit_nombre}`] = p;
  }

  // Mapa nombre → id de equipos para poder insertar cruces nuevos
  const dbEquipos = await prepare('SELECT id, nombre FROM equipos').all();
  const equipoId = {};
  for (const e of dbEquipos) equipoId[e.nombre] = e.id;

  const client = await pool.connect();
  let actualizados = 0;
  let insertados = 0;
  const errores = [];

  try {
    for (const m of matches) {
      const rawLocal = m.homeTeam?.name;
      const rawVisit = m.awayTeam?.name;

      // Si la API aún no tiene equipos definidos para este partido, saltar
      if (!rawLocal || !rawVisit) continue;

      const apiLocal = mapTeam(rawLocal);
      const apiVisit = mapTeam(rawVisit);
      const status   = m.status; // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED
      const pyTime   = toParaguayTime(m.utcDate);
      const fase     = STAGE_MAP[m.stage];

      let dbP = dbIdx[`${apiLocal}|${apiVisit}`];

      // ── Auto-insertar cruces de eliminatoria que aún no están en la DB ──
      if (!dbP && fase) {
        const localId = equipoId[apiLocal];
        const visitId = equipoId[apiVisit];

        if (!localId || !visitId) {
          // Equipo no reconocido (nombre nuevo o TBD genérico) — no insertar
          console.log(`[sync] Equipo sin mapeo: "${rawLocal}" / "${rawVisit}"`);
          continue;
        }

        try {
          const r = await prepare(`
            INSERT INTO partidos (fase, grupo, equipo_local_id, equipo_visitante_id, fecha, hora, estadio, ciudad, estado)
            VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'pendiente')
          `).run(fase, localId, visitId, pyTime.fecha, pyTime.hora,
                 m.venue || '', m.area?.name || '');

          const newId = r.lastInsertRowid;
          dbP = { id: newId, estado: 'pendiente', fase, fecha: pyTime.fecha, hora: pyTime.hora,
                  local_nombre: apiLocal, visit_nombre: apiVisit,
                  local_id: localId, visit_id: visitId };
          dbIdx[`${apiLocal}|${apiVisit}`] = dbP;
          insertados++;
          console.log(`[sync] ✚ Cruce insertado: ${apiLocal} vs ${apiVisit} (${fase}, ${pyTime.fecha} ${pyTime.hora})`);
        } catch (e) {
          errores.push(`Insertar ${apiLocal} vs ${apiVisit}: ${e.message}`);
          continue;
        }
      }

      if (!dbP) continue;

      // Actualizar fecha/hora si cambió y el partido sigue pendiente
      if (dbP.estado === 'pendiente' &&
          (dbP.fecha !== pyTime.fecha || dbP.hora !== pyTime.hora)) {
        await prepare('UPDATE partidos SET fecha=$1, hora=$2 WHERE id=$3')
          .run(pyTime.fecha, pyTime.hora, dbP.id);
        dbP.fecha = pyTime.fecha;
        dbP.hora  = pyTime.hora;
      }

      // Actualizar resultado solo cuando el partido termina
      if (status === 'FINISHED' && dbP.estado !== 'finalizado') {
        const gl = m.score?.fullTime?.home;
        const gv = m.score?.fullTime?.away;
        if (gl === null || gv === null || gl === undefined || gv === undefined) continue;

        // Para eliminatoria: detectar clasificado desde score.winner
        let realClasifId = null;
        if (dbP.fase && dbP.fase !== 'grupos') {
          const winner = m.score?.winner; // HOME_TEAM | AWAY_TEAM
          if (winner === 'HOME_TEAM') realClasifId = dbP.local_id;
          else if (winner === 'AWAY_TEAM') realClasifId = dbP.visit_id;
        }

        try {
          await client.query('BEGIN');

          const { rows: prons } = await client.query(
            'SELECT * FROM pronosticos WHERE partido_id=$1', [dbP.id]
          );
          for (const pr of prons) {
            await client.query(
              'UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2',
              [pr.puntos_obtenidos, pr.usuario_id]
            );
          }

          await client.query(
            "UPDATE partidos SET goles_local=$1, goles_visitante=$2, estado='finalizado', clasificado_id=$3 WHERE id=$4",
            [gl, gv, realClasifId, dbP.id]
          );

          for (const pr of prons) {
            const base  = calcularPuntos(pr.goles_local, pr.goles_visitante, gl, gv);
            const aciertoClasif = pr.clasificado_id && realClasifId && parseInt(pr.clasificado_id) === parseInt(realClasifId);
            const predEmpate = parseInt(pr.goles_local) === parseInt(pr.goles_visitante);
            const bonus = (aciertoClasif && predEmpate) ? 1 : 0;
            const pts   = base + bonus;
            await client.query('UPDATE pronosticos SET puntos_obtenidos=$1 WHERE id=$2', [pts, pr.id]);
            await client.query('UPDATE usuarios SET puntos_total = puntos_total + $1 WHERE id=$2', [pts, pr.usuario_id]);
          }

          await client.query('COMMIT');
          console.log(`[sync] ✓ ${apiLocal} ${gl}-${gv} ${apiVisit}${realClasifId ? ' (clasif.)' : ''} (${prons.length} prons actualizados)`);
          actualizados++;
        } catch (e) {
          await client.query('ROLLBACK');
          errores.push(`${apiLocal} vs ${apiVisit}: ${e.message}`);
          console.error(`[sync] ✗ Error en ${apiLocal} vs ${apiVisit}:`, e.message);
        }
      }
    }
  } finally {
    client.release();
  }

  console.log(`[sync] Completado: ${insertados} cruces insertados, ${actualizados} resultados actualizados, ${errores.length} errores`);
  return { actualizados, insertados, errores };
}

module.exports = { sync };

// Ejecución directa: node scripts/sync-api-football.js
if (require.main === module) {
  sync()
    .then(r => { console.log('[sync] OK:', r); process.exit(0); })
    .catch(e => { console.error('[sync] ERROR:', e.message); process.exit(1); });
}
