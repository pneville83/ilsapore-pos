const bcrypt = require('bcryptjs');
const password = 'johnpeter1983'; // <-- CAMBIA ESTO
const salt = bcrypt.genSaltSync(10);
const password_hash = bcrypt.hashSync(password, salt);
console.log('Tu nuevo hash es:');
console.log(password_hash);