// WebAudio-движок: транспорт (play/pause/seek), два параллельных слоя
// (минус + гид-вокал), минус-вокал для загруженных треков (вычитание
// центрального канала), транспозиция через detune — без пересборки буферов.
// Аудио-контекст создаётся лениво и только при вызовах (модуль импортируется
// и в Node для smoke-теста).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.mainBuffer = null;   // текущий «минус» (или оригинал)
    this.originalBuffer = null;
    this.minusBuffer = null;
    this.guideBuffer = null;
    this.activeKey = 'main';
    this.sources = [];
    this.musicGain = null;
    this.guideGain = null;
    this.volumes = { music: 0.9, guide: 0.85 };
    this.startedAt = 0;
    this.offset = 0;
    this.playing = false;
    this.transpose = 0; // полутоны, применяется как detune (сохраняет темп)
    this.token = 0;
    this.onended = null;
  }

  ensureCtx() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.ctx = new Ctor();
      this.musicGain = this.ctx.createGain();
      this.guideGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.guideGain.connect(this.ctx.destination);
      this.musicGain.gain.value = this.volumes.music;
      this.guideGain.gain.value = this.volumes.guide;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async loadFile(file) {
    const ctx = this.ensureCtx();
    const ab = await file.arrayBuffer();
    this.stop();
    this.originalBuffer = await ctx.decodeAudioData(ab);
    this.minusBuffer = null;
    this.guideBuffer = null;
    this.activeKey = 'main';
    this.mainBuffer = this.originalBuffer;
    return { duration: this.originalBuffer.duration };
  }

  setBuffers({ main, guide = null }) {
    this.stop();
    this.originalBuffer = main;
    this.mainBuffer = main;
    this.minusBuffer = null;
    this.guideBuffer = guide;
    this.activeKey = 'main';
  }

  // Минус-вокал: (L - R)/sqrt(2) — вокал, сведённый в центр, взаимно гасится.
  async makeMinusVocal() {
    if (!this.originalBuffer) return false;
    const src = this.originalBuffer;
    const ctx = new OfflineAudioContext(2, src.length, src.sampleRate);
    const player = ctx.createBufferSource();
    player.buffer = src;
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const gL = ctx.createGain();
    const gR = ctx.createGain();
    gL.gain.value = 0.7071;
    gR.gain.value = -0.7071;
    player.connect(splitter);
    splitter.connect(gL, 0);
    splitter.connect(gR, 1);
    gL.connect(merger, 0, 0);
    gL.connect(merger, 0, 1);
    gR.connect(merger, 1, 0);
    gR.connect(merger, 1, 1);
    player.start();
    this.minusBuffer = await ctx.startRendering();
    return true;
  }

  setVocalRemove(v) {
    if (!this.minusBuffer) return;
    const wasPlaying = this.playing;
    const t = this.time;
    this.activeKey = v ? 'minus' : 'main';
    this.mainBuffer = v ? this.minusBuffer : this.originalBuffer;
    if (wasPlaying) this.play(t);
  }

  play(offset = this.offset) {
    const ctx = this.ensureCtx();
    this.stopSources();
    const main = this.mainBuffer;
    if (!main) return;
    const s1 = ctx.createBufferSource();
    s1.buffer = main;
    s1.connect(this.musicGain);
    const sources = [s1];
    if (this.guideBuffer) {
      const s2 = ctx.createBufferSource();
      s2.buffer = this.guideBuffer;
      s2.connect(this.guideGain);
      sources.push(s2);
    }
    const token = ++this.token;
    s1.onended = () => {
      if (token === this.token && this.playing) {
        this.playing = false;
        this.offset = 0;
        this.onended?.();
      }
    };
    const off = Math.max(0, Math.min(offset, main.duration - 0.01));
    for (const s of sources) this.applyTranspose(s);
    s1.start(0, off);
    for (const s of sources.slice(1)) s.start(0, off);
    this.sources = sources;
    this.startedAt = ctx.currentTime;
    this.offset = off;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.time;
    this.stopSources();
    this.playing = false;
  }

  stop() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
  }

  seek(t) {
    if (this.playing) this.play(t);
    else this.offset = Math.max(0, t);
  }

  stopSources() {
    this.token++;
    for (const s of this.sources) {
      try { s.stop(); s.disconnect(); } catch { /* уже остановлен */ }
    }
    this.sources = [];
  }

  setTranspose(semis) {
    this.transpose = semis || 0;
    for (const s of this.sources) this.applyTranspose(s);
  }

  applyTranspose(source) {
    const sh = this.transpose || 0;
    if (!sh) {
      if (source.detune) source.detune.value = 0;
      return;
    }
    // detune сохраняет темп; playbackRate — запасной путь (меняет и темп)
    if (source.detune) source.detune.value = sh * 100;
    else source.playbackRate.value = 2 ** (sh / 12);
  }

  setMusicVolume(v) { this.volumes.music = v; if (this.musicGain) this.musicGain.gain.value = v; }
  setGuideVolume(v) { this.volumes.guide = v; if (this.guideGain) this.guideGain.gain.value = v; }

  get time() {
    if (!this.ctx) return this.offset;
    if (!this.playing) return this.offset;
    const dur = this.duration;
    return Math.min(dur, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  get duration() {
    return this.mainBuffer?.duration ?? this.guideBuffer?.duration ?? 0;
  }
}
