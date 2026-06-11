const router = require('express').Router();
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);

  // Refrescar puntos del usuario
  const userFresh = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.session.usuario.id);
  req.session.usuario.puntos_total = userFresh.puntos_total;
  res.locals.usuario.puntos_total = userFresh.puntos_total;

  // Partidos de hoy
  const partidosHoy = db.prepare(`
    SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
           ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
    WHERE p.fecha = ?
    ORDER BY p.hora
  `).all(hoy);

  // Pronósticos del usuario para partidos de hoy
  const idsHoy = partidosHoy.map(p => p.id);
  const pronosticos = idsHoy.length
    ? db.prepare(`SELECT * FROM pronosticos WHERE usuario_id=? AND partido_id IN (${idsHoy.map(() => '?').join(',')})`).all(req.session.usuario.id, ...idsHoy)
    : [];
  const pronMap = {};
  pronosticos.forEach(p => (pronMap[p.partido_id] = p));

  // Próximos partidos (siguientes 5 sin resultado)
  const proximos = db.prepare(`
    SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera,
           ev.nombre AS visit_nombre, ev.bandera AS visit_bandera
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
    WHERE p.fecha > ? AND p.estado = 'pendiente'
    ORDER BY p.fecha, p.hora
    LIMIT 6
  `).all(hoy);

  // Últimos resultados
  const resultados = db.prepare(`
    SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera,
           ev.nombre AS visit_nombre, ev.bandera AS visit_bandera
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
    WHERE p.estado = 'finalizado'
    ORDER BY p.fecha DESC, p.hora DESC
    LIMIT 6
  `).all();

  // Top 5 ranking
  const topRanking = db.prepare(
    'SELECT username, puntos_total FROM usuarios ORDER BY puntos_total DESC LIMIT 5'
  ).all();

  // Posición del usuario
  const miPosicion = db.prepare(
    'SELECT COUNT(*)+1 AS pos FROM usuarios WHERE puntos_total > (SELECT puntos_total FROM usuarios WHERE id=?)'
  ).get(req.session.usuario.id);

  res.render('dashboard', {
    title: 'Dashboard',
    hoy,
    partidosHoy,
    pronMap,
    proximos,
    resultados,
    topRanking,
    miPosicion: miPosicion.pos
  });
});

module.exports = router;
