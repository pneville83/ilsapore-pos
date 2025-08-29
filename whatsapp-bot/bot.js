// whatsapp-bot/bot.js

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Cargar variables de entorno desde .env

// --- Configuración desde .env ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const POS_API_BASE_URL = process.env.POS_API_BASE_URL;
const POS_LOGIN_ENDPOINT = process.env.POS_LOGIN_ENDPOINT;
const POS_USERNAME = process.env.POS_USERNAME;
const POS_PASSWORD = process.env.POS_PASSWORD;
const NUMERO_GESTION_CUENTAS = process.env.NUMERO_GESTION_CUENTAS;

// --- Verificaciones de configuración críticas ---
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !POS_API_BASE_URL || !POS_LOGIN_ENDPOINT || !POS_USERNAME || !POS_PASSWORD || !NUMERO_GESTION_CUENTAS) {
    console.error("ERROR: Faltan variables de entorno cruciales. Por favor, verifica tu archivo .env");
    process.exit(1); // Detener el bot si la configuración es incompleta
}

// --- Inicialización de Supabase Client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Manejo Dinámico del AUTH_TOKEN para Il Sapore POS API ---
let currentAuthToken = null;

// Función para obtener/refrescar el token
async function loginAndGetToken() {
    try {
        console.log('Intentando obtener nuevo token de autenticación para Il Sapore POS...');
        const response = await axios.post(`${POS_API_BASE_URL}${POS_LOGIN_ENDPOINT}`, {
            username: POS_USERNAME,
            password: POS_PASSWORD
        });
        currentAuthToken = response.data.token;
        console.log('Token de autenticación para Il Sapore POS obtenido exitosamente.');
        return currentAuthToken;
    } catch (error) {
        console.error('Error al iniciar sesión y obtener token de Il Sapore POS:', error.response?.data || error.message);
        throw new Error('No se pudo autenticar con Il Sapore POS. Verifica POS_USERNAME y POS_PASSWORD en .env');
    }
}

// Inicializar Axios con un interceptor para manejar el token y el refresco
const apiClient = axios.create({
    baseURL: POS_API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

// Interceptor para añadir el token a las solicitudes
apiClient.interceptors.request.use(
    async config => {
        if (!currentAuthToken) {
            await loginAndGetToken(); // Intentar obtener el token si no existe
        }
        config.headers['Authorization'] = `Bearer ${currentAuthToken}`;
        return config;
    },
    error => Promise.reject(error)
);

// Interceptor para refrescar el token en caso de 401 (Unauthorized)
apiClient.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            console.warn('Token de Il Sapore POS expirado o inválido. Intentando refrescar...');
            try {
                const newToken = await loginAndGetToken();
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                return apiClient(originalRequest); // Reintentar la solicitud original con el nuevo token
            } catch (refreshError) {
                console.error('Fallo al refrescar el token de Il Sapore POS:', refreshError.message);
                return Promise.reject(refreshError); // Si falla el refresco, rechazar
            }
        }
        return Promise.reject(error);
    }
);

const conversations = {}; // Almacena el estado de las conversaciones con los clientes

// --- Cargamos los datos de los bancos al iniciar ---
// Asumiendo que 'bancos.json' existe y es válido
const datosBancarios = JSON.parse(fs.readFileSync('bancos.json', 'utf8'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
    console.log('✅ ¡El bot de Il Sapore está en línea!');
    try {
        await loginAndGetToken(); // Obtener el token al iniciar el bot
    } catch (error) {
        console.error('No se pudo obtener el token de autenticación de Il Sapore POS al iniciar. Algunas funcionalidades podrían no operar.', error);
        // Dependiendo de la criticidad, podrías decidir si el bot debe continuar o no.
        // process.exit(1); // Descomentar para detener el bot si la autenticación inicial falla
    }
});

