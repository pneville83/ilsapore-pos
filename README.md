# ✨ Il Sapore POS - Sistema de Punto de Venta ✨

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&logoColor=white)

**Il Sapore POS** es una aplicación web full-stack, completa y a medida, diseñada para la gestión integral de un negocio de comida. Desde la toma de pedidos hasta el cierre de caja, esta herramienta centraliza todas las operaciones diarias en una interfaz limpia, moderna y en tiempo real.

## 🚀 Características Principales

Este sistema de punto de venta ha sido desarrollado con funcionalidades robustas para optimizar el flujo de trabajo:

-   **Gestión de Múltiples Roles:**
    -   **Administrador:** Acceso total a todas las funcionalidades del sistema.
    -   **Cocina:** Una vista simplificada enfocada en la recepción y gestión de pedidos activos.

-   **Módulo de Pedidos Avanzado:**
    -   **Menú por Categorías:** Productos organizados en pestañas (Pizzas, Hamburguesas, etc.) para una selección rápida.
    -   **Variaciones de Productos:** Soporte para productos complejos con diferentes tamaños y precios (ej. pizzas).
    -   **Pagos Múltiples:** Permite registrar un solo pedido con varias formas de pago (ej. parte en Efectivo, parte en Transferencia).

-   **Gestión de Cocina en Tiempo Real:**
    -   **Tablero de Estado de Pedidos:** Una vista en vivo de todas las órdenes "En Preparación".
    -   **Notificaciones con Sonido:** El usuario `cocina` clave: `cocina123` recibe una alerta sonora instantánea cuando un nuevo pedido es generado, ideal para entornos sin impresora.
    -   **Flujo de Estados:** Los pedidos pasan de "En Preparación" a "Finalizado" con un solo clic, manteniendo el tablero siempre actualizado.

-   **Administración Completa del Negocio:**
    -   **CRUD de Productos:** Módulo para crear, actualizar (precios, disponibilidad, categoría) y gestionar el menú completo, incluyendo sus variaciones.
    -   **Módulo de Finanzas (Tesorería):**
        -   Visualización de saldos en tiempo real por cuenta (Efectivo, Transferencia, Tarjeta), permitiendo saldos negativos para un control de deuda/inversión.
        -   Registro de **egresos y gastos generales** (pago de servicios, arriendo, etc.) que afectan los saldos.
        -   **Kardex de Transacciones:** Un historial completo de todos los ingresos por ventas y egresos por gastos.

-   **Reportes y Análisis:**
    -   **Cierre de Caja Diario:** Un reporte financiero que consolida ingresos y gastos por cada forma de pago, mostrando el balance final del día.
    -   Reportes de **productos más vendidos** y **zonas (Mz/Villa) de mayor consumo**.
    -   **Exportación a Excel:** Todos los reportes se pueden descargar en formato `.xlsx` para un análisis detallado.

-   **Integración con Hardware:**
    -   **Impresión de Tickets:** Conexión directa con impresoras térmicas Epson para la impresión física de comandas.

---

## 🔧 Tecnologías Utilizadas

-   **Frontend:**
    -   **React:** Para una interfaz de usuario dinámica y reactiva.
    -   **React Router:** Para la navegación entre páginas.
    -   **Axios:** Para la comunicación con la API del backend.
    -   **Socket.IO Client:** Para la comunicación en tiempo real y notificaciones.
-   **Backend:**
    -   **Node.js & Express:** Para construir una API REST robusta y rápida.
    -   **Socket.IO:** Para habilitar la comunicación bidireccional en tiempo real.
    -   **PostgreSQL (node-postgres):** Para la conexión con la base de datos.
    -   **Dotenv:** Para la gestión de variables de entorno seguras.
-   **Base de Datos:**
    -   **PostgreSQL:** Una base de datos relacional potente y confiable.

---

## 🛠️ Guía de Instalación y Puesta en Marcha

Sigue estos pasos para ejecutar el proyecto en un entorno de desarrollo local.

### Prerrequisitos

-   [Node.js](https://nodejs.org/) (v16 o superior)
-   [PostgreSQL](https://www.postgresql.org/download/)
-   [Git](https://git-scm.com/)

### 1. Clonar el Repositorio

```sh
git clone https://github.com/pneville83/ilsapore-pos.git
cd ilsapore_pos