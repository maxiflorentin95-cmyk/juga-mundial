const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

function estaCerrado(fecha, hora) {
  return new Date() >= new Date(`${fecha}T${hora}:00-03:00`);
}

function calcBase(pL, pV, rL, rV, esElim) {
  pL = parseInt(pL); pV = parseInt(pV); rL = parseInt(rL); rV = parseInt(rV);
  if (pL === rL && pV === rV) return 5;
  if (esElim && pL === pV && rL === rV) return 2;
  if ((pL - pV) === (rL - rV)) return 3;
  if (Math.sign(pL - pV) === Math.sign(rL - rV)) return 2;
  return 0;
}

// GET /historial – lista de partidos + detalle opcional
router.get('/', requireLogin, async (req, res) => {
  try {
    // Todos los partidos con nombres de equipo
    const todos = await prepare(`
      SELECT p.id, p.grupo, p.fase, p.fecha, p.hora, p.estado,
             p.goles_local, p.goles_visitante,
             el.nombre AS local_nombre, ev.nombre AS visit_nombre
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      ORDER BY p.fecha, p.hora
    `).all();

    // Marcar cuáles tienen el cierre pasado
    const partidos = todos.map(p => ({ ...p, cerrado: estaCerrado(p.fecha, p.hora) }));

    let detalle = null;
    const selId = req.query.partido ? parseInt(req.query.partido) : null;

    if (selId) {
      const p = await prepare(`
        SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera,
               ev.nombre AS visit_nombre, ev.bandera AS visit_bandera
        FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE p.id = $1
      `).get(selId);

      if (p) {
        const cerrado = estaCerrado(p.fecha, p.hora);

        // Obtener todos los pronósticos (con username)
        const prons = await prepare(`
          SELECT pr.goles_local, pr.goles_visitante, pr.puntos_obtenidos,
                 pr.clasificado_id, pr.created_at, pr.updated_at, u.username
          FROM pronosticos pr
          JOIN usuarios u ON pr.usuario_id = u.id
          WHERE pr.partido_id = $1
          ORDER BY pr.puntos_obtenidos DESC NULLS LAST, u.username ASC
        `).all(selId);

        // Porcentajes (siempre visibles una vez cerrado)
        const total = prons.length;
        let l = 0, e = 0, v = 0;
        for (const pr of prons) {
          if (pr.goles_local > pr.goles_visitante) l++;
          else if (pr.goles_local === pr.goles_visitante) e++;
          else v++;
        }

        const esElim = p.fase && p.fase !== 'grupos';

        // Enriquecer cada pron con base_pts y bonus_pts calculados desde los goles
        const pronsEnriq = prons.map(pr => {
          if (p.estado !== 'finalizado') return { ...pr, base_pts: null, bonus_pts: null };
          const base = calcBase(pr.goles_local, pr.goles_visitante, p.goles_local, p.goles_visitante, esElim);
          const bonus = esElim && pr.clasificado_id && p.clasificado_id &&
            parseInt(pr.clasificado_id) === parseInt(p.clasificado_id) ? 2 : 0;
          return { ...pr, base_pts: base, bonus_pts: bonus };
        });

        detalle = {
          ...p,
          cerrado,
          esElim,
          prons: cerrado ? pronsEnriq : [],
          total_prons: total,
          sin_cargar: null,
          exactos:    pronsEnriq.filter(x => x.base_pts === 5).length,
          diferencia: pronsEnriq.filter(x => x.base_pts === 3).length,
          ganador:    pronsEnriq.filter(x => x.base_pts === 2).length,
          fallados:   pronsEnriq.filter(x => x.base_pts === 0).length,
          pct_local:  total ? Math.round(l * 100 / total) : null,
          pct_empate: total ? Math.round(e * 100 / total) : null,
          pct_visita: total ? Math.round(v * 100 / total) : null,
        };

        // Usuarios sin pronóstico
        const totalUsuarios = await prepare(
          'SELECT COUNT(*) AS c FROM usuarios WHERE es_admin=0'
        ).get();
        detalle.sin_cargar = Math.max(0, parseInt(totalUsuarios.c) - total);
      }
    }

    res.render('historial', {
      title: 'Historial de Partidos',
      partidos,
      detalle,
      selId,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
