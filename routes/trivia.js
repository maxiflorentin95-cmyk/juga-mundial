const router = require('express').Router();
const { prepare, pool } = require('../db');
const { requireLogin } = require('../middleware/auth');

// El Mundial 2026 empieza el 11 de junio — día 1 = pregunta 1
const INICIO = new Date('2026-06-11T00:00:00-03:00');
const TIEMPO_MAX = 25;

function ordenDelDia() {
  const hoyPY = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dias = Math.floor((hoyPY - INICIO) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(dias + 1, 50));
}

function calcularPuntos(segundos) {
  if (segundos <= 5)  return 10;
  if (segundos <= 10) return 8;
  if (segundos <= 15) return 6;
  if (segundos <= 20) return 4;
  return 2;
}

// Seed — se llama desde server.js después de initSchema()
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
module.exports.seedTrivia = seedTrivia;

// GET /trivia
router.get('/', requireLogin, async (req, res) => {
  try {
    const uid   = req.session.usuario.id;
    const orden = ordenDelDia();

    const pregunta = await prepare('SELECT * FROM trivia_preguntas WHERE orden=$1').get(orden);
    if (!pregunta) return res.render('trivia', { title: 'Trivia', pregunta: null, respuesta: null, ranking: [] });

    const respuesta = await prepare(
      'SELECT * FROM trivia_respuestas WHERE usuario_id=$1 AND pregunta_id=$2'
    ).get(uid, pregunta.id);

    // Ranking trivia
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

    // Una sola respuesta por día
    const yaRespondio = await prepare(
      'SELECT id FROM trivia_respuestas WHERE usuario_id=$1 AND pregunta_id=$2'
    ).get(uid, pregunta_id);
    if (yaRespondio) return res.json({ ok: false, msg: 'Ya respondiste esta pregunta' });

    const segs = Math.min(parseFloat(segundos) || TIEMPO_MAX, TIEMPO_MAX);
    const esCorrecta = respuesta === pregunta.correcta;
    const puntos = esCorrecta ? calcularPuntos(segs) : 0;

    await prepare(`
      INSERT INTO trivia_respuestas (usuario_id, pregunta_id, respuesta, correcta, segundos_empleados, puntos)
      VALUES ($1,$2,$3,$4,$5,$6)
    `).run(uid, pregunta.id, respuesta || null, esCorrecta, segs, puntos);

    res.json({
      ok: true,
      correcta: esCorrecta,
      respuesta_correcta: pregunta.correcta,
      puntos,
      segundos: segs,
    });
  } catch (e) { console.error(e); res.json({ ok: false, msg: e.message }); }
});

module.exports = router;
