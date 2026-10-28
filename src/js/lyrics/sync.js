// Движок синхронизации: по текущему времени песни возвращает активную строку
// и активное слово. Чистая логика, совместима и с LRC-строками, и с демо-таймлайном.

export class LyricsSync {
  constructor(lines = []) {
    this.set(lines);
  }

  set(lines) {
    this.lines = lines || [];
    this.i = -1;
    this.snap = { lineIndex: -1, line: null, nextLine: null, wordIndex: -1, word: null, active: false };
  }

  update(t) {
    const L = this.lines;
    const s = this.snap;
    let idx = -1;
    for (let k = 0; k < L.length; k++) {
      const start = L[k].time;
      const end = k + 1 < L.length ? L[k + 1].time : start + 12;
      if (t >= start && t < end) { idx = k; break; }
    }
    s.lineIndex = idx;
    s.line = idx >= 0 ? L[idx] : null;
    s.nextLine = idx >= 0 && idx + 1 < L.length ? L[idx + 1] : null;
    s.active = idx >= 0;
    s.wordIndex = -1;
    s.word = null;
    if (s.line) {
      const ws = s.line.words || [];
      for (let k = 0; k < ws.length; k++) {
        const w = ws[k];
        const start = w.start ?? w.time;
        const end = k + 1 < ws.length ? (ws[k + 1].start ?? ws[k + 1].time) : (w.end ?? start + 0.6);
        if (t >= start - 0.03 && t < end) { s.wordIndex = k; s.word = w; break; }
      }
    }
    return s;
  }
}
