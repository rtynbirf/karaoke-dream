import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorridor, updateCorridor, corridorTol, corridorLabel } from '../src/js/scoring/corridor.js';

test('просадки опускают коридор к певцу до предела', () => {
  const c = createCorridor();
  for (let i = 0; i < 5; i++) updateCorridor(c, 40);
  assert.equal(c.shift, -3, 'maxShift = -3');
  const ev = c.events.at(-1);
  assert.equal(ev.type, 'down');
  assert.ok(ev.avg < 55);
});

test('уверенное пение возвращает к оригиналу', () => {
  const c = createCorridor();
  for (let i = 0; i < 3; i++) updateCorridor(c, 40);
  assert.equal(c.shift, -3);
  updateCorridor(c, 90);
  updateCorridor(c, 90);
  const ev = updateCorridor(c, 90); // окно из трёх высоких оценок
  assert.equal(ev.type, 'up');
  assert.equal(c.shift, -2);
});

test('допуск оценки растёт с глубиной коридора', () => {
  const c = createCorridor();
  assert.equal(corridorTol(c), 1);
  c.shift = -2;
  assert.equal(corridorTol(c), 1.44);
});

test('метка коридора читаема', () => {
  const c = createCorridor();
  assert.equal(corridorLabel(c), 'оригинал');
  c.shift = -2;
  assert.equal(corridorLabel(c), '-2 пт');
  c.shift = 1;
  assert.equal(corridorLabel(c), '+1 пт');
});
