// frontend/src/pages/OrderStatusPage.js
import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import api from '../services/api';
import alertSound from '../assets/alert.mp3';
import './OrderStatusPage.css';
// Ya no se importa 'useLocation'

const SOCKET_URL = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace('/api', '') : 'http://localhost:4000';

function OrderStatusPage() {
    const [activeOrders, setActiveOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [audio] = useState(new Audio(alertSound));

    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const userRole = userInfo?.rol;

    const fetchActiveOrders = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await api.getPedidosActivos();
            setActiveOrders(response.data);
            setError('');
        } catch (err) {
            setError('Error al cargar los pedidos activos.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActiveOrders();
    }, [fetchActiveOrders]);

    useEffect(() => {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => console.log('Conectado a WebSocket:', socket.id));
        
        socket.on('nuevo_pedido', (nuevoPedido) => {
            fetchActiveOrders(); // La forma más simple de asegurar consistencia
            setNewOrderAlert(nuevoPedido.id);
            setTimeout(() => setNewOrderAlert(null), 5000);
        });

        socket.on('disconnect', () => console.log('Desconectado de WebSocket.'));
        
        return () => {
            socket.disconnect();
        };
    }, [audio, fetchActiveOrders]);

    const handleFinalizeOrder = async (orderId) => {
        try {
            await api.actualizarEstadoPedido(orderId, 'Finalizado');
            setActiveOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
        } catch (err) {
            setError('Error al finalizar el pedido.');
            console.error(err);
        }
    };

    if (isLoading) { return <p>Cargando pedidos activos...</p>; }
    if (error) { return <p style={{ color: 'red' }}>{error}</p>; }

    return (
        <div>
            <div className="status-page-header">
                <h1>Pedidos Activos</h1>
                <span className="order-count">{activeOrders.length}</span>
            </div>
            {activeOrders.length === 0 ? (
                <p>¡No hay pedidos pendientes! Buen trabajo.</p>
            ) : (
                <div className="status-page-layout">
                    {activeOrders.map(order => (
                        <div key={order.id} className={`order-ticket ${newOrderAlert === order.id ? 'new-order-alert' : ''}`}>
                            <div className="ticket-header">
                                <div>
                                    <h3>Pedido #{order.id}</h3>
                                    {userRole === 'superadmin' && order.nombre_ubicacion && (
                                        <span className="ticket-location">{order.nombre_ubicacion}</span>
                                    )}
                                </div>
                                <span>{new Date(order.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="ticket-body">
                                <h4>Contenido:</h4>
                                <ul>
                                    {order.productos?.map((prod, index) => (
                                        <li key={index}>
                                            <span>
                                                <strong className="item-quantity">{prod.cantidad}x</strong> 
                                                {prod.nombre}
                                                {prod.nombre_variacion && <span className="item-variation">({prod.nombre_variacion})</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <h4>Entrega:</h4>
                                <p>Mz: {order.direccion_mz}, Villa: {order.direccion_villa}</p>
                                {order.observaciones && (<><h4>Observaciones:</h4><p>{order.observaciones}</p></>)}
                                
                                <div className="ticket-payment-summary">
                                    <div className="total">
                                        Total: ${parseFloat(order.total).toFixed(2)}
                                    </div>
                                    <div className="payment-method">
                                        Pagado con: {order.pagos?.map(p => p.cuenta).join(', ') || 'N/A'}
                                    </div>
                                </div>
                            </div>
                            <div className="ticket-footer">
                                <button className="finalize-button" onClick={() => handleFinalizeOrder(order.id)}>
                                    Finalizar y Despachar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default OrderStatusPage;