const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const ranking = await prepare(`
      SELECT u.id, u.username, u.puntos_total,
        (SELECT COUNT(*) FROM pronosticos pr WHERE pr.usuario_id=u.id AND pr.puntos_obtenidos=3) AS exactos,
        (SELECT COUNT(*) FROM pronosticos pr WHERE pr.usuario_id=u.id AND pr.puntos_obtenidos=1) AS resultado,
        (SELECT COUNT(*) FROM pronosticos pr WHERE pr.usuario_id=u.id) AS total_pron
      FROM usuarios u
      ORDER BY u.puntos_total DESC, exactos DESC
    `).all();

    const miPos = ranking.findIndex(u => u.id === uid) + 1;
    res.render('ranking', { title: 'Ranking', ranking, miPos, uid });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
