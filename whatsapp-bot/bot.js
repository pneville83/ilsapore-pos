// whatsapp-bot/bot.js

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Mantenemos uuidv4 por si se necesita para algo, pero no para clientTransactionId
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// --- Configuración desde .env ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const POS_API_BASE_URL = process.env.POS_API_BASE_URL;
const POS_LOGIN_ENDPOINT = process.env.POS_LOGIN_ENDPOINT;
const POS_USERNAME = process.env.POS_USERNAME;
const POS_PASSWORD = process.env.POS_PASSWORD;
const NUMERO_GESTION_CUENTAS = process.env.NUMERO_GESTION_CUENTAS;

// PayPhone API - ¡Variables re-integradas!
const PAYPHONE_API_KEY = process.env.PAYPHONE_API_KEY;
const PAYPHONE_STORE_ID = process.env.PAYPHONE_STORE_ID;
const PAYPHONE_CLIENT_ID = process.env.PAYPHONE_CLIENT_ID; // Tu "Id Cliente" de PayPhone
const PAYPHONE_GENERATE_LINK_URL = process.env.PAYPHONE_GENERATE_LINK_URL;
const PAYPHONE_CHECK_STATUS_URL = process.env.PAYPHONE_CHECK_STATUS_URL; // Se mantiene por si se necesita para depuración o futuros flujos

// Estas URLs de redirección (RESPONSE_URL, CANCELLATION_URL)
// se mantienen en .env porque tu backend las usará para las redirecciones del cliente,
// pero no se envían en el payload para el endpoint /api/Links del bot según el ejemplo PHP.
const PAYPHONE_RESPONSE_URL = process.env.PAYPHONE_RESPONSE_URL; 
const PAYPHONE_CANCELLATION_URL = process.env.PAYPHONE_CANCELLATION_URL;


// --- Verificaciones de configuración críticas ---
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !POS_API_BASE_URL || !POS_LOGIN_ENDPOINT || !POS_USERNAME || !POS_PASSWORD || !NUMERO_GESTION_CUENTAS ||
    !PAYPHONE_API_KEY || !PAYPHONE_STORE_ID || !PAYPHONE_CLIENT_ID || !PAYPHONE_GENERATE_LINK_URL || !PAYPHONE_CHECK_STATUS_URL || !PAYPHONE_RESPONSE_URL || !PAYPHONE_CANCELLATION_URL) {
    console.error("ERROR: Faltan variables de entorno cruciales. Por favor, verifica tu archivo .env");
    process.exit(1);
}

// --- Inicialización de Supabase Client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Manejo Dinámico del AUTH_TOKEN para Il Sapore POS API ---
let currentAuthToken = null;

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

