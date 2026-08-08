/* =========================================================================
 * crossword-builder.js — בונה תשבצים בשיטת סיפוק אילוצים
 *
 * הרצה:
 *   node tools/crossword-builder.js 10            עשרה תשבצים
 *   node tools/crossword-builder.js 10 --shape 6x5
 *   node tools/crossword-builder.js 5 --allow-reuse
 *
 * ----- האלגוריתם -----
 * מילוי רשת הוא בעיית סיפוק אילוצים: כל משבצת היא משתנה, המילים הן
 * התחום, והאילוץ הוא שתאים משותפים יסכימו על אותה אות. ארבע טכניקות
 * שמפרידות בין פותר שעובד לפותר שנתקע:
 *
 *   1. אינדוקס לפי (אורך, מיקום, אות)
 *      מציאת מועמדים היא חיתוך קבוצות, לא סריקה של כל המילון.
 *      זה ההבדל בין O(n) לכל בדיקה לבין O(1) בערך.
 *
 *   2. MRV — המשבצת עם הכי מעט מועמדים נבחרת ראשונה.
 *      מגלה מבוי סתום מוקדם במקום לגלות אותו אחרי עשר רמות.
 *
 *   3. בדיקה קדימה (forward checking)
 *      אחרי הצבת מילה, בודקים שלכל משבצת *חוצה* עדיין נשאר לפחות
 *      מועמד אחד. אם לא — חוזרים מיד, בלי לרדת ברקורסיה.
 *      זו הטכניקה שהכי משפרת, ובדיוק זו שחסרה בגרסה הקודמת.
 *
 *   4. הפעלות מחדש אקראיות
 *      כשנגמר תקציב הצמתים, מתחילים מחדש בסדר אחר. חיפוש לאחור
 *      נוטה להיתקע באזור גרוע; הפעלה מחדש זולה יותר מלהתעקש.
 *
 * ----- דירוג מילים -----
 * מועמדים מנוסים לפי איכות: קודם מילים שכבר יש להן הגדרה במאגר,
 * אחריהן מילים מרשימת ה"טעם", ולבסוף המילון הכללי. כך הרשת נוטה
 * להתמלא במילים טובות, ובמילים שלא צריך לכתוב להן הגדרה חדשה.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');

/* ===================== תבניות ===================== */
/* כלל: אף רצף לא קצר מ-3 ולא ארוך מ-7, וכל תא לבן שייך לשתי מילים. */
const SHAPES = {
  'mini':    ['#....', '.....', '.....', '.....', '....#'],
  'mini-b':  ['#....', '.....', '.....', '.....', '#....'],
  'mini-c':  ['....#', '.....', '.....', '.....', '#....'],
  'open':    ['.....', '.....', '.....', '.....', '.....'],
  '6x5':     ['#.....', '......', '......', '......', '.....#'],
  '6x5-b':   ['##....', '......', '......', '......', '....##'],
  '7x5':     ['##.....', '.......', '.......', '.......', '.....##'],
};

/* ===================== קלט ===================== */
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const want = Number(args[0]) || 5;
const onlyShape = argVal('shape', null);
const allowReuse = args.includes('--allow-reuse');

/* --clued-only: למלא רק ממילים שכבר יש להן הגדרה. אם זה מצליח,
 * כל תשבץ שנוצר מגיע מוכן לחלוטין ואין מה לכתוב. */
const cluedOnly = args.includes('--clued-only');

/* ===================== מאגר המילים ===================== */
const answers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'crossword-answers.json'), 'utf8')).words;

const flavor = new Set();
const flavorFile = path.join(ROOT, 'data', 'flavor-words.txt');
if (fs.existsSync(flavorFile)) {
  for (const line of fs.readFileSync(flavorFile, 'utf8').split('\n')) {
    const w = line.trim();
    if (/^[א-ת]+$/.test(w)) flavor.add(norm(w));
  }
}

/* מילים שכבר יש להן הגדרה — עדיפות עליונה, כי הן לא דורשות עבודה */
const clued = new Map();
const bankFile = path.join(ROOT, 'data', 'clue-bank.json');
if (fs.existsSync(bankFile)) {
  for (const e of JSON.parse(fs.readFileSync(bankFile, 'utf8')).entries) {
    clued.set(norm(e.w), e.clues[0]);
  }
}

