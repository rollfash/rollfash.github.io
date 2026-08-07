/* =========================================================================
 * daily.js — בחירת מילת היום
 *
 * משותף למשחק (game.js) ולממשק הניהול (admin.html), כדי ששניהם יחשבו
 * את מילת היום בדיוק באותו אופן. אם הלוגיקה הזו תשוכפל, הממשק עלול
 * להראות מילה אחת בעוד המשחק מציג אחרת.
 * ======================================================================= */

window.DailyWord = (() => {
  'use strict';

  const TO_REGULAR = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const TO_FINAL = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };

  const norm = (w) => [...w].map((c) => TO_REGULAR[c] || c).join('');

  /** מילה לתצוגה: האות האחרונה בצורתה הסופית. */
  const toDisplay = (w) => {
    const a = [...w];
    const last = a.length - 1;
    if (TO_FINAL[a[last]]) a[last] = TO_FINAL[a[last]];
    return a.join('');
  };

  const isWord = (w) =>
    /^[א-ת]{5}$/.test(w) && ![...w].slice(0, -1).some((c) => TO_REGULAR[c]);

  /* מחולל אקראי עם זרע — אותה תוצאה בכל דפדפן, בכל פעם */
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const CONFIG = window.GAME_CONFIG;
  const EPOCH = new Date(...CONFIG.EPOCH);

  /* ערבוב דטרמיניסטי, כדי שסדר המילים לא יהיה סדר הרשימה */
  const SHUFFLED = (() => {
    const list = window.WORD_DATA.ANSWERS.map(norm);
    const rand = mulberry32(20260101);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  })();

  /** מספר הימים שחלפו מאז היום הראשון של המשחק, לפי השעון המקומי. */
  function dayNumber(date = new Date()) {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((midnight - EPOCH) / 86400000);
  }

  /** תאריך מקומי כ-YYYY-MM-DD (לא UTC — אחרת אזורי זמן מזיזים את היום). */
  function isoDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /**
   * מילת היום לתאריך נתון.
   * קודם כול מהלוח המתוזמן (schedule.js), ואם אין — בחירה דטרמיניסטית.
   * מחזיר { word, scheduled } — כשה-scheduled מציין אם המילה נקבעה ידנית.
   */
  function forDate(date = new Date()) {
    const iso = isoDate(date);
    const planned = (window.WORD_SCHEDULE || {})[iso];

    if (planned) {
      const word = norm(String(planned).trim());
      if (isWord(word)) return { word, scheduled: true, iso };
      console.warn(`schedule.js: "${planned}" בתאריך ${iso} אינה מילה בת חמש אותיות — מתעלם`);
    }

    const day = dayNumber(date);
    const index = ((day % SHUFFLED.length) + SHUFFLED.length) % SHUFFLED.length;
    return { word: SHUFFLED[index], scheduled: false, iso };
  }

  return { norm, toDisplay, isWord, dayNumber, isoDate, forDate, SHUFFLED, EPOCH };
})();
