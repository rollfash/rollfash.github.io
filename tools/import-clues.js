/* =========================================================================
 * import-clues.js — קולט קובץ "מילה | הגדרה" למאגר ההגדרות
 *
 * הרצה:  node tools/import-clues.js D:/tashbetz_words.txt
 *        node tools/import-clues.js <file> --dry     בדיקה בלבד
 *
 * כל שורה נבדקת לפני שהיא נכנסת. הגדרה שבורה שמגיעה לשחקן היא חידה
 * שאי אפשר לפתור, ואין לו שום דרך לדעת שהאשמה אינה שלו.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BANK = path.join(ROOT, 'data', 'clue-bank.json');

const src = process.argv[2];
const dry = process.argv.includes('--dry');
if (!src || !fs.existsSync(src)) {
  console.error('שימוש:  node tools/import-clues.js <קובץ> [--dry]');
  process.exit(1);
}

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');

const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
const existing = new Map(bank.entries.map((e) => [norm(e.w), e]));

const reject = { format: [], chars: [], length: [], dup: [], selfRef: [], empty: [] };
const accepted = [];
const seen = new Set();
const byLen = {};

const lines = fs.readFileSync(src, 'utf8').split('\n');

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  const parts = line.split('|');
  if (parts.length !== 2) { reject.format.push(line.slice(0, 40)); continue; }

  const word = parts[0].trim();
  const clue = parts[1].trim();

  if (!clue) { reject.empty.push(word); continue; }
  if (!/^[א-ת]+$/.test(word)) { reject.chars.push(word); continue; }

  const key = norm(word);
  const len = [...key].length;
  if (len < 3 || len > 7) { reject.length.push(`${word} (${len})`); continue; }

  if (seen.has(key)) { reject.dup.push(word); continue; }

  /* הגדרה שמכילה את התשובה מסגירה אותה. בודקים גם גזע משותף של
   * ארבע אותיות, כדי לתפוס "מנורה" בהגדרה של "מנורות". */
  const stem = key.slice(0, Math.min(4, len));
  if (norm(clue).includes(key) || (len >= 4 && norm(clue).includes(stem))) {
    reject.selfRef.push(`${word} → ${clue}`);
    continue;
  }

  seen.add(key);
  byLen[len] = (byLen[len] || 0) + 1;
  accepted.push({ w: word, clues: [clue] });
}

/* ----- דוח ----- */
const total = accepted.length + Object.values(reject).reduce((s, a) => s + a.length, 0);
console.log(`נסרקו ${total} שורות\n`);
console.log(`התקבלו: ${accepted.length}`);
console.log('אורך  מילים');
for (let n = 3; n <= 7; n++) console.log(String(n).padStart(4), String(byLen[n] || 0).padStart(7));

const problems = Object.entries(reject).filter(([, v]) => v.length);
if (problems.length) {
  console.log('\nנדחו:');
  const names = {
    format: 'פורמט שגוי', chars: 'תווים לא עבריים', length: 'אורך מחוץ לטווח 3-7',
    dup: 'כפילות', selfRef: 'ההגדרה מכילה את התשובה', empty: 'הגדרה ריקה',
  };
  for (const [k, v] of problems) {
    console.log(`  ${names[k]}: ${v.length}`);
    v.slice(0, 8).forEach((x) => console.log(`     ${x}`));
    if (v.length > 8) console.log(`     … ועוד ${v.length - 8}`);
  }
}

/* ----- מיזוג ----- */
let added = 0, merged = 0;
for (const e of accepted) {
  const key = norm(e.w);
  if (existing.has(key)) {
    const cur = existing.get(key);
    if (!cur.clues.includes(e.clues[0])) { cur.clues.push(e.clues[0]); merged++; }
  } else {
    bank.entries.push(e);
    existing.set(key, e);
    added++;
  }
}

console.log(`\nחדשות: ${added}  ·  הגדרה נוספת למילה קיימת: ${merged}`);
console.log(`סה"כ במאגר: ${bank.entries.length}`);

if (dry) { console.log('\n(--dry — לא נכתב דבר)'); process.exit(0); }

fs.writeFileSync(BANK, JSON.stringify(bank, null, 2), 'utf8');
console.log(`\nנכתב ${path.relative(ROOT, BANK)}`);
