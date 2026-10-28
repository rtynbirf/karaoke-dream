// Синтезатор демо-трека: полностью офлайн-рендер в AudioBuffer.
// Два слоя рендерятся раздельно, чтобы громкость гид-вокала крутилась живьём:
//   renderBacking — пэд (аккорды), бас (четверти), барабаны (кик + хэты)
//   renderGuide   — мелодия по нотам слов (без вибрато: это эталон для оценки)
// transpose — полутоны, применяется на этапе синтеза.

function hz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function makeMaster(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  master.connect(comp);
  comp.connect(ctx.destination);
  return master;
}

function makeNoise(ctx, sampleRate) {
  const len = Math.ceil(sampleRate * 0.09);
  const buf = ctx.createBuffer(1, len, sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
  return buf;
}

export async function renderBacking(timeline, { transpose = 0, sampleRate = 44100 } = {}) {
  const length = Math.ceil((timeline.duration + 0.8) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const master = makeMaster(ctx);
  const noise = makeNoise(ctx, sampleRate);
  const tShift = transpose;

  // --- пэд: аккорд на такт ---
  for (const ch of timeline.chords) {
    const g = ctx.createGain();
    const t0 = ch.start;
    const t1 = ch.start + ch.dur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.5);
    g.gain.setValueAtTime(0.07, t1 - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 850;
    lp.Q.value = 0.6;
    g.connect(lp);
    lp.connect(master);
    ch.intervals.forEach((iv, idx) => {
      const o = ctx.createOscillator();
      o.type = idx === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz(ch.rootMidi + 12 + iv + tShift);
      o.detune.value = idx === 0 ? -4 : 4;
      o.connect(g);
      o.start(t0);
      o.stop(t1 + 0.3);
    });
  }

  // --- бас: четверти по корню аккорда ---
  for (const ch of timeline.chords) {
    for (let b = 0; b < 4; b++) {
      const t = ch.start + b * (ch.dur / 4);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(ch.rootMidi - 12 + tShift);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.55);
    }
  }

  // --- барабаны: кик на 1 и 3, хэты восьмыми ---
  for (const ch of timeline.chords) {
    const beat = ch.dur / 4;
    const eighth = ch.dur / 8;
    for (const bt of [0, 2]) {
      const t = ch.start + bt * beat;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.2);
    }
    for (let e = 0; e < 8; e++) {
      const t = ch.start + e * eighth;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(e % 2 === 1 ? 0.13 : 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hp);
      hp.connect(g);
      g.connect(master);
      src.start(t);
    }
  }

  return ctx.startRendering();
}

export async function renderGuide(timeline, { transpose = 0, sampleRate = 44100 } = {}) {
  const length = Math.ceil((timeline.duration + 0.8) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  master.connect(lp);
  lp.connect(ctx.destination);

  for (const line of timeline.lines) {
    for (const w of line.words) {
      const t0 = w.start;
      const t1 = w.end;
      const dur = Math.max(0.1, t1 - t0);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(w.midi + transpose);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.9, t0 + 0.02);
      g.gain.setValueAtTime(0.9, t0 + dur * 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t1 + 0.08);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t1 + 0.12);
    }
  }

  return ctx.startRendering();
}

export async function renderDemo(timeline, opts = {}) {
  const [backing, guide] = await Promise.all([
    renderBacking(timeline, opts),
    renderGuide(timeline, opts),
  ]);
  return { backing, guide };
}
