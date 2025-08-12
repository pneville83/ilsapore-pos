// backend/routes.js

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

const router = express.Router();

const TIMEZONE = 'America/Guayaquil';

// --- El resto de tus rutas (printTicket, login, productos, pedidos, finanzas) no necesita cambios ---
async function printTicket(pedido) {
    const printerInterface = process.env.PRINTER_INTERFACE;
    if (!printerInterface) { return; }
    let printer = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: printerInterface, characterSet: 'PC850_MULTILINGUAL' });
    try {
        console.log(`Intentando conectar a la impresora en: ${printerInterface}`);
        printer.alignCenter(); printer.bold(true); printer.println("NUEVO PEDIDO"); printer.bold(false);
        printer.println(`Pedido #${pedido.pedidoId}`); printer.println(new Date().toLocaleString()); printer.drawLine();
        printer.alignLeft(); printer.println("Detalles del Pedido:");
        pedido.productos.forEach(p => {
            const nombreItem = p.nombre_variacion ? `${p.nombre} (${p.nombre_variacion})` : p.nombre;
            const itemTotal = (p.cantidad * parseFloat(p.precio_unitario)).toFixed(2);
            printer.tableCustom([{ text: `${p.cantidad}x ${nombreItem}`, align: "LEFT", width: 0.7 }, { text: `$${itemTotal}`, align: "RIGHT", width: 0.25 }]);
        });
        printer.drawLine(); printer.alignRight(); printer.bold(true); printer.println(`TOTAL: $${parseFloat(pedido.total).toFixed(2)}`); printer.bold(false);
        printer.println(""); printer.alignLeft(); printer.bold(true); printer.println("PAGO REALIZADO:"); printer.bold(false);
        pedido.pagos.forEach(p => { printer.println(`- ${p.forma_pago}: $${parseFloat(p.monto).toFixed(2)}`); });
        printer.println(""); printer.bold(true); printer.println("ENTREGAR A:"); printer.bold(false);
        printer.println(`Mz: ${pedido.direccion_mz}, Villa: ${pedido.direccion_villa}`);
        if (pedido.observaciones && pedido.observaciones.trim() !== '') {
            printer.println(""); printer.bold(true); printer.println("OBSERVACIONES:"); printer.bold(false); printer.println(pedido.observaciones);
        }
        printer.println(""); printer.cut();
        await printer.execute(); console.log("¡ÉXITO! Comando de impresión enviado.");
    } catch (error) { console.error(`ERROR DE IMPRESIÓN: ${error.message}`); }
}
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'cocina' && password === 'cocina123') {
        return res.status(200).send({ message: 'Login exitoso', role: 'cocina' });
    }
    try {
        const { rows } = await db.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        if (rows.length === 0) { return res.status(404).send('Usuario o contraseña incorrectos'); }
        const user = rows[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password_hash);
        if (!passwordIsValid) { return res.status(401).send('Usuario o contraseña incorrectos'); }
        res.status(200).send({ message: 'Login exitoso', role: 'admin' });
    } catch (err) { console.error("Error en login de admin:", err); res.status(500).send('Error interno del servidor'); }
});
router.post('/pedidos', async (req, res) => {
    const { productos, direccion_mz, direccion_villa, total, observaciones, pagos } = req.body;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const pedidoQuery = `INSERT INTO pedidos (direccion_mz, direccion_villa, total, observaciones) VALUES ($1, $2, $3, $4) RETURNING id, fecha;`;
        const pedidoResult = await client.query(pedidoQuery, [direccion_mz, direccion_villa, total, observaciones]);
        const { id: nuevoPedidoId, fecha: nuevaFechaPedido } = pedidoResult.rows[0];
        const detallesQuery = `INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4);`;
        for (const producto of productos) { await client.query(detallesQuery, [nuevoPedidoId, producto.producto_id, producto.cantidad, producto.precio_unitario]); }
        const transaccionQuery = `INSERT INTO transacciones (fecha, descripcion, tipo, cuenta, monto, pedido_id) VALUES ($1, $2, 'Ingreso', $3, $4, $5);`;
        for (const pago of pagos) { await client.query(transaccionQuery, [nuevaFechaPedido, `Venta Pedido #${nuevoPedidoId}`, pago.forma_pago, pago.monto, nuevoPedidoId]); }
        await client.query('COMMIT');
        const datosParaImprimir = { ...req.body, pedidoId: nuevoPedidoId };
        printTicket(datosParaImprimir);
        const nuevoPedidoQuery = `SELECT p.id, p.fecha, p.direccion_mz, p.direccion_villa, p.total, p.observaciones, p.estado, (SELECT json_agg(json_build_object('nombre', prod.nombre, 'cantidad', dp.cantidad)) FROM detalles_pedido dp JOIN productos prod ON dp.producto_id = prod.id WHERE dp.pedido_id = p.id) as productos FROM pedidos p WHERE p.id = $1;`;
        const { rows } = await db.query(nuevoPedidoQuery, [nuevoPedidoId]);
        if (rows.length > 0) { req.io.emit('nuevo_pedido', rows[0]); }
        res.status(201).json({ message: 'Pedido creado exitosamente', pedidoId: nuevoPedidoId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('ERROR EN LA TRANSACCIÓN (ROLLBACK):', error);
        res.status(500).json({ message: 'Error al guardar el pedido' });
    } finally { client.release(); }
});
router.get('/pedidos/activos', async (req, res) => { try { const query = `SELECT p.id, p.fecha, p.direccion_mz, p.direccion_villa, p.total, p.observaciones, p.estado, (SELECT json_agg(json_build_object('nombre', prod.nombre, 'cantidad', dp.cantidad)) FROM detalles_pedido dp JOIN productos prod ON dp.producto_id = prod.id WHERE dp.pedido_id = p.id) as productos FROM pedidos p WHERE p.estado != 'Finalizado' ORDER BY p.fecha ASC;`; const { rows } = await db.query(query); res.json(rows); } catch (err) { console.error('Error al obtener pedidos activos:', err); res.status(500).send('Error en el servidor'); } });
router.patch('/pedidos/:id/estado', async (req, res) => { const { id } = req.params; const { estado } = req.body; try { const query = `UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *;`; const { rows } = await db.query(query, [estado, id]); if (rows.length === 0) { return res.status(404).send('Pedido no encontrado'); } res.json(rows[0]); } catch (err) { console.error('Error al actualizar estado del pedido:', err); res.status(500).send('Error en el servidor'); } });
async function getProductosConVariaciones(disponiblesSolo = false) { const whereClause = disponiblesSolo ? 'WHERE p.disponible = true' : ''; const query = `SELECT p.id, p.nombre, p.precio, p.categoria, p.disponible, json_agg(json_build_object('id', v.id, 'nombre_variacion', v.nombre_variacion, 'precio', v.precio)) FILTER (WHERE v.id IS NOT NULL) as variaciones FROM productos p LEFT JOIN variaciones_producto v ON p.id = v.producto_id ${whereClause} GROUP BY p.id ORDER BY p.categoria, p.nombre;`; const { rows } = await db.query(query); return rows; }
router.get('/productos/todos', async (req, res) => { try { const productos = await getProductosConVariaciones(false); res.json(productos); } catch (err) { console.error('Error al obtener todos los productos:', err); res.status(500).send('Error en el servidor'); } });
router.get('/productos/disponibles', async (req, res) => { try { const productos = await getProductosConVariaciones(true); res.json(productos); } catch (err) { console.error('Error al obtener productos disponibles:', err); res.status(500).send('Error en el servidor'); } });
router.post('/productos', async (req, res) => { const { nombre, precio, categoria, disponible, variaciones } = req.body; const client = await db.getClient(); try { await client.query('BEGIN'); const productoQuery = `INSERT INTO productos (nombre, precio, categoria, disponible) VALUES ($1, $2, $3, $4) RETURNING *;`; const productoResult = await client.query(productoQuery, [nombre, precio || null, categoria, disponible]); const nuevoProducto = productoResult.rows[0]; if (variaciones && variaciones.length > 0) { const variacionQuery = `INSERT INTO variaciones_producto (producto_id, nombre_variacion, precio) VALUES ($1, $2, $3);`; for (const v of variaciones) { if(v.nombre_variacion && v.precio) { await client.query(variacionQuery, [nuevoProducto.id, v.nombre_variacion, v.precio]); } } } await client.query('COMMIT'); res.status(201).json(nuevoProducto); } catch (err) { await client.query('ROLLBACK'); console.error('Error al crear producto:', err); res.status(500).send('Error en el servidor'); } finally { client.release(); } });
router.put('/productos/:id', async (req, res) => { const { id } = req.params; const { nombre, precio, categoria, disponible, variaciones } = req.body; const client = await db.getClient(); try { await client.query('BEGIN'); const productoQuery = `UPDATE productos SET nombre = $1, precio = $2, categoria = $3, disponible = $4 WHERE id = $5 RETURNING *;`; await client.query(productoQuery, [nombre, precio || null, categoria, disponible, id]); await client.query('DELETE FROM variaciones_producto WHERE producto_id = $1;', [id]); if (variaciones && variaciones.length > 0) { const variacionQuery = `INSERT INTO variaciones_producto (producto_id, nombre_variacion, precio) VALUES ($1, $2, $3);`; for (const v of variaciones) { if(v.nombre_variacion && v.precio) { await client.query(variacionQuery, [id, v.nombre_variacion, v.precio]); } } } await client.query('COMMIT'); res.json({ message: 'Producto actualizado' }); } catch (err) { await client.query('ROLLBACK'); console.error('Error al actualizar producto:', err); res.status(500).send('Error en el servidor'); } finally { client.release(); } });
router.get('/finanzas/saldos', async (req, res) => { try { const query = `SELECT cuenta, COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE -monto END), 0) as balance FROM transacciones GROUP BY cuenta;`; const { rows } = await db.query(query); const saldos = { 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } }; rows.forEach(row => { if (saldos[row.cuenta]) { saldos[row.cuenta].balance = parseFloat(row.balance); } }); res.json(saldos); } catch (err) { console.error('Error al obtener saldos:', err); res.status(500).send('Error en el servidor'); } });
router.get('/finanzas/historial', async (req, res) => { try { const query = `SELECT * FROM transacciones ORDER BY fecha DESC;`; const { rows } = await db.query(query); res.json(rows); } catch (err) { console.error('Error al obtener historial:', err); res.status(500).send('Error en el servidor'); } });
router.post('/finanzas/egreso', async (req, res) => { const { descripcion, monto, cuenta } = req.body; try { const query = `INSERT INTO transacciones (descripcion, tipo, cuenta, monto) VALUES ($1, 'Egreso', $2, $3) RETURNING *;`; const { rows } = await db.query(query, [descripcion, cuenta, monto]); res.status(201).json(rows[0]); } catch (err) { console.error('Error al crear egreso:', err); res.status(500).send('Error en el servidor'); } });

