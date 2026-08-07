/* =========================================================================
 * build-words.js — בונה את js/words.js מתוך קבצי המקור שבתיקיית data/
 *
 * הרצה:  node tools/build-words.js
 *
 * הסקריפט קורא כל קובץ ב-data/ שמתחיל ב-"source-", שולף ממנו כל רצף של
 * חמש אותיות עבריות שעומד בפני עצמו, ומייצר שתי רשימות:
 *
 *   ALLOWED — כל מילה חוקית לניחוש. ענקית בכוונה.
 *   ANSWERS — המילים שיכולות להיות מילת היום. רק ממקורות "נקיים"
 *             (שמות עצם ומילים נבחרות), בניכוי רשימת החרגה.
 *
 * ההפרדה חשובה: hebwords מכיל עשרות אלפי הטיות פועל ("אאובק", "תתרפס"),
 * מצוין לניחוש — נורא בתור מילת היום.
 *
 * פורמט המקור לא משנה (טקסט, מערך JS, מחרוזת מופרדת ברווחים) —
 * השליפה מבוססת על ביטוי רגולרי, כך שאפשר פשוט לזרוק עוד קובץ ל-data/.
 * ======================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

/* מקורות שמילותיהם ראויות להיות מילת היום.
 * source-manual.txt הוא הקובץ שאליו כותב ממשק הניהול (admin.html). */
const ANSWER_SOURCES = new Set([
  'source-nouns.txt',
  'source-wordlist.js',
  'source-curated.txt',
  'source-manual.txt',
]);

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');

/* רצף של בדיוק חמש אותיות עבריות שאינו חלק ממילה ארוכה יותר.
 * כך מסוננות אוטומטית מילים עם גרש או גרשיים (ח'ליף, מזל"ט) ומילים
 * באורך אחר. */
const TOKEN = /(?<![א-ת֑-ׇ])[א-ת]{5}(?![א-ת֑-ׇ])/g;

/** אות סופית באמצע מילה = שגיאת כתיב, לא מילה תקינה. */
const wellFormed = (w) => ![...w].slice(0, -1).some((c) => FINALS[c]);

const allowed = new Map();   // צורה מנורמלת → איות לתצוגה
const answers = new Map();
const stats = [];

const files = fs.readdirSync(DATA).filter((f) => f.startsWith('source-')).sort();
if (!files.length) {
  console.error('לא נמצאו קבצי מקור בתיקיית data/ (שם הקובץ חייב להתחיל ב-"source-")');
  process.exit(1);
}

for (const file of files) {
  const text = fs.readFileSync(path.join(DATA, file), 'utf8');
  const tokens = text.match(TOKEN) || [];
  const isAnswerSource = ANSWER_SOURCES.has(file);

  let added = 0, addedAnswers = 0, malformed = 0;
  for (const token of tokens) {
    if (!wellFormed(token)) { malformed++; continue; }
    const key = norm(token);
    if (!allowed.has(key)) { allowed.set(key, token); added++; }
    if (isAnswerSource && !answers.has(key)) { answers.set(key, token); addedAnswers++; }
  }
  stats.push({ file, tokens: tokens.length, added, addedAnswers, malformed, isAnswerSource });
}

/* ----- מילים שנפסלו לגמרי (לא מילת היום ואף לא ניחוש חוקי) ----- */
const blockPath = path.join(DATA, 'blocklist.txt');
let blocked = 0;
if (fs.existsSync(blockPath)) {
  const list = fs.readFileSync(blockPath, 'utf8').match(TOKEN) || [];
  for (const word of list) {
    const key = norm(word);
    answers.delete(key);
    if (allowed.delete(key)) blocked++;
  }
}

/* ----- הסרת מילים שאינן מתאימות למילת היום (שמות פרטיים, מותגים) ----- */
const excludePath = path.join(DATA, 'exclude-from-answers.txt');
let excluded = 0;
if (fs.existsSync(excludePath)) {
  const list = fs.readFileSync(excludePath, 'utf8').match(TOKEN) || [];
  for (const word of list) {
    if (answers.delete(norm(word))) excluded++;
  }
}

/* ----- כתיבת הפלט ----- */
const answerList = [...answers.values()].sort((a, b) => a.localeCompare(b, 'he'));
const allowedOnly = [...allowed.entries()]
  .filter(([key]) => !answers.has(key))
  .map(([, word]) => word)
  .sort((a, b) => a.localeCompare(b, 'he'));

const chunk = (list) => {
  const lines = [];
  for (let i = 0; i < list.length; i += 10) {
    lines.push('  ' + list.slice(i, i + 10).map((w) => `'${w}'`).join(', ') + ',');
  }
  return lines.join('\n');
};

/* רשימת הניחושים ארוזה כמחרוזת אחת רציפה, בלי מפרידים: כל המילים באורך
 * חמש בדיוק, אז אפשר לחתוך אותה כל חמישה תווים. חוסך כ-270KB מול מערך
 * של מחרוזות במרכאות. */
const packed = (list) => {
  const lines = [];
  for (let i = 0; i < list.length; i += 14) {
    lines.push("  '" + list.slice(i, i + 14).join('') + "'");
  }
  return lines.join(' +\n');
};

const output = `/* -------------------------------------------------------------------------
 * words.js — נוצר אוטומטית על ידי tools/build-words.js
 *
 * אין לערוך את הקובץ הזה ידנית! כל שינוי יידרס בבנייה הבאה.
 * כדי להוסיף או להסיר מילים:
 *   • דרך הממשק — פתחו את admin.html
 *   • או ידנית — ערכו קבצים בתיקיית data/ והריצו: node tools/build-words.js
 *
 * ANSWERS — מילים שיכולות להיות מילת היום (${answerList.length}).
 * ALLOWED_PACKED — מילים נוספות שמותר לנחש אך לא יהיו מילת היום
 *           (${allowedOnly.length}), ארוזות כמחרוזת רציפה של חמישיות אותיות.
 *           סך המילון: ${answerList.length + allowedOnly.length}.
 *
 * המילים כתובות באיות רגיל עם אותיות סופיות; המשחק מנרמל אותן
 * (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ) כי המקלדת היא בת 22 אותיות.
 * ---------------------------------------------------------------------- */

const ANSWERS = [
${chunk(answerList)}
];

const ALLOWED_PACKED =
${packed(allowedOnly)};

window.WORD_DATA = { ANSWERS, ALLOWED_PACKED };
`;

fs.writeFileSync(path.join(ROOT, 'js', 'words.js'), output, 'utf8');

/* ----- דוח ----- */
console.log('מקורות:\n');
for (const s of stats) {
  console.log(
    `  ${s.file.padEnd(22)} ${String(s.tokens).padStart(7)} אסימונים → ` +
    `${String(s.added).padStart(6)} חדשות` +
    (s.isAnswerSource ? `, ${String(s.addedAnswers).padStart(5)} למאגר התשובות` : '') +
    (s.malformed ? `  (${s.malformed} נפסלו: אות סופית באמצע)` : ''),
  );
}
console.log(`\nנפסלו מהמילון כולו: ${blocked}`);
console.log(`הוחרגו ממאגר התשובות: ${excluded}`);
console.log(`\nמילות תשובה:      ${answerList.length}`);
console.log(`מילים לניחוש בלבד: ${allowedOnly.length}`);
console.log(`סך המילון:        ${answerList.length + allowedOnly.length}`);
console.log(`\nמספיק ל-${(answerList.length / 365).toFixed(1)} שנות משחק לפני חזרה.`);
console.log('\n✓ נכתב js/words.js');
