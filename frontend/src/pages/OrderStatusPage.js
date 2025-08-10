// frontend/src/pages/OrderStatusPage.js

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import api from '../services/api';
import alertSound from '../assets/alert.mp3';
import './OrderStatusPage.css'; // Asegúrate de que el CSS está importado

const SOCKET_URL = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace('/api', '') : 'http://localhost:4000';

function OrderStatusPage() {
    const [activeOrders, setActiveOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [audio] = useState(new Audio(alertSound));

    useEffect(() => {
        const fetchInitialOrders = async () => {
            try {
                const response = await api.getPedidosActivos();
                setActiveOrders(response.data);
            } catch (err) {
                setError('Error al cargar los pedidos activos.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialOrders();

        const socket = io(SOCKET_URL);
        socket.on('connect', () => console.log('Conectado a WebSocket:', socket.id));
        socket.on('nuevo_pedido', (nuevoPedido) => {
            audio.play().catch(e => console.error("Error al reproducir sonido:", e));
            setActiveOrders(prevOrders => [nuevoPedido, ...prevOrders]);
            setNewOrderAlert(nuevoPedido.id);
            setTimeout(() => setNewOrderAlert(null), 5000);
        });
        socket.on('disconnect', () => console.log('Desconectado de WebSocket.'));
        
        return () => {
            socket.disconnect();
        };
    }, [audio]);

    const handleFinalizeOrder = async (orderId) => {
        try {
            await api.actualizarEstadoPedido(orderId, 'Finalizado');
            setActiveOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
        } catch (err) {
            setError('Error al finalizar el pedido.');
            console.error(err);
        }
    };

    if (isLoading) {
        return <p>Cargando pedidos activos...</p>;
    }

    if (error) {
        return <p style={{ color: 'red' }}>{error}</p>;
    }

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
                                <h3>Pedido #{order.id}</h3>
                                <span>{new Date(order.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="ticket-body">
                                <h4>Contenido:</h4>
                                <ul>
                                    {order.productos?.map((prod, index) => (
                                        <li key={index}>
                                            <span><strong className="item-quantity">{prod.cantidad}x</strong> {prod.nombre}</span>
                                        </li>
                                    ))}
                                </ul>

                                <h4>Entrega:</h4>
                                <p>Mz: {order.direccion_mz}, Villa: {order.direccion_villa}</p>
                                
                                {order.observaciones && (
                                    <>
                                        <h4>Observaciones:</h4>
                                        <p>{order.observaciones}</p>
                                    </>
                                )}
                            </div>
                            <div className="ticket-footer">
                                <button
                                    className="finalize-button"
                                    onClick={() => handleFinalizeOrder(order.id)}
                                >
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