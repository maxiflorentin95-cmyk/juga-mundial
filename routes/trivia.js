const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

const INICIO    = new Date('2026-06-11T00:00:00-03:00');
const TIEMPO_MAX = 25;

// Puntos máximos según cantidad de vistas antes de responder
const MAX_POR_VISTA = [10, 8, 6, 4, 2]; // índice 0 = primera vista

function ordenDelDia() {
  const hoyPY = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dias = Math.floor((hoyPY - INICIO) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(dias + 1, 50));
}

function maxPtsPorVistas(vistas) {
  const idx = Math.min(vistas - 1, MAX_POR_VISTA.length - 1);
  return MAX_POR_VISTA[Math.max(0, idx)];
}

function calcularPuntos(segundos, maxPts) {
  let pts;
  if (segundos <= 5)  pts = 10;
  else if (segundos <= 10) pts = 8;
  else if (segundos <= 15) pts = 6;
  else if (segundos <= 20) pts = 4;
  else pts = 2;
  return Math.min(pts, maxPts);
}

// Registrar vista (incrementa contador si no respondió aún)
async function registrarVista(uid, preguntaId) {
  try {
    await prepare(`
      INSERT INTO trivia_vistas (usuario_id, pregunta_id, vistas)
      VALUES ($1, $2, 1)
      ON CONFLICT (usuario_id, pregunta_id) DO UPDATE SET vistas = trivia_vistas.vistas + 1
    `).run(uid, preguntaId);
  } catch (_) {}
}

async function getVistas(uid, preguntaId) {
  try {
    const r = await prepare('SELECT vistas FROM trivia_vistas WHERE usuario_id=$1 AND pregunta_id=$2').get(uid, preguntaId);
    return r ? parseInt(r.vistas) : 0;
  } catch (_) { return 0; }
}

// Seed — llamado desde server.js después de initSchema()
async function seedTrivia() {
  try {
    const count = await prepare('SELECT COUNT(*) AS c FROM trivia_preguntas').get();
    if (parseInt(count.c) > 0) return;
    const preguntas = require('../data/trivia-preguntas');
    for (const p of preguntas) {
      await prepare(`
        INSERT INTO trivia_preguntas (orden, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, correcta, mundial)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (orden) DO NOTHING
      `).run(p.orden, p.pregunta, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.correcta, p.mundial);
    }
    console.log('[trivia] 50 preguntas cargadas');
  } catch (e) { console.error('[trivia] Error seed:', e.message); }
}

// GET /trivia/hoy — datos para el popup del dashboard (no incrementa vistas)
router.get('/hoy', requireLogin, async (req, res) => {
  try {
    const uid     = req.session.usuario.id;
    const orden   = ordenDelDia();
    const pregunta = await prepare('SELECT * FROM trivia_preguntas WHERE orden=$1').get(orden);
    if (!pregunta) return res.json({ ok: false });
    const respondio = await prepare('SELECT id FROM trivia_respuestas WHERE usuario_id=$1 AND pregunta_id=$2').get(uid, pregunta.id);
    res.json({ ok: true, pendiente: !respondio, pregunta_id: pregunta.id });
  } catch (e) { res.json({ ok: false }); }
});

// GET /trivia — página completa, registra vista si no respondió
router.get('/', requireLogin, async (req, res) => {
  try {
    const uid   = req.session.usuario.id;
    const orden = ordenDelDia();

    const pregunta = await prepare('SELECT * FROM trivia_preguntas WHERE orden=$1').get(orden);
    if (!pregunta) return res.render('trivia', { title: 'Trivia Mundial', pregunta: null, respuesta: null, ranking: [], uid, vistas: 0, maxPts: 10, tiempoMax: TIEMPO_MAX, orden: 0 });

    const respuesta = await prepare('SELECT * FROM trivia_respuestas WHERE usuario_id=$1 AND pregunta_id=$2').get(uid, pregunta.id);

    let vistas = await getVistas(uid, pregunta.id);

    // Registrar vista solo si no respondió aún
    if (!respuesta) {
      await registrarVista(uid, pregunta.id);
      vistas = vistas + 1;
    }

    const maxPts = maxPtsPorVistas(vistas);

    const ranking = await prepare(`
      SELECT u.username, u.id,
        COALESCE(SUM(tr.puntos), 0) AS pts_trivia,
        COUNT(CASE WHEN tr.correcta THEN 1 END) AS aciertos,
        COUNT(tr.id) AS respondidas,
        ROUND(AVG(CASE WHEN tr.correcta THEN tr.segundos_empleados END), 1) AS avg_segundos
      FROM usuarios u
      LEFT JOIN trivia_respuestas tr ON tr.usuario_id = u.id
      GROUP BY u.id, u.username
      HAVING COUNT(tr.id) > 0
      ORDER BY pts_trivia DESC, aciertos DESC, avg_segundos ASC NULLS LAST
    `).all();

    res.render('trivia', {
      title: 'Trivia Mundial',
      pregunta,
      respuesta: respuesta || null,
      ranking,
      uid,
      vistas,
      maxPts,
      tiempoMax: TIEMPO_MAX,
      orden,
    });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// POST /trivia/responder
router.post('/responder', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;
    const { pregunta_id, respuesta, segundos } = req.body;

    const pregunta = await prepare('SELECT * FROM trivia_preguntas WHERE id=$1').get(pregunta_id);
    if (!pregunta) return res.json({ ok: false, msg: 'Pregunta no encontrada' });

    const yaRespondio = await prepare('SELECT id FROM trivia_respuestas WHERE usuario_id=$1 AND pregunta_id=$2').get(uid, pregunta_id);
    if (yaRespondio) return res.json({ ok: false, msg: 'Ya respondiste esta pregunta' });

    const vistas  = await getVistas(uid, pregunta_id);
    const maxPts  = maxPtsPorVistas(Math.max(vistas, 1));
    const segs    = Math.min(parseFloat(segundos) || TIEMPO_MAX, TIEMPO_MAX);
    const esCorrecta = respuesta === pregunta.correcta;
    const puntos  = esCorrecta ? calcularPuntos(segs, maxPts) : 0;

    await prepare(`
      INSERT INTO trivia_respuestas (usuario_id, pregunta_id, respuesta, correcta, segundos_empleados, puntos)
      VALUES ($1,$2,$3,$4,$5,$6)
    `).run(uid, pregunta.id, respuesta || null, esCorrecta, segs, puntos);

    res.json({ ok: true, correcta: esCorrecta, respuesta_correcta: pregunta.correcta, puntos, segundos: segs, maxPts });
  } catch (e) { console.error(e); res.json({ ok: false, msg: e.message }); }
});

module.exports = router;
module.exports.seedTrivia = seedTrivia;
