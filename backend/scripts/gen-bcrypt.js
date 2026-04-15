const bcrypt = require('bcrypt');
const pwd = process.argv[2] || 'Secret123!';
bcrypt.hash(pwd, 10).then((h) => {
  console.log('HASH:', h);
  return bcrypt.compare(pwd, h);
}).then((ok) => console.log('VERIFY:', ok));
