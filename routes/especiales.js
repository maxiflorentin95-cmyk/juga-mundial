const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Cierre: reabierto temporalmente 29 jun 2026
const CIERRE = new Date('2026-06-29T23:59:00-03:00');

// Extensión individual: estos usuarios pueden editar hasta CIERRE_EXTENSION
const CIERRE_EXTENSION = new Date('2026-06-29T23:59:00-03:00');
const USUARIOS_CON_EXTENSION = ['HugoLoup', 'MrPomberoPY'];

const TIPOS_EQUIPO = ['campeon', 'segundo', 'tercero'];
const TIPOS_VALIDOS = [...TIPOS_EQUIPO, 'goleador', 'mvp'];

const PUNTOS_ESPECIALES = {
  campeon:  10,
  segundo:  8,
  tercero:  5,
  goleador: 10,
  mvp:      10,
};

function estaCerrado(username) {
  const ahora = new Date();
  if (username && USUARIOS_CON_EXTENSION.includes(username)) {
    return ahora >= CIERRE_EXTENSION;
  }
  return ahora >= CIERRE;
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;

    const equipos = await prepare(
      'SELECT id, nombre, bandera, grupo FROM equipos ORDER BY grupo, nombre'
    ).all();

    const misProns = await prepare(
      'SELECT tipo, valor FROM pronosticos_especiales WHERE usuario_id=$1'
    ).all(uid);
    const miosMap = {};
    misProns.forEach(p => (miosMap[p.tipo] = p.valor));

    const username = req.session.usuario.username;
    let distribucion = null;
    if (estaCerrado(username)) {
      const rows = await Promise.all(TIPOS_VALIDOS.map(t =>
        prepare(`SELECT valor, COUNT(*) AS votos FROM pronosticos_especiales WHERE tipo=$1 GROUP BY valor ORDER BY votos DESC`).all(t)
      ));
      distribucion = {};
      TIPOS_VALIDOS.forEach((t, i) => (distribucion[t] = rows[i]));
    }

    let resultados = {};
    try {
      const resultadosRows = await prepare('SELECT tipo, valor FROM resultados_especiales').all();
      resultadosRows.forEach(r => (resultados[r.tipo] = r.valor));
    } catch (_) { /* tabla aún no existe, se crea en el próximo inicio */ }

    res.render('especiales', {
      title: 'Pronósticos Especiales',
      equipos,
      miosMap,
      cerrado: estaCerrado(username),
      distribucion,
      resultados,
      puntosEspeciales: PUNTOS_ESPECIALES,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.post('/guardar', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const username = req.session.usuario.username;
    if (estaCerrado(username)) return res.json({ ok: false, msg: 'El plazo para pronósticos especiales ya cerró' });
    const { tipo, valor } = req.body;

    if (!TIPOS_VALIDOS.includes(tipo))
      return res.json({ ok: false, msg: 'Tipo inválido' });
    if (!valor || valor.trim().length === 0)
      return res.json({ ok: false, msg: 'Ingresá un valor' });
    if (valor.trim().length > 100)
      return res.json({ ok: false, msg: 'Texto demasiado largo' });

    // Validar que no repita equipo en podio
    if (TIPOS_EQUIPO.includes(tipo)) {
      const otrosTipos = TIPOS_EQUIPO.filter(t => t !== tipo);
      const ph = otrosTipos.map((_, i) => `$${i + 2}`).join(', ');
      const existentes = await prepare(
        `SELECT tipo, valor FROM pronosticos_especiales WHERE usuario_id=$1 AND tipo IN (${ph})`
      ).all(uid, ...otrosTipos);
      const duplicado = existentes.find(e => e.valor === valor.trim());
      if (duplicado) {
        const labels = { campeon: 'Campeón', segundo: '2do puesto', tercero: '3er puesto' };
        return res.json({ ok: false, msg: `Ya elegiste ${valor.trim()} como ${labels[duplicado.tipo]}. No podés repetir equipo en el podio.` });
      }
    }

    await prepare(`
      INSERT INTO pronosticos_especiales (usuario_id, tipo, valor, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(usuario_id, tipo) DO UPDATE SET valor=EXCLUDED.valor, updated_at=NOW()
    `).run(uid, tipo, valor.trim());

    res.json({ ok: true, msg: 'Guardado', valor: valor.trim() });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: 'Error del servidor' });
  }
});

// Admin: unificar valores similares (ej: variantes de Mbappé)
router.post('/normalizar', async (req, res) => {
  try {
    if (!req.session.usuario?.es_admin)
      return res.json({ ok: false, msg: 'Sin permiso' });
    const { tipo, patron, valor_nuevo } = req.body;
    if (!TIPOS_VALIDOS.includes(tipo) || !patron || !valor_nuevo)
      return res.json({ ok: false, msg: 'Faltan campos' });
    const r = await prepare(
      `UPDATE pronosticos_especiales SET valor=$1 WHERE tipo=$2 AND LOWER(valor) LIKE LOWER($3)`
    ).run(valor_nuevo.trim(), tipo, `%${patron.trim()}%`);
    res.json({ ok: true, msg: `✓ ${r.changes} registro(s) actualizados a "${valor_nuevo.trim()}"` });
  } catch (e) { res.json({ ok: false, msg: e.message }); }
});

// Admin: cargar resultado real de un especial y calcular puntos
router.post('/resultado', async (req, res) => {
  try {
    if (!req.session.usuario?.es_admin)
      return res.json({ ok: false, msg: 'Sin permiso' });

    const { tipo, valor } = req.body;
    if (!TIPOS_VALIDOS.includes(tipo))
      return res.json({ ok: false, msg: 'Tipo inválido' });
    if (!valor || !valor.trim())
      return res.json({ ok: false, msg: 'Ingresá el resultado' });

    const valorReal = valor.trim();
    const pts = PUNTOS_ESPECIALES[tipo];

    // Obtener resultado anterior (para restar puntos si ya existía)
    const anterior = await prepare('SELECT valor FROM resultados_especiales WHERE tipo=$1').get(tipo);

    // Restar puntos del resultado anterior si existía
    if (anterior) {
      const ganadores = await prepare(
        'SELECT id, usuario_id FROM pronosticos_especiales WHERE tipo=$1 AND valor=$2 AND puntos_obtenidos > 0'
      ).all(tipo, anterior.valor);
      for (const p of ganadores) {
        await prepare('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2').run(pts, p.usuario_id);
        await prepare('UPDATE pronosticos_especiales SET puntos_obtenidos=0 WHERE id=$1').run(p.id);
      }
    }

    // Guardar resultado real
    await prepare(`
      INSERT INTO resultados_especiales (tipo, valor, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT(tipo) DO UPDATE SET valor=EXCLUDED.valor, updated_at=NOW()
    `).run(tipo, valorReal);

    // Asignar puntos a quienes acertaron
    const acertaron = await prepare(
      'SELECT id, usuario_id FROM pronosticos_especiales WHERE tipo=$1 AND valor=$2'
    ).all(tipo, valorReal);

    for (const p of acertaron) {
      await prepare('UPDATE pronosticos_especiales SET puntos_obtenidos=$1 WHERE id=$2').run(pts, p.id);
      await prepare('UPDATE usuarios SET puntos_total = puntos_total + $1 WHERE id=$2').run(pts, p.usuario_id);
    }

    res.json({ ok: true, msg: `✓ Resultado guardado. ${acertaron.length} usuario(s) sumaron ${pts} pts.` });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

module.exports = router;
