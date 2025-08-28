# Esquema de Base de Datos para Il Sapore POS y WhatsApp Bot

Este documento describe la estructura de la base de datos utilizada por el sistema Il Sapore POS y su bot de WhatsApp, alojada en Supabase (PostgreSQL).

## Propósito

El objetivo de este esquema es gestionar las operaciones de un punto de venta (productos, pedidos, usuarios, ubicaciones, transacciones) y la funcionalidad de verificación de pagos por transferencia para el bot de WhatsApp.

## Cómo Usar este Script

Este script SQL se puede ejecutar en un entorno de PostgreSQL (como un nuevo proyecto en Supabase) para recrear toda la estructura de la base de datos desde cero.

**ADVERTENCIA:** Si lo ejecutas en una base de datos existente, asegúrate de entender las implicaciones de los comandos `DROP TABLE IF EXISTS` (si los descomentas), ya que borrarán datos. Úsalo con precaución, preferiblemente en entornos de desarrollo o bases de datos vacías.

## Script SQL

```sql
-- SQL para la Creación de la Base de Datos Il Sapore POS y Bot

-- NOTA IMPORTANTE:
-- Este script recreará la estructura de tus tablas tal como las has descrito.
-- Antes de ejecutarlo en un entorno de producción, asegúrate de entender
-- cada paso. Si ya tienes datos, este script SOLO DEBE USARSE
-- para generar documentación o en un nuevo entorno.

-- =========================================================
-- Opcional: Eliminar tablas existentes (para recrear desde cero)
-- CUIDADO: Esto BORRARÁ todos tus datos. Úsalo solo en entornos de desarrollo/pruebas.
-- Para un entorno nuevo, estas líneas no son necesarias.
-- =========================================================
/*
DROP TABLE IF EXISTS public.pending_transfers CASCADE;
DROP TABLE IF EXISTS public.detalles_pedido CASCADE;
DROP TABLE IF EXISTS public.transacciones CASCADE;
DROP TABLE IF EXISTS public.precios_ubicacion CASCADE;
DROP TABLE IF EXISTS public.variaciones_producto CASCADE;
DROP TABLE IF EXISTS public.productos CASCADE;
DROP TABLE IF EXISTS public.pedidos CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.ubicaciones CASCADE;
*/


-- =========================================================
-- TABLAS BASE
-- =========================================================

-- Tabla: ubicaciones
-- Representa las diferentes sucursales o puntos de venta de Il Sapore.
CREATE TABLE public.ubicaciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    direccion TEXT NOT NULL
);

-- Tabla: usuarios
-- Almacena los usuarios que acceden al sistema POS (admins, empleados).
CREATE TABLE public.usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Almacena el hash de la contraseña (nunca la contraseña en texto plano)
    rol VARCHAR(50) NOT NULL, -- Rol del usuario (ej: 'admin', 'empleado')
    ubicacion_id INT REFERENCES public.ubicaciones(id) -- Ubicación a la que pertenece el usuario
);

-- Tabla: productos
-- Define los productos generales disponibles en Il Sapore.
-- Nota: La categoría se almacena como texto. Para una gestión más estricta,
-- se podría normalizar a una tabla 'categorias' separada.
CREATE TABLE public.productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    categoria VARCHAR(255),
    disponible BOOLEAN DEFAULT TRUE -- Indica si el producto está actualmente disponible para la venta
);

-- Tabla: variaciones_producto
-- Permite definir diferentes variantes para un producto (ej: "Pizza Americana", variaciones: "Pequeña", "Mediana", "Grande").
CREATE TABLE public.variaciones_producto (
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE, -- Producto al que pertenece la variación
    nombre_variacion VARCHAR(255) NOT NULL, -- Nombre de la variación (ej: "Mediana", "Coca Cola")
    -- Puedes añadir aquí un precio base si cada variación tiene un precio fijo por defecto.
    -- UNIQUE (producto_id, nombre_variacion) -- Restricción opcional para asegurar unicidad
);


-- =========================================================
-- TABLAS CON RELACIONES Y PROCESOS
-- =========================================================

-- Tabla: pedidos
-- Registra los pedidos realizados por los clientes.
CREATE TABLE public.pedidos (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW(), -- Marca de tiempo de la creación del pedido
    cliente_whatsapp TEXT NOT NULL, -- Número de WhatsApp del cliente para seguimiento
    direccion_mz VARCHAR(255) NOT NULL,
    direccion_villa VARCHAR(255) NOT NULL,
    total NUMERIC(10, 2) NOT NULL, -- Costo total del pedido
    observaciones TEXT, -- Notas adicionales sobre el pedido
    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE', -- Estado actual del pedido (ej: 'PENDIENTE', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO')
    ubicacion_id INT REFERENCES public.ubicaciones(id) -- La ubicación donde se generó el pedido
);

-- Tabla: detalles_pedido
-- Detalla cada artículo incluido en un pedido específico (relación muchos a muchos entre pedidos y productos).
CREATE TABLE public.detalles_pedido (
    pedido_id INT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE, -- Pedido al que pertenece el detalle
    producto_id INT NOT NULL REFERENCES public.productos(id), -- Producto en el detalle
    variacion_id INT REFERENCES public.variaciones_producto(id), -- Variación específica del producto (si aplica)
    cantidad INT NOT NULL,
    precio_unitario NUMERIC(10, 2) NOT NULL, -- Precio del producto/variación al momento de la compra
    nombre_variacion VARCHAR(255), -- Nombre de la variación para referencia rápida
    PRIMARY KEY (pedido_id, producto_id, COALESCE(variacion_id, 0)) -- Clave primaria compuesta para unicidad, manejando variacion_id nula
);

-- Tabla: precios_ubicacion
-- Permite definir precios específicos para productos o variaciones en diferentes ubicaciones.
CREATE TABLE public.precios_ubicacion (
    id SERIAL PRIMARY KEY,
    producto_id INT NOT NULL REFERENCES public.productos(id),
    ubicacion_id INT NOT NULL REFERENCES public.ubicaciones(id),
    precio NUMERIC(10, 2) NOT NULL,
    variacion_id INT REFERENCES public.variaciones_producto(id), -- Variación específica (opcional)
    UNIQUE (producto_id, ubicacion_id, COALESCE(variacion_id, 0)) -- Un precio único por producto, ubicación y (opcionalmente) variación
);

-- Tabla: transacciones
-- Registra todas las transacciones monetarias relacionadas con los pedidos.
CREATE TABLE public.transacciones (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW(), -- Fecha y hora de la transacción
    descripcion TEXT, -- Detalles de la transacción
    tipo VARCHAR(50) NOT NULL, -- Tipo de transacción (ej: 'pago', 'reembolso')
    cuenta VARCHAR(255), -- Método o cuenta de pago (ej: 'Efectivo', 'Banco Pichincha')
    monto NUMERIC(10, 2) NOT NULL, -- Monto de la transacción
    pedido_id INT REFERENCES public.pedidos(id) ON DELETE SET NULL, -- Pedido asociado a la transacción (puede ser nulo si el pedido se elimina)
    ubicacion_id INT REFERENCES public.ubicaciones(id) -- Ubicación donde ocurrió la transacción
);


-- =========================================================
-- TABLA ESPECÍFICA PARA EL BOT DE WHATSAPP
-- =========================================================

-- Tabla: pending_transfers
-- Almacena la información de las transferencias de pago enviadas por los clientes
-- a través del bot de WhatsApp, que requieren verificación manual.
CREATE TABLE public.pending_transfers (
    id TEXT PRIMARY KEY, -- ID temporal corto (ej: TRF-A1B2) para la referencia del personal
    customer_whatsapp TEXT NOT NULL, -- Número de WhatsApp del cliente
    customer_name TEXT, -- Nombre del cliente (si se pudo obtener)
    media_data TEXT, -- Comprobante de la transferencia en formato Base64 (imagen)
    convo_state_snapshot JSONB, -- Estado completo de la conversación del bot en el momento del envío
    order_details_snapshot JSONB NOT NULL, -- Detalles del pedido asociados (carrito, dirección, etc.)
    status TEXT NOT NULL DEFAULT 'PENDING', -- Estado de la verificación: PENDING, CONFIRMED, REJECTED, CONFIRMED_ERROR_POS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- =========================================================
-- EJEMPLO DE POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- (Activar y ajustar según las necesidades de seguridad de tu proyecto)
-- =========================================================
/*
ALTER TABLE public.pending_transfers ENABLE ROW LEVEL SECURITY;

-- Permite a usuarios anónimos (anon key) insertar nuevas transferencias pendientes
CREATE POLICY "Allow anon inserts for pending transfers"
ON public.pending_transfers FOR INSERT
WITH CHECK (true);

-- Permite a usuarios anónimos (anon key) seleccionar transferencias pendientes (p.ej. para el bot)
CREATE POLICY "Allow anon selects for pending transfers"
ON public.pending_transfers FOR SELECT
USING (true);

-- Permite a usuarios anónimos (anon key) actualizar el estado de las transferencias (p.ej. para el bot al confirmar/rechazar)
CREATE POLICY "Allow anon updates for pending transfers"
ON public.pending_transfers FOR UPDATE
USING (true);
*/