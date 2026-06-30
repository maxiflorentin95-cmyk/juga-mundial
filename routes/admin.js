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

function calcularPuntos(pL, pV, rL, rV, esEliminatoria = false) {
  if (pL === rL && pV === rV) return 5;                                         // exacto
  if (esEliminatoria && pL === pV && rL === rV) return 2;                       // empate acertado (eliminatoria)
  if ((pL - pV) === (rL - rV)) return 3;                                        // diferencia correcta
  if (Math.sign(pL - pV) === Math.sign(rL - rV)) return 2;                     // ganador correcto
  return 0;
}

function calcularBonus(predClasifId, realClasifId) {
  if (!predClasifId || !realClasifId) return 0;
  return parseInt(predClasifId) === parseInt(realClasifId) ? 2 : 0;
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
    const { partido_id, goles_local, goles_visitante, clasificado_id } = req.body;
    const gl = parseInt(goles_local), gv = parseInt(goles_visitante);
    if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0)
      return res.json({ ok: false, msg: 'Valores inválidos' });

    const partido = await prepare('SELECT * FROM partidos WHERE id=$1').get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });

    // Para eliminatoria: determinar quién clasificó
    let realClasifId = null;
    if (partido.fase && partido.fase !== 'grupos') {
      if (clasificado_id) {
        realClasifId = parseInt(clasificado_id);
      } else if (gl > gv) {
        realClasifId = partido.equipo_local_id;
      } else if (gv > gl) {
        realClasifId = partido.equipo_visitante_id;
      }
    }

    await client.query('BEGIN');

    // Revertir puntos si ya tenía resultado
    if (partido.estado === 'finalizado') {
      const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido_id]);
      for (const pr of prons.rows) {
        await client.query('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2', [pr.puntos_obtenidos, pr.usuario_id]);
        await client.query('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=$1', [pr.id]);
      }
    }

    // Guardar resultado (con clasificado para eliminatoria)
    await client.query('UPDATE partidos SET goles_local=$1, goles_visitante=$2, estado=$3, clasificado_id=$4 WHERE id=$5',
      [gl, gv, 'finalizado', realClasifId, partido_id]);

    // Calcular y asignar puntos (base + bonus clasificado)
    const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido_id]);
    const esEliminatoria = partido.fase && partido.fase !== 'grupos';
    for (const pr of prons.rows) {
      const base  = calcularPuntos(pr.goles_local, pr.goles_visitante, gl, gv, esEliminatoria);
      const bonus = calcularBonus(pr.clasificado_id, realClasifId);
      const pts   = base + bonus;
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

// Horarios correctos en hora Paraguay (UTC-3 fijo, Ley 7354/2024)
// Regla: ciudades MX (CDM/GDL/MTY) = seed CDT +2h; resto USA/Canadá = seed ET +1h
router.post('/corregir-horarios', requireAdmin, async (req, res) => {
  const horariosPY = [
    // GRUPO A
    { local:'México',              visit:'Sudáfrica',          fecha:'2026-06-11', hora:'16:00' },
    { local:'Corea del Sur',       visit:'Chequia',            fecha:'2026-06-11', hora:'23:00' },
    { local:'Chequia',             visit:'Sudáfrica',          fecha:'2026-06-18', hora:'13:00' },
    { local:'México',              visit:'Corea del Sur',      fecha:'2026-06-18', hora:'22:00' },
    { local:'Chequia',             visit:'México',             fecha:'2026-06-24', hora:'22:00' },
    { local:'Sudáfrica',           visit:'Corea del Sur',      fecha:'2026-06-24', hora:'22:00' },
    // GRUPO B
    { local:'Canadá',              visit:'Bosnia-Herzegovina', fecha:'2026-06-12', hora:'16:00' },
    { local:'Suiza',               visit:'Catar',              fecha:'2026-06-13', hora:'19:00' },
    { local:'Suiza',               visit:'Bosnia-Herzegovina', fecha:'2026-06-18', hora:'16:00' },
    { local:'Canadá',              visit:'Catar',              fecha:'2026-06-18', hora:'19:00' },
    { local:'Suiza',               visit:'Canadá',             fecha:'2026-06-24', hora:'16:00' },
    { local:'Bosnia-Herzegovina',  visit:'Catar',              fecha:'2026-06-24', hora:'16:00' },
    // GRUPO C
    { local:'Brasil',              visit:'Marruecos',          fecha:'2026-06-13', hora:'19:00' },
    { local:'Haití',               visit:'Escocia',            fecha:'2026-06-13', hora:'22:00' },
    { local:'Escocia',             visit:'Marruecos',          fecha:'2026-06-19', hora:'19:00' },
    { local:'Brasil',              visit:'Haití',              fecha:'2026-06-19', hora:'21:30' },
    { local:'Escocia',             visit:'Brasil',             fecha:'2026-06-24', hora:'19:00' },
    { local:'Marruecos',           visit:'Haití',              fecha:'2026-06-24', hora:'19:00' },
    // GRUPO D
    { local:'Estados Unidos',      visit:'Paraguay',           fecha:'2026-06-12', hora:'22:00' },
    { local:'Australia',           visit:'Turquía',            fecha:'2026-06-13', hora:'22:00' },
    { local:'Estados Unidos',      visit:'Australia',          fecha:'2026-06-19', hora:'16:00' },
    { local:'Turquía',             visit:'Paraguay',           fecha:'2026-06-19', hora:'22:00' },
    { local:'Turquía',             visit:'Estados Unidos',     fecha:'2026-06-25', hora:'23:00' },
    { local:'Paraguay',            visit:'Australia',          fecha:'2026-06-25', hora:'23:00' },
    // GRUPO E
    { local:'Alemania',            visit:'Curazao',            fecha:'2026-06-14', hora:'14:00' },
    { local:'Costa de Marfil',     visit:'Ecuador',            fecha:'2026-06-14', hora:'20:00' },
    { local:'Alemania',            visit:'Costa de Marfil',    fecha:'2026-06-20', hora:'17:00' },
    { local:'Ecuador',             visit:'Curazao',            fecha:'2026-06-20', hora:'21:00' },
    { local:'Ecuador',             visit:'Alemania',           fecha:'2026-06-25', hora:'17:00' },
    { local:'Curazao',             visit:'Costa de Marfil',    fecha:'2026-06-25', hora:'17:00' },
    // GRUPO F
    { local:'Países Bajos',        visit:'Japón',              fecha:'2026-06-14', hora:'17:00' },
    { local:'Suecia',              visit:'Túnez',              fecha:'2026-06-14', hora:'23:00' },
    { local:'Países Bajos',        visit:'Suecia',             fecha:'2026-06-20', hora:'14:00' },
    { local:'Túnez',               visit:'Japón',              fecha:'2026-06-21', hora:'01:00' }, // cruza medianoche
    { local:'Japón',               visit:'Suecia',             fecha:'2026-06-25', hora:'20:00' },
    { local:'Túnez',               visit:'Países Bajos',       fecha:'2026-06-25', hora:'20:00' },
    // GRUPO G
    { local:'Bélgica',             visit:'Egipto',             fecha:'2026-06-15', hora:'16:00' },
    { local:'Irán',                visit:'Nueva Zelanda',      fecha:'2026-06-15', hora:'22:00' },
    { local:'Bélgica',             visit:'Irán',               fecha:'2026-06-21', hora:'16:00' },
    { local:'Nueva Zelanda',       visit:'Egipto',             fecha:'2026-06-21', hora:'22:00' },
    { local:'Egipto',              visit:'Irán',               fecha:'2026-06-26', hora:'21:00' },
    { local:'Nueva Zelanda',       visit:'Bélgica',            fecha:'2026-06-26', hora:'21:00' },
    // GRUPO H
    { local:'España',              visit:'Cabo Verde',         fecha:'2026-06-15', hora:'13:00' },
    { local:'Arabia Saudita',      visit:'Uruguay',            fecha:'2026-06-15', hora:'19:00' },
    { local:'España',              visit:'Arabia Saudita',     fecha:'2026-06-21', hora:'13:00' },
    { local:'Uruguay',             visit:'Cabo Verde',         fecha:'2026-06-21', hora:'19:00' },
    { local:'Cabo Verde',          visit:'Arabia Saudita',     fecha:'2026-06-26', hora:'20:00' },
    { local:'Uruguay',             visit:'España',             fecha:'2026-06-26', hora:'21:00' },
    // GRUPO I
    { local:'Francia',             visit:'Senegal',            fecha:'2026-06-16', hora:'16:00' },
    { local:'Irak',                visit:'Noruega',            fecha:'2026-06-16', hora:'19:00' },
    { local:'Francia',             visit:'Irak',               fecha:'2026-06-22', hora:'18:00' },
    { local:'Noruega',             visit:'Senegal',            fecha:'2026-06-22', hora:'21:00' },
    { local:'Noruega',             visit:'Francia',            fecha:'2026-06-26', hora:'16:00' },
    { local:'Senegal',             visit:'Irak',               fecha:'2026-06-26', hora:'16:00' },
    // GRUPO J
    { local:'Argentina',           visit:'Argelia',            fecha:'2026-06-16', hora:'21:00' },
    { local:'Austria',             visit:'Jordania',           fecha:'2026-06-16', hora:'22:00' },
    { local:'Argentina',           visit:'Austria',            fecha:'2026-06-22', hora:'14:00' },
    { local:'Jordania',            visit:'Argelia',            fecha:'2026-06-22', hora:'22:00' },
    { local:'Argelia',             visit:'Austria',            fecha:'2026-06-27', hora:'22:00' },
    { local:'Jordania',            visit:'Argentina',          fecha:'2026-06-27', hora:'22:00' },
    // GRUPO K
    { local:'Portugal',            visit:'Rep. Dem. Congo',    fecha:'2026-06-17', hora:'14:00' },
    { local:'Uzbekistán',          visit:'Colombia',           fecha:'2026-06-17', hora:'23:00' }, // confirmado por usuario
    { local:'Portugal',            visit:'Uzbekistán',         fecha:'2026-06-23', hora:'14:00' },
    { local:'Colombia',            visit:'Rep. Dem. Congo',    fecha:'2026-06-23', hora:'22:00' },
    { local:'Colombia',            visit:'Portugal',           fecha:'2026-06-27', hora:'20:30' },
    { local:'Rep. Dem. Congo',     visit:'Uzbekistán',         fecha:'2026-06-27', hora:'20:30' },
    // GRUPO L
    { local:'Inglaterra',          visit:'Croacia',            fecha:'2026-06-17', hora:'17:00' },
    { local:'Ghana',               visit:'Panamá',             fecha:'2026-06-17', hora:'20:00' },
    { local:'Inglaterra',          visit:'Ghana',              fecha:'2026-06-23', hora:'17:00' },
    { local:'Panamá',              visit:'Croacia',            fecha:'2026-06-23', hora:'20:00' },
    { local:'Panamá',              visit:'Inglaterra',         fecha:'2026-06-27', hora:'18:00' },
    { local:'Croacia',             visit:'Ghana',              fecha:'2026-06-27', hora:'18:00' },
  ];

  try {
    let actualizados = 0, noEncontrados = [];
    for (const h of horariosPY) {
      const row = await prepare(`
        SELECT p.id FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE el.nombre=$1 AND ev.nombre=$2
      `).get(h.local, h.visit);
      if (!row) { noEncontrados.push(`${h.local} vs ${h.visit}`); continue; }
      await prepare('UPDATE partidos SET fecha=$1, hora=$2 WHERE id=$3')
        .run(h.fecha, h.hora, row.id);
      actualizados++;
    }
    res.json({ ok: true, actualizados, noEncontrados });
  } catch (e) {
    res.json({ ok: false, msg: e.message });
  }
});

router.post('/sync', requireAdmin, async (req, res) => {
  if (!process.env.FOOTBALL_DATA_KEY)
    return res.json({ ok: false, msg: 'Falta la variable de entorno FOOTBALL_DATA_KEY. Registrate gratis en football-data.org y configurala en Render.' });
  try {
    const { sync } = require('../scripts/sync-api-football');
    const result = await sync();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.json({ ok: false, msg: e.message });
  }
});

router.post('/recalcular-puntos', requireAdmin, async (req, res) => {
  try {
    await prepare(`
      UPDATE usuarios SET puntos_total = (
        SELECT COALESCE(SUM(puntos_obtenidos), 0)
        FROM pronosticos WHERE usuario_id = usuarios.id
      )
    `).run();
    const usuarios = await prepare('SELECT username, puntos_total FROM usuarios ORDER BY puntos_total DESC').all();
    res.json({ ok: true, msg: `Puntos recalculados para ${usuarios.length} usuarios`, ranking: usuarios });
  } catch (e) {
    res.json({ ok: false, msg: e.message });
  }
});

router.post('/recalcular-eliminatoria', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const partidos = await prepare(`
      SELECT p.id, p.fase, p.goles_local, p.goles_visitante, p.clasificado_id
      FROM partidos p
      WHERE p.estado = 'finalizado' AND p.fase IS DISTINCT FROM 'grupos' AND p.fase IS NOT NULL
    `).all();

    await client.query('BEGIN');

    let actualizados = 0;
    for (const partido of partidos) {
      const { rows: prons } = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido.id]);
      for (const pr of prons) {
        const esEliminatoria = true;
        const base  = calcularPuntos(pr.goles_local, pr.goles_visitante, partido.goles_local, partido.goles_visitante, esEliminatoria);
        const bonus = calcularBonus(pr.clasificado_id, partido.clasificado_id);
        const pts   = base + bonus;
        await client.query('UPDATE pronosticos SET puntos_obtenidos=$1 WHERE id=$2', [pts, pr.id]);
        actualizados++;
      }
    }

    // Recalcular puntos_total de todos los usuarios desde pronosticos
    await client.query(`
      UPDATE usuarios SET puntos_total = (
        SELECT COALESCE(SUM(puntos_obtenidos), 0)
        FROM pronosticos WHERE usuario_id = usuarios.id
      )
    `);

    await client.query('COMMIT');
    res.json({ ok: true, msg: `✓ ${partidos.length} partidos de eliminatoria recalculados, ${actualizados} pronósticos actualizados.` });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.json({ ok: false, msg: e.message });
  } finally {
    client.release();
  }
});

