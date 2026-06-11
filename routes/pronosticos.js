const router = require('express').Router();
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const CIERRE_MINUTOS = 60; // cierra 60 min antes del partido

function estaCerrado(fecha, hora) {
  const matchTime = new Date(`${fecha}T${hora}:00`);
  const ahora = new Date();
  return (matchTime - ahora) < CIERRE_MINUTOS * 60 * 1000;
}

router.get('/', requireLogin, (req, res) => {
  const uid = req.session.usuario.id;
  const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  const partidosPorGrupo = {};
  grupos.forEach(g => {
    const partidos = db.prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.grupo=?
      ORDER BY p.fecha, p.hora
    `).all(g);

    const ids = partidos.map(p => p.id);
    const prons = ids.length
      ? db.prepare(`SELECT * FROM pronosticos WHERE usuario_id=? AND partido_id IN (${ids.map(() => '?').join(',')})`).all(uid, ...ids)
      : [];
    const pronMap = {};
    prons.forEach(p => (pronMap[p.partido_id] = p));

    const enriquecidos = partidos.map(p => ({
      ...p,
      cerrado: estaCerrado(p.fecha, p.hora),
      pronostico: pronMap[p.id] || null
    }));
    partidosPorGrupo[g] = enriquecidos;
  });

  // Stats del usuario
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN puntos_obtenidos=3 THEN 1 ELSE 0 END) AS exactos,
      SUM(CASE WHEN puntos_obtenidos=1 THEN 1 ELSE 0 END) AS resultado,
      SUM(CASE WHEN puntos_obtenidos=0 AND partido_id IN (SELECT id FROM partidos WHERE estado='finalizado') THEN 1 ELSE 0 END) AS fallados,
      SUM(puntos_obtenidos) AS puntos
    FROM pronosticos WHERE usuario_id=?
  `).get(uid);

  res.render('pronosticos', { title: 'Mis Pronósticos', grupos, partidosPorGrupo, stats });
});

router.post('/guardar', requireLogin, (req, res) => {
  const uid = req.session.usuario.id;
  const { partido_id, goles_local, goles_visitante } = req.body;

  const partido = db.prepare('SELECT * FROM partidos WHERE id=?').get(partido_id);
  if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });
  if (estaCerrado(partido.fecha, partido.hora)) {
    return res.json({ ok: false, msg: 'El tiempo para pronosticar este partido ya cerró' });
  }

  const gl = parseInt(goles_local);
  const gv = parseInt(goles_visitante);
  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0 || gl > 20 || gv > 20) {
    return res.json({ ok: false, msg: 'Valores inválidos' });
  }

  db.prepare(`
    INSERT INTO pronosticos (usuario_id, partido_id, goles_local, goles_visitante, updated_at)
    VALUES (?,?,?,?, CURRENT_TIMESTAMP)
    ON CONFLICT(usuario_id, partido_id) DO UPDATE SET
      goles_local=excluded.goles_local,
      goles_visitante=excluded.goles_visitante,
      updated_at=CURRENT_TIMESTAMP
  `).run(uid, partido_id, gl, gv);

  res.json({ ok: true, msg: '¡Pronóstico guardado!' });
});

module.exports = router;
