// backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config(); 
const http = require('http'); // Módulo nativo de Node.js
const { Server } = require("socket.io"); // Importamos el servidor de Socket.IO

const apiRoutes = require('./routes');
const app = express();

// Creamos un servidor HTTP a partir de nuestra app de Express
const server = http.createServer(app);

// Creamos una instancia del servidor de Socket.IO y le permitimos
// recibir conexiones desde cualquier origen (nuestro frontend)
const io = new Server(server, {
  cors: {
    origin: "*", // En producción, deberías restringir esto a la URL de tu Vercel
    methods: ["GET", "POST"]
  }
});

// Middleware para hacer 'io' accesible desde las rutas
// Así, podemos emitir eventos desde nuestros endpoints de la API
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middlewares de Express
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

// Lógica de Socket.IO
io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Un usuario se ha desconectado:', socket.id);
  });
});


const PORT = process.env.PORT || 4000;
// ¡IMPORTANTE! Ahora iniciamos 'server', no 'app'.
server.listen(PORT, () => {
  console.log(`Servidor y WebSocket corriendo en el puerto ${PORT}`);
});