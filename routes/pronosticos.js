const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Paraguay UTC-3 fijo (Ley 7354/2024 – sin horario de verano)
function estaCerrado(fecha, hora) {
  return new Date() >= new Date(`${fecha}T${hora}:00-03:00`);
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;

    // Todos los partidos en orden cronológico
    const partidos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha DESC, p.hora DESC
    `).all();

    // Todos los pronósticos del usuario en un solo query
    const prons = await prepare('SELECT * FROM pronosticos WHERE usuario_id=$1').all(uid);
    const pronMap = {};
    prons.forEach(p => (pronMap[p.partido_id] = p));

    const lista = partidos.map(p => ({
      ...p,
      cerrado: estaCerrado(p.fecha, p.hora),
      pronostico: pronMap[p.id] || null
    }));

    // Agrupar por fecha para headers visuales
    const porFecha = {};
    lista.forEach(p => {
      if (!porFecha[p.fecha]) porFecha[p.fecha] = [];
      porFecha[p.fecha].push(p);
    });
    const fechas = Object.keys(porFecha).sort();

    const stats = await prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN puntos_obtenidos=5 THEN 1 ELSE 0 END) AS exactos,
        SUM(CASE WHEN puntos_obtenidos>=2 THEN 1 ELSE 0 END) AS resultado,
        SUM(puntos_obtenidos) AS puntos
      FROM pronosticos WHERE usuario_id=$1
    `).get(uid);

    const totalPartidos = partidos.length;
    const pronósticados = prons.length;

    res.render('pronosticos', { title: 'Mis Pronósticos', fechas, porFecha, stats, totalPartidos, pronosticados: pronósticados });
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

    res.json({ ok: true, msg: 'Guardado', gl, gv });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: 'Error del servidor' });
  }
});

module.exports = router;
