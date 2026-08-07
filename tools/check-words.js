/* בדיקת תקינות של js/words.js — הרצה:  node tools/check-words.js
 * מוודא שכל מילה באורך 5 אותיות עבריות, ושאין כפילויות. */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'words.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const { ANSWERS, EXTRA } = sandbox.window.WORD_DATA;

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const norm = (w) => [...w].map((c) => FINALS[c] || c).join('');
const HEBREW = /^[א-ת]{5}$/;

let errors = 0;
const seen = new Map();

function check(list, name) {
  list.forEach((w, i) => {
    if (!HEBREW.test(w)) {
      console.error(`✗ ${name}[${i}] "${w}" — אינה 5 אותיות עבריות (אורך ${[...w].length})`);
      errors++;
      return;
    }
    // אות סופית מותרת רק במיקום האחרון
    [...w].slice(0, -1).forEach((c) => {
      if (FINALS[c]) {
        console.error(`✗ ${name}[${i}] "${w}" — אות סופית "${c}" באמצע המילה`);
        errors++;
      }
    });
    const key = norm(w);
    if (seen.has(key)) {
      console.error(`✗ ${name}[${i}] "${w}" — כפילות של "${seen.get(key)}"`);
      errors++;
    } else {
      seen.set(key, `${name}: ${w}`);
    }
  });
}

check(ANSWERS, 'ANSWERS');
check(EXTRA, 'EXTRA');

console.log(`\nמילות תשובה: ${ANSWERS.length}`);
console.log(`מילים נוספות מותרות: ${EXTRA.length}`);
console.log(`סה"כ מילון: ${seen.size}`);
console.log(`מספיק ל-${(ANSWERS.length / 365).toFixed(1)} שנות משחק לפני חזרה.`);

if (errors) {
  console.error(`\n${errors} שגיאות נמצאו.`);
  process.exit(1);
}
console.log('\n✓ הרשימה תקינה.');
