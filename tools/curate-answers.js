/* =========================================================================
 * curate-answers.js — מסנן את מאגר המילים לערכים שראויים לתשבץ
 *
 * הרצה:  node tools/curate-answers.js
 *        node tools/curate-answers.js --sample 4     דוגמאות באורך 4
 *
 * הבעיה שהכלי הזה פותר: רשימת המילים הגולמית מלאה בנטיות — "נכסיו",
 * "הונו", "פניהן", "מהודו". אלה עברית תקינה, אבל אי אפשר לכתוב להן
 * הגדרה הוגנת, ולכן הן פוסלות כל רשת שהן נופלות לתוכה.
 *
 * שלושה מסננים:
 *   1. שכיחות — מילה נדירה היא הגדרה בלתי הוגנת גם אם היא תקינה.
 *   2. שם עצם — הצטלבות עם רשימת שמות העצם, כדי לסלק פעלים.
 *   3. נטייה — אם הורדת סיומת שייכות מחזירה מילה קיימת, המילה נגזרת
 *      ממנה ולא עומדת בפני עצמה.
 *
 * מה שבמכוון *לא* מסונן: ריבוי (ספרים, מחלות). ריבוי הוא ערך תקין
 * לחלוטין בתשבץ, וקל לכתוב לו הגדרה.
 *
 * הפלט data/crossword-answers.json הוא הבריכה שממנה ממלאים רשתות.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FREQ = path.join(ROOT, 'data', 'src-cc100_intersect_no_fatverb.csv');
const NOUNS = path.join(ROOT, 'data', 'src-nouns.txt');
const BLOCK = path.join(ROOT, 'data', 'answer-blocklist.txt');
const OUT = path.join(ROOT, 'data', 'crossword-answers.json');

const MIN_LEN = 3;
const MAX_LEN = 7;
const MIN_FREQ = 8000;

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');

for (const f of [FREQ, NOUNS]) {
  if (!fs.existsSync(f)) {
    console.error(`חסר ${path.relative(ROOT, f)} — הורידו מ-github.com/eyaler/hebrew_wordlists`);
    process.exit(1);
  }
}

/* ----- שמות עצם (באיות מקורי, לפני נרמול) ----- */
const nouns = new Set();
for (const line of fs.readFileSync(NOUNS, 'utf8').split('\n')) {
  const w = line.trim();
  if (/^[א-ת]+$/.test(w)) nouns.add(w);
}

/* ----- רשימת פסילה ידנית: מה שהעין תפסה ------ */
const blocked = new Set();
if (fs.existsSync(BLOCK)) {
  for (const line of fs.readFileSync(BLOCK, 'utf8').split('\n')) {
    const w = line.trim();
    if (/^[א-ת]+$/.test(w)) blocked.add(norm(w));
  }
}

/* ----- סיומות שייכות וגוף -----
 * אם הורדת אחת מהן מחזירה מילה קיימת, לפנינו נטייה ולא ערך עצמאי.
 * הסדר חשוב: הארוכות נבדקות קודם, אחרת "יהם" ייחתך כ-"ם". */
const POSSESSIVE = [
  'יהם', 'יהן', 'יכם', 'יכן', 'ינו', 'תיו', 'תיה',
  'הם', 'הן', 'כם', 'כן', 'נו', 'יו', 'יה', 'יך', 'יי',
  'ו', 'ך', 'י',
];

/** האם המילה נראית כנטייה של מילה אחרת שקיימת ברשימה? */
function isInflection(word) {
  for (const suf of POSSESSIVE) {
    if (!word.endsWith(suf)) continue;
    const stem = word.slice(0, -suf.length);
    // גזע קצר מדי אינו ראיה — "כלי" אינו נטייה של "כל"
    if ([...stem].length < 3) continue;
    if (nouns.has(stem)) return true;
    // גם צורה עם ה' בסוף: "מכונית" ← "מכוניתו"
    if (nouns.has(stem + 'ה')) return true;
  }
  return false;
}

/** צורת נסמך — "מדינת ישראל", "אנשי הצוות". ערך גרוע לתשבץ: היא
 *  לעולם לא עומדת לבדה, ולכן אין לה הגדרה שאינה מלאכותית. */
