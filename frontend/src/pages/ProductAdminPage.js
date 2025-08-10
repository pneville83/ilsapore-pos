// frontend/src/pages/ProductAdminPage.js
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './ProductAdminPage.css';

function ProductAdminPage() {
    const [productos, setProductos] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isNew, setIsNew] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        fetchProductos();
    }, []);

    const fetchProductos = async () => {
        try {
            const response = await api.getProductosTodos();
            setProductos(response.data);
        } catch (error) {
            console.error("Error al cargar productos", error);
            setStatusMessage('Error al cargar productos.');
        }
    };

    const handleSelectProduct = (producto) => {
        setSelectedProduct(JSON.parse(JSON.stringify(producto)));
        setIsNew(false);
        setStatusMessage('');
    };

    const handleNewProduct = () => {
        setSelectedProduct({ 
            nombre: '', precio: '', categoria: 'General', 
            disponible: true, variaciones: [] 
        });
        setIsNew(true);
        setStatusMessage('');
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSelectedProduct(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleVariationChange = (index, e) => {
        const { name, value } = e.target;
        const updatedVariations = [...selectedProduct.variaciones];
        updatedVariations[index][name] = value;
        setSelectedProduct(prev => ({ ...prev, variaciones: updatedVariations }));
    };

    const addVariation = () => {
        const newVariation = { nombre_variacion: '', precio: '' };
        setSelectedProduct(prev => ({ ...prev, variaciones: prev.variaciones ? [...prev.variaciones, newVariation] : [newVariation] }));
    };

    const removeVariation = (index) => {
        const updatedVariations = [...selectedProduct.variaciones];
        updatedVariations.splice(index, 1);
        setSelectedProduct(prev => ({ ...prev, variaciones: updatedVariations }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatusMessage('Guardando...');
        try {
            if (isNew) {
                await api.crearProducto(selectedProduct);
                setStatusMessage('¡Producto creado con éxito!');
            } else {
                await api.actualizarProducto(selectedProduct.id, selectedProduct);
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
        <div className="product-admin-layout">
            <div className="product-list-panel">
                <h2>Gestión de Productos</h2>
                <button onClick={handleNewProduct}>Añadir Nuevo Producto</button>
                {statusMessage && <p className="status-message">{statusMessage}</p>}
                
                {/* ¡NUEVO! Envolvemos la tabla en el contenedor responsivo */}
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Categoría</th>
                                <th>Precio Base / Variaciones</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {productos.map(p => (
                                <tr key={p.id} onClick={() => handleSelectProduct(p)} className={!p.disponible ? 'disabled' : ''}>
                                    <td>{p.nombre}</td>
                                    <td>{p.categoria}</td>
                                    <td>
                                        {p.variaciones && p.variaciones.length > 0
                                            ? `${p.variaciones.length} Variaciones`
                                            : (p.precio ? `$${parseFloat(p.precio).toFixed(2)}` : 'N/A')
                                        }
                                    </td>
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
                        <label>Nombre del Producto:</label>
                        <input name="nombre" value={selectedProduct.nombre} onChange={handleChange} required />
                        <label>Categoría:</label>
                        <input name="categoria" value={selectedProduct.categoria} onChange={handleChange} required placeholder="Ej: Hamburguesas, Pizzas..." />
                        <label className="checkbox-label">
                            <input type="checkbox" name="disponible" checked={selectedProduct.disponible} onChange={handleChange} />
                            Disponible
                        </label>
                        <div className="variation-section">
                            <h4>Precio Base y Variaciones</h4>
                            <p>Si un producto tiene variaciones, el precio base puede dejarse en blanco.</p>
                            <label>Precio Base:</label>
                            <input type="number" step="0.01" name="precio" value={selectedProduct.precio || ''} onChange={handleChange} placeholder="Ej: 2.50" />
                            <hr/>
                            <h5>Variaciones (Tamaños)</h5>
                            {selectedProduct.variaciones && selectedProduct.variaciones.map((v, index) => (
                                <div key={index} className="variation-row">
                                    <input name="nombre_variacion" value={v.nombre_variacion} onChange={e => handleVariationChange(index, e)} placeholder="Nombre (Ej: Mediana)" />
                                    <input type="number" step="0.01" name="precio" value={v.precio} onChange={e => handleVariationChange(index, e)} placeholder="Precio" />
                                    <button type="button" onClick={() => removeVariation(index)}>×</button>
                                </div>
                            ))}
                            <button type="button" className="add-variation-btn" onClick={addVariation}>Añadir Variación</button>
                        </div>
                        <div className="form-buttons">
                            <button type="submit">Guardar Cambios</button>
                            <button type="button" onClick={() => setSelectedProduct(null)}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
export default ProductAdminPage;