// --- RUTAS DE REPORTES (CON LA LÓGICA DE ZONA HORARIA FINAL Y DEFINITIVA) ---
router.get('/reportes/cierre-caja', async (req, res) => {
    const { fecha_inicio, fecha_fin } = req.query;
    try {
        const query = `
            SELECT 
                cuenta,
                COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END), 0) as ingresos,
                COALESCE(SUM(CASE WHEN tipo = 'Egreso' THEN monto ELSE 0 END), 0) as gastos
            FROM transacciones
            WHERE (fecha AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
            GROUP BY cuenta;
        `;
        const { rows } = await db.query(query, [fecha_inicio, fecha_fin, TIMEZONE]);
        
        const resultado = { 'Efectivo': { ingresos: 0, gastos: 0, balance: 0 }, 'Transferencia': { ingresos: 0, gastos: 0, balance: 0 }, 'Tarjeta': { ingresos: 0, gastos: 0, balance: 0 } };
        rows.forEach(row => {
            if (resultado[row.cuenta]) {
                resultado[row.cuenta].ingresos = parseFloat(row.ingresos);
                resultado[row.cuenta].gastos = parseFloat(row.gastos);
                resultado[row.cuenta].balance = parseFloat(row.ingresos) - parseFloat(row.gastos);
            }
        });
        res.json(resultado);
    } catch (err) {
        console.error('Error generando cierre de caja:', err);
        res.status(500).send('Error en el servidor');
    }
});

