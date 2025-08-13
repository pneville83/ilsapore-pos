// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

// Ya no necesitamos el contexto
// import { LocationProvider, useLocation } from './context/LocationContext'; 
import { setLocationFilter, getLocationFilter } from './utils/sessionUtils'; // <-- Importamos la nueva utilidad
import api from './services/api';

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
  
  // Lógica para el Selector de Ubicación Global
  const [ubicaciones, setUbicaciones] = useState([]);
  // El estado local del selector se inicializa con el valor guardado
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
    sessionStorage.clear(); // Limpiamos sessionStorage también
    navigate('/');
  };

  // --- ¡LÓGICA CORREGIDA! ---
  const handleLocationChange = (e) => {
      const locationId = e.target.value || null;
      setSelectedLocationUI(locationId); // Actualiza la UI del selector
      setLocationFilter(locationId);    // Guarda el filtro en sessionStorage
      
      // Forzamos un refresco completo de la página. Es la forma más robusta de
      // asegurar que todos los componentes recarguen sus datos con el nuevo filtro.
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
      {/* Ya no necesitamos el LocationProvider */}
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