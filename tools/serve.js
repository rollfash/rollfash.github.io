/* =========================================================================
 * serve.js — שרת פיתוח מקומי.  הרצה:  node tools/serve.js
 *
 * מגיש את האתר, ובנוסף חושף כמה נקודות קצה שמאפשרות ל-admin.html לשמור
 * שינויים ישירות לקבצים. זה עובד רק מקומית — ב-GitHub Pages אין שרת,
 * ולכן ממשק הניהול עובר שם למצב הורדת קבצים.
 * ======================================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');
const isWord = (w) => /^[א-ת]{5}$/.test(w) && ![...w].slice(0, -1).some((c) => FINALS[c]);

/* ----- עזרים ----- */

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 1e6) { reject(new Error('גוף הבקשה גדול מדי')); req.destroy(); }
  });
  req.on('end', () => {
    try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(new Error('JSON לא תקין')); }
  });
  req.on('error', reject);
});

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

/** מוסיף מילים לקובץ מקור, בלי כפילויות. מחזיר את מה שנוסף בפועל. */
function appendWords(fileName, words) {
  const file = path.join(DATA, fileName);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const have = new Set((existing.match(/(?<![א-ת])[א-ת]{5}(?![א-ת])/g) || []).map(norm));

  const added = [];
  for (const word of words) {
    const clean = word.trim();
    if (!isWord(clean) || have.has(norm(clean))) continue;
    have.add(norm(clean));
    added.push(clean);
  }
  if (added.length) {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(file, prefix + added.join('\n') + '\n', 'utf8');
  }
  return added;
}

function rebuild() {
  return execFileSync(process.execPath, [path.join(__dirname, 'build-words.js')], {
    encoding: 'utf8',
  });
}

function writeSchedule(schedule) {
  const entries = Object.entries(schedule)
    .filter(([date, word]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && isWord(word))
    .sort(([a], [b]) => a.localeCompare(b));

  const body = entries.length
    ? entries.map(([date, word]) => `  '${date}': '${word}',`).join('\n') + '\n'
    : '';

  fs.writeFileSync(path.join(ROOT, 'wordle', 'js', 'schedule.js'),
`/* -------------------------------------------------------------------------
 * schedule.js — מילים מתוזמנות לתאריכים מסוימים
 *
 * כל תאריך שמופיע כאן יקבל את המילה שנקבעה לו במקום המילה האקראית.
 * תאריך שאינו מופיע — המשחק בוחר מילה בעצמו, דטרמיניסטית לפי התאריך.
 *
 * הדרך הנוחה לערוך את הקובץ היא דרך admin.html.
 * ---------------------------------------------------------------------- */

window.WORD_SCHEDULE = {
${body}};
`, 'utf8');

  return entries.length;
}

/* ----- נקודות קצה ----- */

const API = {
  /* admin.html בודק את זה כדי לדעת אם אפשר לשמור לקבצים */
  'GET /api/status': () => ({ ok: true, mode: 'local', root: ROOT }),

  'POST /api/words': (body) => {
    const words = Array.isArray(body.words) ? body.words : [];
    const target = body.pool === 'allowed' ? 'source-manual-allowed.txt' : 'source-manual.txt';
    const added = appendWords(target, words);
    const rejected = words.filter((w) => !added.includes(w.trim()));
    return { ok: true, added, rejected, build: rebuild() };
  },

  'POST /api/exclude': (body) => {
    const added = appendWords('exclude-from-answers.txt', body.words || []);
    return { ok: true, added, build: rebuild() };
  },

  'POST /api/block': (body) => {
    const added = appendWords('blocklist.txt', body.words || []);
    return { ok: true, added, build: rebuild() };
  },

  'POST /api/schedule': (body) => {
    const count = writeSchedule(body.schedule || {});
    return { ok: true, count };
  },
};

/* ----- השרת ----- */

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const route = `${req.method} ${url}`;

  if (API[route]) {
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      json(res, 200, API[route](body));
    } catch (err) {
      console.error(err);
      json(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  if (url.startsWith('/api/')) { json(res, 404, { ok: false, error: 'אין נתיב כזה' }); return; }

  let filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  // תיקייה → index.html שבתוכה, בדיוק כמו ש-GitHub Pages מתנהג
  try {
    if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch { /* לא קיים — ייפול ל-404 בהמשך */ }

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
  console.log(`דף הבית:      http://localhost:${PORT}`);
  console.log(`עברדל:        http://localhost:${PORT}/wordle/`);
  console.log(`ממשק הניהול:  http://localhost:${PORT}/wordle/admin.html`);
});
