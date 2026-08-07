/* =========================================================================
 * build-crossword-words.js — בונה את מאגר המילים לבניית תשבצים
 *
 * הרצה:  node tools/build-crossword-words.js
 *
 * קורא את רשימת המילים עם התדירויות (גזורה מ-Hspell — ראו data/ATTRIBUTION.md)
 * ומייצר data/crossword-words.json: מילים באורך 2–7, ממוינות לפי תדירות.
 *
 * למה תדירות ולא סתם "כל המילים": תשבץ שממולא מ-160 אלף מילים יתמלא
 * במילים שאיש לא מכיר, וזו הדרך הבטוחה לתשבץ מתסכל. סינון לפי שכיחות
 * בקורפוס משאיר בערך 15 אלף מילים שדובר עברית באמת מכיר.
 *
 * הקובץ הזה נשאר בצד השרת בלבד — הוא משמש את כלי בניית התשבצים ואינו
 * נשלח לדפדפן. כל תשבץ שמתפרסם מכיל רק את המילים שלו.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'src-cc100_intersect_no_fatverb.csv');
const OUT = path.join(ROOT, 'data', 'crossword-words.json');

const MIN_LEN = 2;
const MAX_LEN = 7;

/* סף השכיחות. גבוה מדי — לא יהיו מספיק מילים למילוי הרשת;
 * נמוך מדי — יחזרו מילים אזוטריות. 3000 הוא פשרה שנבדקה. */
const MIN_FREQ = 3000;

/* נרמול אותיות סופיות: תא ברשת מכיל תמיד את הצורה הרגילה.
 * אחרת אות סופית בסוף מילה מאוזנת הייתה מתנגשת עם המילה המאונכת
 * שעוברת דרכה, שבה אותה אות אינה אחרונה. גם המקלדת היא בת 22 אותיות. */
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');

if (!fs.existsSync(SRC)) {
  console.error(`חסר ${path.relative(ROOT, SRC)}`);
  console.error('הורידו אותו מ-github.com/eyaler/hebrew_wordlists');
  process.exit(1);
}

/* רשימת שמות העצם. הצטלבות איתה מסננת נטיות שהן עברית תקינה אך ערכים
 * גרועים לתשבץ: "למענם", "אויבי", "יריעת". לשם עצם קל לכתוב הגדרה;
 * לצורה נוטה כמעט בלתי אפשרי לכתוב הגדרה הוגנת. */
const NOUNS = path.join(ROOT, 'data', 'src-nouns.txt');
let nounSet = null;
if (fs.existsSync(NOUNS)) {
  nounSet = new Set();
  for (const line of fs.readFileSync(NOUNS, 'utf8').split('\n')) {
    const w = line.trim();
    if (/^[א-ת]+$/.test(w)) nounSet.add(norm(w));
  }
}

const byLength = {};
const seen = new Map();          // צורה מנורמלת → התדירות הגבוהה ביותר שנראתה
let scanned = 0, kept = 0;

for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
  const comma = line.lastIndexOf(',');
  if (comma < 1) continue;

  const raw = line.slice(0, comma).trim();
  const freq = Number(line.slice(comma + 1));
  if (!Number.isFinite(freq) || freq < MIN_FREQ) continue;
  if (!/^[א-ת]+$/.test(raw)) continue;

  scanned++;
  const word = norm(raw);
  const len = [...word].length;
  if (len < MIN_LEN || len > MAX_LEN) continue;
  if (nounSet && !nounSet.has(word)) continue;

  // אחרי הנרמול מילים שונות עשויות להתלכד; שומרים את התדירות הגבוהה
  if (!seen.has(word) || seen.get(word) < freq) seen.set(word, freq);
}

for (const [word, freq] of seen) {
  const len = [...word].length;
  (byLength[len] = byLength[len] || []).push([word, freq]);
  kept++;
}

for (const len of Object.keys(byLength)) {
  byLength[len].sort((a, b) => b[1] - a[1]);
}

const out = {
  _source: 'Hspell via github.com/eyaler/hebrew_wordlists — AGPL-3.0, see data/ATTRIBUTION.md',
  _note: 'מנורמל: אותיות סופיות הומרו לצורה הרגילה. ממוין לפי שכיחות בקורפוס.',
  minFreq: MIN_FREQ,
  words: Object.fromEntries(
    Object.entries(byLength).map(([len, list]) => [len, list.map(([w]) => w)]),
  ),
};

fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

console.log(`סף שכיחות: ${MIN_FREQ.toLocaleString()}\n`);
console.log('אורך   מילים');
for (let n = MIN_LEN; n <= MAX_LEN; n++) {
  console.log(String(n).padStart(4), String((byLength[n] || []).length).padStart(8));
}
console.log(`\nסה"כ: ${kept.toLocaleString()} מילים`);
console.log(`נכתב ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
console.log('\nהנפוצות ביותר באורך 5:');
console.log('  ' + (byLength[5] || []).slice(0, 20).map(([w]) => w).join(' '));
