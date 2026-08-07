/* =========================================================================
 * game.js — "השיר היומי"
 *
 * תמונה אחת ליום, ושם השיר מורכב מאותיות מעורבבות.
 * הכול רץ בדפדפן: החידה נגזרת מהתאריך, ולכן כל השחקנים מקבלים
 * את אותה תמונה ואת אותו סידור אותיות באותו יום.
 * ======================================================================= */

(() => {
  'use strict';

  const CONFIG = window.SONG_CONFIG;
  const SONGS = window.SONG_DATA;
  const EPOCH = new Date(...CONFIG.EPOCH);

  /* ===================== בחירת חידת היום ===================== */

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dayNumber(date = new Date()) {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((midnight - EPOCH) / 86400000);
  }

  /* ערבוב דטרמיניסטי של סדר החידות, כדי שלא יופיעו לפי סדר הקובץ */
  const ORDER = (() => {
    const list = SONGS.slice();
    const rand = mulberry32(20260101);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  })();

  const DAY = dayNumber();
  const PUZZLE_NO = DAY + 1;
  const SONG = ORDER[((DAY % ORDER.length) + ORDER.length) % ORDER.length];

  /* ===================== בניית החידה ===================== */

  /* אותיות שכיחות בעברית — מאגר להגרלת אותיות מיותרות. אותיות נפוצות
   * מופיעות יותר, כדי שהמיותרות ייראו סבירות ולא יבלטו מיד. */
  const DECOY_POOL = 'אאבבגדההוווזחטייייכללמממנננסעפצקררששתת';

  /**
   * בונה את מבנה החידה: משבצות מקובצות למילים, ומאגר אותיות מעורבב.
   * הערבוב תלוי ביום בלבד — כל השחקנים רואים בדיוק אותו סידור.
   */
  function buildPuzzle(title, day) {
    const rand = mulberry32(day * 7919 + 13);

    const words = title.split(' ');
    const answer = [...title.replace(/ /g, '')];

    const extras = [];
    const wanted = Math.min(CONFIG.DECOYS, CONFIG.MAX_TILES - answer.length);
    for (let i = 0; i < wanted; i++) {
      extras.push(DECOY_POOL[Math.floor(rand() * DECOY_POOL.length)]);
    }

    const tiles = [...answer, ...extras];
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }

    return { words, answer, tiles };
  }

  const PUZZLE = buildPuzzle(SONG.title, DAY);

  /* ===================== אחסון ===================== */

  const KEY_STATE = 'he-song:daily';
  const KEY_STATS = 'he-song:stats';
  const KEY_THEME = 'he-wordle:theme';   // משותף עם עברדל, כדי שהמראה יהיה אחיד
  const KEY_SEEN = 'he-song:seen-help';

  const load = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* מצב פרטי */ }
  };

  let stats = load(KEY_STATS, {
    played: 0, wins: 0, clean: 0, streak: 0, maxStreak: 0, lastDay: null,
  });

  let state = load(KEY_STATE, null);
  if (!state || state.day !== DAY) {
    state = {
      day: DAY,
      placed: new Array(PUZZLE.answer.length).fill(null),  // index במאגר לכל משבצת
      used: [],                                            // אינדקסים שנוצלו מהמאגר
      removed: [],                                         // אותיות מיותרות שהוסרו ברמז
      hints: 0,
      status: 'playing',
    };
    save(KEY_STATE, state);
  }

  /** ניסוח מספר רמזים בעברית תקינה: "רמז אחד", "שני רמזים", "5 רמזים" */
  function hintWord(n) {
    if (n === 1) return 'רמז אחד';
    if (n === 2) return 'שני רמזים';
    return `${n} רמזים`;
  }

  /* ===================== DOM ===================== */

  const $ = (id) => document.getElementById(id);
  const slotsEl = $('slots');
  const bankEl = $('bank');
  const backdrop = $('modal-backdrop');
  const helpModal = $('modal-help');
  const statsModal = $('modal-stats');

  $('photo').src = `images/${SONG.id}.jpg`;

  let slotEls = [];
  let tileEls = [];

  /** מיפוי: משבצת מספר i בתשובה → האינדקס שלה בתוך המילה/המבנה */
  function renderSlots() {
    slotsEl.innerHTML = '';
    slotEls = [];
    let index = 0;

    PUZZLE.words.forEach((word) => {
      const group = document.createElement('div');
      group.className = 'word';
      for (let i = 0; i < [...word].length; i++) {
        const slot = document.createElement('button');
        slot.className = 'slot';
        slot.type = 'button';
        const at = index++;
        slot.addEventListener('click', () => returnLetter(at));
        group.appendChild(slot);
        slotEls.push(slot);
      }
      slotsEl.appendChild(group);
    });
  }

  function renderBank() {
    bankEl.innerHTML = '';
    tileEls = [];
    PUZZLE.tiles.forEach((letter, i) => {
      const tile = document.createElement('button');
      tile.className = 'tile';
      tile.type = 'button';
      tile.textContent = letter;
      tile.addEventListener('click', () => placeLetter(i));
      bankEl.appendChild(tile);
      tileEls.push(tile);
    });
  }

  function paint() {
    slotEls.forEach((slot, i) => {
      const tileIndex = state.placed[i];
      slot.textContent = tileIndex === null ? '' : PUZZLE.tiles[tileIndex];
      slot.classList.toggle('filled', tileIndex !== null);
      slot.classList.toggle('locked', Boolean(state.locked && state.locked[i]));
    });

    tileEls.forEach((tile, i) => {
      const used = state.used.includes(i);
      const gone = state.removed.includes(i);
      tile.classList.toggle('used', used);
      tile.classList.toggle('gone', gone);
      tile.disabled = used || gone;
    });

    const solved = state.status === 'won';
    $('hint-letter').disabled = solved;
    $('hint-remove').disabled = solved;
    $('hint-count').textContent = state.hints ? hintWord(state.hints) : '';
  }

  /* ===================== מהלך המשחק ===================== */

  function placeLetter(tileIndex) {
    if (state.status === 'won') return;
    if (state.used.includes(tileIndex) || state.removed.includes(tileIndex)) return;

    const next = state.placed.findIndex((v, i) => v === null && !(state.locked && state.locked[i]));
    if (next === -1) return;

    state.placed[next] = tileIndex;
    state.used.push(tileIndex);
    save(KEY_STATE, state);
    paint();

    if (state.placed.every((v) => v !== null)) checkAnswer();
  }

  function returnLetter(slotIndex) {
    if (state.status === 'won') return;
    if (state.locked && state.locked[slotIndex]) return;   // אות שנחשפה ברמז נעולה
    const tileIndex = state.placed[slotIndex];
    if (tileIndex === null) return;

    state.placed[slotIndex] = null;
    state.used = state.used.filter((i) => i !== tileIndex);
    save(KEY_STATE, state);
    paint();
  }

  function currentGuess() {
    return state.placed.map((i) => (i === null ? '' : PUZZLE.tiles[i])).join('');
  }

  function checkAnswer() {
    if (currentGuess() === PUZZLE.answer.join('')) {
      state.status = 'won';
      save(KEY_STATE, state);
      recordResult();
      slotEls.forEach((s, i) => {
        s.style.animationDelay = `${i * 60}ms`;
        s.classList.add('bounce');
      });
      toast(state.hints === 0 ? 'פתרון נקי! 🎉' : 'כל הכבוד!');
      setTimeout(openStats, 1400);
    } else {
      slotsEl.classList.add('shake');
      setTimeout(() => slotsEl.classList.remove('shake'), 600);
      toast('לא נכון, נסו שוב');
    }
    paint();
  }

  /* ===================== רמזים ===================== */

  $('hint-letter').addEventListener('click', () => {
    if (state.status === 'won') return;

    // המשבצת הראשונה שאינה מכילה את האות הנכונה
    const target = state.placed.findIndex((tileIndex, i) => {
      if (state.locked && state.locked[i]) return false;
      return tileIndex === null || PUZZLE.tiles[tileIndex] !== PUZZLE.answer[i];
    });
    if (target === -1) return;

    const wanted = PUZZLE.answer[target];
    // אריח פנוי במאגר שנושא את האות הנכונה
    const source = PUZZLE.tiles.findIndex((letter, i) =>
      letter === wanted && !state.used.includes(i) && !state.removed.includes(i));
    if (source === -1) return;

    // מפנים את המשבצת אם יושבת בה אות שגויה
    if (state.placed[target] !== null) {
      const old = state.placed[target];
      state.used = state.used.filter((i) => i !== old);
    }

    state.placed[target] = source;
    state.used.push(source);
    state.locked = state.locked || new Array(PUZZLE.answer.length).fill(false);
    state.locked[target] = true;
    state.hints++;
    save(KEY_STATE, state);
    paint();

    if (state.placed.every((v) => v !== null)) checkAnswer();
  });

  $('hint-remove').addEventListener('click', () => {
    if (state.status === 'won') return;

    // כמה עותקים מכל אות באמת נחוצים
    const need = {};
    PUZZLE.answer.forEach((c) => { need[c] = (need[c] || 0) + 1; });

    const seen = {};
    const spare = [];
    PUZZLE.tiles.forEach((letter, i) => {
      if (state.used.includes(i) || state.removed.includes(i)) return;
      seen[letter] = (seen[letter] || 0) + 1;
      // עותק שמעבר לכמות הדרושה — בטוח למחיקה
      const placedSame = state.placed.filter((t) => t !== null && PUZZLE.tiles[t] === letter).length;
      if (seen[letter] + placedSame > (need[letter] || 0)) spare.push(i);
    });

    if (!spare.length) { toast('אין אותיות מיותרות להסיר'); return; }

    state.removed.push(spare[0]);
    state.hints++;
    save(KEY_STATE, state);
    paint();
  });

  /* ===================== סטטיסטיקות ===================== */

  function recordResult() {
    if (stats.lastDay === DAY) return;
    stats.played++;
    stats.wins++;
    if (state.hints === 0) stats.clean++;
    stats.streak = (stats.lastDay === DAY - 1) ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
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

  $('btn-help').addEventListener('click', () => show(helpModal));
  $('btn-stats').addEventListener('click', openStats);

  function openStats() {
    const rate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    $('st-played').textContent = stats.played;
    $('st-win').textContent = rate;
    $('st-clean').textContent = stats.clean;
    $('st-streak').textContent = stats.streak;
    $('st-max').textContent = stats.maxStreak;

    const banner = $('result-banner');
    if (state.status === 'won') {
      banner.hidden = false;
      $('result-title').textContent = state.hints === 0 ? 'פתרון נקי!' : 'פתרת!';
      $('result-song').innerHTML = `השיר: <b>${SONG.title}</b>`;
      $('result-hints').textContent = state.hints === 0
        ? 'בלי רמזים בכלל 👏'
        : `${hintWord(state.hints)} 💡`;
    } else {
      banner.hidden = true;
    }

    $('btn-share').hidden = state.status !== 'won';
    updateCountdown();
    show(statsModal);
  }

  /* ----- ספירה לאחור ----- */
  let countdownTimer = null;
  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const secs = Math.floor((midnight - now) / 1000);
    if (secs <= 0) { location.reload(); return; }
    const pad = (n) => String(n).padStart(2, '0');
    $('countdown').textContent =
      `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
    clearTimeout(countdownTimer);
    countdownTimer = setTimeout(updateCountdown, 1000);
  }

  /* ----- שיתוף ----- */
  function shareText() {
    const RLM = '‏';
    const hints = state.hints === 0 ? 'בלי רמזים ✨' : `${hintWord(state.hints)} 💡`;
    return `${RLM}השיר היומי #${PUZZLE_NO}\n${RLM}${hints}\n\n${location.href}`;
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

  /* ----- ערכת צבעים ----- */
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'dark' ? '#121213' : '#ffffff');
    save(KEY_THEME, theme);
  }
  setTheme(load(KEY_THEME, null)
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  $('btn-theme').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  /* ----- הודעות ----- */
  function toast(message, ms = 1800) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $('toast-area').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, ms);
  }

  /* ===================== אתחול ===================== */

  window.__song = { SONG, PUZZLE, PUZZLE_NO, dayNumber, buildPuzzle, shareText, state: () => state };

  renderSlots();
  renderBank();
  paint();

  if (state.status === 'won') {
    setTimeout(openStats, 400);
  } else if (!load(KEY_SEEN, false)) {
    show(helpModal);
    save(KEY_SEEN, true);
  }
})();
