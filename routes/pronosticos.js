const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Paraguay UTC-3 fijo (Ley 7354/2024 – sin horario de verano)
function estaCerrado(fecha, hora) {
  const matchTime = new Date(`${fecha}T${hora}:00-03:00`);
  return new Date() >= matchTime;
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const partidosPorGrupo = {};

    for (const g of grupos) {
      const partidos = await prepare(`
        SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
               ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
        FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE p.grupo=$1
        ORDER BY p.fecha, p.hora
      `).all(g);

      const ids = partidos.map(p => p.id);
      let prons = [];
      if (ids.length) {
        const ph = ids.map((_, i) => `$${i + 2}`).join(',');
        prons = await prepare(
          `SELECT * FROM pronosticos WHERE usuario_id=$1 AND partido_id IN (${ph})`
        ).all(uid, ...ids);
      }
      const pronMap = {};
      prons.forEach(p => (pronMap[p.partido_id] = p));

      partidosPorGrupo[g] = partidos.map(p => ({
        ...p,
        cerrado: estaCerrado(p.fecha, p.hora),
        pronostico: pronMap[p.id] || null
      }));
    }

    const stats = await prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN puntos_obtenidos=5 THEN 1 ELSE 0 END) AS exactos,
        SUM(CASE WHEN puntos_obtenidos>=2 THEN 1 ELSE 0 END) AS resultado,
        SUM(puntos_obtenidos) AS puntos
      FROM pronosticos WHERE usuario_id=$1
    `).get(uid);

    res.render('pronosticos', { title: 'Mis Pronósticos', grupos, partidosPorGrupo, stats });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.post('/guardar', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const { partido_id, goles_local, goles_visitante } = req.body;
    const partido = await prepare('SELECT * FROM partidos WHERE id=$1').get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });
    if (estaCerrado(partido.fecha, partido.hora))
      return res.json({ ok: false, msg: 'El tiempo para pronosticar este partido ya cerró' });

    const gl = parseInt(goles_local), gv = parseInt(goles_visitante);
    if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0 || gl > 20 || gv > 20)
      return res.json({ ok: false, msg: 'Valores inválidos' });

    await prepare(`
      INSERT INTO pronosticos (usuario_id, partido_id, goles_local, goles_visitante, updated_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT(usuario_id, partido_id) DO UPDATE SET
        goles_local=EXCLUDED.goles_local,
        goles_visitante=EXCLUDED.goles_visitante,
        updated_at=NOW()
    `).run(uid, partido_id, gl, gv);

    res.json({ ok: true, msg: '¡Pronóstico guardado!' });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: 'Error del servidor' });
  }
});

module.exports = router;