// Cargar pronóstico manual en nombre de un usuario
router.post('/cargar-pronostico-manual', requireAdmin, async (req, res) => {
  try {
    const { username, partido_id, goles_local, goles_visitante } = req.body;
    const user = await prepare('SELECT id FROM usuarios WHERE username=$1').get(username);
    if (!user) return res.json({ ok: false, msg: `Usuario "${username}" no encontrado` });

    const partido = await prepare(
      'SELECT p.*, el.nombre AS local, ev.nombre AS visit FROM partidos p JOIN equipos el ON p.equipo_local_id=el.id JOIN equipos ev ON p.equipo_visitante_id=ev.id WHERE p.id=$1'
    ).get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });

    const gl = parseInt(goles_local), gv = parseInt(goles_visitante);
    if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0)
      return res.json({ ok: false, msg: 'Goles inválidos' });

    // Calcular puntos si el partido ya está finalizado
    let pts = 0;
    if (partido.estado === 'finalizado' && partido.goles_local !== null) {
      pts = calcularPuntos(gl, gv, partido.goles_local, partido.goles_visitante);
    }

    // Verificar si ya tenía pronóstico (para ajustar puntos_total)
    const previo = await prepare('SELECT puntos_obtenidos FROM pronosticos WHERE usuario_id=$1 AND partido_id=$2').get(user.id, partido_id);

    await prepare(`
      INSERT INTO pronosticos (usuario_id, partido_id, goles_local, goles_visitante, puntos_obtenidos, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(usuario_id, partido_id) DO UPDATE SET
        goles_local=EXCLUDED.goles_local, goles_visitante=EXCLUDED.goles_visitante,
        puntos_obtenidos=EXCLUDED.puntos_obtenidos, updated_at=NOW()
    `).run(user.id, partido_id, gl, gv, pts);

    // Ajustar puntos_total
    const ptsPrevios = previo ? previo.puntos_obtenidos : 0;
    const diff = pts - ptsPrevios;
    if (diff !== 0) {
      await prepare('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total + $1) WHERE id=$2').run(diff, user.id);
    }

    res.json({ ok: true, msg: `✓ Pronóstico de ${username}: ${partido.local} ${gl}–${gv} ${partido.visit}${partido.estado === 'finalizado' ? ` → ${pts} pts` : ' (partido pendiente, puntos se calcularán al finalizar)'}` });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

