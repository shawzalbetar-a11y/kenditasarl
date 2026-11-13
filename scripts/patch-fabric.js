const fs = require('fs');
const path = require('path');

const fabricJsPath = path.join(__dirname, '..', 'node_modules', 'fabric', 'dist', 'fabric.js');
const fabricMinJsPath = path.join(__dirname, '..', 'node_modules', 'fabric', 'dist', 'fabric.min.js');

try {
  if (fs.existsSync(fabricJsPath)) {
    let f = fs.readFileSync(fabricJsPath, 'utf8');
    if (!f.includes('function setImageSmoothing(ctx, value) {\n    if (!ctx) return;')) {
      f = f.replace(
        'function setImageSmoothing(ctx, value) {\n    ctx.imageSmoothingEnabled =',
        'function setImageSmoothing(ctx, value) {\n    if (!ctx) return;\n    ctx.imageSmoothingEnabled ='
      );
      fs.writeFileSync(fabricJsPath, f, 'utf8');
      console.log('[patch-fabric] Patched node_modules/fabric/dist/fabric.js');
    }
  }

  if (fs.existsSync(fabricMinJsPath)) {
    let f = fs.readFileSync(fabricMinJsPath, 'utf8');
    if (!f.includes('{if(!$1)return;')) {
      f = f.replace(
        /function setImageSmoothing\(([a-zA-Z0-9_]+),([a-zA-Z0-9_]+)\)\{/g,
        'function setImageSmoothing($1,$2){if(!$1)return;'
      );
      fs.writeFileSync(fabricMinJsPath, f, 'utf8');
      console.log('[patch-fabric] Patched node_modules/fabric/dist/fabric.min.js');
    }
  }
} catch (e) {
  console.warn('[patch-fabric] Failed to patch fabric:', e.message);
}
