// frontend/src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const api = {
  // Login
  login: (username, password) => axios.post(`${API_URL}/login`, { username, password }),
  
  // Productos
  getProductosDisponibles: () => axios.get(`${API_URL}/productos/disponibles`),
  getProductosTodos: () => axios.get(`${API_URL}/productos/todos`),
  crearProducto: (productoData) => axios.post(`${API_URL}/productos`, productoData),
  actualizarProducto: (id, productoData) => axios.put(`${API_URL}/productos/${id}`, productoData),

  // Pedidos
  crearPedido: (pedidoData) => axios.post(`${API_URL}/pedidos`, pedidoData),
  getPedidosActivos: () => axios.get(`${API_URL}/pedidos/activos`),
  actualizarEstadoPedido: (id, nuevoEstado) => axios.patch(`${API_URL}/pedidos/${id}/estado`, { estado: nuevoEstado }),

  // ¡NUEVO! Endpoints para Finanzas
  getSaldos: () => axios.get(`${API_URL}/finanzas/saldos`),
  getHistorialTransacciones: () => axios.get(`${API_URL}/finanzas/historial`),
  crearEgreso: (egresoData) => axios.post(`${API_URL}/finanzas/egreso`, egresoData),

  // Reportes
  getReporteCierreCaja: (fecha_inicio, fecha_fin) => axios.get(`${API_URL}/reportes/cierre-caja`, { params: { fecha_inicio, fecha_fin } }),
  getReporteProductosVendidos: (fecha_inicio, fecha_fin) => axios.get(`${API_URL}/reportes/productos-vendidos`, { params: { fecha_inicio, fecha_fin } }),
  getReporteDirecciones: (fecha_inicio, fecha_fin) => axios.get(`${API_URL}/reportes/direcciones`, { params: { fecha_inicio, fecha_fin } })
};

export default api;