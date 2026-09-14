const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(dist, 'index.html');
const jsPath = path.join(dist, 'viewer.js');

if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) {
  throw new Error('Нет dist/index.html или dist/viewer.js. Сначала выполните webpack-сборку.');
}

let html = fs.readFileSync(htmlPath, 'utf8');
const javascript = fs.readFileSync(jsPath, 'utf8').replace(/<\/script/gi, '<\\/script');
const scriptPattern = /<script\b[^>]*\bsrc=["'](?:\.\/)?viewer\.js["'][^>]*><\/script>/i;

if (!scriptPattern.test(html)) {
  throw new Error('В index.html не найден тег подключения viewer.js.');
}

html = html.replace(scriptPattern, '<script>' + javascript + '</script>');
fs.writeFileSync(htmlPath, html, 'utf8');
fs.unlinkSync(jsPath);
console.log('[single] Создан автономный dist/index.html');
