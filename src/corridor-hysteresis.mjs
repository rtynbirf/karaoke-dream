// Волна ×3 · W3-E · Коридор как профиль: гистерезис тональности (предложение karaoke-dream#3).
// «Качели» исключены конструкцией, а не настройкой: сдвиг меняется только когда медиана
// ошибки пения вышла из комфортной зоны на ≥0.5 полутона и держится ≥3 с; шаг — 1 полутон,
// границы ±4 полутона; возврат — экспоненциальным сглаживанием 0.5/сек.
export const CORRIDOR = {
  exitSemitones: 0.5,  // порог выхода медианной ошибки из зоны
  holdMs: 3000,        // сколько должен держаться выход, прежде чем сдвинуть тональность
  stepSemitones: 1,    // шаг сдвига
  limitSemitones: 4,   // границы сдвига (мировая практика)
  returnPerSec: 0.5    // скорость экспоненциального возврата
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class CorridorController {
  constructor(profile, opts = {}) {
    this.profile = profile;
    this.exitSemitones = opts.exitSemitones ?? CORRIDOR.exitSemitones;
    this.holdMs = opts.holdMs ?? CORRIDOR.holdMs;
    this.stepSemitones = opts.stepSemitones ?? CORRIDOR.stepSemitones;
    this.limitSemitones = opts.limitSemitones ?? CORRIDOR.limitSemitones;
    this.returnPerSec = opts.returnPerSec ?? CORRIDOR.returnPerSec;
    this.shift = 0;   // текущий сдвиг тональности, полутона
    this.jumps = 0;   // счётчик смен тональности (для теста «качелей»)
    this._window = []; // след медианной ошибки за окно holdMs: [{v, t}]
    this._lastT = null;
  }

  // Рабочий коридор в Гц: комфортная зона × ширина (режим урока) × сдвиг 2^(n/12).
  bounds() {
    const p = this.profile;
    const factor = Math.pow(2, this.shift / 12);
    const width = p.corridorWidth ?? 1;
    return {
      lowHz: p.comfortLowHz * width * factor,
      highHz: p.comfortHighHz * width * factor,
      shiftSemitones: this.shift,
      width
    };
  }

  // medianErr — медианная ошибка пения относительно центра коридора, полутона.
  // nowMs — монотонное время, мс. Возвращает текущий сдвиг тональности.
  feed(medianErr, nowMs) {
    if (Math.abs(medianErr) <= this.exitSemitones) {
      this._window = []; // вернулся в зону — накопленный выход сбрасывается (анти-дребезг)
      this._return(nowMs);
      return this.shift;
    }
    this._window.push({ v: medianErr, t: nowMs });
    this._window = this._window.filter((e) => nowMs - e.t <= this.holdMs);
    const held = this._window.length > 0 && (nowMs - this._window[0].t) >= this.holdMs;
    if (held) {
      // голос выше коридора (err > 0) → тональность вниз; ниже — вверх.
      const dir = Math.sign(medianErr);
      this.shift = clamp(this.shift - dir * this.stepSemitones, -this.limitSemitones, this.limitSemitones);
      this.jumps += 1;
      this._window = [];
      this._lastT = nowMs;
    }
    return this.shift;
  }

  // Возврат к нулевому сдвигу экспоненциальным сглаживанием 0.5/сек.
  _return(nowMs) {
    if (this.shift === 0 || this._lastT === null) { this._lastT = nowMs; return; }
    const dt = Math.max(0, (nowMs - this._lastT) / 1000);
    this._lastT = nowMs;
    const next = this.shift * Math.exp(-this.returnPerSec * dt);
    this.shift = Math.abs(next) < 0.01 ? 0 : next;
  }
}
