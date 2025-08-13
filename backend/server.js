// backend/server.js

const express = require('express');
const cors = require('cors');
require('dotenv').config(); 
const http = require('http');
const { Server } = require("socket.io");
// --- ¡NUEVO! Importamos el middleware de JWT ---
const { expressjwt: jwt } = require('express-jwt');

const apiRoutes = require('./routes1');
const app = express();

const corsOptions = {
  origin: "*", // Simplificado para desarrollo, ajustar en producción
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
};
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(express.json());

// --- ¡NUEVO! Middleware de Autenticación JWT ---
// Esta función protegerá TODAS las rutas que vengan después de ella.
// Extraerá el token del encabezado 'Authorization: Bearer TOKEN'
// y lo decodificará. Si el token es válido, añadirá un objeto 'req.auth'
// con la información del usuario (id, rol, ubicacion_id).
// Si el token es inválido o no existe, devolverá un error 401 Unauthorized.
const authenticateJwt = jwt({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"]
});

// La ruta de login NO debe estar protegida, así que la definimos ANTES del middleware.
// Usamos un "router" separado para las rutas públicas.
const publicRouter = express.Router();
require('./routes/public')(publicRouter); // Creamos un nuevo archivo para las rutas públicas
app.use('/api', publicRouter);

// Aplicamos el middleware de autenticación a todas las rutas de la API que vengan después.
app.use('/api', authenticateJwt);

// Usamos el router principal para las rutas protegidas.
const protectedRouter = express.Router();
require('./routes/protected')(protectedRouter); // Creamos un nuevo archivo para las rutas protegidas
app.use('/api', protectedRouter);

// Manejador de errores para JWT (si un token es inválido)
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('Token inválido o expirado.');
  } else {
    next(err);
  }
});


io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado:', socket.id);
  socket.on('disconnect', () => { console.log('Un usuario se ha desconectado:', socket.id); });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor y WebSocket corriendo en el puerto ${PORT}`);
});