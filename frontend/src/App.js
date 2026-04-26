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
  
  // --- LÓGICA DE NOTIFICACIÓN GLOBAL (BANNER) ---
  const [globalAlert, setGlobalAlert] = useState(null);
  const lastMaxId = useRef(null);

  useEffect(() => {
    const checkOrders = async () => {
      try {
        const response = await api.getPedidosActivos();
        const pedidos = response.data;

        if (pedidos && pedidos.length > 0) {
          const maxIdActual = Math.max(...pedidos.map(p => p.id));
          
          if (lastMaxId.current === null) {
            console.log("📍 Sistema de alertas activado en Vercel. ID base:", maxIdActual);
            lastMaxId.current = maxIdActual;
            return;
          }

          if (maxIdActual > lastMaxId.current) {
            const nuevoPedido = pedidos.find(p => p.id === maxIdActual);
            const obs = (nuevoPedido?.observaciones || "").toLowerCase();
            
            // Detectar si es del bot
            if (obs.includes('bot') || obs.includes('paga con')) {
              console.log("🚨 NUEVO PEDIDO DEL BOT DETECTADO:", maxIdActual);
              lastMaxId.current = maxIdActual;

              // 1. Sonar Alerta
              const audio = new Audio(alertSound);
              audio.play().catch(e => console.log("🔊 Audio bloqueado por navegador"));

              // 2. Mostrar Banner Visual (En lugar de confirm)
              setGlobalAlert(`🍕 ¡NUEVO PEDIDO DE WHATSAPP #${maxIdActual}!`);
              
              // 3. Quitar el banner automáticamente a los 15 segundos
              setTimeout(() => setGlobalAlert(null), 15000);
            } else {
              lastMaxId.current = maxIdActual;
            }
          }
        }
      } catch (err) {
        console.error("Error en polling:", err);
      }
    };

    const interval = setInterval(checkOrders, 10000);
    checkOrders();

    return () => clearInterval(interval);
  }, []);
  // ----------------------------------------------

  const [ubicaciones, setUbicaciones] = useState([]);
  const [selectedLocationUI, setSelectedLocationUI] = useState(getLocationFilter());

  useEffect(() => {
    if (userRole === 'superadmin') {
        api.getUbicaciones()
            .then(res => setUbicaciones(res.data))
            .catch(err => console.error("Error al cargar ubicaciones", err));
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
      {/* BANNER VISUAL DE NOTIFICACIÓN */}
      {globalAlert && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#27ae60',
          color: 'white',
          padding: '15px 40px',
          borderRadius: '10px',
          zIndex: 9999,
          fontWeight: 'bold',
          boxShadow: '0 5px 25px rgba(0,0,0,0.4)',
          border: '2px solid white',
          cursor: 'pointer',
          textAlign: 'center',
          animation: 'fadeInDown 0.5s ease'
        }} onClick={() => { navigate('/estado-pedidos'); setGlobalAlert(null); }}>
          {globalAlert}
          <div style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>Hacer clic aquí para ir a pedidos</div>
        </div>
      )}

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