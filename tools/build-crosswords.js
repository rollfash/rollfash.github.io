/* =========================================================================
 * build-crosswords.js — מאמת את התשבצים ובונה crossword/js/puzzles.js
 *
 * הרצה:  node tools/build-crosswords.js
 *
 * הבדיקות כאן הן הרשת הביטחונית: תשבץ שבור מגיע לשחקנים כדף שאי אפשר
 * לפתור, ואין שום דרך לתקן אותו מהצד שלהם. לכן נבדק —
 *
 *   • כל תא הוא אות עברית רגילה או '#'
 *   • אין אותיות סופיות (מתנגשות עם המילה החוצה)
 *   • כל השורות באותו אורך
 *   • אין רצף של תא אחד או שניים
 *   • אין מילה ארוכה מ-7
 *   • לכל משבצת יש הגדרה, ולכל הגדרה יש משבצת
 *   • כל תא לבן שייך גם למילה מאוזנת וגם למאונכת
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'crosswords.json');
const OUT = path.join(ROOT, 'crossword', 'js', 'puzzles.js');

const MIN_SLOT = 3;
const MAX_SLOT = 7;
const FINALS = 'ךםןףץ';

const { puzzles } = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const problems = [];

/** גוזר משבצות ומספור מרשת האותיות. חייב להיות זהה ללוגיקה שבמשחק. */
function analyse(letters) {
  const rows = letters.length;
  const cols = [...letters[0]].length;
  const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? [...letters[r]][c] : '#');
  const open = (r, c) => at(r, c) !== '#';

  const slots = [];

  // מאוזן — מתחיל בתא הימני ביותר של הרצף
  for (let r = 0; r < rows; r++) {
    let c = cols - 1;
    while (c >= 0) {
      if (!open(r, c)) { c--; continue; }
      const cells = [];
      while (c >= 0 && open(r, c)) { cells.push([r, c]); c--; }
      slots.push({ dir: 'across', cells });
    }
  }
  // מאונך — מלמעלה למטה
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (!open(r, c)) { r++; continue; }
      const cells = [];
      while (r < rows && open(r, c)) { cells.push([r, c]); r++; }
      slots.push({ dir: 'down', cells });
    }
  }

  // מספור: שורות מלמעלה למטה, בכל שורה מימין לשמאל
  const numbers = new Map();
  let next = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = cols - 1; c >= 0; c--) {
      if (!open(r, c)) continue;
      const startsAcross = !open(r, c + 1) && open(r, c - 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      if (startsAcross || startsDown) numbers.set(`${r},${c}`, next++);
    }
  }

  const entries = slots.map((s) => ({
    ...s,
    n: numbers.get(`${s.cells[0][0]},${s.cells[0][1]}`),
    answer: s.cells.map(([r, c]) => at(r, c)).join(''),
  }));

  return { rows, cols, entries, numbers, open };
}

for (const p of puzzles) {
  const where = `תשבץ ${p.id}`;

  if (!Array.isArray(p.letters) || !p.letters.length) {
    problems.push(`${where}: אין רשת`);
    continue;
  }
  const width = [...p.letters[0]].length;
  p.letters.forEach((row, i) => {
    if ([...row].length !== width) problems.push(`${where}: שורה ${i} באורך שונה`);
    [...row].forEach((ch, c) => {
      if (ch !== '#' && !/[א-ת]/.test(ch)) problems.push(`${where}: תו לא חוקי "${ch}" בשורה ${i}`);
      if (FINALS.includes(ch)) problems.push(`${where}: אות סופית "${ch}" בשורה ${i}, עמודה ${c}`);
    });
  });

  const { entries, open, rows, cols } = analyse(p.letters);

  for (const e of entries) {
    const len = e.cells.length;
    if (len < MIN_SLOT) problems.push(`${where}: רצף באורך ${len} (${e.dir}) — קצר מדי`);
    if (len > MAX_SLOT) problems.push(`${where}: "${e.answer}" באורך ${len} — ארוך מ-${MAX_SLOT}`);
    const clue = p.clues?.[e.dir]?.[String(e.n)];
    if (!clue || !clue.trim()) problems.push(`${where}: אין הגדרה ל-${e.n} ${e.dir} (${e.answer})`);
  }

  // הגדרות יתומות
  for (const dir of ['across', 'down']) {
    for (const n of Object.keys(p.clues?.[dir] || {})) {
      if (!entries.some((e) => e.dir === dir && String(e.n) === n)) {
        problems.push(`${where}: הגדרה ${n} ${dir} אינה מתאימה לאף משבצת`);
      }
    }
  }

  // כל תא לבן צריך להשתייך לשתי מילים, אחרת יש אות שאין לה שום רמז
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      const inTwo = ['across', 'down'].every((dir) =>
        entries.some((e) => e.dir === dir && e.cells.some(([er, ec]) => er === r && ec === c)));
      if (!inTwo) problems.push(`${where}: התא ${r},${c} אינו חלק משתי מילים`);
    }
  }
}

if (problems.length) {
  console.error('נמצאו בעיות:\n');
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT,
`/* -------------------------------------------------------------------------
 * puzzles.js — נוצר אוטומטית על ידי tools/build-crosswords.js
 *
 * אין לערוך ידנית. לעריכה: data/crosswords.json ואז הרצה מחדש.
 * המספור והמשבצות נגזרים מרשת האותיות בזמן ריצה.
 * ---------------------------------------------------------------------- */

window.CROSSWORD_DATA = ${JSON.stringify(puzzles, null, 1)};
`, 'utf8');

console.log(`✓ ${puzzles.length} תשבצים תקינים`);
puzzles.forEach((p) => {
  const { entries, rows, cols } = analyse(p.letters);
  console.log(`  ${p.id}  ${rows}×${cols}  ${entries.length} מילים`);
});
console.log(`\nנכתב ${path.relative(ROOT, OUT)}`);
console.log(`מספיק ל-${puzzles.length} ימי משחק.`);