// Lista de partidos con conteo de pronósticos (para el selector del admin)
router.get('/partidos-lista', requireAdmin, async (req, res) => {
  try {
    const rows = await prepare(`
      SELECT p.id, p.fecha, p.hora, p.grupo,
             el.nombre AS local, ev.nombre AS visit,
             COUNT(pr.id) AS total
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      LEFT JOIN pronosticos pr ON pr.partido_id = p.id
      GROUP BY p.id, p.fecha, p.hora, p.grupo, el.nombre, ev.nombre
      ORDER BY p.fecha, p.hora
    `).all();
    res.json(rows);
  } catch (e) { res.json([]); }
});

// Borrar pronósticos de un partido específico y revertir sus puntos
router.post('/limpiar-partido', requireAdmin, async (req, res) => {
  try {
    const { partido_id } = req.body;
    if (!partido_id) return res.json({ ok: false, msg: 'Falta partido_id' });

    const partido = await prepare(
      'SELECT p.*, el.nombre AS local, ev.nombre AS visit FROM partidos p JOIN equipos el ON p.equipo_local_id=el.id JOIN equipos ev ON p.equipo_visitante_id=ev.id WHERE p.id=$1'
    ).get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });

    // Revertir puntos de cada pronóstico
    const prons = await prepare('SELECT * FROM pronosticos WHERE partido_id=$1').all(partido_id);
    for (const pr of prons) {
      if (pr.puntos_obtenidos > 0) {
        await prepare('UPDATE usuarios SET puntos_total = GREATEST(0, puntos_total - $1) WHERE id=$2')
          .run(pr.puntos_obtenidos, pr.usuario_id);
      }
    }

    // Borrar todos los pronósticos del partido
    await prepare('DELETE FROM pronosticos WHERE partido_id=$1').run(partido_id);

    res.json({ ok: true, msg: `✓ ${prons.length} pronósticos eliminados de "${partido.local} vs ${partido.visit}". Puntos revertidos.`, cantidad: prons.length });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

// Renombrar usuario
router.post('/renombrar-usuario', requireAdmin, async (req, res) => {
  try {
    const { username_actual, username_nuevo } = req.body;
    if (!username_actual || !username_nuevo) return res.json({ ok: false, msg: 'Faltan campos' });

    const existe = await prepare('SELECT id FROM usuarios WHERE username=$1').get(username_actual);
    if (!existe) return res.json({ ok: false, msg: `Usuario "${username_actual}" no encontrado` });

    const ocupado = await prepare('SELECT id FROM usuarios WHERE username=$1').get(username_nuevo);
    if (ocupado) return res.json({ ok: false, msg: `El nombre "${username_nuevo}" ya está en uso` });

    await prepare('UPDATE usuarios SET username=$1 WHERE username=$2').run(username_nuevo, username_actual);
    res.json({ ok: true, msg: `✓ "${username_actual}" renombrado a "${username_nuevo}"` });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

// Reset de contraseña individual
router.post('/resetear-password-usuario', requireAdmin, async (req, res) => {
  try {
    const { usuario_id, nueva_password } = req.body;
    const user = await prepare('SELECT id, username FROM usuarios WHERE id=$1').get(usuario_id);
    if (!user) return res.json({ ok: false, msg: 'Usuario no encontrado' });
    const pwd = nueva_password?.trim() || (user.username + '2026');
    const hash = await bcrypt.hash(pwd, 10);
    await prepare('UPDATE usuarios SET password_hash=$1 WHERE id=$2').run(hash, user.id);
    res.json({ ok: true, msg: `✓ Contraseña de "${user.username}" reseteada a: ${pwd}` });
  } catch (e) { res.json({ ok: false, msg: e.message }); }
});

// Toggle admin
router.post('/toggle-admin', requireAdmin, async (req, res) => {
  try {
    const { usuario_id } = req.body;
    if (parseInt(usuario_id) === req.session.usuario.id)
      return res.json({ ok: false, msg: 'No podés modificar tu propio rol' });
    const user = await prepare('SELECT id, username, es_admin FROM usuarios WHERE id=$1').get(usuario_id);
    if (!user) return res.json({ ok: false, msg: 'Usuario no encontrado' });
    const nuevo = user.es_admin ? 0 : 1;
    await prepare('UPDATE usuarios SET es_admin=$1 WHERE id=$2').run(nuevo, user.id);
    res.json({ ok: true, es_admin: nuevo, msg: `"${user.username}" ahora es ${nuevo ? 'admin' : 'usuario normal'}` });
  } catch (e) { res.json({ ok: false, msg: e.message }); }
});

router.post('/resetear-passwords', requireAdmin, async (req, res) => {
  try {
    const usuarios = await prepare('SELECT id, username FROM usuarios').all();
    let actualizados = 0;
    for (const u of usuarios) {
      const hash = await bcrypt.hash(u.username + '2026', 10);
      await prepare('UPDATE usuarios SET password_hash=$1 WHERE id=$2').run(hash, u.id);
      actualizados++;
    }
    res.json({ ok: true, msg: `Contraseñas reseteadas para ${actualizados} usuarios` });
  } catch (e) {
    res.json({ ok: false, msg: e.message });
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

router.post('/importar-historico', requireAdmin, async (req, res) => {
  // mflorentin en el sistema viejo = mfiorentin en nuestra DB
  const umap = { 'mflorentin': 'mfiorentin' };
  const u = (n) => umap[n] || n;

  // local/visit según nuestra DB; para Suiza vs Catar (viejo sistema tenía Catar como local → flipeamos)
  const historial = [
    { local:'México',          visit:'Sudáfrica',         gl:2, gv:0, prons:[
      {u:'MrPomberoPY',gl:2,gv:1},{u:'mfiorentin',gl:2,gv:1},{u:'Loche',gl:1,gv:0}]},
    { local:'Corea del Sur',   visit:'Chequia',            gl:2, gv:1, prons:[
      {u:'Ronaldraf',gl:3,gv:1},{u:'Chrisis',gl:2,gv:2},{u:'Ortepro18',gl:0,gv:2},
      {u:'Ferfre',gl:1,gv:1},{u:'MrPomberoPY',gl:1,gv:1},{u:'HugoLoup',gl:1,gv:1},
      {u:'JoeAlca',gl:1,gv:1},{u:'JulioMarti',gl:1,gv:1},{u:'mfiorentin',gl:0,gv:0},
      {u:'Chebis',gl:1,gv:1},{u:'Loche',gl:0,gv:1}]},
    { local:'Canadá',          visit:'Bosnia-Herzegovina', gl:1, gv:1, prons:[
      {u:'Ferfre',gl:1,gv:1},{u:'JulioMarti',gl:1,gv:1},{u:'Chebis',gl:1,gv:1},
      {u:'Ortepro18',gl:3,gv:0},{u:'MrPomberoPY',gl:2,gv:0},{u:'HugoLoup',gl:2,gv:1},
      {u:'JoeAlca',gl:1,gv:2},{u:'mfiorentin',gl:1,gv:0},{u:'Ronaldraf',gl:3,gv:0},
      {u:'Loche',gl:1,gv:1}]},
    { local:'Estados Unidos',  visit:'Paraguay',           gl:4, gv:1, prons:[
      {u:'Ortepro18',gl:2,gv:1},{u:'mfiorentin',gl:2,gv:1},{u:'Chrisis',gl:1,gv:1},
      {u:'Ferfre',gl:1,gv:2},{u:'MrPomberoPY',gl:1,gv:2},{u:'HugoLoup',gl:1,gv:2},
      {u:'JoeAlca',gl:1,gv:2},{u:'JulioMarti',gl:1,gv:1},{u:'Ronaldraf',gl:1,gv:2},
      {u:'Chebis',gl:1,gv:1},{u:'Loche',gl:1,gv:1}]},
    // Suiza vs Catar en DB; el sistema viejo tenía "Catar vs Suiza" → pronósticos flipeados
    // Loche: "catar 0 - suiza 1" → flip → Suiza 1, Catar 0 → gl=1, gv=0
    { local:'Suiza',           visit:'Catar',              gl:1, gv:1, prons:[
      {u:'Ronaldraf',gl:2,gv:2},{u:'Chrisis',gl:2,gv:0},{u:'Ortepro18',gl:2,gv:1},
      {u:'Ferfre',gl:2,gv:0},{u:'MrPomberoPY',gl:2,gv:0},{u:'HugoLoup',gl:3,gv:0},
      {u:'JoeAlca',gl:3,gv:1},{u:'JulioMarti',gl:2,gv:0},{u:'mfiorentin',gl:2,gv:0},
      {u:'Chebis',gl:2,gv:0},{u:'Loche',gl:1,gv:0}]},
    { local:'Brasil',          visit:'Marruecos',          gl:1, gv:1, prons:[
      {u:'Chrisis',gl:1,gv:1},{u:'Ortepro18',gl:2,gv:2},{u:'MrPomberoPY',gl:2,gv:2},
      {u:'Ferfre',gl:2,gv:1},{u:'HugoLoup',gl:3,gv:1},{u:'JoeAlca',gl:2,gv:1},
      {u:'JulioMarti',gl:2,gv:1},{u:'mfiorentin',gl:3,gv:1},{u:'Ronaldraf',gl:2,gv:1},
      {u:'Chebis',gl:2,gv:1},{u:'Loche',gl:2,gv:1}]},
    { local:'Haití',           visit:'Escocia',            gl:0, gv:1, prons:[
      {u:'Chrisis',gl:0,gv:3},{u:'Ferfre',gl:0,gv:2},{u:'MrPomberoPY',gl:0,gv:3},
      {u:'HugoLoup',gl:0,gv:4},{u:'JulioMarti',gl:0,gv:2},{u:'mfiorentin',gl:1,gv:2},
      {u:'Ronaldraf',gl:0,gv:2},{u:'Chebis',gl:0,gv:2},{u:'Ortepro18',gl:0,gv:0},
      {u:'Loche',gl:0,gv:2}]},
    { local:'Australia',       visit:'Turquía',            gl:2, gv:0, prons:[
      {u:'Chrisis',gl:0,gv:2},{u:'Ortepro18',gl:0,gv:2},{u:'Ferfre',gl:1,gv:2},
      {u:'MrPomberoPY',gl:0,gv:3},{u:'HugoLoup',gl:0,gv:2},{u:'JulioMarti',gl:0,gv:2},
      {u:'mfiorentin',gl:0,gv:2},{u:'Ronaldraf',gl:1,gv:2},{u:'Chebis',gl:0,gv:2},
      {u:'Loche',gl:0,gv:1}]},
    { local:'Alemania',        visit:'Curazao',            gl:7, gv:1, prons:[
      {u:'Chrisis',gl:3,gv:0},{u:'Ortepro18',gl:8,gv:1},{u:'Ferfre',gl:4,gv:0},
      {u:'MrPomberoPY',gl:7,gv:0},{u:'HugoLoup',gl:5,gv:0},{u:'JulioMarti',gl:4,gv:0},
      {u:'mfiorentin',gl:4,gv:0},{u:'Ronaldraf',gl:4,gv:0},{u:'Chebis',gl:4,gv:0},
      {u:'Loche',gl:2,gv:0}]},
    { local:'Países Bajos',    visit:'Japón',              gl:2, gv:2, prons:[
      {u:'MrPomberoPY',gl:1,gv:1},{u:'JulioMarti',gl:1,gv:1},{u:'Ronaldraf',gl:0,gv:0},
      {u:'Chebis',gl:1,gv:1},{u:'Chrisis',gl:2,gv:0},{u:'Ortepro18',gl:1,gv:2},
      {u:'Ferfre',gl:2,gv:0},{u:'HugoLoup',gl:1,gv:2},{u:'mfiorentin',gl:2,gv:1},
      {u:'Loche',gl:1,gv:1}]},
    { local:'Costa de Marfil', visit:'Ecuador',            gl:1, gv:0, prons:[
      {u:'Ronaldraf',gl:3,gv:2},{u:'Chrisis',gl:1,gv:1},{u:'Ortepro18',gl:2,gv:3},
      {u:'Ferfre',gl:2,gv:2},{u:'MrPomberoPY',gl:1,gv:1},{u:'HugoLoup',gl:0,gv:1},
      {u:'JoeAlca',gl:0,gv:1},{u:'JulioMarti',gl:0,gv:2},{u:'mfiorentin',gl:1,gv:2},
      {u:'Chebis',gl:0,gv:1},{u:'Loche',gl:0,gv:1}]},
    { local:'Suecia',          visit:'Túnez',              gl:5, gv:1, prons:[
      {u:'Chrisis',gl:2,gv:1},{u:'Ortepro18',gl:2,gv:0},{u:'Ferfre',gl:2,gv:1},
      {u:'MrPomberoPY',gl:1,gv:0},{u:'HugoLoup',gl:2,gv:0},{u:'JoeAlca',gl:2,gv:0},
      {u:'JulioMarti',gl:2,gv:0},{u:'mfiorentin',gl:1,gv:0},{u:'Ronaldraf',gl:0,gv:2},
      {u:'Chebis',gl:1,gv:1},{u:'Loche',gl:1,gv:0}]},
    { local:'España',          visit:'Cabo Verde',         gl:0, gv:0, prons:[
      {u:'Chrisis',gl:3,gv:0},{u:'Ortepro18',gl:4,gv:1},{u:'Ferfre',gl:5,gv:0},
      {u:'MrPomberoPY',gl:4,gv:1},{u:'HugoLoup',gl:6,gv:0},{u:'JoeAlca',gl:4,gv:0},
      {u:'JulioMarti',gl:4,gv:0},{u:'mfiorentin',gl:5,gv:0},{u:'Ronaldraf',gl:5,gv:0},
      {u:'Chebis',gl:4,gv:0},{u:'Loche',gl:2,gv:0}]},
    { local:'Bélgica',         visit:'Egipto',             gl:1, gv:1, prons:[
      {u:'Chrisis',gl:1,gv:1},{u:'mfiorentin',gl:2,gv:2},{u:'Ortepro18',gl:1,gv:2},
      {u:'Ferfre',gl:2,gv:1},{u:'MrPomberoPY',gl:3,gv:1},{u:'HugoLoup',gl:3,gv:1},
      {u:'JoeAlca',gl:3,gv:1},{u:'JulioMarti',gl:2,gv:0},{u:'Ronaldraf',gl:1,gv:3},
      {u:'Chebis',gl:2,gv:1},{u:'Loche',gl:2,gv:0}]},
    { local:'Arabia Saudita',  visit:'Uruguay',            gl:1, gv:1, prons:[
      {u:'Chrisis',gl:1,gv:1},{u:'mfiorentin',gl:1,gv:1},{u:'Ortepro18',gl:1,gv:2},
      {u:'Ferfre',gl:0,gv:1},{u:'MrPomberoPY',gl:2,gv:0},{u:'HugoLoup',gl:0,gv:1},
      {u:'JoeAlca',gl:0,gv:1},{u:'JulioMarti',gl:1,gv:2},{u:'Ronaldraf',gl:1,gv:2},
      {u:'Chebis',gl:1,gv:2},{u:'Loche',gl:0,gv:1}]},
    { local:'Irán',            visit:'Nueva Zelanda',      gl:2, gv:2, prons:[
      {u:'mfiorentin',gl:2,gv:2},{u:'Chrisis',gl:1,gv:1},{u:'HugoLoup',gl:0,gv:0},
      {u:'JulioMarti',gl:1,gv:1},{u:'Ronaldraf',gl:1,gv:1},{u:'Chebis',gl:1,gv:1},
      {u:'Ortepro18',gl:0,gv:2},{u:'Ferfre',gl:2,gv:0},{u:'MrPomberoPY',gl:1,gv:0},
      {u:'JoeAlca',gl:2,gv:0},{u:'Loche',gl:1,gv:1}]},
    { local:'Francia',         visit:'Senegal',            gl:3, gv:1, prons:[
      {u:'Ortepro18',gl:3,gv:1},{u:'Ferfre',gl:3,gv:1},{u:'JoeAlca',gl:3,gv:1},
      {u:'JulioMarti',gl:3,gv:1},{u:'mfiorentin',gl:3,gv:1},{u:'Chebis',gl:3,gv:1},
      {u:'Chrisis',gl:3,gv:0},{u:'Ronaldraf',gl:2,gv:0},{u:'MrPomberoPY',gl:2,gv:2},
      {u:'HugoLoup',gl:0,gv:1},{u:'Loche',gl:2,gv:0}]},
    { local:'Irak',            visit:'Noruega',            gl:1, gv:4, prons:[
      {u:'Ortepro18',gl:1,gv:4},{u:'Chrisis',gl:0,gv:2},{u:'Ferfre',gl:0,gv:2},
      {u:'MrPomberoPY',gl:0,gv:2},{u:'HugoLoup',gl:0,gv:4},{u:'JoeAlca',gl:0,gv:2},
      {u:'JulioMarti',gl:1,gv:3},{u:'mfiorentin',gl:1,gv:3},{u:'Ronaldraf',gl:0,gv:1},
      {u:'Chebis',gl:0,gv:2},{u:'Loche',gl:0,gv:2}]},
    { local:'Argentina',       visit:'Argelia',            gl:3, gv:0, prons:[
      {u:'MrPomberoPY',gl:3,gv:0},{u:'Chrisis',gl:2,gv:0},{u:'Ortepro18',gl:2,gv:0},
      {u:'Ferfre',gl:3,gv:1},{u:'HugoLoup',gl:2,gv:0},{u:'JoeAlca',gl:2,gv:1},
      {u:'JulioMarti',gl:2,gv:0},{u:'mfiorentin',gl:2,gv:0},{u:'Ronaldraf',gl:3,gv:1},
      {u:'Chebis',gl:2,gv:1},{u:'Loche',gl:2,gv:0}]},
    { local:'Austria',         visit:'Jordania',           gl:3, gv:1, prons:[
      {u:'Ortepro18',gl:3,gv:1},{u:'Chrisis',gl:1,gv:0},{u:'Ferfre',gl:2,gv:0},
      {u:'MrPomberoPY',gl:2,gv:0},{u:'HugoLoup',gl:3,gv:0},{u:'JulioMarti',gl:1,gv:0},
      {u:'Ronaldraf',gl:2,gv:1},{u:'Chebis',gl:1,gv:0},{u:'JoeAlca',gl:2,gv:2},
      {u:'mfiorentin',gl:1,gv:1},{u:'Loche',gl:1,gv:0}]},
    { local:'Portugal',        visit:'Rep. Dem. Congo',    gl:1, gv:1, prons:[
      {u:'Chrisis',gl:3,gv:0},{u:'Ortepro18',gl:3,gv:1},{u:'Ferfre',gl:3,gv:0},
      {u:'MrPomberoPY',gl:3,gv:0},{u:'HugoLoup',gl:3,gv:0},{u:'JoeAlca',gl:3,gv:1},
      {u:'JulioMarti',gl:3,gv:0},{u:'mfiorentin',gl:4,gv:0},{u:'Ronaldraf',gl:3,gv:0},
      {u:'Chebis',gl:3,gv:1},{u:'Loche',gl:3,gv:0}]},
    { local:'Inglaterra',      visit:'Croacia',            gl:4, gv:2, prons:[
      {u:'Chrisis',gl:2,gv:0},{u:'Ferfre',gl:2,gv:1},{u:'MrPomberoPY',gl:2,gv:1},
      {u:'HugoLoup',gl:3,gv:1},{u:'JoeAlca',gl:2,gv:1},{u:'JulioMarti',gl:2,gv:1},
      {u:'Ortepro18',gl:2,gv:2},{u:'mfiorentin',gl:1,gv:1},{u:'Ronaldraf',gl:1,gv:2},
      {u:'Chebis',gl:1,gv:1},{u:'Loche',gl:2,gv:1}]},
    { local:'Ghana',           visit:'Panamá',             gl:1, gv:0, prons:[
      {u:'HugoLoup',gl:1,gv:0},{u:'Chrisis',gl:3,gv:1},{u:'Ortepro18',gl:3,gv:0},
      {u:'JoeAlca',gl:2,gv:1},{u:'JulioMarti',gl:2,gv:1},{u:'mfiorentin',gl:2,gv:1},
      {u:'Ronaldraf',gl:2,gv:0},{u:'Chebis',gl:2,gv:1},{u:'Ferfre',gl:1,gv:1},
      {u:'Loche',gl:2,gv:0}]},
    { local:'Uzbekistán',      visit:'Colombia',           gl:1, gv:3, prons:[
      {u:'Ferfre',gl:1,gv:3},{u:'mfiorentin',gl:1,gv:3},{u:'Ronaldraf',gl:1,gv:3},
      {u:'Chebis',gl:1,gv:3},{u:'Chrisis',gl:0,gv:2},{u:'Ortepro18',gl:1,gv:4},
      {u:'MrPomberoPY',gl:0,gv:2},{u:'HugoLoup',gl:0,gv:2},{u:'JoeAlca',gl:0,gv:2},
      {u:'JulioMarti',gl:0,gv:2},{u:'Loche',gl:0,gv:2}]},
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM pronosticos');
    await client.query('UPDATE usuarios SET puntos_total = 0');

    let totalProns = 0, errores = [];

    for (const m of historial) {
      const partido = await prepare(`
        SELECT p.id FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE el.nombre=$1 AND ev.nombre=$2
      `).get(m.local, m.visit);

      if (!partido) { errores.push(`Partido no encontrado: ${m.local} vs ${m.visit}`); continue; }

      await client.query('UPDATE partidos SET goles_local=$1,goles_visitante=$2,estado=$3 WHERE id=$4',
        [m.gl, m.gv, 'finalizado', partido.id]);

      for (const p of m.prons) {
        const username = u(p.u);
        const usr = await prepare('SELECT id FROM usuarios WHERE username=$1').get(username);
        if (!usr) { errores.push(`Usuario no encontrado: ${username}`); continue; }

        const pts = calcularPuntos(p.gl, p.gv, m.gl, m.gv);
        await client.query(`
          INSERT INTO pronosticos (usuario_id, partido_id, goles_local, goles_visitante, puntos_obtenidos)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (usuario_id, partido_id) DO UPDATE
          SET goles_local=$3, goles_visitante=$4, puntos_obtenidos=$5
        `, [usr.id, partido.id, p.gl, p.gv, pts]);

        await client.query('UPDATE usuarios SET puntos_total=puntos_total+$1 WHERE id=$2', [pts, usr.id]);
        totalProns++;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, pronosticos: totalProns, errores });
  } catch(e) {
    await client.query('ROLLBACK');
    res.json({ ok: false, msg: e.message });
  } finally {
    client.release();
  }
});

router.post('/cargar-resultados-wc26', requireAdmin, async (req, res) => {
  const resultados = [
    // Grupo A
    { local: 'México',             visit: 'Sudáfrica',          gl: 2, gv: 0 },
    { local: 'Corea del Sur',      visit: 'Chequia',             gl: 2, gv: 1 },
    // Grupo B
    { local: 'Canadá',             visit: 'Bosnia-Herzegovina',  gl: 1, gv: 1 },
    { local: 'Suiza',              visit: 'Catar',               gl: 1, gv: 1 },
    // Grupo C
    { local: 'Brasil',             visit: 'Marruecos',           gl: 1, gv: 1 },
    { local: 'Haití',              visit: 'Escocia',             gl: 0, gv: 1 },
    // Grupo D
    { local: 'Estados Unidos',     visit: 'Paraguay',            gl: 4, gv: 1 },
    { local: 'Australia',          visit: 'Turquía',             gl: 2, gv: 0 },
    // Grupo E
    { local: 'Alemania',           visit: 'Curazao',             gl: 7, gv: 1 },
    { local: 'Costa de Marfil',    visit: 'Ecuador',             gl: 1, gv: 0 },
    // Grupo F
    { local: 'Países Bajos',       visit: 'Japón',               gl: 2, gv: 2 },
    { local: 'Suecia',             visit: 'Túnez',               gl: 5, gv: 1 },
    // Grupo G
    { local: 'Bélgica',            visit: 'Egipto',              gl: 1, gv: 1 },
    { local: 'Irán',               visit: 'Nueva Zelanda',       gl: 2, gv: 2 },
    // Grupo H
    { local: 'España',             visit: 'Cabo Verde',          gl: 0, gv: 0 },
    { local: 'Arabia Saudita',     visit: 'Uruguay',             gl: 1, gv: 1 },
    // Grupo I
    { local: 'Francia',            visit: 'Senegal',             gl: 3, gv: 1 },
    { local: 'Irak',               visit: 'Noruega',             gl: 1, gv: 4 },
    // Grupo J
    { local: 'Argentina',          visit: 'Argelia',             gl: 3, gv: 0 },
    { local: 'Austria',            visit: 'Jordania',            gl: 3, gv: 1 },
    // Grupo K
    { local: 'Portugal',           visit: 'Rep. Dem. Congo',     gl: 1, gv: 1 },
    { local: 'Uzbekistán',         visit: 'Colombia',            gl: 1, gv: 3 },
    // Grupo L
    { local: 'Inglaterra',         visit: 'Croacia',             gl: 4, gv: 2 },
    { local: 'Ghana',              visit: 'Panamá',              gl: 1, gv: 0 },
  ];

  const client = await pool.connect();
  let cargados = 0;
  const errores = [];

  try {
    for (const r of resultados) {
      const partido = await prepare(`
        SELECT p.id, p.estado FROM partidos p
        JOIN equipos el ON p.equipo_local_id = el.id
        JOIN equipos ev ON p.equipo_visitante_id = ev.id
        WHERE el.nombre=$1 AND ev.nombre=$2
      `).get(r.local, r.visit);

      if (!partido) { errores.push(`No encontrado: ${r.local} vs ${r.visit}`); continue; }

      await client.query('BEGIN');

      if (partido.estado === 'finalizado') {
        const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido.id]);
        for (const pr of prons.rows) {
          await client.query('UPDATE usuarios SET puntos_total=GREATEST(0,puntos_total-$1) WHERE id=$2', [pr.puntos_obtenidos, pr.usuario_id]);
          await client.query('UPDATE pronosticos SET puntos_obtenidos=0 WHERE id=$1', [pr.id]);
        }
      }

      await client.query('UPDATE partidos SET goles_local=$1,goles_visitante=$2,estado=$3 WHERE id=$4',
        [r.gl, r.gv, 'finalizado', partido.id]);

      const prons = await client.query('SELECT * FROM pronosticos WHERE partido_id=$1', [partido.id]);
      for (const pr of prons.rows) {
        const pts = calcularPuntos(pr.goles_local, pr.goles_visitante, r.gl, r.gv);
        await client.query('UPDATE pronosticos SET puntos_obtenidos=$1 WHERE id=$2', [pts, pr.id]);
        await client.query('UPDATE usuarios SET puntos_total=puntos_total+$1 WHERE id=$2', [pts, pr.usuario_id]);
      }

      await client.query('COMMIT');
      cargados++;
    }
    res.json({ ok: true, cargados, errores });
  } catch (e) {
    await client.query('ROLLBACK');
    res.json({ ok: false, msg: e.message });
  } finally {
    client.release();
  }
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
    { username: 'Loche',       pts: 10 },
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

// ── ELIMINATORIA ──────────────────────────────────────────────────────────────

// Listar todos los equipos (para el selector de cruces)
router.get('/equipos-lista', requireAdmin, async (req, res) => {
  try {
    const equipos = await prepare('SELECT id, nombre, nombre_corto, bandera, grupo FROM equipos ORDER BY grupo, nombre').all();
    res.json(equipos);
  } catch (e) { res.json([]); }
});

// Agregar un partido de eliminatoria
router.post('/agregar-partido-eliminatoria', requireAdmin, async (req, res) => {
  try {
    const { local_id, visit_id, fase, fecha, hora, estadio, ciudad } = req.body;
    if (!local_id || !visit_id || !fase || !fecha || !hora)
      return res.json({ ok: false, msg: 'Faltan campos obligatorios' });
    if (local_id === visit_id)
      return res.json({ ok: false, msg: 'Local y visitante no pueden ser el mismo equipo' });

    const fases_validas = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'tercer_puesto', 'final'];
    if (!fases_validas.includes(fase))
      return res.json({ ok: false, msg: 'Fase inválida' });

    const r = await prepare(`
      INSERT INTO partidos (fase, grupo, equipo_local_id, equipo_visitante_id, fecha, hora, estadio, ciudad, estado)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'pendiente')
    `).run(fase, local_id, visit_id, fecha, hora, estadio || '', ciudad || '');

    res.json({ ok: true, msg: `✓ Partido de ${fase} agregado correctamente`, id: r.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

// Eliminar un partido de eliminatoria (solo si no tiene pronósticos)
router.post('/eliminar-partido-eliminatoria', requireAdmin, async (req, res) => {
  try {
    const { partido_id } = req.body;
    const partido = await prepare(
      'SELECT p.*, el.nombre AS local, ev.nombre AS visit FROM partidos p JOIN equipos el ON p.equipo_local_id=el.id JOIN equipos ev ON p.equipo_visitante_id=ev.id WHERE p.id=$1'
    ).get(partido_id);
    if (!partido) return res.json({ ok: false, msg: 'Partido no encontrado' });
    if (partido.fase === 'grupos') return res.json({ ok: false, msg: 'No se pueden eliminar partidos de grupos' });

    const prons = await prepare('SELECT COUNT(*) AS c FROM pronosticos WHERE partido_id=$1').get(partido_id);
    if (prons.c > 0) return res.json({ ok: false, msg: `No se puede eliminar: tiene ${prons.c} pronósticos. Limpiá los pronósticos primero.` });

    await prepare('DELETE FROM partidos WHERE id=$1').run(partido_id);
    res.json({ ok: true, msg: `✓ Partido "${partido.local} vs ${partido.visit}" eliminado` });
  } catch (e) {
    console.error(e);
    res.json({ ok: false, msg: e.message });
  }
});

// Ver resultados de eliminatoria
router.get('/resultados-eliminatoria', requireAdmin, async (req, res) => {
  try {
    const FASES = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'tercer_puesto', 'final'];
    const FASE_LABEL = {
      dieciseisavos: '16avos de Final', octavos: 'Octavos de Final', cuartos: 'Cuartos de Final',
      semifinal: 'Semifinales', tercer_puesto: 'Tercer Puesto', final: 'Gran Final',
    };

    const partidos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.fase != 'grupos'
      ORDER BY ARRAY_POSITION(ARRAY['dieciseisavos','octavos','cuartos','semifinal','tercer_puesto','final']::text[], p.fase), p.fecha, p.hora
    `).all();

    const porFase = {};
    partidos.forEach(p => {
      if (!porFase[p.fase]) porFase[p.fase] = [];
      porFase[p.fase].push(p);
    });
    const fases = FASES.filter(f => porFase[f]);

    res.render('admin/resultados-eliminatoria', { title: 'Resultados Eliminatoria', fases, porFase, FASE_LABEL });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
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

module.exports = router;
