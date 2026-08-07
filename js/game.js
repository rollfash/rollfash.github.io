/* =========================================================================
 * וורדל בעברית — לוגיקת המשחק
 *
 * המשחק כולו רץ בדפדפן. אין שרת ואין בסיס נתונים:
 * מילת היום נגזרת דטרמיניסטית מהתאריך, ולכן כל השחקנים מקבלים את אותה
 * מילה באותו יום, בלי שום קוד צד־שרת.
 * ======================================================================= */

(() => {
  'use strict';

  const ROWS = 6;
  const COLS = 5;

  /* ----- יום ראשון של המשחק. שינוי הערך מזיז את כל לוח הזמנים ----- */
  const EPOCH = new Date(2026, 0, 1);

  /* ----- אותיות סופיות ----- */
  const TO_REGULAR = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const TO_FINAL = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };

  const norm = (w) => [...w].map((c) => TO_REGULAR[c] || c).join('');

  /** האות כפי שהיא מוצגת: במשבצת האחרונה מוצגת הצורה הסופית. */
  const glyph = (letter, col) =>
    (col === COLS - 1 && TO_FINAL[letter]) ? TO_FINAL[letter] : letter;

  /** מילה שלמה לתצוגה, עם אות סופית בסוף. */
  const toDisplay = (word) =>
    [...word].map((c, i) => glyph(c, i)).join('');

  /* ----- מילון ----- */
  const ANSWERS = WORD_DATA.ANSWERS.map(norm);
  const DICTIONARY = new Set([...WORD_DATA.ANSWERS, ...WORD_DATA.EXTRA].map(norm));

  /* ----- בחירת מילת היום -----
   * ערבוב דטרמיניסטי עם זרע קבוע, כדי שסדר המילים לא יהיה סדר הרשימה
   * אך יהיה זהה אצל כל השחקנים. */
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SHUFFLED = (() => {
    const list = ANSWERS.slice();
    const rand = mulberry32(20260101);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  })();

  /** מספר הימים שחלפו מאז יום המשחק הראשון (לפי השעון המקומי). */
  function dayNumber(date = new Date()) {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((today - EPOCH) / 86400000);
  }

  const DAY = dayNumber();
  const PUZZLE_NO = DAY + 1;
  const SOLUTION = SHUFFLED[((DAY % SHUFFLED.length) + SHUFFLED.length) % SHUFFLED.length];

  /* ----- אחסון מקומי ----- */
  const KEY_STATE = 'he-wordle:daily';
  const KEY_STATS = 'he-wordle:stats';
  const KEY_THEME = 'he-wordle:theme';
  const KEY_FREE = 'he-wordle:free';

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* מצב פרטי */ }
  };

  let stats = load(KEY_STATS, {
    played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null,
    dist: [0, 0, 0, 0, 0, 0],
  });

  let state = load(KEY_STATE, null);
  if (!state || state.day !== DAY) {
    state = { day: DAY, guesses: [], status: 'playing' };
  }

  let current = '';          // הניחוש שמוקלד כרגע
  let busy = false;          // נעול בזמן אנימציית חשיפה
  let freeMode = load(KEY_FREE, false);

  /* ===================== בניית ה-DOM ===================== */

  const board = document.getElementById('board');
  const keyboardEl = document.getElementById('keyboard');
  const toastArea = document.getElementById('toast-area');
  const backdrop = document.getElementById('modal-backdrop');
  const helpModal = document.getElementById('modal-help');
  const statsModal = document.getElementById('modal-stats');

  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'row');
    const tiles = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'gridcell');
      row.appendChild(tile);
      tiles.push(tile);
    }
    board.appendChild(row);
    rows.push({ el: row, tiles });
  }

  const KB_ROWS = [
    ['ק', 'ר', 'א', 'ט', 'ו', 'נ', 'מ', 'פ'],
    ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל'],
    ['ENTER', 'ז', 'ס', 'ב', 'ה', 'צ', 'ת', 'BACK'],
  ];

  const BACK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H7c-.7 0-1.2.4-1.6.9L0 12l5.4 8.1c.4.5.9.9 1.6.9h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.6L17.6 17 14 13.4 10.4 17 9 15.6l3.6-3.6L9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12l3.6 3.6z"/></svg>';

  const keyEls = new Map();
  KB_ROWS.forEach((letters) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    letters.forEach((k) => {
      const btn = document.createElement('button');
      btn.className = 'key' + (k.length > 1 ? ' wide' : '');
      btn.type = 'button';
      if (k === 'ENTER') {
        btn.textContent = 'שליחה';
        btn.setAttribute('aria-label', 'שליחת הניחוש');
      } else if (k === 'BACK') {
        btn.innerHTML = BACK_ICON;
        btn.setAttribute('aria-label', 'מחיקה');
      } else {
        btn.textContent = k;
        keyEls.set(k, btn);
      }
      btn.addEventListener('click', () => {
        btn.blur();
        handleKey(k);
      });
      row.appendChild(btn);
    });
    keyboardEl.appendChild(row);
  });

  /* ===== התאמת גודל הלוח למסך ===== */
  function fitBoard() {
    const wrap = board.parentElement;
    const gap = 5;
    const availH = wrap.clientHeight - 16;
    const availW = Math.min(wrap.clientWidth - 16, 360);
    const size = Math.floor(Math.min(
      (availH - gap * (ROWS - 1)) / ROWS,
      (availW - gap * (COLS - 1)) / COLS,
    ));
    const width = size * COLS + gap * (COLS - 1);
    board.style.width = width + 'px';
    board.style.fontSize = Math.round(size * 0.52) + 'px';
  }
  window.addEventListener('resize', fitBoard);

  /* ===================== הודעות ===================== */

  function toast(message, ms = 1600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastArea.appendChild(el);
    if (ms === Infinity) return;
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, ms);
  }

  /* ===================== חישוב הצבעים ===================== */

  /** מחזיר מערך של 'correct' / 'present' / 'absent' לכל אות בניחוש. */
  function score(guess, solution) {
    const result = new Array(COLS).fill('absent');
    const pool = {};

    for (let i = 0; i < COLS; i++) {
      if (guess[i] === solution[i]) result[i] = 'correct';
      else pool[solution[i]] = (pool[solution[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (result[i] === 'correct') continue;
      if (pool[guess[i]] > 0) {
        result[i] = 'present';
        pool[guess[i]]--;
      }
    }
    return result;
  }

  /* ===================== ציור ===================== */

  const RANK = { absent: 1, present: 2, correct: 3 };

  function paintKey(letter, status) {
    const el = keyEls.get(letter);
    if (!el) return;
    const currentRank = RANK[el.dataset.status] || 0;
    if (RANK[status] > currentRank) {
      el.classList.remove('correct', 'present', 'absent');
      el.classList.add(status);
      el.dataset.status = status;
    }
  }

  /** מצייר את השורה הנוכחית שמוקלדת. */
  function drawCurrent() {
    const row = rows[state.guesses.length];
    if (!row) return;
    for (let c = 0; c < COLS; c++) {
      const tile = row.tiles[c];
      const letter = current[c];
      const wasEmpty = !tile.textContent;
      tile.textContent = letter ? glyph(letter, c) : '';
      tile.classList.toggle('filled', Boolean(letter));
      if (letter && wasEmpty) {
        tile.classList.remove('filled');
        void tile.offsetWidth;   // הפעלה מחדש של אנימציית ה-pop
        tile.classList.add('filled');
      }
    }
  }

  /** מצייר ניחוש שכבר הוגש — עם או בלי אנימציה. */
  function drawGuess(rowIndex, guess, animate) {
    const row = rows[rowIndex];
    const result = score(guess, SOLUTION);

    result.forEach((status, c) => {
      const tile = row.tiles[c];
      tile.textContent = glyph(guess[c], c);
      tile.classList.add('filled');

      const apply = () => {
        tile.classList.remove('filled');
        tile.classList.add(status);
        paintKey(guess[c], status);
      };

      if (!animate) { apply(); return; }
      tile.style.animationDelay = `${c * 300}ms`;
      tile.classList.add('flip');
      setTimeout(apply, c * 300 + 250);
    });

    return result;
  }

  /* ===================== מהלך המשחק ===================== */

  function handleKey(key) {
    if (busy) return;

    if (key === 'ENTER') return submit();
    if (key === 'BACK') {
      if (current.length) {
        current = current.slice(0, -1);
        drawCurrent();
      }
      return;
    }
    if (state.status !== 'playing') return;
    if (current.length >= COLS) return;

    current += key;
    drawCurrent();
  }

  function invalid(message) {
    const row = rows[state.guesses.length];
    if (row) {
      row.el.classList.add('shake');
      setTimeout(() => row.el.classList.remove('shake'), 600);
    }
    toast(message);
  }

  function submit() {
    if (state.status !== 'playing') { openStats(); return; }

    if (current.length < COLS) return invalid('לא מספיק אותיות');
    if (!freeMode && !DICTIONARY.has(current)) return invalid('המילה אינה במילון');

    const guess = current;
    const rowIndex = state.guesses.length;
    current = '';
    busy = true;

    drawGuess(rowIndex, guess, true);

    state.guesses.push(guess);
    const won = guess === SOLUTION;
    const lost = !won && state.guesses.length === ROWS;
    if (won) state.status = 'won';
    else if (lost) state.status = 'lost';
    save(KEY_STATE, state);

    const revealMs = (COLS - 1) * 300 + 500;

    setTimeout(() => {
      busy = false;

      if (won) {
        rows[rowIndex].tiles.forEach((tile, i) => {
          tile.style.animationDelay = `${i * 100}ms`;
          tile.classList.remove('flip');
          tile.classList.add('bounce');
        });
        const praise = ['מדהים!', 'מצוין!', 'יפה מאוד!', 'יופי!', 'לא רע', 'ממש ברגע האחרון'];
        toast(praise[rowIndex]);
        recordResult(true, rowIndex + 1);
        setTimeout(openStats, 1700);
      } else if (lost) {
        toast(toDisplay(SOLUTION), 3000);
        recordResult(false, 0);
        setTimeout(openStats, 2200);
      }
    }, revealMs);
  }

  function recordResult(won, tries) {
    if (stats.lastDay === DAY) return;      // הגנה מפני ספירה כפולה
    stats.played++;
    if (won) {
      stats.wins++;
      stats.dist[tries - 1]++;
      stats.streak = (stats.lastDay === DAY - 1) ? stats.streak + 1 : 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    } else {
      stats.streak = 0;
    }
    stats.lastDay = DAY;
    save(KEY_STATS, stats);
  }

  /* ===================== חלונות ===================== */

  let openModal = null;

  function show(modal) {
    if (openModal) openModal.hidden = true;
    openModal = modal;
    modal.hidden = false;
    backdrop.hidden = false;
  }

  function closeModal() {
    if (openModal) openModal.hidden = true;
    openModal = null;
    backdrop.hidden = true;
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openModal) closeModal();
  });

  document.getElementById('btn-help').addEventListener('click', () => show(helpModal));
  document.getElementById('btn-stats').addEventListener('click', openStats);

  function openStats() {
    renderStats();
    show(statsModal);
  }

  function renderStats() {
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    document.getElementById('st-played').textContent = stats.played;
    document.getElementById('st-win').textContent = winRate;
    document.getElementById('st-streak').textContent = stats.streak;
    document.getElementById('st-max').textContent = stats.maxStreak;

    const banner = document.getElementById('result-banner');
    if (state.status === 'playing') {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      document.getElementById('result-title').textContent =
        state.status === 'won' ? 'כל הכבוד!' : 'אולי מחר';
      document.getElementById('result-word').innerHTML =
        `מילת היום: <b>${toDisplay(SOLUTION)}</b>`;
    }

    const distEl = document.getElementById('dist');
    distEl.innerHTML = '';
    const max = Math.max(1, ...stats.dist);
    const winningRow = state.status === 'won' ? state.guesses.length : -1;

    stats.dist.forEach((count, i) => {
      const row = document.createElement('div');
      row.className = 'dist-row' + (i + 1 === winningRow ? ' current' : '');
      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = i + 1;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = `${Math.max(7, (count / max) * 100)}%`;
      bar.textContent = count;
      row.append(idx, bar);
      distEl.appendChild(row);
    });

    document.getElementById('btn-share').hidden = state.status === 'playing';
    updateCountdown();
  }

  /* ----- ספירה לאחור למילה הבאה ----- */
  let countdownTimer = null;

  function updateCountdown() {
    const el = document.getElementById('countdown');
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let secs = Math.floor((midnight - now) / 1000);

    if (secs <= 0) { location.reload(); return; }

    const pad = (n) => String(n).padStart(2, '0');
    el.textContent =
      `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;

    clearTimeout(countdownTimer);
    countdownTimer = setTimeout(updateCountdown, 1000);
  }

  /* ----- שיתוף ----- */
  const EMOJI = {
    correct: '🟩',
    present: '🟨',
    absent: () => document.documentElement.dataset.theme === 'dark' ? '⬛' : '⬜',
  };

  function shareText() {
    const tries = state.status === 'won' ? state.guesses.length : 'X';
    const RLM = '‏';   // מאלץ כיוון ימין־לשמאל, כדי שהריבועים יוצגו כמו בלוח
    const grid = state.guesses
      .map((g) => RLM + score(g, SOLUTION)
        .map((s) => (typeof EMOJI[s] === 'function' ? EMOJI[s]() : EMOJI[s]))
        .join(''))
      .join('\n');

    return `${RLM}וורדל בעברית #${PUZZLE_NO} — ${tries}/${ROWS}\n\n${grid}\n\n${location.href}`;
  }

  document.getElementById('btn-share').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast('הועתק ללוח');
    } catch {
      // דפדפנים ישנים / הרשאות חסומות
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

  /* ----- ערכת צבעים ----- */
  const themeToggle = document.getElementById('btn-theme');

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'dark' ? '#121213' : '#ffffff');
    save(KEY_THEME, theme);
  }

  setTheme(load(KEY_THEME, null)
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  /* ----- מצב חופשי ----- */
  const freeToggle = document.getElementById('toggle-free');
  freeToggle.checked = freeMode;
  freeToggle.addEventListener('change', () => {
    freeMode = freeToggle.checked;
    save(KEY_FREE, freeMode);
  });

  /* ===================== מקלדת פיזית ===================== */

  // מיפוי מקשי QWERTY לאותיות עבריות, למי שהפריסה שלו באנגלית
  const QWERTY_TO_HEBREW = {
    e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'נ', o: 'מ', p: 'פ',
    a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'כ',
    z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת',
  };

  document.addEventListener('keydown', (e) => {
    if (openModal || e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === 'Enter') { handleKey('ENTER'); return; }
    if (e.key === 'Backspace') { handleKey('BACK'); return; }

    const raw = e.key;
    let letter = null;

    if (/^[א-ת]$/.test(raw)) letter = TO_REGULAR[raw] || raw;
    else if (QWERTY_TO_HEBREW[raw.toLowerCase()]) letter = QWERTY_TO_HEBREW[raw.toLowerCase()];

    if (letter && keyEls.has(letter)) {
      e.preventDefault();
      handleKey(letter);
    }
  });

  /* ידית לבדיקות ולניפוי שגיאות. אינה מסגירה דבר — המילון ואופן הבחירה
   * ממילא נמצאים בקוד הצד־לקוח, בדיוק כמו במשחק המקורי. */
  window.__wordle = { score, norm, toDisplay, dayNumber, SHUFFLED, SOLUTION, PUZZLE_NO, shareText };

  /* ===================== אתחול ===================== */

  fitBoard();

  // שחזור המשחק של היום, ללא אנימציות
  state.guesses.forEach((guess, i) => drawGuess(i, guess, false));

  if (state.status !== 'playing') {
    setTimeout(openStats, 400);
  } else if (!load('he-wordle:seen-help', false)) {
    show(helpModal);
    save('he-wordle:seen-help', true);
  }
})();
