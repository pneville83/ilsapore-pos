// backend/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  
  // --- ¡AÑADIDO IMPORTANTE! ---
  // Habilita SSL para conexiones a bases de datos en la nube.
  // 'rejectUnauthorized: false' es una configuración simple para empezar.
  // Para producción de alta seguridad, se usarían certificados específicos.
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};