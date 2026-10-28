import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO, demoTimeline, buildDemoLRC, demoDuration, chordInfo } from '../src/js/songs/demo.js';
import { parseLRC } from '../src/js/lyrics/lrc.js';

test('таймлайн демо: 8 строк, длительность ~95 секунд', () => {
  const tl = demoTimeline();
  assert.equal(tl.lines.length, 8);
  assert.ok(tl.duration > 90 && tl.duration < 100, `duration=${tl.duration}`);
  assert.equal(tl.chords.length, 38); // 4 вступление + 8*4 + 2 хвост
});

test('слова внутри строки монотонны и не вылезают за такт', () => {
  const tl = demoTimeline();
  for (const l of tl.lines) {
    assert.ok(l.words.length >= 4, `слов мало в «${l.text}»`);
    for (const w of l.words) {
      assert.ok(w.start >= l.start && w.end <= l.start + 4 * tl.bar, `слово «${w.text}» вне такта`);
      assert.ok(Number.isInteger(w.midi) && w.midi > 50 && w.midi < 80, `нота ${w.midi} вне диапазона`);
    }
    for (let k = 1; k < l.words.length; k++) {
      assert.ok(l.words[k].start >= l.words[k - 1].start, 'нарушен порядок слов');
    }
  }
});

test('LRC демо собирается и разбирается согласованно', () => {
  const lrc = buildDemoLRC();
  const { lines } = parseLRC(lrc);
  assert.equal(lines.length, 8);
  const tl = demoTimeline();
  assert.ok(Math.abs(lines[0].time - tl.lines[0].start) < 0.011);
  assert.equal(lines[0].words.length, tl.lines[0].words.length);
  for (let i = 0; i < lines[0].words.length; i++) {
    assert.ok(Math.abs(lines[0].words[i].time - tl.lines[0].words[i].start) < 0.011);
  }
});

test('первая строка начинается после вступления (10 с при 96 BPM)', () => {
  const tl = demoTimeline();
  assert.equal(DEMO.introBars * tl.bar, 10);
  assert.equal(tl.lines[0].start, 10);
  assert.ok(demoDuration() >= tl.duration - 0.01);
});

test('аккорды распознаются', () => {
  assert.deepEqual(chordInfo('Am').intervals, [0, 3, 7]);
  assert.deepEqual(chordInfo('F').intervals, [0, 4, 7]);
  assert.equal(chordInfo('Am').rootMidi, 57);
  assert.equal(chordInfo('F').rootMidi, 53);
});
