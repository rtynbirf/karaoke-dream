import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLRC, toLRC, formatTimeTag, parseTimeTag } from '../src/js/lyrics/lrc.js';

test('парсит Enhanced LRC с пословными таймингами', () => {
  const src = [
    '[ti:Тест]',
    '[00:10.00]<00:10.00>Неон <00:10.40>горит <00:11.00>ярко',
    '[00:14.00]Вторая строка без тегов',
  ].join('\n');
  const { meta, lines } = parseLRC(src);
  assert.equal(meta.ti, 'Тест');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].time, 10);
  assert.equal(lines[0].words.length, 3);
  assert.equal(lines[0].words[1].text, 'горит');
  assert.ok(Math.abs(lines[0].words[1].time - 10.4) < 0.01);
});

test('распределяет слова в строках без пословных тегов', () => {
  const { lines } = parseLRC('[00:05.00]раз два три четыре\n[00:09.00]дальше');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].words.length, 4);
  const times = lines[0].words.map((w) => w.time);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
  assert.ok(times[0] >= 5 && times.at(-1) < 9);
});

test('поддерживает несколько тайм-тегов на строку', () => {
  const { lines } = parseLRC('[00:10.00][00:20.00]припев');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].time, 10);
  assert.equal(lines[1].time, 20);
});

test('формат и разбор тайм-тегов согласованы', () => {
  assert.equal(formatTimeTag(9.999), '[00:10.00]');
  assert.equal(formatTimeTag(65.4, true), '<01:05.40>');
  assert.ok(Math.abs(parseTimeTag('01:05.40') - 65.4) < 0.001);
});

test('toLRC → parseLRC: кругосветка без потерь', () => {
  const song = {
    meta: { ti: 'Круг', ar: 'Тест' },
    lines: [
      { time: 12, words: [{ text: 'первое', time: 12 }, { text: 'второе', time: 12.5 }] },
      { time: 17.3, words: [{ text: 'финал', time: 17.3 }] },
    ],
  };
  const lrc = toLRC(song);
  const back = parseLRC(lrc);
  assert.equal(back.meta.ti, 'Круг');
  assert.equal(back.lines.length, 2);
  assert.ok(Math.abs(back.lines[0].time - 12) < 0.011);
  assert.equal(back.lines[0].words.length, 2);
  assert.ok(Math.abs(back.lines[0].words[1].time - 12.5) < 0.011);
});

test('парсер выживает на мусорном вводе', () => {
  const { lines } = parseLRC('мусор\n\n[нет]\n[00:01.00]ок');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'ок');
});
