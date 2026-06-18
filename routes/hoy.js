const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Fecha actual en hora Paraguay (UTC-3 fijo)
function fechaHoyPY() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function estaCerrado(fecha, hora) {
  return new Date() >= new Date(`${fecha}T${hora}:00-03:00`);
}

async function getPartidoConStats(p) {
  const prons = await prepare(
    'SELECT goles_local, goles_visitante FROM pronosticos WHERE partido_id=$1'
  ).all(p.id);
  const total = prons.length;
  let l = 0, e = 0, v = 0;
  for (const pr of prons) {
    if (pr.goles_local > pr.goles_visitante) l++;
    else if (pr.goles_local === pr.goles_visitante) e++;
    else v++;
  }
  return {
    ...p,
    cerrado: estaCerrado(p.fecha, p.hora),
    total_prons: total,
    pct_local:  total ? Math.round(l * 100 / total) : null,
    pct_empate: total ? Math.round(e * 100 / total) : null,
    pct_visita: total ? Math.round(v * 100 / total) : null,
  };
}

// GET /hoy – partidos de hoy
router.get('/', requireLogin, async (req, res) => {
  try {
    const hoy = fechaHoyPY();
    const rows = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.fecha = $1
      ORDER BY p.hora
    `).all(hoy);

    const partidos = await Promise.all(rows.map(getPartidoConStats));
    res.render('hoy', { title: 'Partidos de Hoy', partidos, hoy });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
