/* =========================================================================
 * game.js — תשבץ יומי
 *
 * הכול נגזר מרשת האותיות: המשבצות, המספור והכיוונים. אין מבנה מקביל
 * שאפשר לשכוח לעדכן.
 *
 * ----- כיווניות -----
 * מילה מאוזנת מתחילה בתא הימני ביותר של הרצף ומתקדמת שמאלה; מאונכת
 * יורדת מלמעלה. המספור סורק שורות מלמעלה למטה, ובכל שורה מימין לשמאל.
 * ברשת עצמה עמודה 0 היא השמאלית — לכן ה-DOM נבנה עם direction: rtl
 * ו-grid רגיל, וההיפוך קורה בתצוגה ולא בקוד.
 * ======================================================================= */

(() => {
  'use strict';

  const CONFIG = window.CROSSWORD_CONFIG;
  const PUZZLES = window.CROSSWORD_DATA;
  const EPOCH = new Date(...CONFIG.EPOCH);

  /* ===================== בחירת התשבץ של היום ===================== */

  function dayNumber(date = new Date()) {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((midnight - EPOCH) / 86400000);
  }

  const DAY = dayNumber();
  const PUZZLE_NO = DAY + 1;
  const PUZZLE = PUZZLES[((DAY % PUZZLES.length) + PUZZLES.length) % PUZZLES.length];

  /* ===================== ניתוח הרשת ===================== */

  const ROWS = PUZZLE.letters.length;
  const COLS = [...PUZZLE.letters[0]].length;
  const solution = PUZZLE.letters.map((row) => [...row]);
  const isOpen = (r, c) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS && solution[r][c] !== '#';

  /** כל המשבצות: רצפים אופקיים ואנכיים באורך 2 ומעלה. */
  const slots = [];
  for (let r = 0; r < ROWS; r++) {
    let c = COLS - 1;
    while (c >= 0) {
      if (!isOpen(r, c)) { c--; continue; }
      const cells = [];
      while (c >= 0 && isOpen(r, c)) { cells.push([r, c]); c--; }
      if (cells.length > 1) slots.push({ dir: 'across', cells });
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      if (!isOpen(r, c)) { r++; continue; }
      const cells = [];
      while (r < ROWS && isOpen(r, c)) { cells.push([r, c]); r++; }
      if (cells.length > 1) slots.push({ dir: 'down', cells });
    }
  }

  /* מספור: שורות מלמעלה למטה, בכל שורה מימין לשמאל */
  const numberAt = new Map();
  {
    let next = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = COLS - 1; c >= 0; c--) {
        if (!isOpen(r, c)) continue;
        const startsAcross = !isOpen(r, c + 1) && isOpen(r, c - 1);
        const startsDown = !isOpen(r - 1, c) && isOpen(r + 1, c);
        if (startsAcross || startsDown) numberAt.set(`${r},${c}`, next++);
      }
    }
  }

  slots.forEach((s) => {
    const [r0, c0] = s.cells[0];
    s.n = numberAt.get(`${r0},${c0}`);
    s.clue = PUZZLE.clues?.[s.dir]?.[String(s.n)] || '';
    s.answer = s.cells.map(([r, c]) => solution[r][c]).join('');
  });

  const slotAt = (r, c, dir) =>
    slots.find((s) => s.dir === dir && s.cells.some(([sr, sc]) => sr === r && sc === c));

  /* ===================== אחסון ===================== */

  const KEY_STATE = 'he-xw:daily';
  const KEY_STATS = 'he-xw:stats';
  const KEY_SEEN = 'he-xw:seen-help';

  const load = (k, d) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch { return d; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* מצב פרטי */ }
  };

  let stats = load(KEY_STATS, {
    played: 0, clean: 0, streak: 0, maxStreak: 0, bestTime: null, lastDay: null,
  });

  let state = load(KEY_STATE, null);
  if (!state || state.day !== DAY) {
    state = {
      day: DAY,
      entered: {},        // "r,c" → אות שהשחקן הקליד
      revealed: {},       // "r,c" → true, אות שנחשפה ברמז
      hintsPerWord: {},   // "n-dir" → כמה רמזים נוצלו במילה
      hints: 0,
      seconds: 0,
      status: 'playing',
    };
    save(KEY_STATE, state);
  }

  /* ===================== DOM ===================== */

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const backdrop = $('modal-backdrop');
  const helpModal = $('modal-help');
  const doneModal = $('modal-done');

  let cur = { r: 0, c: 0, dir: 'across' };
  const cellEls = new Map();

  /* ----- בניית הרשת ----- */
  boardEl.style.setProperty('--cols', COLS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (isOpen(r, c) ? '' : ' block');
      if (isOpen(r, c)) {
        const n = numberAt.get(`${r},${c}`);
        if (n) {
          const tag = document.createElement('span');
          tag.className = 'num';
          tag.textContent = n;
          cell.appendChild(tag);
        }
        const letter = document.createElement('span');
        letter.className = 'letter';
        cell.appendChild(letter);
        cell.addEventListener('click', () => selectCell(r, c, true));
        cellEls.set(`${r},${c}`, { cell, letter });
      }
      boardEl.appendChild(cell);
    }
  }

  /* ----- מקלדת: אותה פריסה כמו בעברדל ----- */
  const KB_ROWS = [
    ['ק', 'ר', 'א', 'ט', 'ו', 'פ', 'BACK'],
    ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל'],
    ['ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת'],
  ];
  const BACK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H7c-.7 0-1.2.4-1.6.9L0 12l5.4 8.1c.4.5.9.9 1.6.9h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.6L17.6 17 14 13.4 10.4 17 9 15.6l3.6-3.6L9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12l3.6 3.6z"/></svg>';

  KB_ROWS.forEach((keys) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    keys.forEach((k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key' + (k.length > 1 ? ' action' : '');
      if (k === 'BACK') {
        btn.innerHTML = BACK_ICON;
        btn.setAttribute('aria-label', 'מחיקה');
      } else {
        btn.textContent = k;
      }
      btn.addEventListener('click', () => { btn.blur(); press(k); });
      row.appendChild(btn);
    });
    $('keyboard').appendChild(row);
  });

  /* ===================== בחירה וניווט ===================== */

  function selectCell(r, c, fromClick) {
    if (!isOpen(r, c)) return;
    // הקשה חוזרת על אותה משבצת מחליפה כיוון
    if (fromClick && cur.r === r && cur.c === c) {
      const other = cur.dir === 'across' ? 'down' : 'across';
      if (slotAt(r, c, other)) cur.dir = other;
    } else if (!slotAt(r, c, cur.dir)) {
      cur.dir = cur.dir === 'across' ? 'down' : 'across';
    }
    cur.r = r;
    cur.c = c;
    paint();
  }

  const activeSlot = () => slotAt(cur.r, cur.c, cur.dir);

  /** התא הבא בתוך המילה הפעילה. */
  function step(delta) {
    const slot = activeSlot();
    if (!slot) return;
    const i = slot.cells.findIndex(([r, c]) => r === cur.r && c === cur.c);
    const next = slot.cells[i + delta];
    if (next) { cur.r = next[0]; cur.c = next[1]; }
  }

  /** התא הפנוי הבא במילה, כדי לא לדרוס אותיות שכבר נכתבו. */
  function stepToBlank() {
    const slot = activeSlot();
    if (!slot) return;
    const i = slot.cells.findIndex(([r, c]) => r === cur.r && c === cur.c);
    for (let j = i + 1; j < slot.cells.length; j++) {
      const [r, c] = slot.cells[j];
      if (!state.entered[`${r},${c}`]) { cur.r = r; cur.c = c; return; }
    }
    if (i + 1 < slot.cells.length) {
      const [r, c] = slot.cells[i + 1];
      cur.r = r; cur.c = c;
    }
  }

  function press(k) {
    if (state.status === 'done') return;

    if (k === 'BACK') {
      const key = `${cur.r},${cur.c}`;
      if (state.entered[key] && !state.revealed[key]) {
        delete state.entered[key];
      } else {
        step(-1);
        const prev = `${cur.r},${cur.c}`;
        if (!state.revealed[prev]) delete state.entered[prev];
      }
      save(KEY_STATE, state);
      paint();
      return;
    }

    const key = `${cur.r},${cur.c}`;
    if (state.revealed[key]) { stepToBlank(); paint(); return; }

    state.entered[key] = k;
    save(KEY_STATE, state);
    stepToBlank();
    paint();
    checkDone();
  }

  /* ===================== רמזים ===================== */

  $('btn-reveal').addEventListener('click', () => {
    if (state.status === 'done') return;
    const slot = activeSlot();
    if (!slot) return;

    const wordKey = `${slot.n}-${slot.dir}`;
    const usedHere = state.hintsPerWord[wordKey] || 0;
    if (usedHere >= CONFIG.REVEALS_PER_WORD) {
      toast(`כבר גיליתם ${CONFIG.REVEALS_PER_WORD} אותיות במילה הזו`);
      return;
    }

    // מגלים את המשבצת הפעילה אם היא שגויה, אחרת את הראשונה שאינה נכונה
    const wrong = [[cur.r, cur.c], ...slot.cells].find(([r, c]) =>
      !state.revealed[`${r},${c}`] && state.entered[`${r},${c}`] !== solution[r][c]);
    if (!wrong) { toast('המילה כבר נכונה'); return; }

    const [r, c] = wrong;
    state.entered[`${r},${c}`] = solution[r][c];
    state.revealed[`${r},${c}`] = true;
    state.hintsPerWord[wordKey] = usedHere + 1;
    state.hints++;
    save(KEY_STATE, state);
    paint();
    checkDone();
  });

  /* ===================== ציור ===================== */

  function paint() {
    const slot = activeSlot();
    const inSlot = new Set((slot?.cells || []).map(([r, c]) => `${r},${c}`));

    for (const [key, { cell, letter }] of cellEls) {
      const [r, c] = key.split(',').map(Number);
      letter.textContent = state.entered[key] || '';
      cell.classList.toggle('active', r === cur.r && c === cur.c);
      cell.classList.toggle('in-word', inSlot.has(key) && !(r === cur.r && c === cur.c));
      cell.classList.toggle('revealed', Boolean(state.revealed[key]));
    }

    if (slot) {
      $('clue-num').textContent = slot.n;
      $('clue-dir').textContent = slot.dir === 'across' ? 'מאוזן' : 'מאונך';
      $('clue-body').textContent = slot.clue;

      const usedHere = state.hintsPerWord[`${slot.n}-${slot.dir}`] || 0;
      const left = CONFIG.REVEALS_PER_WORD - usedHere;
      $('reveal-note').textContent = left > 0
        ? `נותרו ${left} במילה הזו`
        : 'נוצלו כל הרמזים במילה הזו';
      $('btn-reveal').disabled = left <= 0 || state.status === 'done';
    }

    document.querySelectorAll('.clue-item').forEach((el) => {
      el.classList.toggle('active',
        slot && el.dataset.n === String(slot.n) && el.dataset.dir === slot.dir);
    });
  }

  /* ----- רשימת ההגדרות ----- */
  ['across', 'down'].forEach((dir) => {
    const box = $(dir === 'across' ? 'list-across' : 'list-down');
    slots.filter((s) => s.dir === dir).sort((a, b) => a.n - b.n).forEach((s) => {
      const item = document.createElement('button');
      item.className = 'clue-item';
      item.type = 'button';
      item.dataset.n = s.n;
      item.dataset.dir = s.dir;
      item.innerHTML = `<span class="ci-num">${s.n}</span><span class="ci-text">${s.clue}</span>`;
      item.addEventListener('click', () => {
        cur = { r: s.cells[0][0], c: s.cells[0][1], dir: s.dir };
        paint();
        boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      box.appendChild(item);
    });
  });

  /* ===================== סיום ===================== */

  function checkDone() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isOpen(r, c)) continue;
        if (state.entered[`${r},${c}`] !== solution[r][c]) return;
      }
    }
    state.status = 'done';
    save(KEY_STATE, state);
    stopTimer();
    record();
    toast(state.hints === 0 ? 'פתרון נקי! 🎉' : 'פתרת!');
    setTimeout(openDone, 900);
    paint();
  }

  function record() {
    if (stats.lastDay === DAY) return;
    stats.played++;
    if (state.hints === 0) stats.clean++;
    stats.streak = (stats.lastDay === DAY - 1) ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    if (stats.bestTime === null || state.seconds < stats.bestTime) stats.bestTime = state.seconds;
    stats.lastDay = DAY;
    save(KEY_STATS, stats);
  }

  /* ===================== שעון ===================== */

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  let tick = null;

  function startTimer() {
    if (state.status === 'done' || tick) return;
    tick = setInterval(() => {
      state.seconds++;
      $('timer').textContent = mmss(state.seconds);
      if (state.seconds % 5 === 0) save(KEY_STATE, state);
    }, 1000);
  }
  function stopTimer() { clearInterval(tick); tick = null; save(KEY_STATE, state); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer(); else startTimer();
  });

  /* ===================== חלונות ===================== */

  let openModal = null;
  const show = (m) => {
    if (openModal) openModal.hidden = true;
    openModal = m; m.hidden = false; backdrop.hidden = false;
  };
  const closeModal = () => {
    if (openModal) openModal.hidden = true;
    openModal = null; backdrop.hidden = true;
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openModal) closeModal();
  });
  $('btn-help').addEventListener('click', () => show(helpModal));

  function openDone() {
    $('r-time').textContent = mmss(state.seconds);
    $('r-hints').textContent = state.hints;
    $('done-title').textContent = state.hints === 0 ? 'פתרון נקי!' : 'פתרת!';
    $('st-played').textContent = stats.played;
    $('st-clean').textContent = stats.clean;
    $('st-best').textContent = stats.bestTime === null ? '—' : mmss(stats.bestTime);
    $('st-streak').textContent = stats.streak;
    updateCountdown();
    show(doneModal);
  }

  let cdTimer = null;
  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const secs = Math.floor((midnight - now) / 1000);
    if (secs <= 0) { location.reload(); return; }
    const pad = (n) => String(n).padStart(2, '0');
    $('countdown').textContent =
      `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
    clearTimeout(cdTimer);
    cdTimer = setTimeout(updateCountdown, 1000);
  }

  /* ----- שיתוף ----- */
  function shareText() {
    const RLM = '‏';
    const hint = state.hints === 0 ? 'בלי רמזים ✨' : `${state.hints} רמזים 💡`;
    return `${RLM}תשבץ יומי #${PUZZLE_NO}\n${RLM}${mmss(state.seconds)} · ${hint}\n\n${location.href}`;
  }

  $('btn-share').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast('הועתק ללוח');
    } catch {
      const box = document.createElement('textarea');
      box.value = text;
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      try { document.execCommand('copy'); toast('הועתק ללוח'); }
      catch { toast('לא ניתן להעתיק'); }
      box.remove();
    }
  });

  /* ----- הודעות ----- */
  function toast(msg, ms = 1800) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toast-area').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, ms);
  }

  /* ===================== מקלדת פיזית ===================== */

  const QWERTY = {
    e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'נ', o: 'מ', p: 'פ',
    a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'כ',
    z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת',
  };

  document.addEventListener('keydown', (e) => {
    if (openModal || e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === 'Backspace') { e.preventDefault(); press('BACK'); return; }
    if (e.key === ' ') {
      e.preventDefault();
      const other = cur.dir === 'across' ? 'down' : 'across';
      if (slotAt(cur.r, cur.c, other)) { cur.dir = other; paint(); }
      return;
    }
    const arrows = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1],
    };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      let r = cur.r + dr, c = cur.c + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && !isOpen(r, c)) { r += dr; c += dc; }
      if (isOpen(r, c)) {
        cur.dir = dr ? 'down' : 'across';
        selectCell(r, c, false);
      }
      return;
    }

    const raw = e.key;
    let letter = null;
    if (/^[א-ת]$/.test(raw)) {
      const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
      letter = FINALS[raw] || raw;
    } else if (QWERTY[raw.toLowerCase()]) {
      letter = QWERTY[raw.toLowerCase()];
    }
    if (letter) { e.preventDefault(); press(letter); }
  });

  /* ===================== אתחול ===================== */

  window.__xw = { PUZZLE, PUZZLE_NO, slots, solution, state: () => state, shareText, dayNumber };

  document.title = CONFIG.PAGE_TITLE;

  // מתחילים במשבצת הראשונה שיש בה מילה מאוזנת
  const first = slots.find((s) => s.dir === 'across');
  cur = { r: first.cells[0][0], c: first.cells[0][1], dir: 'across' };

  $('timer').textContent = mmss(state.seconds);
  paint();

  if (state.status === 'done') {
    setTimeout(openDone, 400);
  } else {
    startTimer();
    if (!load(KEY_SEEN, false)) { show(helpModal); save(KEY_SEEN, true); }
  }
})();
