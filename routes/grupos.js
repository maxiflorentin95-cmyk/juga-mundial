const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Tabla desde resultados reales
async function calcularTabla(grupo) {
  const equipos = await prepare('SELECT * FROM equipos WHERE grupo=$1 ORDER BY nombre').all(grupo);
  const partidos = await prepare(
    `SELECT * FROM partidos WHERE grupo=$1 AND estado='finalizado'`
  ).all(grupo);

  const tabla = {};
  equipos.forEach(e => {
    tabla[e.id] = { equipo: e, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0, gd:0, pts:0 };
  });
  partidos.forEach(p => {
    const l = tabla[p.equipo_local_id], v = tabla[p.equipo_visitante_id];
    if (!l || !v) return;
    l.pj++; v.pj++;
    l.gf += p.goles_local;  l.gc += p.goles_visitante;
    v.gf += p.goles_visitante; v.gc += p.goles_local;
    l.gd = l.gf - l.gc; v.gd = v.gf - v.gc;
    if (p.goles_local > p.goles_visitante)      { l.pg++; l.pts += 3; v.pp++; }
    else if (p.goles_local < p.goles_visitante) { v.pg++; v.pts += 3; l.pp++; }
    else { l.pe++; l.pts++; v.pe++; v.pts++; }
  });
  return Object.values(tabla).sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
}

// Tabla simulada con pronósticos de un usuario
async function calcularTablaPronostico(grupo, usuarioId) {
  const equipos = await prepare('SELECT * FROM equipos WHERE grupo=$1 ORDER BY nombre').all(grupo);
  const partidos = await prepare(
    'SELECT id, equipo_local_id, equipo_visitante_id FROM partidos WHERE grupo=$1'
  ).all(grupo);

  let prons = [];
  if (partidos.length) {
    const ids = partidos.map(p => p.id);
    const ph = ids.map((_,i) => `$${i+2}`).join(',');
    prons = await prepare(
      `SELECT * FROM pronosticos WHERE usuario_id=$1 AND partido_id IN (${ph})`
    ).all(usuarioId, ...ids);
  }
  const pronMap = {};
  prons.forEach(p => (pronMap[p.partido_id] = p));

  const tabla = {};
  equipos.forEach(e => {
    tabla[e.id] = { equipo: e, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0, gd:0, pts:0, sin_pron:0 };
  });
  partidos.forEach(p => {
    const pr = pronMap[p.id];
    const l = tabla[p.equipo_local_id], v = tabla[p.equipo_visitante_id];
    if (!l || !v) return;
    if (!pr) { l.sin_pron++; v.sin_pron++; return; }
    l.pj++; v.pj++;
    l.gf += pr.goles_local;  l.gc += pr.goles_visitante;
    v.gf += pr.goles_visitante; v.gc += pr.goles_local;
    l.gd = l.gf - l.gc; v.gd = v.gf - v.gc;
    if (pr.goles_local > pr.goles_visitante)      { l.pg++; l.pts += 3; v.pp++; }
    else if (pr.goles_local < pr.goles_visitante) { v.pg++; v.pts += 3; l.pp++; }
    else { l.pe++; l.pts++; v.pe++; v.pts++; }
  });
  return Object.values(tabla).sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
}

// GET /grupos — resumen de todos los grupos
router.get('/', requireLogin, async (req, res) => {
  try {
    const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const tablas = {};
    for (const g of grupos) tablas[g] = await calcularTabla(g);
    res.render('grupos', { title: 'Grupos', grupos, tablas });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// GET /grupos/:letra — detalle con tabla real + tabla pronosticada
router.get('/:letra', requireLogin, async (req, res) => {
  try {
    const grupo = req.params.letra.toUpperCase();
    const letras = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    if (!letras.includes(grupo)) return res.redirect('/grupos');

    // Todos los usuarios (para el selector)
    const usuarios = await prepare(
      'SELECT id, username FROM usuarios ORDER BY username'
    ).all();

    // Usuario seleccionado para ver su tabla (default: el logueado)
    const selUid = req.query.usuario ? parseInt(req.query.usuario) : req.session.usuario.id;
    const selUser = usuarios.find(u => u.id === selUid) || req.session.usuario;

    const [tablaReal, tablaProno, partidos] = await Promise.all([
      calcularTabla(grupo),
      calcularTablaPronostico(grupo, selUid),
      prepare(`
        SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
               ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
        FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE p.grupo=$1 ORDER BY p.fecha, p.hora
      `).all(grupo),
    ]);

    res.render('grupo-detalle', {
      title: `Grupo ${grupo}`,
      grupo, letras, tablaReal, tablaProno, partidos, usuarios, selUser,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
