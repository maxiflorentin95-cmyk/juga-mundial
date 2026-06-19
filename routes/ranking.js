const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const ranking = await prepare(`
      SELECT u.id, u.username,
        COALESCE(SUM(pr.puntos_obtenidos), 0) AS puntos_total,
        COUNT(CASE WHEN pr.puntos_obtenidos=5 THEN 1 END) AS exactos,
        COUNT(CASE WHEN pr.puntos_obtenidos=3 THEN 1 END) AS diferencia,
        COUNT(CASE WHEN pr.puntos_obtenidos=2 THEN 1 END) AS resultado,
        COUNT(pr.id) AS total_pron
      FROM usuarios u
      LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
      GROUP BY u.id, u.username
      ORDER BY puntos_total DESC, exactos DESC, diferencia DESC
    `).all();

    // Snapshot anterior (fecha más reciente distinta a hoy)
    const hoyPY = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let snapMap = {};
    try {
      const snapFecha = await prepare(
        `SELECT MAX(fecha) AS f FROM ranking_snapshots WHERE fecha < $1`
      ).get(hoyPY);
      if (snapFecha?.f) {
        const snaps = await prepare(
          `SELECT usuario_id, posicion FROM ranking_snapshots WHERE fecha = $1`
        ).all(snapFecha.f);
        snaps.forEach(s => (snapMap[s.usuario_id] = s.posicion));
      }
    } catch (_) {}

    // Inyectar variacion de posicion en cada fila
    ranking.forEach((u, i) => {
      const posActual = i + 1;
      const posAnterior = snapMap[u.id];
      u.variacion = posAnterior != null ? posAnterior - posActual : null;
    });

    const miPos = ranking.findIndex(u => u.id === uid) + 1;
    res.render('ranking', { title: 'Ranking', ranking, miPos, uid });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