/* מילים שכבר שימשו בתשבצים קיימים — לא חוזרים עליהן */
const alreadyUsed = new Set();
const xwFile = path.join(ROOT, 'data', 'crosswords.json');
if (fs.existsSync(xwFile) && !allowReuse) {
  for (const p of JSON.parse(fs.readFileSync(xwFile, 'utf8')).puzzles) {
    const rows = p.letters.map((r) => [...r]);
    const R = rows.length, C = rows[0].length;
    const open = (r, c) => r >= 0 && r < R && c >= 0 && c < C && rows[r][c] !== '#';
    for (let r = 0; r < R; r++) {
      let c = C - 1;
      while (c >= 0) {
        if (!open(r, c)) { c--; continue; }
        let w = '';
        while (c >= 0 && open(r, c)) { w += rows[r][c]; c--; }
        if (w.length > 2) alreadyUsed.add(w);
      }
    }
    for (let c = 0; c < C; c++) {
      let r = 0;
      while (r < R) {
        if (!open(r, c)) { r++; continue; }
        let w = '';
        while (r < R && open(r, c)) { w += rows[r][c]; r++; }
        if (w.length > 2) alreadyUsed.add(w);
      }
    }
  }
}

/* ----- בניית המילון המדורג ----- */
const WORDS = {};   // אורך → מערך מילים
const SCORE = new Map();
for (const [len, list] of Object.entries(answers)) {
  const L = Number(len);
  if (L < 3 || L > 7) continue;
  WORDS[L] = [];
  for (const w of list) {
    WORDS[L].push(w);
    SCORE.set(w, clued.has(w) ? 3 : flavor.has(w) ? 2 : 1);
  }
}
// מילים מרשימת הטעם שלא שרדו את הסינון הסטטיסטי — מוסיפים ידנית
/* מילים מרשימת ה"טעם" ומילים שיש להן הגדרה נכנסות למילון גם אם לא
 * שרדו את הסינון הסטטיסטי. מילה שנכתבה לה הגדרה טובה היא בהגדרה ערך
 * טוב לתשבץ — הסינון האוטומטי פסל חלק מהן בטעות. */
for (const w of flavor) {
  const L = [...w].length;
  if (L < 3 || L > 7) continue;
  if (!WORDS[L]) WORDS[L] = [];
  if (!SCORE.has(w)) { WORDS[L].push(w); SCORE.set(w, 2); }
}
for (const w of clued.keys()) {
  const L = [...w].length;
  if (L < 3 || L > 7) continue;
  if (!WORDS[L]) WORDS[L] = [];
  if (!SCORE.has(w)) WORDS[L].push(w);
  SCORE.set(w, 3);            // עדיפות עליונה: אין צורך לכתוב הגדרה
}

if (cluedOnly) {
  for (const L of Object.keys(WORDS)) WORDS[L] = WORDS[L].filter((w) => clued.has(w));
}

/* ----- אינדקס (אורך, מיקום, אות) → קבוצת מילים ----- */
const INDEX = {};
for (const [len, list] of Object.entries(WORDS)) {
  const L = Number(len);
  INDEX[L] = Array.from({ length: L }, () => new Map());
  for (const w of list) {
    for (let i = 0; i < L; i++) {
      const c = w[i];
      if (!INDEX[L][i].has(c)) INDEX[L][i].set(c, []);
      INDEX[L][i].get(c).push(w);
    }
  }
}

