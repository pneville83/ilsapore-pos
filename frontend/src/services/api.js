// frontend/src/services/api.js
import axios from 'axios';
import { getLocationFilter } from '../utils/sessionUtils'; // <-- Importamos la nueva utilidad

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000/api'                // Si estás en tu PC, usa el backend local
    : 'https://ilsapore-pos-backend.onrender.com/api'; // Si estás en Vercel, usa Rende
const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // --- ¡LÓGICA DE FILTRADO AUTOMÁTICO! ---
    // Si el usuario es superadmin, verificamos si hay un filtro guardado.
    if (userInfo && userInfo.rol === 'superadmin') {
        const locationFilter = getLocationFilter(); // Leemos de sessionStorage
        if (locationFilter) {
            // Si hay un filtro, lo añadimos a los parámetros de la petición GET
            if (config.method === 'get') {
                config.params = { ...config.params, ubicacion_id: locationFilter };
            }
        }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const api = {
  login: (username, password) => axios.post(`${API_URL}/login`, { username, password }),
  
  // Productos
  getProductosDisponibles: () => apiClient.get('/productos/disponibles'),
  getProductosTodos: () => apiClient.get('/productos/todos'),
  crearProducto: (productoData, ubicacionId) => apiClient.post('/productos', { ...productoData, ubicacion_id: ubicacionId }),
  actualizarProducto: (id, productoData, ubicacionId) => apiClient.put(`/productos/${id}`, { ...productoData, ubicacion_id: ubicacionId }),

  // Pedidos
  crearPedido: (pedidoData) => apiClient.post('/pedidos', pedidoData),
  getPedidosActivos: () => apiClient.get('/pedidos/activos'),
  actualizarEstadoPedido: (id, nuevoEstado) => apiClient.patch(`/pedidos/${id}/estado`, { estado: nuevoEstado }),

  // Finanzas
  getSaldos: () => apiClient.get('/finanzas/saldos'),
  // --- ¡MODIFICACIÓN! Acepta un objeto 'filtros' ---
  getHistorialTransacciones: (filtros) => apiClient.get('/finanzas/historial', { params: filtros }),
  crearTransaccion: (transaccionData) => apiClient.post('/finanzas/transaccion', transaccionData),
  actualizarTransaccion: (id, transaccionData) => apiClient.put(`/finanzas/transaccion/${id}`, transaccionData),
  eliminarTransaccion: (id) => apiClient.delete(`/finanzas/transaccion/${id}`),
  
  // Ubicaciones
  getUbicaciones: () => apiClient.get('/ubicaciones'),

  // Reportes
  getReporteCierreCaja: (fecha_inicio, fecha_fin) => apiClient.get('/reportes/cierre-caja', { params: { fecha_inicio, fecha_fin } }),
  getReporteProductosVendidos: (fecha_inicio, fecha_fin) => apiClient.get('/reportes/productos-vendidos', { params: { fecha_inicio, fecha_fin } }),
  getReporteDirecciones: (fecha_inicio, fecha_fin) => apiClient.get('/reportes/direcciones', { params: { fecha_inicio, fecha_fin } })
};
export default api;