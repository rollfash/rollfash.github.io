/* =========================================================================
 * batch-grids.js — מייצר רשתות מוכנות להגדרה
 *
 * הרצה:  node tools/batch-grids.js 30          שלושים רשתות
 *        node tools/batch-grids.js 30 --from 40  החל מ-seed 40
 *
 * מייצר רשתות תקינות, מסנן את הגרועות, ומדפיס אותן בפורמט שאפשר
 * להדביק ל-data/crosswords.json. ההגדרות עדיין נכתבות ביד — זה החלק
 * שאי אפשר לייצר אוטומטית, כי הגדרה גרועה גרועה יותר מהיעדר תשבץ.
 *
 * שלוש צורות רשת מתחלפות, כדי שימים עוקבים לא ייראו זהים.
 * ======================================================================= */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const FILL = path.join(__dirname, 'fill-grid.js');
const SHAPES = ['mini', 'mini-b', 'mini-c'];

const want = Number(process.argv[2] || 10);
const fromArg = process.argv.indexOf('--from');
const startSeed = fromArg > 0 ? Number(process.argv[fromArg + 1]) : 100;

/* מילים שנראות חלשות כערך תשבץ. לא סינון מושלם — רק כדי לא לבזבז
 * זמן על רשתות שברור מראש שלא נרצה. */
const WEAK = /^(נחתמ|נשלח|נכתב|נבחר|נמסר|נערכ|נקבע|הוחלט|הועבר|סייעה|קיבלה|עשתה)$/;

const grids = [];
let seed = startSeed;
let tried = 0;

while (grids.length < want && tried < want * 12) {
  const shape = SHAPES[grids.length % SHAPES.length];
  tried++;
  let out;
  try {
    out = execFileSync(process.execPath, [FILL, '--pattern', shape, '--seed', String(seed)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { seed++; continue; }

  const json = out.slice(out.indexOf('--- JSON ---') + 12);
  let data;
  try { data = JSON.parse(json); } catch { seed++; continue; }

  const answers = data.entries.map((e) => e.answer);
  if (answers.some((a) => WEAK.test(a))) { seed++; continue; }
  // לא רוצים אותה מילה פעמיים באותו תשבץ
  if (new Set(answers).size !== answers.length) { seed++; continue; }

  grids.push({ shape, seed, letters: data.letters, entries: data.entries });
  seed++;
}

console.log(`נוצרו ${grids.length} רשתות (נוסו ${tried} seeds)\n`);

grids.forEach((g, i) => {
  const id = String(i + 1).padStart(3, '0');
  const across = g.entries.filter((e) => e.dir === 'across').sort((a, b) => a.n - b.n);
  const down = g.entries.filter((e) => e.dir === 'down').sort((a, b) => a.n - b.n);

  console.log(`--- ${id}  (${g.shape}, seed ${g.seed}) ---`);
  g.letters.forEach((l) => console.log('    ' + [...l].reverse().map((c) => c === '#' ? '■' : c).join(' ')));
  console.log('    מאוזן: ' + across.map((e) => `${e.n}=${e.answer}`).join('  '));
  console.log('    מאונך: ' + down.map((e) => `${e.n}=${e.answer}`).join('  '));
  console.log('');
});

/* קובץ עבודה: הרשתות עם הגדרות ריקות, מוכן למילוי */
const stub = grids.map((g, i) => ({
  id: String(i + 1).padStart(3, '0'),
  _shape: g.shape,
  _seed: g.seed,
  letters: g.letters,
  clues: {
    across: Object.fromEntries(g.entries.filter((e) => e.dir === 'across')
      .sort((a, b) => a.n - b.n).map((e) => [String(e.n), `TODO ${e.answer}`])),
    down: Object.fromEntries(g.entries.filter((e) => e.dir === 'down')
      .sort((a, b) => a.n - b.n).map((e) => [String(e.n), `TODO ${e.answer}`])),
  },
}));

const OUT = path.join(ROOT, 'data', 'crosswords-staging.json');
fs.writeFileSync(OUT, JSON.stringify({ puzzles: stub }, null, 1), 'utf8');
console.log(`נכתב ${path.relative(ROOT, OUT)} — הגדרות מסומנות TODO`);
