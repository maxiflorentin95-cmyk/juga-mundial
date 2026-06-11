// start.js – entry point para producción
const { initSchema, prepare } = require('./db');

async function main() {
  console.log('🔌 Conectando a PostgreSQL...');
  await initSchema();
  console.log('✅ Schema listo');

  // Si no hay equipos, hacer el seed automáticamente
  const row = await prepare('SELECT COUNT(*) AS c FROM equipos').get();
  const count = parseInt(row?.c ?? row?.count ?? 0);
  if (count === 0) {
    console.log('🌱 Base de datos vacía, ejecutando seed...');
    await require('./seed').run();
  }

  require('./server');
}

main().catch(err => {
  console.error('Error iniciando servidor:', err);
  process.exit(1);
});
