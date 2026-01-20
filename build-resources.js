
const fs = require('fs');
const path = require('path');

console.log('\x1b[36m%s\x1b[0m', '--- [Asset Preparation] ---');

const root = process.cwd();
const assetsDir = path.join(root, 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const searchPaths = [
  path.join(root, 'asset', 'logo.png'),
  path.join(root, 'asset', 'Logo.png'),
  path.join(root, 'logo.png')
];

let sourceLogo = null;
for (const p of searchPaths) {
  if (fs.existsSync(p)) {
    sourceLogo = p;
    console.log('✓ Source logo: ' + p);
    break;
  }
}

if (sourceLogo) {
  const variants = ['icon.png', 'icon-only.png', 'icon-foreground.png', 'splash.png', 'splash-only.png'];
  variants.forEach(v => {
    fs.copyFileSync(sourceLogo, path.join(assetsDir, v));
  });
  console.log('✓ Prepared all icon variants in assets/');
} else {
  console.error('❌ ERROR: logo.png not found!');
  process.exit(1);
}
