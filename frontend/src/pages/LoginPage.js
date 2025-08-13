// frontend/src/pages/LoginPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import logo from '../assets/logo-ilsapore.png';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // La llamada a la API ahora devuelve un objeto con { token, user }
      const response = await api.login(username, password);

      // --- ¡CAMBIO CLAVE! Guardamos el token y la info del usuario en localStorage ---
      // localStorage es persistente, a diferencia de sessionStorage.
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('userInfo', JSON.stringify(response.data.user));

      // Redirección basada en el rol del usuario
      const role = response.data.user.rol;
      if (role === 'cocina') {
        navigate('/estado-pedidos');
      } else if (role === 'mesero') {
        navigate('/pedidos');
      } else { // admin y superadmin
        navigate('/pedidos');
      }
    } catch (err) {
      setError('Usuario o contraseña incorrectos.');
      console.error('Error de login:', err);
    }
  };

  return (
    <div className="login-container">
      <img src={logo} alt="Logo de Il Sapore POS" className="login-logo" />
      <h2>Iniciar Sesión</h2>
      <form onSubmit={handleLogin}>
        <div>
          <label style={{textAlign: 'left', display: 'block'}}>Usuario:</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label style={{textAlign: 'left', display: 'block'}}>Contraseña:</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" style={{width: '100%'}}>Ingresar</button>
      </form>
      {error && <p style={{ color: 'var(--danger-color)', marginTop: '10px' }}>{error}</p>}
    </div>
  );
}

export default LoginPage;