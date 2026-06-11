const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

function calcularPuntos(pL, pV, rL, rV) {
  if (pL === rL && pV === rV) return 3;
  if (Math.sign(pL - pV) === Math.sign(rL - rV)) return 1;
  return 0;
}

router.get('/', requireAdmin, (req, res) => {
  const grupos = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  const stats = {
    totalPartidos: db.prepare("SELECT COUNT(*) AS c FROM partidos").get().c,
    finalizados:   db.prepare("SELECT COUNT(*) AS c FROM partidos WHERE estado='finalizado'").get().c,
    pendientes:    db.prepare("SELECT COUNT(*) AS c FROM partidos WHERE estado='pendiente'").get().c,
    usuarios:      db.prepare("SELECT COUNT(*) AS c FROM usuarios").get().c,
    pronosticos:   db.prepare("SELECT COUNT(*) AS c FROM pronosticos").get().c,
  };
  res.render('admin/index', { title: 'Panel Admin', grupos, stats });
});

router.get('/resultados/:grupo', requireAdmin, (req, res) => {
  const grupo = req.params.grupo.toUpperCase();
  const partidos = db.prepare(`
    SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
           ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
    FROM partidos p
    JOIN equipos el ON p.equipo_local_id = el.id
    JOIN equipos ev ON p.equipo_visitante_id = ev.id
    WHERE p.grupo=?
    ORDER BY p.fecha, p.hora
  `).all(grupo);
  res.render('admin/resultados', { title: `Grupo ${grupo} – Resultados`, grupo, partidos });
});

router.post('/resultado', requireAdmin, (req, res) => {
  const { partido_id, goles_local, goles_visitante } = req.body;
  const gl = parseInt(goles_local);
  const gv = parseInt(goles_visitante);

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    return res.json({ ok: false, msg: 'Valores inválidos' });
  }

  const partido = db.prepare('SELECT * FROM partidos WHERE id=?').get(partido_id);
  if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });

  // Si ya tenía resultado anterior, revertir los puntos
  if (partido.estado === 'finalizado') {
    const pronsViejos = db.prepare('SELECT * FROM pronosticos WHERE partido_id=?').all(partido_id);
    pronsViejos.forEach(pr => {
      db.prepare('UPDATE usuarios SET puntos_total = MAX(0, puntos_total - ?) WHERE id=?')
        .run(pr.puntos_obtenidos, pr.usuario_id);
      db.prepare('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=?').run(pr.id);
    });
  }

  // Guardar resultado
  db.prepare('UPDATE partidos SET goles_local=?, goles_visitante=?, estado=? WHERE id=?')
    .run(gl, gv, 'finalizado', partido_id);

  // Calcular y asignar puntos
  const prons = db.prepare('SELECT * FROM pronosticos WHERE partido_id=?').all(partido_id);
  prons.forEach(pr => {
    const pts = calcularPuntos(pr.goles_local, pr.goles_visitante, gl, gv);
    db.prepare('UPDATE pronosticos SET puntos_obtenidos=? WHERE id=?').run(pts, pr.id);
    db.prepare('UPDATE usuarios SET puntos_total = puntos_total + ? WHERE id=?').run(pts, pr.usuario_id);
  });

  res.json({ ok: true, msg: `Resultado guardado. ${prons.length} pronósticos actualizados.` });
});

router.post('/resetear', requireAdmin, (req, res) => {
  const { partido_id } = req.body;
  const partido = db.prepare('SELECT * FROM partidos WHERE id=?').get(partido_id);
  if (!partido || partido.estado !== 'finalizado') {
    return res.json({ ok: false, msg: 'El partido no tiene resultado cargado' });
  }

  const prons = db.prepare('SELECT * FROM pronosticos WHERE partido_id=?').all(partido_id);
  prons.forEach(pr => {
    db.prepare('UPDATE usuarios SET puntos_total = MAX(0, puntos_total - ?) WHERE id=?')
      .run(pr.puntos_obtenidos, pr.usuario_id);
    db.prepare('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=?').run(pr.id);
  });
  db.prepare('UPDATE partidos SET goles_local=NULL, goles_visitante=NULL, estado=? WHERE id=?')
    .run('pendiente', partido_id);

  res.json({ ok: true, msg: 'Resultado reseteado' });
});

// Gestión de usuarios
router.get('/usuarios', requireAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, username, email, es_admin, puntos_total, created_at FROM usuarios ORDER BY username').all();
  res.render('admin/usuarios', { title: 'Gestión de Usuarios', usuarios });
});

router.post('/toggle-admin', requireAdmin, (req, res) => {
  const { usuario_id } = req.body;
  if (usuario_id == req.session.usuario.id) return res.json({ ok: false, msg: 'No podés modificar tu propio rol' });
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(usuario_id);
  if (!u) return res.json({ ok: false, msg: 'Usuario no encontrado' });
  db.prepare('UPDATE usuarios SET es_admin=? WHERE id=?').run(u.es_admin ? 0 : 1, usuario_id);
  res.json({ ok: true, msg: u.es_admin ? 'Admin removido' : 'Admin asignado' });
});

module.exports = router;
