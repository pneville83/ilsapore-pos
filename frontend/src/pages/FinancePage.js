// frontend/src/pages/FinancePage.js

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import DatePicker from 'react-datepicker';
import './FinancePage.css';
// Se importa la utilidad de sesión para leer el filtro de ubicación
import { getLocationFilter } from '../utils/sessionUtils'; 

function FinancePage() {
    // 1. Cuentas base que siempre deben mostrarse
    const CUENTAS_BASE = { 
        'Efectivo': { balance: 0 }, 
        'Transferencia': { balance: 0 }, 
        'Tarjeta': { balance: 0 },
        'Pedidos Ya': { balance: 0 } 
    };

    // --- Estados del componente ---
    const [saldos, setSaldos] = useState(CUENTAS_BASE);
    const [historial, setHistorial] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [cuenta, setCuenta] = useState('Efectivo');
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [cuentaFiltro, setCuentaFiltro] = useState('');

    // Se obtiene el ID de la ubicación y el rol del usuario directamente
    const selectedLocationId = getLocationFilter(); 
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const userRole = userInfo ? userInfo.rol : null;

    // --- Lógica de carga de datos ---
    const fetchData = useCallback(async () => {
        // Si es superadmin y no ha elegido local, muestra un mensaje y no carga datos.
        if (userRole === 'superadmin' && !selectedLocationId) {
            setSaldos(CUENTAS_BASE);
            setHistorial([]);
            setStatusMessage('Por favor, selecciona una ubicación para ver los datos.');
            return;
        }

        try {
            setStatusMessage('Cargando datos...');

            // Se construyen los filtros combinando la ubicación con las fechas y la cuenta
            const filtros = {
                ubicacion_id: selectedLocationId 
            };
            if (startDate && endDate) {
                const startOfDay = new Date(startDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                filtros.fecha_inicio = startOfDay.toISOString();
                filtros.fecha_fin = endOfDay.toISOString();
            }
            if (cuentaFiltro) {
                filtros.cuenta = cuentaFiltro;
            }

            // Las llamadas a la API ahora envían el objeto de filtros completo
            const [saldosRes, historialRes] = await Promise.all([
                api.getSaldos(filtros), 
                api.getHistorialTransacciones(filtros)
            ]);

            const saldosFusionados = { ...CUENTAS_BASE, ...saldosRes.data };
            
            setSaldos(saldosFusionados);
            setHistorial(historialRes.data);
            setStatusMessage('');
        } catch (error) { 
            console.error("Error al cargar datos financieros:", error);
            setStatusMessage('Error al cargar datos.'); 
        }
    }, [startDate, endDate, cuentaFiltro, userRole, selectedLocationId]);

    useEffect(() => { 
        fetchData();
    }, [fetchData]);

    // --- Manejadores de eventos ---
    const handleSubmitEgreso = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) return alert('Por favor, complete todos los campos.');
        if (userRole === 'superadmin' && !selectedLocationId) {
            return alert('Como Super Admin, por favor selecciona una ubicación para registrar el egreso.');
        }
        try {
            // Se envía el `ubicacion_id` al crear la transacción
            await api.crearTransaccion({ 
                descripcion, 
                monto, 
                cuenta, 
                tipo: 'Egreso',
                ubicacion_id: selectedLocationId 
            });
            setStatusMessage('Egreso registrado con éxito.');
            setDescripcion(''); setMonto('');
            fetchData();
        } catch (error) { 
            console.error("Error al registrar egreso:", error);
            setStatusMessage('Error al registrar el egreso.'); 
        }
    };

    const handleEdit = (transaccion) => { setEditingTransaction({ ...transaccion }); };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.actualizarTransaccion(editingTransaction.id, {
                descripcion: editingTransaction.descripcion,
                monto: editingTransaction.monto,
                cuenta: editingTransaction.cuenta
            });
            setStatusMessage('Transacción actualizada con éxito.');
            setEditingTransaction(null);
            fetchData();
        } catch (error) { setStatusMessage('Error al actualizar la transacción.'); }
    };
    
    const handleDelete = async (transaccion) => {
        const confirmMessage = transaccion.tipo === 'Ingreso' 
            ? `¿Estás seguro de que quieres CANCELAR el Pedido #${transaccion.pedido_id}?\n\nEsta acción eliminará el pedido y sus transacciones asociadas. Es irreversible.`
            : `¿Estás seguro de que quieres eliminar el gasto "${transaccion.descripcion}"?`;
        if (window.confirm(confirmMessage)) {
            try {
                await api.eliminarTransaccion(transaccion.id);
                setStatusMessage('Operación realizada con éxito.');
                fetchData();
            } catch (error) { setStatusMessage('Error al eliminar.'); }
        }
    };

    const formatCurrency = (value) => `$${(parseFloat(value) || 0).toFixed(2)}`;
    
    const clearFilters = () => {
        setStartDate(null);
        setEndDate(null);
        setCuentaFiltro('');
    };

    return (
        <div>
            {editingTransaction && (
                <div className="edit-modal-overlay">
                    <div className="edit-modal">
                        <h2>Editar Transacción #{editingTransaction.id}</h2>
                        <form onSubmit={handleUpdate}>
                            <label>Descripción:</label>
                            <textarea value={editingTransaction.descripcion} onChange={(e) => setEditingTransaction({...editingTransaction, descripcion: e.target.value})} required rows="3" disabled={editingTransaction.tipo === 'Ingreso'} />
                            <label>Monto ($):</label>
                            <input type="number" step="0.01" value={editingTransaction.monto} onChange={(e) => setEditingTransaction({...editingTransaction, monto: e.target.value})} required />
                            <label>Cuenta:</label>
                            <select value={editingTransaction.cuenta} onChange={(e) => setEditingTransaction({...editingTransaction, cuenta: e.target.value})}>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia">Transferencia</option>
                                <option value="Tarjeta">Tarjeta</option>
                                <option value="Pedidos Ya">Pedidos Ya</option>
                            </select>
                            <div className="edit-modal-buttons">
                                <button type="submit">Guardar Cambios</button>
                                <button type="button" onClick={() => setEditingTransaction(null)} style={{backgroundColor: 'var(--secondary-color)'}}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <h1>Finanzas y Saldos de Cuentas</h1>
            <div className="finance-header">
                {Object.keys(saldos).map(key => (
                    <div key={key} className="balance-card">
                        <h3>Saldo en {key}</h3>
                        <p className={`amount ${saldos[key].balance >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(saldos[key].balance)}</p>
                    </div>
                ))}
            </div>
            <div className="finance-layout">
                <div className="new-expense-panel">
                    <h2>Registrar Egreso/Gasto</h2>
                    <form onSubmit={handleSubmitEgreso}>
                        <label>Descripción:</label>
                        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows="3" />
                        <label>Monto ($):</label>
                        <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
                        <label>Pagar desde:</label>
                        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Tarjeta">Tarjeta</option>
                            <option value="Pedidos Ya">Pedidos Ya</option>
                        </select>
                        <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Egreso</button>
                    </form>
                    {statusMessage && <p className="status-message">{statusMessage}</p>}
                </div>
                <div className="transaction-history-panel">
                    <h2>Historial de Transacciones</h2>
                    <div className="finance-filters">
                        <div><label>Desde:</label><DatePicker selected={startDate} onChange={date => setStartDate(date)} isClearable placeholderText="Fecha de inicio" dateFormat="dd/MM/yyyy"/></div>
                        <div><label>Hasta:</label><DatePicker selected={endDate} onChange={date => setEndDate(date)} isClearable placeholderText="Fecha de fin" dateFormat="dd/MM/yyyy"/></div>
                        <div><label>Cuenta:</label><select value={cuentaFiltro} onChange={e => setCuentaFiltro(e.target.value)}><option value="">Todas</option><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option><option value="Pedidos Ya">Pedidos Ya</option></select></div>
                        <button type="button" onClick={clearFilters} style={{backgroundColor: 'var(--secondary-color)'}}>Limpiar Filtros</button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>Fecha</th><th>Descripción</th><th>Detalles del Pedido</th><th>Cuenta</th><th>Monto</th><th>Acciones</th></tr>
                            </thead>
                            <tbody>
                                {historial.length > 0 ? (
                                    historial.map(t => (
                                        <tr key={t.id}>
                                            <td>{new Date(t.fecha).toLocaleString()}</td>
                                            <td>{t.descripcion}</td>
                                            <td>
                                                {t.productos && t.productos.length > 0 ? (
                                                    <div className="transaction-details">
                                                        <ul className="product-list">{t.productos.map((prod, index) => (<li key={index}>{prod.cantidad}x {prod.nombre} {prod.nombre_variacion ? `(${prod.nombre_variacion})` : ''}</li>))}</ul>
                                                        <div className="address-detail">Mz: {t.direccion_mz}, Villa: {t.direccion_villa}</div>
                                                        
                                                        {t.observaciones && (
                                                            <div className="obs-detail" style={{ marginTop: '5px', padding: '4px', backgroundColor: '#fff9c4', borderLeft: '3px solid #fbc02d', fontStyle: 'italic', fontSize: '0.8rem' }}>
                                                                <strong>Nota:</strong> {t.observaciones}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (<span>-</span>)}
                                            </td>
                                            <td>{t.cuenta}</td>
                                            <td className={`amount-cell ${t.tipo === 'Ingreso' ? 'income' : 'expense'}`}>{t.tipo === 'Ingreso' ? '+' : '-'} {formatCurrency(t.monto)}</td>
                                            <td className="action-cell">
                                                <button className="edit-btn" onClick={() => handleEdit(t)}>Editar</button>
                                                <button onClick={() => handleDelete(t)}>Eliminar</button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center' }}>No hay transacciones para mostrar con los filtros actuales.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FinancePage;