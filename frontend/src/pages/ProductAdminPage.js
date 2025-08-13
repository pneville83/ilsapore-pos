// frontend/src/pages/ProductAdminPage.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './ProductAdminPage.css';

// --- ¡CORRECCIÓN #1! Obtenemos la info del usuario una sola vez ---
const userInfo = JSON.parse(localStorage.getItem('userInfo'));
const userRole = userInfo ? userInfo.rol : null;

function ProductAdminPage() {
    const [productos, setProductos] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isNew, setIsNew] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [ubicaciones, setUbicaciones] = useState([]);
    const [selectedUbicacionId, setSelectedUbicacionId] = useState('1');
    
    // --- ¡CORRECCIÓN #2! Optimizamos las dependencias ---
    const fetchProductos = useCallback(async () => {
        const locationToFetch = (userRole === 'superadmin') ? selectedUbicacionId : userInfo?.ubicacion_id;
        if (!locationToFetch) return;
        
        try {
            setStatusMessage('Cargando productos...');
            const response = await api.getProductosTodos(locationToFetch);
            setProductos(response.data);
            setStatusMessage('');
        } catch (error) {
            console.error("Error al cargar productos", error);
            setStatusMessage('Error al cargar productos para esta ubicación.');
            setProductos([]); // Limpiamos la lista en caso de error
        }
    }, [userRole, selectedUbicacionId, userInfo?.ubicacion_id]); // Usamos dependencias primitivas y estables

    useEffect(() => {
        fetchProductos();
    }, [fetchProductos]);

    useEffect(() => {
        if (userRole === 'superadmin') {
            api.getUbicaciones()
                .then(response => setUbicaciones(response.data))
                .catch(err => console.error("Error al cargar ubicaciones", err));
        }
    }, [userRole]);

    const handleSelectProduct = (producto) => { setSelectedProduct(JSON.parse(JSON.stringify(producto))); setIsNew(false); setStatusMessage(''); };
    const handleNewProduct = () => { setSelectedProduct({ nombre: '', precio: '', categoria: 'General', disponible: true, variaciones: [] }); setIsNew(true); setStatusMessage(''); };
    const handleChange = (e) => { const { name, value, type, checked } = e.target; setSelectedProduct(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value })); };
    const handleVariationChange = (index, e) => { const { name, value } = e.target; const updatedVariations = [...selectedProduct.variaciones]; updatedVariations[index][name] = value; setSelectedProduct(prev => ({ ...prev, variaciones: updatedVariations })); };
    const addVariation = () => { const newVariation = { nombre_variacion: '', precio: '' }; setSelectedProduct(prev => ({ ...prev, variaciones: prev.variaciones ? [...prev.variaciones, newVariation] : [newVariation] })); };
    const removeVariation = (index) => { const updatedVariations = [...selectedProduct.variaciones]; updatedVariations.splice(index, 1); setSelectedProduct(prev => ({ ...prev, variaciones: updatedVariations })); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatusMessage('Guardando...');
        const locationForSubmit = (userRole === 'superadmin') ? selectedUbicacionId : userInfo?.ubicacion_id;
        
        try {
            if (isNew) {
                await api.crearProducto(selectedProduct, locationForSubmit);
                setStatusMessage('¡Producto creado con éxito!');
            } else {
                await api.actualizarProducto(selectedProduct.id, selectedProduct, locationForSubmit);
                setStatusMessage('¡Producto actualizado con éxito!');
            }
            fetchProductos();
            setSelectedProduct(null);
        } catch (error) {
            console.error("Error al guardar el producto", error);
            setStatusMessage('Error al guardar el producto.');
        }
    };

    return (
        <div>
            {userRole === 'superadmin' && (
                <div className="location-filter">
                    <label>Gestionando Menú de:</label>
                    <select value={selectedUbicacionId} onChange={(e) => setSelectedUbicacionId(e.target.value)}>
                        {ubicaciones.map(u => ( <option key={u.id} value={u.id}>{u.nombre}</option>))}
                    </select>
                </div>
            )}

            <div className="product-admin-layout">
                <div className="product-list-panel">
                    <h2>Gestión de Productos</h2>
                    <button onClick={handleNewProduct}>Añadir Nuevo Producto</button>
                    {statusMessage && <p>{statusMessage}</p>}
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Nombre</th><th>Categoría</th><th>Precio / Variaciones</th><th>Estado</th></tr></thead>
                            <tbody>
                                {productos.map(p => (
                                    <tr key={p.id} onClick={() => handleSelectProduct(p)} className={!p.disponible ? 'disabled' : ''}>
                                        <td>{p.nombre}</td>
                                        <td>{p.categoria}</td>
                                        <td>{p.variaciones && p.variaciones.length > 0 ? `${p.variaciones.length} Variaciones` : (p.precio ? `$${parseFloat(p.precio).toFixed(2)}` : 'N/A')}</td>
                                        <td>{p.disponible ? 'Disponible' : 'No Disponible'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {selectedProduct && (
                    <div className="product-form-panel">
                        <h3>{isNew ? 'Nuevo Producto' : 'Editar Producto'}</h3>
                        <form onSubmit={handleSubmit}>
                            <label>Nombre:</label>
                            <input name="nombre" value={selectedProduct.nombre} onChange={handleChange} required />
                            <label>Categoría:</label>
                            <input name="categoria" value={selectedProduct.categoria} onChange={handleChange} required />
                            <label className="checkbox-label"><input type="checkbox" name="disponible" checked={selectedProduct.disponible} onChange={handleChange} /> Disponible</label>
                            <div className="variation-section">
                                <h4>Precio Base y Variaciones</h4>
                                <p>Si hay variaciones, el precio base puede quedar vacío.</p>
                                <label>Precio Base:</label>
                                <input type="number" step="0.01" name="precio" value={selectedProduct.precio || ''} onChange={handleChange} />
                                <hr/>
                                <h5>Variaciones (Tamaños)</h5>
                                {selectedProduct.variaciones && selectedProduct.variaciones.map((v, index) => (
                                    <div key={v.id || index} className="variation-row">
                                        <input name="nombre_variacion" value={v.nombre_variacion} onChange={e => handleVariationChange(index, e)} placeholder="Nombre (Ej: Mediana)" />
                                        <input type="number" step="0.01" name="precio" value={v.precio} onChange={e => handleVariationChange(index, e)} placeholder="Precio" />
                                        <button type="button" onClick={() => removeVariation(index)}>×</button>
                                    </div>
                                ))}
                                <button type="button" className="add-variation-btn" onClick={addVariation}>Añadir Variación</button>
                            </div>
                            <div className="form-buttons">
                                <button type="submit">Guardar</button>
                                <button type="button" onClick={() => setSelectedProduct(null)}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
export default ProductAdminPage;