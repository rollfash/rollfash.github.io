/* =========================================================================
 * fill-grid.js — מוצא מילוי חוקי לתבנית תשבץ
 *
 * הרצה:
 *   node tools/fill-grid.js                      תבנית ברירת מחדל
 *   node tools/fill-grid.js --pattern 5x5-a      תבנית מוכנה
 *   node tools/fill-grid.js --seed 42            מילוי אחר לאותה תבנית
 *   node tools/fill-grid.js --list               הצגת התבניות
 *
 * הבעיה: למלא רשת כך שכל מילה מאוזנת וכל מילה מאונכת יהיו מילים אמיתיות,
 * וכל תא משותף יסכים על אותה אות. זו בעיית סיפוק אילוצים — נפתרת בחיפוש
 * לאחור עם היוריסטיקה של "המשבצת המוגבלת ביותר קודם".
 *
 * ----- כיווניות -----
 * עברית נכתבת מימין לשמאל, ולכן מילה מאוזנת מתחילה בתא הימני ביותר של
 * הרצף ומתקדמת שמאלה. מילה מאונכת מתחילה למעלה ויורדת, כרגיל.
 * המספור סורק שורות מלמעלה למטה, ובתוך כל שורה מימין לשמאל.
 *
 * ----- אותיות סופיות -----
 * הרשת מכילה תמיד צורות רגילות. אחרת אות סופית בסוף מילה מאוזנת הייתה
 * מתנגשת עם המילה המאונכת שעוברת באותו תא, שבה האות אינה אחרונה.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* הבריכה המסוננת — רק ערכים שאפשר לכתוב להם הגדרה.
 * נוצרת על ידי tools/curate-answers.js */
const WORDS = path.join(ROOT, 'data', 'crossword-answers.json');

/* '.' = תא פתוח, '#' = תא שחור
 *
 * כלל: אף רצף לא קצר מ-3 תאים. רצף של 2 מייצר ערכים כמו "הל" או "ינ",
 * שאינם מילים שראוי לבקש מהשחקן לנחש. */
const MIN_SLOT = 3;

const PATTERNS = {
  '5x5-open': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ],
  '5x5-corners': [
    '#....',
    '.....',
    '.....',
    '.....',
    '....#',
  ],
  '5x5-steps': [
    '..#..',
    '.....',
    '.....',
    '.....',
    '..#..',
  ],
  '6x5': [
    '#.....',
    '......',
    '......',
    '......',
    '.....#',
  ],
  '6x6': [
    '..#...',
    '......',
    '......',
    '......',
    '......',
    '...#..',
  ],
  /* בסגנון הדוגמה שנשלחה: פינות חסומות ומילים באורך 3–5 */
  'mini': [
    '#....',
    '.....',
    '.....',
    '.....',
    '....#',
  ],
  /* ברוחב 5 תא שחור באמצע שורה משאיר רצף של 2, ולכן חסימות מותרות
   * רק בקצוות. ברוחב 7 אפשר גם באמצע (3+3). */
  'mini-b': [
    '#....',
    '.....',
    '.....',
    '.....',
    '#....',
  ],
  'mini-c': [
    '....#',
    '.....',
    '.....',
    '.....',
    '#....',
  ],
};

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

if (args.includes('--list')) {
  console.log('תבניות זמינות:\n');
  for (const [name, rows] of Object.entries(PATTERNS)) {
    console.log(`  ${name}`);
    rows.forEach((r) => console.log(`    ${[...r].reverse().join(' ')}`));
    console.log('');
  }
  process.exit(0);
}

if (!fs.existsSync(WORDS)) {
  console.error('חסר data/crossword-words.json — הריצו: node tools/build-crossword-words.js');
  process.exit(1);
}

const patternName = argVal('pattern', '5x5-a');
const grid = PATTERNS[patternName];
if (!grid) {
  console.error(`אין תבנית בשם "${patternName}". להצגת הרשימה: --list`);
  process.exit(1);
}

const seed = Number(argVal('seed', 1));
const { words: DICT } = JSON.parse(fs.readFileSync(WORDS, 'utf8'));

/* ----- בריכת ה"טעם" -----
 * דירוג לפי שכיחות בוחר מילים מנהלתיות — בדיקה, שיקוף, טקסים.
 * הן נפוצות ולכן שורדות כל סינון, והן משעממות. הרשימה הידנית
 * מקבלת עדיפות מוחלטת במילוי, והמילון הרגיל משמש רק כשאין ברירה. */
