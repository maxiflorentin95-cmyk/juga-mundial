/**
 * Sincronización con API-Football v3
 * - Convierte fixture.date (UTC) a hora Paraguay (UTC-3 fijo, Ley 7354/2024)
 * - Actualiza fecha/hora de partidos pendientes
 * - Calcula resultados y puntos cuando status === 'FT'
 *
 * Variables de entorno requeridas:
 *   API_FOOTBALL_KEY   – clave de api-sports.io
 * Opcionales:
 *   API_FOOTBALL_LEAGUE  – league_id (default 1 = FIFA World Cup)
 *   API_FOOTBALL_SEASON  – season    (default 2026)
 */

const { prepare, pool } = require('../db');

const API_KEY    = process.env.API_FOOTBALL_KEY;
const LEAGUE_ID  = process.env.API_FOOTBALL_LEAGUE  || '1';
const SEASON     = process.env.API_FOOTBALL_SEASON  || '2026';
const API_BASE   = 'https://v3.football.api-sports.io';

// Paraguay se mantiene en UTC-3 permanente (Ley 7354/2024 – sin horario de verano)
const PY_OFFSET_MS = -3 * 60 * 60 * 1000;

function toParaguayTime(utcIso) {
  const py = new Date(new Date(utcIso).getTime() + PY_OFFSET_MS);
  return {
    fecha: py.toISOString().slice(0, 10),
    hora:  py.toISOString().slice(11, 16),
  };
}

// Mapeo nombres API-Football (inglés) → nombres en nuestra DB (español)
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
  'Bosnia':                         'Bosnia-Herzegovina',
  'Bosnia and Herzegovina':         'Bosnia-Herzegovina',
  'Brazil':                         'Brasil',
  'Morocco':                        'Marruecos',
  'Haiti':                          'Haití',
  'Scotland':                       'Escocia',
  'United States':                  'Estados Unidos',
  'USA':                            'Estados Unidos',
  'Paraguay':                       'Paraguay',
  'Australia':                      'Australia',
  'Turkey':                         'Turquía',
  'Turkiye':                        'Turquía',
  'Germany':                        'Alemania',
  'Curaçao':                        'Curazao',
  'Curacao':                        'Curazao',
  "Cote d'Ivoire":                  'Costa de Marfil',
  "Côte d'Ivoire":                  'Costa de Marfil',
  'Ivory Coast':                    'Costa de Marfil',
  'Ecuador':                        'Ecuador',
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
  'Uruguay':                        'Uruguay',
  'France':                         'Francia',
  'Senegal':                        'Senegal',
  'Iraq':                           'Irak',
  'Norway':                         'Noruega',
  'Argentina':                      'Argentina',
  'Algeria':                        'Argelia',
  'Austria':                        'Austria',
  'Jordan':                         'Jordania',
  'Portugal':                       'Portugal',
  'DR Congo':                       'Rep. Dem. Congo',
  'Congo DR':                       'Rep. Dem. Congo',
  'Democratic Republic of Congo':   'Rep. Dem. Congo',
  'Congo':                          'Rep. Dem. Congo',
  'Uzbekistan':                     'Uzbekistán',
  'Colombia':                       'Colombia',
  'England':                        'Inglaterra',
  'Croatia':                        'Croacia',
  'Ghana':                          'Ghana',
  'Panama':                         'Panamá',
};

const mapTeam = (n) => TEAM_MAP[n] || n;

function calcularPuntos(pL, pV, rL, rV) {
  if (pL === rL && pV === rV)                             return 5;
  if ((pL - pV) === (rL - rV))                           return 3;
  if (Math.sign(pL - pV) === Math.sign(rL - rV))         return 2;
  return 0;
}

async function fetchFixtures() {
  const url = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`;
  const resp = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  if (!resp.ok) throw new Error(`API-Football HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.errors && Object.keys(json.errors).length)
    throw new Error(`API-Football errores: ${JSON.stringify(json.errors)}`);
  return json.response; // array de fixtures
}

