const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dataDir = process.env.DATA_DIR || __dirname;
app.use(session({
  secret: process.env.SESSION_SECRET || 'juga-mundial-2026-s3cr3t-k3y',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`⚽ JUGA Mundial 2026 corriendo en http://localhost:${PORT}`);
});
