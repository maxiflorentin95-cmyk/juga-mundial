function requireLogin(req, res, next) {
  if (!req.session.usuario) return res.redirect('/');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.usuario) return res.redirect('/');
  if (!req.session.usuario.es_admin) return res.redirect('/dashboard');
  next();
}

module.exports = { requireLogin, requireAdmin };