const FINAL_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const normalise = (w) => [...w].map((c) => FINAL_MAP[c] || c).join('');

const flavor = new Set();
const FLAVOR_FILE = path.join(ROOT, 'data', 'flavor-words.txt');
if (fs.existsSync(FLAVOR_FILE)) {
  for (const line of fs.readFileSync(FLAVOR_FILE, 'utf8').split('\n')) {
    const w = line.trim();
    if (/^[א-ת]+$/.test(w)) flavor.add(normalise(w));
  }
}

/* מילים מהרשימה הידנית נכנסות למילון גם אם לא שרדו את הסינון
 * הסטטיסטי — "יריחו" ו"סחוג" נדירים בקורפוס אך מצוינים בתשבץ. */
for (const w of flavor) {
  const len = [...w].length;
  if (len < 3 || len > 7) continue;
  DICT[len] = DICT[len] || [];
  if (!DICT[len].includes(w)) DICT[len].push(w);
}

/* ----- אקראיות עם זרע, כדי שאותו seed ייתן תמיד את אותו מילוי ----- */
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ----- זיהוי המשבצות ברשת ----- */
const rows = grid.length;
const cols = grid[0].length;
const open = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === '.';

const slots = [];
const shortRuns = [];

// מאוזן: רצף אופקי; המילה מתחילה בתא הימני ביותר
for (let r = 0; r < rows; r++) {
  let c = cols - 1;
  while (c >= 0) {
    if (!open(r, c)) { c--; continue; }
    const cells = [];
    while (c >= 0 && open(r, c)) { cells.push([r, c]); c--; }
    if (cells.length >= MIN_SLOT) slots.push({ dir: 'across', cells });
    else if (cells.length === 2) shortRuns.push(`מאוזן בשורה ${r}`);
  }
}

// מאונך: רצף אנכי מלמעלה למטה
for (let c = 0; c < cols; c++) {
  let r = 0;
  while (r < rows) {
    if (!open(r, c)) { r++; continue; }
    const cells = [];
    while (r < rows && open(r, c)) { cells.push([r, c]); r++; }
    if (cells.length >= MIN_SLOT) slots.push({ dir: 'down', cells });
    else if (cells.length === 2) shortRuns.push(`מאונך בעמודה ${c}`);
  }
}

const tooLong = slots.filter((s) => s.cells.length > 7);
if (tooLong.length) {
  console.error(`התבנית מכילה מילים ארוכות מ-7 אותיות (${tooLong.length}). קצרו אותה.`);
  process.exit(1);
}
if (shortRuns.length) {
  console.error(`התבנית מייצרת רצפים של 2 תאים (${shortRuns.join(', ')}).`);
  console.error('רצף כזה נותן ערכים כמו "הל" או "ינ". הזיזו את התאים השחורים.');
  process.exit(1);
}

/* כל תא לבן חייב להשתייך גם למילה מאוזנת וגם למאונכת. תא ששייך רק
 * לאחת מהן משאיר אות שאין עליה שום רמז שני — הפותר יכול רק לנחש. */
const unchecked = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (!open(r, c)) continue;
    const inBoth = ['across', 'down'].every((dir) =>
      slots.some((s) => s.dir === dir && s.cells.some(([sr, sc]) => sr === r && sc === c)));
    if (!inBoth) unchecked.push(`${r},${c}`);
  }
}
if (unchecked.length) {
  console.error(`בתבנית יש תאים ששייכים למילה אחת בלבד: ${unchecked.join(' · ')}`);
  console.error('לאות כזו אין רמז שני, ואפשר רק לנחש אותה. הזיזו את התאים השחורים.');
  process.exit(1);
}

/* ----- אינדקס: לכל אורך, מילים לפי (מיקום, אות) ----- */
const byLen = {};
for (const [len, list] of Object.entries(DICT)) byLen[len] = list;

const key = (r, c) => `${r},${c}`;

/* ----- חיפוש לאחור ----- */
const assign = new Map();     // "r,c" → אות
const used = new Set();       // מילים שכבר נוצלו, כדי שלא תחזור אותה מילה

