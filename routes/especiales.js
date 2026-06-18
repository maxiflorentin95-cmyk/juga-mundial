const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

// Cierre: 18 de junio 2026 23:59 Paraguay (UTC-3 fijo)
const CIERRE = new Date('2026-06-18T23:59:00-03:00');

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

    // Para mostrar distribución (visible para todos una vez cerrado)
    let distribucion = null;
    if (estaCerrado()) {
      const campeon = await prepare(`
        SELECT valor, COUNT(*) AS votos
        FROM pronosticos_especiales WHERE tipo='campeon'
        GROUP BY valor ORDER BY votos DESC
      `).all();
      const goleador = await prepare(`
        SELECT valor, COUNT(*) AS votos
        FROM pronosticos_especiales WHERE tipo='goleador'
        GROUP BY valor ORDER BY votos DESC
      `).all();
      distribucion = { campeon, goleador };
    }

    res.render('especiales', {
      title: 'Pronósticos Especiales',
      equipos,
      miosMap,
      cerrado: estaCerrado(),
      cierre: CIERRE,
      distribucion,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.post('/guardar', requireLogin, async (req, res) => {
  try {
    if (estaCerrado()) return res.json({ ok: false, msg: 'El plazo para pronósticos especiales ya cerró' });

    const uid = req.session.usuario.id;
    const { tipo, valor } = req.body;

    if (!['campeon', 'goleador'].includes(tipo))
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
