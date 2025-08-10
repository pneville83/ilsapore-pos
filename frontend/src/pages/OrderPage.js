// frontend/src/pages/OrderPage.js

import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import './OrderPage.css';

function OrderPage() {
    // --- ESTADOS ---
    const [productos, setProductos] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [carrito, setCarrito] = useState([]);
    const [productoParaVariacion, setProductoParaVariacion] = useState(null);
    const [direccionMz, setDireccionMz] = useState('1'); 
    const [direccionVilla, setDireccionVilla] = useState('1');
    const [observaciones, setObservaciones] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState('');
    
    // ¡NUEVO ESTADO! Para manejar múltiples pagos
    const [pagos, setPagos] = useState([{ forma_pago: 'Efectivo', monto: '' }]);

    const optionsArray = Array.from({ length: 50 }, (_, i) => i + 1);

    // --- EFECTOS Y DATOS MEMORIZADOS ---
    useEffect(() => {
        api.getProductosDisponibles()
          .then(response => {
              setProductos(response.data);
              if (response.data.length > 0) {
                  const categoriasUnicas = [...new Set(response.data.map(p => p.categoria))];
                  setSelectedCategory(categoriasUnicas[0]);
              }
            })
          .catch(() => setSubmitMessage('Error al cargar productos.'));
    }, []);

    const categories = useMemo(() => [...new Set(productos.map(p => p.categoria))], [productos]);
    const filteredProducts = useMemo(() => productos.filter(p => p.categoria === selectedCategory), [productos, selectedCategory]);

    const totalPedido = useMemo(() => {
        return carrito.reduce((total, item) => total + (parseFloat(item.precio_unitario) * item.cantidad), 0);
    }, [carrito]);

    // --- LÓGICA DE PAGOS ---
    const totalPagado = useMemo(() => {
        return pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
    }, [pagos]);

    const restantePorPagar = useMemo(() => {
        return totalPedido - totalPagado;
    }, [totalPagado, totalPedido]);

    const handlePagoChange = (index, e) => {
        const { name, value } = e.target;
        const nuevosPagos = [...pagos];
        nuevosPagos[index][name] = value;
        setPagos(nuevosPagos);
    };

    const addPago = () => {
        setPagos([...pagos, { forma_pago: 'Transferencia', monto: '' }]);
    };

    const removePago = (index) => {
        if (pagos.length > 1) {
            const nuevosPagos = [...pagos];
            nuevosPagos.splice(index, 1);
            setPagos(nuevosPagos);
        }
    };
    
    // --- LÓGICA DEL CARRITO Y PEDIDOS ---
    const agregarAlCarrito = (itemParaAgregar) => {
        setCarrito(prev => {
            const existente = prev.find(item => item.cartId === itemParaAgregar.cartId);
            if (existente) {
                return prev.map(item => item.cartId === itemParaAgregar.cartId ? { ...item, cantidad: item.cantidad + 1 } : item);
            }
            return [...prev, { ...itemParaAgregar, cantidad: 1 }];
        });
    };

    const handleSelectProduct = (producto) => {
        if (producto.variaciones && producto.variaciones.length > 0) {
            setProductoParaVariacion(producto);
        } else {
            agregarAlCarrito({ cartId: producto.id.toString(), producto_id: producto.id, nombre: producto.nombre, precio_unitario: producto.precio, nombre_variacion: null });
        }
    };

    const handleSelectVariation = (variacion) => {
        agregarAlCarrito({ cartId: `${productoParaVariacion.id}-${variacion.id}`, producto_id: productoParaVariacion.id, nombre: productoParaVariacion.nombre, precio_unitario: variacion.precio, nombre_variacion: variacion.nombre_variacion });
        setProductoParaVariacion(null);
    };

    const quitarDelCarrito = (cartId) => {
        setCarrito(prev => prev.filter(item => item.cartId !== cartId));
    };

    const resetForm = () => {
        setCarrito([]);
        setDireccionMz('1');
        setDireccionVilla('1');
        setObservaciones('');
        setPagos([{ forma_pago: 'Efectivo', monto: '' }]);
    };

    const handleGenerarPedido = async () => {
        if (carrito.length === 0) return alert('El pedido está vacío.');
        if (restantePorPagar > 0.01) return alert(`Aún faltan $${restantePorPagar.toFixed(2)} por pagar.`);
        if (restantePorPagar < -0.01) return alert(`El monto pagado excede el total por $${Math.abs(restantePorPagar).toFixed(2)}. Por favor, ajuste los montos.`);

        setIsSubmitting(true);
        setSubmitMessage('');

        const pedido = {
            productos: carrito.map(({ cartId, ...resto }) => resto), // Excluye el cartId
            pagos: pagos.filter(p => parseFloat(p.monto) > 0),
            direccion_mz: direccionMz,
            direccion_villa: direccionVilla,
            total: totalPedido,
            observaciones: observaciones,
        };
        try {
            await api.crearPedido(pedido);
            setSubmitMessage('¡Pedido generado e impreso con éxito!');
            resetForm();
        } catch (err) {
            setSubmitMessage('Error al generar el pedido.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDERIZADO DEL COMPONENTE ---
    return (
        <>
            {productoParaVariacion && (
                <div className="variation-modal-overlay" onClick={() => setProductoParaVariacion(null)}>
                    <div className="variation-modal" onClick={e => e.stopPropagation()}>
                        <h3>Elige un tamaño para {productoParaVariacion.nombre}</h3>
                        <div className="variation-options">
                            {productoParaVariacion.variaciones.map(v => (
                                <button key={v.id} onClick={() => handleSelectVariation(v)}>{v.nombre_variacion} - ${parseFloat(v.precio).toFixed(2)}</button>
                            ))}
                        </div>
                        <button className="cancel-button" onClick={() => setProductoParaVariacion(null)}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="order-page-layout">
                <div className="product-list">
                    <h2>Menú</h2>
                    <div className="category-tabs">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setSelectedCategory(cat)} className={selectedCategory === cat ? 'active' : ''}>{cat}</button>
                        ))}
                    </div>
                    <div className="product-grid">
                        {filteredProducts.map(producto => (
                            <div key={producto.id} className="product-card" onClick={() => handleSelectProduct(producto)}>
                                <h4>{producto.nombre}</h4>
                                <p>{(producto.variaciones && producto.variaciones.length > 0) ? 'Elegir tamaño...' : (producto.precio ? `$${parseFloat(producto.precio).toFixed(2)}` : 'N/A')}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="current-order">
                    <h2>Pedido Actual</h2>
                    <div className="cart-items">
                        {carrito.length === 0 ? <p>Agrega productos desde el menú.</p> :
                            carrito.map(item => (
                                <div key={item.cartId} className="cart-item">
                                    <span>{item.cantidad}x {item.nombre} {item.nombre_variacion ? `(${item.nombre_variacion})` : ''}</span>
                                    <span>${(parseFloat(item.precio_unitario) * item.cantidad).toFixed(2)}</span>
                                    <button onClick={() => quitarDelCarrito(item.cartId)}>×</button>
                                </div>
                            ))
                        }
                    </div>
                    <hr />
                    <h3>Total a Pagar: ${totalPedido.toFixed(2)}</h3>
                    <hr />

                    <h4>Formas de Pago</h4>
                    {pagos.map((pago, index) => (
                        <div key={index} className="pago-row">
                            <select name="forma_pago" value={pago.forma_pago} onChange={e => handlePagoChange(index, e)}>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia">Transferencia</option>
                                <option value="Tarjeta">Tarjeta</option>
                            </select>
                            <input type="number" step="0.01" name="monto" value={pago.monto} onChange={e => handlePagoChange(index, e)} placeholder="Monto" />
                            {pagos.length > 1 && (<button onClick={() => removePago(index)}>×</button>)}
                        </div>
                    ))}
                    <button onClick={addPago} className="add-pago-btn">Añadir otra forma de pago</button>
                    
                    <div className="pago-summary">
                        <p><span>Total Pagado:</span> <strong>${totalPagado.toFixed(2)}</strong></p>
                        <p className={restantePorPagar >= 0.01 ? 'restante' : 'cambio'}>
                            <span>{restantePorPagar >= 0.01 ? 'Restante:' : 'Cambio:'}</span> 
                            <strong>${Math.abs(restantePorPagar).toFixed(2)}</strong>
                        </p>
                    </div>

                    <h4>Dirección de Entrega</h4>
                    <label>Manzana (Mz):</label>
                    <select value={direccionMz} onChange={e => setDireccionMz(e.target.value)}>
                        {optionsArray.map(num => <option key={num} value={num}>{num}</option>)}
                    </select>
                    <label>Villa:</label>
                    <select value={direccionVilla} onChange={e => setDireccionVilla(e.target.value)}>
                        {optionsArray.map(num => <option key={num} value={num}>{num}</option>)}
                    </select>

                    <h4>Observaciones</h4>
                    <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: sin cebolla..." rows="3" />
                    
                    <button onClick={handleGenerarPedido} disabled={isSubmitting || carrito.length === 0} style={{ width: '100%', marginTop: '20px', padding: '15px' }}>
                        {isSubmitting ? 'Generando...' : 'Generar e Imprimir Pedido'}
                    </button>
                    {submitMessage && <p style={{ textAlign: 'center', marginTop: '10px' }}>{submitMessage}</p>}
                </div>
            </div>
        </>
    );
}

export default OrderPage;