function candidatesFor(slot) {
  const len = slot.cells.length;
  const pool = byLen[len] || [];
  const fixed = slot.cells.map(([r, c]) => assign.get(key(r, c)) || null);

  const out = [];
  for (const w of pool) {
    if (used.has(w)) continue;
    let ok = true;
    for (let i = 0; i < len; i++) {
      if (fixed[i] && w[i] !== fixed[i]) { ok = false; break; }
    }
    if (ok) out.push(w);
  }
  return out;
}

let nodes = 0;
const LIMIT = 400000;

function solve(remaining) {
  if (!remaining.length) return true;
  if (++nodes > LIMIT) throw new Error('limit');

  // המשבצת עם הכי מעט מועמדים — מגלה מבוי סתום מוקדם
  let best = null, bestList = null;
  for (const slot of remaining) {
    const list = candidatesFor(slot);
    if (!list.length) return false;
    if (!bestList || list.length < bestList.length) { best = slot; bestList = list; }
    if (list.length === 1) break;
  }

  const rest = remaining.filter((s) => s !== best);

  /* סדר הניסיון: קודם מילים מרשימת ה"טעם", ורק אחריהן המילון הרגיל.
   * בתוך כל קבוצה מערבבים, כדי שרשתות שונות ייצאו מ-seed שונה.
   * המילון מוגבל ל-300 הנפוצות ביותר — הוא ממוין לפי שכיחות, וערבוב
   * של הכול היה מציף את הרשת במילים שאיש לא מכיר. */
  const tasty = shuffled(bestList.filter((w) => flavor.has(w)));
  const plain = shuffled(bestList.filter((w) => !flavor.has(w)).slice(0, 300));
  const pool = [...tasty, ...plain];

  for (const word of pool.slice(0, 80)) {
    const touched = [];
    let ok = true;
    for (let i = 0; i < best.cells.length; i++) {
      const [r, c] = best.cells[i];
      const k = key(r, c);
      if (assign.has(k)) {
        if (assign.get(k) !== word[i]) { ok = false; break; }
      } else {
        assign.set(k, word[i]);
        touched.push(k);
      }
    }
    if (ok) {
      used.add(word);
      if (solve(rest)) return true;
      used.delete(word);
    }
    touched.forEach((k) => assign.delete(k));
  }
  return false;
}

let solved = false;
try {
  solved = solve(slots);
} catch (e) {
  if (e.message !== 'limit') throw e;
}

if (!solved) {
  console.error(`לא נמצא מילוי לתבנית "${patternName}" עם seed ${seed}.`);
  console.error('נסו seed אחר, או תבנית עם יותר תאים שחורים.');
  process.exit(1);
}

/* ----- מספור: שורות מלמעלה למטה, בכל שורה מימין לשמאל ----- */
const numbers = new Map();
let next = 1;
for (let r = 0; r < rows; r++) {
  for (let c = cols - 1; c >= 0; c--) {
    if (!open(r, c)) continue;
    const startsAcross = !open(r, c + 1) && open(r, c - 1);
    const startsDown = !open(r - 1, c) && open(r + 1, c);
    if (startsAcross || startsDown) numbers.set(key(r, c), next++);
  }
}

/* ----- פלט ----- */
const letters = [];
for (let r = 0; r < rows; r++) {
  let line = '';
  for (let c = 0; c < cols; c++) line += open(r, c) ? assign.get(key(r, c)) : '#';
  letters.push(line);
}

const entries = slots.map((slot) => {
  const [r0, c0] = slot.cells[0];
  return {
    n: numbers.get(key(r0, c0)),
    dir: slot.dir,
    row: r0,
    col: c0,
    answer: slot.cells.map(([r, c]) => assign.get(key(r, c))).join(''),
  };
}).sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === 'across' ? -1 : 1));

console.log(`תבנית: ${patternName}   seed: ${seed}   צמתים: ${nodes.toLocaleString()}\n`);
console.log('הרשת (מוצגת מימין לשמאל, כמו במסך):');
letters.forEach((line) => console.log('   ' + [...line].reverse().map((ch) => ch === '#' ? '■' : ch).join(' ')));

console.log('\nמאוזן:');
entries.filter((e) => e.dir === 'across').forEach((e) => console.log(`  ${String(e.n).padStart(2)}  ${e.answer}`));
console.log('\nמאונך:');
entries.filter((e) => e.dir === 'down').forEach((e) => console.log(`  ${String(e.n).padStart(2)}  ${e.answer}`));

console.log('\n--- JSON ---');
console.log(JSON.stringify({ pattern: grid, letters, entries }, null, 1));
