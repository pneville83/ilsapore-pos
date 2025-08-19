// backend/routes/protected.js

const db = require('../db');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

module.exports = function(router) {
    const TIMEZONE = 'America/Guayaquil';

    // --- FUNCIÓN DE IMPRESIÓN ---
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

    // --- RUTAS DE PEDIDOS ---
    router.post('/pedidos', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const ubicacionDelPedido = (rol === 'superadmin' && req.body.ubicacion_id) ? req.body.ubicacion_id : ubicacion_id;
        if (!ubicacionDelPedido) { return res.status(403).send('No se puede crear un pedido sin una ubicación asignada.'); }
        
        const { productos, direccion_mz, direccion_villa, total, observaciones, pagos } = req.body;
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const pedidoQuery = `INSERT INTO pedidos (direccion_mz, direccion_villa, total, observaciones, ubicacion_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, fecha;`;
            const pedidoResult = await client.query(pedidoQuery, [direccion_mz, direccion_villa, total, observaciones, ubicacionDelPedido]);
            const { id: nuevoPedidoId, fecha: nuevaFechaPedido } = pedidoResult.rows[0];
            
            const detallesQuery = `INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, nombre_variacion) VALUES ($1, $2, $3, $4, $5);`;
            for (const producto of productos) { await client.query(detallesQuery, [nuevoPedidoId, producto.producto_id, producto.cantidad, producto.precio_unitario, producto.nombre_variacion]); }
            
            const transaccionQuery = `INSERT INTO transacciones (fecha, descripcion, tipo, cuenta, monto, pedido_id, ubicacion_id) VALUES ($1, $2, 'Ingreso', $3, $4, $5, $6);`;
            for (const pago of pagos) { await client.query(transaccionQuery, [nuevaFechaPedido, `Venta Pedido #${nuevoPedidoId}`, pago.forma_pago, pago.monto, nuevoPedidoId, ubicacionDelPedido]); }
            
            await client.query('COMMIT');
            
            const datosParaImprimir = { ...req.body, pedidoId: nuevoPedidoId };
            printTicket(datosParaImprimir);
            
            const nuevoPedidoQuery = `
                SELECT 
                    p.id, p.fecha, p.direccion_mz, p.direccion_villa, p.total, p.observaciones, p.estado, p.ubicacion_id, 
                    u.nombre as nombre_ubicacion,
                    (SELECT json_agg(json_build_object('nombre', prod.nombre, 'cantidad', dp.cantidad, 'nombre_variacion', dp.nombre_variacion)) FROM detalles_pedido dp JOIN productos prod ON dp.producto_id = prod.id WHERE dp.pedido_id = p.id) as productos, 
                    (SELECT json_agg(json_build_object('cuenta', t.cuenta, 'monto', t.monto)) FROM transacciones t WHERE t.pedido_id = p.id AND t.tipo = 'Ingreso') as pagos 
                FROM pedidos p
                LEFT JOIN ubicaciones u ON p.ubicacion_id = u.id
                WHERE p.id = $1;
            `;
            const { rows } = await db.query(nuevoPedidoQuery, [nuevoPedidoId]);
            if (rows.length > 0) {
                req.io.emit('nuevo_pedido', rows[0]);
            }
            
            res.status(201).json({ message: 'Pedido creado exitosamente', pedidoId: nuevoPedidoId });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('ERROR EN LA TRANSACCIÓN (ROLLBACK):', error);
            res.status(500).json({ message: 'Error al guardar el pedido' });
        } finally {
            client.release();
        }
    });
    router.get('/pedidos/activos', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const ubicacionFiltro = (rol === 'superadmin' && req.query.ubicacion_id) ? req.query.ubicacion_id : ubicacion_id;
        try {
            let whereClause = "WHERE p.estado != 'Finalizado'";
            let params = [];
            
            if (rol === 'superadmin' && ubicacionFiltro) {
                whereClause += ` AND p.ubicacion_id = $1`;
                params.push(ubicacionFiltro);
            } else if (rol !== 'superadmin' && ubicacion_id) {
                whereClause += ` AND p.ubicacion_id = $1`;
                params.push(ubicacion_id);
            } else if (rol !== 'superadmin' && !ubicacion_id) {
                return res.json([]);
            }
            const query = `
                SELECT 
                    p.id, p.fecha, p.direccion_mz, p.direccion_villa, p.total, p.observaciones, p.estado,
                    u.nombre as nombre_ubicacion,
                    (SELECT json_agg(json_build_object('nombre', prod.nombre, 'cantidad', dp.cantidad, 'nombre_variacion', dp.nombre_variacion)) FROM detalles_pedido dp JOIN productos prod ON dp.producto_id = prod.id WHERE dp.pedido_id = p.id) as productos,
                    (SELECT json_agg(json_build_object('cuenta', t.cuenta, 'monto', t.monto)) FROM transacciones t WHERE t.pedido_id = p.id AND t.tipo = 'Ingreso') as pagos
                FROM pedidos p
                LEFT JOIN ubicaciones u ON p.ubicacion_id = u.id
                ${whereClause}
                ORDER BY p.fecha ASC;
            `;
            const { rows } = await db.query(query, params);
            res.json(rows);
        } catch (err) {
            console.error('Error al obtener pedidos activos:', err);
            res.status(500).send('Error en el servidor');
        }
    });
    router.patch('/pedidos/:id/estado', async (req, res) => {
        const { id } = req.params;
        const { estado } = req.body;
        try {
            const query = `UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *;`;
            const { rows } = await db.query(query, [estado, id]);
            if (rows.length === 0) { return res.status(404).send('Pedido no encontrado'); }
            res.json(rows[0]);
        } catch (err) {
            console.error('Error al actualizar estado del pedido:', err);
            res.status(500).send('Error en el servidor');
        }
    });

    // --- RUTAS DE PRODUCTOS ---
    const getProductosConPrecios = async (disponiblesSolo = false, ubicacionId) => {
        const whereClause = disponiblesSolo ? 'AND p.disponible = true' : '';
        const query = `SELECT p.id, p.nombre, p.categoria, p.disponible, (SELECT precio FROM precios_ubicacion pu WHERE pu.producto_id = p.id AND pu.variacion_id IS NULL AND pu.ubicacion_id = $1) as precio, (SELECT json_agg(json_build_object('id', v.id, 'nombre_variacion', v.nombre_variacion, 'precio', pu_var.precio)) FROM variaciones_producto v JOIN precios_ubicacion pu_var ON v.id = pu_var.variacion_id WHERE v.producto_id = p.id AND pu_var.ubicacion_id = $1) as variaciones FROM productos p WHERE EXISTS (SELECT 1 FROM precios_ubicacion pu WHERE pu.producto_id = p.id AND pu.ubicacion_id = $1) ${whereClause} ORDER BY p.categoria, p.nombre ASC;`;
        const { rows } = await db.query(query, [ubicacionId]);
        return rows;
    };
    router.get('/productos/disponibles', async (req, res) => { const { rol, ubicacion_id } = req.auth; let ubicacionFiltro = (rol === 'superadmin') ? (req.query.ubicacion_id || 1) : ubicacion_id; if (!ubicacionFiltro) return res.status(400).send("No se ha especificado una ubicación."); try { const productos = await getProductosConPrecios(true, ubicacionFiltro); res.json(productos); } catch (err) { console.error('Error al obtener productos disponibles:', err); res.status(500).send('Error en el servidor.'); } });
    router.get('/productos/todos', async (req, res) => { const { rol, ubicacion_id } = req.auth; let ubicacionFiltro = (rol === 'superadmin') ? (req.query.ubicacion_id || 1) : ubicacion_id; if (!ubicacionFiltro) return res.status(400).send("No se ha especificado una ubicación."); try { const productos = await getProductosConPrecios(false, ubicacionFiltro); res.json(productos); } catch (err) { console.error('Error al obtener todos los productos:', err); res.status(500).send('Error en el servidor.'); } });
    router.post('/productos', async (req, res) => { const { rol, ubicacion_id } = req.auth; let ubicacionDelProducto = (rol === 'superadmin') ? (req.body.ubicacion_id || 1) : ubicacion_id; if (!ubicacionDelProducto) return res.status(403).send('No se puede crear un producto sin una ubicación.'); const { nombre, precio, categoria, disponible, variaciones } = req.body; const client = await db.getClient(); try { await client.query('BEGIN'); const productoQuery = `INSERT INTO productos (nombre, categoria, disponible) VALUES ($1, $2, $3) RETURNING *;`; const productoResult = await client.query(productoQuery, [nombre, categoria, disponible]); const nuevoProducto = productoResult.rows[0]; if (precio) { await client.query('INSERT INTO precios_ubicacion (producto_id, ubicacion_id, precio) VALUES ($1, $2, $3);', [nuevoProducto.id, ubicacionDelProducto, precio]); } if (variaciones && variaciones.length > 0) { for (const v of variaciones) { if (v.nombre_variacion && v.precio) { const variacionResult = await client.query('INSERT INTO variaciones_producto (producto_id, nombre_variacion) VALUES ($1, $2) RETURNING id;', [nuevoProducto.id, v.nombre_variacion]); const nuevaVariacionId = variacionResult.rows[0].id; await client.query('INSERT INTO precios_ubicacion (producto_id, variacion_id, ubicacion_id, precio) VALUES ($1, $2, $3, $4);', [nuevoProducto.id, nuevaVariacionId, ubicacionDelProducto, v.precio]); } } } await client.query('COMMIT'); res.status(201).json(nuevoProducto); } catch (err) { await client.query('ROLLBACK'); console.error('Error al crear producto:', err); res.status(500).send('Error en el servidor'); } finally { client.release(); } });
    router.put('/productos/:id', async (req, res) => { const { rol, ubicacion_id } = req.auth; let ubicacionDelProducto = (rol === 'superadmin') ? (req.body.ubicacion_id || 1) : ubicacion_id; if (!ubicacionDelProducto) return res.status(403).send('No se puede editar un producto sin una ubicación.'); const { id } = req.params; const { nombre, precio, categoria, disponible, variaciones } = req.body; const client = await db.getClient(); try { await client.query('BEGIN'); const productoQuery = `UPDATE productos SET nombre = $1, categoria = $2, disponible = $3 WHERE id = $4;`; await client.query(productoQuery, [nombre, categoria, disponible, id]); await client.query('DELETE FROM precios_ubicacion WHERE producto_id = $1 AND ubicacion_id = $2;', [id, ubicacionDelProducto]); if (precio) { await client.query('INSERT INTO precios_ubicacion (producto_id, ubicacion_id, precio) VALUES ($1, $2, $3);', [id, ubicacionDelProducto, precio]); } const variacionesAntiguasResult = await client.query('SELECT id FROM variaciones_producto WHERE producto_id = $1;', [id]); if (variacionesAntiguasResult.rows.length > 0) { const variacionesAntiguasIds = variacionesAntiguasResult.rows.map(r => r.id); await client.query('DELETE FROM precios_ubicacion WHERE variacion_id = ANY($1::int[]) AND ubicacion_id = $2', [variacionesAntiguasIds, ubicacionDelProducto]); } await client.query('DELETE FROM variaciones_producto WHERE producto_id = $1;', [id]); if (variaciones && variaciones.length > 0) { for (const v of variaciones) { if (v.nombre_variacion && v.precio) { const variacionResult = await client.query('INSERT INTO variaciones_producto (producto_id, nombre_variacion) VALUES ($1, $2) RETURNING id;', [id, v.nombre_variacion]); const nuevaVariacionId = variacionResult.rows[0].id; await client.query('INSERT INTO precios_ubicacion (producto_id, variacion_id, ubicacion_id, precio) VALUES ($1, $2, $3, $4);', [id, nuevaVariacionId, ubicacionDelProducto, v.precio]); } } } await client.query('COMMIT'); res.json({ message: 'Producto actualizado' }); } catch (err) { await client.query('ROLLBACK'); console.error('Error al actualizar producto:', err); res.status(500).send('Error en el servidor'); } finally { client.release(); } });

    // --- RUTA DE UBICACIONES ---
    router.get('/ubicaciones', async (req, res) => {
        const { rol } = req.auth;
        if (rol !== 'superadmin') { return res.status(403).send('Acceso denegado.'); }
        try { const { rows } = await db.query('SELECT id, nombre FROM ubicaciones ORDER BY nombre ASC;'); res.json(rows); } catch (err) { console.error('Error al obtener ubicaciones:', err); res.status(500).send('Error en el servidor.'); }
    });
    
    // --- RUTAS DE FINANZAS ---
    router.get('/finanzas/saldos', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const ubicacionFiltro = (rol === 'superadmin' && req.query.ubicacion_id) ? req.query.ubicacion_id : ubicacion_id;
        try {
            let query, params;
            const baseQuery = `SELECT cuenta, COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE -monto END), 0) as balance FROM transacciones`;
            if (rol === 'superadmin' && !ubicacionFiltro) {
                query = `${baseQuery} GROUP BY cuenta;`;
                params = [];
            } else {
                if (!ubicacionFiltro) return res.json({ 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } });
                query = `${baseQuery} WHERE ubicacion_id = $1 GROUP BY cuenta;`;
                params = [ubicacionFiltro];
            }
            const { rows } = await db.query(query, params);
            const saldos = { 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } };
            rows.forEach(row => { if (saldos[row.cuenta]) { saldos[row.cuenta].balance = parseFloat(row.balance); } });
            res.json(saldos);
        } catch (err) { console.error('Error al obtener saldos:', err); res.status(500).send('Error en el servidor'); }
    });
    router.get('/finanzas/historial', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const ubicacionFiltro = (rol === 'superadmin' && req.query.ubicacion_id) ? req.query.ubicacion_id : ubicacion_id;
        try {
            let query, params;
            if (rol === 'superadmin' && !ubicacionFiltro) {
                query = `SELECT * FROM transacciones ORDER BY fecha DESC;`;
                params = [];
            } else {
                if (!ubicacionFiltro) return res.json([]);
                query = `SELECT * FROM transacciones WHERE ubicacion_id = $1 ORDER BY fecha DESC;`;
                params = [ubicacionFiltro];
            }
            const { rows } = await db.query(query, params);
            res.json(rows);
        } catch (err) { console.error('Error al obtener historial:', err); res.status(500).send('Error en el servidor'); }
    });
    router.post('/finanzas/transaccion', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const ubicacionDeLaTransaccion = (rol === 'superadmin' && req.body.ubicacion_id) ? req.body.ubicacion_id : ubicacion_id;
        if (!ubicacionDeLaTransaccion) return res.status(403).send('No se puede crear una transacción sin una ubicación.');
        const { descripcion, monto, cuenta, tipo = 'Egreso' } = req.body;
        try {
            const query = `INSERT INTO transacciones (descripcion, tipo, cuenta, monto, ubicacion_id) VALUES ($1, $2, $3, $4, $5) RETURNING *;`;
            const { rows } = await db.query(query, [descripcion, tipo, cuenta, monto, ubicacionDeLaTransaccion]);
            res.status(201).json(rows[0]);
        } catch (err) { console.error('Error al crear transacción:', err); res.status(500).send('Error en el servidor'); }
    });
    router.put('/finanzas/transaccion/:id', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const { id } = req.params;
        const { descripcion, monto, cuenta } = req.body;
        try {
            let query, params;
            if (rol === 'superadmin') {
                query = `UPDATE transacciones SET descripcion = $1, monto = $2, cuenta = $3 WHERE id = $4 RETURNING *;`;
                params = [descripcion, monto, cuenta, id];
            } else {
                query = `UPDATE transacciones SET descripcion = $1, monto = $2, cuenta = $3 WHERE id = $4 AND ubicacion_id = $5 RETURNING *;`;
                params = [descripcion, monto, cuenta, id, ubicacion_id];
            }
            const { rows } = await db.query(query, params);
            if (rows.length === 0) return res.status(404).send('Transacción no encontrada o sin permisos para editar.');
            res.json(rows[0]);
        } catch (err) { console.error('Error al actualizar transacción:', err); res.status(500).send('Error en el servidor'); }
    });
    router.delete('/finanzas/transaccion/:id', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const { id } = req.params;
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            let getTransQuery, getTransParams;
            if (rol === 'superadmin') {
                getTransQuery = 'SELECT * FROM transacciones WHERE id = $1';
                getTransParams = [id];
            } else {
                getTransQuery = 'SELECT * FROM transacciones WHERE id = $1 AND ubicacion_id = $2';
                getTransParams = [id, ubicacion_id];
            }
            const transaccionRes = await client.query(getTransQuery, getTransParams);
            if (transaccionRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).send('Transacción no encontrada o sin permisos para eliminar.');
            }
            const { tipo, pedido_id } = transaccionRes.rows[0];
            if (tipo === 'Ingreso' && pedido_id) {
                await client.query('DELETE FROM transacciones WHERE pedido_id = $1', [pedido_id]);
                await client.query('DELETE FROM pedidos WHERE id = $1', [pedido_id]);
            } else {
                await client.query('DELETE FROM transacciones WHERE id = $1', [id]);
            }
            await client.query('COMMIT');
            res.status(204).send();
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error al eliminar transacción:', err);
            res.status(500).send('Error en el servidor');
        } finally {
            client.release();
        }
    });

    // --- RUTAS DE REPORTES ---
    const buildReportWhereClause = (rol, ubicacion_id, ubicacionFiltro, aliasTabla) => {
        let whereClauses = [`(${aliasTabla}.fecha AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`];
        let params = [TIMEZONE];
        if (rol === 'superadmin' && ubicacionFiltro) {
            whereClauses.push(`${aliasTabla}.ubicacion_id = $${params.length + 3}`);
            params.push(ubicacionFiltro);
        } else if (rol !== 'superadmin' && ubicacion_id) {
            whereClauses.push(`${aliasTabla}.ubicacion_id = $${params.length + 3}`);
            params.push(ubicacion_id);
        }
        return { whereClause: whereClauses.join(' AND '), params };
    };
    router.get('/reportes/cierre-caja', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const { fecha_inicio, fecha_fin, ubicacion_id: ubicacionQuery } = req.query;
        const { whereClause, params } = buildReportWhereClause(rol, ubicacion_id, ubicacionQuery, 'transacciones');
        try {
            const query = `SELECT cuenta, COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE 0 END), 0) as ingresos, COALESCE(SUM(CASE WHEN tipo = 'Egreso' THEN monto ELSE 0 END), 0) as gastos FROM transacciones WHERE ${whereClause} GROUP BY cuenta;`;
            const { rows } = await db.query(query, [fecha_inicio, fecha_fin, ...params]);
            const resultado = { 'Efectivo': { ingresos: 0, gastos: 0, balance: 0 }, 'Transferencia': { ingresos: 0, gastos: 0, balance: 0 }, 'Tarjeta': { ingresos: 0, gastos: 0, balance: 0 } };
            rows.forEach(row => { if (resultado[row.cuenta]) { resultado[row.cuenta].ingresos = parseFloat(row.ingresos); resultado[row.cuenta].gastos = parseFloat(row.gastos); resultado[row.cuenta].balance = parseFloat(row.ingresos) - parseFloat(row.gastos); } });
            res.json(resultado);
        } catch (err) { console.error('Error generando cierre de caja:', err); res.status(500).send('Error en el servidor'); }
    });

    // --- RUTA DE PRODUCTOS VENDIDOS (CON LA CORRECCIÓN) ---
    router.get('/reportes/productos-vendidos', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const { fecha_inicio, fecha_fin, ubicacion_id: ubicacionQuery } = req.query;
        const { whereClause, params } = buildReportWhereClause(rol, ubicacion_id, ubicacionQuery, 'ped');
        try {
            // ¡CONSULTA CORREGIDA!
            const query = `
                SELECT 
                    p.nombre, 
                    SUM(dp.cantidad) as total_vendido,
                    SUM(dp.cantidad * dp.precio_unitario) as ingresos_generados
                FROM productos p 
                JOIN detalles_pedido dp ON p.id = dp.producto_id 
                JOIN pedidos ped ON dp.pedido_id = ped.id 
                WHERE ${whereClause} 
                GROUP BY p.nombre 
                ORDER BY ingresos_generados DESC;
            `;
            const { rows } = await db.query(query, [fecha_inicio, fecha_fin, ...params]);
            res.json(rows);
        } catch (err) { 
            console.error('Error generando reporte de productos:', err); 
            res.status(500).send('Error en el servidor'); 
        }
    });

    router.get('/reportes/direcciones', async (req, res) => {
        const { rol, ubicacion_id } = req.auth;
        const { fecha_inicio, fecha_fin, ubicacion_id: ubicacionQuery } = req.query;
        const { whereClause, params } = buildReportWhereClause(rol, ubicacion_id, ubicacionQuery, 'ped');
        try {
            const query = `SELECT ped.direccion_mz, ped.direccion_villa, COUNT(DISTINCT ped.id) as numero_pedidos, SUM(t.monto) as total_consumido FROM pedidos ped JOIN transacciones t ON ped.id = t.pedido_id AND t.tipo = 'Ingreso' WHERE ${whereClause} GROUP BY ped.direccion_mz, ped.direccion_villa ORDER BY total_consumido DESC;`;
            const { rows } = await db.query(query, [fecha_inicio, fecha_fin, ...params]);
            res.json(rows);
        } catch (err) { console.error('Error generando reporte por dirección:', err); res.status(500).send('Error en el servidor'); }
    });

    return router;
};