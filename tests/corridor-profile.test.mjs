// Тесты «Профиль певца + гистерезис коридора» (критерии приёмки karaoke-dream#3).
// Запуск: node --test tests/corridor-profile.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, createProfile, exportProfile, importProfile, loadProfile,
         logSession, memoryDriver, midiToHz, narrowCorridor, saveProfile }
  from '../src/singer-profile.mjs';
import { CorridorController } from '../src/corridor-hysteresis.mjs';

// Синтетический свип 110–330 Гц, 60 с, 100 отсчётов/с (критерий 1).
const SWEEP = Array.from({ length: 6000 }, (_, i) => 110 + (330 - 110) * (i / 5999));

test('калибровка 60 с: comfortLow/High расходится с эталоном не более чем на 3 Гц', () => {
  const refMidi = (arr, p) => {
    const s = [...arr].map((h) => 69 + 12 * Math.log2(h / 440)).sort((a, b) => a - b);
    const i = (s.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const c = calibrate(SWEEP);
  assert.ok(Math.abs(c.comfortLowHz - midiToHz(refMidi(SWEEP, 0.10))) <= 3, JSON.stringify(c));
  assert.ok(Math.abs(c.comfortHighHz - midiToHz(refMidi(SWEEP, 0.90))) <= 3, JSON.stringify(c));
});

test('профиль восстановим после перезагрузки вкладки: экспорт/импорт идентичны', async () => {
  const p = createProfile();
  Object.assign(p, calibrate(SWEEP));
  logSession(p, { kind: 'calibration', notes: SWEEP.length, ok: true });
  const drv = memoryDriver(); // в браузере тот же контракт исполняет indexedDbDriver
  await saveProfile(drv, p);
  const restored = await loadProfile(drv);
  assert.equal(exportProfile(restored), exportProfile(p));
  const imported = importProfile(exportProfile(restored));
  assert.deepEqual(imported, p);
});

test('качелей нет: медиана у границы коридора с флуктуацией ±0.4 пт — не более 1 смены за 30 с', () => {
  const c = new CorridorController({ comfortLowHz: 200, comfortHighHz: 400, corridorWidth: 1 });
  let jumps = 0, prev = 0;
  for (let t = 0; t <= 30000; t += 100) {
    // медианная ошибки колеблется 0.1…0.9 полутона вокруг порога выхода (0.5)
    const err = 0.5 + 0.4 * Math.sin((2 * Math.PI * t) / 4000);
    const s = c.feed(err, t);
    if (Math.round(s) !== Math.round(prev)) jumps += 1;
    prev = s;
  }
  assert.ok(jumps <= 1, 'качели: ' + jumps + ' смен тональности за 30 с');
});

test('явный уход на 1.5 полутона — сдвиг происходит не позже 3.5 с', () => {
  const c = new CorridorController({ comfortLowHz: 200, comfortHighHz: 400, corridorWidth: 1 });
  let at = null;
  for (let t = 0; t <= 10000 && at === null; t += 100) {
    if (Math.round(c.feed(1.5, t)) !== 0) at = t;
  }
  assert.ok(at !== null && at <= 3500, 'сдвиг случился через ' + at + ' мс');
});

test('режим урока: 3 успешные сессии — ширина коридора уже ровно на 15%', () => {
  const p = createProfile();
  for (let i = 0; i < 3; i++) {
    logSession(p, { kind: 'lesson', inCorridorPct: 92, ok: true });
    narrowCorridor(p, true);
  }
  assert.equal(p.corridorWidth, 0.85);
  const dump = exportProfile(p); // журнал сессий в профиле ведётся append-only
  assert.equal(dump.match(/"kind": "lesson"/g).length, 3);
});

test('экспортированный профиль даёт идентичное поведение коридора на чистой вкладке', () => {
  const p = createProfile();
  Object.assign(p, calibrate(SWEEP));
  const a = new CorridorController(p);
  const b = new CorridorController(importProfile(exportProfile(p)));
  const trace = (c) => Array.from({ length: 60 }, (_, i) => Math.round(c.feed(i < 40 ? 1.5 : 0.2, i * 500)));
  assert.deepEqual(trace(a), trace(b));
});
