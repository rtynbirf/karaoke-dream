// Оркестратор приложения: состояние, микрофон, цикл исполнения (rAF),
// оценка строк, Зелёный коридор, переходы экранов.
// Автозапуск — только в браузере (в Node модуль импортируется smoke-тестом).

import { qs, showToast } from './util/dom.js';
import { loadJSON, saveJSON, KEYS } from './util/storage.js';
import { AudioEngine } from './audio/engine.js';
import { PitchTracker, rmsOf } from './audio/pitch.js';
import { parseLRC } from './lyrics/lrc.js';
import { LyricsSync } from './lyrics/sync.js';
import { MODES, scoreLine } from './scoring/judge.js';
import { createCorridor, updateCorridor, corridorTol, corridorLabel } from './scoring/corridor.js';
import { DEMO, demoTimeline } from './songs/demo.js';
import { renderDemo } from './audio/synth.js';
import { PitchTrail } from './ui/canvas.js';
import { screenHome, screenSetup, screenPerform, screenResult, screenParty, screenHelp } from './ui/screens.js';

const engine = new AudioEngine();

const state = {
  settings: loadJSON(KEYS.settings, { name: '', mode: 'friendly', latencyMs: 180, guideVol: 0.85, musicVol: 0.9 }),
  session: null,
  corridor: createCorridor(),
  corridorPersist: false,
  scores: [],
  frames: [],
  queue: loadJSON(KEYS.queue, []),
  currentSinger: loadJSON(KEYS.singer, ''),
  leaderboard: loadJSON(KEYS.leaderboard, []),
  micOn: false,
  tracker: null,
  analyser: null,
  micBuf: null,
  lastLineIdx: -1,
  trail: null,
  rafId: 0,
  screen: 'home',
  lastPitchAt: 0,
};

const sync = new LyricsSync([]);
let controls = null;

// ---------- микрофон ----------

async function enableMic() {
  if (state.micOn) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = engine.ensureCtx();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  an.smoothingTimeConstant = 0;
  src.connect(an); // НЕ подключаем к destination — иначе завод
  state.analyser = an;
  state.micBuf = new Float32Array(an.fftSize);
  state.tracker = new PitchTracker({ sampleRate: ctx.sampleRate });
  state.micOn = true;
  updateStatusChips();
}

function micLevel() {
  if (!state.analyser) return 0;
  state.analyser.getFloatTimeDomainData(state.micBuf);
  return rmsOf(state.micBuf);
}

// ---------- маршрутизация ----------

const actions = {
  state,
  persistSettings: () => saveJSON(KEYS.settings, state.settings),
  enableMic,
  micLevel,
  goDemo: (name) => { state.corridorPersist = false; go('setup', { type: 'demo', title: name ? `Демо для: ${name}` : 'Демо: «Неоновый вектор»' }); },
  goUpload: () => go('setup', { type: 'upload', title: 'Свой трек', file: null, lrc: '', vocalRemove: false }),
  goParty: () => go('party'),
  goHelp: () => go('help'),
  home: () => { stopPerform(); go('home'); },
  start: (ctx) => start(ctx),
  encore: () => {
    state.corridorPersist = true;
    state.scores = [];
    state.frames = [];
    state.lastLineIdx = -1;
    if (state.session?.type === 'demo') startDemo(state.session.singer);
    else if (state.session) { renderPerformShell(state.session); beginPerform(); }
  },
  controls: (c) => { controls = c; bindControls(c); },
  queueAdd: (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    state.queue.push(n.slice(0, 24));
    saveJSON(KEYS.queue, state.queue);
    go('party');
  },
  queueRemove: (i) => {
    state.queue.splice(i, 1);
    saveJSON(KEYS.queue, state.queue);
    go('party');
  },
  queueStart: (i) => {
    const name = state.queue.splice(i, 1)[0] || 'Гость';
    state.currentSinger = name;
    saveJSON(KEYS.singer, name);
    saveJSON(KEYS.queue, state.queue);
    actions.goDemo(name);
  },
};

