/* =========================================================================
 * make-song-images.js — מייצר תמונות לחידות "השיר היומי"
 *
 * הרצה:            node tools/make-song-images.js
 * ייצור מחדש:      node tools/make-song-images.js --force 003 007
 *
 * קורא את data/songs.json, מייצר דרך Pollinations כל תמונה שחסרה,
 * ובונה מחדש את song/js/songs.js.
 *
 * למה מראש ולא בזמן אמת:
 *   1. כל השחקנים חייבים לראות בדיוק את אותה תמונה, אחרת אין מה לשתף.
 *   2. הייצור לוקח עד 45 שניות — בלתי נסבל בזמן משחק.
 *   3. תמונה מקומית נטענת מיידית ועובדת גם כשהשירות למטה.
 *
 * Pollinations אינו דורש מפתח. הפרמטר seed מבטיח שאותו פרומפט
 * יחזיר תמיד את אותה תמונה.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'songs.json');
const IMG_DIR = path.join(ROOT, 'song', 'images');
const OUT_JS = path.join(ROOT, 'song', 'js', 'songs.js');

const SIZE = 768;
const TIMEOUT_MS = 120000;

/* סגנון אחיד לכל החידות. השלילות חשובות: טקסט בתמונה מסגיר את
 * התשובה, והמודלים ממילא מייצרים עברית משובשת. */
const STYLE = 'clean minimal composition, single clear subject, soft natural lighting, '
            + 'plain uncluttered background, highly detailed, photographic';
const NEGATIVE = 'no text, no letters, no words, no writing, no watermark, no signature, no people talking';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const { songs } = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* ----- ולידציה: תשובה חייבת להיות אותיות עבריות ורווחים בלבד ----- */
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

function imageUrl(prompt, seed) {
  const full = `${prompt}, ${STYLE}, ${NEGATIVE}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}`
       + `?width=${SIZE}&height=${SIZE}&nologo=true&seed=${seed}`;
}

/** seed יציב הנגזר מהמזהה, כדי שייצור חוזר יחזיר את אותה תמונה. */
const seedFor = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 100000;

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error(`תשובה קטנה מדי (${buf.length} bytes) — כנראה שגיאה`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  let made = 0, skipped = 0, failed = 0;

  for (const song of songs) {
    if (only.length && !only.includes(song.id)) continue;

    const file = path.join(IMG_DIR, `${song.id}.jpg`);
    if (fs.existsSync(file) && !force) { skipped++; continue; }

    process.stdout.write(`  ${song.id} ${song.title} … `);
    try {
      const buf = await fetchImage(imageUrl(song.prompt, seedFor(song.id)));
      fs.writeFileSync(file, buf);
      console.log(`✓ ${Math.round(buf.length / 1024)}KB`);
      made++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  /* ----- בניית קובץ הנתונים למשחק ----- */
  const ready = songs.filter((s) => fs.existsSync(path.join(IMG_DIR, `${s.id}.jpg`)));
  const rows = ready
    .map((s) => `  { id: '${s.id}', title: '${s.title}' },`)
    .join('\n');

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

  console.log(`\nנוצרו: ${made} · דילוגים: ${skipped} · כשלונות: ${failed}`);
  console.log(`חידות מוכנות: ${ready.length} מתוך ${songs.length}`);
  console.log(`מספיק ל-${ready.length} ימי משחק.`);
  if (failed) console.log('\nלייצור חוזר של מה שנכשל:  node tools/make-song-images.js --force <id>');
})();
