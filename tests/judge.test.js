import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, scoreWord, scoreLine } from '../src/js/scoring/judge.js';

// синтез кадров: певец «держит» ноту midi в окне [t0, t1] с шагом step
function framesFor(t0, t1, midi, { step = 0.08, cents = 0, startDelay = 0 } = {}) {
  const out = [];
  for (let t = t0 + startDelay; t <= t1 + 0.1; t += step) {
    out.push({ t, midi: midi + cents / 100, voiced: true, rms: 0.05 });
  }
  return out;
}

const WORD = { text: 'тест', start: 10, end: 10.6, midi: 69 };
const LINE = {
  time: 10,
  text: 'один два',
  words: [
    { text: 'один', start: 10, end: 10.5, midi: 69 },
    { text: 'два', start: 10.5, end: 11.0, midi: 72 },
  ],
};

test('идеальное пение даёт максимум', () => {
  const frames = [...framesFor(10, 10.5, 69), ...framesFor(10.5, 11.0, 72)];
  const res = scoreLine(frames, LINE, MODES.friendly, 0);
  assert.equal(res.hasRef, true);
  assert.ok(res.accuracy >= 0.99, `accuracy=${res.accuracy}`);
  assert.ok(res.stability >= 0.99, `stability=${res.stability}`);
  assert.equal(res.rhythm, 1);
  assert.ok(res.total >= 97, `total=${res.total}`);
});

test('постоянное отклонение бьёт по точности, но не по стабильности', () => {
  const frames = framesFor(10, 10.5, 69, { cents: 40 });
  const w = scoreWord(frames, WORD, MODES.friendly, 0);
  assert.ok(w.accuracy > 0.3 && w.accuracy < 0.75, `accuracy=${w.accuracy}`);
  assert.ok(w.stability >= 0.99, `stability=${w.stability}`);
});

test('опоздание входа бьёт по ритму', () => {
  const frames = framesFor(10, 10.5, 69, { startDelay: 0.4 });
  const w = scoreWord(frames, WORD, MODES.friendly, 0);
  assert.ok(w.rhythm < 0.7, `rhythm=${w.rhythm}`);
});

test('коридорное смещение учитывается в сравнении', () => {
  const frames = framesFor(10, 10.5, 68, { cents: 0 }); // на тон ниже эталона
  const strict = scoreWord(frames, WORD, MODES.jury, 0);
  const shifted = scoreWord(frames, WORD, MODES.jury, -1); // среда сдвинулась к певцу
  assert.ok(strict.accuracy < shifted.accuracy, `${strict.accuracy} !< ${shifted.accuracy}`);
});

test('свой трек без эталона: ритм + стабильность', () => {
  const line = { time: 10, text: 'один два', words: [
    { text: 'один', start: 10, end: 10.5 },
    { text: 'два', start: 10.5, end: 11.0 },
  ] };
  const frames = [...framesFor(10, 10.5, 69), ...framesFor(10.5, 11.0, 71)];
  const res = scoreLine(frames, line, MODES.jury, 0);
  assert.equal(res.hasRef, false);
  assert.equal(res.accuracy, null);
  assert.ok(res.total >= 90, `total=${res.total}`);
});

test('молчание в строке обнуляет оценку', () => {
  const res = scoreLine([], LINE, MODES.friendly, 0);
  assert.equal(res.total, 0);
});
