const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
  try {
    const [mayoresPuntos, masExactos, masNoExactos, masActivos] = await Promise.all([
      prepare(`
        SELECT u.id, u.username,
          COALESCE(SUM(pr.puntos_obtenidos), 0) AS puntos_total,
          COUNT(CASE WHEN pr.puntos_obtenidos=5 THEN 1 END) AS exactos,
          COUNT(pr.id) AS total_pron
        FROM usuarios u
        LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
        GROUP BY u.id, u.username
        ORDER BY puntos_total DESC, exactos DESC
        LIMIT 5
      `).all(),

      prepare(`
        SELECT u.id, u.username,
          COUNT(CASE WHEN pr.puntos_obtenidos=5 THEN 1 END) AS exactos,
          COUNT(pr.id) AS total_pron
        FROM usuarios u
        LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
        GROUP BY u.id, u.username
        ORDER BY exactos DESC
        LIMIT 5
      `).all(),

      prepare(`
        SELECT u.id, u.username,
          COUNT(CASE WHEN pr.puntos_obtenidos > 0 AND pr.puntos_obtenidos < 5 THEN 1 END) AS no_exactos,
          COUNT(pr.id) AS total_pron
        FROM usuarios u
        LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
        GROUP BY u.id, u.username
        ORDER BY no_exactos DESC
        LIMIT 5
      `).all(),

      prepare(`
        SELECT u.id, u.username,
          COUNT(pr.id) AS total_pron
        FROM usuarios u
        LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
        GROUP BY u.id, u.username
        ORDER BY total_pron DESC
        LIMIT 5
      `).all(),
    ]);

    // Mejor porcentaje: (con puntos / total pronosticados) * 100, mínimo 10 pronósticos
    const todosUsuarios = await prepare(`
      SELECT u.id, u.username,
        COUNT(pr.id) AS total_pron,
        COUNT(CASE WHEN pr.puntos_obtenidos > 0 THEN 1 END) AS con_puntos
      FROM usuarios u
      LEFT JOIN pronosticos pr ON pr.usuario_id = u.id
        JOIN partidos p ON pr.partido_id = p.id AND p.estado = 'finalizado'
      GROUP BY u.id, u.username
      HAVING COUNT(pr.id) >= 5
      ORDER BY (COUNT(CASE WHEN pr.puntos_obtenidos > 0 THEN 1 END)::float / NULLIF(COUNT(pr.id),0)) DESC
      LIMIT 5
    `).all();

    const mejorPorcentaje = todosUsuarios.map(u => ({
      ...u,
      porcentaje: u.total_pron > 0 ? Math.round((u.con_puntos / u.total_pron) * 100) : 0,
    }));

    const statsPartidos = await prepare(`
      SELECT p.id, p.fase, p.grupo, p.goles_local, p.goles_visitante,
             el.nombre AS local_nombre, el.bandera AS local_bandera,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera,
             COUNT(pr.id) AS total,
             COUNT(CASE WHEN pr.puntos_obtenidos = 5 THEN 1 END) AS exactos,
             COUNT(CASE WHEN pr.puntos_obtenidos IN (2,3) THEN 1 END) AS no_exactos,
             COUNT(CASE WHEN pr.puntos_obtenidos > 0 THEN 1 END) AS con_puntos,
             ROUND(COUNT(CASE WHEN pr.puntos_obtenidos > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(pr.id),0), 0) AS pct_acierto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      LEFT JOIN pronosticos pr ON pr.partido_id = p.id
      WHERE p.estado = 'finalizado'
      GROUP BY p.id, p.fase, p.grupo, p.goles_local, p.goles_visitante,
               el.nombre, el.bandera, ev.nombre, ev.bandera
      HAVING COUNT(pr.id) >= 3
    `).all();

    const masAcertados = [...statsPartidos].sort((a, b) => b.pct_acierto - a.pct_acierto).slice(0, 5);
    const masDificiles = [...statsPartidos].sort((a, b) => a.pct_acierto - b.pct_acierto).slice(0, 5);

    res.render('stats', {
      title: 'Estadísticas',
      mayoresPuntos,
      masExactos,
      masNoExactos,
      masActivos,
      mejorPorcentaje,
      masAcertados,
      masDificiles,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
