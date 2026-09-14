const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const files = fs.existsSync(dist) ? fs.readdirSync(dist) : [];

if (files.length !== 1 || files[0] !== 'index.html') {
  throw new Error('dist должен содержать только index.html, получено: ' + files.join(', '));
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const placeholders = html.match(/_DATA_/g) || [];

if (placeholders.length !== 1) {
  throw new Error('Плейсхолдер _DATA_ должен встречаться ровно один раз.');
}
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
  throw new Error('Найден внешний script src.');
}
if (/<link\b[^>]*\brel=["']?stylesheet/i.test(html)) {
  throw new Error('Найдена внешняя таблица стилей.');
}
if (/<(?:img|audio|video|source)\b[^>]*\bsrc\s*=/i.test(html)) {
  throw new Error('Найден внешний медиа-ресурс.');
}

console.log('[single] Проверка автономного HTML пройдена (' + Math.round(html.length / 1024) + ' КиБ)');
