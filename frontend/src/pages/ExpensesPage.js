// frontend/src/pages/FinancePage.js

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './FinancePage.css';
import { useLocation } from '../context/LocationContext'; // <-- 1. Importamos el hook

function FinancePage() {
    const [saldos, setSaldos] = useState({ 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } });
    const [historial, setHistorial] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [cuenta, setCuenta] = useState('Efectivo');
    const [editingTransaction, setEditingTransaction] = useState(null);

    // --- 2. Usamos el hook y obtenemos la info del usuario ---
    const { selectedLocationId } = useLocation();
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const userRole = userInfo ? userInfo.rol : null;

    const fetchData = useCallback(async () => {
        try {
            // --- 3. Pasamos el filtro a las llamadas de la API ---
            const [saldosRes, historialRes] = await Promise.all([
                api.getSaldos(selectedLocationId), 
                api.getHistorialTransacciones(selectedLocationId)
            ]);
            setSaldos(saldosRes.data);
            setHistorial(historialRes.data);
            setStatusMessage('');
        } catch (error) { 
            console.error("Error al cargar datos financieros:", error);
            setStatusMessage('Error al cargar datos.'); 
        }
    }, [selectedLocationId]); // La dependencia es la ubicación global

    useEffect(() => { 
        fetchData();
    }, [fetchData]); // Se ejecuta al montar y cuando cambia el filtro

    const handleSubmitEgreso = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) return alert('Por favor, complete todos los campos.');
        
        // El superadmin necesita seleccionar una ubicación para registrar un gasto
        if (userRole === 'superadmin' && !selectedLocationId) {
            return alert('Como Super Admin, por favor selecciona una ubicación específica del filtro para registrar el gasto.');
        }

        try {
            // El backend usará la ubicación del token para admins, y para el superadmin,
            // la API de 'crearTransaccion' espera el 'ubicacion_id' en el cuerpo
            const ubicacionParaGasto = selectedLocationId; 
            
            await api.crearTransaccion({ descripcion, monto, cuenta, tipo: 'Egreso', ubicacion_id: ubicacionParaGasto });
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

    return (
        <>
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
                            </select>
                            <div className="edit-modal-buttons">
                                <button type="submit">Guardar Cambios</button>
                                <button type="button" onClick={() => setEditingTransaction(null)} style={{backgroundColor: 'var(--secondary-color)'}}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div>
                <h1>Finanzas y Saldos de Cuentas</h1>
                <div className="finance-header">{Object.keys(saldos).map(key => (<div key={key} className="balance-card"><h3>Saldo en {key}</h3><p className={`amount ${saldos[key].balance >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(saldos[key].balance)}</p></div>))}</div>
                <div className="finance-layout">
                    <div className="new-expense-panel">
                        <h2>Registrar Egreso/Gasto</h2>
                        <form onSubmit={handleSubmitEgreso}>
                            <label>Descripción:</label><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows="3" />
                            <label>Monto ($):</label><input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
                            <label>Pagar desde la cuenta de:</label>
                            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia">Transferencia</option>
                                {/* Ocultamos la opción "Tarjeta" para gastos ya que no es común */}
                            </select>
                            <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Egreso</button>
                        </form>
                        {statusMessage && <p>{statusMessage}</p>}
                    </div>
                    <div className="transaction-history-panel">
                        <h2>Historial de Transacciones</h2>
                        <div className="table-container">
                            <table>
                                <thead><tr><th>Fecha</th><th>Descripción</th><th>Cuenta</th><th>Monto</th><th>Acciones</th></tr></thead>
                                <tbody>
                                    {historial.map(t => (
                                        <tr key={t.id}>
                                            <td>{new Date(t.fecha).toLocaleString()}</td>
                                            <td>{t.descripcion}</td>
                                            <td>{t.cuenta}</td>
                                            <td className={`amount-cell ${t.tipo === 'Ingreso' ? 'income' : 'expense'}`}>{t.tipo === 'Ingreso' ? '+' : '-'} {formatCurrency(t.monto)}</td>
                                            <td className="action-cell">
                                                <button className="edit-btn" onClick={() => handleEdit(t)}>Editar</button>
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