async function sync() {
  if (!API_KEY) throw new Error('Falta la variable de entorno API_FOOTBALL_KEY');

  console.log(`[sync] Consultando liga=${LEAGUE_ID} temporada=${SEASON}...`);
  const fixtures = await fetchFixtures();
  console.log(`[sync] ${fixtures.length} fixtures recibidos`);

  // Traer todos los partidos de nuestra DB con nombres de equipo
  const dbPartidos = await prepare(`
    SELECT p.id, p.estado, p.goles_local, p.goles_visitante, p.fecha, p.hora,
           el.nombre AS local_nombre, ev.nombre AS visit_nombre
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
  `).all();

  // Índice rápido "local|visitante" → fila
  const dbIdx = {};
  for (const p of dbPartidos) {
    dbIdx[`${p.local_nombre}|${p.visit_nombre}`] = p;
  }

  const client = await pool.connect();
  let actualizados = 0;
  const errores = [];

  try {
    for (const f of fixtures) {
      const apiLocal = mapTeam(f.teams.home.name);
      const apiVisit = mapTeam(f.teams.away.name);
      const dbP = dbIdx[`${apiLocal}|${apiVisit}`];
      if (!dbP) continue; // partido fuera de fase de grupos o sin mapeo

      const status   = f.fixture.status.short; // 'NS','1H','HT','2H','FT',...
      const pyTime   = toParaguayTime(f.fixture.date);

      // Actualizar fecha/hora si el partido sigue pendiente
      if (dbP.estado === 'pendiente' &&
          (dbP.fecha !== pyTime.fecha || dbP.hora !== pyTime.hora)) {
        await prepare('UPDATE partidos SET fecha=$1, hora=$2 WHERE id=$3')
          .run(pyTime.fecha, pyTime.hora, dbP.id);
      }

      // Actualizar resultado solo al terminar el partido (FT)
      if (status === 'FT' && dbP.estado !== 'finalizado') {
        const gl = f.goals.home;
        const gv = f.goals.away;
        if (gl === null || gv === null) continue;

        try {
          await client.query('BEGIN');

          // Restar puntos previos para recalcular limpio
          const { rows: prons } = await client.query(
            'SELECT * FROM pronosticos WHERE partido_id=$1', [dbP.id]
          );
          for (const pr of prons) {
            await client.query(
              'UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2',
              [pr.puntos_obtenidos, pr.usuario_id]
            );
          }

          // Guardar resultado final
          await client.query(
            "UPDATE partidos SET goles_local=$1, goles_visitante=$2, estado='finalizado' WHERE id=$3",
            [gl, gv, dbP.id]
          );

          // Recalcular y asignar puntos
          for (const pr of prons) {
            const pts = calcularPuntos(pr.goles_local, pr.goles_visitante, gl, gv);
            await client.query(
              'UPDATE pronosticos SET puntos_obtenidos=$1 WHERE id=$2',
              [pts, pr.id]
            );
            await client.query(
              'UPDATE usuarios SET puntos_total = puntos_total + $1 WHERE id=$2',
              [pts, pr.usuario_id]
            );
          }

          await client.query('COMMIT');
          console.log(`[sync] ✓ ${apiLocal} ${gl}-${gv} ${apiVisit} (${prons.length} pronósticos)`);
          actualizados++;
        } catch (e) {
          await client.query('ROLLBACK');
          errores.push(`${apiLocal} vs ${apiVisit}: ${e.message}`);
        }
      }
    }
  } finally {
    client.release();
  }

  console.log(`[sync] Completado: ${actualizados} partidos actualizados, ${errores.length} errores`);
  return { actualizados, errores };
}

module.exports = { sync };

// Ejecución directa: node scripts/sync-api-football.js
if (require.main === module) {
  sync()
    .then(r => { console.log('[sync] OK:', r); process.exit(0); })
    .catch(e => { console.error('[sync] ERROR:', e.message); process.exit(1); });
}
