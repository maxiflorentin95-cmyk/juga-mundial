const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { prepare, pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const USUARIOS_IMPORTAR = [
  { username: 'mfiorentin',  nombre: 'Maxi Florentin',      email: 'maxiflorentin95@gmail.com',              admin: 1 },
  { username: 'Chrisis',     nombre: 'Christian Escurra',   email: 'escurra014@gmail.com',                   admin: 0 },
  { username: 'Ortepro18',   nombre: 'Elias Ortega',        email: 'eliasrubenortega.rodriguez@gmail.com',   admin: 0 },
  { username: 'MrPomberoPY', nombre: 'Fernando Groselle',   email: 'fergroselle9@gmail.com',                 admin: 0 },
  { username: 'HugoLoup',    nombre: 'Hugo Loup',           email: 'loupcontabilidad@gmail.com',             admin: 0 },
  { username: 'Luisma',      nombre: 'Luis Mario Gonzalez', email: 'gonzalezvallejoslm@gmail.com',           admin: 0 },
  { username: 'Ferfre',      nombre: 'Fernando Fretes',     email: 'ferfretes14@gmail.com',                  admin: 0 },
  { username: 'Loche',       nombre: 'Marcelo Aguero',      email: 'marceloaguero1497@gmail.com',            admin: 0 },
  { username: 'JulioMarti',  nombre: 'Julio Martinez',      email: 'julcesmartinez24@gmail.com',             admin: 0 },
  { username: 'Ronaldraf',   nombre: 'Ronald Martinez',     email: 'ronaldraf28@gmail.com',                  admin: 0 },
  { username: 'Williiam',    nombre: 'William Ramos',       email: 'williawas95@gmail.com',                  admin: 0 },
  { username: 'Chebis',      nombre: 'Sebastian Avalos',    email: 'sebastianavalos94@gmail.com',            admin: 0 },
  { username: 'JoeAlca',     nombre: 'Joel Alcaraz',        email: 'joelalcaraz6@gmail.com',                 admin: 0 },
];

function calcularPuntos(pL, pV, rL, rV) {
  if (pL === rL && pV === rV) return 5;
  if (Math.sign(pL - pV) === Math.sign(rL - rV)) return 1;
  return 0;
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const stats = {
      totalPartidos: (await prepare("SELECT COUNT(*) AS c FROM partidos").get()).c,
      finalizados:   (await prepare("SELECT COUNT(*) AS c FROM partidos WHERE estado='finalizado'").get()).c,
      pendientes:    (await prepare("SELECT COUNT(*) AS c FROM partidos WHERE estado='pendiente'").get()).c,
      usuarios:      (await prepare("SELECT COUNT(*) AS c FROM usuarios").get()).c,
      pronosticos:   (await prepare("SELECT COUNT(*) AS c FROM pronosticos").get()).c,
    };
    res.render('admin/index', { title: 'Panel Admin', grupos, stats });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.get('/resultados/:grupo', requireAdmin, async (req, res) => {
  try {
    const grupo = req.params.grupo.toUpperCase();
    const partidos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.grupo=$1
      ORDER BY p.fecha, p.hora
    `).all(grupo);
    res.render('admin/resultados', { title: `Grupo ${grupo} – Resultados`, grupo, partidos });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

router.post('/resultado', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { partido_id, goles_local, goles_visitante } = req.body;
    const gl = parseInt(goles_local), gv = parseInt(goles_visitante);
    if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0)
      return res.json({ ok: false, msg: 'Valores inválidos' });

    const partido = await prepare('SELECT * FROM partidos WHERE id=$1').get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });

    await client.query('BEGIN');

    // Revertir puntos si ya tenía resultado
    if (partido.estado === 'finalizado') {
      const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido_id]);
      for (const pr of prons.rows) {
        await client.query('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2', [pr.puntos_obtenidos, pr.usuario_id]);
        await client.query('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=$1', [pr.id]);
      }
    }

    // Guardar resultado
    await client.query('UPDATE partidos SET goles_local=$1, goles_visitante=$2, estado=$3 WHERE id=$4',
      [gl, gv, 'finalizado', partido_id]);

    // Calcular y asignar puntos
    const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido_id]);
    for (const pr of prons.rows) {
      const pts = calcularPuntos(pr.goles_local, pr.goles_visitante, gl, gv);
      await client.query('UPDATE pronosticos SET puntos_obtenidos=$1 WHERE id=$2', [pts, pr.id]);
      await client.query('UPDATE usuarios SET puntos_total = puntos_total + $1 WHERE id=$2', [pts, pr.usuario_id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, msg: `Resultado guardado. ${prons.rows.length} pronósticos actualizados.` });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.json({ ok: false, msg: 'Error del servidor' });
  } finally {
    client.release();
  }
});

router.post('/resetear', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { partido_id } = req.body;
    const partido = await prepare('SELECT * FROM partidos WHERE id=$1').get(partido_id);
    if (!partido || partido.estado !== 'finalizado')
      return res.json({ ok: false, msg: 'El partido no tiene resultado cargado' });

    await client.query('BEGIN');
    const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido_id]);
    for (const pr of prons.rows) {
      await client.query('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2', [pr.puntos_obtenidos, pr.usuario_id]);
      await client.query('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=$1', [pr.id]);
    }
    await client.query("UPDATE partidos SET goles_local=NULL, goles_visitante=NULL, estado='pendiente' WHERE id=$1", [partido_id]);
    await client.query('COMMIT');
    res.json({ ok: true, msg: 'Resultado reseteado' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.json({ ok: false, msg: 'Error del servidor' });
  } finally {
    client.release();
  }
});

router.get('/usuarios', requireAdmin, async (req, res) => {
  try {
    const usuarios = await prepare('SELECT id, username, email, es_admin, puntos_total, created_at FROM usuarios ORDER BY username').all();
    res.render('admin/usuarios', { title: 'Gestión de Usuarios', usuarios });
  } catch (e) { res.status(500).send('Error'); }
});

router.post('/importar-puntos', requireAdmin, async (req, res) => {
  const puntos = [
    { username: 'mfiorentin',  pts: 38 },
    { username: 'Chrisis',     pts: 37 },
    { username: 'JulioMarti',  pts: 32 },
    { username: 'Chebis',      pts: 31 },
    { username: 'Ortepro18',   pts: 29 },
    { username: 'Ferfre',      pts: 29 },
    { username: 'Ronaldraf',   pts: 29 },
    { username: 'MrPomberoPY', pts: 25 },
    { username: 'HugoLoup',    pts: 23 },
    { username: 'JoeAlca',     pts: 17 },
    { username: 'Luisma',      pts: 0  },
  ];
  const resultados = [];
  for (const u of puntos) {
    try {
      const r = await prepare('UPDATE usuarios SET puntos_total=$1 WHERE username=$2').run(u.pts, u.username);
      resultados.push({ username: u.username, ok: r.changes > 0, pts: u.pts });
    } catch (e) {
      resultados.push({ username: u.username, ok: false, msg: e.message });
    }
  }
  res.json({ ok: true, resultados });
});

router.post('/importar-usuarios', requireAdmin, async (req, res) => {
  const hash = bcrypt.hashSync('mundial2026', 10);
  const resultados = [];
  for (const u of USUARIOS_IMPORTAR) {
    try {
      const existe = await prepare('SELECT id FROM usuarios WHERE username=$1 OR email=$2').get(u.username, u.email);
      if (existe) { resultados.push({ username: u.username, ok: false, msg: 'ya existe' }); continue; }
      await prepare('INSERT INTO usuarios (username, email, password_hash, es_admin) VALUES ($1,$2,$3,$4)')
        .run(u.username, u.email, hash, u.admin);
      resultados.push({ username: u.username, ok: true, msg: 'creado' });
    } catch (e) {
      resultados.push({ username: u.username, ok: false, msg: e.message });
    }
  }
  res.json({ ok: true, resultados });
});

router.post('/reseed', requireAdmin, async (req, res) => {
  try {
    await require('../seed').run();
    req.session.destroy();
    res.json({ ok: true, msg: 'Base de datos re-inicializada. Tu sesión fue cerrada — volvé a iniciar sesión con admin / admin2026.' });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

router.post('/toggle-admin', requireAdmin, async (req, res) => {
  try {
    const { usuario_id } = req.body;
    if (parseInt(usuario_id) === req.session.usuario.id)
      return res.json({ ok: false, msg: 'No podés modificar tu propio rol' });
    const u = await prepare('SELECT * FROM usuarios WHERE id=$1').get(usuario_id);
    if (!u) return res.json({ ok: false, msg: 'Usuario no encontrado' });
    await prepare('UPDATE usuarios SET es_admin=$1 WHERE id=$2').run(u.es_admin ? 0 : 1, usuario_id);
    res.json({ ok: true, msg: u.es_admin ? 'Admin removido' : 'Admin asignado' });
  } catch (e) { res.json({ ok: false, msg: 'Error' }); }
});

module.exports = router;
