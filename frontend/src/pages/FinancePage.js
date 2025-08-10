// frontend/src/pages/FinancePage.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './FinancePage.css';

function FinancePage() {
    const [saldos, setSaldos] = useState({ 'Efectivo': { balance: 0 }, 'Transferencia': { balance: 0 }, 'Tarjeta': { balance: 0 } });
    const [historial, setHistorial] = useState([]);
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [cuenta, setCuenta] = useState('Efectivo');
    const [statusMessage, setStatusMessage] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const [saldosRes, historialRes] = await Promise.all([
                api.getSaldos(),
                api.getHistorialTransacciones()
            ]);
            setSaldos(saldosRes.data);
            setHistorial(historialRes.data);
        } catch (error) {
            console.error("Error al cargar datos financieros:", error);
            setStatusMessage('Error al cargar datos.');
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSubmitEgreso = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) return alert('Por favor, complete todos los campos.');
        try {
            await api.crearEgreso({ descripcion, monto, cuenta });
            setStatusMessage('Egreso registrado con éxito.');
            setDescripcion('');
            setMonto('');
            fetchData();
        } catch (error) {
            console.error("Error al registrar egreso:", error);
            setStatusMessage('Error al registrar el egreso.');
        }
    };

    const formatCurrency = (value) => {
        const amount = parseFloat(value) || 0;
        return `$${amount.toFixed(2)}`;
    };

    return (
        <div>
            <h1>Finanzas y Saldos</h1>
            <div className="finance-header">
                {Object.keys(saldos).map(key => (
                    <div key={key} className="balance-card">
                        <h3>Saldo en {key}</h3>
                        <p className={`amount ${saldos[key].balance >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(saldos[key].balance)}
                        </p>
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
                            <option value="Tarjeta">Tarjeta</option>
                        </select>
                        <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Egreso</button>
                    </form>
                    {statusMessage && <p>{statusMessage}</p>}
                </div>

                <div className="transaction-history-panel">
                    <h2>Historial de Transacciones</h2>
                    {/* ¡NUEVO! Envolvemos la tabla en el contenedor responsivo */}
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Descripción</th>
                                    <th>Cuenta</th>
                                    <th>Monto</th>
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