client.on('message', async (message) => {
    const from = message.from; // Número de WhatsApp del remitente
    const content = message.body ? message.body.toLowerCase().trim() : ''; // Contenido del mensaje

    // Para depuración
    console.log(`Mensaje de ${from}: "${content}" (Estado PREVIO: ${conversations[from]?.estado || 'INICIO'})`);

    // --- LÓGICA PARA EL NÚMERO DE GESTIÓN DE CUENTAS ---
    if (from === NUMERO_GESTION_CUENTAS) {
        // Expresión regular para capturar el ID después de "confirmar " o "problema "
        // y opcionalmente después de "TRF-"
        const confirmMatch = content.match(/confirmar\s+(?:trf-)?([a-z0-9]{4})/); // Aseguramos 4 caracteres alfanuméricos
        const problemMatch = content.match(/problema\s+(?:trf-)?([a-z0-9]{4})/); // Aseguramos 4 caracteres alfanuméricos

        if (confirmMatch && confirmMatch[1]) {
            const tempOrderId = confirmMatch[1].toUpperCase(); // Convertir a mayúsculas para consistencia
            await processTransferConfirmation(tempOrderId, true); // true = confirmado
        } else if (problemMatch && problemMatch[1]) {
            const tempOrderId = problemMatch[1].toUpperCase(); // Convertir a mayúsculas para consistencia
            await processTransferConfirmation(tempOrderId, false); // false = con problema
        } else {
            await client.sendMessage(from, 'Comando no reconocido. Usa "CONFIRMAR TRF-[ID]" o "PROBLEMA TRF-[ID]". El ID debe ser de 4 caracteres alfanuméricos.');
        }
        return; // Detenemos el procesamiento para este mensaje, ya fue manejado por el equipo de cuentas
    }

    // --- LÓGICA NORMAL DEL BOT PARA CLIENTES ---
    let convoState = conversations[from] || { estado: 'INICIO', carrito: [] };

    // --- MANEJO DE COMANDOS GLOBALES DE INICIO/REINICIO ---
    const resetKeywords = ['hola', 'cancelar', 'noches', 'pedido', 'quiero', 'veci', 'inicio', 'buenas']; // Palabras clave para reiniciar la conversación
    
    // Antiguo: if (resetKeywords.includes(content)) {
    // Nuevo:
    const shouldResetConversation = resetKeywords.some(keyword => content.includes(keyword));

    if (shouldResetConversation) {
        const welcomeMessage = '¡Hola! 👋 Bienvenido a Il Sapore.\n\nEscribe *menu* para ver nuestras opciones y empezar tu pedido. 🍔';
        await client.sendMessage(from, welcomeMessage);
        convoState = { estado: 'INICIO', carrito: [] }; // Reiniciamos completamente la conversación y el carrito
        conversations[from] = convoState;
        return; // Salimos después de enviar el mensaje de bienvenida y reiniciar
    }

    // --- MANEJO DEL COMANDO 'menu' (se mantiene como estaba) ---
    // Antiguo: if (content === 'menu') {
    // Nuevo:
    if (content.includes('menu')) { // Ahora busca 'menu' dentro de la frase
        try {
            const response = await apiClient.get('/productos/disponibles');
            const productos = response.data;
            const categoriasExcluidas = 'adicionales';
            const categorias = [...new Set(productos.map(p => p.categoria))].filter(cat => !categoriasExcluidas.includes(cat.toLowerCase()));
            convoState = { ...convoState, productosDisponibles: productos, categoriasDisponibles: categorias, estado: 'VIENDO_CATEGORIAS' };
            let categoryMessage = '*Nuestro Menú por Categorías:*\n\n';
            categorias.forEach((cat, index) => { categoryMessage += `${index + 1}. *${cat}*\n`; });
            categoryMessage += '\nPor favor, responde con el *número* de la categoría que deseas ver.';
            await client.sendMessage(from, categoryMessage);
        } catch (error) {
             console.error("Error al cargar el menú:", error.response?.data || error.message);
             await client.sendMessage(from, 'Lo siento, no pude cargar el menú en este momento. Intenta más tarde.');
        }
        conversations[from] = convoState;
        return;
    }
    

    if (content === 'finalizar' && convoState.carrito && convoState.carrito.length > 0) {
        convoState.estado = 'PIDIENDO_DIRECCION_MZ';
        await client.sendMessage(from, '¡Perfecto! Para completar tu pedido, por favor, indícame el número de tu *manzana* (Mz).');
        conversations[from] = convoState;
        return;
    }

    // --- LÓGICA BASADA EN EL ESTADO ACTUAL ---
    switch (convoState.estado) {
        case 'VIENDO_CATEGORIAS': {
            const categorias = convoState.categoriasDisponibles;
            const num = parseInt(content);
            let categoriaSeleccionada = null;
            if (!isNaN(num) && num > 0 && num <= categorias.length) {
                categoriaSeleccionada = categorias[num - 1];
            }
            if (categoriaSeleccionada) {
                const productosDeCategoria = convoState.productosDisponibles.filter(p => p.categoria === categoriaSeleccionada);
                convoState.productosMostrados = productosDeCategoria;
                let productMessage = `*${categoriaSeleccionada}:*\n\n`;
                productosDeCategoria.forEach((p, index) => {
                    productMessage += `${index + 1}. *${p.nombre}*`;
                    if (p.variaciones && p.variaciones.length > 0) {
                        productMessage += ` _(Varios tamaños)_\n`;
                    } else {
                        productMessage += ` - *$${parseFloat(p.precio).toFixed(2)}*\n`;
                    }
                });
                productMessage += `\nPara ordenar, responde con el *número* del producto (ej: "1").\n\nPara volver a ver las categorías, escribe *menu*.`;
                await client.sendMessage(from, productMessage);
                convoState.estado = 'VIENDO_PRODUCTOS';
            } else {
                await client.sendMessage(from, 'Opción no válida. Por favor, elige un número de la lista de categorías.');
            }
            break;
        }

        case 'VIENDO_PRODUCTOS': {
            const num = parseInt(content);
            if (isNaN(num) || num <= 0 || !convoState.productosMostrados || num > convoState.productosMostrados.length) {
                await client.sendMessage(from, 'Opción no válida. Por favor, elige un número de la lista de productos o escribe *menu*.');
                break;
            }
            const productoSeleccionado = convoState.productosMostrados[num - 1];
            convoState.productoTemporal = productoSeleccionado;
            if (productoSeleccionado.variaciones && productoSeleccionado.variaciones.length > 0) {
                let variationMessage = `*${productoSeleccionado.nombre}* tiene las siguientes *opciones*:\n\n`;
                productoSeleccionado.variaciones.forEach((v, index) => {
                    variationMessage += `${index + 1}. *${v.nombre_variacion}* - *$${parseFloat(v.precio).toFixed(2)}*\n`;
                });
                variationMessage += '\nPor favor, responde con el *número* de la *opción* que deseas.';
                await client.sendMessage(from, variationMessage);
                convoState.estado = 'SELECCIONANDO_VARIACION';
            } else {
                await client.sendMessage(from, `¿Cuántas unidades de *${productoSeleccionado.nombre}* deseas añadir?`);
                convoState.estado = 'PIDIENDO_CANTIDAD';
            }
            break;
        }

        case 'SELECCIONANDO_VARIACION': {
            const num = parseInt(content);
            const variaciones = convoState.productoTemporal.variaciones;
            if (isNaN(num) || num <= 0 || num > variaciones.length) {
                await client.sendMessage(from, 'Opción no válida. Por favor, elige un número de la lista de *opciones*.');
                break;
            }
            const variacionSeleccionada = variaciones[num - 1];
            convoState.productoTemporal.variacionSeleccionada = variacionSeleccionada;
            await client.sendMessage(from, `¿Cuántas unidades de *${convoState.productoTemporal.nombre} (${variacionSeleccionada.nombre_variacion})* deseas añadir?`);
            convoState.estado = 'PIDIENDO_CANTIDAD';
            break;
        }

        case 'PIDIENDO_CANTIDAD': {
            const cantidad = parseInt(content);
            if (isNaN(cantidad) || cantidad <= 0 || cantidad > 20) {
                await client.sendMessage(from, 'Cantidad no válida. Por favor, responde con un número (ej: 2).');
                break;
            }
            const productoParaAñadir = convoState.productoTemporal;
            const item = {
                producto_id: productoParaAñadir.id,
                nombre: productoParaAñadir.nombre,
                cantidad: cantidad,
                precio_unitario: productoParaAñadir.variacionSeleccionada ? productoParaAñadir.variacionSeleccionada.precio : productoParaAñadir.precio,
                nombre_variacion: productoParaAñadir.variacionSeleccionada ? productoParaAñadir.variacionSeleccionada.nombre_variacion : null
            };
            convoState.carrito.push(item);
            convoState.productoTemporal = null;
            convoState.estado = 'INICIO';
            let cartMessage = '✅ ¡Producto añadido!\n\n*Tu pedido actual:*\n';
            let total = 0;
            convoState.carrito.forEach(cartItem => {
                const itemName = cartItem.nombre_variacion ? `${cartItem.nombre} (${cartItem.nombre_variacion})` : cartItem.nombre;
                cartMessage += `\n- ${cartItem.cantidad}x ${itemName}`;
                total += cartItem.cantidad * parseFloat(cartItem.precio_unitario);
            });
            cartMessage += `\n\n*Total a pagar: $${total.toFixed(2)}*`;
            cartMessage += `\n\n¿Qué deseas hacer ahora?\nEscribe *menu* para añadir más productos.\nEscribe *finalizar* para completar tu pedido.`;
            await client.sendMessage(from, cartMessage);
            break;
        }

        case 'PIDIENDO_DIRECCION_MZ': {
            const mz = content.replace(/\D/g, '');
            if (!mz) { await client.sendMessage(from, 'No entendí eso. Por favor, introduce solo el número de tu manzana (Mz).'); break; }
            convoState.direccion_mz = mz;
            convoState.estado = 'PIDIENDO_DIRECCION_VILLA';
            await client.sendMessage(from, `Manzana *${mz}* registrada. Ahora, por favor, indícame el número de tu *villa*.`);
            break;
        }

        case 'PIDIENDO_DIRECCION_VILLA': {
            const villa = content.replace(/\D/g, '');
            if (!villa) { await client.sendMessage(from, 'No entendí eso. Por favor, introduce solo el número de tu villa.'); break; }
            convoState.direccion_villa = villa;
            convoState.estado = 'PIDIENDO_FORMA_PAGO';
            let paymentMessage = '¡Dirección registrada!\n\n¿Cómo deseas pagar?\n\n';
            paymentMessage += '1. *Efectivo* 💵\n';
            paymentMessage += '2. *Transferencia* 🏦';
            await client.sendMessage(from, paymentMessage);
            break;
        }

        case 'PIDIENDO_FORMA_PAGO': {
            if (content.includes('1') || content.includes('efectivo')) {
                convoState.forma_pago = 'Efectivo';
                convoState.estado = 'PIDIENDO_MONTO_EFECTIVO';
                let total = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);
                await client.sendMessage(from, `El total de tu pedido es *$${total.toFixed(2)}*. ¿Con cuánto vas a pagar? (ej: "10" o "pago exacto")`);
            } else if (content.includes('2') || content.includes('transferencia')) {
                convoState.forma_pago = 'Transferencia';
                convoState.estado = 'PIDIENDO_BANCO_CLIENTE';
                await client.sendMessage(from, 'Perfecto, aceptamos transferencias. ¿Desde qué banco realizarías el pago? (ej: Pichincha, Guayaquil, etc.)');
            } else {
                await client.sendMessage(from, 'Opción no válida. Por favor, responde con *1* para Efectivo o *2* para Transferencia.');
            }
            break;
        }

        case 'PIDIENDO_MONTO_EFECTIVO': {
            const montoTexto = content.replace('$', '').trim();
            let montoPago;
            const totalPedido = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);
            if (montoTexto.includes('exacto') || montoTexto.includes('completo')) {
                montoPago = totalPedido;
            } else {
                montoPago = parseFloat(montoTexto);
            }
            if (isNaN(montoPago) || montoPago < totalPedido) {
                await client.sendMessage(from, `El monto no es válido o es menor al total de $${totalPedido.toFixed(2)}. Por favor, responde con un número mayor o igual, o con "exacto" o "completo".`);
                break;
            }
            convoState.observaciones = `Cliente paga con $${montoPago.toFixed(2)}`;
            
            // Lógica para efectivo: directamente a creación de orden
            try {
                await client.sendMessage(from, '¡Gracias! Procesando tu pedido... ⏳');
                
                const pedidoParaAPI = {
                    productos: convoState.carrito,
                    direccion_mz: convoState.direccion_mz,
                    direccion_villa: convoState.direccion_villa,
                    total: totalPedido,
                    observaciones: convoState.observaciones || 'Tomado por WhatsApp Bot (Efectivo)',
                    pagos: [{ forma_pago: convoState.forma_pago, monto: montoPago }]
                };

                const response = await apiClient.post('/pedidos', pedidoParaAPI);
                const pedidoId = response.data.pedidoId;

                await client.sendMessage(from, `✅ ¡Tu pedido #${pedidoId} ha sido confirmado y está en preparación! Gracias por preferirnos.`);
                convoState = { estado: 'INICIO', carrito: [] }; // Reiniciar conversación
            } catch (error) {
                console.error("Error al enviar el pedido a la API (Efectivo):", error.response?.data || error.message);
                await client.sendMessage(from, 'Lo siento, hubo un problema al procesar tu pedido. Un agente se pondrá en contacto contigo.');
                convoState.estado = 'ASISTENCIA_HUMANA';
            }
            break;
        }

        case 'PIDIENDO_BANCO_CLIENTE': {
            const bancoCliente = content.toLowerCase();
            let datosCuenta = datosBancarios.cuenta_por_defecto;
            for (const [clave, datos] of Object.entries(datosBancarios.bancos_coincidentes)) {
                if (bancoCliente.includes(clave)) {
                    datosCuenta = datos;
                    break;
                }
            }
            await client.sendMessage(from, `Por favor, realiza la transferencia a la siguiente cuenta y envía el comprobante a este chat para confirmar tu pedido:\n\n*${datosCuenta}*`);
            convoState.observaciones = `Transferencia desde ${content}`;
            convoState.estado = 'ESPERANDO_COMPROBANTE';
            break;
        }
        
        case 'ESPERANDO_COMPROBANTE': {
             if (message.hasMedia) {
                const media = await message.downloadMedia();
                // Generar un ID único corto de 4 caracteres alfanuméricos y en mayúsculas
                const tempOrderId = uuidv4().substring(0, 4).toUpperCase(); 
                
                // Obtener nombre del cliente para almacenamiento y mensajes
                let customerName = from.replace('@c.us', '');
                try {
                    const contact = await client.getContactById(from);
                    customerName = contact.pushname || contact.name || customerName;
                } catch (error) {
                    console.warn(`No se pudo obtener el nombre del contacto para ${from}:`, error.message);
                }

                // Calcular el total para order_details_snapshot
                let totalPedido = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);

                // Guardar la información relevante en Supabase
                const { data, error } = await supabase
                    .from('pending_transfers')
                    .insert([
                        {
                            id: tempOrderId,
                            customer_whatsapp: from,
                            customer_name: customerName,
                            media_data: media.data, // Almacenar el base64 de la imagen
                            convo_state_snapshot: { ...convoState, estado: 'PENDIENTE_VERIFICACION_PAGO' }, // Snapshot del estado en el momento de enviar la imagen
                            order_details_snapshot: { // Guardar los detalles del pedido en el snapshot
                                carrito: convoState.carrito,
                                direccion_mz: convoState.direccion_mz,
                                direccion_villa: convoState.direccion_villa,
                                total: totalPedido,
                                observaciones: convoState.observaciones,
                                forma_pago: convoState.forma_pago
                            },
                            status: 'PENDING'
                        }
                    ]);

                if (error) {
                    console.error('Error al guardar transferencia pendiente en Supabase:', error);
                    await client.sendMessage(from, 'Lo siento, hubo un problema técnico al registrar tu comprobante. Por favor, intenta de nuevo o contacta a un agente.');
                    convoState.estado = 'ASISTENCIA_HUMANA';
                    conversations[from] = convoState;
                    return;
                }
                
                // 1. Mensaje al Cliente: "Estamos verificando..."
                await client.sendMessage(from, '¡Gracias por tu pago! Estamos verificando la llegada del dinero a nuestra cuenta. En breve recibirás la confirmación de tu pedido. Agradecemos tu paciencia. ⏳');
                
                // 2. Mensaje al Número de Gestión de Cuentas con la foto y las instrucciones
                const verificationMessage = `Nueva transferencia pendiente de verificación para *${customerName}* (WhatsApp: ${from.replace('@c.us', '')}).\n\nPor favor, responde a este chat con *CONFIRMAR TRF-${tempOrderId}* si el pago es correcto, o *PROBLEMA TRF-${tempOrderId}* si hay algún inconveniente.`;
                await client.sendMessage(NUMERO_GESTION_CUENTAS, media, { caption: verificationMessage });

                convoState.estado = 'PENDIENTE_VERIFICACION_PAGO';
             } else {
                 await client.sendMessage(from, 'Por favor, envía una captura del comprobante de pago para continuar.');
             }
             break;
        }

        case 'PENDIENTE_VERIFICACION_PAGO': {
            await client.sendMessage(from, 'Gracias por tu paciencia. Tu pago está siendo verificado. Te notificaremos tan pronto tengamos una actualización. ✨');
            break;
        }
    
        case 'CONFIRMANDO_PEDIDO': {
            await client.sendMessage(from, 'Tu pedido ya está siendo procesado o esperando confirmación de pago. Si necesitas ayuda, escribe *cancelar*.');
            break;
        }
    
        default: {
            await client.sendMessage(from, 'No entendí tu mensaje. Escribe *hola* para empezar.');
            convoState.estado = 'INICIO';
            break;
        }
    }
    
    conversations[from] = convoState;
});


