const bcrypt = require('bcryptjs');
const password = 'mesero123'; // La contraseña para el nuevo admin
const salt = bcrypt.genSaltSync(10);
const password_hash = bcrypt.hashSync(password, salt);
console.log('Hash para admin_joya:');
console.log(password_hash);