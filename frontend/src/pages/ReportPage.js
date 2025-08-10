// frontend/src/pages/ReportPage.js

import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import api from '../services/api';
import { exportToExcel } from '../utils/exportUtils';

function ReportPage() {
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [reportType, setReportType] = useState('cierre-caja');
    const [reportData, setReportData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const formatDate = (date) => date.toISOString().split('T')[0];

    const handleGenerateReport = async () => {
        setIsLoading(true);
        setError('');
        setReportData(null);
        const f_inicio = formatDate(startDate);
        const f_fin = formatDate(endDate);
        try {
            let response;
            if (reportType === 'cierre-caja') {
                response = await api.getReporteCierreCaja(f_inicio, f_fin);
            } else if (reportType === 'productos-vendidos') {
                response = await api.getReporteProductosVendidos(f_inicio, f_fin);
            } else {
                response = await api.getReporteDirecciones(f_inicio, f_fin);
            }
            setReportData(response.data);
        } catch (err) {
            setError('Error al generar el reporte.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = () => {
        if (!reportData) return alert("No hay datos para exportar.");
        
        let dataToExport;
        if (reportType === 'cierre-caja') {
            dataToExport = Object.keys(reportData).map(key => ({
                'Forma de Pago': key,
                'Ingresos ($)': reportData[key].ingresos,
                'Gastos ($)': reportData[key].gastos,
                'Balance Final ($)': reportData[key].balance
            }));
        } else {
            dataToExport = reportData;
        }

        if (Array.isArray(dataToExport) && dataToExport.length === 0) return alert("No hay datos para exportar.");
        const fileName = `reporte_${reportType}_${formatDate(startDate)}_a_${formatDate(endDate)}`;
        exportToExcel(dataToExport, fileName);
    };

    // --- RENDERIZADO DE TABLAS (REESTRUCTURADO Y SEGURO) ---
    const renderTable = () => {
        if (!reportData) return null;

        // --- Renderizado para Cierre de Caja (Tipo: Objeto) ---
        if (reportType === 'cierre-caja') {
            const data = reportData;
            const formasDePago = Object.keys(data);
            const totalGeneral = formasDePago.reduce((sum, key) => sum + (data[key].balance || 0), 0);
            return (
                <table>
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Ingresos por Ventas</th>
                            <th>Salidas por Gastos</th>
                            <th>Balance Final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formasDePago.map(key => (
                            <tr key={key}>
                                <td><strong>{key}</strong></td>
                                <td style={{color: 'var(--success-color)'}}>+ ${(data[key].ingresos || 0).toFixed(2)}</td>
                                <td style={{color: 'var(--danger-color)'}}>- ${(data[key].gastos || 0).toFixed(2)}</td>
                                <td><strong>${(data[key].balance || 0).toFixed(2)}</strong></td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan="3"><strong>Balance Total General</strong></td>
                            <td><strong>${totalGeneral.toFixed(2)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            );
        }

        // --- Renderizado para otros reportes (Tipo: Array) ---
        // Verificamos si es un array antes de intentar usar funciones de array
        if (Array.isArray(reportData)) {
            if (reportData.length === 0) {
                return <p>No hay datos para el rango de fechas seleccionado.</p>;
            }

            if (reportType === 'productos-vendidos') {
                const totalUnidades = reportData.reduce((sum, row) => sum + (parseInt(row.total_vendido, 10) || 0), 0);
                const totalIngresos = reportData.reduce((sum, row) => sum + (parseFloat(row.ingresos_generados) || 0), 0);
                return (
                    <table>
                        <thead>
                            <tr><th>Producto</th><th>Total Vendido (unidades)</th><th>Ingresos Generados</th></tr>
                        </thead>
                        <tbody>
                            {reportData.map((row, index) => (
                                <tr key={index}>
                                    <td>{row.nombre}</td>
                                    <td>{row.total_vendido}</td>
                                    <td>${(parseFloat(row.ingresos_generados) || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr><td><strong>Total</strong></td><td><strong>{totalUnidades}</strong></td><td><strong>${totalIngresos.toFixed(2)}</strong></td></tr>
                        </tfoot>
                    </table>
                );
            }

            if (reportType === 'direcciones') {
                const totalPedidos = reportData.reduce((sum, row) => sum + (parseInt(row.numero_pedidos, 10) || 0), 0);
                const totalIngresos = reportData.reduce((sum, row) => sum + (parseFloat(row.total_consumido) || 0), 0);
                return (
                    <table>
                        <thead>
                            <tr><th>Manzana</th><th>Villa</th><th>Número de Pedidos</th><th>Total Consumido</th></tr>
                        </thead>
                        <tbody>
                            {reportData.map((row, index) => (
                                <tr key={index}>
                                    <td>{row.direccion_mz}</td>
                                    <td>{row.direccion_villa}</td>
                                    <td>{row.numero_pedidos}</td>
                                    <td>${(parseFloat(row.total_consumido) || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr><td colSpan="2"><strong>Total</strong></td><td><strong>{totalPedidos}</strong></td><td><strong>${totalIngresos.toFixed(2)}</strong></td></tr>
                        </tfoot>
                    </table>
                );
            }
        }
        
        // Si no coincide con ningún tipo, no renderiza nada.
        return null;
    };

    return (
        <div>
            <h1>Reportes de Ventas</h1>
            <div className="report-controls">
                <div><label>Fecha Inicio:</label><DatePicker selected={startDate} onChange={(date) => setStartDate(date)} /></div>
                <div><label>Fecha Fin:</label><DatePicker selected={endDate} onChange={(date) => setEndDate(date)} /></div>
                <div>
                    <label>Tipo de Reporte:</label>
                    <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                        <option value="cierre-caja">Cierre de Caja</option>
                        <option value="productos-vendidos">Ventas por Producto</option>
                        <option value="direcciones">Ventas por Dirección</option>
                    </select>
                </div>
                <button onClick={handleGenerateReport} disabled={isLoading}>{isLoading ? 'Generando...' : 'Generar Reporte'}</button>
            </div>
            <hr />
            <div className="report-results">
                {error && <p style={{color: 'var(--danger-color)'}}>{error}</p>}
                {reportData && (
                    <button onClick={handleExport} className="export-button">Exportar a Excel</button>
                )}
                {renderTable()}
            </div>
        </div>
    );
}

export default ReportPage;