// frontend/src/pages/FinancePage.js

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import DatePicker from 'react-datepicker';
import './FinancePage.css';

function FinancePage() {
    const [saldos, setSaldos] = useState({ 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } });
    const [historial, setHistorial] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [cuenta, setCuenta] = useState('Efectivo');
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [cuentaFiltro, setCuentaFiltro] = useState('');

    const fetchData = useCallback(async () => {
        try {
            setStatusMessage('Cargando datos...');
            const filtros = {};
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
            const [saldosRes, historialRes] = await Promise.all([
                api.getSaldos(), 
                api.getHistorialTransacciones(filtros)
            ]);
            setSaldos(saldosRes.data);
            setHistorial(historialRes.data);
            setStatusMessage('');
        } catch (error) { 
            console.error("Error al cargar datos financieros:", error);
            setStatusMessage('Error al cargar datos.'); 
        }
    }, [startDate, endDate, cuentaFiltro]);

    useEffect(() => { 
        fetchData();
    }, [fetchData]);

    const handleSubmitEgreso = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) return alert('Por favor, complete todos los campos.');
        try {
            await api.crearTransaccion({ descripcion, monto, cuenta, tipo: 'Egreso' });
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
                                <option value="Tarjeta">Tarjeta</option> {/* <<< AÑADIDO: Opción para editar */}
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
                        <label>Pagar desde la cuenta de:</label>
                        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Tarjeta">Tarjeta</option> {/* <<< AÑADIDO: Opción para registrar nuevo egreso */}
                        </select>
                        <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Egreso</button>
                    </form>
                    {statusMessage && <p>{statusMessage}</p>}
                </div>
                <div className="transaction-history-panel">
                    <h2>Historial de Transacciones</h2>
                    <div className="finance-filters">
                        <div><label>Desde:</label><DatePicker selected={startDate} onChange={date => setStartDate(date)} isClearable placeholderText="Fecha de inicio" dateFormat="dd/MM/yyyy"/></div>
                        <div><label>Hasta:</label><DatePicker selected={endDate} onChange={date => setEndDate(date)} isClearable placeholderText="Fecha de fin" dateFormat="dd/MM/yyyy"/></div>
                        <div><label>Cuenta:</label><select value={cuentaFiltro} onChange={e => setCuentaFiltro(e.target.value)}><option value="">Todas</option><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option></select></div> {/* <<< AÑADIDO: Opción para filtrar */}
                        <button type="button" onClick={clearFilters} style={{backgroundColor: 'var(--secondary-color)'}}>Limpiar Filtros</button>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>Fecha</th><th>Descripción</th><th>Detalles del Pedido</th><th>Cuenta</th><th>Monto</th><th>Acciones</th></tr>
                            </thead>
                            <tbody>
                                {historial.map(t => (
                                    <tr key={t.id}>
                                        <td>{new Date(t.fecha).toLocaleString()}</td>
                                        <td>{t.descripcion}</td>
                                        <td>
                                            {t.productos && t.productos.length > 0 ? (
                                                <div className="transaction-details">
                                                    <ul className="product-list">{t.productos.map((prod, index) => (<li key={index}>{prod.cantidad}x {prod.nombre} {prod.nombre_variacion ? `(${prod.nombre_variacion})` : ''}</li>))}</ul>
                                                    <div className="address-detail">Mz: {t.direccion_mz}, Villa: {t.direccion_villa}</div>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
export default FinancePage;