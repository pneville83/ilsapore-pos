// backend/routes/public.js

// --- ¡CORRECCIÓN! Usamos '../db' para subir un nivel de carpeta ---
const db = require('../db');
const bcrypt = require('bcryptjs');
const jsonwebtoken = require('jsonwebtoken');

module.exports = function(router) {
  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { rows } = await db.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        if (rows.length === 0) {
            return res.status(401).send('Usuario o contraseña incorrectos');
        }
        const user = rows[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password_hash);
        if (!passwordIsValid) {
            return res.status(401).send('Usuario o contraseña incorrectos');
        }
        const payload = {
            id: user.id,
            rol: user.rol,
            ubicacion_id: user.ubicacion_id
        };
        const token = jsonwebtoken.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '24h'
        });
        res.status(200).send({
            message: 'Login exitoso',
            token: token,
            user: payload
        });
    } catch (err) {
        console.error("Error en la ruta de login:", err);
        res.status(500).send('Error interno del servidor');
    }
  });
  return router;
};