const apiClient = axios.create({
    baseURL: POS_API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(
    async config => {
        if (!currentAuthToken) {
            await loginAndGetToken();
        }
        config.headers['Authorization'] = `Bearer ${currentAuthToken}`;
        return config;
    },
    error => Promise.reject(error)
);

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
                return apiClient(originalRequest);
            } catch (refreshError) {
                console.error('Fallo al refrescar el token de Il Sapore POS:', refreshError.message);
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

const conversations = {};

// --- Cargamos los datos de los bancos al iniciar ---
const datosBancarios = JSON.parse(fs.readFileSync('bancos.json', 'utf8'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
    console.log('✅ ¡El bot de Il Sapore está en línea!');
    try {
        await loginAndGetToken();
        // --- SUSCRIPCIÓN A SUPABASE REALTIME PARA PAGOS PAYPHONE ---
        supabase
            .channel('pending_transfers')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'pending_transfers',
                filter: `status=in.(PAYPHONE_CONFIRMED,PAYPHONE_FAILED,PAYPHONE_ORDER_ERROR,PAYPHONE_REJECTED)` // Se añade PAYPHONE_REJECTED para que el bot reaccione a rechazos
            }, async (payload) => {
                const updatedTransfer = payload.new;
                console.log('Supabase Realtime Update:', updatedTransfer);

                const customerFrom = updatedTransfer.customer_whatsapp;
                let convoState = conversations[customerFrom];
                
                if (convoState && convoState.estado === 'PENDIENTE_VERIFICACION_PAGO_PAYPHONE' && convoState.payphone_temp_id === updatedTransfer.id) {
                    
                    if (updatedTransfer.status === 'PAYPHONE_CONFIRMED' || updatedTransfer.status === 'PAYPHONE_ORDER_CREATED') {
                        await processTransferConfirmation(updatedTransfer.id, true, true);
                    } else if (updatedTransfer.status === 'PAYPHONE_FAILED' || updatedTransfer.status === 'PAYPHONE_REJECTED') {
                        await processTransferConfirmation(updatedTransfer.id, false, true);
                    } else if (updatedTransfer.status === 'PAYPHONE_ORDER_ERROR') {
                         console.error(`ERROR CRÍTICO: Pago PayPhone ID ${updatedTransfer.id} confirmado pero falló la creación de orden POS. Cliente y gestión notificados.`);
                         await client.sendMessage(customerFrom, `Tu pago con PayPhone ha sido procesado, pero tuvimos un problema técnico al confirmar tu pedido. Un agente se pondrá en contacto contigo para ayudarte. ¡Disculpa las molestias!`);
                         await client.sendMessage(NUMERO_GESTION_CUENTAS, `⚠️ ALERTA: Pago PayPhone ID ${updatedTransfer.id} de ${customerFrom.replace('@c.us', '')} fue *confirmado*, pero la orden *NO SE CREÓ* en el POS. Revisar manualmente.`);
                         conversations[customerFrom] = { estado: 'ASISTENCIA_HUMANA', carrito: [] };
                    }
                } else {
                    console.log(`Ignorando actualización de PayPhone para ${customerFrom}, estado actual: ${convoState?.estado || 'N/A'}, ID de PayPhone: ${convoState?.payphone_temp_id || 'N/A'}`);
                }
            })
            .subscribe();

        console.log('✅ Suscripción a Supabase Realtime para pending_transfers activa.');

    } catch (error) {
        console.error('No se pudo obtener el token de autenticación de Il Sapore POS al iniciar o configurar Realtime. Algunas funcionalidades podrían no operar.', error);
    }
});

