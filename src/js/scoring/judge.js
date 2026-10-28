// Судья пения: точность (питч), ритм (вступление в слово), стабильность (дрожание).
// Чистая логика. frames: [{t, midi (float|null), voiced, rms}] — собираются в main.js.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const MODES = {
  friendly: {
    key: 'friendly',
    label: 'Дружелюбный',
    tol: 1.6,            // множитель допуска по центам (50 * tol)
    minCoverage: 0.22,   // доля вокальных кадров, ниже которой слово «не спето»
    weights: { accuracy: 0.5, rhythm: 0.25, stability: 0.25 },
  },
  jury: {
    key: 'jury',
    label: 'Жюри',
    tol: 1.0,
    minCoverage: 0.35,
    weights: { accuracy: 0.6, rhythm: 0.2, stability: 0.2 },
  },
};

export function scoreWord(frames, word, opts, shift = 0) {
  const t0 = word.start;
  const t1 = word.end;
  const win = frames.filter((f) => f.t >= t0 - 0.06 && f.t <= t1 + 0.12);
  const voiced = win.filter((f) => f.voiced && f.midi != null);
  const coverage = win.length ? voiced.length / win.length : 0;

  let accuracy = null;
  let stability = null;
  let meanAbsCents = null;
  if (word.midi != null && voiced.length) {
    const devs = voiced.map((f) => (f.midi - (word.midi + shift)) * 100); // центы
    // Устойчивая статистика: медиана и MAD. Кадры соседних слов на границах
    // окна — выбросы, и среднее/SD из-за них рушатся, а медиана держит удар.
    const medianAbs = median(devs.map(Math.abs));
    accuracy = clamp(1 - medianAbs / (50 * opts.tol), 0, 1);
    const med = median(devs);
    const mad = median(devs.map((d) => Math.abs(d - med)));
    stability = clamp(1 - (mad * 1.4826) / 120, 0, 1);
    meanAbsCents = medianAbs;
  }

  let rhythm = null;
  const first = voiced[0] || win.find((f) => f.voiced);
  if (first) {
    const dt = first.t - t0;
    rhythm = dt <= 0.15 ? 1 : clamp(1 - (dt - 0.15) / 0.5, 0, 1);
  }

  return {
    coverage,
    accuracy,
    rhythm,
    stability,
    voiced: coverage >= opts.minCoverage,
    meanAbsCents,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreLine(frames, line, opts, shift = 0) {
  const ws = (line.words || []).map((w) => ({
    text: w.text,
    start: w.start ?? w.time ?? 0,
    end: w.end ?? ((w.time ?? 0) + 0.3),
    midi: w.midi ?? null,
  }));
  const parts = ws.map((w) => ({ word: w.text, ...scoreWord(frames, w, opts, shift) }));

  const dur = (i) => Math.max(0.15, ws[i].end - ws[i].start);
  const avg = (key) => {
    let s = 0; let n = 0;
    parts.forEach((p, i) => {
      if (p[key] != null) { s += p[key] * dur(i); n += dur(i); }
    });
    return n > 0 ? s / n : null;
  };

  const accuracy = avg('accuracy');
  const rhythm = avg('rhythm');
  const stability = avg('stability');

  const w = opts.weights;
  let total = 0;
  let wsum = 0;
  if (accuracy != null) { total += w.accuracy * accuracy; wsum += w.accuracy; }
  if (rhythm != null) { total += w.rhythm * rhythm; wsum += w.rhythm; }
  if (stability != null) { total += w.stability * stability; wsum += w.stability; }

  total = wsum > 0 ? Math.round((100 * total) / wsum) : 0;
  if (parts.length && !parts.some((p) => p.voiced)) total = 0;

  return {
    total,
    accuracy,
    rhythm,
    stability,
    words: parts,
    hasRef: ws.some((x) => x.midi != null),
    at: line.time,
    text: line.text || '',
  };
}
