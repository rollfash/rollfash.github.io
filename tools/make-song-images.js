/* =========================================================================
 * make-song-images.js — מייצר תמונות לחידות "השיר היומי"
 *
 * הרצה:            node tools/make-song-images.js
 * ייצור מחדש:      node tools/make-song-images.js --force 003 007
 * הכול מחדש:       node tools/make-song-images.js --force
 *
 * קורא את data/songs.json, מייצר כל תמונה שחסרה, ובונה מחדש את
 * song/js/songs.js.
 *
 * ----- שני מנועים -----
 *
 * FLUX.1-schnell (ברירת מחדל) — דורש מפתח HF_TOKEN בקובץ .env.
 *   איכות גבוהה בהרבה, ובעיקר: מבין יחסים בין אלמנטים ("חצי ילד חצי זקן",
 *   "ידיים מכופפות בננה"). מחזיר JPEG במשקל ~50KB.
 *
 * Pollinations (גיבוי) — בלי מפתח כלל, אבל המודל היחיד הזמין הוא sana:
 *   מצייר יפה עצם בודד, ומפספס כמעט כל סצנה שדורשת פעולה או ניגוד.
 *
 * ----- איך כותבים פרומפט שעובד -----
 *   • לתאר את התמונה, לא את הרעיון המופשט.
 *   • לא לכתוב שלילות ("no text") — מודלי דיפוזיה לא מבינים שלילה.
 *   • לא לכתוב "single subject" — זה מוחק את האלמנט השני בסצנה.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'songs.json');
const IMG_DIR = path.join(ROOT, 'song', 'images');
const OUT_JS = path.join(ROOT, 'song', 'js', 'songs.js');

const SIZE = 768;
const TIMEOUT_MS = 180000;
const STYLE = 'highly detailed';

/* ----- טעינת .env (מוחרג מ-git; המאגר ציבורי) ----- */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
  }
  return env;
}

const HF_TOKEN = loadEnv().HF_TOKEN || process.env.HF_TOKEN || '';
const ENGINE = HF_TOKEN ? 'flux' : 'pollinations';

/* ----- ולידציה ----- */
const { songs } = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const invalid = songs.filter((s) => !/^[א-ת]+(?: [א-ת]+)*$/.test(s.title));
if (invalid.length) {
  console.error('כותרות לא תקינות (מותר רק אותיות עבריות ורווחים):');
  invalid.forEach((s) => console.error(`  ${s.id}: "${s.title}"`));
  process.exit(1);
}
const dupIds = songs.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupIds.length) {
  console.error(`מזהים כפולים: ${[...new Set(dupIds)].join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT_JS), { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

/** seed יציב לפי המזהה, כדי שייצור חוזר ייתן את אותה תמונה */
const seedFor = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 100000;

const withTimeout = async (fn) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fn(controller.signal); } finally { clearTimeout(timer); }
};

/* ----- מנוע FLUX דרך Hugging Face ----- */
async function generateFlux(prompt, seed) {
  return withTimeout(async (signal) => {
    const res = await fetch('https://router.huggingface.co/together/v1/images/generations', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: `${prompt}, ${STYLE}`,
        width: SIZE,
        height: SIZE,
        seed,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 402 ? ' — נגמר הקרדיט החינמי בחשבון'
                 : res.status === 429 ? ' — חריגה ממגבלת הקצב, המתינו מעט'
                 : '';
      throw new Error(`HTTP ${res.status}${hint} ${body.slice(0, 160)}`);
    }

    const json = await res.json();
    const url = json?.data?.[0]?.url;
    const b64 = json?.data?.[0]?.b64_json;
    if (b64) return Buffer.from(b64, 'base64');
    if (!url) throw new Error(`תשובה לא צפויה: ${JSON.stringify(json).slice(0, 160)}`);

    const img = await fetch(url, { signal });
    if (!img.ok) throw new Error(`הורדת התמונה נכשלה: HTTP ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  });
}

/* ----- מנוע גיבוי ----- */
async function generatePollinations(prompt, seed) {
  return withTimeout(async (signal) => {
    const full = encodeURIComponent(`${prompt}, ${STYLE}`);
    const url = `https://image.pollinations.ai/prompt/${full}`
              + `?width=${SIZE}&height=${SIZE}&nologo=true&seed=${seed}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

const generateOnce = ENGINE === 'flux' ? generateFlux : generatePollinations;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** מגבלת הקצב של הספק דינמית. במקום להיכשל — ממתינים ומנסים שוב. */
async function generate(prompt, seed) {
  const waits = [5000, 15000, 30000, 60000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateOnce(prompt, seed);
    } catch (err) {
      const throttled = /429|Too many requests|rate limit/i.test(err.message);
      if (!throttled || attempt >= waits.length) throw err;
      process.stdout.write(`⏳${waits[attempt] / 1000}s `);
      await sleep(waits[attempt]);
    }
  }
}

/* ----- הרצה ----- */
(async () => {
  console.log(`מנוע: ${ENGINE === 'flux' ? 'FLUX.1-schnell (Hugging Face)' : 'Pollinations / sana — ללא מפתח'}\n`);

  let made = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const song of songs) {
    if (only.length && !only.includes(song.id)) continue;

    const file = path.join(IMG_DIR, `${song.id}.jpg`);
    if (fs.existsSync(file) && !force) { skipped++; continue; }

    process.stdout.write(`  ${song.id} ${song.title} … `);
    try {
      const buf = await generate(song.prompt, seedFor(song.id));
      if (buf.length < 5000) throw new Error(`קובץ קטן מדי (${buf.length} bytes)`);
      fs.writeFileSync(file, buf);
      console.log(`✓ ${Math.round(buf.length / 1024)}KB`);
      made++;
      await sleep(1500);   // נשימה בין בקשות, כדי לא להיתקל במגבלת הקצב מלכתחילה
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failures.push(song.id);
      failed++;
    }
  }

  /* ----- בניית קובץ הנתונים למשחק ----- */
  const ready = songs.filter((s) => fs.existsSync(path.join(IMG_DIR, `${s.id}.jpg`)));
  const rows = ready.map((s) => `  { id: '${s.id}', title: '${s.title}' },`).join('\n');

  fs.writeFileSync(OUT_JS,
`/* -------------------------------------------------------------------------
 * songs.js — נוצר אוטומטית על ידי tools/make-song-images.js
 *
 * אין לערוך ידנית. לעריכה: data/songs.json ואז הרצה מחדש של הסקריפט.
 * התמונה של כל שיר היא song/images/<id>.jpg
 * ---------------------------------------------------------------------- */

window.SONG_DATA = [
${rows}
];
`, 'utf8');

  const totalKB = ready.reduce((n, s) => n + fs.statSync(path.join(IMG_DIR, `${s.id}.jpg`)).size, 0) / 1024;

  console.log(`\nנוצרו: ${made} · דילוגים: ${skipped} · כשלונות: ${failed}`);
  console.log(`חידות מוכנות: ${ready.length} מתוך ${songs.length} · ${Math.round(totalKB / 1024 * 10) / 10}MB`);
  if (failures.length) {
    console.log(`\nלניסיון חוזר:  node tools/make-song-images.js --force ${failures.join(' ')}`);
  }
})();
