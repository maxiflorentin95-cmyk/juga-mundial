const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);

    const userFresh = await prepare('SELECT * FROM usuarios WHERE id=$1').get(req.session.usuario.id);
    req.session.usuario.puntos_total = userFresh.puntos_total;
    res.locals.usuario.puntos_total = userFresh.puntos_total;

    const partidosHoy = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.fecha = $1
      ORDER BY p.hora
    `).all(hoy);

    const idsHoy = partidosHoy.map(p => p.id);
    let pronosticos = [];
    if (idsHoy.length) {
      const placeholders = idsHoy.map((_, i) => `$${i + 2}`).join(',');
      pronosticos = await prepare(
        `SELECT * FROM pronosticos WHERE usuario_id=$1 AND partido_id IN (${placeholders})`
      ).all(req.session.usuario.id, ...idsHoy);
    }
    const pronMap = {};
    pronosticos.forEach(p => (pronMap[p.partido_id] = p));

    const proximos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.fecha > $1 AND p.estado = 'pendiente'
      ORDER BY p.fecha, p.hora
      LIMIT 6
    `).all(hoy);

    const resultados = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.estado = 'finalizado'
      ORDER BY p.fecha DESC, p.hora DESC
      LIMIT 6
    `).all();

    const topRanking = await prepare(
      'SELECT username, puntos_total FROM usuarios ORDER BY puntos_total DESC LIMIT 5'
    ).all();

    const miPosicion = await prepare(
      'SELECT COUNT(*)+1 AS pos FROM usuarios WHERE puntos_total > (SELECT puntos_total FROM usuarios WHERE id=$1)'
    ).get(req.session.usuario.id);

    res.render('dashboard', {
      title: 'Dashboard', hoy, partidosHoy, pronMap, proximos,
      resultados, topRanking, miPosicion: parseInt(miPosicion.pos)
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error del servidor');
  }
});

module.exports = router;
