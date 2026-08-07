/* שרת סטטי מינימלי לפיתוח מקומי — הרצה:  node tools/serve.js
 * לא נדרש בשביל GitHub Pages, רק לבדיקה מקומית. */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, url === '/' ? 'index.html' : url);

  // מניעת יציאה מתיקיית השורש
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('לא נמצא');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(data);
  });
}).listen(PORT, () => {
  console.log(`המשחק זמין בכתובת http://localhost:${PORT}`);
});
