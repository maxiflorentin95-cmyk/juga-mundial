const { prepare } = require('../db');

// Inyecta en res.locals el conteo de partidos próximos sin pronóstico del usuario logueado
module.exports = async function badgeMiddleware(req, res, next) {
  res.locals.sinPronosticar = 0;
  if (!req.session?.usuario?.id) return next();
  try {
    const uid = req.session.usuario.id;
    // Solo partidos de HOY (hora Paraguay UTC-3) que aún no empezaron y no tienen pronóstico
    const hoyPY = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = await prepare(`
      SELECT COUNT(*) AS c FROM partidos p
      WHERE p.fecha = $2
        AND (p.fecha || 'T' || p.hora || ':00-03:00')::timestamptz > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM pronosticos pr WHERE pr.partido_id = p.id AND pr.usuario_id = $1
        )
    `).get(uid, hoyPY);
    res.locals.sinPronosticar = parseInt(row?.c ?? 0);
  } catch (_) { /* silencioso */ }
  next();
};
