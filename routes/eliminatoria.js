const router = require('express').Router();
const { prepare } = require('../db');
const { requireLogin } = require('../middleware/auth');

function estaCerrado(fecha, hora) {
  return new Date() >= new Date(`${fecha}T${hora}:00-03:00`);
}

const FASES = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'tercer_puesto', 'final'];
const FASE_LABEL = {
  dieciseisavos: '16avos de Final',
  octavos: 'Octavos de Final',
  cuartos: 'Cuartos de Final',
  semifinal: 'Semifinales',
  tercer_puesto: 'Tercer Puesto',
  final: 'Gran Final',
};

router.get('/', requireLogin, async (req, res) => {
  try {
    const uid = req.session.usuario.id;

    const partidos = await prepare(`
      SELECT p.*, el.nombre AS local_nombre, el.bandera AS local_bandera, el.nombre_corto AS local_corto,
             ev.nombre AS visit_nombre, ev.bandera AS visit_bandera, ev.nombre_corto AS visit_corto
      FROM partidos p
      JOIN equipos el ON p.equipo_local_id = el.id
      JOIN equipos ev ON p.equipo_visitante_id = ev.id
      WHERE p.fase != 'grupos'
      ORDER BY ARRAY_POSITION(ARRAY['dieciseisavos','octavos','cuartos','semifinal','tercer_puesto','final']::text[], p.fase), p.fecha, p.hora
    `).all();

    if (partidos.length === 0) {
      return res.render('eliminatoria', {
        title: 'Fase Eliminatoria',
        fases: [], porFase: {}, FASE_LABEL, sinPartidos: true,
      });
    }

    const prons = await prepare('SELECT * FROM pronosticos WHERE usuario_id=$1').all(uid);
    const pronMap = {};
    prons.forEach(p => (pronMap[p.partido_id] = p));

    const lista = partidos.map(p => ({
      ...p,
      cerrado: estaCerrado(p.fecha, p.hora),
      pronostico: pronMap[p.id] || null,
    }));

    const porFase = {};
    lista.forEach(p => {
      if (!porFase[p.fase]) porFase[p.fase] = [];
      porFase[p.fase].push(p);
    });
    const fases = FASES.filter(f => porFase[f]);

    res.render('eliminatoria', { title: 'Fase Eliminatoria', fases, porFase, FASE_LABEL, sinPartidos: false });
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

module.exports = router;
