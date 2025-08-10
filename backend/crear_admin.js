// backend/crear_admin.js
const bcrypt = require('bcryptjs');
const db = require('./db');

const username = 'admin'; // Elige tu nombre de usuario
const password = 'johnpeter1983'; // Elige una contraseña fuerte

const salt = bcrypt.genSaltSync(10);
const password_hash = bcrypt.hashSync(password, salt);

const query = 'INSERT INTO usuarios (username, password_hash) VALUES ($1, $2) RETURNING *';

db.query(query, [username, password_hash])
  .then(res => {
    console.log('Usuario administrador creado:', res.rows[0]);
    // Es importante cerrar el pool de conexión cuando el script termina
    const { Pool } = require('pg');
    const pool = new Pool();
    pool.end();
  })
  .catch(err => {
    console.error('Error al crear el usuario:', err);
  });