function isConstruct(word) {
  // נסמך של שם נקבה: חברה ← חברת, מדינה ← מדינת
  if (word.endsWith('ת')) {
    const stem = word.slice(0, -1);
    if ([...stem].length >= 3 && nouns.has(stem + 'ה')) return true;
  }
  // נסמך של ריבוי זכר: אנשים ← אנשי, ילדים ← ילדי
  if (word.endsWith('י')) {
    const stem = word.slice(0, -1);
    if ([...stem].length >= 2 && nouns.has(stem + 'ים')) return true;
  }
  /* שייכות נקבה על שם מופשט: זהות ← זהותה, עמדת ← עמדתה.
   * מוגבל לגזע שנגמר ב-ת', אחרת היינו פוסלים "קדושה" ו"גדולה"
   * שהן מילים לכל דבר. */
  if (word.endsWith('ה')) {
    const stem = word.slice(0, -1);
    if (stem.endsWith('ת') && [...stem].length >= 3 && nouns.has(stem)) return true;
  }
  return false;
}

/* ----- שמות מקומות: טריוויה גאוגרפית, לא חידת היגיון ----- */
const places = new Set();
const PLACES = path.join(ROOT, 'data', 'src-places.txt');
if (fs.existsSync(PLACES)) {
  for (const line of fs.readFileSync(PLACES, 'utf8').split('\n')) {
    const w = line.trim();
    if (/^[א-ת]+$/.test(w)) places.add(w);
  }
}

/* ----- סריקה ----- */
const stats = { scanned: 0, rareOut: 0, notNoun: 0, inflected: 0, construct: 0, placeOut: 0, blockedOut: 0, kept: 0 };
const best = new Map();       // מנורמל → [איות מקורי, שכיחות]

for (const line of fs.readFileSync(FREQ, 'utf8').split('\n')) {
  const comma = line.lastIndexOf(',');
  if (comma < 1) continue;

  const raw = line.slice(0, comma).trim();
  const freq = Number(line.slice(comma + 1));
  if (!/^[א-ת]+$/.test(raw) || !Number.isFinite(freq)) continue;

  const len = [...raw].length;
  if (len < MIN_LEN || len > MAX_LEN) continue;
  stats.scanned++;

  if (freq < MIN_FREQ) { stats.rareOut++; continue; }
  if (!nouns.has(raw)) { stats.notNoun++; continue; }
  if (isInflection(raw)) { stats.inflected++; continue; }
  if (isConstruct(raw)) { stats.construct++; continue; }
  if (places.has(raw)) { stats.placeOut++; continue; }

  const key = norm(raw);
  if (blocked.has(key)) { stats.blockedOut++; continue; }

  if (!best.has(key) || best.get(key)[1] < freq) best.set(key, [raw, freq]);
}

const byLen = {};
for (const [key, [raw, freq]] of best) {
  const len = [...key].length;
  (byLen[len] = byLen[len] || []).push({ w: key, display: raw, f: freq });
  stats.kept++;
}
for (const len of Object.keys(byLen)) byLen[len].sort((a, b) => b.f - a.f);

/* ----- פלט ----- */
const sampleLen = Number((process.argv.includes('--sample')
  ? process.argv[process.argv.indexOf('--sample') + 1] : 0) || 0);

if (sampleLen) {
  const list = byLen[sampleLen] || [];
  console.log(`דוגמה — ${list.length} מילים באורך ${sampleLen}:\n`);
  for (let i = 0; i < Math.min(list.length, 160); i += 8) {
    console.log('  ' + list.slice(i, i + 8).map((e) => e.display.padEnd(9)).join(''));
  }
  process.exit(0);
}

fs.writeFileSync(OUT, JSON.stringify({
  _source: 'Hspell via eyaler/hebrew_wordlists — AGPL-3.0, ראו data/ATTRIBUTION.md',
  minFreq: MIN_FREQ,
  words: Object.fromEntries(Object.entries(byLen).map(([l, v]) => [l, v.map((e) => e.w)])),
  display: Object.fromEntries([...best.values()].map(([raw]) => [norm(raw), raw])),
}), 'utf8');

console.log('סינון:');
console.log(`  נסרקו               ${stats.scanned.toLocaleString()}`);
console.log(`  נפסלו — נדירות      ${stats.rareOut.toLocaleString()}`);
console.log(`  נפסלו — לא שם עצם   ${stats.notNoun.toLocaleString()}`);
console.log(`  נפסלו — נטייה       ${stats.inflected.toLocaleString()}`);
console.log(`  נפסלו — נסמך        ${stats.construct.toLocaleString()}`);
console.log(`  נפסלו — שם מקום     ${stats.placeOut.toLocaleString()}`);
console.log(`  נפסלו — רשימה ידנית ${stats.blockedOut.toLocaleString()}`);
console.log(`\nנשארו: ${stats.kept.toLocaleString()}`);
console.log('\nאורך  מילים');
for (let n = MIN_LEN; n <= MAX_LEN; n++) {
  console.log(String(n).padStart(4), String((byLen[n] || []).length).padStart(7));
}
console.log(`\nנכתב ${path.relative(ROOT, OUT)}`);
