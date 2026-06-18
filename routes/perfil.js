const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, (req, res) => {
  res.redirect('/perfil/' + req.session.usuario.username);
});

router.get('/:username', requireLogin, async (req, res) => {
  try {
    const user = await prepare(
      'SELECT id, username, puntos_total, created_at FROM usuarios WHERE username=$1'
    ).get(req.params.username);
    if (!user) return res.status(404).render('error', { title: 'Usuario no encontrado', msg: 'El usuario no existe.' });

    // Stats globales
    const stats = await prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN puntos_obtenidos=5 THEN 1 ELSE 0 END) AS exactos,
        SUM(CASE WHEN puntos_obtenidos=3 THEN 1 ELSE 0 END) AS diferencia,
        SUM(CASE WHEN puntos_obtenidos=2 THEN 1 ELSE 0 END) AS ganador,
        SUM(CASE WHEN puntos_obtenidos=0 THEN 1 ELSE 0 END) AS fallados,
        COALESCE(SUM(puntos_obtenidos), 0) AS puntos
      FROM pronosticos WHERE usuario_id=$1
    `).get(user.id);

    // Todos los pronósticos con detalle de partido
    const prons = await prepare(`
      SELECT pr.goles_local AS p_local, pr.goles_visitante AS p_visit,
             pr.puntos_obtenidos, pr.updated_at,
             p.id AS partido_id, p.fecha, p.hora, p.grupo, p.estado,
             p.goles_local AS r_local, p.goles_visitante AS r_visit,
             el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM pronosticos pr
      JOIN partidos p ON pr.partido_id = p.id
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE pr.usuario_id = $1
      ORDER BY p.fecha, p.hora
    `).all(user.id);

    // Especiales
    const especiales = await prepare(
      'SELECT tipo, valor FROM pronosticos_especiales WHERE usuario_id=$1'
    ).all(user.id);
    const espMap = {};
    especiales.forEach(e => (espMap[e.tipo] = e.valor));

    // Posición en ranking
    const rankRow = await prepare(`
      SELECT COUNT(*) + 1 AS pos FROM usuarios u
      WHERE (SELECT COALESCE(SUM(pr.puntos_obtenidos),0) FROM pronosticos pr WHERE pr.usuario_id=u.id)
          > (SELECT COALESCE(SUM(pr.puntos_obtenidos),0) FROM pronosticos pr WHERE pr.usuario_id=$1)
    `).get(user.id);

    res.render('perfil', {
      title: `Perfil de ${user.username}`,
      user, stats, prons, espMap,
      pos: parseInt(rankRow.pos),
      esPropio: req.session.usuario.id === user.id,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
