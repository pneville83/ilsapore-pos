// frontend/src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

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
  const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
  return isLoggedIn ? children : <Navigate to="/" />;
}

// --- COMPONENTE MainLayout (MODIFICADO) ---
function MainLayout({ children }) {
  const navigate = useNavigate();
  const userRole = sessionStorage.getItem('userRole'); 
  
  const handleLogout = () => {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('userRole');
    navigate('/');
  };

  return (
    <div>
      <nav className="main-nav">
        {/* ¡NUEVO! Contenedor para la cabecera (logo y botón) */}
        <div className="nav-header">
          <img src={logo} alt="Logo Il Sapore" className="nav-logo" />
          <button onClick={handleLogout}>Cerrar Sesión</button>
        </div>
        
        {/* Los enlaces ahora están separados */}
        <div className="nav-links">
          {userRole === 'admin' && <Link to="/pedidos">Tomar Pedido</Link>}
          <Link to="/estado-pedidos">Estado de Pedidos</Link>
          {userRole === 'admin' && <Link to="/productos">Gestionar Productos</Link>}
          {userRole === 'admin' && <Link to="/finanzas">Finanzas</Link>}
          {userRole === 'admin' && <Link to="/reportes">Reportes</Link>}
        </div>
      </nav>
      <main className="container">{children}</main>
    </div>
  );
}

// El resto del componente App no cambia
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