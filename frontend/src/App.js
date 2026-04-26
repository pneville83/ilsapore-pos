// frontend/src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

import { setLocationFilter, getLocationFilter } from './utils/sessionUtils';
import api from './services/api';
import alertSound from './assets/alert.mp3';

// Importación de Páginas
import LoginPage from './pages/LoginPage';
import OrderPage from './pages/OrderPage';
import ReportPage from './pages/ReportPage';
import ProductAdminPage from './pages/ProductAdminPage';
import OrderStatusPage from './pages/OrderStatusPage';
import FinancePage from './pages/FinancePage';
import logo from './assets/logo-ilsapore.png';

// Importación de Estilos
import './App.css'; 
import './pages/OrderPage.css';
import './pages/ProductAdminPage.css';
import './pages/OrderStatusPage.css';
import './pages/FinancePage.css';

function PrivateRoute({ children }) {
  const isLoggedIn = !!localStorage.getItem('authToken');
  return isLoggedIn ? children : <Navigate to="/" />;
}

function MainLayout({ children }) {
  const navigate = useNavigate();
  const userInfo = JSON.parse(localStorage.getItem('userInfo'));
  const userRole = userInfo ? userInfo.rol : null;
  
  // --- LÓGICA DE NOTIFICACIÓN MEJORADA ---
  const lastMaxId = useRef(null);

  useEffect(() => {
    const checkOrders = async () => {
      try {
        const response = await api.getPedidosActivos();
        const pedidos = response.data;

        if (pedidos && pedidos.length > 0) {
          const maxIdActual = Math.max(...pedidos.map(p => p.id));
          
          if (lastMaxId.current === null) {
            lastMaxId.current = maxIdActual;
            return;
          }

          if (maxIdActual > lastMaxId.current) {
            const nuevoPedido = pedidos.find(p => p.id === maxIdActual);
            const obs = (nuevoPedido?.observaciones || "").toLowerCase();
            
            console.log(`🚨 Nuevo pedido detectado ID: ${maxIdActual}. Obs: "${obs}"`);

            // DETECCIÓN INTELIGENTE:
            // Activamos si dice "bot" O si detectamos la frase de pago en efectivo del bot
            const esDelBot = obs.includes('bot') || obs.includes('paga con');

            if (esDelBot) {
              lastMaxId.current = maxIdActual;

              // Sonido
              const audio = new Audio(alertSound);
              audio.play().catch(() => console.log("🔊 Audio bloqueado"));

              // Pop-up
              const ir = window.confirm(`🍕 ¡NUEVO PEDIDO DE WHATSAPP!\n\nPedido #${maxIdActual}\n\n¿Quieres ir a revisarlo ahora?`);
              if (ir) navigate('/estado-pedidos');
              
            } else {
              // Si es manual, solo actualizamos el ID para no repetir
              lastMaxId.current = maxIdActual;
            }
          }
        }
      } catch (err) {
        console.error("❌ Error en el sondeo:", err);
      }
    };

    const interval = setInterval(checkOrders, 8000);
    checkOrders();

    return () => clearInterval(interval);
  }, [navigate]);
  // ----------------------------------------------

  const [ubicaciones, setUbicaciones] = useState([]);
  const [selectedLocationUI, setSelectedLocationUI] = useState(getLocationFilter());

  useEffect(() => {
    if (userRole === 'superadmin') {
        api.getUbicaciones()
            .then(res => setUbicaciones(res.data))
            .catch(err => console.error("Error al cargar ubicaciones para el filtro", err));
    }
  }, [userRole]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    sessionStorage.clear(); 
    navigate('/');
  };

  const handleLocationChange = (e) => {
      const locationId = e.target.value || null;
      setSelectedLocationUI(locationId); 
      setLocationFilter(locationId);    
      window.location.reload();
  };

  return (
    <div>
      <nav className="main-nav">
        <div className="nav-header">
          <img src={logo} alt="Logo Il Sapore" className="nav-logo" />
          <button onClick={handleLogout}>Cerrar Sesión</button>
        </div>
        <div className="nav-links">
            {(userRole === 'admin' || userRole === 'mesero' || userRole === 'superadmin') && (<Link to="/pedidos">Tomar Pedido</Link>)}
            {(userRole === 'admin' || userRole === 'cocina' || userRole === 'superadmin') && (<Link to="/estado-pedidos">Estado de Pedidos</Link>)}
            {(userRole === 'admin' || userRole === 'superadmin') && (
                <>
                    <Link to="/productos">Gestionar Productos</Link>
                    <Link to="/finanzas">Finanzas</Link>
                    <Link to="/reportes">Reportes</Link>
                </>
            )}
        </div>
      </nav>

      {userRole === 'superadmin' && (
        <div className="admin-toolbar">
            <div className="location-filter-global">
                <label>Viendo Datos de:</label>
                <select 
                    value={selectedLocationUI || ''} 
                    onChange={handleLocationChange}
                >
                    <option value="">Todas las Ubicaciones</option>
                    {ubicaciones.map(u => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                </select>
            </div>
        </div>
      )}

      <main className="container">{children}</main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/pedidos" element={<PrivateRoute><MainLayout><OrderPage /></MainLayout></PrivateRoute>} />
          <Route path="/estado-pedidos" element={<PrivateRoute><MainLayout><OrderStatusPage /></MainLayout></PrivateRoute>} />
          <Route path="/productos" element={<PrivateRoute><MainLayout><ProductAdminPage /></MainLayout></PrivateRoute>} />
          <Route path="/finanzas" element={<PrivateRoute><MainLayout><FinancePage /></MainLayout></PrivateRoute>} />
          <Route path="/reportes" element={<PrivateRoute><MainLayout><ReportPage /></MainLayout></PrivateRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;