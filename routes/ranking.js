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

    const miPos = ranking.findIndex(u => u.id === uid) + 1;
    res.render('ranking', { title: 'Ranking', ranking, miPos, uid });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
