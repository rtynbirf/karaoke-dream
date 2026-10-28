// Питч-трейл: неоновая визуализация — голосовая кривая певца поверх
// целевых «нот-плашек» гид-мелодии. Свободный режим (без эталона):
// осциллограф активности + границы строк.

export class PitchTrail {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.resize();
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.c.width = Math.max(10, Math.round(r.width * dpr));
    this.c.height = Math.max(10, Math.round(r.height * dpr));
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width;
    this.h = r.height;
  }

  draw({ time, frames = [], lines = [], shift = 0, hasRef = true }) {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    g.clearRect(0, 0, W, H);
    if (!W || !H) return;

    if (!hasRef) { this.drawActivity(time, frames, lines); return; }

    const notes = [];
    for (const l of lines) for (const w of l.words || []) if (w.midi != null) notes.push(w.midi + shift);
    if (!notes.length) return;

    let lo = Math.min(...notes);
    let hi = Math.max(...notes);
    lo -= 2.5; hi += 2.5;
    const span = Math.max(10, hi - lo);
    const mid = (hi + lo) / 2;
    const y = (m) => H - ((m - (mid - span / 2)) / span) * H;
    const t0 = time - 2.2;
    const t1 = time + 5.8;
    const x = (t) => ((t - t0) / (t1 - t0)) * W;

    // сетка полутонов
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(140,160,255,0.07)';
    g.fillStyle = 'rgba(160,180,255,0.35)';
    g.font = '10px monospace';
    for (let m = Math.ceil(mid - span / 2); m <= mid + span / 2; m++) {
      g.beginPath();
      g.moveTo(0, y(m));
      g.lineTo(W, y(m));
      g.stroke();
      if (m % 2 === 0) g.fillText(m % 12 === 0 ? `A${Math.floor(m / 12) - 1}` : '', 4, y(m) - 2);
    }

    // целевые ноты (гид-мелодия)
    for (const l of lines) {
      for (const w of l.words || []) {
        if (w.midi == null) continue;
        if (w.end < t0 || w.start > t1) continue;
        const m = w.midi + shift;
        const X = x(w.start);
        const X2 = x(w.end);
        g.save();
        g.shadowColor = 'rgba(34,211,238,0.9)';
        g.shadowBlur = 12;
        g.strokeStyle = '#22d3ee';
        g.fillStyle = 'rgba(34,211,238,0.14)';
        g.lineWidth = 2;
        const yy = y(m) - 6;
        const ww = Math.max(3, X2 - X);
        if (g.roundRect) { g.beginPath(); g.roundRect(X, yy, ww, 12, 6); g.fill(); g.stroke(); }
        else { g.fillRect(X, yy, ww, 12); g.strokeRect(X, yy, ww, 12); }
        g.restore();
      }
    }

    // голосовая кривая певца
    g.save();
    g.shadowColor = '#ff2bd6';
    g.shadowBlur = 10;
    g.strokeStyle = '#ff2bd6';
    g.lineWidth = 2.4;
    g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    for (const fr of frames) {
      if (fr.t < t0 - 0.5 || fr.t > t1) { pen = false; continue; }
      if (!fr.voiced || fr.midi == null) { pen = false; continue; }
      const X = x(fr.t);
      const Y = y(fr.midi);
      if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y);
    }
    g.stroke();
    g.restore();

    // линия «сейчас»
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x(time), 0, 1.5, H);
  }

  drawActivity(time, frames, lines) {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    const t0 = time - 2.2;
    const t1 = time + 5.8;
    const x = (t) => ((t - t0) / (t1 - t0)) * W;
    const mid = H / 2;

    // границы строк
    g.strokeStyle = 'rgba(167,139,250,0.25)';
    g.setLineDash([4, 6]);
    for (const l of lines) {
      if (l.time < t0 || l.time > t1) continue;
      g.beginPath();
      g.moveTo(x(l.time), 0);
      g.lineTo(x(l.time), H);
      g.stroke();
    }
    g.setLineDash([]);

    // активность голоса
    g.save();
    g.shadowColor = '#ff2bd6';
    g.shadowBlur = 8;
    g.fillStyle = 'rgba(255,43,214,0.75)';
    for (const fr of frames) {
      if (fr.t < t0 || fr.t > t1) continue;
      const hgt = Math.max(2, Math.min(H * 0.45, fr.rms * H * 3));
      g.fillRect(x(fr.t) - 1.2, mid - hgt, 2.4, hgt * 2);
    }
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x(time), 0, 1.5, H);
  }
}
