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
};

const mapTeam = (n) => TEAM_MAP[n] || n;

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
    SELECT p.id, p.estado, p.goles_local, p.goles_visitante, p.fecha, p.hora,
           el.nombre AS local_nombre, ev.nombre AS visit_nombre
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
  `).all();

  const dbIdx = {};
  for (const p of dbPartidos) {
    dbIdx[`${p.local_nombre}|${p.visit_nombre}`] = p;
  }

  const client = await pool.connect();
  let actualizados = 0;
  const errores = [];
  const sinMapeo = [];

  try {
    for (const m of matches) {
      const apiLocal = mapTeam(m.homeTeam.name);
      const apiVisit = mapTeam(m.awayTeam.name);
      const dbP = dbIdx[`${apiLocal}|${apiVisit}`];

      if (!dbP) {
        // Solo loguear en desarrollo para detectar mapeos faltantes
        if (process.env.NODE_ENV !== 'production') {
          sinMapeo.push(`${m.homeTeam.name} vs ${m.awayTeam.name}`);
        }
        continue;
      }

      const status  = m.status; // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED
      const pyTime  = toParaguayTime(m.utcDate);

      // Actualizar fecha/hora si cambió y el partido sigue pendiente
      if (dbP.estado === 'pendiente' &&
          (dbP.fecha !== pyTime.fecha || dbP.hora !== pyTime.hora)) {
        await prepare('UPDATE partidos SET fecha=$1, hora=$2 WHERE id=$3')
          .run(pyTime.fecha, pyTime.hora, dbP.id);
      }

      // Actualizar resultado solo cuando el partido termina
      if (status === 'FINISHED' && dbP.estado !== 'finalizado') {
        const gl = m.score?.fullTime?.home;
        const gv = m.score?.fullTime?.away;
        if (gl === null || gv === null || gl === undefined || gv === undefined) continue;

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

          // Recalcular puntos por pronóstico
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
          console.log(`[sync] ✓ ${apiLocal} ${gl}-${gv} ${apiVisit} (${prons.length} pronósticos actualizados)`);
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

  if (sinMapeo.length) console.log(`[sync] Sin mapeo (${sinMapeo.length}):`, sinMapeo.join(', '));
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