/* ===================== ניתוח תבנית ===================== */
function analyse(grid) {
  const R = grid.length, C = grid[0].length;
  const open = (r, c) => r >= 0 && r < R && c >= 0 && c < C && grid[r][c] === '.';
  const slots = [];

  for (let r = 0; r < R; r++) {
    let c = C - 1;
    while (c >= 0) {
      if (!open(r, c)) { c--; continue; }
      const cells = [];
      while (c >= 0 && open(r, c)) { cells.push([r, c]); c--; }
      if (cells.length >= 2) slots.push({ dir: 'across', cells });
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (!open(r, c)) { r++; continue; }
      const cells = [];
      while (r < R && open(r, c)) { cells.push([r, c]); r++; }
      if (cells.length >= 2) slots.push({ dir: 'down', cells });
    }
  }

  // ולידציה של התבנית עצמה
  const bad = [];
  slots.forEach((s) => {
    if (s.cells.length < 3) bad.push(`רצף באורך ${s.cells.length}`);
    if (s.cells.length > 7) bad.push(`רצף באורך ${s.cells.length}`);
  });
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!open(r, c)) continue;
      const both = ['across', 'down'].every((d) =>
        slots.some((s) => s.dir === d && s.cells.some(([sr, sc]) => sr === r && sc === c)));
      if (!both) bad.push(`התא ${r},${c} שייך למילה אחת בלבד`);
    }
  }

  // אילו משבצות חוצות אילו — נחוץ לבדיקה קדימה
  slots.forEach((s, i) => {
    s.id = i;
    s.crossings = [];
  });
  slots.forEach((s) => {
    s.cells.forEach(([r, c], idx) => {
      slots.forEach((o) => {
        if (o === s) return;
        const j = o.cells.findIndex(([or, oc]) => or === r && oc === c);
        if (j >= 0) s.crossings.push({ myIndex: idx, other: o, otherIndex: j });
      });
    });
  });

  return { R, C, slots, bad, open };
}

/* ===================== הפותר ===================== */
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solve(slots, seed, budget = 60000) {
  const rand = mulberry32(seed);
  const assign = new Map();   // "r,c" → אות
  const used = new Set();
  let nodes = 0;

  const key = (r, c) => `${r},${c}`;

  /** מועמדים למשבצת — חיתוך האינדקס לפי האותיות שכבר קבועות */
  function candidates(slot) {
    const L = slot.cells.length;
    const fixed = [];
    slot.cells.forEach(([r, c], i) => {
      const ch = assign.get(key(r, c));
      if (ch) fixed.push([i, ch]);
    });

    if (!fixed.length) return WORDS[L] || [];

    // מתחילים מהקבוצה הקטנה ביותר, כדי שהחיתוך יהיה זול
    let lists = fixed.map(([i, ch]) => (INDEX[L]?.[i]?.get(ch)) || []);
    lists.sort((a, b) => a.length - b.length);
    let out = lists[0];
    for (let k = 1; k < lists.length && out.length; k++) {
      const set = new Set(lists[k]);
      out = out.filter((w) => set.has(w));
    }
    return out;
  }

  /* הסינון נעשה כאן ולא מראש בבניית המילון: alreadyUsed גדל תוך כדי
   * הריצה, ככל שנבנים תשבצים נוספים. סינון מראש היה מקפיא את הרשימה
   * ומאפשר לתשבץ השני לחזור על המילים של הראשון. */
  const available = (slot) =>
    candidates(slot).filter((w) => !used.has(w) && !alreadyUsed.has(w));

  function search(remaining) {
    if (!remaining.length) return true;
    if (++nodes > budget) throw new Error('budget');

    // MRV — המשבצת עם הכי מעט אפשרויות
    let best = null, bestList = null;
    for (const s of remaining) {
      const list = available(s);
      if (!list.length) return false;
      if (!bestList || list.length < bestList.length) { best = s; bestList = list; }
      if (list.length === 1) break;
    }

    // דירוג: קודם מילים עם הגדרה, אחר כך מילות טעם, ואז השאר.
    // בתוך כל דרגה מערבבים, כדי ש-seed שונה ייתן רשת שונה.
    const tiers = [[], [], []];
    for (const w of bestList) tiers[3 - SCORE.get(w)].push(w);
    tiers.forEach((t) => {
      for (let i = t.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [t[i], t[j]] = [t[j], t[i]];
      }
    });
    const ordered = [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, 40);

    const rest = remaining.filter((s) => s !== best);

    for (const word of ordered) {
      const touched = [];
      let ok = true;
      for (let i = 0; i < best.cells.length; i++) {
        const [r, c] = best.cells[i];
        const k = key(r, c);
        if (assign.has(k)) { if (assign.get(k) !== word[i]) { ok = false; break; } }
        else { assign.set(k, word[i]); touched.push(k); }
      }

      if (ok) {
        used.add(word);
        // בדיקה קדימה: כל משבצת חוצה חייבת להישאר עם אפשרות אחת לפחות
        let viable = true;
        for (const cross of best.crossings) {
          if (!rest.includes(cross.other)) continue;
          if (!available(cross.other).length) { viable = false; break; }
        }
        if (viable && search(rest)) return true;
        used.delete(word);
      }
      touched.forEach((k) => assign.delete(k));
    }
    return false;
  }

  try {
    if (search(slots)) return assign;
  } catch (e) {
    if (e.message !== 'budget') throw e;
  }
  return null;
}

