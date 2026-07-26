import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) walk(dirPath, callback);
    else callback(path.join(dir, f));
  });
}

walk('./src', filePath => {
  if (filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('@contextos/shared-types')) {
      const depth = filePath.split(path.sep).length - 2; // -1 for src/, -1 for filename
      const prefix = depth <= 0 ? './' : '../'.repeat(depth);
      const relativePath = prefix + 'shared-types/index.js';
      content = content.replace(/['"]@contextos\/shared-types['"]/g, `'${relativePath}'`);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`Updated ${filePath} -> ${relativePath}`);
    }
  }
});
