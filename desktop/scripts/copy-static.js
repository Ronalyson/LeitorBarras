const fs = require('fs');
const path = require('path');

// Copia arquivos estáticos de renderer (HTML, CSS, assets) para dist
const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const destDir = path.join(__dirname, '..', 'dist', 'renderer');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, {recursive: true});
}

for (const file of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  fs.copyFileSync(src, dest);
  console.log(`Copiado: ${file}`);
}