router.get('/reportes/productos-vendidos', async (req, res) => {
    const { fecha_inicio, fecha_fin } = req.query;
    try {
        const query = `
            SELECT p.nombre, SUM(dp.cantidad) as total_vendido, SUM(dp.cantidad * dp.precio_unitario) as ingresos_generados 
            FROM productos p 
            JOIN detalles_pedido dp ON p.id = dp.producto_id 
            JOIN pedidos ped ON dp.pedido_id = ped.id 
            WHERE (ped.fecha AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
            GROUP BY p.nombre 
            ORDER BY total_vendido DESC;
        `;
        const { rows } = await db.query(query, [fecha_inicio, fecha_fin, TIMEZONE]);
        res.json(rows);
    } catch (err) {
        console.error('Error generando reporte de productos:', err);
        res.status(500).send('Error en el servidor');
    }
});

router.get('/reportes/direcciones', async (req, res) => {
    const { fecha_inicio, fecha_fin } = req.query;
    try {
        const query = `
            SELECT direccion_mz, direccion_villa, COUNT(id) as numero_pedidos, SUM(total) as total_consumido 
            FROM pedidos 
            WHERE (fecha AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
            GROUP BY direccion_mz, direccion_villa 
            ORDER BY total_consumido DESC;
        `;
        const { rows } = await db.query(query, [fecha_inicio, fecha_fin, TIMEZONE]);
        res.json(rows);
    } catch (err) {
        console.error('Error generando reporte por dirección:', err);
        res.status(500).send('Error en el servidor');
    }
});

module.exports = router;