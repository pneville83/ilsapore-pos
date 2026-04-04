require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("ERROR: Faltan variables de entorno de Supabase en .env. Asegúrate de que SUPABASE_URL y SUPABASE_ANON_KEY estén definidos.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('TEST REALTIME: Intentando conectar a Supabase Realtime...');

supabase
    .channel('any_channel_name') // Un nombre de canal cualquiera
    .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'pending_transfers' 
    }, (payload) => {
        console.log('--- TEST REALTIME: EVENTO DE SUPABASE RECIBIDO ---');
        console.log('TEST REALTIME: Payload:', payload);
        console.log('---------------------------------------------');
    })
    .on('error', (err) => { // <<< AÑADIDO: Listener de errores de canal
        console.error('TEST REALTIME: Error de canal de Supabase Realtime:', err);
    })
    .subscribe((status, err) => {
        console.log('TEST REALTIME: Estado de la suscripción Realtime:', status);
        if (err) console.error('TEST REALTIME: Error en la suscripción Realtime:', err);
        if (status === 'SUBSCRIBED') {
            console.log('TEST REALTIME: ¡Conectado y suscrito a Supabase Realtime!');
            console.log('TEST REALTIME: Ahora, haz un cambio manual en la tabla `pending_transfers` en Supabase (ej. cambia un campo de una fila existente) para ver si se reciben los eventos.');
        } else if (status === 'CHANNEL_ERROR') {
            console.error('TEST REALTIME: El canal de Realtime ha experimentado un error (CHANNEL_ERROR).');
        } else if (status === 'TIMED_OUT') {
             console.warn('TEST REALTIME: La conexión al canal de Realtime ha excedido el tiempo de espera (TIMED_OUT).');
        } else if (status === 'CLOSED') {
             console.log('TEST REALTIME: La conexión al canal de Realtime ha sido cerrada (CLOSED).');
        }
    });

// Mantener el proceso vivo para que la suscripción Realtime funcione.
// Lo mantenemos activo durante un tiempo prolongado para la depuración.
setInterval(() => {}, 1000 * 60 * 60); // Mantiene el proceso vivo por 1 hora