client.on('message', async (message) => {
    const from = message.from;
    const content = message.body ? message.body.toLowerCase().trim() : '';

    console.log(`Mensaje de ${from}: "${content}" (Estado PREVIO: ${conversations[from]?.estado || 'INICIO'})`);

    // --- LÓGICA PARA EL NÚMERO DE GESTIÓN DE CUENTAS ---
    if (from === NUMERO_GESTION_CUENTAS) {
        const confirmMatch = content.match(/confirmar\s+(?:trf-)?([a-z0-9]{4})/);
        const problemMatch = content.match(/problema\s+(?:trf-)?([a-z0-9]{4})/);

        if (confirmMatch && confirmMatch[1]) {
            const tempOrderId = confirmMatch[1].toUpperCase();
            await processTransferConfirmation(tempOrderId, true, false);
        } else if (problemMatch && problemMatch[1]) {
            const tempOrderId = problemMatch[1].toUpperCase();
            await processTransferConfirmation(tempOrderId, false, false);
        } else {
            await client.sendMessage(from, 'Comando no reconocido. Usa "CONFIRMAR TRF-[ID]" o "PROBLEMA TRF-[ID]". El ID debe ser de 4 caracteres alfanuméricos.');
        }
        return;
    }

    // --- LÓGICA NORMAL DEL BOT PARA CLIENTES ---
    let convoState = conversations[from] || { estado: 'INICIO', carrito: [] };

    // --- MANEJO DE COMANDOS GLOBALES DE INICIO/REINICIO ---
    const resetKeywords = ['hola', 'cancelar', 'hi', 'empezar', 'inicio', 'comenzar', 'veci', 'buenas', 'noches', 'pedido', 'quisiera'];
    const shouldResetConversation = resetKeywords.some(keyword => content.includes(keyword));

    if (shouldResetConversation) {
        const welcomeMessage = '¡Hola! 👋 Bienvenido a Il Sapore.\n\nEscribe *menu* para ver nuestras opciones y empezar tu pedido. 🍔';
        await client.sendMessage(from, welcomeMessage);
        convoState = { estado: 'INICIO', carrito: [] };
        conversations[from] = convoState;
        return;
    }

    // --- MANEJO DEL COMANDO 'menu' ---
    if (content.includes('menu')) {
        try {
            const response = await apiClient.get('/productos/disponibles');
            const productos = response.data;
            const categoriasExcluidas = 'adicionales';
            let categorias = [...new Set(productos.map(p => p.categoria))].filter(cat => !categoriasExcluidas.includes(cat.toLowerCase()));
            
            convoState = { 
                ...convoState, 
                productosDisponibles: productos, 
                categoriasDisponibles: categorias, 
                estado: 'VIENDO_CATEGORIAS' 
            };
            
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

    if (content.includes('finalizar') && convoState.carrito && convoState.carrito.length > 0) {
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

            const isTwoPizzaPromo = productoSeleccionado.nombre.toLowerCase().includes('2 pizzas familiares');

            if (isTwoPizzaPromo) {
                await client.sendMessage(from, `¡Has elegido la promoción de *${productoSeleccionado.nombre}*!\n\nPara tu *primera* pizza, por favor, elige la variedad que deseas de la lista a continuación:`);
                
                const pizzasDisponibles = convoState.productosDisponibles.filter(p => 
                    p.categoria.toLowerCase() === 'pizzas' && (!p.variaciones || p.variaciones.length === 0)
                );
                convoState.pizzasParaElegir = pizzasDisponibles;
                let pizzaListMessage = '';
                pizzasDisponibles.forEach((p, index) => { pizzaListMessage += `${index + 1}. *${p.nombre}*\n`; });
                await client.sendMessage(from, pizzaListMessage);

                convoState.variedadesPromoElegidas = [];
                convoState.currentPizzaSelectionCount = 0;
                convoState.pizzasEnPromoRequeridas = 2;
                convoState.estado = 'SELECCIONANDO_PIZZAS_PARA_PROMO';
            } else if (productoSeleccionado.variaciones && productoSeleccionado.variaciones.length > 0) {
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
                is_promo: false,
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
                cartMessage += `\n- ${cartItem.cantidad}x ${itemName} - *$${parseFloat(cartItem.precio_unitario).toFixed(2)}*`;
                total += cartItem.cantidad * parseFloat(cartItem.precio_unitario);
            });
            cartMessage += `\n\n*Total a pagar: $${total.toFixed(2)}*`;
            cartMessage += `\n\n¿Qué deseas hacer ahora?\nEscribe *menu* para añadir más productos.\nEscribe *finalizar* para completar tu pedido.`;
            await client.sendMessage(from, cartMessage);
            break;
        }

        case 'SELECCIONANDO_PIZZAS_PARA_PROMO': {
            const num = parseInt(content);
            const pizzasDisponibles = convoState.pizzasParaElegir;
            const promoSeleccionada = convoState.productoTemporal;

            if (isNaN(num) || num <= 0 || num > pizzasDisponibles.length) {
                await client.sendMessage(from, 'Opción no válida. Por favor, elige un número de la lista de variedades de pizza.');
                let pizzaListMessage = `Por favor, elige la variedad de pizza número ${convoState.currentPizzaSelectionCount + 1} de la siguiente lista:\n\n`;
                pizzasDisponibles.forEach((p, index) => { pizzaListMessage += `${index + 1}. *${p.nombre}*\n`; });
                await client.sendMessage(from, pizzaListMessage);
                break;
            }

            const pizzaElegida = pizzasDisponibles[num - 1];
            convoState.variedadesPromoElegidas.push(pizzaElegida);
            convoState.currentPizzaSelectionCount++;

            if (convoState.currentPizzaSelectionCount < convoState.pizzasEnPromoRequeridas) {
                await client.sendMessage(from, `Para tu *${convoState.currentPizzaSelectionCount + 1}ª* pizza, por favor, elige otra variedad:`);
                let pizzaListMessage = '';
                pizzasDisponibles.forEach((p, index) => { pizzaListMessage += `${index + 1}. *${p.nombre}*\n`; });
                await client.sendMessage(from, pizzaListMessage);
            } else {
                const item = {
                    is_promo: true,
                    producto_id: promoSeleccionada.id,
                    nombre: promoSeleccionada.nombre,
                    cantidad: 1,
                    precio_unitario: promoSeleccionada.precio,
                    variedades_elegidas: convoState.variedadesPromoElegidas.map(p => ({
                        producto_id: p.id,
                        nombre: p.nombre,
                        nombre_variacion: 'Familiar'
                    }))
                };
                convoState.carrito.push(item);

                convoState.productoTemporal = null;
                convoState.pizzasParaElegir = null;
                convoState.variedadesPromoElegidas = null;
                convoState.currentPizzaSelectionCount = null;
                convoState.pizzasEnPromoRequeridas = null;
                convoState.estado = 'INICIO';

                let cartMessage = '✅ ¡Promoción añadida!\n\n*Tu pedido actual:*\n';
                let total = 0;
                convoState.carrito.forEach(cartItem => {
                    if (cartItem.is_promo) {
                        const pizzaNames = cartItem.variedades_elegidas.map(v => v.nombre).join(', ');
                        cartMessage += `\n- ${cartItem.nombre} (${pizzaNames}) - *$${parseFloat(cartItem.precio_unitario).toFixed(2)}*`;
                    } else {
                        const itemName = cartItem.nombre_variacion ? `${cartItem.nombre} (${cartItem.nombre_variacion})` : cartItem.nombre;
                        cartMessage += `\n- ${cartItem.cantidad}x ${itemName} - *$${parseFloat(cartItem.precio_unitario).toFixed(2)}*`;
                    }
                    total += cartItem.cantidad * parseFloat(cartItem.precio_unitario);
                });
                cartMessage += `\n\n*Total a pagar: $${total.toFixed(2)}*`;
                cartMessage += `\n\n¿Qué deseas hacer ahora?\nEscribe *menu* para añadir más productos.\nEscribe *finalizar* para completar tu pedido.`;
                await client.sendMessage(from, cartMessage);
            }
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
            paymentMessage += '2. *Transferencia* 🏦\n';
            // ¡Opción 3 de PayPhone re-integrada!
            paymentMessage += '3. *Tarjeta de Crédito/Débito (PayPhone)* 💳';
            await client.sendMessage(from, paymentMessage);
            break;
        }

        case 'PIDIENDO_FORMA_PAGO': {
            if (content.includes('1') || content.includes('efectivo')) {
                convoState.forma_pago = 'Efectivo';
                convoState.estado = 'PIDIENDO_MONTO_EFECTIVO';
                let total = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);
                await client.sendMessage(from, `El total de tu pedido es *$${total.toFixed(2)}*. ¿Con cuánto vas a pagar? (ej: "10" o "pago exacto/completo")`);
            } else if (content.includes('2') || content.includes('transferencia')) {
                convoState.forma_pago = 'Transferencia';
                convoState.estado = 'PIDIENDO_BANCO_CLIENTE';
                await client.sendMessage(from, 'Perfecto, aceptamos transferencias. ¿Desde qué banco realizarías el pago? (ej: Pichincha, Guayaquil, etc.)');
            } else if (content.includes('3') || content.includes('tarjeta') || content.includes('payphone')) { // ¡Lógica de PayPhone re-integrada!
                convoState.forma_pago = 'Tarjeta (PayPhone)';
                convoState.estado = 'GENERANDO_LINK_PAYPHONE';
                
                let totalPedido = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);
                const amountInCents = Math.round(totalPedido * 100); // Monto total en centavos

                // --- Generar clientTransactionId replicando la lógica PHP ---
                const now = new Date();
                const year = String(now.getFullYear()).substring(2);
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
                const randomMicroseconds = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
                
                const clientTransactionIdBase = `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}${randomMicroseconds}`;
                const payphoneClientTxToken = clientTransactionIdBase.substring(0, 15).toUpperCase(); 
                convoState.payphone_temp_id = payphoneClientTxToken; // Guardar en el estado para rastrear

                await client.sendMessage(from, 'Generando enlace de pago con PayPhone... 💳');

                try {
                    let snapshotObservaciones = convoState.observaciones || 'Tomado por WhatsApp Bot';
                    const promoItemsInCart = convoState.carrito.filter(item => item.is_promo);
                    if (promoItemsInCart.length > 0) {
                        const promoDetails = promoItemsInCart.map(item => {
                            const pizzaNames = item.variedades_elegidas.map(v => v.nombre).join(', ');
                            return `${item.nombre} (${pizzaNames})`;
                        }).join('; ');
                        snapshotObservaciones += ` - Promociones: ${promoDetails}`;
                    }

                    // Guardar la transacción pendiente en Supabase ANTES de generar el link
                    const { data: supabaseInsertData, error: supabaseInsertError } = await supabase
                        .from('pending_transfers')
                        .insert([
                            {
                                id: payphoneClientTxToken,
                                customer_whatsapp: from,
                                customer_name: '',
                                media_data: null,
                                convo_state_snapshot: { ...convoState, estado: 'PENDIENTE_VERIFICACION_PAGO_PAYPHONE' },
                                order_details_snapshot: {
                                    carrito: convoState.carrito,
                                    direccion_mz: convoState.direccion_mz,
                                    direccion_villa: convoState.direccion_villa,
                                    total: totalPedido,
                                    observaciones: snapshotObservaciones,
                                    forma_pago: convoState.forma_pago,
                                    payphone_transaction_id: null
                                },
                                status: 'PAYPHONE_PENDING'
                            }
                        ]);

                    if (supabaseInsertError) {
                        console.error('Error al guardar transacción PayPhone pendiente en Supabase:', supabaseInsertError);
                        await client.sendMessage(from, 'Lo siento, hubo un problema técnico al iniciar el pago. Por favor, intenta de nuevo.');
                        convoState.estado = 'ASISTENCIA_HUMANA';
                        conversations[from] = convoState;
                        return;
                    }

                    // --- CONSTRUCCIÓN DEL PAYLOAD FINAL SEGÚN EL EJEMPLO PHP Y TUS NUEVAS CREDENCIALES ---
                    const payphonePayload = {
                        amount: amountInCents,
                        amountWithoutTax: amountInCents,
                        amountWithTax: 0,
                        tax: 0,
                        service: 0,
                        tip: 0,
                        currency: 'USD',
                        reference: `Pedido Bot #${payphoneClientTxToken}`,
                        clientTransactionId: payphoneClientTxToken,
                        storeId: PAYPHONE_STORE_ID, // <<< ¡ESTE ES EL CAMPO CLAVE QUE ESTAMOS ACTUALIZANDO!
                        // Campos como 'responseUrl', 'cancellationUrl', 'oneTime', 'isAmountEditable', 'clientUserId'
                        // NO están presentes en el ejemplo PHP para /api/Links. Asumimos que no son parte de este payload.
                    };
                    
                    console.log("Payload enviado a PayPhone:", JSON.stringify(payphonePayload, null, 2)); // Para depuración

                    const payphoneResponse = await axios.post(PAYPHONE_GENERATE_LINK_URL, payphonePayload, {
                        headers: {
                            'Authorization': `Bearer ${PAYPHONE_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    // --- MANEJO DE RESPUESTA ACTUALIZADO (espera un string directamente) ---
                    if (typeof payphoneResponse.data === 'string' && payphoneResponse.data.startsWith('https://')) {
                        const payphoneLink = payphoneResponse.data;
                        await client.sendMessage(from, `¡Listo! Haz clic en el siguiente enlace para pagar tu pedido de *$${totalPedido.toFixed(2)}* con tarjeta:\n\n👉 ${payphoneLink}\n\nUna vez que completes el pago, te confirmaremos tu pedido automáticamente. ¡Gracias por tu paciencia!`);
                        convoState.estado = 'PENDIENTE_VERIFICACION_PAGO_PAYPHONE';
                    } else {
                        // Si no es un string con el link, es un error de PayPhone o una respuesta inesperada.
                        console.error("Error al generar el link de PayPhone: Respuesta inesperada de PayPhone.", payphoneResponse.data);
                        throw new Error(`No se recibió un enlace de pago válido de PayPhone en la respuesta. Respuesta completa: ${JSON.stringify(payphoneResponse.data)}`);
                    }

                } catch (error) {
                    const errorMessage = error.response?.data?.message || error.message;
                    console.error("Error al generar el link de PayPhone (catch):", errorMessage, error.response?.data?.errors || error.response?.data || "No hay detalles adicionales en error.response.data");
                    await client.sendMessage(from, `Lo siento, hubo un problema al procesar el pago con PayPhone: ${errorMessage}. Por favor, intenta de nuevo o elige otra forma de pago.`);
                    convoState.estado = 'PIDIENDO_FORMA_PAGO';
                }
            } else {
                await client.sendMessage(from, 'Opción no válida. Por favor, responde con *1* para Efectivo, *2* para Transferencia o *3* para Tarjeta.');
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
                await client.sendMessage(from, `El monto no es válido o es menor al total de $${totalPedido.toFixed(2)}. Por favor, responde con un número mayor o igual, o con "pago exacto" o "pago completo".`);
                break;
            }
            convoState.observaciones = `Cliente paga con $${montoPago.toFixed(2)}`;
            
            try {
                await client.sendMessage(from, '¡Gracias! Procesando tu pedido... ⏳');
                
                const productosParaAPI = convoState.carrito.map(item => {
                    if (item.is_promo) {
                        return item.variedades_elegidas.map(pizza => ({
                            producto_id: pizza.producto_id,
                            nombre: pizza.nombre,
                            cantidad: 1,
                            precio_unitario: 0,
                            nombre_variacion: pizza.nombre_variacion
                        }));
                    } else {
                        return {
                            producto_id: item.producto_id,
                            nombre: item.nombre,
                            cantidad: item.cantidad,
                            precio_unitario: item.precio_unitario,
                            nombre_variacion: item.nombre_variacion
                        };
                    }
                }).flat();

                let pedidoObservaciones = convoState.observaciones || 'Tomado por WhatsApp Bot (Efectivo)';
                const promoItemsInCart = convoState.carrito.filter(item => item.is_promo);
                if (promoItemsInCart.length > 0) {
                    const promoDetails = promoItemsInCart.map(item => {
                        const pizzaNames = item.variedades_elegidas.map(v => v.nombre).join(', ');
                        return `${item.nombre} (${pizzaNames})`;
                    }).join('; ');
                    pedidoObservaciones += ` - Promociones: ${promoDetails}`;
                }


                const pedidoParaAPI = {
                    productos: productosParaAPI,
                    direccion_mz: convoState.direccion_mz,
                    direccion_villa: convoState.direccion_villa,
                    total: totalPedido,
                    observaciones: pedidoObservaciones,
                    pagos: [{ forma_pago: convoState.forma_pago, monto: montoPago }]
                };

                const response = await apiClient.post('/pedidos', pedidoParaAPI);
                const pedidoId = response.data.pedidoId;

                await client.sendMessage(from, `✅ ¡Tu pedido #${pedidoId} ha sido confirmado y está en preparación! Gracias por preferirnos.`);
                convoState = { estado: 'INICIO', carrito: [] };
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
                const tempOrderId = uuidv4().substring(0, 4).toUpperCase(); 
                
                let customerName = from.replace('@c.us', '');
                try {
                    const contact = await client.getContactById(from);
                    customerName = contact.pushname || contact.name || customerName;
                } catch (error) {
                    console.warn(`No se pudo obtener el nombre del contacto para ${from}:`, error.message);
                }

                let totalPedido = convoState.carrito.reduce((sum, item) => sum + item.cantidad * parseFloat(item.precio_unitario), 0);

                let snapshotObservaciones = convoState.observaciones || 'Tomado por WhatsApp Bot';
                const promoItemsInCart = convoState.carrito.filter(item => item.is_promo);
                if (promoItemsInCart.length > 0) {
                    const promoDetails = promoItemsInCart.map(item => {
                        const pizzaNames = item.variedades_elegidas.map(v => v.nombre).join(', ');
                        return `${item.nombre} (${pizzaNames})`;
                    }).join('; ');
                    snapshotObservaciones += ` - Promociones: ${promoDetails}`;
                }

                const { data, error } = await supabase
                    .from('pending_transfers')
                    .insert([
                        {
                            id: tempOrderId,
                            customer_whatsapp: from,
                            customer_name: customerName,
                            media_data: media.data,
                            convo_state_snapshot: { ...convoState, estado: 'PENDIENTE_VERIFICACION_PAGO' },
                            order_details_snapshot: {
                                carrito: convoState.carrito,
                                direccion_mz: convoState.direccion_mz,
                                direccion_villa: convoState.direccion_villa,
                                total: totalPedido,
                                observaciones: snapshotObservaciones,
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
                
                await client.sendMessage(from, '¡Gracias por tu pago! Estamos verificando la llegada del dinero a nuestra cuenta. En breve recibirás la confirmación de tu pedido. Agradecemos tu paciencia. ⏳');
                
                const verificationMessage = `Nueva transferencia pendiente de verificación para *${customerName}* (WhatsApp: ${from.replace('@c.us', '')}).\n\nPor favor, responde a este chat con *CONFIRMAR TRF-${tempOrderId}* si el pago es correcto, o *PROBLEMA TRF-${tempOrderId}* si hay algún inconveniente.`;
                await client.sendMessage(NUMERO_GESTION_CUENTAS, media, { caption: verificationMessage });

                convoState.estado = 'PENDIENTE_VERIFICACION_PAGO';
             } else {
                 await client.sendMessage(from, 'Por favor, envía una captura del comprobante de pago para continuar.');
             }
             break;
        }

        case 'PENDIENTE_VERIFICACION_PAGO': // Para transferencias manuales
        case 'PENDIENTE_VERIFICACION_PAGO_PAYPHONE': { // ¡Estado PayPhone re-integrado!
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
// Añadimos 'isPayphone' para diferenciar si la confirmación viene de PayPhone (webhook) o manual
async function processTransferConfirmation(tempOrderId, isConfirmed, isPayphone = false) {
    const { data: transferData, error: fetchError } = await supabase
        .from('pending_transfers')
        .select('*')
        .eq('id', tempOrderId)
        .single();

    if (fetchError || !transferData) {
        // Si viene de PayPhone y no encuentra la transacción (puede ser un reintento de webhook, etc.)
        if (isPayphone) {
            console.warn(`Webhook de PayPhone recibido para ID "${tempOrderId}" pero no se encontró la transacción pendiente. Podría ser un reintento o ya procesado.`);
            // No enviar mensaje al número de gestión, ya que no es un error de su parte.
        } else {
            await client.sendMessage(NUMERO_GESTION_CUENTAS, `Error: No se encontró la transferencia con ID temporal "${tempOrderId}" en Supabase.`);
            console.error(`Error: ID temporal "${tempOrderId}" no encontrado o error al buscar en Supabase:`, fetchError?.message || 'No data');
        }
        return;
    }

    const customerFrom = transferData.customer_whatsapp;
    conversations[customerFrom] = transferData.convo_state_snapshot; // Restaurar el estado previo del cliente
    
    let customerName = transferData.customer_name || customerFrom.replace('@c.us', '');

    if (isConfirmed) {
        try {
            const orderDetails = transferData.order_details_snapshot;
            const total = orderDetails.total;

            const productosParaAPI = orderDetails.carrito.map(item => {
                if (item.is_promo) {
                    return item.variedades_elegidas.map(pizza => ({
                        producto_id: pizza.producto_id,
                        nombre: pizza.nombre,
                        cantidad: 1,
                        precio_unitario: 0,
                        nombre_variacion: pizza.nombre_variacion
                    }));
                } else {
                    return {
                        producto_id: item.producto_id,
                        nombre: item.nombre,
                        cantidad: item.cantidad,
                        precio_unitario: item.precio_unitario,
                        nombre_variacion: item.nombre_variacion
                    };
                }
            }).flat();

            const pedidoParaAPI = {
                productos: productosParaAPI,
                direccion_mz: orderDetails.direccion_mz,
                direccion_villa: orderDetails.direccion_villa,
                total: total,
                observaciones: orderDetails.observaciones,
                pagos: [{ forma_pago: orderDetails.forma_pago, monto: total }]
            };

            const response = await apiClient.post('/pedidos', pedidoParaAPI);
            const pedidoId = response.data.pedidoId;

            await client.sendMessage(customerFrom, `✅ ¡Tu pago ha sido confirmado y tu pedido #${pedidoId} ha sido aceptado! 🥳 Te avisaremos cuando esté listo para retirar/en camino. ¡Gracias por elegirnos!`);
            // Solo notificar al número de gestión si fue una transferencia manual
            if (!isPayphone) {
                await client.sendMessage(NUMERO_GESTION_CUENTAS, `✅ Pedido #${pedidoId} creado y confirmado para *${customerName}* (${customerFrom.replace('@c.us', '')}) (ID TRF-${tempOrderId}).`);
            } else {
                console.log(`Pedido #${pedidoId} creado y confirmado automáticamente vía PayPhone para ${customerName} (ID PayPhone: ${tempOrderId}).`);
            }
            
            const { error: updateError } = await supabase
                .from('pending_transfers')
                .update({ status: isPayphone ? 'PAYPHONE_ORDER_CREATED' : 'CONFIRMED', updated_at: new Date().toISOString() })
                .eq('id', tempOrderId);

            if (updateError) console.error("Error al actualizar estado en Supabase:", updateError);

            conversations[customerFrom] = { estado: 'INICIO', carrito: [] };

        } catch (error) {
            console.error(`Error al crear el pedido #${tempOrderId} en Il Sapore POS (Confirmado${isPayphone ? ' PayPhone' : ''}) para ${customerFrom}:`, error.response?.data || error.message);
            await client.sendMessage(customerFrom, 'Lo siento, hubo un problema al procesar tu pedido después de confirmar el pago. Un agente se pondrá en contacto contigo.');
            
            if (!isPayphone) { // Solo si no es PayPhone, enviamos el error al num de gestión
                await client.sendMessage(NUMERO_GESTION_CUENTAS, `❌ Error al crear pedido para *${customerName}* (ID TRF-${tempOrderId}). Por favor, revisa manualmente. Error: ${error.response?.data?.message || error.message}`);
            } else {
                console.error(`❌ Error automático al crear pedido PayPhone para ${customerName} (ID: ${tempOrderId}). Se requiere revisión manual.`);
                // Opcional: Podrías enviar una notificación al NUMERO_GESTION_CUENTAS para errores de POS con PayPhone
                await client.sendMessage(NUMERO_GESTION_CUENTAS, `⚠️ ERROR: Pago PayPhone de ${customerName} (ID: ${tempOrderId}) fue confirmado, pero falló la creación del pedido en POS. Revisar manualmente.`);
            }
            
            conversations[customerFrom].estado = 'ASISTENCIA_HUMANA'; 
            
            const { error: updateError } = await supabase
                .from('pending_transfers')
                .update({ status: isPayphone ? 'PAYPHONE_ORDER_ERROR' : 'CONFIRMED_ERROR_POS', updated_at: new Date().toISOString() })
                .eq('id', tempOrderId);
            
            if (updateError) console.error("Error al actualizar estado 'CONFIRMED_ERROR_POS' en Supabase:", updateError);
        }
    } else { // isConfirmed es false, hay un problema
        await client.sendMessage(customerFrom, `Hemos tenido un problema al verificar tu pago con tarjeta. Por favor, contáctanos directamente para solucionar esto. Puedes escribir a este número de WhatsApp: ${NUMERO_GESTION_CUENTAS.replace('@c.us', '')}. ¡Disculpa las molestias!`);
        
        if (!isPayphone) { // Solo si no es PayPhone, enviamos el error al num de gestión
             await client.sendMessage(NUMERO_GESTION_CUENTAS, `❌ Se notificó al cliente *${customerName}* (${customerFrom.replace('@c.us', '')}) sobre el problema con la transferencia TRF-${tempOrderId}.`);
        } else {
            console.warn(`Pago PayPhone para ${customerName} (ID: ${tempOrderId}) FALLÓ. Cliente notificado.`);
        }
        
        const { error: updateError } = await supabase
            .from('pending_transfers')
            .update({ status: isPayphone ? 'PAYPHONE_REJECTED' : 'REJECTED', updated_at: new Date().toISOString() })
            .eq('id', tempOrderId);

        if (updateError) console.error("Error al actualizar estado 'REJECTED' en Supabase:", updateError);

        conversations[customerFrom] = { estado: 'INICIO', carrito: [] };
    }
}

client.initialize();