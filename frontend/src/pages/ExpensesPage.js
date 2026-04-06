// frontend/src/pages/FinancePage.js

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './FinancePage.css';
import { useLocation } from '../context/LocationContext'; 

function FinancePage() {
    // Cuentas que siempre queremos ver
    const CUENTAS_POR_DEFECTO = { 
        'Efectivo': { balance: 0 }, 
        'Transferencia': { balance: 0 }, 
        'Tarjeta': { balance: 0 },
        'Pedidos Ya': { balance: 0 } 
    };

    const [saldos, setSaldos] = useState(CUENTAS_POR_DEFECTO);
    const [historial, setHistorial] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [cuenta, setCuenta] = useState('Efectivo');
    const [editingTransaction, setEditingTransaction] = useState(null);

    const { selectedLocationId } = useLocation();
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const userRole = userInfo ? userInfo.rol : null;

    const fetchData = useCallback(async () => {
        try {
            const [saldosRes, historialRes] = await Promise.all([
                api.getSaldos(selectedLocationId), 
                api.getHistorialTransacciones(selectedLocationId)
            ]);
            
            // FUSIONAR: Combinamos las cuentas por defecto con lo que viene del servidor
            // Esto evita que "Pedidos Ya" desaparezca si el servidor no lo envía.
            const saldosFusionados = { ...CUENTAS_POR_DEFECTO, ...saldosRes.data };
            
            setSaldos(saldosFusionados);
            setHistorial(historialRes.data);
            setStatusMessage('');
        } catch (error) { 
            console.error("Error al cargar datos financieros:", error);
            setStatusMessage('Error al cargar datos.'); 
        }
    }, [selectedLocationId]); 

    useEffect(() => { 
        fetchData();
    }, [fetchData]); 

    const handleSubmitEgreso = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) return alert('Por favor, complete todos los campos.');
        
        if (userRole === 'superadmin' && !selectedLocationId) {
            return alert('Como Super Admin, selecciona una ubicación.');
        }

        try {
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
            setStatusMessage('Transacción actualizada.');
            setEditingTransaction(null);
            fetchData();
        } catch (error) { setStatusMessage('Error al actualizar.'); }
    };

    const handleDelete = async (transaccion) => {
        const msg = transaccion.tipo === 'Ingreso' 
            ? `¿CANCELAR Pedido #${transaccion.pedido_id}?`
            : `¿Eliminar gasto "${transaccion.descripcion}"?`;
        if (window.confirm(msg)) {
            try {
                await api.eliminarTransaccion(transaccion.id);
                fetchData();
            } catch (error) { setStatusMessage('Error al eliminar.'); }
        }
    };

    const formatCurrency = (value) => `$${(parseFloat(value) || 0).toFixed(2)}`;

    return (
        <>
            {editingTransaction && (
                <div className="edit-modal-overlay">
                    <div className="edit-modal">
                        <h2>Editar Transacción</h2>
                        <form onSubmit={handleUpdate}>
                            <label>Descripción:</label>
                            <textarea value={editingTransaction.descripcion} onChange={(e) => setEditingTransaction({...editingTransaction, descripcion: e.target.value})} required disabled={editingTransaction.tipo === 'Ingreso'} />
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
                                <button type="submit">Guardar</button>
                                <button type="button" onClick={() => setEditingTransaction(null)}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div>
                <h1>Finanzas y Saldos</h1>
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
                        <h2>Registrar Egreso</h2>
                        <form onSubmit={handleSubmitEgreso}>
                            <label>Descripción:</label><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows="2" />
                            <label>Monto ($):</label><input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
                            <label>Pagar desde:</label>
                            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia">Transferencia</option>
                                <option value="Pedidos Ya">Pedidos Ya</option>
                            </select>
                            <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Egreso</button>
                        </form>
                    </div>
                    <div className="transaction-history-panel">
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Descripción</th>
                                        <th>Cuenta</th>
                                        <th>Monto</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historial.map(t => (
                                        <tr key={t.id}>
                                            <td>{new Date(t.fecha).toLocaleString()}</td>
                                            <td>{t.descripcion}</td>
                                            <td>{t.cuenta}</td>
                                            <td className={`amount-cell ${t.tipo === 'Ingreso' ? 'income' : 'expense'}`}>
                                                {t.tipo === 'Ingreso' ? '+' : '-'} {formatCurrency(t.monto)}
                                            </td>
                                            <td className="action-cell">
                                                <button onClick={() => handleEdit(t)}>Editar</button>
                                                <button onClick={() => handleDelete(t)}>Eliminar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default FinancePage;