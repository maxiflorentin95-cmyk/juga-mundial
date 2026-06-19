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
      'SELECT id, username, puntos_total FROM usuarios ORDER BY puntos_total DESC LIMIT 5'
    ).all();

    const miPosicion = await prepare(
      'SELECT COUNT(*)+1 AS pos FROM usuarios WHERE puntos_total > (SELECT puntos_total FROM usuarios WHERE id=$1)'
    ).get(req.session.usuario.id);

    // ── STATS GLOBALES ────────────────────────────────────────────────

    // 1. Termómetro: porcentajes de pronósticos en partidos de hoy
    let termometro = [];
    if (idsHoy.length) {
      const ph = idsHoy.map((_, i) => `$${i + 1}`).join(',');
      const votos = await prepare(`
        SELECT partido_id,
          COUNT(*) AS total,
          COUNT(CASE WHEN goles_local > goles_visitante THEN 1 END) AS vota_local,
          COUNT(CASE WHEN goles_local = goles_visitante THEN 1 END) AS vota_empate,
          COUNT(CASE WHEN goles_local < goles_visitante THEN 1 END) AS vota_visita
        FROM pronosticos WHERE partido_id IN (${ph})
        GROUP BY partido_id
      `).all(...idsHoy);
      const votosMap = {};
      votos.forEach(v => (votosMap[v.partido_id] = v));
      termometro = partidosHoy.map(p => {
        const v = votosMap[p.id] || { total: 0, vota_local: 0, vota_empate: 0, vota_visita: 0 };
        const tot = parseInt(v.total) || 1;
        return {
          ...p,
          pct_local:   Math.round(parseInt(v.vota_local)  * 100 / tot),
          pct_empate:  Math.round(parseInt(v.vota_empate) * 100 / tot),
          pct_visita:  Math.round(parseInt(v.vota_visita) * 100 / tot),
          total_votos: parseInt(v.total),
        };
      });
    }

    // 2. Jornada perfecta: top scorers de la última fecha finalizada
    let jornadaPerfecta = [];
    let fechaJornada = null;
    const ultimaFechaRow = await prepare(
      `SELECT fecha FROM partidos WHERE estado='finalizado' ORDER BY fecha DESC, hora DESC LIMIT 1`
    ).get();
    if (ultimaFechaRow) {
      fechaJornada = ultimaFechaRow.fecha;
      jornadaPerfecta = await prepare(`
        SELECT u.username, u.id,
          COALESCE(SUM(pr.puntos_obtenidos), 0) AS pts_jornada,
          COUNT(CASE WHEN pr.puntos_obtenidos=5 THEN 1 END) AS exactos,
          COUNT(pr.id) AS total_prons
        FROM usuarios u
        JOIN pronosticos pr ON pr.usuario_id = u.id
        JOIN partidos p ON pr.partido_id = p.id
        WHERE p.fecha = $1 AND p.estado = 'finalizado'
        GROUP BY u.id, u.username
        ORDER BY pts_jornada DESC, exactos DESC
        LIMIT 3
      `).all(fechaJornada);
    }

    // 3. Racha activa: aciertos consecutivos al final de los partidos finalizados
    const partidosOrdenados = await prepare(
      `SELECT id FROM partidos WHERE estado='finalizado' ORDER BY fecha, hora`
    ).all();
    const todasPreds = await prepare(`
      SELECT pr.usuario_id, pr.partido_id, pr.puntos_obtenidos
      FROM pronosticos pr
      JOIN partidos p ON pr.partido_id = p.id
      WHERE p.estado = 'finalizado'
    `).all();

    // mapa userId → { partidoId → puntos }
    const predMap = {};
    todasPreds.forEach(pr => {
      if (!predMap[pr.usuario_id]) predMap[pr.usuario_id] = {};
      predMap[pr.usuario_id][pr.partido_id] = parseInt(pr.puntos_obtenidos);
    });

    let rachaLider = null;
    const rachas = [];
    for (const [uid2, preds] of Object.entries(predMap)) {
      let streakActual = 0;
      let streakMax = 0;
      for (const p of partidosOrdenados) {
        if (preds[p.id] !== undefined) {
          if (preds[p.id] > 0) { streakActual++; streakMax = Math.max(streakMax, streakActual); }
          else streakActual = 0;
        }
      }
      rachas.push({ usuario_id: parseInt(uid2), streakActual, streakMax });
    }
    rachas.sort((a, b) => b.streakActual - a.streakActual || b.streakMax - a.streakMax);
    if (rachas.length) {
      const top = rachas[0];
      const uRacha = topRanking.find(u => u.id === top.usuario_id)
        || await prepare('SELECT id, username FROM usuarios WHERE id=$1').get(top.usuario_id);
      if (uRacha) rachaLider = { username: uRacha.username, streakActual: top.streakActual, streakMax: top.streakMax };
    }

    res.render('dashboard', {
      title: 'Dashboard', hoy, partidosHoy, pronMap, proximos,
      resultados, topRanking, miPosicion: parseInt(miPosicion.pos),
      termometro, jornadaPerfecta, fechaJornada, rachaLider,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error del servidor');
  }
});

module.exports = router;
