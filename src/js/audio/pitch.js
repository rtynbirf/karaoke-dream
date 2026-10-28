// Pitch-детектор YIN (de Cheveigné & Kawahara, 2002) — чистый DSP без библиотек.
// Подача: Float32-буфер из AnalyserNode, выдача: частота f0 + медианный сглаживатель.

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiFromFreq(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function freqFromMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteName(midi) {
  const r = Math.round(midi);
  return `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

export function rmsOf(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function detectPitchYIN(buf, sampleRate, opts = {}) {
  const { threshold = 0.12, minFreq = 70, maxFreq = 1100 } = opts;
  const W = buf.length;
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), W - 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (tauMax - tauMin < 4) return null;

  // 1) функция разности d(tau); окно фиксировано для сопоставимости тау
  const d = new Float64Array(tauMax + 1);
  const L = W - tauMax;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < L; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 2) кумулятивная нормировка (CMND)
  let run = 0;
  const cm = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? (d[tau] * (tau - tauMin + 1)) / run : 1;
  }

  // 3) первый минимум ниже порога + спуск в локальный минимум
  let tau = -1;
  for (let t = tauMin + 1; t <= tauMax; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // 4) параболическая интерполяция по d
  let better = tau;
  if (tau > tauMin && tau < tauMax) {
    const s0 = d[tau - 1]; const s1 = d[tau]; const s2 = d[tau + 1];
    const den = s0 - 2 * s1 + s2;
    if (Math.abs(den) > 1e-9) better = tau + (0.5 * (s0 - s2)) / den;
  }

  const freq = sampleRate / better;
  if (freq < minFreq || freq > maxFreq) return null;
  return freq;
}

export class PitchTracker {
  constructor({ sampleRate, fftSize = 2048, threshold = 0.12, minFreq = 70, maxFreq = 1100, minRms = 0.006, history = 5 } = {}) {
    this.sampleRate = sampleRate;
    this.threshold = threshold;
    this.minFreq = minFreq;
    this.maxFreq = maxFreq;
    this.minRms = minRms;
    this.hist = [];
    this.history = history;
  }

  feed(buf) {
    const rms = rmsOf(buf);
    let freq = null;
    if (rms > this.minRms) {
      freq = detectPitchYIN(buf, this.sampleRate, {
        threshold: this.threshold, minFreq: this.minFreq, maxFreq: this.maxFreq,
      });
    }
    this.hist.push({ freq, voiced: freq != null, rms });
    if (this.hist.length > this.history) this.hist.shift();

    const voicedFreqs = this.hist.filter((h) => h.voiced && h.freq).map((h) => h.freq);
    let midi = null;
    if (voicedFreqs.length) {
      voicedFreqs.sort((a, b) => a - b);
      midi = midiFromFreq(voicedFreqs[Math.floor(voicedFreqs.length / 2)]);
    }
    return { midi, voiced: midi != null, rms, freq };
  }
}