function go(screen, ctx) {
  state.screen = screen;
  cancelAnimationFrame(state.rafId);
  switch (screen) {
    case 'home': screenHome(actions); break;
    case 'setup': screenSetup(actions, ctx || { type: 'demo', title: 'Демо' }); break;
    case 'perform': break; // рендерится через renderPerformShell
    case 'result': screenResult(actions); break;
    case 'party': screenParty(actions); break;
    case 'help': screenHelp(actions); break;
    default: screenHome(actions);
  }
  updateStatusChips();
}

// ---------- запуск сессий ----------

async function start(ctx) {
  if (ctx.type === 'demo') await startDemo(state.currentSinger);
  else await startUpload(ctx);
}

async function startDemo(singer) {
  const tl = demoTimeline(DEMO);
  const info = {
    type: 'demo',
    title: DEMO.meta.ti,
    artist: DEMO.meta.ar,
    singer: singer || state.settings.name || 'Гость',
    duration: tl.duration,
    lines: normalizeLines(tl.lines.map((l) => ({
      time: l.start, text: l.text,
      words: l.words.map((w) => ({ text: w.text, start: w.start, end: w.end, midi: w.midi })),
    }))),
    hasRef: true,
    transpose: 0,
  };
  renderPerformShell(info);
  showToast('Собираю сцену: пэд, бас, барабаны, гид-мелодия…');
  const { backing, guide } = await renderDemo(tl);
  engine.setBuffers({ main: backing, guide });
  engine.setMusicVolume(state.settings.musicVol);
  engine.setGuideVolume(state.settings.guideVol);
  engine.setTranspose(state.corridor.shift);
  info.duration = engine.duration;
  beginPerform();
}

async function startUpload(ctx) {
  if (!ctx.file) { showToast('Сначала выбери аудиофайл'); go('setup', ctx); return; }
  const info = {
    type: 'upload',
    title: ctx.file.name,
    artist: 'твой трек',
    singer: state.settings.name || 'Гость',
    duration: 0,
    lines: [],
    hasRef: false,
    transpose: 0,
  };
  renderPerformShell(info);
  showToast('Декодирую трек…');
  try {
    const { duration } = await engine.loadFile(ctx.file);
    if (ctx.vocalRemove) {
      showToast('Убираю вокал: вычитание центрального канала…');
      await engine.makeMinusVocal();
      engine.setVocalRemove(true);
    }
    info.duration = duration;
    if (ctx.lrc && ctx.lrc.trim()) {
      info.lines = normalizeLines(parseLRC(ctx.lrc).lines);
    }
    info.hasRef = info.lines.some((l) => (l.words || []).some((w) => w.midi != null));
    state.session = info;
    sync.set(info.lines);
    beginPerform();
  } catch (e) {
    showToast(`Не удалось декодировать файл: ${e.message}`);
    go('setup', ctx);
  }
}

// нормализация строк: слова получают start/end (+ сохраняют midi, если есть)
function normalizeLines(lines) {
  return (lines || []).map((l, i) => {
    const next = lines[i + 1];
    const lineEnd = next ? next.time : l.time + 4;
    const ws = (l.words || []).map((w, k) => {
      const n = l.words[k + 1];
      const start = w.start ?? w.time ?? 0;
      return {
        text: w.text,
        start,
        end: w.end ?? (n ? Math.max(start + 0.12, (n.start ?? n.time) - 0.03) : Math.max(start + 0.3, lineEnd - 0.1)),
        midi: w.midi ?? null,
      };
    });
    return { time: l.time, text: l.text, words: ws };
  });
}

// ---------- сцена исполнения ----------

function renderPerformShell(info) {
  state.session = info;
  sync.set(info.lines);
  state.screen = 'perform';
  cancelAnimationFrame(state.rafId);
  screenPerform(actions, info);
}