// --- Funciones de procesamiento de confirmación/problema de transferencia ---
async function processTransferConfirmation(tempOrderId, isConfirmed) {
    // 1. Obtener los datos de la transferencia pendiente de Supabase
    const { data: transferData, error: fetchError } = await supabase
        .from('pending_transfers')
        .select('*')
        .eq('id', tempOrderId)
        .single();

    if (fetchError || !transferData) {
        await client.sendMessage(NUMERO_GESTION_CUENTAS, `Error: No se encontró la transferencia con ID temporal "${tempOrderId}" en Supabase.`);
        console.error(`Error: ID temporal "${tempOrderId}" no encontrado o error al buscar en Supabase:`, fetchError?.message || 'No data');
        return;
    }

    const customerFrom = transferData.customer_whatsapp;
    // Restaurar el estado de la conversación del cliente que estaba esperando
    // Esto es crucial para que el bot "recuerde" dónde estaba el cliente y pueda responder adecuadamente.
    conversations[customerFrom] = transferData.convo_state_snapshot;
    
    // Obtener el nombre del contacto para los logs/mensajes
    let customerName = transferData.customer_name || customerFrom.replace('@c.us', '');

    if (isConfirmed) {
        try {
            // Usar los detalles del pedido del snapshot guardado en Supabase
            const orderDetails = transferData.order_details_snapshot;
            const total = orderDetails.total;

            const pedidoParaAPI = {
                productos: orderDetails.carrito,
                direccion_mz: orderDetails.direccion_mz,
                direccion_villa: orderDetails.direccion_villa,
                total: total,
                observaciones: orderDetails.observaciones || `Tomado por WhatsApp Bot (Transferencia TRF-${tempOrderId} Confirmada)`,
                pagos: [{ forma_pago: orderDetails.forma_pago, monto: total }]
            };

            const response = await apiClient.post('/pedidos', pedidoParaAPI);
            const pedidoId = response.data.pedidoId;

            await client.sendMessage(customerFrom, `✅ ¡Tu pago ha sido confirmado y tu pedido #${pedidoId} ha sido aceptado! 🥳 Te avisaremos cuando esté listo y en camino. ¡Gracias por elegirnos!`);
            await client.sendMessage(NUMERO_GESTION_CUENTAS, `✅ Pedido #${pedidoId} creado y confirmado para *${customerName}* (${customerFrom.replace('@c.us', '')}) (ID TRF-${tempOrderId}).`);
            
            // Actualizar estado en Supabase
            const { error: updateError } = await supabase
                .from('pending_transfers')
                .update({ status: 'CONFIRMED', updated_at: new Date().toISOString() })
                .eq('id', tempOrderId);

            if (updateError) console.error("Error al actualizar estado 'CONFIRMED' en Supabase:", updateError);

            // Reiniciar la conversación del cliente
            conversations[customerFrom] = { estado: 'INICIO', carrito: [] };

        } catch (error) {
            console.error(`Error al crear el pedido #${tempOrderId} en Il Sapore POS (Transferencia Confirmada) para ${customerFrom}:`, error.response?.data || error.message);
            await client.sendMessage(customerFrom, 'Lo siento, hubo un problema al procesar tu pedido después de confirmar el pago. Un agente se pondrá en contacto contigo.');
            await client.sendMessage(NUMERO_GESTION_CUENTAS, `❌ Error al crear pedido para *${customerName}* (ID TRF-${tempOrderId}). Por favor, revisa manualmente. Error: ${error.response?.data?.message || error.message}`);
            
            // Poner al cliente en un estado donde un humano lo asistirá si falla la creación del pedido
            conversations[customerFrom].estado = 'ASISTENCIA_HUMANA'; 
            
            // Aunque hubo un error en el POS, el pago se 'confirmó' por el personal,
            // entonces el estado en Supabase debe reflejar la acción del personal.
            const { error: updateError } = await supabase
                .from('pending_transfers')
                .update({ status: 'CONFIRMED_ERROR_POS', updated_at: new Date().toISOString() })
                .eq('id', tempOrderId);
            
            if (updateError) console.error("Error al actualizar estado 'CONFIRMED_ERROR_POS' en Supabase:", updateError);
        }
    } else { // isConfirmed es false, hay un problema con la transferencia
        await client.sendMessage(customerFrom, `Hemos tenido un problema al verificar tu pago. Por favor, contáctanos directamente para solucionar esto. Puedes escribir a este número de WhatsApp: ${NUMERO_GESTION_CUENTAS.replace('@c.us', '')}. ¡Disculpa las molestias!`);
        await client.sendMessage(NUMERO_GESTION_CUENTAS, `❌ Se notificó al cliente *${customerName}* (${customerFrom.replace('@c.us', '')}) sobre el problema con la transferencia TRF-${tempOrderId}.`);
        
        // Actualizar estado en Supabase
        const { error: updateError } = await supabase
            .from('pending_transfers')
            .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
            .eq('id', tempOrderId);

        if (updateError) console.error("Error al actualizar estado 'REJECTED' en Supabase:", updateError);

        // Reiniciar la conversación del cliente
        conversations[customerFrom] = { estado: 'INICIO', carrito: [] };
    }
}


client.initialize();