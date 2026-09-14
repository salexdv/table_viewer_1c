const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'dist', 'index.html'), 'utf8');
const scripts = [];
const pattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;

while ((match = pattern.exec(html))) {
  if (match[1].trim() && match[1].trim() !== '_DATA_') scripts.push(match[1]);
}

if (!scripts.length) throw new Error('В single-file HTML не найден JavaScript.');
scripts.forEach(function (source) {
  acorn.parse(source, { ecmaVersion: 6, sourceType: 'script' });
});
console.log('[es] Inline JavaScript соответствует ES2015');