function beginPerform() {
  if (!state.corridorPersist) state.corridor = createCorridor();
  state.scores = [];
  state.frames = [];
  state.lastLineIdx = -1;
  state.lastPitchAt = 0;
  state.trail = new PitchTrail(qs('#trail'));
  window.addEventListener('resize', onResize);
  engine.onended = () => finish();
  engine.play(0);
  const chipC = qs('.chip-corridor');
  if (chipC) chipC.textContent = `коридор: ${corridorLabel(state.corridor)}`;
  updateHud();
  updateStatusChips();
  state.rafId = requestAnimationFrame(loop);
}

function onResize() { state.trail?.resize(); }

function loop() {
  if (state.screen !== 'perform' || !engine.playing) return;
  const dur = engine.duration || 1;
  const t = Math.max(0, engine.time - state.settings.latencyMs / 1000);

  // микрофон → кадры питча (~12.5 в секунду)
  if (state.micOn && state.analyser) {
    const now = performance.now();
    if (now - state.lastPitchAt >= 80) {
      state.analyser.getFloatTimeDomainData(state.micBuf);
      const p = state.tracker.feed(state.micBuf);
      state.frames.push({ t, midi: p.midi, voiced: p.voiced, rms: p.rms });
      state.lastPitchAt = now;
    }
  }

  const snap = sync.update(Math.min(t, dur));
  if (snap.lineIndex !== state.lastLineIdx) {
    if (state.lastLineIdx >= 0) judgeLine(state.lastLineIdx);
    state.lastLineIdx = snap.lineIndex;
    renderLine(snap);
  }
  if (snap.lineIndex >= 0) updateWords(snap);

  state.trail.draw({
    time: engine.time,
    frames: state.frames,
    lines: state.session.lines,
    shift: state.session.transpose || 0,
    hasRef: state.session.hasRef,
  });

  const prog = qs('#prog-i');
  if (prog) prog.style.width = `${Math.min(100, (t / dur) * 100)}%`;
  if (controls?.seek && document.activeElement !== controls.seek) {
    controls.seek.value = String(Math.min(t, dur));
  }

  if (engine.time >= dur - 0.08) { finish(); return; }
  state.rafId = requestAnimationFrame(loop);
}

function judgeLine(i) {
  const line = state.session.lines[i];
  if (!line || !line.words || !line.words.length) return;
  const base = MODES[state.settings.mode];
  const opts = { ...base, tol: base.tol * corridorTol(state.corridor) };
  const res = scoreLine(state.frames, line, opts, state.session.transpose || 0);
  state.scores.push(res);

  const hud = qs('#hud-line');
  if (hud) hud.textContent = `строка: ${res.total}`;

  if (state.session.type === 'demo') {
    const ev = updateCorridor(state.corridor, res.total);
    if (ev) {
      engine.setTranspose(state.corridor.shift);
      state.session.transpose = state.corridor.shift;
      const chipC = qs('.chip-corridor');
      if (chipC) chipC.textContent = `коридор: ${corridorLabel(state.corridor)}`;
      showToast(ev.type === 'down'
        ? `Зелёный коридор: среда идёт к тебе — ${ev.shift} пт`
        : `Коридор: возврат к оригиналу — ${ev.shift >= 0 ? '+' : ''}${ev.shift} пт`, 'ok');
    }
  }
  updateHud();
}

function updateHud() {
  const done = state.scores;
  const el = qs('#hud-score');
  if (!el) return;
  el.textContent = done.length ? String(Math.round(done.reduce((x, s) => x + s.total, 0) / done.length)) : '—';
  const avg = (k) => {
    const arr = done.map((s) => s[k]).filter((v) => v != null);
    return arr.length ? Math.round((100 * arr.reduce((x, y) => x + y, 0)) / arr.length) : 0;
  };
  setBar('#b-acc', avg('accuracy'));
  setBar('#b-rhy', avg('rhythm'));
  setBar('#b-sta', avg('stability'));
}

