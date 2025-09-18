// ilsapore-pos-backend/server.js

const express = require('express');
const cors = require('cors');
require('dotenv').config(); 
const http = require('http');
const { Server } = require("socket.io");
const { expressjwt: jwt } = require('express-jwt');

// --- ¡NUEVO! Importamos el cliente de Supabase ---
const { createClient } = require('@supabase/supabase-js'); 

const app = express();

const corsOptions = {
  origin: "*", // Simplificado para desarrollo, ajustar en producción
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
};
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// --- Configuración de Supabase (para el webhook de PayPhone) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

// URLs de redirección para PayPhone (desde .env del backend)
const PAYPHONE_RESPONSE_URL = process.env.PAYPHONE_RESPONSE_URL;
const PAYPHONE_CANCELLATION_URL = process.env.PAYPHONE_CANCELLATION_URL;
// const PAYPHONE_WEBHOOK_SECRET = process.env.PAYPHONE_WEBHOOK_SECRET; // Descomentar si PayPhone lo usa y lo configuras

// Middleware
app.use(cors(corsOptions));
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(express.json()); // Middleware para parsear JSON en el body de las solicitudes

// --- Middleware de Autenticación JWT ---
const authenticateJwt = jwt({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"]
});


// --- RUTAS PÚBLICAS Y DE WEBHOOK DE PAYPHONE (NO PROTEGIDAS POR JWT) ---

// Tu router para rutas públicas existentes
const publicRouter = express.Router();
require('./routes/public')(publicRouter); // Asumo que routes/public.js define tu app.post('/api/login', ...)
app.use('/api', publicRouter);

// --- ¡NUEVO! Endpoint para el Webhook de PayPhone (POST) ---
// Este endpoint DEBE ser público para que PayPhone pueda enviarle notificaciones.
app.post('/api/payphone-webhook', async (req, res) => {
    const payload = req.body;
    console.log('Webhook de PayPhone recibido:', JSON.stringify(payload, null, 2));

    // --- Validación de seguridad del webhook (OPCIONAL pero RECOMENDADO) ---
    // Si PayPhone proporciona un secreto de webhook y lo configuraste, lo verificarías aquí.
    // Ejemplo:
    // const signature = req.headers['x-payphone-signature']; // Verifica el nombre del header en la doc de PayPhone
    // if (PAYPHONE_WEBHOOK_SECRET && !verifyPayphoneSignature(payload, signature, PAYPHONE_WEBHOOK_SECRET)) {
    //     console.warn('Webhook de PayPhone recibido con firma inválida.');
    //     return res.status(403).send('Invalid webhook signature');
    // }

    const clientTxToken = payload.ClientTransactionId; // <<< CORREGIDO: 'ClientTransactionId' con mayúsculas
    const payphoneTransactionId = payload.id; // ID de transacción que PayPhone nos da en el webhook
    const payphoneStatus = payload.StatusCode; // <<< CORREGIDO: 'StatusCode' con mayúsculas 'S' y 'C'
    const payphoneMessage = payload.message; // Mensaje de PayPhone

    if (!clientTxToken) {
        console.error('Webhook de PayPhone recibido sin clientTransactionId. Ignorando.');
        return res.status(400).send('Missing clientTransactionId');
    }

    try {
        let newStatus = 'PAYPHONE_UNKNOWN'; // Estado por defecto
        if (payphoneStatus === 3) { // 3 = Aprobado
            newStatus = 'PAYPHONE_CONFIRMED';
        } else if (payphoneStatus === 2) { // 2 = Rechazado (Verificar doc PayPhone para otros estados como 2-Pendiente)
            newStatus = 'PAYPHONE_REJECTED';
        } else {
            newStatus = `PAYPHONE_STATUS_${payphoneStatus}`; // Para otros estados intermedios/desconocidos
        }

        // Actualizar el estado de la transacción en Supabase
        const { data, error } = await supabase
            .from('pending_transfers')
            .update({ 
                status: newStatus,
                payphone_transaction_id: payphoneTransactionId, // Guardar el ID de transacción de PayPhone
                updated_at: new Date().toISOString(),
                payphone_webhook_payload: payload // OPCIONAL: Guarda el payload completo para depuración
            })
            .eq('id', clientTxToken); // Buscar por nuestro clientTransactionId

        if (error) {
            console.error('Error al actualizar estado de PayPhone en Supabase:', error);
            // Aunque hubo un error en Supabase, debemos responder OK a PayPhone para que no reintente el webhook indefinidamente
            return res.status(500).send('Error updating transaction status in Supabase');
        }

        console.log(`Transacción PayPhone ID ${clientTxToken} actualizada a ${newStatus} en Supabase.`);
        res.status(200).send('OK'); // ¡Siempre responder OK a PayPhone para evitar reintentos!

    } catch (error) {
        console.error('Error procesando webhook de PayPhone:', error);
        res.status(500).send('Internal Server Error while processing webhook');
    }
});

// --- ¡NUEVO! Rutas de redirección de PayPhone (GET) para el navegador del cliente ---
// Estas también deben ser públicas.
app.get('/payphone/success', (req, res) => {
    // Aquí puedes mostrar un mensaje amigable al cliente.
    // El bot ya habrá sido notificado via webhook y Supabase Realtime.
    res.send('<h1>¡Pago procesado exitosamente!</h1><p>Gracias por tu compra. Recibirás la confirmación de tu pedido por WhatsApp en breve.</p>');
});

app.get('/payphone/cancel', (req, res) => {
    res.send('<h1>Pago cancelado.</h1><p>Tu pago ha sido cancelado o no se completó. Si necesitas ayuda, contáctanos por WhatsApp.</p>');
});


// --- APLICACIÓN DEL MIDDLEWARE JWT A RUTAS PROTEGIDAS ---
// Cualquier ruta definida DESPUÉS de esta línea, que empiece con /api, estará protegida por JWT.
app.use('/api', authenticateJwt);

// Usamos el router principal para las rutas protegidas.
const protectedRouter = express.Router();
require('./routes/protected')(protectedRouter); 
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
  console.log(`🚀 Backend de Il Sapore POS corriendo en puerto ${PORT}`);
});