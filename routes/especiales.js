const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Cierre: 18 de junio 2026 23:59 Paraguay (UTC-3 fijo)
const CIERRE = new Date('2026-06-18T23:59:00-03:00');

const TIPOS_EQUIPO = ['campeon', 'segundo', 'tercero'];
const TIPOS_VALIDOS = [...TIPOS_EQUIPO, 'goleador', 'mvp'];

function estaCerrado() {
  return new Date() >= CIERRE;
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

    let distribucion = null;
    if (estaCerrado()) {
      const rows = await Promise.all(TIPOS_VALIDOS.map(t =>
        prepare(`SELECT valor, COUNT(*) AS votos FROM pronosticos_especiales WHERE tipo=$1 GROUP BY valor ORDER BY votos DESC`).all(t)
      ));
      distribucion = {};
      TIPOS_VALIDOS.forEach((t, i) => (distribucion[t] = rows[i]));
    }

    res.render('especiales', {
      title: 'Pronósticos Especiales',
      equipos,
      miosMap,
      cerrado: estaCerrado(),
      distribucion,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.post('/guardar', requireLogin, async (req, res) => {
  try {
    if (estaCerrado()) return res.json({ ok: false, msg: 'El plazo para pronósticos especiales ya cerró' });

    const uid = req.session.usuario.id;
    const { tipo, valor } = req.body;

    if (!TIPOS_VALIDOS.includes(tipo))
      return res.json({ ok: false, msg: 'Tipo inválido' });
    if (!valor || valor.trim().length === 0)
      return res.json({ ok: false, msg: 'Ingresá un valor' });
    if (valor.trim().length > 100)
      return res.json({ ok: false, msg: 'Texto demasiado largo' });

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

module.exports = router;