/** מנסה כמה הפעלות מחדש לפני שמוותרים על התבנית. */
function fill(grid, startSeed, restarts = 25) {
  const { slots, bad } = analyse(grid);
  if (bad.length) return { error: bad[0] };
  for (let i = 0; i < restarts; i++) {
    const assign = solve(slots, startSeed + i * 977);
    if (assign) return { assign, slots, seed: startSeed + i * 977 };
  }
  return { error: 'לא נמצא מילוי' };
}

/* ===================== הרצה ===================== */
const shapeNames = onlyShape ? [onlyShape] : ['mini', 'mini-b', 'mini-c'];
const built = [];
let seed = 1;
let attempts = 0;

while (built.length < want && attempts < want * 8) {
  const name = shapeNames[built.length % shapeNames.length];
  const grid = SHAPES[name];
  attempts++;
  if (!grid) { console.error(`אין תבנית "${name}"`); process.exit(1); }

  /* מייצרים כמה מילויים ובוחרים את זה שמנצל הכי הרבה מילים שכבר יש
   * להן הגדרה. תיעדוף בתוך משבצת בודדת לא מספיק: היוריסטיקה בוחרת
   * קודם את המשבצת הכי מוגבלת, ושם ממילא כמעט אין מועמדים מוגדרים.
   * חיפוש על פני כמה מילויים שלמים עובד הרבה יותר טוב. */
  let best = null, bestScore = -1;
  for (let t = 0; t < 12; t++) {
    const r = fill(grid, seed + t * 131, 8);
    if (r.error) continue;
    const ws = r.slots.map((s) => s.cells.map(([rr, cc]) => r.assign.get(`${rr},${cc}`)).join(''));
    const score = ws.filter((w) => clued.has(w)).length;
    if (score > bestScore) { bestScore = score; best = r; }
    if (score === ws.length) break;          // הכול מוגדר, אין מה לשפר
  }
  seed += 5000;
  if (!best) continue;
  const res = best;

  const { assign, slots } = res;
  const R = grid.length, C = grid[0].length;
  const letters = [];
  for (let r = 0; r < R; r++) {
    let line = '';
    for (let c = 0; c < C; c++) line += grid[r][c] === '#' ? '#' : assign.get(`${r},${c}`);
    letters.push(line);
  }

  const words = slots.map((s) => s.cells.map(([r, c]) => assign.get(`${r},${c}`)).join(''));
  if (new Set(words).size !== words.length) continue;

  words.forEach((w) => alreadyUsed.add(w));
  built.push({ shape: name, letters, slots, words });
}

/* ----- דוח ----- */
console.log(`נבנו ${built.length} תשבצים (${attempts} נסיונות)\n`);

let needClues = 0, haveClues = 0;
built.forEach((b, i) => {
  console.log(`--- ${String(i + 1).padStart(3, '0')}  (${b.shape}) ---`);
  b.letters.forEach((l) => console.log('    ' + [...l].reverse().map((c) => c === '#' ? '■' : c).join(' ')));
  const marks = b.words.map((w) => {
    if (clued.has(w)) { haveClues++; return `${w}✓`; }
    needClues++;
    return flavor.has(w) ? `${w}*` : w;
  });
  console.log('    ' + marks.join('  '));
  console.log('');
});

console.log(`✓ = כבר יש הגדרה   * = מילת "טעם" ללא הגדרה`);
console.log(`יש הגדרה: ${haveClues}   צריך לכתוב: ${needClues}`);
