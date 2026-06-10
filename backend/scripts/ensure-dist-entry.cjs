const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const mainFile = path.join(distDir, 'main.js');
const legacyDir = path.join(distDir, 'src');
const legacyFile = path.join(legacyDir, 'main.js');

if (!fs.existsSync(mainFile)) {
  console.error(`Build output missing: ${mainFile}`);
  process.exit(1);
}

fs.mkdirSync(legacyDir, { recursive: true });
fs.writeFileSync(legacyFile, "require('../main.js');\n");
console.log(`Legacy PM2 entry ready: ${legacyFile}`);
