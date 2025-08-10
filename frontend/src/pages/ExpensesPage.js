
// frontend/src/pages/ExpensesPage.js

import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import api from '../services/api';
import './ExpensesPage.css';

function ExpensesPage() {
    const [gastos, setGastos] = useState([]);
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState('');
    const [formaPago, setFormaPago] = useState('Efectivo');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [statusMessage, setStatusMessage] = useState('');

    const formatDate = (date) => date.toISOString().split('T')[0];

    const fetchGastos = useCallback(async () => {
        try {
            const fecha = formatDate(selectedDate);
            const response = await api.getGastos(fecha, fecha);
            setGastos(response.data);
        } catch (error) {
            console.error("Error al cargar gastos:", error);
            setStatusMessage('Error al cargar gastos.');
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchGastos();
    }, [fetchGastos]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!descripcion || !monto) {
            alert('Por favor, complete todos los campos.');
            return;
        }
        try {
            await api.crearGasto({ descripcion, monto, forma_pago: formaPago });
            setStatusMessage('Gasto registrado con éxito.');
            // Limpiar formulario
            setDescripcion('');
            setMonto('');
            // Refrescar la lista de gastos
            fetchGastos();
        } catch (error) {
            console.error("Error al registrar gasto:", error);
            setStatusMessage('Error al registrar el gasto.');
        }
    };

    const handleDelete = async (gastoId) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este gasto?')) {
            try {
                await api.eliminarGasto(gastoId);
                setStatusMessage('Gasto eliminado con éxito.');
                fetchGastos();
            } catch (error) {
                console.error("Error al eliminar gasto:", error);
                setStatusMessage('Error al eliminar el gasto.');
            }
        }
    };

    return (
        <div className="expenses-layout">
            <div className="new-expense-panel">
                <h2>Registrar Nuevo Gasto</h2>
                <form onSubmit={handleSubmit}>
                    <label>Descripción:</label>
                    <textarea 
                        value={descripcion} 
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Ej: Compra de pan, pago de servicio, etc."
                        rows="3"
                        required
                    />

                    <label>Monto ($):</label>
                    <input 
                        type="number" 
                        step="0.01"
                        value={monto} 
                        onChange={(e) => setMonto(e.target.value)}
                        placeholder="Ej: 15.50"
                        required
                    />

                    <label>Forma de Pago:</label>
                    <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                    </select>

                    <button type="submit" style={{width: '100%', marginTop: '10px'}}>Guardar Gasto</button>
                </form>
                {statusMessage && <p>{statusMessage}</p>}
            </div>

            <div className="expense-list-panel">
                <h2>Gastos del Día</h2>
                <div style={{marginBottom: '15px'}}>
                    <label>Ver gastos del día: </label>
                    <DatePicker selected={selectedDate} onChange={(date) => setSelectedDate(date)} />
                </div>
                
                {gastos.length === 0 ? (
                    <p>No se han registrado gastos para la fecha seleccionada.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Descripción</th>
                                <th>Monto</th>
                                <th>Forma de Pago</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gastos.map(gasto => (
                                <tr key={gasto.id}>
                                    <td>{gasto.descripcion}</td>
                                    <td>${parseFloat(gasto.monto).toFixed(2)}</td>
                                    <td>{gasto.forma_pago}</td>
                                    <td className="action-cell">
                                        <button onClick={() => handleDelete(gasto.id)}>Eliminar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default ExpensesPage;