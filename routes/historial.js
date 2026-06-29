const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

function estaCerrado(fecha, hora) {
  return new Date() >= new Date(`${fecha}T${hora}:00-03:00`);
}

// GET /historial – lista de partidos + detalle opcional
router.get('/', requireLogin, async (req, res) => {
  try {
    // Todos los partidos con nombres de equipo
    const todos = await prepare(`
      SELECT p.id, p.grupo, p.fecha, p.hora, p.estado,
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

        // Obtener todos los pronósticos (con username y clasificado)
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

        // Para partidos eliminatorios: calcular bonus por clasificado
        const esEliminatoria = p.fase && p.fase !== 'grupos';
        const pronosEnriquecidos = prons.map(pr => {
          if (!esEliminatoria || !p.clasificado_id) return { ...pr, puntos_bonus: 0 };
          const bonus = pr.clasificado_id && parseInt(pr.clasificado_id) === parseInt(p.clasificado_id) ? 2 : 0;
          const base  = pr.puntos_obtenidos - bonus;
          return { ...pr, puntos_base: base, puntos_bonus: bonus };
        });

        detalle = {
          ...p,
          cerrado,
          esEliminatoria,
          prons: cerrado ? pronosEnriquecidos : [],
          total_prons: total,
          sin_cargar: null,
          exactos:    prons.filter(x => x.puntos_obtenidos === 5).length,
          diferencia: prons.filter(x => x.puntos_obtenidos === 3).length,
          ganador:    prons.filter(x => x.puntos_obtenidos === 2).length,
          fallados:   prons.filter(x => x.puntos_obtenidos === 0).length,
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
