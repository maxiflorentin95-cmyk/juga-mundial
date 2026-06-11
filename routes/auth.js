const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { prepare } = require('../db');

router.get('/', (req, res) => {
  if (req.session.usuario) return res.redirect('/dashboard');
  res.render('login', { title: 'Iniciar Sesión', error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prepare('SELECT * FROM usuarios WHERE username=$1 OR email=$2').get(username, username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.render('login', { title: 'Iniciar Sesión', error: 'Usuario o contraseña incorrectos' });
    }
    req.session.usuario = {
      id: user.id, username: user.username, email: user.email,
      es_admin: user.es_admin, puntos_total: user.puntos_total
    };
    res.redirect('/dashboard');
  } catch (e) {
    console.error('LOGIN ERROR:', e.message);
    res.render('login', { title: 'Iniciar Sesión', error: 'Error del servidor: ' + e.message });
  }
});

router.get('/register', (req, res) => {
  if (req.session.usuario) return res.redirect('/dashboard');
  res.render('register', { title: 'Registrarse', error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, password2 } = req.body;
    if (!username || !email || !password)
      return res.render('register', { title: 'Registrarse', error: 'Completá todos los campos' });
    if (password !== password2)
      return res.render('register', { title: 'Registrarse', error: 'Las contraseñas no coinciden' });
    if (password.length < 6)
      return res.render('register', { title: 'Registrarse', error: 'La contraseña debe tener al menos 6 caracteres' });

    const exists = await prepare('SELECT id FROM usuarios WHERE username=$1 OR email=$2').get(username, email);
    if (exists)
      return res.render('register', { title: 'Registrarse', error: 'El usuario o email ya está en uso' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await prepare('INSERT INTO usuarios (username, email, password_hash) VALUES ($1,$2,$3)').run(username, email, hash);
    req.session.usuario = { id: result.lastInsertRowid, username, email, es_admin: 0, puntos_total: 0 };
    res.redirect('/dashboard');
  } catch (e) {
    console.error('REGISTER ERROR:', e.message);
    res.render('register', { title: 'Registrarse', error: 'Error: ' + e.message });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
