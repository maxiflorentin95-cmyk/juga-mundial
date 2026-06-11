const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

async function calcularTabla(grupo) {
  const equipos = await prepare('SELECT * FROM equipos WHERE grupo=$1 ORDER BY nombre').all(grupo);
  const partidos = await prepare(`
    SELECT p.* FROM partidos p WHERE p.grupo=$1 AND p.estado='finalizado'
  `).all(grupo);

  const tabla = {};
  equipos.forEach(e => {
    tabla[e.id] = { equipo: e, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0, gd:0, pts:0 };
  });

  partidos.forEach(p => {
    const l = tabla[p.equipo_local_id];
    const v = tabla[p.equipo_visitante_id];
    if (!l || !v) return;
    l.pj++; v.pj++;
    l.gf += p.goles_local; l.gc += p.goles_visitante;
    v.gf += p.goles_visitante; v.gc += p.goles_local;
    l.gd = l.gf - l.gc; v.gd = v.gf - v.gc;
    if (p.goles_local > p.goles_visitante)      { l.pg++; l.pts += 3; v.pp++; }
    else if (p.goles_local < p.goles_visitante) { v.pg++; v.pts += 3; l.pp++; }
    else { l.pe++; l.pts++; v.pe++; v.pts++; }
  });

  return Object.values(tabla).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const tablas = {};
    for (const g of grupos) tablas[g] = await calcularTabla(g);
    res.render('grupos', { title: 'Grupos', grupos, tablas });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.get('/:letra', requireLogin, async (req, res) => {
  try {
    const grupo = req.params.letra.toUpperCase();
    const letras = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    if (!letras.includes(grupo)) return res.redirect('/grupos');

    const tabla = await calcularTabla(grupo);
    const partidos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.grupo=$1
      ORDER BY p.fecha, p.hora
    `).all(grupo);

    res.render('grupo-detalle', { title: `Grupo ${grupo}`, grupo, tabla, partidos });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
