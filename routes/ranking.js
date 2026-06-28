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

    // Rachas históricas: aciertos consecutivos máximos por usuario
    const partidosOrdenados = await prepare(
      `SELECT id FROM partidos WHERE estado='finalizado' ORDER BY fecha, hora`
    ).all();
    const todasPreds = await prepare(`
      SELECT pr.usuario_id, pr.partido_id, pr.puntos_obtenidos
      FROM pronosticos pr
      JOIN partidos p ON pr.partido_id = p.id
      WHERE p.estado = 'finalizado'
    `).all();
    const predMap = {};
    todasPreds.forEach(pr => {
      if (!predMap[pr.usuario_id]) predMap[pr.usuario_id] = {};
      predMap[pr.usuario_id][pr.partido_id] = parseInt(pr.puntos_obtenidos);
    });
    const rachaMap = {};
    for (const [uid2, preds] of Object.entries(predMap)) {
      let streakActual = 0, streakMax = 0;
      for (const p of partidosOrdenados) {
        if (preds[p.id] !== undefined) {
          if (preds[p.id] > 0) { streakActual++; streakMax = Math.max(streakMax, streakActual); }
          else streakActual = 0;
        }
      }
      rachaMap[parseInt(uid2)] = { streakMax, streakActual };
    }

    // Inyectar variacion de posicion y racha en cada fila
    ranking.forEach((u, i) => {
      const posActual = i + 1;
      const posAnterior = snapMap[u.id];
      u.variacion = posAnterior != null ? posAnterior - posActual : null;
      const r = rachaMap[u.id] || { streakMax: 0, streakActual: 0 };
      u.racha_max    = r.streakMax;
      u.racha_actual = r.streakActual;
    });

    // Especiales (campeón, segundo, tercero) por usuario
    const especiales = await prepare(`
      SELECT usuario_id, tipo, valor
      FROM pronosticos_especiales
      WHERE tipo IN ('campeon', 'segundo', 'tercero')
    `).all();
    const especMap = {};
    especiales.forEach(e => {
      if (!especMap[e.usuario_id]) especMap[e.usuario_id] = {};
      especMap[e.usuario_id][e.tipo] = e.valor;
    });
    ranking.forEach(u => { u.especiales = especMap[u.id] || null; });

    const miPos = ranking.findIndex(u => u.id === uid) + 1;
    res.render('ranking', { title: 'Ranking', ranking, miPos, uid });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