function setBar(sel, v) {
  const bar = qs(sel);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, v || 0))}%`;
}

function renderLine(snap) {
  const host = qs('#lyrics');
  if (!host) return;
  const nextPrev = qs('#next-preview');
  if (!snap.line) {
    host.replaceChildren(el('div', { class: 'line free' }, state.session.hasRef || state.session.lines.length ? 'приготовься…' : 'свободный режим: пой от души'));
    if (nextPrev) nextPrev.textContent = '';
    return;
  }
  const words = (snap.line.words || []).map((w) => el('span', { class: 'word' }, w.text));
  host.replaceChildren(
    el('div', { class: 'line prev' }, state.session.lines[snap.lineIndex - 1]?.text || ''),
    el('div', { class: 'line cur' }, words),
  );
  if (nextPrev) nextPrev.textContent = snap.nextLine ? `дальше: ${snap.nextLine.text}` : '';
}

function updateWords(snap) {
  const host = qs('#lyrics');
  if (!host || snap.lineIndex < 0) return;
  const spans = host.querySelectorAll('.line.cur .word');
  spans.forEach((sp, k) => {
    sp.classList.toggle('done', k < snap.wordIndex);
    sp.classList.toggle('cur', k === snap.wordIndex);
  });
}

// ---------- управление ----------

function bindControls(c) {
  if (!c) return;
  c.pause?.addEventListener('click', () => {
    if (engine.playing) {
      engine.pause();
      cancelAnimationFrame(state.rafId);
      c.pause.textContent = 'Продолжить';
    } else {
      engine.play(engine.offset);
      c.pause.textContent = 'Пауза';
      state.rafId = requestAnimationFrame(loop);
    }
  });
  c.restart?.addEventListener('click', () => actions.encore());
  c.fullscreen?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  c.exit?.addEventListener('click', () => actions.home());
  c.seek?.addEventListener('change', () => {
    const t = +c.seek.value;
    if (engine.playing) engine.play(t); else engine.seek(t);
  });
  c.volMusic?.addEventListener('input', () => {
    state.settings.musicVol = +c.volMusic.value;
    engine.setMusicVolume(state.settings.musicVol);
    actions.persistSettings();
  });
  c.volGuide?.addEventListener('input', () => {
    state.settings.guideVol = +c.volGuide.value;
    engine.setGuideVolume(state.settings.guideVol);
    actions.persistSettings();
  });
}

function stopPerform() {
  cancelAnimationFrame(state.rafId);
  engine.onended = null;
  engine.stop();
  window.removeEventListener('resize', onResize);
}

// ---------- финал ----------

function finish() {
  cancelAnimationFrame(state.rafId);
  engine.onended = null;
  engine.stop();
  window.removeEventListener('resize', onResize);

  const done = state.scores;
  const total = done.length ? Math.round(done.reduce((x, s) => x + s.total, 0) / done.length) : null;
  const scoreable = state.session?.type === 'demo' || state.session?.lines?.length > 0;
  if (total != null && scoreable) {
    const name = state.session?.singer || state.settings.name || 'Гость';
    state.leaderboard.push({
      name,
      score: total,
      song: state.session.title,
      mode: state.settings.mode,
      date: new Date().toISOString().slice(0, 10),
    });
    state.leaderboard.sort((a, b) => b.score - a.score);
    state.leaderboard = state.leaderboard.slice(0, 10);
    saveJSON(KEYS.leaderboard, state.leaderboard);
  }
  go('result');
}

// ---------- статус в шапке ----------

function updateStatusChips() {
  const host = document.getElementById('status-chips');
  if (!host) return;
  const chips = [`микрофон: ${state.micOn ? 'вкл' : 'выкл'}`, `режим: ${MODES[state.settings.mode].label}`];
  if (state.screen === 'perform' && state.session) chips.push(`коридор: ${corridorLabel(state.corridor)}`);
  host.replaceChildren(...chips.map((c) => {
    const span = document.createElement('span');
    span.className = 'chip';
    span.textContent = c;
    return span;
  }));
}

// ---------- автозапуск (только браузер) ----------

function init() {
  const logo = document.getElementById('logo-link');
  logo?.addEventListener('click', (e) => { e.preventDefault(); actions.home(); });
  go('home');
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  init();
}
