const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, initSchema, prepare } = require('./db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'juga-mundial-2026-s3cr3t-k3y',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  next();
});

app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/grupos', require('./routes/grupos'));
app.use('/pronosticos', require('./routes/pronosticos'));
app.use('/ranking', require('./routes/ranking'));
app.use('/admin', require('./routes/admin'));

async function start() {
  try {
    console.log('🔌 Conectando a base de datos...');
    await initSchema();
    console.log('✅ Schema OK');

    // Seed automático si la DB está vacía
    const row = await prepare('SELECT COUNT(*) AS c FROM equipos').get();
    const count = parseInt(row?.c ?? row?.count ?? 0);
    if (count === 0) {
      console.log('🌱 Ejecutando seed...');
      await require('./seed').run();
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`⚽ JUGA Mundial 2026 en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar:', err.message);
    process.exit(1);
  }
}

start();
