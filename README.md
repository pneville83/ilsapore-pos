✨ Il Sapore POS - Sistema de Punto de Venta ✨
![alt text](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)

![alt text](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)

![alt text](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)

![alt text](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)

![alt text](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=white)

![alt text](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&logoColor=white)

![alt text](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
Il Sapore POS es una aplicación web full-stack, completa y a medida, diseñada para la gestión integral de un negocio de comida. Desde la toma de pedidos hasta el cierre de caja, esta herramienta centraliza todas las operaciones diarias en una interfaz limpia, moderna y en tiempo real. Además, ahora incorpora un robusto bot de WhatsApp para la toma de pedidos y verificación de pagos por transferencia, agilizando la interacción con el cliente.
🚀 Módulos y Características Principales
Este sistema de punto de venta ha sido desarrollado con funcionalidades robustas para optimizar el flujo de trabajo tanto interno como externo:
1. Módulo de Gestión de Pedidos y TPV
Gestión de Múltiples Roles:
Administrador: Acceso total a todas las funcionalidades del sistema (CRUD de productos, finanzas, reportes).
Cocina: Una vista simplificada enfocada en la recepción y gestión de pedidos activos, con notificaciones sonoras.
Módulo de Pedidos Avanzado:
Menú por Categorías: Productos organizados en pestañas (Pizzas, Hamburguesas, etc.) para una selección rápida.
Variaciones de Productos: Soporte para productos complejos con diferentes tamaños y precios (ej. pizzas).
Pagos Múltiples: Permite registrar un solo pedido con varias formas de pago (ej. parte en Efectivo, parte en Transferencia).
Gestión de Cocina en Tiempo Real:
Tablero de Estado de Pedidos: Una vista en vivo de todas las órdenes "En Preparación".
Notificaciones con Sonido: El usuario cocina clave: cocina123 recibe una alerta sonora instantánea cuando un nuevo pedido es generado, ideal para entornos sin impresora.
Flujo de Estados: Los pedidos pasan de "En Preparación" a "Finalizado" con un solo clic, manteniendo el tablero siempre actualizado.
Administración Completa del Negocio:
CRUD de Productos: Módulo para crear, actualizar (precios, disponibilidad, categoría) y gestionar el menú completo, incluyendo sus variaciones.
Módulo de Finanzas (Tesorería):
Visualización de saldos en tiempo real por cuenta (Efectivo, Transferencia, Tarjeta), permitiendo saldos negativos para un control de deuda/inversión.
Registro de egresos y gastos generales (pago de servicios, arriendo, etc.) que afectan los saldos.
Kardex de Transacciones: Un historial completo de todos los ingresos por ventas y egresos por gastos.
Reportes y Análisis:
Cierre de Caja Diario: Un reporte financiero que consolida ingresos y gastos por cada forma de pago, mostrando el balance final del día.
Reportes de productos más vendidos y zonas (Mz/Villa) de mayor consumo.
Exportación a Excel: Todos los reportes se pueden descargar en formato .xlsx para un análisis detallado.
Integración con Hardware:
Impresión de Tickets: Conexión directa con impresoras térmicas Epson para la impresión física de comandas.
2. Módulo de Bot de WhatsApp
Un bot interactivo para automatizar la toma de pedidos y la gestión de pagos por transferencia directamente desde WhatsApp.
Interacción con el Cliente:
Mensaje de bienvenida y menú interactivo por categorías.
Proceso guiado para la selección de productos, variaciones y cantidades.
Captura de dirección para la entrega.
Gestión de Pagos por Transferencia:
El cliente envía el comprobante de pago por WhatsApp.
El bot informa al cliente que el pago está "pendiente de verificación".
Verificación Manual Simplificada: El bot envía la foto del comprobante y los detalles del pedido a un número de WhatsApp específico del personal de contabilidad.
El personal de contabilidad responde con un comando simple (ej. CONFIRMAR TRF-A1B2 o PROBLEMA TRF-A1B2).
Notificación al Cliente en Tiempo Real:
Una vez confirmado el pago por el personal, el bot automáticamente crea la orden en el Il Sapore POS y notifica al cliente que su pedido ha sido aceptado y está en preparación.
En caso de problema con el pago, el bot informa al cliente y le proporciona el número de contacto para asistencia humana.
Persistencia de Sesión y Datos:
Utiliza Supabase para almacenar temporalmente los detalles de las transferencias pendientes de verificación, asegurando la continuidad de la transacción incluso si el bot se reinicia.
Manejo de sesión del bot para evitar la necesidad de escanear QR repetidamente (ver sección de despliegue).
🔧 Tecnologías Utilizadas
Frontend (ilsapore-pos-backend)
React: Para una interfaz de usuario dinámica y reactiva.
React Router: Para la navegación entre páginas.
Axios: Para la comunicación con la API del backend.
Socket.IO Client: Para la comunicación en tiempo real y notificaciones.
Backend (ilsapore-pos-backend)
Node.js & Express: Para construir una API REST robusta y rápida.
Socket.IO: Para habilitar la comunicación bidireccional en tiempo real.
PostgreSQL (node-postgres): Para la conexión con la base de datos.
Dotenv: Para la gestión de variables de entorno seguras.
JWT: Para autenticación segura.
Bot de WhatsApp (whatsapp-bot)
Node.js: Entorno de ejecución.
whatsapp-web.js: Librería para interactuar con la API de WhatsApp Web.
Puppeteer: Utilizado por whatsapp-web.js para automatizar un navegador headless.
@supabase/supabase-js: Cliente JavaScript para interactuar con la base de datos Supabase.
uuid: Para generar identificadores únicos cortos para las transferencias.
Axios: Para la comunicación con la API del backend de Il Sapore POS (obtención de token, creación de pedidos).
Dotenv: Para la gestión de variables de entorno seguras.
Base de Datos
PostgreSQL (gestionado por Supabase): Una base de datos relacional potente y confiable.
Consulta la documentación completa del esquema de la base de datos en: DATABASE.md
🛠️ Guía de Instalación y Puesta en Marcha
Sigue estos pasos para ejecutar el proyecto en un entorno de desarrollo local.
Prerrequisitos
Node.js (v16 o superior)
PostgreSQL (aunque gestionado por Supabase, la comprensión es útil)
Git
Una cuenta en Supabase con tu proyecto Il Sapore configurado.
Un número de teléfono de WhatsApp para el bot (preferiblemente dedicado).
1. Clonar el Repositorio
git clone https://github.com/pneville83/ilsapore-pos.git
cd ilsapore_pos

2. Configuración de la Base de Datos (Supabase)
Tu base de datos ya está alojada en Supabase. Si necesitas replicar la estructura para un nuevo entorno o entenderla, consulta el archivo DATABASE.md.
Asegúrate de que la estructura de tablas definida en DATABASE.md exista en tu proyecto de Supabase.
Si utilizas Row Level Security (RLS) en tu tabla pending_transfers, verifica que las políticas estén configuradas para permitir INSERT, SELECT y UPDATE con tu clave anon de Supabase.
3. Configuración y Ejecución del Backend (ilsapore-pos-backend)
Navega a la carpeta del backend:
cd ilsapore-pos-backend

Navega a la carpeta del backend:
code
Sh
cd ilsapore-pos-backend
Instala las dependencias:
code
Sh
npm install
Crea un archivo .env: En la raíz de la carpeta ilsapore-pos-backend, crea un archivo llamado .env con las siguientes variables. Asegúrate de reemplazar los valores de ejemplo con tus credenciales reales.
code
Env
# 1. Configuración de la Base de Datos
DB_USER=postgres.bwvkslhqgcwinjdbniti
DB_HOST=aws-0-us-east-1.pooler.supabase.com
DB_DATABASE=postgres
DB_PASSWORD=tu_contraseña_real_de_supabase_aqui # <<< ¡IMPORTANTE!
DB_PORT=6543

# 2. Configuración de la Impresora (tu impresora local compartida)
PRINTER_INTERFACE=\\DESKTOP-NNKPCCD\EpsonTicket # <-- Ajusta según tu impresora

# 3. Puerto para el servidor backend
PORT=4000

# 4. Secreto JWT para la autenticación
JWT_SECRET=m8CJTJA # <<< ¡IMPORTANTE! Genera un secreto fuerte y único.

Inicia el servidor backend:
code
Sh
npm start
El backend debería iniciarse, por defecto, en http://localhost:4000.
4. Configuración y Ejecución del Bot de WhatsApp (whatsapp-bot)
Asegúrate de que la línea .wwebjs_auth/ esté COMENTADA en whatsapp-bot/.gitignore para permitir que la sesión se suba a Git (necesario para despliegue gratuito en Render).
code
Gitignore
# .wwebjs_auth/
Navega a la carpeta del bot:
code
Sh
cd ../whatsapp-bot # Si estás en ilsapore-pos-backend
# o si estás en la raíz del repo: cd whatsapp-bot
Instala las dependencias:
code
Sh
npm install
Crea un archivo .env: En la raíz de la carpeta whatsapp-bot, crea un archivo llamado .env con las siguientes variables.
code
Env
# Configuración de Supabase para la tabla pending_transfers
SUPABASE_URL="https://bwvkslhqgcwinjdbniti.supabase.co" # URL de tu proyecto Supabase
SUPABASE_ANON_KEY="tu_clave_publica_anon_de_supabase_aqui" # <<< ¡IMPORTANTE! Obtén esta clave desde tu panel de Supabase (Project Settings -> API)

# Configuración de Il Sapore POS API para obtener el token
POS_API_BASE_URL="http://localhost:4000/api" # << Para desarrollo local, apunta a tu backend local
POS_LOGIN_ENDPOINT="/login" # Endpoint de login de tu API
POS_USERNAME="xxxxxxxxx" # Usuario admin del POS para que el bot se autentique
POS_PASSWORD="xxxxxxxxxx" # Contraseña del usuario admin. ¡CONFIRMA QUE SEA LA CORRECTA!

# Número de WhatsApp para la gestión de cuentas (formato con @c.us)
NUMERO_GESTION_CUENTAS="xxxxxxxxxxx@c.us" # <<< ¡IMPORTANTE! El número al que el bot enviará las notificaciones de transferencia.
Nota: Para POS_API_BASE_URL en desarrollo local, asegúrate de que apunte a la dirección donde tu backend está corriendo localmente (ej. http://localhost:4000/api).
Generar Sesión de WhatsApp (¡Solo la primera vez!):
Inicia el bot:
code
Sh
node bot.js
Un código QR aparecerá en tu terminal. Escanea este QR con tu teléfono (WhatsApp > Dispositivos vinculados > Vincular un dispositivo).
El bot se conectará y creará una carpeta .wwebjs_auth/ con la sesión.
Una vez que el bot muestre ✅ ¡El bot de Il Sapore está en línea!, puedes cerrarlo (Ctrl + C).
Sube la Sesión a Git:
Navega a la raíz de tu repositorio principal (cd .. si estás en whatsapp-bot).
Añade la carpeta de sesión y haz commit:
code
Sh
git add whatsapp-bot/.wwebjs_auth
git commit -m "feat: Add initial WhatsApp bot session"
git push origin main # O el nombre de tu rama
¡Este paso es crucial para el despliegue en Render Gratuito! Render necesita encontrar esta carpeta en tu repositorio para poder iniciar el bot sin pedir un QR de nuevo.
Inicia el bot (para uso normal local):
code
Sh
node bot.js
El bot debería iniciar y conectarse automáticamente sin mostrar el QR.
5. Configuración del Frontend (ilsapore-pos-frontend)
(Sección no proporcionada en el README original, pero es parte del sistema completo. Deberías añadirla siguiendo un patrón similar al backend y bot).
☁️ Despliegue en la Nube (Render)
Il Sapore POS se puede desplegar en plataformas PaaS como Render. Debido a que el proyecto consta de un backend API y un bot de WhatsApp, se recomienda desplegarlos como servicios separados en Render.
Backend POS (ilsapore-pos-backend)
Despliega este componente como un "Web Service" en Render.
Root Directory: ilsapore-pos-backend/
Build Command: npm install
Start Command: npm start (o node server.js)
Environment Variables: Configura todas las variables de tu .env del backend directamente en el panel de Render.
Bot de WhatsApp (whatsapp-bot)
Debido a las limitaciones del plan gratuito de Render (no hay "Background Workers" gratuitos ni almacenamiento persistente), el despliegue del bot requiere una consideración especial:
Tipo de Servicio: Necesitarías un "Background Worker" en Render para que el bot funcione de manera óptima (ya que no expone un puerto HTTP). Sin embargo, los Background Workers no tienen plan gratuito. Si el presupuesto lo permite, esta sería la mejor opción.
Sesión Persistente (Plan Gratuito): Si usas el plan gratuito, debes generar la sesión localmente y subir la carpeta .wwebjs_auth a tu repositorio de Git. Render la usará para iniciar el bot.
Root Directory: whatsapp-bot/
Build Command: npm install
Start Command: node bot.js
Environment Variables: Configura todas las variables de tu .env del bot directamente en el panel de Render.
Consideraciones: En el plan gratuito, el servicio del bot puede entrar en reposo o reiniciarse, lo que podría causar breves interrupciones. La sesión, al estar en Git, se recargará, pero el proceso de inicio de whatsapp-web.js puede tardar.