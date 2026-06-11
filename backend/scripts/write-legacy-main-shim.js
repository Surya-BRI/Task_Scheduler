const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const mainJs = path.join(distDir, 'main.js');
const legacyShim = path.join(distDir, 'src', 'main.js');

if (!fs.existsSync(mainJs)) {
  console.error('Build output missing:', mainJs);
  process.exit(1);
}

fs.mkdirSync(path.dirname(legacyShim), { recursive: true });
fs.writeFileSync(legacyShim, "require('../main.js');\n", 'utf8');
console.log('Legacy PM2 entry ready:', legacyShim);
