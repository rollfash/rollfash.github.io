/* =========================================================================
 * clue-coverage.js — כמה הגדרות באמת צריך ל-N תשבצים?
 *
 * הרצה:  node tools/clue-coverage.js 150
 *
 * השאלה: אם נכתוב הגדרות ל-X מילים, כמה תשבצים אפשר להרכיב מהן?
 * התשובה תלויה בחפיפה בין רשתות — כמה מילים חוזרות. אם החפיפה
 * גבוהה, מאגר הגדרות קטן מכסה הרבה תשבצים; אם היא נמוכה, כל תשבץ
 * דורש עשר הגדרות חדשות ואין קיצור דרך.
 *
 * הכלי מייצר הרבה רשתות, סופר שכיחות מילים, ומודד כמה רשתות
 * מכוסות במלואן על ידי N המילים הנפוצות ביותר.
 * ======================================================================= */

const { execFileSync } = require('child_process');
const path = require('path');

const FILL = path.join(__dirname, 'fill-grid.js');
const SHAPES = ['mini', 'mini-b', 'mini-c'];
const want = Number(process.argv[2] || 100);

const grids = [];
let seed = 1000;
process.stdout.write('מייצר רשתות: ');

while (grids.length < want && seed < 1000 + want * 4) {
  const shape = SHAPES[grids.length % SHAPES.length];
  try {
    const out = execFileSync(process.execPath, [FILL, '--pattern', shape, '--seed', String(seed)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const data = JSON.parse(out.slice(out.indexOf('--- JSON ---') + 12));
    const answers = data.entries.map((e) => e.answer);
    if (new Set(answers).size === answers.length) {
      grids.push(answers);
      if (grids.length % 25 === 0) process.stdout.write(`${grids.length} `);
    }
  } catch { /* seed שלא נפתר */ }
  seed++;
}
console.log(`\nנוצרו ${grids.length} רשתות\n`);

/* ----- שכיחות מילים ----- */
const freq = new Map();
grids.forEach((g) => g.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)));
const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);

console.log(`מילים ייחודיות בסך הכול: ${ranked.length.toLocaleString()}`);
console.log(`מילים לכל רשת: 10  ·  סה"כ משבצות: ${grids.length * 10}`);
console.log(`חפיפה: כל מילה מופיעה בממוצע ב-${(grids.length * 10 / ranked.length).toFixed(2)} רשתות\n`);

console.log('העשר הנפוצות:');
ranked.slice(0, 10).forEach(([w, n]) => console.log(`  ${w.padEnd(9)} ${n}`));

/* ----- כיסוי: כמה רשתות מכוסות במלואן על ידי N המילים הנפוצות ----- */
console.log('\nכמה הגדרות → כמה תשבצים מוכנים:');
console.log('הגדרות   תשבצים מכוסים   יחס');
for (const n of [200, 400, 600, 900, 1200, 1600, 2000, ranked.length]) {
  if (n > ranked.length) continue;
  const pool = new Set(ranked.slice(0, n).map(([w]) => w));
  const covered = grids.filter((g) => g.every((w) => pool.has(w))).length;
  console.log(
    String(n).padStart(6),
    String(covered).padStart(14),
    `   ${(covered / grids.length * 100).toFixed(1)}% מהרשתות`,
  );
}

console.log('\nהמסקנה המעשית:');
const per = ranked.length / grids.length;
console.log(`  כל רשת חדשה מוסיפה בממוצע ${per.toFixed(1)} מילים שעדיין אין להן הגדרה.`);
console.log(`  ל-90 תשבצים צריך בערך ${Math.round(per * 90).toLocaleString()} הגדרות.`);
