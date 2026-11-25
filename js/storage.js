/* IndexedDB is the primary local store; localStorage is a fallback. */
window.Store = (() => {
  const KEY = 'jeePhysicsTracker.v1';
  const DB = 'jeePhysicsTracker';
  const STORE = 'state';
  const MAX_STATE_BYTES = 4 * 1024 * 1024;
  const MAX_QUESTIONS = 5000;
  const MAX_SESSIONS = 5000;
  const challengeIds = new Set((window.CHALLENGES || []).map(item => item.id));
  let dbPromise;

  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function map() { return Object.create(null); }
  function text(value, max = 20000) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
  }
  function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  }
  function safeImage(value) {
    if (typeof value !== 'string' || value.length > 240 || !/^assets\/questions\/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp)$/i.test(value)) return '';
    if (value.split('/').some(part => part === '.' || part === '..')) return '';
    return value;
  }
  function safeSolutionUrl(value) {
    if (typeof value !== 'string' || value.length > 500) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
      if (url.hostname === 'youtu.be' && /^\/[A-Za-z0-9_-]{6,20}\/?$/.test(url.pathname)) return url.href;
      if ((url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') && url.pathname === '/watch' && /^[A-Za-z0-9_-]{6,20}$/.test(url.searchParams.get('v') || '')) return url.href;
    } catch (_) {}
    return '';
  }
  function defaults() {
    return { version: 1, totals: map(), records: map(), sessions: [], questionBanks: map(), savedQuestions: map(), lastBackupReminder: 0, theme: 'light' };
  }
  function normalizeBank(value) {
    if (!object(value)) return null;
    const types = new Set(['mcq-single', 'mcq-multiple', 'integer', 'numeric', 'text']);
    const type = types.has(value.type) ? value.type : types.has(value.mode) ? value.mode : 'text';
    const sourceOptions = object(value.options) ? value.options : {};
    const options = map();
    for (const key of ['A', 'B', 'C', 'D']) options[key] = text(sourceOptions[key], 5000);
    return {
      prompt: text(value.prompt), answer: text(value.answer, 5000), type, mode: type,
      tolerance: finite(value.tolerance, 0, 1e12), options,
      solution: text(value.solution), ...(typeof value.chapter === 'string' ? { chapter: text(value.chapter, 80) } : {}), image: safeImage(value.image),
      solutionUrl: safeSolutionUrl(value.solutionUrl),
      ...(Number.isSafeInteger(Number(value.sourcePage)) && Number(value.sourcePage) > 0 ? { sourcePage: Number(value.sourcePage) } : {})
    };
  }
  function normalizeQuestion(value) {
    if (!object(value)) return null;
    const status = ['unattempted', 'correct', 'wrong', 'skipped'].includes(value.status) ? value.status : 'unattempted';
    let response = '';
    if (Array.isArray(value.response)) response = value.response.slice(0, 4).map(x => ['A','B','C','D'].includes(x) ? x : '').filter(Boolean);
    else response = text(value.response, 5000);
    return {
      status, seconds: finite(value.seconds, 0, 86400), response,
      note: text(value.note, 5000),
      checked: value.checked === true, attempted: value.attempted === true,
      review: value.review === true, star: value.star === true,
      changedAt: finite(value.changedAt, 0, 8640000000000000)
    };
  }
  function normalize(value) {
    if (!object(value)) return defaults();
    const out = defaults();
    out.version = 1;
    out.theme = value.theme === 'dark' ? 'dark' : 'light';
    out.catalogVersion = Math.floor(finite(value.catalogVersion, 0, 100));
    out.lastBackupReminder = finite(value.lastBackupReminder, 0, 8640000000000000);

    if (object(value.homeQuote)) {
      const index = Number(value.homeQuote.index), nextAt = Number(value.homeQuote.nextAt);
      if (Number.isSafeInteger(index) && index >= 0 && Number.isFinite(nextAt)) out.homeQuote = { index, nextAt: finite(nextAt, 0, 8640000000000000), version: 3 };
    }
    if (object(value.totals)) {
      for (const id of challengeIds) {
        if (!Object.hasOwn(value.totals, id)) continue;
        const n = Number(value.totals[id]);
        out.totals[id] = value.totals[id] === null || value.totals[id] === '' ? null : Number.isSafeInteger(n) && n >= 0 && n <= MAX_QUESTIONS ? n : null;
      }
    }
    if (object(value.questionBanks)) {
      for (const id of challengeIds) {
        const entries = value.questionBanks[id];
        if (!object(entries)) continue;
        const bank = map();
        for (const [q, raw] of Object.entries(entries).slice(0, MAX_QUESTIONS)) {
          if (!/^[1-9]\d{0,3}$/.test(q) || Number(q) > MAX_QUESTIONS) continue;
          const cleaned = normalizeBank(raw);
          if (cleaned) bank[q] = cleaned;
        }
        if (Object.keys(bank).length) out.questionBanks[id] = bank;
      }
    }
    if (Array.isArray(value.sessions)) {
      for (const raw of value.sessions.slice(-MAX_SESSIONS)) {
        if (!object(raw) || !challengeIds.has(raw.itemId)) continue;
        const date = text(raw.date, 80);
        if (!date || !Number.isFinite(Date.parse(date))) continue;
        const questions = map();
        if (object(raw.questions)) {
          for (const [q, item] of Object.entries(raw.questions).slice(0, MAX_QUESTIONS)) {
            if (!/^[1-9]\d{0,3}$/.test(q) || Number(q) > MAX_QUESTIONS) continue;
            const cleaned = normalizeQuestion(item);
            if (cleaned) questions[q] = cleaned;
          }
        }
        const attempted = Math.floor(finite(raw.attempted, 0, MAX_QUESTIONS));
        const correct = Math.floor(finite(raw.correct, 0, attempted));
        const wrong = Math.floor(finite(raw.wrong, 0, attempted));
        const skipped = Math.floor(finite(raw.skipped, 0, MAX_QUESTIONS));
        out.sessions.push({
          id: text(raw.id, 80) || `${Date.now().toString(36)}-${out.sessions.length}`,
          itemId: raw.itemId, date, duration: finite(raw.duration, 0, 31536000),
          attempted, correct, wrong, skipped,
          accuracy: finite(raw.accuracy, 0, 100), questions
        });
      }
    }
    if (object(value.savedQuestions)) {
      for (const raw of Object.values(value.savedQuestions).slice(0, 10000)) {
        if (!object(raw) || !challengeIds.has(raw.itemId)) continue;
        const q = Number(raw.q);
        if (!Number.isSafeInteger(q) || q < 1 || q > MAX_QUESTIONS) continue;
        out.savedQuestions[`${raw.itemId}:${q}`] = { itemId: raw.itemId, q, savedAt: finite(raw.savedAt, 0, 8640000000000000) };
      }
    }
    if (object(value.records)) {
      for (const id of challengeIds) {
        if (!object(value.records[id])) continue;
        out.records[id] = map();
        for (const [rawQ, raw] of Object.entries(value.records[id]).slice(0, MAX_QUESTIONS)) {
          const q = Number(rawQ);
          if (!Number.isSafeInteger(q) || q < 1 || q > MAX_QUESTIONS || !object(raw) || !['correct', 'wrong'].includes(raw.status)) continue;
          const response = Array.isArray(raw.response) ? raw.response.slice(0, 4).filter(x => ['A','B','C','D'].includes(x)) : text(raw.response, 5000);
          out.records[id][String(q)] = { status: raw.status, response, checkedAt: finite(raw.checkedAt, 0, 8640000000000000) };
        }
      }
    }
    if (JSON.stringify(out).length * 2 > MAX_STATE_BYTES) throw new Error('Tracker backup is too large (maximum 4 MB).');
    return out;
  }
  function openDB() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbPromise;
  }
  async function load() {
    try {
      const db = await openDB();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return value ? normalize(value) : defaults();
    } catch (_) {
      try { return normalize(JSON.parse(localStorage.getItem(KEY)) || defaults()); }
      catch (_) { return defaults(); }
    }
  }
  async function save(data, options = {}) {
    const safe = normalize(data);
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(safe, KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) { localStorage.setItem(KEY, JSON.stringify(safe)); }
    if (options.cloud !== false) window.CloudSync?.queue(safe);
    return safe;
  }
  return { load, save, normalize, defaults, safeImage, safeSolutionUrl, maxStateBytes: MAX_STATE_BYTES, maxQuestions: MAX_QUESTIONS };
})();
